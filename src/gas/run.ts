/**
 * Runs copied Code.gs code (src/gas/scope.generated.ts) in the read-only runtime, loading exactly the Sheets data it
 * asks for: the first run uses the usual sheets; whenever the code opens a sheet or calls Sheets.batchGet for data not
 * loaded yet, that need is recorded (even if Code.gs catches the error and falls back), the FIRST need is loaded, and
 * the code runs again on a fresh copy. Safe because the copied code only reads. Bounded, so it can never loop.
 */
import type { AppContext } from '../app/context';
import type { WorkbookKey } from '../data/types';
import { makeGasScope } from './scope.generated';
import { makeRuntime, SnapWorkbook, NeedData, valuesKey, type NeedRequest, type RuntimeDeps } from './runtime';

export const MAX_LOADS = 30;
/** Copied Code.gs functions that give the ID of another spreadsheet a reader opens (Script Property or Code.gs default).
 *  Only these IDs can be opened — read-only, on demand. */
export const EXTRA_BOOK_ID_FNS = ['scSpreadsheetId_', 'zhSheetId_'];

export interface GasRunOptions {
  preload: Record<WorkbookKey, string[]>;
  deps: Omit<RuntimeDeps, 'main' | 'attendance' | 'values' | 'bookIds' | 'need' | 'extra' | 'extraIds'>;
}

export async function runGas<T>(ctx: AppContext, opts: GasRunOptions, fn: (S: any) => T | Promise<T>): Promise<T> {
  const loaded: Record<string, Set<string>> = { main: new Set(opts.preload.main), attendance: new Set(opts.preload.attendance) };
  const opened = new Set<string>();   // extra spreadsheet IDs the copied code opened (Special Classes, Zoho sync log)
  const blocked = new Set<string>(); let idsDone = false;
  const extraIds: string[] = [];      // filled from the copied code's own ID functions (settings or Code.gs default)
  const values: Record<string, unknown> = {};
  const attOn = !!ctx.cfg.attendanceSpreadsheetId || ctx.cfg.dataMode === 'fixture';
  const bookIds: Record<string, WorkbookKey> = {};
  if (ctx.cfg.targetSpreadsheetId) bookIds[ctx.cfg.targetSpreadsheetId] = 'main';
  if (ctx.cfg.attendanceSpreadsheetId) bookIds[ctx.cfg.attendanceSpreadsheetId] = 'attendance';
  const sAtt = opts.deps.settings.ATTENDANCE_SPREADSHEET_ID, sMain = opts.deps.settings.TARGET_SPREADSHEET_ID; // ids as the copied code sees them
  if (sAtt) bookIds[sAtt] = 'attendance';
  if (sMain) bookIds[sMain] = 'main';
  const idOf = (b: WorkbookKey) => Object.keys(bookIds).find((k) => bookIds[k] === b) || b;
  for (let attempt = 0; attempt <= MAX_LOADS; attempt++) {
    const pending: NeedRequest[] = [];
    const need = (n: NeedRequest) => { pending.push(n); };
    const m = await ctx.data.readSheets('main', Array.from(loaded.main));
    let att: SnapWorkbook | null = null;
    if (attOn) {
      try { const a = await ctx.data.readSheets('attendance', Array.from(loaded.attendance)); att = new SnapWorkbook(idOf('attendance'), a.sheets, a.timeZone, a.titles, 'attendance', need); }
      catch (e) { console.warn('[Gas] attendance workbook not readable: ' + String((e as Error).message).slice(0, 120)); }
    }
    const extra: Record<string, SnapWorkbook> = {};
    for (const id of opened) {
      const key = ('id:' + id) as WorkbookKey;
      try { const x = await ctx.data.readSheets(key, Array.from(loaded[key] || [])); extra[id] = new SnapWorkbook(id, x.sheets, x.timeZone, x.titles, key, need); }
      catch (e) { // not shared with GOOGLE_IMPERSONATE_USER (or gone): Code.gs's own "cannot open" path answers
        console.warn('[Gas] extra spreadsheet not readable: ' + String((e as Error).message).slice(0, 120));
        opened.delete(id); extraIds.splice(extraIds.indexOf(id), 1); blocked.add(id);
      }
    }
    const S = makeGasScope(makeRuntime({ ...opts.deps, main: new SnapWorkbook(idOf('main'), m.sheets, m.timeZone, m.titles, 'main', need), attendance: att, values, bookIds, need, extra, extraIds }));
    if (!idsDone) { idsDone = true; for (const f of EXTRA_BOOK_ID_FNS) { const v = typeof S[f] === 'function' ? String(S[f]() || '').trim() : ''; if (v && !bookIds[v] && extraIds.indexOf(v) < 0 && !blocked.has(v)) extraIds.push(v); } }
    let result: T | undefined, error: unknown = null;
    try { result = await fn(S); } catch (e) { error = e; }
    if (!pending.length) { if (error) throw error; return result as T; }
    const n = pending[0];
    if (n.kind === 'book') {
      const id = n.book.slice(3);
      if (opened.has(id)) throw new Error('Azure runtime: spreadsheet requested again after opening.');
      opened.add(id);
    } else if (n.kind === 'sheet') {
      loaded[n.book] = loaded[n.book] || new Set();
      if (loaded[n.book].has(n.sheet)) throw new Error('Azure runtime: sheet "' + n.sheet + '" requested again after loading.');
      loaded[n.book].add(n.sheet);
    } else {
      values[n.book + ':' + valuesKey(n.req)] = await ctx.data.readValues(n.book, n.req);
    }
    void NeedData;
  }
  throw new Error('Azure runtime: too many sheet loads for one request (' + MAX_LOADS + ').');
}

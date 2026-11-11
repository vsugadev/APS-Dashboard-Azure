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

export interface GasRunOptions {
  preload: Record<WorkbookKey, string[]>;
  deps: Omit<RuntimeDeps, 'main' | 'attendance' | 'values' | 'bookIds' | 'need'>;
}

export async function runGas<T>(ctx: AppContext, opts: GasRunOptions, fn: (S: any) => T | Promise<T>): Promise<T> {
  const loaded: Record<WorkbookKey, Set<string>> = { main: new Set(opts.preload.main), attendance: new Set(opts.preload.attendance) };
  const values: Record<string, unknown> = {};
  const attOn = !!ctx.cfg.attendanceSpreadsheetId || ctx.cfg.dataMode === 'fixture';
  const bookIds: Record<string, WorkbookKey> = {};
  if (ctx.cfg.targetSpreadsheetId) bookIds[ctx.cfg.targetSpreadsheetId] = 'main';
  if (ctx.cfg.attendanceSpreadsheetId) bookIds[ctx.cfg.attendanceSpreadsheetId] = 'attendance';
  const sAtt = opts.deps.settings.ATTENDANCE_SPREADSHEET_ID, sMain = opts.deps.settings.TARGET_SPREADSHEET_ID; // ids as the copied code sees them
  if (sAtt) bookIds[sAtt] = 'attendance';
  if (sMain) bookIds[sMain] = 'main';
  for (let attempt = 0; attempt <= MAX_LOADS; attempt++) {
    const pending: NeedRequest[] = [];
    const need = (n: NeedRequest) => { pending.push(n); };
    const m = await ctx.data.readSheets('main', Array.from(loaded.main));
    let att: SnapWorkbook | null = null;
    if (attOn) {
      try { const a = await ctx.data.readSheets('attendance', Array.from(loaded.attendance)); att = new SnapWorkbook('attendance', a.sheets, a.timeZone, a.titles, 'attendance', need); }
      catch (e) { console.warn('[Gas] attendance workbook not readable: ' + String((e as Error).message).slice(0, 120)); }
    }
    const S = makeGasScope(makeRuntime({ ...opts.deps, main: new SnapWorkbook('main', m.sheets, m.timeZone, m.titles, 'main', need), attendance: att, values, bookIds, need }));
    let result: T | undefined, error: unknown = null;
    try { result = await fn(S); } catch (e) { error = e; }
    if (!pending.length) { if (error) throw error; return result as T; }
    const n = pending[0];
    if (n.kind === 'sheet') {
      if (loaded[n.book].has(n.sheet)) throw new Error('Azure runtime: sheet "' + n.sheet + '" requested again after loading.');
      loaded[n.book].add(n.sheet);
    } else {
      values[n.book + ':' + valuesKey(n.req)] = await ctx.data.readValues(n.book, n.req);
    }
    void NeedData;
  }
  throw new Error('Azure runtime: too many sheet loads for one request (' + MAX_LOADS + ').');
}

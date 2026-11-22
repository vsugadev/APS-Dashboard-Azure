/**
 * Runs copied Code.gs code (src/gas/scope.generated.ts) in the read-only runtime, loading exactly the Sheets data it
 * asks for: the first run uses the usual sheets; whenever the code opens a sheet or calls Sheets.batchGet for data not
 * loaded yet, that need is recorded (even if Code.gs catches the error and falls back), the FIRST need is loaded, and
 * the code runs again on a fresh copy. Safe because the copied code only reads. Bounded, so it can never loop.
 */
import type { AppContext } from '../app/context';
import type { WorkbookKey, ValuesRequest } from '../data/types';
import { makeGasScope } from './scope.generated';
import { makeRuntime, SnapWorkbook, NeedData, valuesKey, type NeedRequest, type RuntimeDeps } from './runtime';

export const MAX_LOADS = 30;
/** Copied Code.gs functions that give the ID of another spreadsheet a reader opens (Script Property or Code.gs default).
 *  Only these IDs can be opened — read-only, on demand. */
export const EXTRA_BOOK_ID_FNS = ['scSpreadsheetId_', 'zhSheetId_'];
/** v0.23.6: other spreadsheets the copied screens open by a Script Property ID (Exam Question Paper — LIVE / TEST app setting —,
 *  Tamil Thadam, quiz material, daily summary). Read-only snapshots, like the two above; any other ID is still refused. */
export const EXTRA_BOOK_ID_PROPS = ['LIVE_QUESTION_PAPER_SPREADSHEET_ID', 'TEST_QUESTION_PAPER_SPREADSHEET_ID', 'TAMIL_THADAM_SPREADSHEET_ID', 'EXAM_QUIZ_MATERIAL_SHEET_ID', 'DAILY_SUMMARY_SPREADSHEET_ID'];

export interface GasRunOptions {
  preload: Record<WorkbookKey, string[]>;
  /** v0.13.0: extra spreadsheet IDs opened WRITABLE (Special Classes owned by Azure SQL) — changes stay in memory and are
   *  handed to `capture` after the final run; nothing is ever written to Google. */
  writable?: string[];
  capture?: (extra: Record<string, SnapWorkbook>) => void;
  /** v0.24.0: the screen's name — what it needed last time is loaded up front (learned preload). */
  key?: string;
  deps: Omit<RuntimeDeps, 'main' | 'attendance' | 'values' | 'bookIds' | 'need' | 'extra' | 'extraIds'>;
}

/* ---- v0.24.0: learned preload — per screen, the sheets / spreadsheets / batchGet ranges its last runs needed ---- */
interface Learned { sheets: Record<string, string[]>; books: string[]; values: { book: WorkbookKey; req: ValuesRequest }[] }
const LEARNED = new Map<string, Learned>();
export const LEARN_MAX_SHEETS = 60, LEARN_MAX_VALUES = 6, LEARN_MAX_KEYS = 500;
export function learnedFor(key: string): Learned | undefined { return LEARNED.get(key); }
export function forgetLearned(): void { LEARNED.clear(); }
export const runStats = { runs: 0, attempts: 0 };

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
  const learned = opts.key ? LEARNED.get(opts.key) : undefined;
  if (learned) { // v0.24.0: everything this screen needed last time, loaded in the first pass
    for (const [b, names] of Object.entries(learned.sheets)) { loaded[b] = loaded[b] || new Set(); for (const n of names) loaded[b].add(n); }
    for (const id of learned.books) opened.add(id);
    await Promise.all(learned.values.map(async (v) => { try { values[v.book + ':' + valuesKey(v.req)] = await ctx.data.readValues(v.book, v.req); } catch { /* asked for again if needed */ } }));
  }
  const usedValues: { book: WorkbookKey; req: ValuesRequest }[] = [];
  runStats.runs++;
  for (let attempt = 0; attempt <= MAX_LOADS; attempt++) {
    runStats.attempts++;
    const pending: NeedRequest[] = [];
    const need = (n: NeedRequest) => { pending.push(n); };
    let att: SnapWorkbook | null = null;
    const extra: Record<string, SnapWorkbook> = {};
    // v0.24.0: the workbooks are read in parallel (were one after another)
    const [m] = await Promise.all([
      ctx.data.readSheets('main', Array.from(loaded.main)),
      attOn ? ctx.data.readSheets('attendance', Array.from(loaded.attendance)).then((a) => { att = new SnapWorkbook(idOf('attendance'), a.sheets, a.timeZone, a.titles, 'attendance', need); },
        (e) => { console.warn('[Gas] attendance workbook not readable: ' + String((e as Error).message).slice(0, 120)); }) : Promise.resolve(),
      ...Array.from(opened).map(async (id) => {
        const key = ('id:' + id) as WorkbookKey;
        try { const x = await ctx.data.readSheets(key, Array.from(loaded[key] || [])); extra[id] = new SnapWorkbook(id, x.sheets, x.timeZone, x.titles, key, need, !!opts.writable && opts.writable.includes(id)); }
        catch (e) { // not shared with GOOGLE_IMPERSONATE_USER (or gone): Code.gs's own "cannot open" path answers
          console.warn('[Gas] extra spreadsheet not readable: ' + String((e as Error).message).slice(0, 120));
          opened.delete(id); if (extraIds.indexOf(id) > -1) extraIds.splice(extraIds.indexOf(id), 1); blocked.add(id);
        }
      }),
    ]);
    const S = makeGasScope(makeRuntime({ ...opts.deps, main: new SnapWorkbook(idOf('main'), m.sheets, m.timeZone, m.titles, 'main', need), attendance: att, values, bookIds, need, extra, extraIds }));
    if (!idsDone) {
      idsDone = true;
      const add = (v: string) => { if (v && /^[A-Za-z0-9_-]{20,100}$/.test(v) && !bookIds[v] && extraIds.indexOf(v) < 0 && !blocked.has(v)) extraIds.push(v); };
      for (const f of EXTRA_BOOK_ID_FNS) add(typeof S[f] === 'function' ? String(S[f]() || '').trim() : '');
      const live = (opts.deps.liveProps && opts.deps.liveProps.script) || {};
      for (const k of EXTRA_BOOK_ID_PROPS) add(String(opts.deps.settings[k] || live[k] || '').trim());
    }
    let result: T | undefined, error: unknown = null;
    try { result = await fn(S); } catch (e) { error = e; }
    if (!pending.length) {
      if (opts.key) remember(opts.key, opts.preload, loaded, opened, usedValues, extraIds);
      if (error) throw error; if (opts.capture) opts.capture(extra); return result as T;
    }
    // v0.24.0: every need found in this run is loaded before the next run (was: only the first one)
    let progressed = false;
    const valueLoads: Promise<void>[] = [];
    for (const n of pending) {
      if (n.kind === 'book') {
        const id = n.book.slice(3);
        if (!opened.has(id)) { opened.add(id); progressed = true; }
      } else if (n.kind === 'sheet') {
        loaded[n.book] = loaded[n.book] || new Set();
        if (!loaded[n.book].has(n.sheet)) { loaded[n.book].add(n.sheet); progressed = true; }
      } else {
        const k = n.book + ':' + valuesKey(n.req);
        if (!(k in values)) { values[k] = null; progressed = true; usedValues.push({ book: n.book, req: n.req }); valueLoads.push(ctx.data.readValues(n.book, n.req).then((v) => { values[k] = v; })); }
      }
    }
    await Promise.all(valueLoads);
    if (!progressed) throw new Error('Azure runtime: data requested again after loading (' + JSON.stringify(pending[0]).slice(0, 120) + ').');
    void NeedData;
  }
  throw new Error('Azure runtime: too many sheet loads for one request (' + MAX_LOADS + ').');
}

function remember(key: string, preload: Record<string, string[]>, loaded: Record<string, Set<string>>, opened: Set<string>,
  usedValues: { book: WorkbookKey; req: ValuesRequest }[], extraIds: string[]): void {
  if (!LEARNED.has(key) && LEARNED.size >= LEARN_MAX_KEYS) return;
  const prev = LEARNED.get(key) || { sheets: {}, books: [], values: [] };
  const sheets: Record<string, string[]> = {};
  for (const [b, set] of Object.entries(loaded)) {
    const base = new Set((preload as any)[b] || []);
    const extraNames = Array.from(set).filter((n) => !base.has(n));
    const merged = Array.from(new Set((prev.sheets[b] || []).concat(extraNames))).slice(0, LEARN_MAX_SHEETS);
    if (merged.length) sheets[b] = merged;
  }
  const books = Array.from(new Set(prev.books.concat(Array.from(opened)))).filter((id) => extraIds.indexOf(id) > -1).slice(0, 10);
  const values = usedValues.slice(-LEARN_MAX_VALUES); // the last run's ranges only (they depend on the filters chosen)
  LEARNED.set(key, { sheets, books, values });
}


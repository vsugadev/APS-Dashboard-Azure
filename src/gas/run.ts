/**
 * Runs copied Code.gs code (src/gas/scope.generated.ts) in the read-only runtime, loading exactly the Sheets data it
 * asks for: the first run uses the usual sheets; whenever the code opens a sheet or calls Sheets.batchGet for data not
 * loaded yet, that need is recorded (even if Code.gs catches the error and falls back), the FIRST need is loaded, and
 * the code runs again on a fresh copy. Safe because the copied code only reads. Bounded, so it can never loop.
 */
import type { AppContext } from '../app/context';
import type { WorkbookKey, ValuesRequest } from '../data/types';
import { makeGasScope } from './scope.generated';
import { REQUEST } from '../app/requestContext';
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
export function forgetLearned(): void { LEARNED.clear(); ALLOWED_BOOKS.clear(); learnedChanges = 0; }
/** v0.24.1: extra spreadsheet IDs this process has worked out from settings / Code.gs (the only ones a remembered
 *  preload may open — a stored list can never add a spreadsheet). */
const ALLOWED_BOOKS = new Set<string>();
let learnedChanges = 0;
/** Bumped whenever what a screen needs changes (the store saves only then). */
export function learnedVersion(): number { return learnedChanges; }
/** All remembered screens (for saving in Azure SQL). */
export function learnedSnapshot(): Record<string, Learned> { const o: Record<string, Learned> = {}; for (const [k, v] of LEARNED) o[k] = v; return o; }
const BOOK_RE = /^(main|attendance|id:[A-Za-z0-9_-]{20,100})$/, ID_RE = /^[A-Za-z0-9_-]{20,100}$/;
const strs = (a: unknown, max: number, len = 200): string[] | null => (Array.isArray(a) && a.length <= max && a.every((x) => typeof x === 'string' && x.length <= len) ? a as string[] : null);
/** v0.24.1: restore remembered screens (saved by learnedStore.ts) — every entry checked; anything odd is skipped. Never
 *  replaces what this process has already learned. Returns how many screens were restored. */
export function loadLearned(raw: unknown): number {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 0;
  let n = 0;
  for (const [key, v] of Object.entries(raw as Record<string, any>)) {
    if (LEARNED.size >= LEARN_MAX_KEYS) break;
    if (key.length > 120 || LEARNED.has(key) || !v || typeof v !== 'object') continue;
    const sheets: Record<string, string[]> = {}; let ok = !!v.sheets && typeof v.sheets === 'object' && !Array.isArray(v.sheets);
    if (ok) for (const [b, names] of Object.entries(v.sheets)) { const x = strs(names, LEARN_MAX_SHEETS); if (!BOOK_RE.test(b) || !x) { ok = false; break; } sheets[b] = x; }
    const books = strs(v.books, 10, 100);
    const values = Array.isArray(v.values) && v.values.length <= LEARN_MAX_VALUES ? v.values : null;
    const valuesOk = !!values && values.every((x: any) => x && typeof x.book === 'string' && BOOK_RE.test(x.book) && x.req && strs(x.req.ranges, 50, 300)
      && ['valueRenderOption', 'dateTimeRenderOption', 'majorDimension'].every((k) => x.req[k] === undefined || (typeof x.req[k] === 'string' && x.req[k].length <= 40)));
    if (!ok || !books || !books.every((id) => ID_RE.test(id)) || !valuesOk) continue;
    LEARNED.set(key, { sheets, books, values: values.map((x: any) => ({ book: x.book, req: { ...x.req, ranges: x.req.ranges.slice() } })) });
    n++;
  }
  return n;
}
const bookAllowed = (b: string) => b === 'main' || b === 'attendance' || (b.startsWith('id:') && ALLOWED_BOOKS.has(b.slice(3)));
/** v0.24.1: every sheet the remembered screens of a workbook use (start-up warm-up). */
export function learnedSheets(book: 'main' | 'attendance', max = 120): string[] {
  const all = new Set<string>(); for (const l of LEARNED.values()) for (const n of l.sheets[book] || []) all.add(n);
  return Array.from(all).slice(0, max);
}
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
    for (const id of learned.books) if (ALLOWED_BOOKS.has(id)) opened.add(id); // v0.24.1: only spreadsheets known this run
    await Promise.all(learned.values.filter((v) => bookAllowed(String(v.book))).map(async (v) => { try { values[v.book + ':' + valuesKey(v.req)] = await ctx.data.readValues(v.book, v.req); } catch { /* asked for again if needed */ } }));
  }
  const usedValues: { book: WorkbookKey; req: ValuesRequest }[] = [];
  runStats.runs++;
  const rq = REQUEST.getStore(); // v0.24.2: time spent waiting for data, for the [Perf] slow line
  const timed = async <X>(p: Promise<X>): Promise<X> => { const t = Date.now(); try { return await p; } finally { if (rq) rq.dataMs += Date.now() - t; } };
  for (let attempt = 0; attempt <= MAX_LOADS; attempt++) {
    runStats.attempts++; if (rq) rq.runs++;
    const pending: NeedRequest[] = [];
    const need = (n: NeedRequest) => { pending.push(n); };
    let att: SnapWorkbook | null = null;
    const extra: Record<string, SnapWorkbook> = {};
    const openExtra = async (id: string) => {
      const key = ('id:' + id) as WorkbookKey;
      try { const x = await ctx.data.readSheets(key, Array.from(loaded[key] || [])); extra[id] = new SnapWorkbook(id, x.sheets, x.timeZone, x.titles, key, need, !!opts.writable && opts.writable.includes(id)); }
      catch (e) { // not shared with GOOGLE_IMPERSONATE_USER (or gone): Code.gs's own "cannot open" path answers
        console.warn('[Gas] extra spreadsheet not readable: ' + String((e as Error).message).slice(0, 120));
        opened.delete(id); if (extraIds.indexOf(id) > -1) extraIds.splice(extraIds.indexOf(id), 1); blocked.add(id);
      }
    };
    // v0.24.0: the workbooks are read in parallel (were one after another)
    const [m] = await timed(Promise.all([
      ctx.data.readSheets('main', Array.from(loaded.main)),
      attOn ? ctx.data.readSheets('attendance', Array.from(loaded.attendance)).then((a) => { att = new SnapWorkbook(idOf('attendance'), a.sheets, a.timeZone, a.titles, 'attendance', need); },
        (e) => { console.warn('[Gas] attendance workbook not readable: ' + String((e as Error).message).slice(0, 120)); }) : Promise.resolve(),
      ...Array.from(opened).map(openExtra),
    ]));
    const S = makeGasScope(makeRuntime({ ...opts.deps, main: new SnapWorkbook(idOf('main'), m.sheets, m.timeZone, m.titles, 'main', need), attendance: att, values, bookIds, need, extra, extraIds }));
    if (!idsDone) {
      idsDone = true;
      const add = (v: string) => { if (v && /^[A-Za-z0-9_-]{20,100}$/.test(v) && !bookIds[v] && extraIds.indexOf(v) < 0 && !blocked.has(v)) { extraIds.push(v); ALLOWED_BOOKS.add(v); } };
      for (const f of EXTRA_BOOK_ID_FNS) add(typeof S[f] === 'function' ? String(S[f]() || '').trim() : '');
      const live = (opts.deps.liveProps && opts.deps.liveProps.script) || {};
      for (const k of EXTRA_BOOK_ID_PROPS) add(String(opts.deps.settings[k] || live[k] || '').trim());
      // v0.24.1: a remembered spreadsheet is opened now that the settings have named it (first run after a restart)
      const late = learned ? learned.books.filter((id) => extraIds.indexOf(id) > -1 && !opened.has(id)) : [];
      if (late.length) { for (const id of late) opened.add(id); await timed(Promise.all(late.map(openExtra))); }
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
    await timed(Promise.all(valueLoads));
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
  const next = { sheets, books, values };
  if (JSON.stringify(prev) !== JSON.stringify(next)) learnedChanges++;
  LEARNED.set(key, next);
}


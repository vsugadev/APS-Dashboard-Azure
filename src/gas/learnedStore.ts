/**
 * v0.24.1 (performance) — what each screen needs survives restarts and deploys, and the data is warmed up at start.
 *
 *  - The learned preload (src/gas/run.ts) is saved in Azure SQL (dbo.app_state, one row 'learned_preload', a few KB) at
 *    most every 5 minutes and only when it changed; restored at start (every entry checked; a stored entry can never open
 *    a spreadsheet the settings do not name). Before: it started empty after every restart, so the first person to open
 *    each screen waited for 3–6 re-runs.
 *  - Warm-up, ~20 s after start, as BACKGROUND work (never ahead of a person): courses, roles, Access Control, the usual
 *    sheets and the sheets the remembered screens use are read once (from the Azure copy when DB_READS is on, otherwise from Google: one call per 20 sheets), so the first
 *    screens after a deploy do not each wait for them. Once per start only — no repeating reads (rule B0).
 * No new Azure resource; no new cost.
 */
import type * as sqlTypes from 'mssql';
import type { AppContext } from '../app/context';
import { inBackground } from '../google/apiGate';
import { learnedSnapshot, loadLearned, learnedVersion, learnedSheets } from './run';

export const LEARNED_ROW = 'learned_preload', LEARNED_MAX_BYTES = 400_000;

export interface AppStateStore { get(name: string): Promise<string | null>; put(name: string, value: string): Promise<void>; }
export class MemoryAppState implements AppStateStore {
  rows = new Map<string, string>();
  async get(n: string) { return this.rows.has(n) ? this.rows.get(n)! : null; }
  async put(n: string, v: string) { this.rows.set(n, v); }
}
export class MssqlAppState implements AppStateStore {
  private ready: Promise<void> | null = null;
  constructor(private pool: () => Promise<sqlTypes.ConnectionPool>, private sql: typeof sqlTypes = require('mssql')) {}
  private async table(p: sqlTypes.ConnectionPool): Promise<void> {
    if (!this.ready) {
      this.ready = p.request().query("IF OBJECT_ID(N'dbo.app_state', N'U') IS NULL CREATE TABLE dbo.app_state (name NVARCHAR(100) NOT NULL CONSTRAINT PK_app_state PRIMARY KEY, value NVARCHAR(MAX) NOT NULL, updated_at DATETIME2(3) NOT NULL);").then(() => undefined);
      this.ready.catch(() => { this.ready = null; });
    }
    await this.ready;
  }
  async get(name: string): Promise<string | null> {
    const p = await this.pool(); await this.table(p);
    const r = await p.request().input('n', this.sql.NVarChar(100), name).query('SELECT value FROM dbo.app_state WHERE name = @n;');
    const row = (r.recordset || [])[0]; return row ? String(row.value) : null;
  }
  async put(name: string, value: string): Promise<void> {
    const p = await this.pool(); await this.table(p);
    await p.request().input('n', this.sql.NVarChar(100), name).input('v', this.sql.NVarChar(this.sql.MAX), value).input('t', this.sql.DateTime2(3), new Date())
      .query('UPDATE dbo.app_state SET value = @v, updated_at = @t WHERE name = @n; IF @@ROWCOUNT = 0 INSERT INTO dbo.app_state (name, value, updated_at) VALUES (@n, @v, @t);');
  }
}

export class LearnedPersistence {
  private saved = -1;
  private timer: NodeJS.Timeout | null = null;
  constructor(private store: AppStateStore, private log: (m: string) => void = console.log) {}
  /** Restore at start. Never throws (a problem = start empty, as before). */
  async load(): Promise<number> {
    try {
      const raw = await this.store.get(LEARNED_ROW);
      const n = raw ? loadLearned(JSON.parse(raw)) : 0;
      this.saved = learnedVersion();
      this.log('[Perf] remembered screen data needs restored from Azure SQL: ' + n + ' screen(s).');
      return n;
    } catch (e) { this.log('[Perf] remembered screen data needs not restored (' + String((e as Error).message).slice(0, 80) + ') — screens learn again as they are opened.'); return 0; }
  }
  /** Save when changed since the last save. */
  async save(): Promise<boolean> {
    const v = learnedVersion();
    if (v === this.saved) return false;
    const json = JSON.stringify(learnedSnapshot());
    if (json.length > LEARNED_MAX_BYTES) { this.saved = v; return false; }
    try { await this.store.put(LEARNED_ROW, json); this.saved = v; return true; }
    catch (e) { this.log('[Perf] remembered screen data needs not saved (' + String((e as Error).message).slice(0, 80) + ') — tried again in 5 min.'); return false; }
  }
  start(everyMs = 300_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.save(); }, everyMs); this.timer.unref?.();
  }
}

/** Start-up warm-up (background): the sheets the remembered screens use, read once. Returns how many were read. */
export async function warmUp(ctx: AppContext, base: { main: string[]; attendance: string[] }, log: (m: string) => void = console.log, now: () => number = Date.now): Promise<number> {
  const t0 = now(); let n = 0;
  const books: ('main' | 'attendance')[] = ['main'];
  if (ctx.cfg.attendanceSpreadsheetId) books.push('attendance');
  await inBackground(async () => {
    const tasks: Promise<unknown>[] = [ctx.data.readCourses().catch(() => undefined), ctx.data.readConfiguredUserRoles().catch(() => undefined), ctx.data.readAccessOverrides().catch(() => undefined)];
    for (const b of books) tasks.push((async () => {
      const names = Array.from(new Set(base[b].concat(learnedSheets(b))));
      if (!names.length) return;
      try { await ctx.data.readSheets(b, names); n += names.length; }
      catch (e) { log('[Perf] warm-up of the ' + b + ' workbook skipped (' + String((e as Error).message).slice(0, 80) + ').'); }
    })());
    await Promise.all(tasks);
  });
  log('[Perf] warm-up: ' + n + ' sheet(s) (usual + remembered screens), courses, roles and Access Control read in ' + ((now() - t0) / 1000).toFixed(1) + ' s (background — never ahead of a person).');
  return n;
}

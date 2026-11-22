/**
 * Migration reconciliation (v0.21.0) — record-level proof that the Azure SQL copy = the Google Sheet (the source of
 * truth until cut-over), independent of the copy job's own read-back check.
 *
 * Per tab:  SOURCE_COUNT · TARGET_COUNT · MATCH · MISSING_IN_TARGET · EXTRA_IN_TARGET · DIFFERENT_VALUES ·
 *           DUPLICATES (same key twice in the source / in the target) · ERRORS
 *  - Rows are data rows (the header row is compared separately: a header difference counts as one DIFFERENT row).
 *  - MATCH / MISSING / EXTRA: every row compared whole (all cells, as stored), as multisets — order does not matter.
 *  - DIFFERENT_VALUES: rows whose KEY is in both but whose cells differ. KEY = the first column whose header looks like an
 *    identifier (…ID, …_Id, Email, Request_ID, Ticket_Number, Course_ID, Week_ID …) and is unique in the source; else none
 *    (then a changed row shows as 1 missing + 1 extra).
 *  - Two passes: a tab with differences is checked again after the next copy (an edit made between the copy and the check is
 *    not a migration error). Only differences that PERSIST are reported as such.
 *  - Results: Azure SQL dbo.reconcile_run (counts + up to 5 row NUMBERS per kind — never cell values) and one log line per
 *    book. Never logs names, e-mails or other cell contents.
 */
import { createHash } from 'crypto';
import type * as sqlTypes from 'mssql';
import type { DataSource, WorkbookKey } from '../data/types';
import type { SheetStore } from './sheetStore';

export interface TabRecon { book: string; tab: string; key: string; sourceCount: number; targetCount: number; match: number; missing: number; extra: number;
  different: number; dupSource: number; dupTarget: number; errors: number; samples: { missing: number[]; extra: number[]; different: number[] } }
export interface BookRecon { book: string; at: number; tabs: TabRecon[]; error: string; confirmed: boolean }

const cellText = (v: unknown): string => v instanceof Date ? '\u0001d' + v.toISOString() : v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
const rowHash = (r: unknown[]): string => { const c = (r || []).map(cellText); while (c.length && c[c.length - 1] === '') c.pop(); return createHash('sha1').update(JSON.stringify(c)).digest('base64'); };
const KEY_RE = /(^|_|\s)(id|email|e-mail|request_id|ticket_number|course_id|week_id|apsid|aps_id)$/i;

/** Index of the key column, or -1. */
export function keyColumn(header: unknown[], rows: unknown[][]): number {
  for (let i = 0; i < (header || []).length; i++) {
    if (!KEY_RE.test(String(header[i] || '').trim())) continue;
    const seen = new Set<string>(); let ok = true, filled = 0;
    for (const r of rows) { const k = cellText(r[i]).trim().toLowerCase(); if (!k) continue; filled++; if (seen.has(k)) { ok = false; break; } seen.add(k); }
    if (ok && filled >= Math.max(1, Math.floor(rows.length * 0.9))) return i;
  }
  return -1;
}

export function compareTab(book: string, tab: string, source: unknown[][], target: unknown[][] | null): TabRecon {
  const sH = source[0] || [], sRows = source.slice(1), tH = target ? target[0] || [] : [], tRows = target ? target.slice(1) : [];
  const out: TabRecon = { book, tab, key: '', sourceCount: sRows.length, targetCount: tRows.length, match: 0, missing: 0, extra: 0, different: 0, dupSource: 0, dupTarget: 0, errors: 0, samples: { missing: [], extra: [], different: [] } };
  if (!target) { out.errors = 1; out.missing = sRows.length; return out; }
  if (rowHash(sH) !== rowHash(tH)) out.different++;
  const tCount = new Map<string, number[]>();
  tRows.forEach((r, i) => { const h = rowHash(r); (tCount.get(h) || tCount.set(h, []).get(h)!).push(i); });
  const usedT = new Set<number>(), missingIdx: number[] = [];
  sRows.forEach((r, i) => { const l = tCount.get(rowHash(r)); if (l && l.length) { usedT.add(l.shift()!); out.match++; } else missingIdx.push(i); });
  const extraIdx = tRows.map((_r, i) => i).filter((i) => !usedT.has(i));
  const k = keyColumn(sH, sRows);
  if (k >= 0) {
    out.key = String(sH[k]);
    const keyOf = (r: unknown[]) => cellText(r[k]).trim().toLowerCase();
    const dup = (rows: unknown[][]) => { const s = new Map<string, number>(); rows.forEach((r) => { const x = keyOf(r); if (x) s.set(x, (s.get(x) || 0) + 1); }); let n = 0; s.forEach((c) => { if (c > 1) n += c - 1; }); return n; };
    out.dupSource = dup(sRows); out.dupTarget = dup(tRows);
    const extraByKey = new Map<string, number>(); extraIdx.forEach((i) => { const x = keyOf(tRows[i]); if (x) extraByKey.set(x, i); });
    const pairedT = new Set<number>(), stillMissing: number[] = [];
    for (const i of missingIdx) { const x = keyOf(sRows[i]); const j = x ? extraByKey.get(x) : undefined; if (j !== undefined && !pairedT.has(j)) { pairedT.add(j); out.different++; if (out.samples.different.length < 5) out.samples.different.push(i + 2); } else stillMissing.push(i); }
    missingIdx.length = 0; missingIdx.push(...stillMissing);
    for (let n = extraIdx.length - 1; n >= 0; n--) if (pairedT.has(extraIdx[n])) extraIdx.splice(n, 1);
  }
  out.missing = missingIdx.length; out.extra = extraIdx.length;
  out.samples.missing = missingIdx.slice(0, 5).map((i) => i + 2); out.samples.extra = extraIdx.slice(0, 5).map((i) => i + 2); // sheet row numbers (header = row 1)
  return out;
}

export const tabClean = (t: TabRecon) => t.missing === 0 && t.extra === 0 && t.different === 0 && t.errors === 0 && t.sourceCount === t.targetCount;

/** One pass: the stored copy is read FIRST, then the sheet (so an edit after the copy shows as a difference, never hides one). */
export async function reconcileBook(source: DataSource, store: SheetStore, book: string, tabs: string[], now: () => number = Date.now): Promise<BookRecon> {
  const res: BookRecon = { book, at: now(), tabs: [], error: '', confirmed: false };
  try {
    const stored = await store.get(book, tabs);
    const snap = await source.readSheets(book as WorkbookKey, tabs);
    for (const t of tabs) { const g = snap.sheets[t]; if (!g) continue; res.tabs.push(compareTab(book, t, g.values, stored[t] ? stored[t]!.values : null)); }
  } catch (e) { res.error = String((e as Error).message || e).slice(0, 200); }
  return res;
}

export interface ReconStore { save(r: BookRecon): Promise<void> }
export class MssqlReconStore implements ReconStore {
  private ready: Promise<void> | null = null;
  constructor(private pool: () => Promise<sqlTypes.ConnectionPool>, private sql: typeof sqlTypes = require('mssql')) {}
  async save(r: BookRecon): Promise<void> {
    const p = await this.pool(), S = this.sql;
    if (!this.ready) {
      this.ready = p.request().query("IF OBJECT_ID(N'dbo.reconcile_run', N'U') IS NULL BEGIN CREATE TABLE dbo.reconcile_run (id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_reconcile_run PRIMARY KEY, " +
        'run_at DATETIME2(3) NOT NULL, book NVARCHAR(40) NOT NULL, tab NVARCHAR(200) NOT NULL, key_column NVARCHAR(200) NOT NULL, source_count INT NOT NULL, target_count INT NOT NULL, match_count INT NOT NULL, ' +
        'missing_in_target INT NOT NULL, extra_in_target INT NOT NULL, different_values INT NOT NULL, duplicates_source INT NOT NULL, duplicates_target INT NOT NULL, errors INT NOT NULL, confirmed BIT NOT NULL, samples NVARCHAR(400) NOT NULL); ' +
        'CREATE INDEX IX_reconcile_run_at ON dbo.reconcile_run (run_at); END').then(() => undefined);
      this.ready.catch(() => { this.ready = null; });
    }
    await this.ready;
    for (const t of r.tabs) {
      await p.request().input('a', S.DateTime2(3), new Date(r.at)).input('b', S.NVarChar(40), r.book).input('t', S.NVarChar(200), t.tab).input('k', S.NVarChar(200), t.key)
        .input('sc', S.Int, t.sourceCount).input('tc', S.Int, t.targetCount).input('m', S.Int, t.match).input('mi', S.Int, t.missing).input('ex', S.Int, t.extra).input('d', S.Int, t.different)
        .input('ds', S.Int, t.dupSource).input('dt', S.Int, t.dupTarget).input('e', S.Int, t.errors).input('c', S.Bit, r.confirmed ? 1 : 0).input('s', S.NVarChar(400), JSON.stringify(t.samples).slice(0, 400))
        .query('INSERT INTO dbo.reconcile_run (run_at, book, tab, key_column, source_count, target_count, match_count, missing_in_target, extra_in_target, different_values, duplicates_source, duplicates_target, errors, confirmed, samples) ' +
          'VALUES (@a, @b, @t, @k, @sc, @tc, @m, @mi, @ex, @d, @ds, @dt, @e, @c, @s);');
    }
  }
}

export function summaryLine(r: BookRecon): string {
  if (r.error) return '[Reconcile] "' + r.book + '": check FAILED (' + r.error + ') — tried again at the next run.';
  const s = (f: (t: TabRecon) => number) => r.tabs.reduce((a, t) => a + f(t), 0);
  const bad = r.tabs.filter((t) => !tabClean(t));
  return '[Reconcile] "' + r.book + '" ' + (r.confirmed ? '(confirmed after a fresh copy) ' : '') + r.tabs.length + ' tabs: SOURCE ' + s((t) => t.sourceCount) + ' · TARGET ' + s((t) => t.targetCount) +
    ' · MATCH ' + s((t) => t.match) + ' · MISSING ' + s((t) => t.missing) + ' · EXTRA ' + s((t) => t.extra) + ' · DIFFERENT ' + s((t) => t.different) +
    ' · DUPLICATE KEYS src/target ' + s((t) => t.dupSource) + '/' + s((t) => t.dupTarget) + ' · ERRORS ' + s((t) => t.errors) +
    (bad.length ? ' — differs: ' + bad.slice(0, 8).map((t) => t.tab + ' (rows ' + [...t.samples.missing, ...t.samples.extra, ...t.samples.different].slice(0, 5).join(',') + ')').join('; ') : ' — IDENTICAL');
}

/**
 * Runs every `everyMs` per book: pass 1; tabs with differences are re-checked after `copyAgain()` (a fresh copy) — the
 * second pass is the reported result. Never throws.
 */
export class Reconciler {
  private timer: NodeJS.Timeout | null = null;
  last: Record<string, BookRecon> = {};
  constructor(private source: DataSource, private store: SheetStore, private books: { book: string; tabs: () => string[]; copyAgain: () => Promise<unknown> }[],
    private save: ReconStore | null, private log: (m: string) => void = console.log, private now: () => number = Date.now) {}

  async runOnce(): Promise<BookRecon[]> {
    const out: BookRecon[] = [];
    for (const b of this.books) {
      const tabs = b.tabs();
      if (!tabs.length) continue;
      let r = await reconcileBook(this.source, this.store, b.book, tabs, this.now);
      const bad = r.tabs.filter((t) => !tabClean(t)).map((t) => t.tab);
      if (!r.error && bad.length) {
        await b.copyAgain().catch(() => undefined);
        const again = await reconcileBook(this.source, this.store, b.book, bad, this.now);
        if (!again.error) { const m = new Map(again.tabs.map((t) => [t.tab, t])); r = { ...r, tabs: r.tabs.map((t) => m.get(t.tab) || t), confirmed: true }; }
      }
      this.last[b.book] = r; out.push(r);
      this.log(summaryLine(r));
      if (this.save && !r.error) await this.save.save(r).catch((e) => this.log('[Reconcile] result not stored in Azure SQL: ' + String((e as Error).message).slice(0, 80)));
    }
    return out;
  }
  start(everyMs: number, firstAfterMs = 5 * 60_000): void {
    if (this.timer) return;
    const t0 = setTimeout(() => { void this.runOnce(); }, firstAfterMs); t0.unref?.();
    this.timer = setInterval(() => { void this.runOnce(); }, everyMs); this.timer.unref?.();
  }
}

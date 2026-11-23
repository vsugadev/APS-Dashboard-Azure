/**
 * Database read copy: every DB_SYNC_MINUTES the app copies sheets from Google Sheets into Azure SQL, reads each copy back
 * and checks it is IDENTICAL (content hash of the grid JSON — v0.18.0; was: row count). A sheet that does not exist is
 * skipped (the stored sheet list says so). Never throws; logs a short line when the state changes.
 *
 * v0.18.0 (Phase 5 step 1):
 *  - `discover`: the sheet list is the spreadsheet's own tab list on every run (new tabs are picked up), minus `exclude`.
 *  - every sheet's check is counted per day in dbo.sheet_sync_log (the plan's "two clean weeks per table" evidence).
 *  - `onDone(startedAt, ok)`: lets the reader know a copy started at that time has finished (reads after a save).
 */
import { createHash } from 'crypto';
import type { DataSource, WorkbookKey } from '../data/types';
import { TITLES_ROW, describeDbError, encodeGrid, type SheetStore } from './sheetStore';

export interface SyncResult { ok: boolean; rows: Record<string, number>; mismatches: string[]; error: string; at: number }
export interface SyncOptions { discover?: boolean; exclude?: RegExp | null; onDone?: (startedAt: number, ok: boolean) => void;
  /** v0.23.2: a tab that was copied AND checked identical — the reader keeps it in memory (no database read per request). */
  onStored?: (book: string, sheet: string, values: unknown[][], timeZone: string, at: number) => void }

const hash = (values: unknown[][]): string => createHash('sha256').update(encodeGrid(values)).digest('hex');
export const syncDay = (t: number): string => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export class SheetSync {
  last: SyncResult | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<SyncResult> | null = null;
  private again = false;
  /** v0.24.2: per tab, the hash of the grid last copied AND checked identical. A tab whose Google grid has the same hash is
   *  NOT rewritten (only its "copied at" time is renewed) — before, every copy rewrote and re-read all ~90 tabs (~60,000 rows)
   *  every 5 minutes and after every save. */
  private verified = new Map<string, string>();
  stats = { copies: 0, ms: 0, tabs: 0, written: 0 };
  /** One short line for the hourly [Perf] summary; counters restart. */
  takeStats(): string {
    const s = this.stats; this.stats = { copies: 0, ms: 0, tabs: 0, written: 0 };
    return s.copies ? this.book + ' ' + s.copies + '× avg ' + (s.ms / s.copies / 1000).toFixed(1) + ' s, ' + s.written + ' of ' + s.tabs + ' tabs rewritten' : this.book + ' no copy';
  }
  constructor(private source: DataSource, private store: SheetStore, public book: string, public names: string[],
    private log: (m: string) => void = console.log, private now: () => number = Date.now, private label = 'Special Classes', private opts: SyncOptions = {}) {}

  /** One copy; a call while one runs waits for it and then runs once more (so a save is always included). */
  runOnce(force = false): Promise<SyncResult> {
    if (force) this.verified.clear(); // reconciliation found a difference: rewrite every tab
    if (this.running) { this.again = true; return this.running.then(() => this.runOnce()); }
    this.again = false;
    this.running = this.copy().finally(() => { this.running = null; });
    return this.running;
  }

  private async copy(): Promise<SyncResult> {
    const startedAt = this.now();
    const res: SyncResult = { ok: false, rows: {}, mismatches: [], error: '', at: startedAt };
    try {
      let names = this.names;
      if (this.opts.discover) {
        const t = await this.source.readSheets(this.book as WorkbookKey, []);
        names = (t.titles || []).filter((n) => !(this.opts.exclude && this.opts.exclude.test(n)));
        this.names = names;
      }
      const snap = await this.source.readSheets(this.book as WorkbookKey, names);
      await this.store.put(this.book, TITLES_ROW, { values: [snap.titles || []], timeZone: snap.timeZone });
      if (this.opts.onStored) { try { this.opts.onStored(this.book, TITLES_ROW, [snap.titles || []], snap.timeZone, startedAt); } catch { /* cache only */ } }
      const want: Record<string, string> = {};
      const same: string[] = [];
      for (const n of names) {
        const g = snap.sheets[n];
        if (!g) continue; // not in the spreadsheet (the titles row records that)
        const h = hash(g.values);
        if (this.verified.get(n) === h && this.store.touch) { same.push(n); res.rows[n] = g.values.length; continue; } // v0.24.2: unchanged
        res.rows[n] = await this.store.put(this.book, n, { values: g.values, timeZone: snap.timeZone });
        want[n] = h;
      }
      if (same.length) await this.store.touch!(this.book, same);
      const written = Object.keys(want);
      const back = written.length ? await this.store.get(this.book, written) : {};
      const day = syncDay(startedAt);
      const logRows: { sheet: string; rows: number; ok: boolean }[] = [];
      for (const n of same) {
        if (this.opts.onStored) { try { this.opts.onStored(this.book, n, snap.sheets[n]!.values, snap.timeZone, startedAt); } catch { /* cache only */ } }
        logRows.push({ sheet: n, rows: res.rows[n], ok: true });
      }
      for (const n of written) {
        const ok = !!back[n] && back[n]!.values.length === res.rows[n] && hash(back[n]!.values) === want[n];
        if (!ok) { res.mismatches.push(n); this.verified.delete(n); }
        else {
          this.verified.set(n, want[n]);
          if (this.opts.onStored) { try { this.opts.onStored(this.book, n, back[n]!.values, snap.timeZone, startedAt); } catch { /* cache only */ } }
        }
        logRows.push({ sheet: n, rows: res.rows[n], ok });
      }
      if (this.store.logSyncMany) await this.store.logSyncMany(day, this.book, logRows).catch(() => undefined);
      else if (this.store.logSync) for (const r of logRows) await this.store.logSync(day, this.book, r.sheet, r.rows, r.ok).catch(() => undefined);
      this.stats.copies++; this.stats.ms += this.now() - startedAt; this.stats.tabs += logRows.length; this.stats.written += written.length;
      res.ok = res.mismatches.length === 0;
      if (!res.ok) res.error = 'copy differs from the sheet after reading it back: ' + res.mismatches.join(', ');
    } catch (e) { res.error = describeDbError(e); }
    const prev = this.last; this.last = res;
    if (!res.ok || !prev || !prev.ok) {
      const n = Object.keys(res.rows);
      this.log(res.ok
        ? `[DB] ${this.label} copied to Azure SQL — ` + (n.length > 6 ? n.length + ' sheets, ' + n.reduce((a, k) => a + res.rows[k], 0) + ' rows' : n.map((k) => k + ' ' + res.rows[k] + ' rows').join(', ') || 'nothing to copy yet (' + (this.names.join(', ') || 'no tab') + ' not in the spreadsheet)') + (n.length ? '; checked identical.' : '.')
        : `[DB] ${this.label} copy FAILED: ${res.error} — reads stay on Google Sheets.`);
    }
    try { this.opts.onDone?.(startedAt, res.ok); } catch { /* reader bookkeeping only */ }
    return res;
  }

  start(everyMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.runOnce(); }, everyMs);
    this.timer.unref?.();
  }
  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}

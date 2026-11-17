/**
 * Database pilot — the read copy: every DB_SYNC_MINUTES the app copies the chosen sheets (Special Classes: programs,
 * enrollments, audit) from Google Sheets into Azure SQL, then reads each copy back and compares the row counts.
 * A sheet that does not exist is skipped (the stored sheet list says so). Never throws; logs a short line.
 */
import type { DataSource, WorkbookKey } from '../data/types';
import { TITLES_ROW, describeDbError, type SheetStore } from './sheetStore';

export interface SyncResult { ok: boolean; rows: Record<string, number>; mismatches: string[]; error: string; at: number }

export class SheetSync {
  last: SyncResult | null = null;
  private timer: NodeJS.Timeout | null = null;
  constructor(private source: DataSource, private store: SheetStore, public book: string, public names: string[],
    private log: (m: string) => void = console.log, private now: () => number = Date.now, private label = 'Special Classes') {}

  async runOnce(): Promise<SyncResult> {
    const res: SyncResult = { ok: false, rows: {}, mismatches: [], error: '', at: this.now() };
    try {
      const snap = await this.source.readSheets(this.book as WorkbookKey, this.names);
      await this.store.put(this.book, TITLES_ROW, { values: [snap.titles || []], timeZone: snap.timeZone });
      for (const n of this.names) {
        const g = snap.sheets[n];
        if (!g) continue; // not in the spreadsheet (the titles row records that)
        res.rows[n] = await this.store.put(this.book, n, { values: g.values, timeZone: snap.timeZone });
      }
      const back = await this.store.get(this.book, Object.keys(res.rows));
      for (const n of Object.keys(res.rows)) if (!back[n] || back[n]!.rows !== res.rows[n] || back[n]!.values.length !== res.rows[n]) res.mismatches.push(n);
      res.ok = res.mismatches.length === 0;
      if (!res.ok) res.error = 'row count differs after copy: ' + res.mismatches.join(', ');
    } catch (e) { res.error = describeDbError(e); }
    const prev = this.last; this.last = res;
    if (!res.ok || !prev || !prev.ok) this.log(res.ok
      ? `[DB] ${this.label} copied to Azure SQL — ` + Object.keys(res.rows).map((n) => n + ' ' + res.rows[n] + ' rows').join(', ') + '; reads now come from the database.'
      : `[DB] ${this.label} copy FAILED: ${res.error} — reads stay on Google Sheets.`);
    return res;
  }

  start(everyMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.runOnce(); }, everyMs);
    this.timer.unref?.();
  }
  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}

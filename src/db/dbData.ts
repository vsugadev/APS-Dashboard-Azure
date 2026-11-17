/**
 * Database pilot — a DataSource that serves the copied sheets (Special Classes) from Azure SQL and everything else from
 * Google Sheets. Used only when every requested sheet has a fresh copy (≤ maxAgeMs); otherwise, or if the database
 * is not reachable, the read goes to Google Sheets exactly as before — the page never breaks because of the database.
 */
import type { DataSource, SheetGrid, SheetSnapshot, WorkbookKey, ValuesRequest, AccessOverrides, Course } from '../data/types';
import { TITLES_ROW, describeDbError, type SheetStore } from './sheetStore';

export class DbBackedDataSource implements DataSource {
  book = '';                       // 'id:<spreadsheet id>' — set once the copied code's own ID function is known
  names = new Set<string>();
  served = 0; fallbacks = 0;
  private lastLogged = 0;
  constructor(private inner: DataSource, private store: SheetStore, private maxAgeMs = 15 * 60_000,
    private now: () => number = Date.now, private log: (m: string) => void = console.warn) {}

  readCourses(): Promise<Course[]> { return this.inner.readCourses(); }
  readConfiguredUserRoles(): Promise<Record<string, string>> { return this.inner.readConfiguredUserRoles(); }
  readAccessOverrides(): Promise<AccessOverrides> { return this.inner.readAccessOverrides(); }
  readValues(book: WorkbookKey, req: ValuesRequest) { return this.inner.readValues(book, req); }
  invalidate(): void { this.inner.invalidate?.(); }
  /** The Google Sheets source behind (the sync reads from it — never from the copy). */
  innerSource(): DataSource { return this.inner; }
  /** The database store (one connection pool, shared with the sync). */
  storeRef(): SheetStore { return this.store; }

  async readSheets(book: WorkbookKey, names: string[]): Promise<SheetSnapshot> {
    if (!this.book || book !== this.book || !names.every((n) => this.names.has(n))) return this.inner.readSheets(book, names);
    try {
      const got = await this.store.get(this.book, [TITLES_ROW].concat(names));
      const t = this.now(), fresh = (x: { syncedAt: number } | null) => !!x && t - x.syncedAt <= this.maxAgeMs;
      const titlesRow = got[TITLES_ROW];
      if (!fresh(titlesRow)) throw new Error('STALE_COPY');
      const titles = ((titlesRow!.values[0] || []) as unknown[]).map(String);
      const sheets: Record<string, SheetGrid | null> = {};
      for (const n of names) {
        if (titles.indexOf(n) < 0) { sheets[n] = null; continue; } // not in the spreadsheet (same as the Sheets API answer)
        const g = got[n];
        if (!fresh(g)) throw new Error('STALE_COPY');
        sheets[n] = { values: g!.values };
      }
      this.served++;
      return { timeZone: titlesRow!.timeZone, sheets, titles };
    } catch (e) {
      this.fallbacks++;
      const t = this.now();
      if (t - this.lastLogged > 60_000) { this.lastLogged = t; this.log('[DB] read from Google Sheets instead: ' + (String((e as Error).message) === 'STALE_COPY' ? 'the database copy is older than ' + Math.round(this.maxAgeMs / 60000) + ' minutes' : describeDbError(e))); }
      return this.inner.readSheets(book, names);
    }
  }
}

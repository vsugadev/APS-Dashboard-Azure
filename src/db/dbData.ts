/**
 * Database pilot — a DataSource that serves the copied sheets (Special Classes) from Azure SQL and everything else from
 * Google Sheets. Used only when every requested sheet has a fresh copy (≤ maxAgeMs); otherwise, or if the database
 * is not reachable, the read goes to Google Sheets exactly as before — the page never breaks because of the database.
 */
import type { DataSource, SheetGrid, SheetSnapshot, WorkbookKey, ValuesRequest, AccessOverrides, Course } from '../data/types';
import { TITLES_ROW, describeDbError, type SheetStore, type OwnedStore, type OwnedSheet } from './sheetStore';

export class DbBackedDataSource implements DataSource {
  book = '';                       // 'id:<spreadsheet id>' — set once the copied code's own ID function is known
  names = new Set<string>();
  served = 0; fallbacks = 0;
  /** v0.13.0 stage 3 — sheets OWNED by the database (SC_OWNER=azure): programs + audit. Read only from the owned store
   *  (never from Google, never "stale"); `ownedReady` once the programs sheet is in the store (import done). */
  owned = new Set<string>();
  ownedReady = false;
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

  ownedStore(): OwnedStore { return this.store as unknown as OwnedStore; }
  /** The owned sheets as stored (with their versions) — scOwner.ts reads these before a save. */
  async readOwned(): Promise<Record<string, OwnedSheet | null>> {
    if (!this.ownedReady) throw new Error('SC_OWNER_NOT_READY');
    return this.ownedStore().getOwned(this.book, Array.from(this.owned));
  }

  async readSheets(book: WorkbookKey, names: string[]): Promise<SheetSnapshot> {
    if (this.owned.size && this.book && book === this.book) return this.readWithOwned(book, names);
    return this.readCopy(book, names);
  }

  /** Owned sheets from the owned store; the rest (enrollments) as before; the sheet list merged. A database problem
   *  THROWS (Code.gs then shows "Special Classes are not available") — never stale Google data for an owned sheet. */
  private async readWithOwned(book: WorkbookKey, names: string[]): Promise<SheetSnapshot> {
    if (!this.ownedReady) throw new Error('SC_OWNER_NOT_READY: Special Classes are not in the database yet.');
    const mine = names.filter((n) => this.owned.has(n)), rest = names.filter((n) => !this.owned.has(n));
    const [got, base] = await Promise.all([this.ownedStore().getOwned(this.book, Array.from(this.owned)), this.readCopy(book, rest)]);
    const sheets: Record<string, SheetGrid | null> = { ...base.sheets };
    for (const n of mine) sheets[n] = got[n] ? { values: got[n]!.values } : null;
    const titles = (base.titles || []).filter((t) => !this.owned.has(t)).concat(Array.from(this.owned).filter((n) => !!got[n]));
    const anyOwned = Array.from(this.owned).map((n) => got[n]).find(Boolean);
    return { timeZone: anyOwned ? anyOwned.timeZone : base.timeZone, sheets, titles };
  }

  private async readCopy(book: WorkbookKey, names: string[]): Promise<SheetSnapshot> {
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

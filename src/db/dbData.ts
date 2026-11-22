/**
 * Database pilot — a DataSource that serves the copied sheets (Special Classes) from Azure SQL and everything else from
 * Google Sheets. Used only when every requested sheet has a fresh copy (≤ maxAgeMs); otherwise, or if the database
 * is not reachable, the read goes to Google Sheets exactly as before — the page never breaks because of the database.
 */
import type { DataSource, SheetGrid, SheetSnapshot, WorkbookKey, ValuesRequest, AccessOverrides, Course } from '../data/types';
import { TITLES_ROW, describeDbError, type SheetStore, type OwnedStore, type OwnedSheet } from './sheetStore';
import { dateToSerial } from '../gas/runtime';

export class DbBackedDataSource implements DataSource {
  book = '';                       // 'id:<spreadsheet id>' — set once the copied code's own ID function is known
  names = new Set<string>();
  served = 0; fallbacks = 0;
  /** v0.13.0 stage 3 — sheets OWNED by the database (SC_OWNER=azure): programs + audit. Read only from the owned store
   *  (never from Google, never "stale"); `ownedReady` once the programs sheet is in the store (import done). */
  owned = new Set<string>();
  ownedReady = false;
  /** v0.18.0 (Phase 5 step 1): whole-spreadsheet copies ('main', 'attendance'). `reads` = serve reads from the copy
   *  (DB_READS); a save marks the copy dirty and reads go to Google until a copy that STARTED after the save has finished. */
  copies = new Map<string, { names: () => Set<string>; reads: boolean; dirtySince: number }>();
  onDirty: (() => void) | null = null;
  private lastLogged = 0;
  /** v0.23.2: decoded copies kept in memory (filled by this instance's own copy job, and by database reads). A read then
   *  needs no database round trip; the freshness rules are unchanged (≤ maxAgeMs, and not after a save until a new copy). */
  private mem = new Map<string, { values: unknown[][]; timeZone: string; syncedAt: number }>();
  cacheStored(key: string, sheet: string, values: unknown[][], timeZone: string, syncedAt: number): void { this.mem.set(key + '\u0000' + sheet, { values, timeZone, syncedAt }); }
  memHits = 0;
  constructor(private inner: DataSource, private store: SheetStore, private maxAgeMs = 15 * 60_000,
    private now: () => number = Date.now, private log: (m: string) => void = console.warn) {}

  readCourses(): Promise<Course[]> { return this.inner.readCourses(); }
  readConfiguredUserRoles(): Promise<Record<string, string>> { return this.inner.readConfiguredUserRoles(); }
  readAccessOverrides(): Promise<AccessOverrides> { return this.inner.readAccessOverrides(); }
  /** v0.23.4: Sheets.Values.batchGet (UNFORMATTED_VALUE + SERIAL_NUMBER, the only form Code.gs uses — attendance week sheets)
   *  answered from the verified copy when its reads are on and clean; anything else, or any doubt, goes to Google as before. */
  async readValues(book: WorkbookKey, req: ValuesRequest) {
    const c = this.copies.get(book);
    if (c && c.reads && !c.dirtySince && valuesFromCopyOk(req)) {
      const parsed = req.ranges.map(parseA1);
      const names = Array.from(new Set(parsed.map((p) => (p ? p.sheet : ''))));
      const have = c.names();
      if (parsed.every(Boolean) && names.every((n) => have.has(n))) {
        try {
          const snap = await this.readStored(book, names, book, have, true);
          this.valuesFromCopy++;
          return { valueRanges: parsed.map((p) => ({ range: p!.raw, values: sliceUnformatted(snap.sheets[p!.sheet] ? snap.sheets[p!.sheet]!.values : [], p!, snap.timeZone) })) };
        } catch { /* fall through to Google */ }
      }
    }
    return this.inner.readValues(book, req);
  }
  valuesFromCopy = 0;
  invalidate(): void {
    this.inner.invalidate?.();
    if (this.copies.size) { const t = this.now(); for (const c of this.copies.values()) c.dirtySince = t; this.onDirty?.(); }
  }
  addCopy(book: string, names: () => Set<string>, reads: boolean): void { this.copies.set(book, { names, reads, dirtySince: 0 }); }
  /** A copy of `book` that started at `startedAt` finished; clean again only when it started after the last save. */
  copyDone(book: string, startedAt: number, ok: boolean): void { const c = this.copies.get(book); if (c && ok && c.dirtySince && startedAt >= c.dirtySince) c.dirtySince = 0; }
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
    const c = this.copies.get(book);
    if (c) {
      if (!c.reads || c.dirtySince) return this.inner.readSheets(book, names);
      return this.readStored(book, names, book, c.names(), true); // tabs that do not exist are answered from the stored tab list
    }
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
    if (!this.book || book !== this.book) return this.inner.readSheets(book, names);
    return this.readStored(book, names, this.book, this.names);
  }

  private async readStored(book: WorkbookKey, names: string[], key: string, have: Set<string>, missingOk = false): Promise<SheetSnapshot> {
    if (!missingOk && !names.every((n) => have.has(n))) return this.inner.readSheets(book, names);
    try {
      const tNow = this.now(), all = [TITLES_ROW].concat(names);
      const got: Record<string, { values: unknown[][]; timeZone: string; syncedAt: number } | null> = {};
      const missing = all.filter((n) => { const m = this.mem.get(key + '\u0000' + n); if (m && tNow - m.syncedAt <= this.maxAgeMs) { got[n] = m; return false; } return true; });
      if (missing.length) {
        const fromDb = await this.store.get(key, missing);
        for (const n of missing) { const g = fromDb[n]; got[n] = g; if (g) this.mem.set(key + '\u0000' + n, { values: g.values, timeZone: g.timeZone, syncedAt: g.syncedAt }); }
      } else this.memHits++;
      const t = this.now(), fresh = (x: { syncedAt: number } | null) => !!x && t - x.syncedAt <= this.maxAgeMs;
      const titlesRow = got[TITLES_ROW];
      if (!fresh(titlesRow)) throw new Error('STALE_COPY');
      const titles = ((titlesRow!.values[0] || []) as unknown[]).map(String);
      const sheets: Record<string, SheetGrid | null> = {};
      for (const n of names) {
        if (titles.indexOf(n) < 0) { sheets[n] = null; continue; } // not in the spreadsheet (same as the Sheets API answer)
        if (!have.has(n)) throw new Error('NOT_COPIED'); // a tab that exists but is not copied (DB_COPY_EXCLUDE)
        const g = got[n];
        if (!fresh(g)) throw new Error('STALE_COPY');
        sheets[n] = { values: g!.values };
      }
      this.served++;
      return { timeZone: titlesRow!.timeZone, sheets, titles };
    } catch (e) {
      if (String((e as Error).message) === 'NOT_COPIED') return this.inner.readSheets(book, names);
      this.fallbacks++;
      const t = this.now();
      if (t - this.lastLogged > 60_000) { this.lastLogged = t; this.log('[DB] read from Google Sheets instead: ' + (String((e as Error).message) === 'STALE_COPY' ? 'the database copy is older than ' + Math.round(this.maxAgeMs / 60000) + ' minutes' : describeDbError(e))); }
      return this.inner.readSheets(book, names);
    }
  }
}

/* ---- v0.23.4: values:batchGet from a stored grid ---- */
export function valuesFromCopyOk(req: ValuesRequest): boolean {
  return req.valueRenderOption === 'UNFORMATTED_VALUE' && req.dateTimeRenderOption === 'SERIAL_NUMBER' && (!req.majorDimension || req.majorDimension === 'ROWS');
}
export interface A1 { raw: string; sheet: string; r1: number; c1: number; r2: number | null; c2: number | null }
const colNum = (s: string) => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
/** "'Week 3'!A2:Z", "Sheet!B5:C10", "Sheet" → parts (1-based); null when not understood. */
export function parseA1(raw: string): A1 | null {
  const m = /^(?:'((?:[^']|'')+)'|([^!']+))(?:!([A-Z]{1,3})(\d+)?(?::([A-Z]{1,3})(\d+)?)?)?$/.exec(String(raw).trim());
  if (!m) return null;
  const sheet = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2];
  if (!m[3]) return { raw, sheet, r1: 1, c1: 1, r2: null, c2: null };
  const c1 = colNum(m[3]), r1 = m[4] ? Number(m[4]) : 1;
  if (m[5] === undefined && m[6] === undefined) return { raw, sheet, c1, r1, c2: c1, r2: m[4] ? r1 : null }; // one cell, or one whole column
  return { raw, sheet, c1, r1, c2: m[5] ? colNum(m[5]) : null, r2: m[6] ? Number(m[6]) : null };
}
/** As the Sheets API answers UNFORMATTED_VALUE + SERIAL_NUMBER: dates as serial numbers, trailing empty cells and rows left out. */
export function sliceUnformatted(grid: unknown[][], a: A1, tz: string): unknown[][] {
  const last = a.r2 === null ? grid.length : Math.min(a.r2, grid.length);
  const out: unknown[][] = [];
  for (let r = a.r1; r <= last; r++) {
    const src = grid[r - 1] || [];
    const end = a.c2 === null ? src.length : Math.min(a.c2, src.length);
    const row: unknown[] = [];
    for (let c = a.c1; c <= end; c++) { const v = src[c - 1]; row.push(v instanceof Date ? dateToSerial(v, tz) : v === null || v === undefined ? '' : v); }
    while (row.length && row[row.length - 1] === '') row.pop();
    out.push(row);
  }
  while (out.length && !out[out.length - 1].length) out.pop();
  return out;
}


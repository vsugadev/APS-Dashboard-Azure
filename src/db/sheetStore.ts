/**
 * Database pilot (v0.11.0) — Azure SQL Database (free offer) as a READ COPY of Google Sheets, starting with Special Classes.
 *
 * One table, dbo.sheet_snapshot: one row per (spreadsheet, sheet) with the whole grid as JSON, the row count and the
 * time of the copy. Azure keeps reading through the same copied Code.gs readers (nothing re-written), but the grid
 * comes from the database instead of the Sheets API. Apps Script still owns the data (it writes the Sheet); a later
 * step makes the database the owner with proper tables.
 *
 * The app signs in to Azure SQL with its MANAGED IDENTITY (Entra ID) — no password anywhere.
 */
import type sqlTypes from 'mssql';

export interface StoredSheet { values: unknown[][]; timeZone: string; syncedAt: number; rows: number }
export interface SheetStore {
  readonly kind: string;
  ensureSchema(): Promise<void>;
  /** Replaces the copy of one sheet; returns the row count written. */
  put(book: string, sheet: string, snap: { values: unknown[][]; timeZone: string }): Promise<number>;
  /** The stored copies of `names` (null when never copied). */
  get(book: string, names: string[]): Promise<Record<string, StoredSheet | null>>;
  /** v0.18.0 (Phase 5): one verification result per sheet per copy — counted per day (the "two clean weeks" evidence). */
  logSync?(day: string, book: string, sheet: string, rows: number, ok: boolean): Promise<void>;
  syncReport?(sinceDay: string): Promise<SyncDayRow[]>;
}
export interface SyncDayRow { day: string; book: string; sheet: string; copies: number; mismatches: number; rows: number }

/** v0.13.0 — database stage 3: sheets OWNED by the database (Special Classes programs + audit). Optimistic versions. */
export interface OwnedSheet { values: unknown[][]; timeZone: string; version: number; updatedAt: number; updatedBy: string }
export interface OwnedStore {
  ensureOwnedSchema(): Promise<void>;
  getOwned(book: string, names: string[]): Promise<Record<string, OwnedSheet | null>>;
  /** Writes one owned sheet. expectedVersion 0 = must not exist yet (import / first audit row). Throws Error('CONFLICT')
   *  when someone else changed it meanwhile. Returns the new version. */
  putOwned(book: string, sheet: string, values: unknown[][], timeZone: string, expectedVersion: number, by: string): Promise<number>;
}

export const TITLES_ROW = '__titles__'; // the spreadsheet's sheet list (so a "does this sheet exist" check is right too)

/** Grid ⇄ JSON; Date cells survive as {"$d": ISO}. */
export function encodeGrid(values: unknown[][]): string {
  return JSON.stringify(values, function (this: any, k, v) { const raw = this[k]; return raw instanceof Date ? { $d: raw.toISOString() } : v; });
}
export function decodeGrid(s: string): unknown[][] {
  return JSON.parse(s, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) && typeof v.$d === 'string' && Object.keys(v).length === 1 ? new Date(v.$d) : v));
}

/** Tests / local development. Stores the JSON text, exactly like the database. */
export class MemorySheetStore implements SheetStore, OwnedStore {
  readonly kind = 'memory';
  private rows = new Map<string, { grid: string; tz: string; at: number; n: number }>();
  failNext = false;
  constructor(private now: () => number = Date.now) {}
  async ensureSchema(): Promise<void> { /* nothing */ }
  async put(book: string, sheet: string, snap: { values: unknown[][]; timeZone: string }): Promise<number> {
    if (this.failNext) { this.failNext = false; throw new Error('memory store failure'); }
    this.rows.set(book + '\u0000' + sheet, { grid: encodeGrid(snap.values), tz: snap.timeZone, at: this.now(), n: snap.values.length });
    return snap.values.length;
  }
  private owned = new Map<string, { grid: string; tz: string; v: number; at: number; by: string }>();
  async ensureOwnedSchema(): Promise<void> { /* nothing */ }
  async getOwned(book: string, names: string[]): Promise<Record<string, OwnedSheet | null>> {
    if (this.failNext) { this.failNext = false; throw new Error('memory store failure'); }
    const out: Record<string, OwnedSheet | null> = {};
    for (const n of names) { const r = this.owned.get(book + '\u0000' + n); out[n] = r ? { values: decodeGrid(r.grid), timeZone: r.tz, version: r.v, updatedAt: r.at, updatedBy: r.by } : null; }
    return out;
  }
  async putOwned(book: string, sheet: string, values: unknown[][], timeZone: string, expectedVersion: number, by: string): Promise<number> {
    const k = book + '\u0000' + sheet, cur = this.owned.get(k);
    if ((cur ? cur.v : 0) !== expectedVersion) throw new Error('CONFLICT');
    this.owned.set(k, { grid: encodeGrid(values), tz: timeZone, v: expectedVersion + 1, at: this.now(), by });
    return expectedVersion + 1;
  }
  async get(book: string, names: string[]): Promise<Record<string, StoredSheet | null>> {
    if (this.failNext) { this.failNext = false; throw new Error('memory store failure'); }
    const out: Record<string, StoredSheet | null> = {};
    for (const n of names) { const r = this.rows.get(book + '\u0000' + n); out[n] = r ? { values: decodeGrid(r.grid), timeZone: r.tz, syncedAt: r.at, rows: r.n } : null; }
    for (const n of names) if (this.corruptNext === n && out[n]) { this.corruptNext = ''; out[n]!.values = out[n]!.values.map((row, i) => (i === out[n]!.values.length - 1 ? row.map(() => 'CHANGED') : row)); }
    return out;
  }
  log = new Map<string, SyncDayRow>();
  corruptNext = ''; // tests: the next read-back of this sheet comes back changed
  async logSync(day: string, book: string, sheet: string, rows: number, ok: boolean): Promise<void> {
    const k = [day, book, sheet].join('\u0000'), r = this.log.get(k) || { day, book, sheet, copies: 0, mismatches: 0, rows: 0 };
    r.copies++; if (!ok) r.mismatches++; r.rows = rows; this.log.set(k, r);
  }
  async syncReport(sinceDay: string): Promise<SyncDayRow[]> { return Array.from(this.log.values()).filter((r) => r.day >= sinceDay).map((r) => ({ ...r })); }
}

/** Azure SQL Database through `mssql` (tedious), signed in with the app's managed identity. Parameterised queries only. */
export class MssqlSheetStore implements SheetStore, OwnedStore {
  readonly kind = 'azure-sql';
  private pool: Promise<sqlTypes.ConnectionPool> | null = null;
  constructor(private server: string, private database: string, private sql: typeof sqlTypes = require('mssql')) {}

  /** v0.15.0: shared with the session store (one pool per app). */
  connectPool(): Promise<sqlTypes.ConnectionPool> { return this.connect(); }
  private connect(): Promise<sqlTypes.ConnectionPool> {
    if (!this.pool) {
      const p = new this.sql.ConnectionPool({
        server: this.server, database: this.database, port: 1433,
        options: { encrypt: true, trustServerCertificate: false },
        authentication: { type: 'azure-active-directory-default', options: {} } as never,
        pool: { max: 4, min: 0, idleTimeoutMillis: 60_000 },
        connectionTimeout: 60_000, requestTimeout: 30_000, // the free serverless database may be paused — first connect wakes it
      } as sqlTypes.config);
      this.pool = p.connect().catch((e) => { this.pool = null; throw e; });
    }
    return this.pool;
  }

  async ensureSchema(): Promise<void> {
    const pool = await this.connect();
    await pool.request().query(
      "IF OBJECT_ID(N'dbo.sheet_snapshot', N'U') IS NULL CREATE TABLE dbo.sheet_snapshot (" +
      'book NVARCHAR(200) NOT NULL, sheet NVARCHAR(200) NOT NULL, time_zone NVARCHAR(64) NOT NULL, grid NVARCHAR(MAX) NOT NULL, ' +
      'row_count INT NOT NULL, synced_at DATETIME2(3) NOT NULL, CONSTRAINT PK_sheet_snapshot PRIMARY KEY (book, sheet));');
  }

  async ensureOwnedSchema(): Promise<void> {
    const pool = await this.connect();
    await pool.request().query(
      "IF OBJECT_ID(N'dbo.owned_sheet', N'U') IS NULL CREATE TABLE dbo.owned_sheet (" +
      'book NVARCHAR(200) NOT NULL, sheet NVARCHAR(200) NOT NULL, time_zone NVARCHAR(64) NOT NULL, grid NVARCHAR(MAX) NOT NULL, ' +
      'row_count INT NOT NULL, version INT NOT NULL, updated_at DATETIME2(3) NOT NULL, updated_by NVARCHAR(254) NOT NULL, ' +
      'CONSTRAINT PK_owned_sheet PRIMARY KEY (book, sheet));');
  }
  async getOwned(book: string, names: string[]): Promise<Record<string, OwnedSheet | null>> {
    const pool = await this.connect();
    const r = await pool.request().input('book', this.sql.NVarChar(200), book)
      .query('SELECT sheet, time_zone, grid, version, updated_at, updated_by FROM dbo.owned_sheet WHERE book = @book;');
    const by: Record<string, any> = {};
    for (const row of (r.recordset || []) as any[]) by[String(row.sheet)] = row;
    const out: Record<string, OwnedSheet | null> = {};
    for (const n of names) { const row = by[n]; out[n] = row ? { values: decodeGrid(String(row.grid)), timeZone: String(row.time_zone), version: Number(row.version), updatedAt: new Date(row.updated_at).getTime(), updatedBy: String(row.updated_by) } : null; }
    return out;
  }
  async putOwned(book: string, sheet: string, values: unknown[][], timeZone: string, expectedVersion: number, by: string): Promise<number> {
    const pool = await this.connect();
    const S = this.sql;
    const req = pool.request().input('book', S.NVarChar(200), book).input('sheet', S.NVarChar(200), sheet).input('tz', S.NVarChar(64), timeZone)
      .input('grid', S.NVarChar(S.MAX), encodeGrid(values)).input('n', S.Int, values.length).input('v', S.Int, expectedVersion).input('by', S.NVarChar(254), String(by).slice(0, 254));
    const r = expectedVersion === 0
      ? await req.query('INSERT INTO dbo.owned_sheet (book, sheet, time_zone, grid, row_count, version, updated_at, updated_by) ' +
          'SELECT @book, @sheet, @tz, @grid, @n, 1, SYSUTCDATETIME(), @by WHERE NOT EXISTS (SELECT 1 FROM dbo.owned_sheet WITH (UPDLOCK, HOLDLOCK) WHERE book = @book AND sheet = @sheet);')
      : await req.query('UPDATE dbo.owned_sheet SET time_zone = @tz, grid = @grid, row_count = @n, version = version + 1, updated_at = SYSUTCDATETIME(), updated_by = @by ' +
          'WHERE book = @book AND sheet = @sheet AND version = @v;');
    if (!r.rowsAffected || r.rowsAffected[0] !== 1) throw new Error('CONFLICT');
    return expectedVersion + 1;
  }

  private logReady: Promise<void> | null = null;
  private async logPool(): Promise<sqlTypes.ConnectionPool> {
    const pool = await this.connect();
    if (!this.logReady) {
      this.logReady = pool.request().query("IF OBJECT_ID(N'dbo.sheet_sync_log', N'U') IS NULL CREATE TABLE dbo.sheet_sync_log (day DATE NOT NULL, book NVARCHAR(200) NOT NULL, sheet NVARCHAR(200) NOT NULL, copies INT NOT NULL, mismatches INT NOT NULL, row_count INT NOT NULL, CONSTRAINT PK_sheet_sync_log PRIMARY KEY (day, book, sheet));").then(() => undefined);
      this.logReady.catch(() => { this.logReady = null; });
    }
    await this.logReady;
    return pool;
  }
  async logSync(day: string, book: string, sheet: string, rows: number, ok: boolean): Promise<void> {
    const pool = await this.logPool(), S = this.sql;
    await pool.request().input('d', S.Date, day).input('b', S.NVarChar(200), book).input('s', S.NVarChar(200), sheet).input('n', S.Int, rows).input('m', S.Int, ok ? 0 : 1)
      .query('MERGE dbo.sheet_sync_log WITH (HOLDLOCK) AS t USING (SELECT @d AS day, @b AS book, @s AS sheet) AS x ON t.day = x.day AND t.book = x.book AND t.sheet = x.sheet ' +
        'WHEN MATCHED THEN UPDATE SET copies = copies + 1, mismatches = mismatches + @m, row_count = @n WHEN NOT MATCHED THEN INSERT (day, book, sheet, copies, mismatches, row_count) VALUES (@d, @b, @s, 1, @m, @n);');
  }
  async syncReport(sinceDay: string): Promise<SyncDayRow[]> {
    const pool = await this.logPool();
    const r = await pool.request().input('d', this.sql.Date, sinceDay).query('SELECT CONVERT(CHAR(10), day, 23) AS day, book, sheet, copies, mismatches, row_count FROM dbo.sheet_sync_log WHERE day >= @d;');
    return ((r.recordset || []) as any[]).map((x) => ({ day: String(x.day), book: String(x.book), sheet: String(x.sheet), copies: Number(x.copies), mismatches: Number(x.mismatches), rows: Number(x.row_count) }));
  }

  async put(book: string, sheet: string, snap: { values: unknown[][]; timeZone: string }): Promise<number> {
    const pool = await this.connect();
    const S = this.sql;
    await pool.request()
      .input('book', S.NVarChar(200), book).input('sheet', S.NVarChar(200), sheet).input('tz', S.NVarChar(64), snap.timeZone)
      .input('grid', S.NVarChar(S.MAX), encodeGrid(snap.values)).input('n', S.Int, snap.values.length)
      .query('MERGE dbo.sheet_snapshot WITH (HOLDLOCK) AS t USING (SELECT @book AS book, @sheet AS sheet) AS s ' +
        'ON t.book = s.book AND t.sheet = s.sheet ' +
        'WHEN MATCHED THEN UPDATE SET time_zone = @tz, grid = @grid, row_count = @n, synced_at = SYSUTCDATETIME() ' +
        'WHEN NOT MATCHED THEN INSERT (book, sheet, time_zone, grid, row_count, synced_at) VALUES (@book, @sheet, @tz, @grid, @n, SYSUTCDATETIME());');
    return snap.values.length;
  }

  async get(book: string, names: string[]): Promise<Record<string, StoredSheet | null>> {
    const pool = await this.connect();
    // v0.23.2: only the requested tabs (was: every tab of the spreadsheet on every read — tens of MB for "main")
    const want = Array.from(new Set(names)).slice(0, 250);
    const req = pool.request().input('book', this.sql.NVarChar(200), book);
    want.forEach((n, i) => req.input('n' + i, this.sql.NVarChar(200), n));
    const r = await req.query('SELECT sheet, time_zone, grid, row_count, synced_at FROM dbo.sheet_snapshot WHERE book = @book' +
      (want.length && want.length === new Set(names).size ? ' AND sheet IN (' + want.map((_n, i) => '@n' + i).join(', ') + ')' : '') + ';');
    const by: Record<string, any> = {};
    for (const row of (r.recordset || []) as any[]) by[String(row.sheet)] = row;
    const out: Record<string, StoredSheet | null> = {};
    for (const n of names) {
      const row = by[n];
      out[n] = row ? { values: decodeGrid(String(row.grid)), timeZone: String(row.time_zone), syncedAt: new Date(row.synced_at).getTime(), rows: Number(row.row_count) } : null;
    }
    return out;
  }
}

/** Log-safe cause + fix for a database error (never connection strings, tokens or data). */
export function describeDbError(err: unknown): string {
  const m = String((err && (err as Error).message) || err || '');
  if (/Login failed for user '<token-identified principal>'|token-identified principal|Login failed/i.test(m))
    return 'LOGIN_FAILED — give the app access: in the database Query editor (signed in as the Entra admin) run CREATE USER [aps-dashboard-ap] FROM EXTERNAL PROVIDER; ALTER ROLE db_datareader ADD MEMBER [aps-dashboard-ap]; ALTER ROLE db_datawriter ADD MEMBER [aps-dashboard-ap]; ALTER ROLE db_ddladmin ADD MEMBER [aps-dashboard-ap];';
  if (/Client with IP address|firewall/i.test(m)) return 'FIREWALL — SQL server → Networking → tick "Allow Azure services and resources to access this server".';
  if (/ManagedIdentityCredential|DefaultAzureCredential|CredentialUnavailable|AADSTS/i.test(m)) return 'NO_IDENTITY — the web app needs its system-assigned managed identity ON (App Service → Identity).';
  if (/ENOTFOUND|getaddrinfo/i.test(m)) return 'SERVER_NOT_FOUND — check SQL_SERVER (e.g. aps-dashboard-sql.database.windows.net).';
  if (/Cannot open database|database .* does not exist/i.test(m)) return 'DATABASE_NOT_FOUND — check SQL_DATABASE.';
  if (/paused|resuming|not currently available|ETIMEOUT|timeout/i.test(m)) return 'WAKING_UP — the free serverless database was paused; it retries automatically.';
  // v0.23.3: a Google error is never a database error (a Sheets 429 RESOURCE_EXHAUSTED was shown as FREE_LIMIT_REACHED)
  if (/GOOGLE_API_\d{3}|GOOGLE_NOT_CONFIGURED|unauthorized_client|invalid_grant/.test(m)) return 'GOOGLE — reading the Google Sheet failed: ' + (m.match(/GOOGLE_API_\d{3}(?: [A-Z_]+)*|GOOGLE_NOT_CONFIGURED|unauthorized_client|invalid_grant/) || ['error'])[0] + (/429/.test(m) ? ' (Sheets API rate limit; it clears within a minute)' : '');
  if (/free (amount|offer|limit)/i.test(m)) return 'FREE_LIMIT_REACHED — the monthly free allowance is used up; the database is paused until next month (reads come from Google Sheets meanwhile).';
  return 'ERROR — ' + m.replace(/[\w.+-]+@[\w.-]+/g, '<email>').replace(/(password|token|secret)=\S+/gi, '$1=[hidden]').slice(0, 120);
}

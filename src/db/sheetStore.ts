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
export class MemorySheetStore implements SheetStore {
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
  async get(book: string, names: string[]): Promise<Record<string, StoredSheet | null>> {
    if (this.failNext) { this.failNext = false; throw new Error('memory store failure'); }
    const out: Record<string, StoredSheet | null> = {};
    for (const n of names) { const r = this.rows.get(book + '\u0000' + n); out[n] = r ? { values: decodeGrid(r.grid), timeZone: r.tz, syncedAt: r.at, rows: r.n } : null; }
    return out;
  }
}

/** Azure SQL Database through `mssql` (tedious), signed in with the app's managed identity. Parameterised queries only. */
export class MssqlSheetStore implements SheetStore {
  readonly kind = 'azure-sql';
  private pool: Promise<sqlTypes.ConnectionPool> | null = null;
  constructor(private server: string, private database: string, private sql: typeof sqlTypes = require('mssql')) {}

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
    const r = await pool.request().input('book', this.sql.NVarChar(200), book)
      .query('SELECT sheet, time_zone, grid, row_count, synced_at FROM dbo.sheet_snapshot WHERE book = @book;');
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
  if (/free limit|exhausted/i.test(m)) return 'FREE_LIMIT_REACHED — the monthly free allowance is used up; the database is paused until next month (reads come from Google Sheets meanwhile).';
  return 'ERROR — ' + m.replace(/[\w.+-]+@[\w.-]+/g, '<email>').replace(/(password|token|secret)=\S+/gi, '$1=[hidden]').slice(0, 120);
}

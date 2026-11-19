/**
 * Phase 3 step 1 (v0.15.0) — lasting sign-ins: sessions kept in Azure SQL (table dbo.app_session) behind an in-memory
 * cache, so a restart, a deploy or a second App Service instance no longer signs everyone out.
 *
 *  - Same model as before (and as Code.gs): a random token → { email, role, issuedAt }, valid SESSION_TTL_SECONDS from
 *    sign-in (6 h). The browser still holds only the opaque token.
 *  - The database never holds the token itself, only its SHA-256 — someone who can read the table cannot sign in as anyone.
 *  - Reads come from memory; only a token this instance has not seen (after a restart, or from the other instance) is looked
 *    up in the database, once. A token the database does not know is remembered as unknown for 30 s (no repeated look-ups).
 *  - The database never blocks a sign-in: if it is slow (the free database wakes up in up to a minute) or down, the session
 *    still works on this instance and the write finishes in the background or is logged. Sign-out deletes it everywhere.
 *  - Expired rows are deleted every hour.
 */
import { createHash, randomUUID } from 'crypto';
import type * as sqlTypes from 'mssql';
import type { Session, SessionStore } from './sessions';

export interface SessionRow { email: string; role: string; issuedAt: number; expiresAt: number }
export interface SessionDb {
  put(hash: string, row: SessionRow): Promise<void>;
  get(hash: string, now: number): Promise<SessionRow | null>;
  del(hash: string): Promise<void>;
  sweep(now: number): Promise<number>;
}

export const tokenHash = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');

/** Times out a promise without cancelling it (the work carries on in the background). */
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('DB_SLOW')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export class DurableSessionStore implements SessionStore {
  private mem = new Map<string, { s: Session; exp: number }>();
  private unknown = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private lastLog = 0;
  stats = { dbReads: 0, dbHits: 0, dbErrors: 0 };
  constructor(private db: SessionDb, private ttlSeconds: number, private now: () => number = Date.now,
    private log: (m: string) => void = console.warn, private writeWaitMs = 3000, private readWaitMs = 15000) {}

  async create(s: Omit<Session, 'issuedAt'>): Promise<string> {
    const token = randomUUID(), at = this.now(), exp = at + this.ttlSeconds * 1000;
    this.mem.set(token, { s: { email: s.email, role: s.role, issuedAt: at }, exp });
    if (this.mem.size % 200 === 0) this.sweepMem();
    const w = this.db.put(tokenHash(token), { email: s.email, role: s.role, issuedAt: at, expiresAt: exp });
    w.catch((e) => this.problem('saved', e));
    try { await within(w, this.writeWaitMs); } catch { /* slow or failed — the session works here; logged above if it failed */ }
    return token;
  }

  async get(token: string): Promise<Session | null> {
    if (!token || typeof token !== 'string' || token.length > 100) return null;
    const t = this.now();
    const v = this.mem.get(token);
    if (v) { if (v.exp > t) return { ...v.s }; this.mem.delete(token); return null; }
    const u = this.unknown.get(token);
    if (u && u > t) return null;
    this.stats.dbReads++;
    let row: SessionRow | null = null;
    try { row = await within(this.db.get(tokenHash(token), t), this.readWaitMs); }
    catch (e) { this.problem('read', e); return null; }
    if (!row || row.expiresAt <= t) {
      if (this.unknown.size > 5000) this.unknown.clear();
      this.unknown.set(token, t + 30_000);
      return null;
    }
    this.stats.dbHits++;
    const s: Session = { email: row.email, role: row.role, issuedAt: row.issuedAt };
    this.mem.set(token, { s, exp: row.expiresAt });
    return { ...s };
  }

  async remove(token: string): Promise<void> {
    if (!token || typeof token !== 'string') return;
    this.mem.delete(token);
    this.unknown.set(token, this.now() + 30_000);
    try { await within(this.db.del(tokenHash(token)), this.writeWaitMs); } catch (e) { this.problem('deleted', e); }
  }

  /** Hourly: expired rows deleted from the database (and from memory). */
  start(everyMs = 3_600_000): void {
    if (this.timer) return;
    const run = () => { this.sweepMem(); this.db.sweep(this.now()).catch((e) => this.problem('cleaned up', e)); };
    run();
    this.timer = setInterval(run, everyMs);
    this.timer.unref?.();
  }
  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  private sweepMem(): void { const t = this.now(); for (const [k, v] of this.mem) if (v.exp <= t) this.mem.delete(k); }
  private problem(what: string, e: unknown): void {
    this.stats.dbErrors++;
    const t = this.now();
    if (t - this.lastLog < 60_000) return;
    this.lastLog = t;
    const m = String((e as Error)?.message || e);
    this.log('[Sessions] a sign-in could not be ' + what + ' in Azure SQL (' + (m === 'DB_SLOW' ? 'the database is slow — it may be waking up' : m.replace(/\s+/g, ' ').slice(0, 120)) + ') — sign-ins still work on this server; after a restart people may need to sign in again.');
  }
}

/** For tests: the same contract as the SQL table. */
export class MemorySessionDb implements SessionDb {
  rows = new Map<string, SessionRow>(); failNext = false; delayMs = 0;
  private async gate(): Promise<void> { if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs)); if (this.failNext) { this.failNext = false; throw new Error('memory db failure'); } }
  async put(h: string, r: SessionRow): Promise<void> { await this.gate(); this.rows.set(h, { ...r }); }
  async get(h: string, now: number): Promise<SessionRow | null> { await this.gate(); const r = this.rows.get(h); return r && r.expiresAt > now ? { ...r } : null; }
  async del(h: string): Promise<void> { await this.gate(); this.rows.delete(h); }
  async sweep(now: number): Promise<number> { await this.gate(); let n = 0; for (const [k, r] of this.rows) if (r.expiresAt <= now) { this.rows.delete(k); n++; } return n; }
}

/** dbo.app_session in Azure SQL (same managed-identity connection pool as the Special Classes tables). */
export class MssqlSessionDb implements SessionDb {
  private ready: Promise<void> | null = null;
  constructor(private pool: () => Promise<sqlTypes.ConnectionPool>, private sql: typeof sqlTypes = require('mssql')) {}
  private async conn(): Promise<sqlTypes.ConnectionPool> {
    const p = await this.pool();
    if (!this.ready) {
      this.ready = p.request().query(
        "IF OBJECT_ID(N'dbo.app_session', N'U') IS NULL CREATE TABLE dbo.app_session (" +
        'token_hash CHAR(64) NOT NULL CONSTRAINT PK_app_session PRIMARY KEY, email NVARCHAR(254) NOT NULL, role NVARCHAR(40) NOT NULL, ' +
        'issued_at DATETIME2(3) NOT NULL, expires_at DATETIME2(3) NOT NULL);').then(() => undefined);
      this.ready.catch(() => { this.ready = null; });
    }
    await this.ready;
    return p;
  }
  async put(h: string, r: SessionRow): Promise<void> {
    const p = await this.conn(), S = this.sql;
    await p.request().input('h', S.Char(64), h).input('e', S.NVarChar(254), r.email).input('r', S.NVarChar(40), r.role)
      .input('i', S.DateTime2(3), new Date(r.issuedAt)).input('x', S.DateTime2(3), new Date(r.expiresAt))
      .query('INSERT INTO dbo.app_session (token_hash, email, role, issued_at, expires_at) VALUES (@h, @e, @r, @i, @x);');
  }
  async get(h: string, now: number): Promise<SessionRow | null> {
    const p = await this.conn(), S = this.sql;
    const res = await p.request().input('h', S.Char(64), h).input('n', S.DateTime2(3), new Date(now))
      .query('SELECT email, role, issued_at, expires_at FROM dbo.app_session WHERE token_hash = @h AND expires_at > @n;');
    const row = (res.recordset || [])[0] as any;
    return row ? { email: String(row.email), role: String(row.role), issuedAt: new Date(row.issued_at).getTime(), expiresAt: new Date(row.expires_at).getTime() } : null;
  }
  async del(h: string): Promise<void> {
    const p = await this.conn();
    await p.request().input('h', this.sql.Char(64), h).query('DELETE FROM dbo.app_session WHERE token_hash = @h;');
  }
  async sweep(now: number): Promise<number> {
    const p = await this.conn();
    const res = await p.request().input('n', this.sql.DateTime2(3), new Date(now)).query('DELETE FROM dbo.app_session WHERE expires_at <= @n;');
    return (res.rowsAffected && res.rowsAffected[0]) || 0;
  }
}

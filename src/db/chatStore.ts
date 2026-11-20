/**
 * Phase 3 step 4 (v0.16.0) — chat owned by Azure SQL: table dbo.chat_message (one row per message, as the
 * Dashboard_Chat_Window sheet: time, e-mail, role, display name, message, class name).
 */
import type * as sqlTypes from 'mssql';

export interface ChatRow { id?: number; createdAt: number; email: string; role: string; name: string; message: string; className: string }
export interface ChatStamp { maxId: number; minId: number; count: number }
export interface ChatStore {
  /** Newest `limit` messages created after `sinceMs`, oldest first. */
  list(sinceMs: number, limit: number): Promise<ChatRow[]>;
  add(row: ChatRow): Promise<number>;
  addMany(rows: ChatRow[]): Promise<number>;
  prune(beforeMs: number): Promise<number>;
  stamp(sinceMs: number): Promise<ChatStamp>;
  total(): Promise<number>;
}

export class MemoryChatStore implements ChatStore {
  rows: ChatRow[] = []; private next = 1; failNext = false;
  private gate(): void { if (this.failNext) { this.failNext = false; throw new Error('memory chat failure'); } }
  async list(since: number, limit: number): Promise<ChatRow[]> { this.gate(); return this.rows.filter((r) => r.createdAt > since).slice(-limit).map((r) => ({ ...r })); }
  async add(row: ChatRow): Promise<number> { this.gate(); const id = this.next++; this.rows.push({ ...row, id }); return id; }
  async addMany(rows: ChatRow[]): Promise<number> { for (const r of rows) await this.add(r); return rows.length; }
  async prune(before: number): Promise<number> { this.gate(); const n = this.rows.length; this.rows = this.rows.filter((r) => r.createdAt >= before); return n - this.rows.length; }
  async stamp(since: number): Promise<ChatStamp> { this.gate(); const r = this.rows.filter((x) => x.createdAt > since); return { maxId: r.length ? r[r.length - 1].id! : 0, minId: r.length ? r[0].id! : 0, count: r.length }; }
  async total(): Promise<number> { this.gate(); return this.rows.length; }
}

export class MssqlChatStore implements ChatStore {
  private ready: Promise<void> | null = null;
  constructor(private pool: () => Promise<sqlTypes.ConnectionPool>, private sql: typeof sqlTypes = require('mssql')) {}
  private async conn(): Promise<sqlTypes.ConnectionPool> {
    const p = await this.pool();
    if (!this.ready) {
      this.ready = p.request().query(
        "IF OBJECT_ID(N'dbo.chat_message', N'U') IS NULL BEGIN CREATE TABLE dbo.chat_message (" +
        'id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_chat_message PRIMARY KEY, created_at DATETIME2(3) NOT NULL, ' +
        'email NVARCHAR(254) NOT NULL, role NVARCHAR(40) NOT NULL, name NVARCHAR(300) NOT NULL, message NVARCHAR(2000) NOT NULL, ' +
        'class_name NVARCHAR(2000) NOT NULL); CREATE INDEX IX_chat_message_created ON dbo.chat_message (created_at); END').then(() => undefined);
      this.ready.catch(() => { this.ready = null; });
    }
    await this.ready;
    return p;
  }
  private bind(r: sqlTypes.Request, row: ChatRow, i = ''): sqlTypes.Request {
    const S = this.sql;
    return r.input('t' + i, S.DateTime2(3), new Date(row.createdAt)).input('e' + i, S.NVarChar(254), row.email.slice(0, 254))
      .input('r' + i, S.NVarChar(40), row.role.slice(0, 40)).input('n' + i, S.NVarChar(300), row.name.slice(0, 300))
      .input('m' + i, S.NVarChar(2000), row.message.slice(0, 2000)).input('c' + i, S.NVarChar(2000), row.className.slice(0, 2000));
  }
  async list(since: number, limit: number): Promise<ChatRow[]> {
    const p = await this.conn(), S = this.sql;
    const res = await p.request().input('s', S.DateTime2(3), new Date(since)).input('k', S.Int, limit)
      .query('SELECT id, created_at, email, role, name, message, class_name FROM (SELECT TOP (@k) * FROM dbo.chat_message WHERE created_at > @s ORDER BY id DESC) x ORDER BY id ASC;');
    return ((res.recordset || []) as any[]).map((r) => ({ id: Number(r.id), createdAt: new Date(r.created_at).getTime(), email: String(r.email), role: String(r.role), name: String(r.name), message: String(r.message), className: String(r.class_name) }));
  }
  async add(row: ChatRow): Promise<number> {
    const p = await this.conn();
    const res = await this.bind(p.request(), row).query('INSERT INTO dbo.chat_message (created_at, email, role, name, message, class_name) OUTPUT INSERTED.id VALUES (@t, @e, @r, @n, @m, @c);');
    return Number(((res.recordset || [])[0] as any).id);
  }
  async addMany(rows: ChatRow[]): Promise<number> {
    const p = await this.conn();
    for (let i = 0; i < rows.length; i += 50) {
      const part = rows.slice(i, i + 50), req = p.request();
      part.forEach((r, j) => this.bind(req, r, String(j)));
      await req.query('INSERT INTO dbo.chat_message (created_at, email, role, name, message, class_name) VALUES ' + part.map((_r, j) => `(@t${j}, @e${j}, @r${j}, @n${j}, @m${j}, @c${j})`).join(', ') + ';');
    }
    return rows.length;
  }
  async prune(before: number): Promise<number> {
    const p = await this.conn();
    const res = await p.request().input('b', this.sql.DateTime2(3), new Date(before)).query('DELETE FROM dbo.chat_message WHERE created_at < @b;');
    return (res.rowsAffected && res.rowsAffected[0]) || 0;
  }
  async stamp(since: number): Promise<ChatStamp> {
    const p = await this.conn();
    const res = await p.request().input('s', this.sql.DateTime2(3), new Date(since)).query('SELECT MAX(id) AS mx, MIN(id) AS mn, COUNT(*) AS n FROM dbo.chat_message WHERE created_at > @s;');
    const r = ((res.recordset || [])[0] || {}) as any;
    return { maxId: Number(r.mx || 0), minId: Number(r.mn || 0), count: Number(r.n || 0) };
  }
  async total(): Promise<number> {
    const p = await this.conn();
    const res = await p.request().query('SELECT COUNT(*) AS n FROM dbo.chat_message;');
    return Number(((res.recordset || [])[0] as any).n || 0);
  }
}

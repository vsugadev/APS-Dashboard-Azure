/**
 * Phase 3 step 6 (v0.17.0) — settings copy in Azure SQL (dbo.live_props).
 *
 * Apps Script still OWNS the live settings (Script / User Properties: online now, last login, Live / TNIC / NTS, class status
 * overrides, toggles …): every dashboard visit on Apps Script reads and writes them many times a minute, and moving the owner
 * now would cost an Apps Script → Azure call per visit (over the UrlFetch daily quota). The owner moves at go-live
 * (Phase 6), when Apps Script stops serving people. Until then Azure keeps a COPY:
 *  - after a successful bridge snapshot, at most once a minute, the allow-listed snapshot is stored (one row);
 *  - after a restart while the bridge is failing, Azure starts from that copy (up to 30 minutes old) instead of showing
 *    nobody online and no class status;
 *  - at go-live this copy is the starting data of the Azure-owned settings.
 * Never stores a secret: only what the bridge allow-list already sends (src/live/allowlist.ts).
 */
import type * as sqlTypes from 'mssql';
import type { LiveProps } from '../live/liveSource';

export interface LiveCopy { props: LiveProps; at: number }
export interface LiveMirrorStore { save(props: LiveProps, at: number): Promise<void>; load(): Promise<LiveCopy | null> }

export const MIRROR_EVERY_MS = 60_000, MIRROR_MAX_AGE_MS = 30 * 60_000;

export class MemoryLiveMirror implements LiveMirrorStore {
  copy: LiveCopy | null = null; saves = 0; failNext = false;
  async save(props: LiveProps, at: number): Promise<void> { if (this.failNext) { this.failNext = false; throw new Error('mirror failure'); } this.saves++; this.copy = { props: JSON.parse(JSON.stringify(props)), at }; }
  async load(): Promise<LiveCopy | null> { return this.copy ? JSON.parse(JSON.stringify(this.copy)) : null; }
}

export class MssqlLiveMirror implements LiveMirrorStore {
  private ready: Promise<void> | null = null;
  constructor(private pool: () => Promise<sqlTypes.ConnectionPool>, private sql: typeof sqlTypes = require('mssql')) {}
  private async conn(): Promise<sqlTypes.ConnectionPool> {
    const p = await this.pool();
    if (!this.ready) {
      this.ready = p.request().query("IF OBJECT_ID(N'dbo.live_props', N'U') IS NULL CREATE TABLE dbo.live_props (source NVARCHAR(40) NOT NULL CONSTRAINT PK_live_props PRIMARY KEY, props NVARCHAR(MAX) NOT NULL, copied_at DATETIME2(3) NOT NULL);").then(() => undefined);
      this.ready.catch(() => { this.ready = null; });
    }
    await this.ready;
    return p;
  }
  async save(props: LiveProps, at: number): Promise<void> {
    const p = await this.conn(), S = this.sql;
    await p.request().input('j', S.NVarChar(S.MAX), JSON.stringify(props)).input('t', S.DateTime2(3), new Date(at))
      .query("MERGE dbo.live_props AS d USING (SELECT N'apps-script' AS source) AS s ON d.source = s.source WHEN MATCHED THEN UPDATE SET props = @j, copied_at = @t WHEN NOT MATCHED THEN INSERT (source, props, copied_at) VALUES (N'apps-script', @j, @t);");
  }
  async load(): Promise<LiveCopy | null> {
    const p = await this.conn();
    const r = await p.request().query("SELECT props, copied_at FROM dbo.live_props WHERE source = N'apps-script';");
    const row = (r.recordset || [])[0] as any;
    return row ? { props: JSON.parse(String(row.props)), at: new Date(row.copied_at).getTime() } : null;
  }
}

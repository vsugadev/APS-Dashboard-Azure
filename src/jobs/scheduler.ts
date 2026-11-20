/**
 * Phase 4 step 1 (v0.17.0) — jobs on Azure's timetable.
 *
 * Azure decides WHEN the repeating jobs run; the job itself still runs in Apps Script (signed bridge action "job",
 * AzureBridge.gs r137) until it is rewritten on Azure. Only jobs that decide for themselves what is due are moved here,
 * so a run at a slightly different minute changes nothing:
 *   apsWeeklyJobs (hourly — the 7 weekly jobs), amScheduler (hourly), processTemporaryTeacherAssignments (hourly),
 *   apsCoverageCleanup (30 min), processExamQuestionPaperAutoEmail (5 min).
 * Switch per job: app setting AZURE_JOBS = comma list of handler names, TOGETHER with Apps Script Script Property
 * APS_JOBS_ON_AZURE (same names). Apps Script refuses a job not listed there (NOT_ON_AZURE), and runs a listed job itself
 * again when Azure has not run it in time — a job never stops.
 *
 *  - One run per interval across all App Service instances: a lease row per job in Azure SQL (dbo.job_lease).
 *  - Every run is recorded in dbo.job_run (start, end, ok, a short summary) — the "matching runs" evidence for the gate.
 *  - Runs are server-to-server, so a long job (up to Apps Script's 6 minutes) is waited for; a Promise answer is collected.
 */
import { randomUUID } from 'crypto';
import type * as sqlTypes from 'mssql';
import { bridgeCall, type FetchLike } from '../live/liveSource';

export const JOB_CATALOG: { handler: string; everyMin: number; label: string }[] = [
  { handler: 'apsWeeklyJobs', everyMin: 60, label: 'Weekly jobs (backup, reports, appreciation, consolidation)' },
  { handler: 'amScheduler', everyMin: 60, label: 'Assignment Monitoring reminders' },
  { handler: 'processTemporaryTeacherAssignments', everyMin: 60, label: 'Temp Teacher add / remove' },
  { handler: 'apsCoverageCleanup', everyMin: 30, label: 'Class Coverage clean-up' },
  { handler: 'processExamQuestionPaperAutoEmail', everyMin: 5, label: 'Exam question paper auto-email' },
];
export const JOB_RUN_TIMEOUT_MS = 380_000, JOB_POLL_MS = 3000;

export interface JobRunRecord { handler: string; runId: string; startedAt: number; finishedAt: number; ok: boolean; summary: string }
export interface JobStore {
  /** Claims this job's current slot until `until` — true for exactly one caller per slot. */
  lease(handler: string, holder: string, now: number, until: number): Promise<boolean>;
  record(r: JobRunRecord): Promise<void>;
  lastStarted(handler: string): Promise<number>;
}

export function parseJobList(raw: string | undefined): { on: string[]; unknown: string[] } {
  const names = String(raw || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  const known = new Set(JOB_CATALOG.map((j) => j.handler));
  return { on: names.filter((n) => known.has(n)).filter((n, i, a) => a.indexOf(n) === i), unknown: names.filter((n) => !known.has(n)) };
}

export type JobRunner = (handler: string, runId: string) => Promise<{ ok: boolean; summary: string }>;

/** Runs one job in Apps Script through the bridge; waits for a Promise answer. Never throws. */
export function bridgeJobRunner(url: string, secret: string, fetchImpl: FetchLike = fetch as unknown as FetchLike,
  now: () => number = Date.now, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): JobRunner {
  return async (handler, runId) => {
    const deadline = now() + JOB_RUN_TIMEOUT_MS;
    try {
      let r: any = await bridgeCall(url, secret, { action: 'job', v: 1, handler, runId }, fetchImpl, Date.now, JOB_RUN_TIMEOUT_MS);
      while (r && typeof r.pending === 'string') {
        if (now() + JOB_POLL_MS > deadline) return { ok: false, summary: 'TIMEOUT (still running in Apps Script)' };
        await sleep(JOB_POLL_MS);
        const q: any = await bridgeCall(url, secret, { action: 'result', v: 1, job: r.pending, email: 'azure-job' }, fetchImpl, Date.now, 30_000);
        if (q && q.pending === true) continue;
        r = q;
      }
      if (r && typeof r.error === 'string') return { ok: false, summary: r.error.slice(0, 500) };
      return { ok: true, summary: String(r && r.value !== undefined ? r.value : '').slice(0, 1000) };
    } catch (e) {
      const code = String((e as Error).message || e).slice(0, 60);
      return { ok: false, summary: code === 'NOT_ON_AZURE' ? 'NOT_ON_AZURE — add it to Apps Script Script Property APS_JOBS_ON_AZURE' : code };
    }
  };
}

export class JobScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = new Set<string>();
  private last: Record<string, number> = {};
  readonly holder = randomUUID();
  constructor(private handlers: string[], private store: JobStore, private run: JobRunner,
    private now: () => number = Date.now, private log: (m: string) => void = console.log) {}

  /** One pass: every enabled job whose interval has passed is claimed (lease) and run. Returns the handlers started. */
  async tick(): Promise<string[]> {
    const started: string[] = [];
    for (const job of JOB_CATALOG) {
      if (this.handlers.indexOf(job.handler) < 0 || this.running.has(job.handler)) continue;
      const t = this.now(), every = job.everyMin * 60_000;
      try {
        if (this.last[job.handler] === undefined) this.last[job.handler] = await this.store.lastStarted(job.handler);
        if (t - this.last[job.handler] < every - 30_000) continue;
        if (!(await this.store.lease(job.handler, this.holder, t, t + every - 60_000))) { this.last[job.handler] = t; continue; } // another instance has this slot
      } catch (e) { this.log('[Jobs] ' + job.handler + ': timetable not available in Azure SQL (' + String((e as Error).message).slice(0, 80) + ') — skipped this minute.'); continue; }
      this.last[job.handler] = t; started.push(job.handler);
      void this.runOne(job.handler, t);
    }
    return started;
  }

  private async runOne(handler: string, t: number): Promise<void> {
    this.running.add(handler);
    const runId = randomUUID();
    try {
      const r = await this.run(handler, runId);
      const rec: JobRunRecord = { handler, runId, startedAt: t, finishedAt: this.now(), ok: r.ok, summary: r.summary };
      await this.store.record(rec).catch(() => undefined);
      this.log('[Jobs] ' + handler + ' ran on Azure\'s timetable: ' + (r.ok ? 'ok' : 'FAILED') + ' (' + Math.round((rec.finishedAt - t) / 1000) + ' s)' + (r.ok ? '' : ' — ' + r.summary.slice(0, 160)));
    } finally { this.running.delete(handler); }
  }

  start(everyMs = 60_000): void {
    if (this.timer || !this.handlers.length) return;
    this.log('[Jobs] on Azure\'s timetable: ' + this.handlers.join(', ') + ' (Apps Script must list the same names in APS_JOBS_ON_AZURE).');
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, everyMs);
    this.timer.unref?.();
  }
  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  isRunning(h: string): boolean { return this.running.has(h); }
}

export class MemoryJobStore implements JobStore {
  leases: Record<string, { holder: string; until: number }> = {}; runs: JobRunRecord[] = [];
  async lease(h: string, holder: string, now: number, until: number): Promise<boolean> {
    const l = this.leases[h];
    if (l && l.until > now && l.holder !== holder) return false;
    this.leases[h] = { holder, until }; return true;
  }
  async record(r: JobRunRecord): Promise<void> { this.runs.push({ ...r }); }
  async lastStarted(h: string): Promise<number> { const r = this.runs.filter((x) => x.handler === h); return r.length ? r[r.length - 1].startedAt : 0; }
}

export class MssqlJobStore implements JobStore {
  private ready: Promise<void> | null = null;
  constructor(private pool: () => Promise<sqlTypes.ConnectionPool>, private sql: typeof sqlTypes = require('mssql')) {}
  private async conn(): Promise<sqlTypes.ConnectionPool> {
    const p = await this.pool();
    if (!this.ready) {
      this.ready = p.request().query(
        "IF OBJECT_ID(N'dbo.job_lease', N'U') IS NULL CREATE TABLE dbo.job_lease (handler NVARCHAR(80) NOT NULL CONSTRAINT PK_job_lease PRIMARY KEY, holder CHAR(36) NOT NULL, until_at DATETIME2(3) NOT NULL); " +
        "IF OBJECT_ID(N'dbo.job_run', N'U') IS NULL BEGIN CREATE TABLE dbo.job_run (id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_job_run PRIMARY KEY, handler NVARCHAR(80) NOT NULL, run_id CHAR(36) NOT NULL, " +
        'started_at DATETIME2(3) NOT NULL, finished_at DATETIME2(3) NOT NULL, ok BIT NOT NULL, summary NVARCHAR(1000) NOT NULL); CREATE INDEX IX_job_run_handler ON dbo.job_run (handler, started_at); END').then(() => undefined);
      this.ready.catch(() => { this.ready = null; });
    }
    await this.ready;
    return p;
  }
  async lease(h: string, holder: string, now: number, until: number): Promise<boolean> {
    const p = await this.conn(), S = this.sql;
    const r = await p.request().input('h', S.NVarChar(80), h).input('o', S.Char(36), holder).input('n', S.DateTime2(3), new Date(now)).input('u', S.DateTime2(3), new Date(until))
      .query('UPDATE dbo.job_lease WITH (UPDLOCK, HOLDLOCK) SET holder = @o, until_at = @u WHERE handler = @h AND (until_at <= @n OR holder = @o); ' +
        'IF @@ROWCOUNT = 0 AND NOT EXISTS (SELECT 1 FROM dbo.job_lease WITH (UPDLOCK, HOLDLOCK) WHERE handler = @h) INSERT INTO dbo.job_lease (handler, holder, until_at) VALUES (@h, @o, @u); ' +
        'SELECT holder FROM dbo.job_lease WHERE handler = @h;');
    const row = ((r.recordset || [])[0] || {}) as any;
    return String(row.holder || '') === holder;
  }
  async record(r: JobRunRecord): Promise<void> {
    const p = await this.conn(), S = this.sql;
    await p.request().input('h', S.NVarChar(80), r.handler).input('r', S.Char(36), r.runId).input('s', S.DateTime2(3), new Date(r.startedAt))
      .input('f', S.DateTime2(3), new Date(r.finishedAt)).input('k', S.Bit, r.ok ? 1 : 0).input('m', S.NVarChar(1000), r.summary.slice(0, 1000))
      .query('INSERT INTO dbo.job_run (handler, run_id, started_at, finished_at, ok, summary) VALUES (@h, @r, @s, @f, @k, @m);');
  }
  async lastStarted(h: string): Promise<number> {
    const p = await this.conn();
    const r = await p.request().input('h', this.sql.NVarChar(80), h).query('SELECT MAX(started_at) AS t FROM dbo.job_run WHERE handler = @h;');
    const t = ((r.recordset || [])[0] || {}) as any;
    return t.t ? new Date(t.t).getTime() : 0;
  }
}

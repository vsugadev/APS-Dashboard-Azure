/**
 * Phase 4 step 4 (v0.20.0) — the first email job SENT BY AZURE: "Students Assigned to Multiple Google Classrooms"
 * (Code.gs weekly job MULTIPLE_CLASSROOM_REPORT, Monday from 7 AM America/New_York, one email to admin@).
 *
 *  - The email is built by the SAME Code.gs functions, copied word for word (admcBuild_, admcEmail_ — tools/gen-gas-scope.js
 *    feature mailJobs), over the same class list, and sent From donotreply@ by Azure (src/mail/gmailSender.ts).
 *  - Two modes (app setting AZURE_MAIL_JOBS = MULTIPLE_CLASSROOM_REPORT):
 *      PREVIEW (MAIL_JOBS_PREVIEW_TO = one APS address): Apps Script keeps sending the real email; Azure sends the same
 *        email ONCE per week to that address only, subject "[AZURE PREVIEW] …", so the two can be compared. Nothing is recorded.
 *      OWNER (no preview address): Azure sends the real email. Only when Apps Script says the job is switched off there
 *        (removeMultipleClassroomReportTrigger) and that week's email is not recorded yet — one owner, never twice.
 *  - Same timing as Code.gs wjRun_: the week's slot = Monday 07:00 New York; sent within 24 hours of it; at most 3 tries;
 *    skipped on a school leave day (apsLeaveSkip_, copied); a deploy after the window does not send a stale report.
 *  - Never twice: a row per job + week in Azure SQL dbo.mail_job is claimed (SENDING) before sending; a send that crashed
 *    half-way is NOT retried (UNKNOWN — check the inbox) rather than risk a second email.
 *  - Apps Script stays the record keeper (AzureBridge.gs r139, action mailJob): Azure records the result there
 *    (audit row + "last sent" property), retried until it succeeds.
 */
import type * as sqlTypes from 'mssql';
import type { AppContext } from '../app/context';
import { gasRun } from '../api/endpoints/classes';
import { bridgeCall, type FetchLike } from '../live/liveSource';
import type { GmailSender, MailMessage } from './gmailSender';

export interface MailJobDef { id: string; dow: number; hour: number; leave: string; label: string }
export const MAIL_JOB_CATALOG: MailJobDef[] = [
  { id: 'MULTIPLE_CLASSROOM_REPORT', dow: 1, hour: 7, leave: 'MULTIPLE_CLASSROOM_REPORT', label: 'Students in more than one classroom (admin@)' },
];
export const MAIL_JOB_WINDOW_MIN = 24 * 60, MAIL_JOB_MAX_ATTEMPTS = 3, MAIL_JOB_STUCK_MIN = 20;
export const PREVIEW_PREFIX = '[AZURE PREVIEW] ';

export function parseMailJobList(raw: string | undefined): { on: string[]; unknown: string[] } {
  const names = String(raw || '').split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  const known = new Set(MAIL_JOB_CATALOG.map((j) => j.id));
  return { on: names.filter((n) => known.has(n)).filter((n, i, a) => a.indexOf(n) === i), unknown: names.filter((n) => !known.has(n)) };
}

/* ---- New York time, as Code.gs wjNowParts_ / wjSlot_ ---- */
export function nyParts(now: Date): { date: string; hour: number; min: number; text: string } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p: Record<string, string> = {}; for (const x of f.formatToParts(now)) p[x.type] = x.value;
  const date = p.year + '-' + p.month + '-' + p.day, hour = Number(p.hour), min = Number(p.minute);
  return { date, hour, min, text: date + ' ' + p.hour + ':' + p.minute };
}
const shift = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
const minutesOf = (text: string) => Date.parse(text.replace(' ', 'T') + ':00Z') / 60_000;
/** The week's slot (its date = the period key, = admcRun_'s week Monday for a Monday job) and minutes since it started. */
export function slotOf(job: MailJobDef, now: Date): { date: string; sinceMin: number } {
  const p = nyParts(now), dow = new Date(p.date + 'T12:00:00Z').getUTCDay(), back = (dow - job.dow + 7) % 7;
  let date = shift(p.date, -back);
  if (back === 0 && p.hour < job.hour) date = shift(p.date, -7);
  const start = date + ' ' + String(job.hour).padStart(2, '0') + ':00';
  return { date, sinceMin: minutesOf(p.text) - minutesOf(start) };
}

/* ---- store: one row per job + period ---- */
export type MailJobStatus = 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN' | 'SKIPPED' | 'PREVIEW_SENT';
export interface MailJobRow { job: string; period: string; status: MailJobStatus; attempts: number; updatedAt: number; summary: string; recorded: boolean }
export interface MailJobStore {
  get(job: string, period: string): Promise<MailJobRow | null>;
  /** SENDING for exactly one caller: no row yet, or FAILED with attempts left. */
  claim(job: string, period: string, now: number, maxAttempts: number): Promise<boolean>;
  finish(job: string, period: string, status: MailJobStatus, summary: string, now: number, recorded?: boolean): Promise<void>;
  setRecorded(job: string, period: string): Promise<void>;
}

export class MemoryMailJobStore implements MailJobStore {
  rows = new Map<string, MailJobRow>();
  async get(j: string, p: string) { const r = this.rows.get(j + '|' + p); return r ? { ...r } : null; }
  async claim(j: string, p: string, now: number, max: number) {
    const k = j + '|' + p, r = this.rows.get(k);
    if (r && !(r.status === 'FAILED' && r.attempts < max)) return false;
    this.rows.set(k, { job: j, period: p, status: 'SENDING', attempts: (r ? r.attempts : 0) + 1, updatedAt: now, summary: '', recorded: false });
    return true;
  }
  async finish(j: string, p: string, status: MailJobStatus, summary: string, now: number, recorded = false) {
    const k = j + '|' + p, r = this.rows.get(k) || { job: j, period: p, attempts: 0 } as MailJobRow;
    this.rows.set(k, { ...r, status, summary, updatedAt: now, recorded });
  }
  async setRecorded(j: string, p: string) { const r = this.rows.get(j + '|' + p); if (r) r.recorded = true; }
}

export class MssqlMailJobStore implements MailJobStore {
  private ready: Promise<void> | null = null;
  constructor(private pool: () => Promise<sqlTypes.ConnectionPool>, private sql: typeof sqlTypes = require('mssql')) {}
  private async conn(): Promise<sqlTypes.ConnectionPool> {
    const p = await this.pool();
    if (!this.ready) {
      this.ready = p.request().query("IF OBJECT_ID(N'dbo.mail_job', N'U') IS NULL CREATE TABLE dbo.mail_job (job NVARCHAR(80) NOT NULL, period CHAR(10) NOT NULL, status VARCHAR(16) NOT NULL, " +
        'attempts INT NOT NULL, updated_at DATETIME2(3) NOT NULL, summary NVARCHAR(500) NOT NULL, recorded BIT NOT NULL, CONSTRAINT PK_mail_job PRIMARY KEY (job, period));').then(() => undefined);
      this.ready.catch(() => { this.ready = null; });
    }
    await this.ready;
    return p;
  }
  private row(r: any): MailJobRow { return { job: r.job, period: r.period, status: r.status, attempts: r.attempts, updatedAt: new Date(r.updated_at).getTime(), summary: r.summary, recorded: !!r.recorded }; }
  async get(j: string, p: string) {
    const c = await this.conn();
    const r = await c.request().input('j', this.sql.NVarChar(80), j).input('p', this.sql.Char(10), p).query('SELECT * FROM dbo.mail_job WHERE job = @j AND period = @p;');
    const x = (r.recordset || [])[0]; return x ? this.row(x) : null;
  }
  async claim(j: string, p: string, now: number, max: number) {
    const c = await this.conn(), S = this.sql;
    try {
      const r = await c.request().input('j', S.NVarChar(80), j).input('p', S.Char(10), p).input('n', S.DateTime2(3), new Date(now)).input('m', S.Int, max)
        .query("DECLARE @won INT = 0; " +
          "UPDATE dbo.mail_job SET status = 'SENDING', attempts = attempts + 1, updated_at = @n, summary = N'', recorded = 0 WHERE job = @j AND period = @p AND status = 'FAILED' AND attempts < @m; SET @won = @@ROWCOUNT; " +
          "IF @won = 0 AND NOT EXISTS (SELECT 1 FROM dbo.mail_job WHERE job = @j AND period = @p) BEGIN INSERT INTO dbo.mail_job (job, period, status, attempts, updated_at, summary, recorded) VALUES (@j, @p, 'SENDING', 1, @n, N'', 0); SET @won = 1; END " +
          'SELECT @won AS won;');
      return ((r.recordset || [])[0] || {}).won === 1;
    } catch (e) {
      if ((e as any) && ((e as any).number === 2627 || (e as any).number === 2601)) return false; // another instance inserted the same row first
      throw e;
    }
  }
  async finish(j: string, p: string, status: MailJobStatus, summary: string, now: number, recorded = false) {
    const c = await this.conn(), S = this.sql;
    await c.request().input('j', S.NVarChar(80), j).input('p', S.Char(10), p).input('s', S.VarChar(16), status).input('m', S.NVarChar(500), summary.slice(0, 500)).input('n', S.DateTime2(3), new Date(now)).input('r', S.Bit, recorded ? 1 : 0)
      .query('UPDATE dbo.mail_job SET status = @s, summary = @m, updated_at = @n, recorded = @r WHERE job = @j AND period = @p; ' +
        'IF @@ROWCOUNT = 0 INSERT INTO dbo.mail_job (job, period, status, attempts, updated_at, summary, recorded) VALUES (@j, @p, @s, 0, @n, @m, @r);');
  }
  async setRecorded(j: string, p: string) {
    const c = await this.conn();
    await c.request().input('j', this.sql.NVarChar(80), j).input('p', this.sql.Char(10), p).query('UPDATE dbo.mail_job SET recorded = 1 WHERE job = @j AND period = @p;');
  }
}

/* ---- what a job needs from the outside (replaceable in tests) ---- */
export interface BuiltEmail { message: MailMessage; students: number; review: number; leaveSkip: boolean }
export interface MailJobDeps {
  build(job: MailJobDef, now: Date): Promise<BuiltEmail>;
  check(job: MailJobDef, period: string): Promise<{ sent: boolean; offHere: boolean }>;
  record(job: MailJobDef, period: string, r: { sent: boolean; students: number; review: number; error: string; at: number }): Promise<void>;
}

/** The real dependencies: copied Code.gs (build) and the signed bridge to Apps Script (check / record). */
export function liveMailJobDeps(ctx: AppContext, fetchImpl: FetchLike = fetch as unknown as FetchLike): MailJobDeps {
  const url = ctx.cfg.appsScriptBridgeUrl, secret = ctx.cfg.appsScriptBridgeSecret;
  return {
    async build(job, now) {
      if (job.id !== 'MULTIPLE_CLASSROOM_REPORT') throw new Error('unknown job');
      return gasRun(ctx, null, (S) => {
        const leaveSkip = !!S.apsLeaveSkip_(job.leave, now);
        const rep = S.admcBuild_(), admin = S.attMailAdminCc_(), when = S.srmFmt_(now.toISOString());
        const m = S.admcEmail_(rep, when); // same call as Code.gs admcRun_
        return { leaveSkip, students: rep.students.length, review: rep.review,
          message: { to: [admin], cc: [], replyTo: admin, subject: String(m.subject), html: String(m.html), text: String(m.text) } };
      });
    },
    async check(job, period) {
      const r = await bridgeCall(url, secret, { action: 'mailJob', v: 1, op: 'check', job: job.id, period }, fetchImpl, Date.now, 30_000);
      return { sent: !!(r && r.sent), offHere: !!(r && r.offHere) };
    },
    async record(job, period, x) {
      await bridgeCall(url, secret, { action: 'mailJob', v: 1, op: 'record', job: job.id, period, sent: x.sent, students: x.students, review: x.review, error: x.error.slice(0, 300), at: x.at }, fetchImpl, Date.now, 60_000);
    },
  };
}

export class MailJobRunner {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private doneMemo = new Set<string>(); // job|period|mode known finished — no database read until the next week
  private lastLog: Record<string, string> = {};
  constructor(private jobs: string[], private store: MailJobStore, private sender: GmailSender, private deps: MailJobDeps,
    private previewTo: string, private now: () => Date = () => new Date(), private log: (m: string) => void = console.log) {}

  mode(): 'PREVIEW' | 'OWNER' { return this.previewTo ? 'PREVIEW' : 'OWNER'; }
  private once(key: string, msg: string): void { if (this.lastLog[key] !== msg) { this.lastLog[key] = msg; this.log(msg); } }

  /** One pass over the enabled jobs. Returns what happened per job (tests / log). */
  async tick(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    if (this.busy) return out;
    this.busy = true;
    try {
      for (const job of MAIL_JOB_CATALOG) {
        if (this.jobs.indexOf(job.id) < 0) continue;
        try { out[job.id] = this.mode() === 'PREVIEW' ? await this.preview(job) : await this.own(job); }
        catch (e) { out[job.id] = 'ERROR'; this.once(job.id + ':err', '[MailJobs] ' + job.id + ': ' + String((e as Error).message || e).slice(0, 120) + ' — tried again in 10 minutes.'); }
      }
    } finally { this.busy = false; }
    return out;
  }

  private async preview(job: MailJobDef): Promise<string> {
    const now = this.now(), sl = slotOf(job, now), id = job.id + ':PREVIEW', memo = id + '|' + sl.date;
    if (sl.sinceMin < 0 || this.doneMemo.has(memo)) return 'WAIT';
    const row = await this.store.get(id, sl.date);
    if (row && (row.status === 'PREVIEW_SENT' || row.attempts >= MAIL_JOB_MAX_ATTEMPTS)) { this.doneMemo.add(memo); return 'DONE'; }
    if (!(await this.store.claim(id, sl.date, now.getTime(), MAIL_JOB_MAX_ATTEMPTS))) return 'DONE';
    const b = await this.deps.build(job, now).catch(async (e) => { await this.store.finish(id, sl.date, 'FAILED', 'build: ' + String((e as Error).message).slice(0, 200), this.now().getTime()); throw e; });
    const m: MailMessage = { ...b.message, to: [this.previewTo], cc: [], bcc: [], replyTo: this.previewTo, subject: PREVIEW_PREFIX + b.message.subject };
    const r = await this.sender.send(m);
    await this.store.finish(id, sl.date, r.ok ? 'PREVIEW_SENT' : 'FAILED', r.ok ? b.students + ' students, ' + b.review + ' review' : String(r.error || 'not sent'), this.now().getTime());
    this.log('[MailJobs] ' + job.id + ' week ' + sl.date + ': PREVIEW ' + (r.ok ? 'sent to ' + this.previewTo + ' (' + b.students + ' students, ' + b.review + ' require review) — compare it with the Apps Script email to admin@' : 'FAILED — ' + r.error) + '.');
    return r.ok ? 'PREVIEW_SENT' : 'FAILED';
  }

  private async own(job: MailJobDef): Promise<string> {
    const now = this.now(), sl = slotOf(job, now), memo = job.id + '|' + sl.date;
    if (sl.sinceMin < 0) return 'WAIT';
    if (this.doneMemo.has(memo)) return 'DONE';
    let row = await this.store.get(job.id, sl.date);
    if (row && (row.status === 'SENT' || row.status === 'FAILED') && !row.recorded) { await this.recordNow(job, sl.date, row); row = await this.store.get(job.id, sl.date); }
    if (row && row.status === 'SENDING') {
      if (now.getTime() - row.updatedAt > MAIL_JOB_STUCK_MIN * 60_000) {
        await this.store.finish(job.id, sl.date, 'UNKNOWN', 'a send was interrupted — not sent again; check whether admin@ got it', now.getTime());
        this.log('[MailJobs] ' + job.id + ' week ' + sl.date + ': a send was interrupted; NOT sent again (a second email is worse than none). Check admin@\'s inbox; to send now run sendMultipleClassroomReportNow in Apps Script.');
        this.doneMemo.add(memo); return 'UNKNOWN';
      }
      return 'BUSY';
    }
    if (row && (row.status !== 'FAILED' || row.attempts >= MAIL_JOB_MAX_ATTEMPTS) && row.recorded) { this.doneMemo.add(memo); return 'DONE'; }
    if (row && (row.status !== 'FAILED' || row.attempts >= MAIL_JOB_MAX_ATTEMPTS)) return 'RECORD_PENDING';
    if (sl.sinceMin > MAIL_JOB_WINDOW_MIN) { this.doneMemo.add(memo); return 'MISSED_WINDOW'; }

    const chk = await this.deps.check(job, sl.date);
    if (!chk.offHere) { this.once(job.id + ':owner', '[MailJobs] ' + job.id + ' is still ON in Apps Script — Azure does NOT send it. Run removeMultipleClassroomReportTrigger in Apps Script to make Azure the sender (one owner).'); return 'APPS_SCRIPT_OWNS'; }
    if (chk.sent) { await this.store.finish(job.id, sl.date, 'SKIPPED', 'already sent by Apps Script this week', now.getTime(), true); this.doneMemo.add(memo); return 'ALREADY_SENT'; }
    if (!(await this.store.claim(job.id, sl.date, now.getTime(), MAIL_JOB_MAX_ATTEMPTS))) return 'BUSY';

    let b: BuiltEmail;
    try { b = await this.deps.build(job, now); }
    catch (e) { await this.store.finish(job.id, sl.date, 'FAILED', 'build: ' + String((e as Error).message).slice(0, 200), this.now().getTime(), true); throw e; }
    if (b.leaveSkip) {
      await this.store.finish(job.id, sl.date, 'SKIPPED', 'SKIPPED_SCHOOL_LEAVE', this.now().getTime(), true);
      this.log('[MailJobs] ' + job.id + ' week ' + sl.date + ': skipped (school leave), as in Apps Script.');
      this.doneMemo.add(memo); return 'SKIPPED_SCHOOL_LEAVE';
    }
    const r = await this.sender.send(b.message);
    const at = this.now().getTime();
    await this.store.finish(job.id, sl.date, r.ok ? 'SENT' : 'FAILED', r.ok ? b.students + ' students, ' + b.review + ' review' : String(r.error || 'not sent').slice(0, 300), at);
    this.log('[MailJobs] ' + job.id + ' week ' + sl.date + ': email ' + (r.ok ? 'sent by Azure to admin@ (' + b.students + ' students, ' + b.review + ' require review)' : 'FAILED — ' + r.error) + '.');
    const rec = await this.store.get(job.id, sl.date);
    if (rec) await this.recordNow(job, sl.date, rec, { students: b.students, review: b.review, at });
    return r.ok ? 'SENT' : 'FAILED';
  }

  /** Tells Apps Script (audit row + "last sent"). Failure is retried on the next pass; it never re-sends. */
  private async recordNow(job: MailJobDef, period: string, row: MailJobRow, x?: { students: number; review: number; at: number }): Promise<void> {
    const sent = row.status === 'SENT';
    const m = /^(\d+) students, (\d+) review$/.exec(row.summary) || [];
    try {
      await this.deps.record(job, period, { sent, students: x ? x.students : Number(m[1] || 0), review: x ? x.review : Number(m[2] || 0), error: sent ? '' : row.summary, at: x ? x.at : row.updatedAt });
      await this.store.setRecorded(job.id, period);
    } catch (e) { this.once(job.id + ':rec', '[MailJobs] ' + job.id + ' week ' + period + ': result not recorded in Apps Script yet (' + String((e as Error).message).slice(0, 40) + ') — retried in 10 minutes.'); }
  }

  start(everyMs = 10 * 60_000): void {
    if (this.timer || !this.jobs.length) return;
    this.log('[MailJobs] ' + this.jobs.join(', ') + ' on Azure — ' + (this.mode() === 'PREVIEW' ? 'PREVIEW to ' + this.previewTo + ' (Apps Script still sends the real email)' : 'Azure SENDS the email when Apps Script has the job switched off') + '.');
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, everyMs);
    this.timer.unref?.();
  }
  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}

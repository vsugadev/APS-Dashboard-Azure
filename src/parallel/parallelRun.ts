/**
 * Phase 6 (v0.21.0) — the PARALLEL RUN kit. Apps Script stays the official dashboard; a chosen group uses the Azure
 * dashboard side by side and reports every difference.
 *
 *  - Who may use Azure during the run: app setting PARALLEL_RUN_USERS = e-mails and/or role names
 *    (e.g. "admin, superadmin, headmaster, teacher_x@avvaiyarpadasalai.org"). Empty = everyone who may sign in (as before).
 *    Checked on the server at sign-in AND on every call (a session made before the list changed stops at once).
 *  - PARALLEL_RUN=on: every Azure page shows a small bar "Test run — the official dashboard is still <link>" with a
 *    "Report a difference" button (public/aps-parallel.js). Dashboard.html itself is not changed.
 *  - Reports: endpoint azureReportDifference(token, { text, screen }) → Azure SQL dbo.parallel_feedback (who, role, when,
 *    screen, text) + one log line. Server-side: session required, 2000 characters, 30 per person per day.
 *  - Readiness: one "[ParallelRun]" block in the log ~90 s after start (and daily) — every module OK / CHECK with the fix.
 */
import type * as sqlTypes from 'mssql';
import type { AppContext } from '../app/context';
import type { AppConfig } from '../config';
import type { Registry } from '../api/registry';
import { requireSession } from '../app/context';

export { PR_NOT_IN_GROUP_MSG, parseParallelUsers, inParallelGroup } from './group';
import { parseParallelUsers } from './group';
export const PR_MAX_TEXT = 2000, PR_MAX_PER_DAY = 30;

export interface FeedbackRow { at: number; email: string; role: string; screen: string; text: string; userAgent: string }
export interface FeedbackStore { add(r: FeedbackRow): Promise<number>; }
export class MemoryFeedbackStore implements FeedbackStore { rows: FeedbackRow[] = []; async add(r: FeedbackRow) { this.rows.push({ ...r }); return this.rows.length; } }
export class MssqlFeedbackStore implements FeedbackStore {
  private ready: Promise<void> | null = null;
  constructor(private pool: () => Promise<sqlTypes.ConnectionPool>, private sql: typeof sqlTypes = require('mssql')) {}
  async add(r: FeedbackRow): Promise<number> {
    const p = await this.pool(), S = this.sql;
    if (!this.ready) {
      this.ready = p.request().query("IF OBJECT_ID(N'dbo.parallel_feedback', N'U') IS NULL CREATE TABLE dbo.parallel_feedback (id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_parallel_feedback PRIMARY KEY, " +
        'created_at DATETIME2(3) NOT NULL, email NVARCHAR(200) NOT NULL, role NVARCHAR(40) NOT NULL, screen NVARCHAR(200) NOT NULL, text NVARCHAR(2000) NOT NULL, user_agent NVARCHAR(300) NOT NULL, status NVARCHAR(20) NOT NULL CONSTRAINT DF_pf_status DEFAULT N\'NEW\');').then(() => undefined);
      this.ready.catch(() => { this.ready = null; });
    }
    await this.ready;
    const q = await p.request().input('a', S.DateTime2(3), new Date(r.at)).input('e', S.NVarChar(200), r.email).input('r', S.NVarChar(40), r.role).input('s', S.NVarChar(200), r.screen)
      .input('t', S.NVarChar(2000), r.text).input('u', S.NVarChar(300), r.userAgent)
      .query('INSERT INTO dbo.parallel_feedback (created_at, email, role, screen, text, user_agent) OUTPUT INSERTED.id VALUES (@a, @e, @r, @s, @t, @u);');
    return Number(((q.recordset || [])[0] || {}).id || 0);
  }
}

const clean = (s: unknown, n: number) => String(s === null || s === undefined ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

/** azureReportDifference(token, { text, screen, userAgent }) — any signed-in person in the group. */
export function registerParallelRun(reg: Registry, now: () => number = Date.now, log: (m: string) => void = console.log): void {
  const perDay = new Map<string, { day: string; n: number }>();
  reg.register('azureReportDifference', async (ctx: AppContext, [token, input]) => {
    const s = await requireSession(ctx, token);
    const st = ctx.feedback || null;
    if (!st) throw new Error('Reporting is not available right now. Please tell the APS admin team directly.');
    const x = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const text = clean(x.text, PR_MAX_TEXT);
    if (text.length < 5) throw new Error('Please describe the difference (at least a few words).');
    const day = new Date(now()).toISOString().slice(0, 10), k = s.email, c = perDay.get(k);
    const used = c && c.day === day ? c.n : 0;
    if (used >= PR_MAX_PER_DAY) throw new Error('You have sent ' + PR_MAX_PER_DAY + ' reports today — thank you! Please send more tomorrow, or tell the APS admin team directly.');
    perDay.set(k, { day, n: used + 1 });
    const id = await st.add({ at: now(), email: s.email, role: s.role, screen: clean(x.screen, 200) || '(not given)', text, userAgent: clean(x.userAgent, 300) });
    log('[ParallelRun] difference #' + id + ' reported by ' + s.email + ' (' + s.role + ') on "' + (clean(x.screen, 60) || '?') + '"');
    return { ok: true, id };
  });
}

/* ---- readiness ---- */
export interface ReadinessFacts {
  googleOk: boolean | null; bridgeOk: boolean; sessionsSql: boolean; chatReady: boolean | null; classLiveError: string | null;
  jobs: string[]; mailOk: boolean | null; mailJobs: string[]; mailJobsPreview: boolean; dbCopy: string[]; dbReads: string[]; feedbackReady: boolean;
}
export function readinessLines(cfg: AppConfig, f: ReadinessFacts): string[] {
  const L: string[] = [], ok = (b: boolean, what: string, fix = '') => L.push((b ? 'OK     ' : 'CHECK  ') + what + (b || !fix ? '' : ' — ' + fix));
  ok(f.googleOk === true, 'Google sign-in data (Sheet readable)', 'see the [Google] line above');
  ok(f.bridgeOk, 'Apps Script bridge (live data, saves, jobs)', 'see the [Live] line above');
  ok(f.sessionsSql, 'Lasting sign-ins in Azure SQL', 'set SQL_SERVER + SQL_DATABASE');
  ok(cfg.scOwner === 'azure', 'Special Classes owned by Azure SQL', 'optional: SC_OWNER=azure (+ Apps Script SPECIAL_CLASSES_OWNER)');
  ok(cfg.chatOwner === 'azure' && f.chatReady === true, 'Chat owned by Azure SQL', cfg.chatOwner === 'azure' ? 'chat table not ready — see the [Chat] line' : 'optional: CHAT_OWNER=azure on both sides');
  ok(cfg.classLiveEnabled && !f.classLiveError, 'Live Google Meet class status', f.classLiveError ? 'Apps Script answered ' + f.classLiveError : 'AZURE_CLASS_LIVE is off');
  ok(f.jobs.length > 0, 'Jobs on Azure\'s timetable: ' + (f.jobs.join(', ') || 'none'), 'optional: AZURE_JOBS (+ APS_JOBS_ON_AZURE)');
  ok(f.mailOk === true, 'Email From donotreply@ by Azure', cfg.mailEnabled ? 'see the [Mail] line' : 'AZURE_MAIL is not on');
  ok(f.mailJobs.length > 0, 'Email jobs on Azure: ' + (f.mailJobs.join(', ') || 'none') + (f.mailJobsPreview ? ' (PREVIEW)' : ''), 'optional: AZURE_MAIL_JOBS');
  ok(f.dbCopy.length > 0, 'Spreadsheet copies in Azure SQL: ' + (f.dbCopy.join(', ') || 'none') + (f.dbReads.length ? '; reads from the copy: ' + f.dbReads.join(', ') : ''), 'optional: DB_COPY');
  const g = parseParallelUsers(cfg.parallelRunUsers);
  ok(cfg.parallelRunOn, 'Test-run bar + "Report a difference"', 'set PARALLEL_RUN=on');
  ok(g.emails.size + g.roles.size > 0, 'Test group: ' + (g.emails.size + g.roles.size ? [...g.roles].join(', ') + (g.roles.size && g.emails.size ? ', ' : '') + (g.emails.size ? g.emails.size + ' named person(s)' : '') : 'EVERYONE can sign in'), 'set PARALLEL_RUN_USERS to limit the test group');
  ok(f.feedbackReady, 'Difference reports stored (dbo.parallel_feedback)', 'needs Azure SQL');
  return L;
}

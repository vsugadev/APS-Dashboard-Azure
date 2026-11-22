/**
 * Parallel run (v0.22.0) — SHADOW COMPARISON of real requests: Existing (Apps Script) vs Azure, same person, same input.
 *
 * After Azure has answered a read screen for a person (the answer is already on its way to the browser — no delay), a
 * sample of those calls is also run in Apps Script through the signed bridge (action "call" with shadow:true; AzureBridge.gs
 * r140 allows ONLY the functions in SHADOW_FNS there, and Apps Script decides the role itself). The two answers are compared:
 *   MATCH · DIFFERENT (paths that differ) · ERROR (one side failed) — and each side's time (performance comparison).
 *  - A difference is checked again 90 s later (both sides again); only a difference that PERSISTS is reported
 *    (copy refresh / cache timing is not a migration error).
 *  - SHADOW_FNS = read screens Azure answers itself whose Code.gs code has NO side effects beyond the idempotent ones a normal
 *    visit has (tools: transitive check of Code.gs; see docs/CUTOVER.md §5). Not included: getDashboardData, the realtime
 *    check, getDirectoryIndex (they write caches / triggers), screens using Google profile names, getDashboardRolePermissions
 *    (Azure's role permissions are in Key Vault on purpose).
 *  - Off unless SHADOW_SAMPLE (percent, 1–100) is set; only for people in the test group; at most one comparison per function
 *    per 2 minutes, 2 at a time, SHADOW_DAILY_CAP (default 400) per day — Apps Script load stays small.
 *  - Stored: dbo.shadow_compare (when, function, e-mail, role, result, both times, number of differences, up to 15 differing
 *    PATHS with the kind of difference — never the values). Log: one line per confirmed difference + an hourly summary.
 */
import type * as sqlTypes from 'mssql';
import type { AppContext } from '../app/context';
import type { Registry } from '../api/registry';
import { bridgeCall, type FetchLike } from '../live/liveSource';

export const SHADOW_FNS = ['getAccessControl', 'getAccessControlHistory', 'getAdminAssignmentAuditLog', 'getAdminClassroomAssignments', 'getAppreciationLetterAudit',
  'getAssignmentHealthCard', 'getAssignmentMonitoring', 'getAssignmentMonitoringClass', 'getAssignmentMonitoringHistory', 'getAttendanceAuditLog', 'getAttendanceCourseAwkMap',
  'getAttendanceLastSyncInfo', 'getAttendanceRecordsForViewer', 'getAttendanceSyncDiagnostics', 'getAttendanceWeekOptions', 'getAuthorizedEmailsForGroupSync', 'getCacheSheetUrl',
  'getClassChangeContext', 'getClassChangeRequestsForApprover', 'getClassCoverageHistory', 'getClassCoverageTracking', 'getCourseMeetLinkMappings', 'getCourseNameSuffix',
  'getCoverageBootstrap', 'getCoveragePlan', 'getDashboardUserRoles', 'getExamQuestionPaperAuditLog', 'getExamQuestionPaperPublishPreview', 'getExaminationHistory',
  'getGradeChangeApproverInfo', 'getGradeChangeTimingOptions', 'getKnowledgeBaseVideos', 'getLastSyncError', 'getLastSyncInfo', 'getMyClassChangeRequests', 'getMyCountryPreference',
  'getMyReferenceLetterRequests', 'getOnCallTeacherAttendance', 'getReferenceLetterAccessInfo', 'getReferenceLetterRequestsForApprover', 'getRemovalContext', 'getSchoolLeaveAdminData',
  'getSchoolLeaveHistory', 'getShowContactPhone', 'getSpecialClassEnrollments', 'getSpecialClasses', 'getSpecialClassesAdmin', 'getStudentLoginNoticeStatus',
  'getTeacherAppreciationAdminReport', 'getTeacherAppreciationEmailPreview', 'getTeacherAppreciationHistory', 'getTicket', 'getTicketBootstrap', 'getTicketReports', 'getTicketSettings',
  'getUserCountryAdmin', 'getZohoSyncHistory', 'getZohoSyncJob', 'listTickets', 'previewMissingGrading', 'previewTeacherAppreciation', 'searchTamilThadamStudents', 'searchTicketStudents'];

export const SHADOW_VOLATILE_RE = /^(generatedAt|generated|serverTime|serverNow|now|nowMs|fetchedAt|asOf|cachedAt|cacheAge|elapsedMs|tookMs|ms)$/i;
export const SHADOW_THROTTLE_MS = 120_000, SHADOW_CONFIRM_MS = 90_000, SHADOW_MAX_PATHS = 15;

export interface Diff { path: string; kind: string }
/** Paths where a and b differ (values are never returned). Volatile keys and `ignore` paths are skipped. */
export function diffJson(a: unknown, b: unknown, ignore: RegExp | null = null, path = '$', out: Diff[] = [], limit = 200): Diff[] {
  if (out.length >= limit) return out;
  if (ignore && ignore.test(path)) return out;
  const ta = a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a, tb = b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b;
  if (ta !== tb) { out.push({ path, kind: 'type ' + ta + '≠' + tb }); return out; }
  if (ta === 'array') {
    const x = a as unknown[], y = b as unknown[];
    if (x.length !== y.length) out.push({ path, kind: 'length ' + x.length + '≠' + y.length });
    for (let i = 0; i < Math.min(x.length, y.length); i++) diffJson(x[i], y[i], ignore, path + '[' + i + ']', out, limit);
    return out;
  }
  if (ta === 'object') {
    const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (SHADOW_VOLATILE_RE.test(k)) continue;
      const p = path + '.' + k;
      if (!(k in y)) { if (!(ignore && ignore.test(p))) out.push({ path: p, kind: 'only in Apps Script' }); }
      else if (!(k in x)) { if (!(ignore && ignore.test(p))) out.push({ path: p, kind: 'only in Azure' }); }
      else diffJson(x[k], y[k], ignore, p, out, limit);
    }
    return out;
  }
  if (a !== b) out.push({ path, kind: 'value' });
  return out;
}
/** Array indexes collapsed so the same difference on every row is counted once ("$.rows[*].status"). */
export const pathPattern = (p: string) => p.replace(/\[\d+\]/g, '[*]');

const noEmails = (s: string) => s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>').slice(0, 200);

export interface ShadowRecord { at: number; fn: string; email: string; role: string; result: 'MATCH' | 'DIFFERENT' | 'ERROR'; azureMs: number; gasMs: number; diffs: number; paths: Diff[]; note: string }
export interface ShadowStore { add(r: ShadowRecord): Promise<void> }
export class MemoryShadowStore implements ShadowStore { rows: ShadowRecord[] = []; async add(r: ShadowRecord) { this.rows.push(JSON.parse(JSON.stringify(r))); } }
export class MssqlShadowStore implements ShadowStore {
  private ready: Promise<void> | null = null;
  constructor(private pool: () => Promise<sqlTypes.ConnectionPool>, private sql: typeof sqlTypes = require('mssql')) {}
  async add(r: ShadowRecord): Promise<void> {
    const p = await this.pool(), S = this.sql;
    if (!this.ready) {
      this.ready = p.request().query("IF OBJECT_ID(N'dbo.shadow_compare', N'U') IS NULL BEGIN CREATE TABLE dbo.shadow_compare (id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_shadow_compare PRIMARY KEY, " +
        'compared_at DATETIME2(3) NOT NULL, fn NVARCHAR(80) NOT NULL, email NVARCHAR(200) NOT NULL, role NVARCHAR(40) NOT NULL, result VARCHAR(10) NOT NULL, azure_ms INT NOT NULL, apps_script_ms INT NOT NULL, ' +
        "diffs INT NOT NULL, paths NVARCHAR(2000) NOT NULL, note NVARCHAR(300) NOT NULL, status NVARCHAR(20) NOT NULL CONSTRAINT DF_shadow_status DEFAULT N'NEW'); CREATE INDEX IX_shadow_compare_at ON dbo.shadow_compare (compared_at); END").then(() => undefined);
      this.ready.catch(() => { this.ready = null; });
    }
    await this.ready;
    await p.request().input('a', S.DateTime2(3), new Date(r.at)).input('f', S.NVarChar(80), r.fn).input('e', S.NVarChar(200), r.email).input('r', S.NVarChar(40), r.role)
      .input('x', S.VarChar(10), r.result).input('am', S.Int, Math.round(r.azureMs)).input('gm', S.Int, Math.round(r.gasMs)).input('d', S.Int, r.diffs)
      .input('p', S.NVarChar(2000), JSON.stringify(r.paths).slice(0, 2000)).input('n', S.NVarChar(300), r.note.slice(0, 300))
      .query('INSERT INTO dbo.shadow_compare (compared_at, fn, email, role, result, azure_ms, apps_script_ms, diffs, paths, note) VALUES (@a, @f, @e, @r, @x, @am, @gm, @d, @p, @n);');
  }
}

export type AppsScriptRunner = (fn: string, args: unknown[], email: string) => Promise<{ ok: unknown } | { err: string } | { pending: true }>;
export function bridgeAppsScriptRunner(url: string, secret: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): AppsScriptRunner {
  return async (fn, args, email) => {
    try {
      const r: any = await bridgeCall(url, secret, { action: 'call', v: 1, fn, args, email, shadow: true }, fetchImpl, Date.now, 60_000);
      if (r && typeof r.pending === 'string') return { pending: true };
      if (r && typeof r.error === 'string') return { err: r.error };
      return { ok: r ? r.value : null };
    } catch (e) { return { err: 'BRIDGE ' + String((e as Error).message || e).slice(0, 60) }; }
  };
}

export class ShadowComparer {
  private lastByFn = new Map<string, number>();
  private running = 0;
  private day = ''; private dayCount = 0;
  private hour = { compared: 0, match: 0, different: 0, error: 0, azureMs: 0, gasMs: 0 };
  private timer: NodeJS.Timeout | null = null;
  constructor(private reg: Registry, private runGas: AppsScriptRunner, private store: ShadowStore | null, private opts: { samplePct: number; dailyCap: number; ignore: RegExp | null },
    private now: () => number = Date.now, private random: () => number = Math.random, private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private log: (m: string) => void = console.log) {}

  /** Registry observer: decides quickly whether to compare; the comparison itself runs in the background. */
  observe = (ctx: AppContext, name: string, args: unknown[], out: { ok: unknown } | { err: string }, ms: number): void => {
    if (SHADOW_FNS.indexOf(name) < 0 || this.opts.samplePct <= 0 || typeof args[0] !== 'string') return;
    const t = this.now(), day = new Date(t).toISOString().slice(0, 10);
    if (day !== this.day) { this.day = day; this.dayCount = 0; }
    if (this.dayCount >= this.opts.dailyCap || this.running >= 2 || t - (this.lastByFn.get(name) || 0) < SHADOW_THROTTLE_MS || this.random() * 100 >= this.opts.samplePct) return;
    this.lastByFn.set(name, t); this.dayCount++; this.running++;
    void this.compare(ctx, name, args, out, ms).catch((e) => this.log('[Shadow] ' + name + ': comparison failed (' + String((e as Error).message).slice(0, 80) + ')')).finally(() => { this.running--; });
  };

  async compare(ctx: AppContext, name: string, args: unknown[], azureOut: { ok: unknown } | { err: string }, azureMs: number): Promise<ShadowRecord | null> {
    const s = await ctx.sessions.get(String(args[0]));
    if (!s) return null;
    const rest = JSON.parse(JSON.stringify(args.slice(1)));
    let first = await this.one(name, rest, s.email, azureOut, azureMs);
    if (first.result !== 'MATCH') { // confirm: both sides again after 90 s
      await this.sleep(SHADOW_CONFIRM_MS);
      const t0 = this.now(); const again = await this.reg.call(ctx, name, args.slice(0)); // observer re-entry is throttled per function
      const second = await this.one(name, rest, s.email, again, this.now() - t0);
      first = second.result === 'MATCH' ? { ...second, note: 'matched on the second check (timing)' } : { ...second, note: (second.note ? second.note + ' · ' : '') + 'confirmed after 90 s' };
    }
    const rec: ShadowRecord = { ...first, at: this.now(), fn: name, email: s.email, role: s.role };
    this.hour.compared++; this.hour[rec.result === 'MATCH' ? 'match' : rec.result === 'DIFFERENT' ? 'different' : 'error']++; this.hour.azureMs += rec.azureMs; this.hour.gasMs += rec.gasMs;
    if (rec.result !== 'MATCH') this.log('[Shadow] ' + name + ' (' + s.role + '): ' + rec.result + (rec.diffs ? ' — ' + rec.diffs + ' difference(s): ' + rec.paths.slice(0, 3).map((d) => d.path + ' [' + d.kind + ']').join('; ') : '') + (rec.note ? ' — ' + rec.note : ''));
    if (this.store) await this.store.add(rec).catch((e) => this.log('[Shadow] result not stored: ' + String((e as Error).message).slice(0, 60)));
    return rec;
  }

  private async one(name: string, rest: unknown[], email: string, azureOut: { ok: unknown } | { err: string }, azureMs: number): Promise<Omit<ShadowRecord, 'at' | 'fn' | 'email' | 'role'>> {
    const t0 = this.now(); const g = await this.runGas(name, rest, email); const gasMs = this.now() - t0;
    if ('pending' in g) return { result: 'ERROR', azureMs, gasMs, diffs: 0, paths: [], note: 'Apps Script answered later (not compared)' };
    const aErr = 'err' in azureOut ? azureOut.err : null, gErr = 'err' in g ? g.err : null;
    if (aErr !== null || gErr !== null) {
      if (aErr !== null && gErr !== null && aErr === gErr) return { result: 'MATCH', azureMs, gasMs, diffs: 0, paths: [], note: 'same message on both' };
      return { result: 'ERROR', azureMs, gasMs, diffs: 0, paths: [], note: 'Azure: ' + (aErr === null ? 'ok' : noEmails(aErr)) + ' | Apps Script: ' + (gErr === null ? 'ok' : noEmails(gErr)) };
    }
    const a = JSON.parse(JSON.stringify((azureOut as { ok: unknown }).ok ?? null)), b = JSON.parse(JSON.stringify((g as { ok: unknown }).ok ?? null));
    const d = diffJson(a, b, this.opts.ignore);
    if (!d.length) return { result: 'MATCH', azureMs, gasMs, diffs: 0, paths: [], note: '' };
    const seen = new Set<string>(), paths: Diff[] = [];
    for (const x of d) { const k = pathPattern(x.path) + '|' + x.kind.split(' ')[0]; if (!seen.has(k) && paths.length < SHADOW_MAX_PATHS) { seen.add(k); paths.push({ path: pathPattern(x.path), kind: x.kind }); } }
    return { result: 'DIFFERENT', azureMs, gasMs, diffs: d.length, paths, note: '' };
  }

  start(): void {
    if (this.timer) return;
    this.log('[Shadow] comparing ' + this.opts.samplePct + '% of ' + SHADOW_FNS.length + ' read screens with Apps Script (people allowed on Azure; max ' + this.opts.dailyCap + '/day) → dbo.shadow_compare.');
    this.timer = setInterval(() => {
      const h = this.hour; if (!h.compared) return;
      this.log('[Shadow] last hour: ' + h.compared + ' compared · MATCH ' + h.match + ' · DIFFERENT ' + h.different + ' · ERROR ' + h.error + ' · average time Azure ' + Math.round(h.azureMs / h.compared) + ' ms vs Apps Script ' + Math.round(h.gasMs / h.compared) + ' ms');
      this.hour = { compared: 0, match: 0, different: 0, error: 0, azureMs: 0, gasMs: 0 };
    }, 3_600_000);
    this.timer.unref?.();
  }
}

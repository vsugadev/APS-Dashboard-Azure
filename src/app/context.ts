/**
 * Shared services for one running app: config, data source, sessions, Google sign-in.
 * Built once at start-up (src/server.ts) or per test with fakes.
 */
import type { AppConfig } from '../config';
import type { DataSource } from '../data/types';
import type { LiveSource } from '../live/liveSource';
import type { HeartbeatSink } from '../live/heartbeat';
import type { SessionStore, Session } from '../auth/sessions';
import { SESSION_EXPIRED_MSG } from '../auth/sessions';
import type { GoogleAuth, VerifiedClaims } from '../auth/google';
import { StateNonces } from '../auth/google';
import { isApsEmailAllowed, normalizeEmail, extractAPSID } from '../lib/email';
import { getViewerRoleForEmail, roleFromLists, isAdminOrHm, rolePermission, canViewAllDashboardFilters, viewerBadgeName, type Viewer } from '../auth/roles';
import { acEffectiveForRole, apsTabAllowed, AC_OFF_MSG } from '../auth/accessControl';
import type { Course } from '../data/types';
import { describeGoogleError } from '../google/diagnose';
import { inParallelGroup, PR_NOT_IN_GROUP_MSG } from '../parallel/group';

export interface AppContext {
  cfg: AppConfig;
  data: DataSource;
  /** Apps Script's live Script / User Properties (Phase 3 bridge); EmptyLiveSource when not configured. */
  live: LiveSource;
  /** Phase 3 step 2: heartbeats of Azure's own signed-in users → Apps Script (presence + Last Login DB). Optional (tests). */
  heartbeat?: HeartbeatSink;
  sessions: SessionStore;
  /** v0.16.0: chat owned by Azure SQL (CHAT_OWNER=azure) — absent otherwise. */
  chat?: import('../db/chatOwner').ChatOwner;
  /** v0.17.0: live Google Meet class status from Apps Script (absent = schedule-based status only). */
  classLive?: import('../live/classLive').ClassLiveSource;
  google: GoogleAuth;
  nonces: StateNonces;
  /** v0.21.0: parallel-run difference reports (Azure SQL); absent without a database. */
  feedback?: import('../parallel/parallelRun').FeedbackStore;
}

export type SignInResult = { ok: true; token: string; user: UserPayload } | { ok: false; code: string; email?: string; message?: string };

/** Same shape the browser receives from Code.gs buildAuthenticatedUserPayload_. Fields that depend on modules moving
 *  in later phases are sent with their safe "no access" value and listed in docs/PHASE1.md. */
export interface UserPayload {
  authenticated: true; email: string; name: string; apsId: string; role: string;
  permissions: ReturnType<typeof rolePermission>;
  canViewMonitoringFilters: boolean; canViewMonitoringTotals: boolean;
  examinationAccess: string; gradingAccess: string; apsRole: string; roleLabel: string;
  tabAccess: Record<string, false>; coverageAccess: boolean; coverageTrackingAccess: boolean; tempTeacherAccess: boolean;
  azurePhase: 1;
}

export async function buildUserPayload(ctx: AppContext, viewer: Viewer, courses: Course[]): Promise<UserPayload> {
  const ov = await ctx.data.readAccessOverrides();
  const filters = canViewAllDashboardFilters(ctx.cfg, viewer.role);
  return {
    authenticated: true,
    email: viewer.email,
    name: viewerBadgeName(viewer, courses),
    apsId: extractAPSID(viewer.email),
    role: viewer.role,
    permissions: rolePermission(ctx.cfg, viewer.role),
    canViewMonitoringFilters: filters,
    canViewMonitoringTotals: filters,
    examinationAccess: '',            // filled below from the copied Code.gs (v0.23.2)
    gradingAccess: '',
    apsRole: '',
    roleLabel: ctx.cfg.onCallCoordinatorEmails.map(normalizeEmail).indexOf(viewer.email) > -1 ? 'On-Call Coordinator' : '',
    tabAccess: acEffectiveForRole(viewer.role, ov),
    coverageAccess: false,
    coverageTrackingAccess: false,
    tempTeacherAccess: false,
    azurePhase: 1,
    ...(await moduleAccess(ctx, viewer, courses)),
  };
}

/** v0.23.2: the module gates of Code.gs buildAuthenticatedUserPayload_, from the copied Code.gs functions (the same answer
 *  getDashboardData gives). Without them the Examination tab (and the class sub-tabs) stayed hidden on Azure until the first
 *  Classes load. A failure keeps the closed defaults (never more access than Code.gs would give). */
async function moduleAccess(ctx: AppContext, viewer: Viewer, courses: Course[]): Promise<Partial<UserPayload>> {
  try {
    const { gasRun, apsRoleFor } = await import('../api/endpoints/classes');
    return await gasRun(ctx, null, (S) => {
      const cs = JSON.parse(JSON.stringify(courses || []));
      const cov = !!S.tccCanUse_(viewer.role, viewer.email, cs);
      return { examinationAccess: String(S.examinationAccessForRole_(viewer.role) || ''), gradingAccess: String(S.rosterAccessForRole_(viewer.role) || ''),
        apsRole: apsRoleFor({ email: viewer.email, role: viewer.role }, cs as any), coverageAccess: cov, coverageTrackingAccess: cov, tempTeacherAccess: !!S.ttmCanUse_(viewer.role, viewer.email) };
    });
  } catch (e) { console.warn('[SignIn] module access not worked out (' + String((e as Error).message).slice(0, 80) + ') — tabs follow the first Classes load.'); return {}; }
}

/** Port of establishSessionForVerifiedClaims_: domain check → role → session → payload. */
export async function signInWithClaims(ctx: AppContext, claims: VerifiedClaims): Promise<SignInResult> {
  if (!claims.email_verified) return { ok: false, code: 'invalid_token', message: 'Google did not report this email as verified.' };
  const email = normalizeEmail(claims.email);
  if (!isApsEmailAllowed(email, ctx.cfg.allowedDomains)) return { ok: false, code: 'invalid_email' };
  // Same decision as Code.gs. The role lists are checked first there too, so the Sheet is only needed when the
  // person is not on a list (configured role, teacher, student) — staff on the lists can sign in even while the
  // Google Sheet is unreachable; everyone else gets a clear message instead of a wrong role.
  const listed = roleFromLists(ctx.cfg, email);
  let courses: Course[] = [];
  let viewer: Viewer;
  if (listed) {
    viewer = { email, role: listed };
    if (!isAdminOrHm(listed)) courses = await ctx.data.readCourses().catch(() => []); // BOD badge name comes from the rosters
  } else {
    let configured: Record<string, string>;
    try { [courses, configured] = await Promise.all([ctx.data.readCourses(), ctx.data.readConfiguredUserRoles()]); }
    catch (e) { console.error('[SignIn] class data unavailable: ' + describeGoogleError(e)); return { ok: false, code: 'invalid_token', message: 'The dashboard cannot read class data right now. Please try again in a few minutes.' }; }
    viewer = getViewerRoleForEmail(ctx.cfg, email, courses, configured);
  }
  if (viewer.role === 'none') return { ok: false, code: 'not_authorized', email };
  if (!inParallelGroup(ctx.cfg, viewer.email, viewer.role)) { console.log('[ParallelRun] sign-in refused (not in PARALLEL_RUN_USERS): ' + viewer.role); return { ok: false, code: 'invalid_token', message: PR_NOT_IN_GROUP_MSG }; }
  const token = await ctx.sessions.create({ email: viewer.email, role: viewer.role });
  return { ok: true, token, user: await buildUserPayload(ctx, viewer, courses) };
}

/** requireValidSession_ */
export async function requireSession(ctx: AppContext, token: unknown): Promise<Session> {
  const s = typeof token === 'string' ? await ctx.sessions.get(token) : null;
  if (!s) throw new Error(SESSION_EXPIRED_MSG);
  if (!inParallelGroup(ctx.cfg, s.email, s.role)) throw new Error(PR_NOT_IN_GROUP_MSG); // v0.21.0: the test group, checked on every call
  return s;
}
/** apsRequireTabForToken_ — every tab-specific endpoint starts with this (server-side; never trusts the browser). */
export async function requireTab(ctx: AppContext, token: unknown, key: string): Promise<Session> {
  const s = await requireSession(ctx, token);
  if (!apsTabAllowed(s.role, key, await ctx.data.readAccessOverrides())) throw new Error(AC_OFF_MSG);
  return s;
}

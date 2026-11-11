/**
 * Phase 2 — Classes view: getDashboardData (same name, same payload shape as Code.gs getDashboardData).
 *
 * Step 1 (v0.2.0): pure Code.gs rules copied word for word (src/gas/classes.generated.ts) — hidden-staff filter,
 *   roster APSIDs, class schedule + automatic class status, Nilai / class-time filters, name order, who sees which
 *   classes, card Status box, header fields.
 * Step 2 (v0.3.0): the Code.gs Sheet READERS copied word for word (src/gas/scope.generated.ts) and run in the
 *   read-only runtime (src/gas/runtime.ts) on a snapshot of the Google Sheets — teacher availability on the card,
 *   WhatsApp group links, Google Meet links, country flags (USER_COUNTRY), Temporary Class Coverage banner, Temp
 *   Teacher note, School Leave banner, and the Coverage / Temp Teacher tab access.
 *
 * Not on Azure yet (decision 2026-11-11 "Sheets only now"): data Apps Script keeps in Script / User Properties is
 * sent EMPTY until Phase 3 — online now (heartbeat), last login, onboarded flag, manual class status, live Google
 * Meet status, on-call teacher banner, Hide/Show toggle. Assignment Monitoring access and Examination / Grading
 * access come with those modules. Read-only: nothing is written (no heartbeat, no marks, no sheet created).
 */
import type { Registry } from '../registry';
import { requireSession, type AppContext } from '../../app/context';
import type { Course, Person } from '../../data/types';
import type { AppConfig } from '../../config';
import { G } from '../../gas/classes.generated';
import { makeGasScope } from '../../gas/scope.generated';
import { makeRuntime, SnapWorkbook } from '../../gas/runtime';
import { acEffectiveForRole, apsTabAllowed } from '../../auth/accessControl';
import { viewerBadgeName, rolePermission, canViewAllDashboardFilters, isAdminRole, userHasCourseAccess, courseHasStudentEmail } from '../../auth/roles';

/** Parts of the Classes view still empty on Azure (see the header). */
export const CLASSES_NOT_YET = [
  'Online now / last login / onboarded (Script Properties — Phase 3)', 'Manual class status + live Google Meet status (Phase 3)',
  'On-call teacher banner + Hide/Show toggle (Phase 3)', 'Assignment Monitoring / Examination / Grading tab access (their modules)',
];

const ACCESS_STAFF_ROLES = new Set(['superadmin', 'admin', 'headmaster', 'vcfo_amchsts_bod']);

/** Sheet names the copied readers open — taken from the copied Code.gs constants, never retyped. */
const NAMES = makeGasScope(makeRuntime({ main: new SnapWorkbook('x', {}), attendance: null, settings: {}, isRosterHiddenStaffEmail_: () => false, apsTabAllowed_: () => false, isOnCallCoordinatorEmail_: () => false }));
export const MAIN_SHEETS: string[] = [NAMES.TEACHER_AVAILABILITY_SHEET_NAME, NAMES.WHATSAPP_LINKS_SHEET_NAME, NAMES.SL_SHEET_, NAMES.TCC_SHEET_, NAMES.TTM_SHEET_, NAMES.UC_SHEET_,
  NAMES.CTA_SELECTION_SHEET_, NAMES.USER_ROLE_SHEET_NAME];
export const ATTENDANCE_SHEETS: string[] = [NAMES.ATTENDANCE_MEET_LINK_MAP_SHEET_NAME, NAMES.CLASS_MEET_DETECTED_SHEET_];

/** Code.gs ROSTER_HIDDEN_STAFF_EMAIL_SET_: Headmaster + Admin lists + ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS + grading team. */
export function hiddenStaffSet(cfg: AppConfig): Record<string, true> {
  const list = cfg.headmasterEmails.concat(cfg.adminEmails, cfg.rosterHiddenStaffAdditionalEmails, ['grading@avvaiyarpadasalai.org'], cfg.gradingTeamEmails);
  const set: Record<string, true> = {};
  for (const e of list) { const n = G.normalizeEmail_(e); if (n) set[n] = true; }
  return set;
}
/** Code.gs classesAlwaysShowEmails_ (same default and parsing). */
export function classesAlwaysShowSet(cfg: AppConfig): Record<string, true> {
  let list: unknown[] = ['vsugadev@avvaiyarpadasalai.org'];
  const raw = cfg.classesAlwaysShowEmailsRaw;
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
    try { const v = JSON.parse(raw); if (!Array.isArray(v)) throw new Error('not an array'); list = v; } catch { list = String(raw).split(/[;,\s]+/); }
  }
  const out: Record<string, true> = {};
  for (const e of list) { const n = G.normalizeEmail_(e); if (n) out[n] = true; }
  return out;
}
function isOnCallCoordinator(cfg: AppConfig, email: unknown): boolean {
  const e = G.normalizeEmail_(email);
  return !!e && cfg.onCallCoordinatorEmails.map((x) => G.normalizeEmail_(x)).indexOf(e) > -1;
}

/** One request's copy of the Code.gs readers, on a read-only snapshot of the sheets they read. */
/** Settings the copied code reads as Script Properties: plain APS_/TCC_/… values + the role lists Azure holds (Key Vault). */
export function gasSettings(cfg: AppConfig): Record<string, string> {
  return { ...cfg.scriptSettings,
    SUPERADMIN_EMAILS: JSON.stringify(cfg.superadminEmails), ADMIN_EMAILS: JSON.stringify(cfg.adminEmails), HEADMASTER_EMAILS: JSON.stringify(cfg.headmasterEmails),
    VCFO_AMCHATS_BOD_EMAILS: JSON.stringify(cfg.bodEmails), ON_CALL_COORDINATOR_EMAILS: JSON.stringify(cfg.onCallCoordinatorEmails),
    ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS: JSON.stringify(cfg.rosterHiddenStaffAdditionalEmails), APS_GRADING_TEAM_EMAILS: JSON.stringify(cfg.gradingTeamEmails) };
}

/** One request's copy of the Code.gs readers, on a read-only snapshot of the sheets they read. `session` = the session
 *  Azure already checked (for copied endpoints that call requireValidSession_ / apsRequireTabForToken_). */
export async function gasScopeFor(ctx: AppContext, session: { email: string; role: string } | null = null): Promise<any> {
  const [main, ov, courses] = await Promise.all([ctx.data.readSheets('main', MAIN_SHEETS), ctx.data.readAccessOverrides(), session ? ctx.data.readCourses() : Promise.resolve([])]);
  let attendance: SnapWorkbook | null = null;
  if (ctx.cfg.attendanceSpreadsheetId || ctx.cfg.dataMode === 'fixture') {
    try { const a = await ctx.data.readSheets('attendance', ATTENDANCE_SHEETS); attendance = new SnapWorkbook('attendance', a.sheets, a.timeZone, a.titles); }
    catch (e) { console.warn('[Classes] attendance workbook not readable — Meet links from Classroom only: ' + String((e as Error).message).slice(0, 120)); }
  }
  const hidden = hiddenStaffSet(ctx.cfg);
  const json = JSON.stringify(courses);
  return makeGasScope(makeRuntime({
    main: new SnapWorkbook('main', main.sheets, main.timeZone, main.titles), attendance, settings: gasSettings(ctx.cfg),
    session, courses: () => JSON.parse(json), live: liveEmptyPasses(ctx.cfg) as any, tabAllowedForSession: (key: string) => !!session && apsTabAllowed(session.role, key, ov),
    isRosterHiddenStaffEmail_: (e: unknown) => { const n = G.normalizeEmail_(e); return !!n && !!hidden[n]; },
    apsTabAllowed_: (r: string, key: string) => apsTabAllowed(r, key, ov),
    isOnCallCoordinatorEmail_: (e: unknown) => isOnCallCoordinator(ctx.cfg, e),
  }));
}

type P = Person & Record<string, any>;
type C = Course & Record<string, any>;

/** Code.gs live-data passes as Azure runs them until Phase 3 (no stored heartbeat / last-login / onboarded maps):
 *  the same fields, from what the course cache itself carries. Used by the Classes view and the copied endpoints. */
export function liveEmptyPasses(cfg: AppConfig) {
  const hidden = hiddenStaffSet(cfg), always = classesAlwaysShowSet(cfg);
  const isHidden = (e: unknown) => { const n = G.normalizeEmail_(e); return !!n && !!hidden[n]; };
  const people = (c: C): P[] => ((c.teachers || []) as P[]).concat((c.students || []) as P[]);
  return {
    /** applyRosterHiddenStaffFilter_ — the "Show" toggle lives in a Script Property → default "Hide" on Azure */
    applyRosterHiddenStaffFilter_(courses: C[]) {
      for (const c of courses) {
        if (c.teachers && c.teachers.length) c.teachers = c.teachers.filter((t: P) => (t.apsRoles && t.apsRoles.length) || (G.normalizeEmail_(t.email) && always[G.normalizeEmail_(t.email)]) || !isHidden(t.email));
        if (c.students && c.students.length) c.students = c.students.filter((s: P) => !isHidden(s.email));
        c.noTeacher = (c.teachers || []).length === 0; c.noStudents = (c.students || []).length === 0; c.studentCount = (c.students || []).length;
      }
      return courses;
    },
    /** applyLivePresence_ with no heartbeat map: online only from the synced Meet / Classroom signals on the roster */
    applyLivePresence_(courses: C[]) {
      for (const c of courses) for (const p of people(c)) { p.online = !!p.inMeet || !!p.classroomActivitySince; p.onlineSince = p.inMeet ? (p.meetSince || null) : (p.classroomActivitySince || null); }
      return courses;
    },
    /** applyLastLogin_ with no last-login map */
    applyLastLogin_(courses: C[]) {
      const sum = G.summarizeLastLogin_(G.normalizeLastLoginEntry_(undefined));
      for (const c of courses) for (const p of people(c)) { p.apsId = G.extractAPSID_(p.email); p.lastLoginAt = sum.at; p.lastLoginSource = sum.sources; p.lastLoginDisplay = sum.display; p.lastLoginBySource = { gc: null, gm: null, db: null }; }
      return courses;
    },
    /** applyStudentOnboardedFlag_ with no stored map: a student online now counts as onboarded (as Code.gs marks them) */
    applyStudentOnboardedFlag_(courses: C[]) {
      for (const c of courses) for (const s of (c.students || []) as P[]) { const key = G.normalizeEmail_(s.email); s.onboarded = !!(key && s.online); s.onboardedAt = null; }
      return courses;
    },
  };
}

/** The Code.gs decoration passes, in Code.gs order. `S` = the copied Sheet readers (gasScopeFor). Mutates `courses`. */
export function decorateCourses(cfg: AppConfig, courses: C[], now: Date, S: any): C[] {
  const L = liveEmptyPasses(cfg);
  L.applyRosterHiddenStaffFilter_(courses);
  L.applyLivePresence_(courses);
  L.applyLastLogin_(courses);
  S.applyUserCountry_(courses); // USER_COUNTRY sheet (copied reader)
  // applyClassStatus_ — automatic status from the class schedule; no manual override / live Meet / started mark yet
  for (const c of courses) {
    const schedule = G.parseCourseSchedule_(c.name);
    c.classSchedule = schedule ? { dayOfWeek: schedule.dayOfWeek, start: schedule.start, end: schedule.end, timezoneRaw: schedule.timezoneRaw } : null;
    const anyoneInMeet = ((c.teachers || []) as P[]).some((t) => t.inMeet) || ((c.students || []) as P[]).some((s) => s.inMeet);
    const r = G.computeAutomaticClassStatus_(schedule, now, anyoneInMeet);
    c.classMeetDetail = null;
    c.classStatus = r.code; c.classStatusManual = false; c.classStatusUpdatedAt = null; c.classStatusUpdatedBy = null;
    c.scheduledStartDisplay = r.scheduledStartIso ? G.formatLastLoginTimestamp_(r.scheduledStartIso) : '';
    c.classStatusLabel = G.CLASS_STATUS_LABELS[r.code];
    c.classStatusColorCategory = G.CLASS_STATUS_COLOR_CATEGORY[r.code];
  }
  L.applyStudentOnboardedFlag_(courses);
  // Teacher availability (Code.gs getDashboardDataInner_, same mapping)
  const avail: Record<string, string> = {}, alt: Record<string, string> = {};
  S.buildAvailabilityBoard_(courses, S.getCurrentWeekId_(now)).forEach((row: any) => {
    avail[String(row.courseId)] = row.status === S.AVAILABILITY_STATUS.CONFIRMED ? 'Available to Take Classes' : row.status === S.AVAILABILITY_STATUS.NOT_AVAILABLE ? 'Not Available to Take Classes' : 'Not Set';
    if (row.status === S.AVAILABILITY_STATUS.NOT_AVAILABLE) alt[String(row.courseId)] = row.alternative || 'none';
  });
  for (const c of courses) { c.teacherAvailabilityStatus = avail[String(c.id)] || 'Not Set'; c.teacherAvailabilityAlt = alt[String(c.id)] || ''; }
  S.applyWhatsAppLinks_(courses);
  S.applyMeetLinks_(courses);
  for (const c of courses) { c.nilai = G.extractNilaiFromCourseName_(c.name); c.classTime = G.extractClassTimeFromCourseName_(c.name); }
  courses.sort((a, b) => G.naturalCompareJs_(a.name, b.name));
  return courses;
}

/** Code.gs apsRoleFor_ (header "Class Support" label). */
export function apsRoleFor(viewer: { email: string; role: string }, courses: C[]): string {
  const role = String(viewer.role || '');
  if (isAdminRole(role)) return 'ADMIN';
  if (role === 'headmaster') return 'HM';
  if (role !== 'teacher') return role.toUpperCase();
  let best = 'TEACHER'; const e = G.normalizeEmail_(viewer.email);
  for (const c of courses) for (const s of (c.classSupport || []) as any[]) {
    if (s.email !== e || s.member !== true) continue;
    const p = G.classRolesPrimary_(s.roles);
    if (G.CLASS_ROLE_RANK_[p] > G.CLASS_ROLE_RANK_[best]) best = p;
  }
  return best;
}

/** Same payload as Code.gs getDashboardDataInner_ + apsSlimDashboardPayload_ (live / not-yet parts empty, see header). */
export async function buildClassesView(ctx: AppContext, viewer: { email: string; role: string }, allCourses: C[], now: Date, S?: any): Promise<Record<string, unknown>> {
  const scope = S || (await gasScopeFor(ctx));
  const courses = decorateCourses(ctx.cfg, allCourses, now, scope);
  let visible: C[];
  if (ACCESS_STAFF_ROLES.has(viewer.role)) visible = courses;
  else if (viewer.role === 'teacher') {
    visible = courses.filter((c) => userHasCourseAccess(viewer.email, c) || courseHasStudentEmail(c, viewer.email));
    for (const c of visible) c.viewerAccess = G.classAccessFor_(c, viewer.email);
  } else if (viewer.role === 'student') visible = courses.filter((c) => courseHasStudentEmail(c, viewer.email));
  else visible = [];
  const role = ['superadmin', 'admin', 'headmaster', 'vcfo_amchsts_bod', 'teacher', 'student', 'authorized'].includes(viewer.role) ? viewer.role : 'none';
  const ov = await ctx.data.readAccessOverrides();
  const out: Record<string, any> = { email: viewer.email, role, courses: visible };
  out.name = viewerBadgeName({ email: viewer.email, role }, courses);
  out.apsId = G.extractAPSID_(viewer.email);
  out.isClassroomTeacher = courses.some((c) => G.courseHasTeacherEmail_(c, G.normalizeEmail_(viewer.email)));
  out.apsRole = apsRoleFor({ email: viewer.email, role }, courses);
  out.roleLabel = isOnCallCoordinator(ctx.cfg, viewer.email) ? 'On-Call Coordinator' : '';
  out.tabAccess = acEffectiveForRole(role, ov);
  out.coverageAccess = scope.tccCanUse_(role, viewer.email, courses);
  out.coverageTrackingAccess = out.coverageAccess;
  out.assignMonAccess = false; // Assignment Monitoring module (later)
  try { scope.tccStampToday_(visible); } catch (e) { console.warn('[Coverage] banner: ' + String((e as Error).message).slice(0, 120)); }
  try { scope.ttmStampCards_(visible); } catch (e) { console.warn('[TempTeacher] card note: ' + String((e as Error).message).slice(0, 120)); }
  out.tempTeacherAccess = scope.ttmCanUse_(role, viewer.email);
  for (const c of visible) c.liveBox = G.apsClassLiveBox_(c);
  out.canViewMonitoringFilters = canViewAllDashboardFilters(ctx.cfg, role);
  out.canViewMonitoringTotals = out.canViewMonitoringFilters;
  out.permissions = rolePermission(ctx.cfg, role);
  out.examinationAccess = ''; out.gradingAccess = ''; // Examination / Grading modules (later phase)
  const env = String(ctx.cfg.dashboardEnvironment || '').trim().toUpperCase();
  out.environment = env === 'TESTING' || env === 'TEST' ? { key: 'TESTING', label: 'TESTING' } : { key: 'LIVE', label: 'LIVE' };
  out.rosterHiddenStaffVisible = false;
  out.onCallTeacherCount = 0; out.onCallTeacher = null; // on-call directory lives in Script Properties (Phase 3)
  for (const c of visible) { delete c.rosterTeacherEmails; delete c.onCallRoster; }
  try { out.schoolLeave = scope.getAPSSchoolLeaveStatus(new Date()); } catch { out.schoolLeave = { isSchoolLeave: false }; }
  // apsSlimDashboardPayload_
  for (const c of visible) for (const p of ((c.teachers || []) as P[]).concat((c.students || []) as P[])) {
    if (!p) continue;
    delete p.lastLoginBySource; delete p.lastLoginSource; delete p.countrySource; delete p.onboardedAt;
    if (p.photo === G.PLACEHOLDER_PHOTO) p.photo = '';
  }
  return out;
}

/** Code.gs getMyCountryPreference (country feature off → "disabled"; on → the person's USER_COUNTRY row, if any). */
export function countryPreference(S: any, email: string): Record<string, unknown> {
  if (!S.apsCountryOn_()) return { hasDefault: true, disabled: true, defaultCountryCode: '', defaultCountryName: '', defaultFlag: '', detectedCountryCode: '', detectedCountryName: '' };
  return S.ucPref_(email);
}

export function registerClasses(reg: Registry): void {
  /** getMyCountryPreference — the sign-in "Continue" step asks this; without it the page waits for a country pick. */
  reg.register('getMyCountryPreference', async (ctx, [token]) => {
    const s = await requireSession(ctx, token);
    return countryPreference(await gasScopeFor(ctx), s.email);
  });
  /** getClassTeacherAvailabilityView — Classes → Teacher Availability (Phase 2 step 3): a teacher's own week + the
   *  Admin / HM / BOD weekly report, exactly as Code.gs builds it (copied code, read-only). Saving stays in Apps Script. */
  reg.register('getClassTeacherAvailabilityView', async (ctx, [token]) => {
    const s = await requireSession(ctx, token);
    const S = await gasScopeFor(ctx, { email: s.email, role: s.role });
    const out = S.getClassTeacherAvailabilityView(token);
    if (out) { out.canSubmit = false; out.canSendTest = false; out.azureReadOnly = true; } // save / test email: still in Apps Script
    return out;
  });
  /** getDirectoryIndex — Active Directory → Directory Search (Phase 2 step 4): every class's people, role-tiered on the
   *  server exactly as Code.gs (copied code). Online / last login / onboarded follow the Classes view (Phase 3 for stored data). */
  reg.register('getDirectoryIndex', async (ctx, [token]) => {
    const s = await requireSession(ctx, token);
    return (await gasScopeFor(ctx, { email: s.email, role: s.role })).getDirectoryIndex(token);
  });
  /** getDashboardData — the Classes view (cards, rosters, filters) for the signed-in viewer. Read-only. */
  reg.register('getDashboardData', async (ctx, [token]) => {
    const s = await requireSession(ctx, token);
    const courses = (await ctx.data.readCourses()) as C[];
    return buildClassesView(ctx, { email: s.email, role: s.role }, courses, new Date());
  });
}

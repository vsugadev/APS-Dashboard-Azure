/**
 * Phase 2, step 1 — Classes view: getDashboardData (same name, same payload shape as Code.gs getDashboardData).
 *
 * Built from the Google Sheet (Courses tab) with the Apps Script rules copied word for word from Code.gs
 * (src/gas/classes.generated.ts): hidden-staff filter, roster APSIDs, class schedule and automatic class status,
 * Nilai / class-time filters, name sort, who sees which classes, card "Status" box, header fields.
 *
 * Not on Azure yet (decision 2026-11-11 "Sheets only now"): live data Apps Script keeps in Script / User
 * Properties is sent EMPTY until Phase 3 moves those stores — online now, last login, country flags, onboarded flag,
 * manual class status (cancelled / rescheduled), live Google Meet status, on-call teacher banner, Hide/Show toggle.
 * Sheet-based extras that follow in the next Phase 2 steps are listed in CLASSES_NOT_YET (they keep Code.gs's
 * "nothing set" values meanwhile). Read-only: unlike Code.gs, nothing is written (no heartbeat, no marks).
 */
import type { Registry } from '../registry';
import { requireSession, type AppContext } from '../../app/context';
import type { Course, Person } from '../../data/types';
import type { AppConfig } from '../../config';
import { G } from '../../gas/classes.generated';
import { acEffectiveForRole } from '../../auth/accessControl';
import { viewerBadgeName, rolePermission, canViewAllDashboardFilters, isAdminRole, userHasCourseAccess, courseHasStudentEmail } from '../../auth/roles';

/** Sheet-based parts of the Classes view that come in the next Phase 2 steps (shown with Code.gs's empty values now). */
export const CLASSES_NOT_YET = [
  'teacherAvailabilityStatus (Teacher_Weekly_Availability)', 'WhatsApp group links', 'Google Meet links',
  'Country flags + preference (USER_COUNTRY sheet)', 'Temporary Class Coverage banner', 'Temp Teacher card note', 'School Leave banner', 'Coverage / Temp Teacher / Assignment Monitoring tab access',
];

const ACCESS_STAFF_ROLES = new Set(['superadmin', 'admin', 'headmaster', 'vcfo_amchsts_bod']);

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

type P = Person & Record<string, any>;
type C = Course & Record<string, any>;

/** The Code.gs decoration passes, with the Script/User-Property maps empty (see the header). Mutates `courses`. */
export function decorateCourses(cfg: AppConfig, courses: C[], now: Date): C[] {
  // applyRosterHiddenStaffFilter_ — toggle "Show" lives in a Script Property → default "Hide" on Azure
  const hidden = hiddenStaffSet(cfg), always = classesAlwaysShowSet(cfg);
  const isHidden = (e: unknown) => { const n = G.normalizeEmail_(e); return !!n && !!hidden[n]; };
  for (const c of courses) {
    if (c.teachers && c.teachers.length) c.teachers = c.teachers.filter((t: P) => (t.apsRoles && t.apsRoles.length) || (G.normalizeEmail_(t.email) && always[G.normalizeEmail_(t.email)]) || !isHidden(t.email));
    if (c.students && c.students.length) c.students = c.students.filter((s: P) => !isHidden(s.email));
    c.noTeacher = (c.teachers || []).length === 0;
    c.noStudents = (c.students || []).length === 0;
    c.studentCount = (c.students || []).length;
  }
  const people = (c: C): P[] => ((c.teachers || []) as P[]).concat((c.students || []) as P[]);
  for (const c of courses) for (const p of people(c)) {
    // applyLivePresence_ with no heartbeat map: online only from the synced Meet / Classroom signals on the roster
    p.online = !!p.inMeet || !!p.classroomActivitySince;
    p.onlineSince = p.inMeet ? (p.meetSince || null) : (p.classroomActivitySince || null);
    // applyLastLogin_ with no last-login map
    const sum = G.summarizeLastLogin_(G.normalizeLastLoginEntry_(undefined));
    p.apsId = G.extractAPSID_(p.email);
    p.lastLoginAt = sum.at; p.lastLoginDisplay = sum.display;
    // applyUserCountry_ (country feature off by default since r119)
    const info = G.resolveCountryFlag_(null);
    p.countryCode = info.countryCode; p.countryName = info.countryName; p.countryFlag = info.flag;
  }
  for (const c of courses) for (const s of (c.students || []) as P[]) s.onboarded = false; // applyStudentOnboardedFlag_ (map not on Azure yet)
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
  for (const c of courses) { c.teacherAvailabilityStatus = 'Not Set'; c.teacherAvailabilityAlt = ''; } // next step: Teacher_Weekly_Availability
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
export async function buildClassesView(ctx: AppContext, viewer: { email: string; role: string }, allCourses: C[], now: Date): Promise<Record<string, unknown>> {
  const courses = decorateCourses(ctx.cfg, allCourses, now);
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
  out.roleLabel = ctx.cfg.onCallCoordinatorEmails.map((e) => G.normalizeEmail_(e)).indexOf(G.normalizeEmail_(viewer.email)) > -1 ? 'On-Call Coordinator' : '';
  out.tabAccess = acEffectiveForRole(role, ov);
  out.coverageAccess = false; out.coverageTrackingAccess = false; out.assignMonAccess = false; out.tempTeacherAccess = false; // next steps
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
  out.schoolLeave = { isSchoolLeave: false }; // next step: APS_SCHOOL_LEAVES
  // apsSlimDashboardPayload_
  for (const c of visible) for (const p of ((c.teachers || []) as P[]).concat((c.students || []) as P[])) {
    if (!p) continue;
    delete p.lastLoginBySource; delete p.lastLoginSource; delete p.countrySource; delete p.onboardedAt;
    if (p.photo === G.PLACEHOLDER_PHOTO) p.photo = '';
  }
  return out;
}

/** Code.gs getMyCountryPreference: always "has a default" (no country step at sign-in since r120). The person's own
 *  USER_COUNTRY row is added with the USER_COUNTRY step; until then the country fields are blank. */
export function countryPreference(cfg: AppConfig): Record<string, unknown> {
  if (!cfg.countryFeatureOn) return { hasDefault: true, disabled: true, defaultCountryCode: '', defaultCountryName: '', defaultFlag: '', detectedCountryCode: '', detectedCountryName: '' };
  return { hasDefault: true, sheetMode: true, countryCode: '', countryName: '', countryFlag: '', source: '', defaultCountryCode: '', defaultCountryName: '', defaultFlag: '', detectedCountryCode: '', detectedCountryName: '' };
}

export function registerClasses(reg: Registry): void {
  /** getMyCountryPreference — the sign-in "Continue" step asks this; without it the page waits for a country pick. */
  reg.register('getMyCountryPreference', async (ctx, [token]) => {
    await requireSession(ctx, token);
    return countryPreference(ctx.cfg);
  });
  /** getDashboardData — the Classes view (cards, rosters, filters) for the signed-in viewer. Read-only. */
  reg.register('getDashboardData', async (ctx, [token]) => {
    const s = await requireSession(ctx, token);
    const courses = (await ctx.data.readCourses()) as C[];
    return buildClassesView(ctx, { email: s.email, role: s.role }, courses, new Date());
  });
}

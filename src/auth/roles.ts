/**
 * Roles — ports of Code.gs getViewerRoleForEmail_, userHasCourseAccess_, courseHasStudentEmail_, getViewerContext_,
 * role permissions (defaultDashboardRolePermissions_ / readDashboardRolePermissionsRaw_) and the display name.
 * Same order of checks, same results (test/parity.test.ts compares against Code.gs).
 */
import type { AppConfig } from '../config';
import { isApsEmailAllowed, isInEmailList, normalizeEmail } from '../lib/email';
import type { Course } from '../data/types';

export const SUPERADMIN_ROLE = 'superadmin';
export const BOD_ROLE = 'vcfo_amchsts_bod';
export const AUTHORIZED_ROLE = 'authorized';
export const DASHBOARD_ROLES = ['admin', 'headmaster', 'teacher', 'student', BOD_ROLE, SUPERADMIN_ROLE];

export interface Viewer { email: string; role: string }

export function isAdminRole(role: string): boolean { return role === 'admin' || role === SUPERADMIN_ROLE; }
export function isAdminOrHm(role: string): boolean { return role === 'admin' || role === 'headmaster' || role === SUPERADMIN_ROLE; }
export function isReadOnlyRole(role: string): boolean { return role === BOD_ROLE; }
export function isAllViewRole(role: string): boolean { return role === SUPERADMIN_ROLE || role === 'admin' || role === 'headmaster' || role === BOD_ROLE; }

function classSupportGrantsAccess(s: { member?: boolean; roles?: string[] } | undefined): boolean {
  return !!s && (s.member === true || (s.roles || []).indexOf('PRIMARY_TEACHER') > -1);
}
export function courseHasTeacherEmail(course: Course, normalizedEmail: string): boolean {
  if (!normalizedEmail || !course) return false;
  if ((course.teachers || []).some((t) => normalizeEmail(t.email) === normalizedEmail)) return true;
  return (course.rosterTeacherEmails || []).indexOf(normalizedEmail) > -1;
}
export function userHasCourseAccess(userEmail: string, course: Course): boolean {
  const e = normalizeEmail(userEmail);
  if (!course || !e) return false;
  if (courseHasTeacherEmail(course, e)) return true;
  return (course.classSupport || []).some((s) => s.email === e && classSupportGrantsAccess(s));
}
export function courseHasStudentEmail(course: Course, normalizedEmail: string): boolean {
  return (course.students || []).some((s) => normalizeEmail(s.email) === normalizedEmail);
}

/** The first five checks of getViewerRoleForEmail (configured lists only — no Sheet needed). */
export function roleFromLists(cfg: AppConfig, emailIn: string): string | null {
  const email = normalizeEmail(emailIn);
  if (isInEmailList(email, cfg.superadminEmails)) return SUPERADMIN_ROLE;
  if (isInEmailList(email, cfg.bodEmails)) return BOD_ROLE;
  if (isInEmailList(email, cfg.adminEmails)) return 'admin';
  if (isInEmailList(email, cfg.headmasterEmails)) return 'headmaster';
  if (isInEmailList(email, cfg.onCallCoordinatorEmails)) return BOD_ROLE;
  return null;
}

/** Same order as Code.gs: Super Admin → BOD → Admin → HM → On-Call Coordinator → configured role → teacher → student → authorized → none. */
export function getViewerRoleForEmail(cfg: AppConfig, emailIn: string, courses: Course[], configuredRoles: Record<string, string>): Viewer {
  const email = normalizeEmail(emailIn);
  if (isInEmailList(email, cfg.superadminEmails)) return { email, role: SUPERADMIN_ROLE };
  if (isInEmailList(email, cfg.bodEmails)) return { email, role: BOD_ROLE };
  if (isInEmailList(email, cfg.adminEmails)) return { email, role: 'admin' };
  if (isInEmailList(email, cfg.headmasterEmails)) return { email, role: 'headmaster' };
  if (isInEmailList(email, cfg.onCallCoordinatorEmails)) return { email, role: BOD_ROLE }; // r54: read-only, all classes
  if (configuredRoles[email]) return { email, role: configuredRoles[email] };
  if (email) {
    const isTeacher = courses.some((c) => userHasCourseAccess(email, c));
    const isStudent = courses.some((c) => courseHasStudentEmail(c, email));
    if (isTeacher) return { email, role: 'teacher' };
    if (isStudent) return { email, role: 'student' };
    if (isApsEmailAllowed(email, cfg.allowedDomains)) return { email, role: AUTHORIZED_ROLE };
  }
  return { email, role: 'none' };
}

/** Which classes a viewer sees (Code.gs getViewerContext_, without the per-card display extras added in Phase 2). */
export function viewerCourses(viewer: Viewer, courses: Course[]): Course[] {
  if (isAllViewRole(viewer.role)) return courses;
  if (viewer.role === 'teacher') return courses.filter((c) => userHasCourseAccess(viewer.email, c) || courseHasStudentEmail(c, viewer.email));
  if (viewer.role === 'student') return courses.filter((c) => courseHasStudentEmail(c, viewer.email));
  return [];
}

export interface RolePermission { readOnly: boolean; buttons: boolean; filters: boolean; tabs: boolean }
export function defaultRolePermissions(): Record<string, RolePermission> {
  return {
    admin: { readOnly: false, buttons: true, filters: true, tabs: true },
    superadmin: { readOnly: false, buttons: true, filters: true, tabs: true },
    headmaster: { readOnly: false, buttons: true, filters: true, tabs: true },
    teacher: { readOnly: false, buttons: true, filters: true, tabs: true },
    student: { readOnly: false, buttons: true, filters: false, tabs: true },
    vcfo_amchsts_bod: { readOnly: true, buttons: false, filters: true, tabs: true },
    authorized: { readOnly: true, buttons: false, filters: false, tabs: false },
  };
}
/** Saved permissions (copy of the Script Property dashboardRolePermissions_v1 in ROLE_PERMISSIONS_JSON) merged over the defaults. */
export function rolePermissions(cfg: AppConfig): Record<string, RolePermission> {
  const defaults = defaultRolePermissions();
  let saved: Record<string, Partial<RolePermission>> = {};
  if (cfg.rolePermissionsJson) { try { saved = JSON.parse(cfg.rolePermissionsJson) || {}; } catch { console.error('[Config] ROLE_PERMISSIONS_JSON is not valid JSON — defaults used.'); } }
  const out: Record<string, RolePermission> = { ...(saved as Record<string, RolePermission>) };
  for (const role of Object.keys(defaults)) out[role] = { ...defaults[role], ...(saved[role] || {}) };
  return out;
}
export function rolePermission(cfg: AppConfig, role: string): RolePermission {
  return rolePermissions(cfg)[role] || { readOnly: true, buttons: false, filters: false, tabs: false };
}
export function canViewAllDashboardFilters(cfg: AppConfig, role: string): boolean {
  return rolePermission(cfg, role).filters && (isAdminOrHm(role) || role === BOD_ROLE);
}
/** Server-side guard for any change (Code.gs requireDashboardMutationPermission_). */
export function requireMutationPermission(cfg: AppConfig, viewer: Viewer, action: string): void {
  const p = rolePermission(cfg, viewer.role);
  if (isReadOnlyRole(viewer.role) || !p.buttons || p.readOnly) throw new Error('Read-only access: this account cannot ' + action + '.');
}

/** Corner-badge name. Admin / HM use their Google profile name in Apps Script (Admin Directory API — Phase 2);
 *  until then the same fallback Code.gs uses: "Role · localpart". Everyone else: name from the class rosters. */
export function viewerBadgeName(viewer: Viewer, courses: Course[], profileName?: string | null): string {
  if (isAdminOrHm(viewer.role)) {
    if (profileName) return profileName;
    const at = viewer.email.indexOf('@');
    return viewer.role.charAt(0).toUpperCase() + viewer.role.slice(1) + ' · ' + (at > -1 ? viewer.email.slice(0, at) : viewer.email);
  }
  const n = normalizeEmail(viewer.email);
  for (const c of courses) for (const p of (c.teachers || []).concat(c.students || [])) if (normalizeEmail(p.email) === n) return p.name as string; // as findDisplayName_ (no fallback when the roster row has no name)
  return viewer.email;
}

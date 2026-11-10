/**
 * Access Control — port of the Code.gs "ADMIN CONTROL → ACCESS CONTROL" module (r56, r75, r79, r91, r114, r120).
 * The catalog below is copied from AC_CATALOG_ (same keys, labels and cells). Keep the two in step until
 * Apps Script is retired; test/parity.test.ts checks every role × override combination against Code.gs.
 *
 * cells: one letter per role in AC_ROLES order — Y available (on by default), N available but OFF by default,
 * L not available for this role, A always on.
 */
import type { AccessOverrides } from '../data/types';

export const AC_ROLES = ['superadmin', 'admin', 'headmaster', 'teacher', 'student', 'vcfo_amchsts_bod', 'authorized'];
export const AC_ROLE_LABELS: Record<string, string> = { superadmin: 'Super Admin', admin: 'Admin', headmaster: 'Headmaster', teacher: 'Teacher', student: 'Student', vcfo_amchsts_bod: 'BOD / On-Call Coordinator', authorized: 'Authorized' };
export interface AcItem { key: string; label: string; cells: string; parent?: string }
export const AC_CATALOG: AcItem[] = [
{ key: 'classes', label: '🏫 Classes', cells: 'AAAAAAA' },
  { key: 'classes.list', parent: 'classes', label: 'Classes', cells: 'AAAAAAA' },
  { key: 'classes.teacherAvail', parent: 'classes', label: 'Teacher Availability Report', cells: 'AYYYLYL' },
  { key: 'classes.coverage', parent: 'classes', label: 'Temporary Class Coverage', cells: 'AYYYLLL' },
  { key: 'classes.coverageTracking', parent: 'classes', label: 'Class Coverage Tracking', cells: 'AYYYLLL' },
  { key: 'classes.tempTeacher', parent: 'classes', label: 'Temp Teacher', cells: 'AYYYLYL' },
  { key: 'directory', label: '📇 Active Directory', cells: 'AYYYYYY' },
  { key: 'directory.search', parent: 'directory', label: 'Directory Search', cells: 'AYYYYYY' },
  { key: 'directory.onboarding', parent: 'directory', label: 'Student Onboarding Status', cells: 'AYYYYYY' },
  { key: 'kb', label: '🎬 Knowledge Base – Videos', cells: 'AYYYYYY' },
  { key: 'tamilThadam', label: '👣 தமிழ்த் தடம் (Tamil Thadam)', cells: 'AYLLYLL' },
  { key: 'specialClasses', label: '🎓 சிறப்பு வகுப்புகள் (Special Classes)', cells: 'AYNNYNN' },
  { key: 'classChange', label: '🔄 Class Change Requests', cells: 'AYYLYYL' },
  { key: 'assignClassroom', label: 'Assign Classroom', cells: 'AYLLLYL' },
  { key: 'assignClassroom.remap', parent: 'assignClassroom', label: 'Re-Map Student', cells: 'AYLLLYL' },
  { key: 'assignClassroom.remove', parent: 'assignClassroom', label: 'Add/Remove Student', cells: 'AYLLLYL' },
  { key: 'letters', label: '📄 Letters', cells: 'AYYYLYL' },
  { key: 'letters.reference', parent: 'letters', label: 'Reference Letter', cells: 'AYYYLYL' },
  { key: 'letters.appreciation', parent: 'letters', label: 'Appreciation Certificate', cells: 'AYYYLYL' },
  { key: 'letters.teacherLetter', parent: 'letters', label: 'Teacher Appreciation Letter', cells: 'AYYLLYL' },
  { key: 'rlApprovals', label: '📄 Reference Letter Approvals', cells: 'LYYLLYL' },
  { key: 'attendance', label: '🗓️ Attendance', cells: 'AYYYYYL' },
  { key: 'exam', label: '📝 Examination', cells: 'AYYYYYL' },
  { key: 'exam.announcements', parent: 'exam', label: 'Announcements', cells: 'AYLLLYL' },
  { key: 'exam.classwork', parent: 'exam', label: 'Classwork', cells: 'AYLLLYL' },
  { key: 'exam.questionPaper', parent: 'exam', label: 'Exam Question Paper', cells: 'AYYYYYL' },
  { key: 'exam.grading', parent: 'exam', label: 'Grading', cells: 'AYYYYYL' },
  { key: 'assignMon', label: '📚 Assignment Monitoring', cells: 'AYYNNNN' },
  { key: 'meetPreview', label: '🎥 GCM - Preview', cells: 'AYLLLLL' },
  { key: 'zohoSync', label: '🔄 Zoho CRM Sync', cells: 'AYLLLLL' },
  { key: 'applyLeave', label: '📨 Apply Leave', cells: 'AYYYYYY' },
  { key: 'tickets', label: '🎫 Tickets', cells: 'AYYYYYY' },
  { key: 'tickets.self', parent: 'tickets', label: 'My Tickets · Assigned to Me · Create Ticket', cells: 'AYYYYYY' },
  { key: 'tickets.all', parent: 'tickets', label: 'All Tickets', cells: 'AYLLLLL' },
  { key: 'tickets.reports', parent: 'tickets', label: 'Ticket Reports', cells: 'AYLLLLL' },
  { key: 'tickets.settings', parent: 'tickets', label: 'Ticket Settings', cells: 'AYLLLLL' },
  { key: 'adminControl', label: '🛡️ Admin Control', cells: 'AALLLLL' },
  { key: 'adminControl.access', parent: 'adminControl', label: '🔐 Access Control', cells: 'AALLLLL' },
  { key: 'adminControl.userRoles', parent: 'adminControl', label: '👥 User Roles & Permissions', cells: 'ALLLLLL' },
  { key: 'adminControl.backup', parent: 'adminControl', label: '💾 Backup & Archive', cells: 'AYLLLLL' },
  { key: 'adminControl.schoolLeave', parent: 'adminControl', label: '🏖️ School Leave Management', cells: 'AYLLLLL' },
  { key: 'teacherMgmt', label: '👩‍🏫 Volunteer/Teacher Management', cells: 'AYLLLYL' },
  { key: 'teacherMgmt.appreciation', parent: 'teacherMgmt', label: 'Weekly Teacher Appreciation', cells: 'AYLLLYL' },
  { key: 'teacherMgmt.userCountry', parent: 'teacherMgmt', label: '🌍 Users outside the USA', cells: 'AYLLLLL' }
];
export const AC_OFF_MSG = 'ACCESS_OFF: This section has been turned off for your role by the APS administrator.';

const AC_PROTECTED: Record<string, boolean> = { 'superadmin|adminControl': true, 'superadmin|adminControl.access': true };
const AC_OPEN_ROLES = ['headmaster', 'teacher', 'student', 'vcfo_amchsts_bod', 'authorized'];
const BY_KEY = new Map(AC_CATALOG.map((i) => [i.key, i]));

export function acItem(key: string): AcItem | null { return BY_KEY.get(key) || null; }
export function acCell(item: AcItem | null, role: string): string { const i = AC_ROLES.indexOf(role); return i < 0 || !item ? '' : item.cells.charAt(i); }
export function acProtected(item: AcItem | null, role: string): boolean { return !!item && !!AC_PROTECTED[role + '|' + item.key]; }
export function acOpenCell(item: AcItem, role: string): boolean { return AC_OPEN_ROLES.indexOf(role) > -1 && acCell(item, role) === 'L'; }
export function acCellView(item: AcItem, role: string): string { return acOpenCell(item, role) ? 'O' : acCell(item, role); }
export function acSwitchable(item: AcItem, role: string): boolean { const c = acCell(item, role); return c === 'Y' || c === 'N' || (c === 'A' && !acProtected(item, role)); }
export function acEditableBy(item: AcItem, role: string, viewerRole: string): boolean {
  const c = acCell(item, role);
  if (c === 'Y' || c === 'N') return true;
  if (acOpenCell(item, role)) return true;
  if (c === 'A' && AC_OPEN_ROLES.indexOf(role) > -1 && !acProtected(item, role)) return true;
  return c === 'A' && viewerRole === 'superadmin' && !acProtected(item, role);
}
/** Value the admin table shows for one cell (L → false, A → true, Y → saved value or true, N → saved value or false). */
export function acCellValue(item: AcItem, role: string, ov: AccessOverrides): boolean {
  const c = acCell(item, role);
  if (acOpenCell(item, role)) { const ro = ov[role] || {}; return ro[item.key] === true; }
  if (c === 'L' || !c) return false;
  if (!acSwitchable(item, role)) return true;
  const r = ov[role] || {};
  return r[item.key] === undefined ? c !== 'N' : !!r[item.key];
}
/** { key: false } ONLY for what an admin has turned off (itself or its parent tab). Unknown roles → {}. */
export function acEffectiveForRole(role: string, ov: AccessOverrides): Record<string, false> {
  const out: Record<string, false> = {};
  if (AC_ROLES.indexOf(role) < 0) return out;
  const r = ov[role] || {};
  for (const item of AC_CATALOG) {
    if (!acSwitchable(item, role)) continue;
    if (r[item.key] === false || (acCell(item, role) === 'N' && r[item.key] !== true)) out[item.key] = false;
  }
  for (const item of AC_CATALOG) { if (item.parent && out[item.parent] === false && !acProtected(item, role)) out[item.key] = false; }
  return out;
}
export function apsTabAllowed(role: string, key: string, ov: AccessOverrides): boolean {
  const eff = acEffectiveForRole(role, ov);
  if (eff[key] === false) return false;
  const item = acItem(key);
  return !(item && item.parent && eff[item.parent] === false && !acProtected(item, role));
}

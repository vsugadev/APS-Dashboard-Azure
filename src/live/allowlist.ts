/**
 * Which Apps Script Script / User Properties may reach Azure (Phase 3). THE SAME LISTS are in the Apps Script file
 * AzureBridge.gs (which applies them before anything leaves Apps Script); test/live.test.ts fails if the two differ,
 * and fails if the copied Code.gs code reads a property that is in none of the lists below.
 *
 *  - LIVE_KEYS / LIVE_PREFIXES: live data and dashboard-saved settings — exported.
 *  - AZURE_SETTING_KEYS: Azure has its own value (Key Vault / App Service) — never taken from Apps Script.
 *  - NEVER_KEYS + NEVER_RE: secrets / credentials — never exported, whatever the lists say.
 */
/** Live data + settings saved from the dashboard (exact names). */
export const LIVE_KEYS: string[] = [
  'APS_CLASSES_ALWAYS_SHOW_EMAILS', 'APS_CLASSES_PRIMARY_ONLY_PREFIXES', 'APS_CLASSROOM_ROSTER_ACADEMIC_YEAR',
  'APS_CLASSROOM_ROSTER_ENABLED', 'APS_CLASS_TEACHER_AVAILABILITY_ACADEMIC_YEAR',
  'APS_CLASS_TEACHER_AVAILABILITY_EMAIL_ENABLED', 'APS_CLASS_TEACHER_AVAILABILITY_EMAIL_TO',
  'APS_CLASS_TEACHER_AVAILABILITY_EXCLUDE_EMAILS', 'APS_CLASS_TEACHER_AVAILABILITY_EXCLUDE_PREFIXES',
  'APS_CLASS_TEACHER_AVAILABILITY_HOUR', 'APS_CLASS_TEACHER_AVAILABILITY_TIMEZONE', 'APS_COUNTRY_FEATURE',
  'APS_GOOGLE_REVIEW_URL', 'APS_LEAVE_MAX_DAYS', 'APS_LEAVE_MAX_PAST_DAYS', 'APS_SCHOOL_LEAVE_ENABLED',
  'ASSIGNMENT_MONITORING_CONFIG', 'CACHE_SHEET_ID', 'ATTENDANCE_EXCLUDED_EMAILS', 'ATTENDANCE_MAIL_ADMIN_CC', 'ATTENDANCE_MAIL_FROM',
  'ATTENDANCE_ON_CALL_PREFIXES', 'ATTENDANCE_WEEK1_START', 'CLASS_CONSOLIDATION_EXCLUDE_REGEX',
  'EXAM_QUESTION_PAPER_CLOSE_AT_CLASS_START', 'EXAM_QUESTION_PAPER_HM_CAN_MANAGE',
  'EXAM_QUESTION_PAPER_RELEASE_MINUTES', 'EXAM_QUESTION_PAPER_STUDENT_TEACHER_ACCESS', 'FINAL_APPROVER_EMAIL',
  'GRADES_DATA_GEN', 'GRADES_LAST_SYNC_JSON', 'GRADE_CHANGE_APPROVER_EMAILS', 'HIDDEN_TEACHER_EMAIL_PREFIXES',
  'MISSING_GRADING_CONFIG', 'REFERENCE_LETTER_APPROVER_EMAILS', 'REFERENCE_LETTER_FINAL_APPROVER_EMAIL',
  'ROSTER_DATA_GEN', 'SCHOOL_LEAVE_EMAIL_LISTS', 'SCHOOL_LEAVE_EMAIL_PROFILE', 'SPECIAL_CLASSES_EMPTY_TEXT',
  'SPECIAL_CLASSES_INTRO_TEXT', 'SPECIAL_CLASSES_SHEET_NAME', 'SPECIAL_CLASSES_SHOW_COMPLETED',
  'TCC_CLEANUP_GRACE_MINUTES', 'TEMP_TEACHER_REMOVAL_HOUR', 'TICKET_MAIL_ALLOW_MAILAPP_FALLBACK', 'TICKET_MAIL_FROM',
  'ZOHO_SYNC_JOB', 'attendanceLastSyncSummary_v1', 'attendanceSyncDiagnostic_v1', 'classStartedMarkMap',
  'classStatusMap', 'lastLoginMap', 'lastSync', 'lastSyncError', 'onCallTeachers_v1', 'onboardedStudents',
  'presenceMap', 'rosterHiddenStaffVisible_v1', 'liveMap', 'teacherNotInClassMap', 'needsTechSupportMap',
  'teacherAvailabilityRealtimeMap', 'externalActivityRealtimeMap',
];
/** Per-person keys: Google review prompt, student notice accepted. */
export const LIVE_PREFIXES: string[] = ['GOOGLE_REVIEW_PROMPT_', 'apsStudentNoticeAccepted_v1:'];
/** Roles, role permissions, environment label and spreadsheet IDs: Azure's own (Key Vault / App Service). */
export const AZURE_SETTING_KEYS: string[] = [
  'SUPERADMIN_EMAILS', 'ADMIN_EMAILS', 'HEADMASTER_EMAILS', 'VCFO_AMCHATS_BOD_EMAILS', 'ON_CALL_COORDINATOR_EMAILS',
  'ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS', 'APS_GRADING_TEAM_EMAILS', 'dashboardRolePermissions_v1',
  'APS_ENVIRONMENT', 'TARGET_SPREADSHEET_ID', 'ATTENDANCE_SPREADSHEET_ID', 'SPECIAL_CLASSES_SPREADSHEET_ID',
  'ZOHO_SYNC_SPREADSHEET_ID', 'LIVE_QUESTION_PAPER_SPREADSHEET_ID',
];
/** Credentials (most are also caught by NEVER_RE). */
export const NEVER_KEYS: string[] = [
  'ATTENDANCE_OAUTH_CLIENT_ID', 'ATTENDANCE_OAUTH_CLIENT_SECRET', 'ATTENDANCE_REFRESH_TOKEN',
  'TICKET_MAIL_REFRESH_TOKEN', 'TICKET_MAIL_SERVICE_ACCOUNT_JSON', 'EXAM_QP_DOWNLOAD_KEY_SECRET',
  'PORTAL_SHARED_SECRET', 'AZURE_BRIDGE_SECRET',
];
export const NEVER_RE = /SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|SERVICE_ACCOUNT|API_KEY|CLIENT_ID|OAUTH|REFRESH|NONCE|SESSION/i;

export function liveAllowed(key: string): boolean {
  const k = String(key);
  if (NEVER_RE.test(k) || NEVER_KEYS.indexOf(k) > -1 || AZURE_SETTING_KEYS.indexOf(k) > -1) return false;
  return LIVE_KEYS.indexOf(k) > -1 || LIVE_PREFIXES.some((p) => k.indexOf(p) === 0);
}

export function filterLive(s: { script: Record<string, string>; user: Record<string, string> }): { script: Record<string, string>; user: Record<string, string> } {
  const pick = (o: Record<string, string>) => { const r: Record<string, string> = {}; for (const k of Object.keys(o || {})) if (liveAllowed(k) && typeof o[k] === 'string') r[k] = o[k]; return r; };
  return { script: pick(s.script), user: pick(s.user) };
}

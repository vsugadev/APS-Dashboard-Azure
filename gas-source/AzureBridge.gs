/**
 * AzureBridge.gs — APS Classroom Dashboard r122. A separate file of the SAME Dashboard Apps Script project (globals are
 * shared across .gs files; it reuses the Parent Portal bridge helpers portalErr_ / portalHex_ and zhSafeErr_).
 * Kept out of Code.gs so adding / removing the Azure bridge never touches the main file.
 */
/* ==========================================================================
 *  r122 — ☁️ AZURE DASHBOARD LIVE-DATA BRIDGE (signed, READ-ONLY, server-to-server)
 * --------------------------------------------------------------------------
 *  The Azure version of the dashboard (strangler migration, Phase 3) reads the SAME live data this project keeps in
 *  Script / User Properties: online now (presenceMap), last login, onboarded students, manual class status + the
 *  started mark, on-call teachers, the Hide/Show staff toggle, sync status / diagnostics and the settings admins save
 *  from the dashboard. Apps Script stays production; this endpoint never changes anything.
 *   - Reached through the existing doPost (PortalBridge.gs) when the body has azure:1 — the Parent Portal path is
 *     unchanged. Body: { azure:1, p:<JSON string>, ts:<ms>, nonce:<uuid>, sig:hex(HMAC(AZURE_BRIDGE_SECRET, ts+'.'+nonce+'.'+p)) }.
 *     ts within 5 minutes; each nonce works once (CacheService, 10 min). Separate secret from the Portal: Script Property
 *     AZURE_BRIDGE_SECRET (at least 32 characters; the same value is in Azure Key Vault). Unset → NOT_CONFIGURED.
 *   - One action: liveSnapshot → { v:1, at, script:{…}, user:{…} } with ONLY the allow-listed keys below
 *     (exact names + per-person prefixes). Secrets / credentials are refused by name AND by pattern, whatever the lists
 *     say. Roles, role permissions, the environment label and spreadsheet IDs are Azure's own and are not sent.
 *   - The Azure app keeps the snapshot ~20 s and calls only while someone uses the Azure dashboard. Successful calls
 *     are not logged to Portal_Bridge_Log (no sheet write per call); failures go to the execution log (no values).
 *   - The lists are mirrored in the Azure project (src/live/allowlist.ts); its tests fail if they ever differ.
 * ========================================================================== */
var AZURE_BRIDGE_LIVE_KEYS_ = [
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
  'teacherAvailabilityRealtimeMap', 'externalActivityRealtimeMap'
];
var AZURE_BRIDGE_LIVE_PREFIXES_ = ['GOOGLE_REVIEW_PROMPT_', 'apsStudentNoticeAccepted_v1:'];
var AZURE_BRIDGE_AZURE_SETTING_KEYS_ = [
  'SUPERADMIN_EMAILS', 'ADMIN_EMAILS', 'HEADMASTER_EMAILS', 'VCFO_AMCHATS_BOD_EMAILS', 'ON_CALL_COORDINATOR_EMAILS',
  'ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS', 'APS_GRADING_TEAM_EMAILS', 'dashboardRolePermissions_v1',
  'APS_ENVIRONMENT', 'TARGET_SPREADSHEET_ID', 'ATTENDANCE_SPREADSHEET_ID', 'SPECIAL_CLASSES_SPREADSHEET_ID',
  'ZOHO_SYNC_SPREADSHEET_ID', 'LIVE_QUESTION_PAPER_SPREADSHEET_ID'
];
var AZURE_BRIDGE_NEVER_KEYS_ = [
  'ATTENDANCE_OAUTH_CLIENT_ID', 'ATTENDANCE_OAUTH_CLIENT_SECRET', 'ATTENDANCE_REFRESH_TOKEN',
  'TICKET_MAIL_REFRESH_TOKEN', 'TICKET_MAIL_SERVICE_ACCOUNT_JSON', 'EXAM_QP_DOWNLOAD_KEY_SECRET',
  'PORTAL_SHARED_SECRET', 'AZURE_BRIDGE_SECRET'
];
var AZURE_BRIDGE_NEVER_RE_ = /SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|SERVICE_ACCOUNT|API_KEY|CLIENT_ID|OAUTH|REFRESH|NONCE|SESSION/i;
var AZURE_BRIDGE_NONCE_PREFIX_ = 'aps_az_nonce_';
var AZURE_BRIDGE_MAX_SKEW_MS_ = 5 * 60 * 1000;

/** True only for an allow-listed, non-secret key. */
function azureBridgeAllowed_(key) {
  var k = String(key);
  if (AZURE_BRIDGE_NEVER_RE_.test(k) || AZURE_BRIDGE_NEVER_KEYS_.indexOf(k) > -1 || AZURE_BRIDGE_AZURE_SETTING_KEYS_.indexOf(k) > -1) return false;
  if (AZURE_BRIDGE_LIVE_KEYS_.indexOf(k) > -1) return true;
  return AZURE_BRIDGE_LIVE_PREFIXES_.some(function (p) { return k.indexOf(p) === 0; });
}

/** doPost route for azure:1 (PortalBridge.gs). Same answer shape as the Portal bridge: { ok, result } / { ok:false, code, message }. */
function azureBridgeDoPost_(body) {
  var out;
  try {
    var req = azureBridgeVerify_(body);
    if (req.action !== 'liveSnapshot') throw portalErr_('BAD_REQUEST', 'Unknown action.');
    out = { ok: true, result: azureBridgeLiveSnapshot_() };
  } catch (err) {
    out = { ok: false, code: err && err.portalCode || 'ERROR', message: err && err.portalCode ? String(err.message) : 'The APS Dashboard could not complete this request.' };
    console.error('[AzureBridge] ' + (err && err.portalCode ? 'refused: ' + err.portalCode : zhSafeErr_(err)));
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Signature, freshness and single use — as portalVerify_, with the Azure secret. Returns the parsed { action }. */
function azureBridgeVerify_(body) {
  var secret = String(PropertiesService.getScriptProperties().getProperty('AZURE_BRIDGE_SECRET') || '');
  if (secret.length < 32) throw portalErr_('NOT_CONFIGURED', 'The Azure bridge is not configured on the Dashboard (AZURE_BRIDGE_SECRET).');
  var p = String(body.p || ''), ts = String(body.ts || ''), nonce = String(body.nonce || ''), sig = String(body.sig || '');
  if (p.length > 2000 || !/^\d{12,14}$/.test(ts) || !/^[0-9a-f-]{36}$/i.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) throw portalErr_('BAD_REQUEST', 'Malformed request.');
  var expect = portalHex_(Utilities.computeHmacSha256Signature(ts + '.' + nonce + '.' + p, secret));
  var diff = expect.length ^ sig.length;
  for (var i = 0; i < expect.length && i < sig.length; i++) diff |= expect.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) throw portalErr_('BAD_SIGNATURE', 'Request signature is not valid.');
  if (Math.abs(Date.now() - Number(ts)) > AZURE_BRIDGE_MAX_SKEW_MS_) throw portalErr_('STALE', 'Request expired.');
  var cache = CacheService.getScriptCache();
  if (cache.get(AZURE_BRIDGE_NONCE_PREFIX_ + nonce)) throw portalErr_('REPLAY', 'Request already used.');
  cache.put(AZURE_BRIDGE_NONCE_PREFIX_ + nonce, '1', 600);
  var req = JSON.parse(p);
  if (!req || typeof req.action !== 'string') throw portalErr_('BAD_REQUEST', 'Malformed request.');
  return req;
}

/** The allow-listed Script Properties and User Properties (the deploying account's second store), as stored. */
function azureBridgeLiveSnapshot_() {
  function pick(all) {
    var o = {};
    Object.keys(all || {}).forEach(function (k) { if (typeof all[k] === 'string' && azureBridgeAllowed_(k)) o[k] = all[k]; });
    return o;
  }
  return {
    v: 1,
    at: new Date().toISOString(),
    script: pick(PropertiesService.getScriptProperties().getProperties()),
    user: pick(PropertiesService.getUserProperties().getProperties())
  };
}

/**
 * AzureBridge.gs — APS Classroom Dashboard r122 (r127: + the r123 Teacher Copy / Send to Student settings in the export list; r131: heartbeat action; r132: write-through of Admin settings saves; r133: read-through of the remaining read screens; r134: teacher class-card write-through + the REVERSE bridge for Special Classes owned by Azure SQL; r135: every remaining dashboard action + Promise results + large uploads; r136: chat owned by Azure SQL; r137: live Google Meet class status for Azure + jobs run on Azure's timetable; r138: + classMeetEndedMarkMap in the export list). A separate file of the SAME Dashboard Apps Script project (globals are
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
 *   - r131 — second action, heartbeat (the first write): { action:'heartbeat', v:1, emails:[…] } — people using the Azure
 *     dashboard (Azure sends the e-mail of its own signed-in sessions, batched every ~15 s) are recorded exactly like
 *     a visit here (recordHeartbeat_): "online now" (presenceMap) and Last Login → DB slot (lastLoginMap). Only
 *     APS-domain e-mails, at most 200 per call, one lock + one write per store per call.
 *   - r132 — third action, call (write phase step 1, Admin settings saves): { action:'call', v:1, fn, args, email } runs
 *     ONE of the Code.gs functions in AZURE_BRIDGE_CALLS_ for that person, exactly as if they had pressed Save here:
 *     Apps Script works out the person's role ITSELF from the e-mail (getViewerRoleForEmail_ — Azure's role is never
 *     used), makes a session that lives only for this call, and the function's own checks (Admin only, Access
 *     Control tab, read-only roles, validation, locks, audit with the person's e-mail) decide. Not in the list → refused.
 *     The list is mirrored in Azure (src/api/endpoints/writes.ts); its test fails if they differ.
 *   - r133 — the same call action also runs the read screens Azure cannot read itself yet (they need Classroom, Drive,
 *     Zoho, locks …): AZURE_BRIDGE_READS_. Same rules: role decided here, the function's own checks, nothing else.
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
  'EXAM_QUESTION_PAPER_RELEASE_MINUTES', 'EXAM_QUESTION_PAPER_STUDENT_TEACHER_ACCESS',
  'EXAM_QP_TEACHER_COPY_OPEN_MINUTES', 'EXAM_QP_TEACHER_COPY_EMAIL_ENABLED', 'EXAM_QP_SEND_TO_STUDENT_OPEN_MINUTES', // r123 Admin settings
  'FINAL_APPROVER_EMAIL',
  'GRADES_DATA_GEN', 'GRADES_LAST_SYNC_JSON', 'GRADE_CHANGE_APPROVER_EMAILS', 'HIDDEN_TEACHER_EMAIL_PREFIXES',
  'MISSING_GRADING_CONFIG', 'REFERENCE_LETTER_APPROVER_EMAILS', 'REFERENCE_LETTER_FINAL_APPROVER_EMAIL',
  'ROSTER_DATA_GEN', 'SCHOOL_LEAVE_EMAIL_LISTS', 'SCHOOL_LEAVE_EMAIL_PROFILE', 'SPECIAL_CLASSES_EMPTY_TEXT',
  'SPECIAL_CLASSES_INTRO_TEXT', 'SPECIAL_CLASSES_SHEET_NAME', 'SPECIAL_CLASSES_SHOW_COMPLETED',
  'TCC_CLEANUP_GRACE_MINUTES', 'TEMP_TEACHER_REMOVAL_HOUR', 'TICKET_MAIL_ALLOW_MAILAPP_FALLBACK', 'TICKET_MAIL_FROM',
  'ZOHO_SYNC_JOB', 'attendanceLastSyncSummary_v1', 'attendanceSyncDiagnostic_v1', 'classStartedMarkMap', 'classMeetEndedMarkMap',
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
var AZURE_BRIDGE_MAX_P_ = 100000;       // r131: heartbeat batch; r132: a settings save (e.g. Assignment Monitoring config) — was 2000
var AZURE_BRIDGE_MAX_CALL_P_ = 25000000; // r135: a call may carry uploads (ticket attachments 3 × 5 MB, question paper PDF 15 MB, as base64)
var AZURE_BRIDGE_MAX_HEARTBEATS_ = 200;
/** r132 — the ONLY Code.gs functions Azure may run (Admin settings saves; synchronous; JSON in / out). */
var AZURE_BRIDGE_CALLS_ = [
  'saveAccessControl', 'saveAssignmentMonitoringConfig', 'saveMissingGradingConfig', 'saveMarkCompleteSettings',
  'saveTeacherAppreciationConfig', 'setTeacherAppreciationEmails', 'saveSpecialClassesSettings', 'saveTicketSettings',
  'setExamQuestionPaperDefaults', 'setExamQuestionPaperAutoEmail', 'setRosterHiddenStaffVisible',
  // r134: teacher class-card actions (Mark Live, Teacher NOT in Class, Needs Tech Support, availability, class status)
  'setLiveStatus', 'setTeacherNotInClassStage', 'setNeedsTechSupportStage', 'setTeacherAvailabilityStatus', 'setClassStatusManual',
  // r134: Special Classes programs — Apps Script writes its Sheet while Apps Script owns them (SPECIAL_CLASSES_OWNER not 'azure')
  'saveSpecialClass', 'setSpecialClassActive',
  // r135: every remaining dashboard action (requests, tickets, attendance, chat, exam papers, coverage, Classroom roster, Zoho, admin jobs)
  'acceptStudentLoginNotice', 'addSpecialClassEnrollments', 'addStudentToClassroom', 'addTicketParticipant', 'amAdminAction', 'applyCoverage',
  'assignStudentToClassroom', 'assignTicket', 'attachExamQuestionPaperLink', 'autoMapCourseMeetLinks', 'bulkOverrideAttendance',
  'cancelAddStudentRequest', 'cancelMyClassChangeRequest', 'cancelZohoSyncJob', 'createTempTeacherAssignment', 'createTicket',
  'deleteDashboardUserRole', 'downloadExamQuestionPaper', 'downloadExamQuestionPaperTeacherCopy', 'editAttendanceRecordStatus',
  'fetchExamQuestionPaperDownload', 'forceSyncAttendanceNow', 'forceSyncClassroomData', 'generateAnnouncementId', 'postChatMessage',
  'previewExamQuestionPaper', 'rebuildExamQuestionPaperSummary', 'recordGoogleReviewEvent', 'recordMeetJoinClick', 'recordViewerCountry',
  'refreshClassMeetLiveStatus', 'removeStudentFromClassroom', 'removeTicketParticipant', 'replyTicket', 'retryCoverage',
  'retryLeaveNotification', 'retryRemovalEmail', 'retryTeacherAppreciationFailed', 'runAuditArchiveNow', 'runSystemBackupNow',
  'runTeacherAppreciationNow', 'runTempDataCleanup', 'saveClassCoverage', 'saveCourseMeetLinkMapping', 'saveDashboardUserRole',
  'saveExamQuestionPaper', 'saveZohoFieldMapping', 'saveZohoSyncSchedule', 'sendExamQuestionPaperToAllEligible',
  'sendExamQuestionPaperToStudent', 'sendMissingGradingNow', 'sendWeeklyClassTeacherAvailabilityTestEmail', 'setExamQuestionPaperStatus',
  'setMyDefaultCountry', 'setUserCountryByAdmin', 'startZohoSyncJob', 'stepZohoSyncJob', 'submitAdminInitiatedReferenceLetter',
  'submitClassTeacherAvailability', 'submitGradeChangeRequest', 'submitLeaveRequest', 'submitParentFeedback',
  'submitReferenceLetterRequest', 'submitTimingChangeRequest', 'submitUserIdea', 'syncGrading', 'testZohoFieldMapping',
  'updateSpecialClassEnrollment', 'updateTicket'
];
/** r133 — read screens that need Google services / locks Azure does not use yet (Phase 2 "still not on Azure"). */
var AZURE_BRIDGE_READS_ = [
  'checkZohoConnection', 'exportExamQuestionPaperAudit', 'exportGrading', 'getAddStudentContext', 'getAdminWebAppDeploymentInfo',
  'getAssignmentMonitoringAdmin', 'getExamQuestionPaperContext', 'getExaminationCourseOptions', 'getGradingData',
  'getMaintenanceStatus', 'getMeetPreviewData', 'getMissingGradingAdmin', 'getTamilThadam', 'getTeacherAppreciationData',
  'getTicketAttachment', 'getZohoFieldMapping', 'getZohoSyncStatus', 'previewExaminationAnnouncement',
  'previewExaminationClasswork', 'previewZohoStudentSync', 'searchExaminationAnnouncement',
  // r135
  'getChatMessages', 'getMyExamQuestionPapers', 'getWeeklyPanelData', 'resolveTicketStudent'
];
/** r135 — a function that answers with a Promise (PDF stamping: preview / download / send question paper): the call
 *  answers { pending: job } at once; Apps Script finishes the Promise in the same execution and keeps the result for
 *  10 minutes (CacheService, in 90 000-character pieces); Azure collects it with the signed action "result". */
var AZURE_BRIDGE_JOB_PREFIX_ = 'aps_az_job_';
var AZURE_BRIDGE_JOB_PIECE_ = 90000;
var AZURE_BRIDGE_JOB_MAX_PIECES_ = 300;   // ≈ 27 MB of answer text (a 15 MB PDF as base64 ≈ 20 MB)
var AZURE_BRIDGE_SESSION_SECONDS_ = 420;  // r135: long actions (backups, syncs, batch sends) still have their session

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
    if (req.action === 'liveSnapshot') out = { ok: true, result: azureBridgeLiveSnapshot_() };
    else if (req.action === 'heartbeat') out = { ok: true, result: azureBridgeHeartbeats_(req) }; // r131
    else if (req.action === 'call') out = { ok: true, result: azureBridgeCall_(req) }; // r132
    else if (req.action === 'result') out = { ok: true, result: azureBridgeJobResult_(req) }; // r135
    else if (req.action === 'job') out = { ok: true, result: azureBridgeRunJob_(req) }; // r137
    else if (req.action === 'classLive') out = { ok: true, result: azureBridgeClassLive_() }; // r137
    else if (req.action === 'chatChanged') { chatChanged_(); out = { ok: true, result: { changed: true } }; } // r136: a message was posted on Azure
    else throw portalErr_('BAD_REQUEST', 'Unknown action.');
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
  if (p.length > AZURE_BRIDGE_MAX_CALL_P_ || !/^\d{12,14}$/.test(ts) || !/^[0-9a-f-]{36}$/i.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) throw portalErr_('BAD_REQUEST', 'Malformed request.');
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
  if (req.action !== 'call' && p.length > AZURE_BRIDGE_MAX_P_) throw portalErr_('BAD_REQUEST', 'Malformed request.'); // r135: only a call may be large
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

/**
 * r131 — heartbeats from the Azure dashboard: the same records as recordHeartbeat_ (Code.gs) for a batch of people —
 * presenceMap (online now; login time kept within the online window; entries older than 24 h dropped) and the
 * Last Login DB slot (only moved forward). One script lock and one write per store for the whole batch; a busy lock
 * records nothing ({ busy:true }) and Azure sends the batch again. Only syntactically valid APS-domain e-mails.
 */
function azureBridgeHeartbeats_(req) {
  var list = Array.isArray(req.emails) ? req.emails.slice(0, AZURE_BRIDGE_MAX_HEARTBEATS_) : [];
  var seen = {}, emails = [];
  list.forEach(function (e) { var n = normalizeEmail_(String(e || '')); if (n && !seen[n] && isApsEmailAllowed_(n)) { seen[n] = true; emails.push(n); } });
  var ignored = list.length - emails.length;
  if (!emails.length) return { recorded: 0, ignored: ignored };
  var lock = LockService.getScriptLock(), locked = false;
  try { locked = lock.tryLock(5000); } catch (e) { locked = false; }
  if (!locked) return { recorded: 0, ignored: ignored, busy: true };
  try {
    var now = new Date(), iso = now.toISOString();
    var map = getPresenceMap_();
    emails.forEach(function (n) {
      var ex = map[n];
      var fresh = !ex || (now.getTime() - new Date(ex.lastSeen).getTime()) > PRESENCE_ONLINE_WINDOW_MINUTES * 60000;
      map[n] = { lastSeen: iso, loginAt: fresh ? iso : (ex.loginAt || iso) };
    });
    Object.keys(map).forEach(function (k) { if (!map[k] || (now.getTime() - new Date(map[k].lastSeen).getTime()) > 86400000) delete map[k]; });
    apsBigSetSafe_(PRESENCE_PROP_KEY, JSON.stringify(map), 'Online status');
    var raw = apsBigGet_(LAST_LOGIN_PROP_KEY), ll = raw ? JSON.parse(raw) : {}, changed = false;
    emails.forEach(function (n) {
      var rawEntry = ll[n], entry = normalizeLastLoginEntry_(rawEntry);
      var ch = JSON.stringify(rawEntry || null) !== JSON.stringify(entry);
      if (!entry.db || now.getTime() > new Date(entry.db).getTime()) { entry.db = iso; ch = true; }
      if (ch) { ll[n] = entry; changed = true; }
    });
    if (changed) apsBigSetSafe_(LAST_LOGIN_PROP_KEY, JSON.stringify(ll), 'Last login');
    return { recorded: emails.length, ignored: ignored };
  } finally {
    try { lock.releaseLock(); } catch (e2) { /* ignore */ }
  }
}

/**
 * r132 — runs one allow-listed Code.gs function for the person Azure signed in (write phase step 1). Returns
 * { value } or { error: <the function's own message> } (one line, no stack). The temporary session is removed after.
 */
function azureBridgeCall_(req) {
  var fn = String(req.fn || '');
  var g = globalThis;
  if ((AZURE_BRIDGE_CALLS_.indexOf(fn) === -1 && AZURE_BRIDGE_READS_.indexOf(fn) === -1) || typeof g[fn] !== 'function') throw portalErr_('BAD_REQUEST', 'This function cannot be called from Azure.');
  var email = normalizeEmail_(String(req.email || ''));
  if (!email || !isApsEmailAllowed_(email)) throw portalErr_('BAD_REQUEST', 'Not an APS account.');
  var args = Array.isArray(req.args) ? req.args : [];
  if (args.length > 10) throw portalErr_('BAD_REQUEST', 'Too many arguments.');
  var viewer = getViewerRoleForEmail_(email, readAllCoursesFromCache_()); // the role is decided HERE, never by Azure
  if (!viewer || !viewer.role || viewer.role === 'none') return { error: 'You are not authorized to use the APS Dashboard.' };
  var cache = CacheService.getScriptCache(), tok = 'az_' + Utilities.getUuid().replace(/-/g, '');
  cache.put(SESSION_CACHE_PREFIX_ + tok, JSON.stringify({ email: viewer.email, role: viewer.role, issuedAt: Date.now(), via: 'azure' }), AZURE_BRIDGE_SESSION_SECONDS_);
  var later = false;
  try {
    var v = g[fn].apply(null, [tok].concat(args));
    if (v && typeof v.then === 'function') { // r135: finished later in this same execution; Azure collects it with "result"
      later = true;
      var job = Utilities.getUuid().replace(/-/g, '');
      azureBridgeJobPut_(job, { email: viewer.email, state: 'PENDING' });
      v.then(function (x) { azureBridgeJobPut_(job, { email: viewer.email, state: 'DONE', value: x === undefined ? null : x }); },
             function (e) { azureBridgeJobPut_(job, { email: viewer.email, state: 'DONE', error: azureBridgeSafeMsg_(e) }); })
       .then(function () { try { cache.remove(SESSION_CACHE_PREFIX_ + tok); } catch (eR) { /* expires */ } });
      return { pending: job };
    }
    return { value: v === undefined ? null : JSON.parse(JSON.stringify(v)) };
  } catch (e) {
    var m = azureBridgeSafeMsg_(e);
    console.warn('[AzureBridge] call ' + fn + ' refused: ' + m.slice(0, 120));
    return { error: m };
  } finally {
    if (!later) { try { cache.remove(SESSION_CACHE_PREFIX_ + tok); } catch (eR) { /* expires in 7 minutes */ } }
  }
}
function azureBridgeSafeMsg_(e) { return String(e && e.message || e).split('\n')[0].replace(/(Bearer\s+|token[=:]\s*|secret[=:]\s*)[^\s,)]+/gi, '$1[hidden]').slice(0, 300); }
/** r135: keeps a job's state / answer for 10 minutes, split into pieces (CacheService holds ≤ 100 KB per key). */
function azureBridgeJobPut_(job, rec) {
  var cache = CacheService.getScriptCache(), text = JSON.stringify(rec), n = Math.ceil(text.length / AZURE_BRIDGE_JOB_PIECE_) || 1;
  if (n > AZURE_BRIDGE_JOB_MAX_PIECES_) { text = JSON.stringify({ email: rec.email, state: 'DONE', error: 'This answer is too large to send to the Azure dashboard — please use the APS Dashboard for this action.' }); n = 1; }
  var put = {};
  for (var i = 0; i < n; i++) put[AZURE_BRIDGE_JOB_PREFIX_ + job + '_' + i] = text.slice(i * AZURE_BRIDGE_JOB_PIECE_, (i + 1) * AZURE_BRIDGE_JOB_PIECE_);
  put[AZURE_BRIDGE_JOB_PREFIX_ + job] = String(n);
  cache.putAll(put, 600);
}
/** r135 action "result": { job, email } → { pending: true } | { value } | { error }. Only the same person's job. */
function azureBridgeJobResult_(req) {
  var job = String(req.job || ''), email = normalizeEmail_(String(req.email || ''));
  if (!/^[0-9a-f]{32}$/.test(job) || !email) throw portalErr_('BAD_REQUEST', 'Malformed request.');
  var cache = CacheService.getScriptCache(), n = Number(cache.get(AZURE_BRIDGE_JOB_PREFIX_ + job) || 0);
  if (!n) return { error: 'This action is no longer available — please try again.' };
  var keys = []; for (var i = 0; i < n; i++) keys.push(AZURE_BRIDGE_JOB_PREFIX_ + job + '_' + i);
  var got = cache.getAll(keys), text = '';
  for (var k = 0; k < keys.length; k++) { if (typeof got[keys[k]] !== 'string') return { error: 'This action is no longer available — please try again.' }; text += got[keys[k]]; }
  var rec = JSON.parse(text);
  if (normalizeEmail_(rec.email) !== email) throw portalErr_('BAD_REQUEST', 'Not your request.');
  if (rec.state !== 'DONE') return { pending: true };
  cache.removeAll(keys.concat([AZURE_BRIDGE_JOB_PREFIX_ + job]));
  return typeof rec.error === 'string' ? { error: rec.error } : { value: rec.value === undefined ? null : JSON.parse(JSON.stringify(rec.value)) };
}

/* ==========================================================================
 *  r134 — REVERSE BRIDGE: Special Classes OWNED by Azure SQL (Azure database stage 3)
 * --------------------------------------------------------------------------
 *  Switch: Script Property SPECIAL_CLASSES_OWNER = azure (set it at the SAME time as the Azure app setting SC_OWNER=azure;
 *  see docs/DATABASE.md "Stage 3"). Unset / anything else → nothing here runs and Special Classes work exactly as before.
 *  When on, this dashboard's Special Classes screens read the programs from Azure (scRecords_ → scAzureOwnedRecords_)
 *  and + Add / Edit / Activate / Deactivate are saved by Azure (saveSpecialClass / setSpecialClassActive →
 *  scAzureOwnedSave_). One owner, so both dashboards always show the same records. The Google Sheet is no longer
 *  written for programs; it stays as the last copy before the switch (ONE_TIME_scCopyAzureToSheet puts Azure's back).
 *   - POST <AZURE_DASHBOARD_URL>/api/bridge  { gas:1, p, ts, nonce, sig } with
 *     sig = hex(HMAC-SHA256(AZURE_BRIDGE_SECRET, 'gas.' + ts + '.' + nonce + '.' + p)) — the same secret, a different
 *     signed text, so a request can never be replayed in the other direction.
 *   - Azure decides the person's role ITSELF from the e-mail (same rules as its sign-in); only the e-mail is sent.
 *   - Script Property AZURE_DASHBOARD_URL = https://<the Azure app>.azurewebsites.net (no trailing slash).
 *   - Loop guard: a save that ARRIVED from Azure (session via 'azure') is never sent back — the owners disagree, so it
 *     is refused with a clear message instead of writing the Sheet.
 * ========================================================================== */
var SC_AZURE_OWNER_PROP_ = 'SPECIAL_CLASSES_OWNER';
var SC_AZURE_CACHE_KEY_ = 'aps_special_classes_azure_v1';
var SC_AZURE_CACHE_SECONDS_ = 60;

function scAzureOwner_() {
  try { return String(PropertiesService.getScriptProperties().getProperty(SC_AZURE_OWNER_PROP_) || '').trim().toLowerCase() === 'azure'; }
  catch (e) { return false; }
}
/** true when this session was made by azureBridgeCall_ (the request came FROM Azure). */
function scSessionViaAzure_(sessionToken) {
  try { var raw = CacheService.getScriptCache().get(SESSION_CACHE_PREFIX_ + String(sessionToken || '')); return !!raw && JSON.parse(raw).via === 'azure'; }
  catch (e) { return false; }
}
/** One signed call to Azure. Returns `result`; throws a short, safe message (never the secret or Azure's page). */
function azureReverseCall_(payload) {
  var props = PropertiesService.getScriptProperties();
  var secret = String(props.getProperty('AZURE_BRIDGE_SECRET') || ''), base = String(props.getProperty('AZURE_DASHBOARD_URL') || '').trim().replace(/\/+$/, '');
  if (secret.length < 32 || !/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(base)) { console.error('[AzureBridge] reverse: AZURE_BRIDGE_SECRET / AZURE_DASHBOARD_URL not set'); throw new Error(SC_UNAVAILABLE_MSG_); }
  var p = JSON.stringify(payload), ts = String(Date.now()), nonce = Utilities.getUuid();
  var sig = portalHex_(Utilities.computeHmacSha256Signature('gas.' + ts + '.' + nonce + '.' + p, secret));
  var res, j;
  try {
    res = UrlFetchApp.fetch(base + '/api/bridge', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: false,
      payload: JSON.stringify({ gas: 1, p: p, ts: ts, nonce: nonce, sig: sig }) });
    j = JSON.parse(res.getContentText());
  } catch (e) { console.error('[AzureBridge] reverse ' + payload.action + ' failed: ' + zhSafeErr_(e)); throw new Error(SC_UNAVAILABLE_MSG_); }
  if (!j || j.ok !== true) { console.error('[AzureBridge] reverse ' + payload.action + ' refused: ' + String(j && j.code || ('HTTP ' + res.getResponseCode())).slice(0, 40)); throw new Error(SC_UNAVAILABLE_MSG_); }
  return j.result;
}
/** Grid JSON from Azure: dates come as {"$d": iso}. */
function scAzureDecode_(txt) {
  return JSON.parse(txt, function (k, v) { return v && typeof v === 'object' && !Array.isArray(v) && typeof v.$d === 'string' && Object.keys(v).length === 1 ? new Date(v.$d) : v; });
}
/** scRecords_ when Azure owns the programs: the same parsing (scParseRow_) over Azure's grid; cached 60 s. */
function scAzureOwnedRecords_() {
  var cache = CacheService.getScriptCache();
  try { var hit = cache.get(SC_AZURE_CACHE_KEY_); if (hit) return JSON.parse(hit); } catch (e) { /* re-read */ }
  var r = azureReverseCall_({ action: 'scGrid', v: 1 });
  var values = scAzureDecode_(String(r.grid || '[]')), tz = String(r.timeZone || APS_TZ), out = [], seen = {};
  var header = (values[0] || []).map(function (h) { return String(h || '').trim(); }), map = {};
  header.forEach(function (h, i) {
    var n = scNorm_(h); if (!n) return;
    SC_FIELDS_.forEach(function (f) { if (map[f[0]] === undefined && (scNorm_(f[1]) === n || f[2].indexOf(n) > -1)) map[f[0]] = i; });
  });
  values.slice(1).forEach(function (row, i) {
    try {
      var padded = row.slice(); while (padded.length < header.length) padded.push('');
      var rec = scParseRow_(padded, map, tz, i + 2);
      if (!rec) return;
      if (seen[rec.id]) { console.warn('[SpecialClasses] row ' + (i + 2) + ' skipped: duplicate ID ' + rec.id); return; }
      seen[rec.id] = true; out.push(rec);
    } catch (eRow) { console.warn('[SpecialClasses] row ' + (i + 2) + ' skipped: ' + (eRow && eRow.message)); }
  });
  try { cache.put(SC_AZURE_CACHE_KEY_, JSON.stringify(out), SC_AZURE_CACHE_SECONDS_); } catch (e2) { /* too big — fine */ }
  return out;
}
/** saveSpecialClass / setSpecialClassActive when Azure owns the programs: Azure runs the same Code.gs function. */
function scAzureOwnedSave_(fn, sessionToken, args) {
  if (scSessionViaAzure_(sessionToken)) throw new Error('Special Classes owner settings disagree (Apps Script SPECIAL_CLASSES_OWNER=azure, but Azure SC_OWNER is not azure). Ask an Admin to set both the same — nothing was saved.');
  var s = requireValidSession_(sessionToken);
  var r = azureReverseCall_({ action: 'call', v: 1, fn: fn, args: args, email: s.email });
  try { CacheService.getScriptCache().removeAll([SC_AZURE_CACHE_KEY_, SC_CACHE_KEY_]); } catch (e) { /* expires in 60 s */ }
  if (r && typeof r.error === 'string') throw new Error(r.error);
  return r ? r.value : null;
}
/** Owner only (editor): roll-back helper — writes Azure's current programs into the Google Sheet (before switching
 *  SPECIAL_CLASSES_OWNER back), so no change made while Azure owned them is lost. Audit rows stay in Azure SQL. */
function ONE_TIME_scCopyAzureToSheet() {
  apsRequireOwnerOrTrigger_(null);
  var r = azureReverseCall_({ action: 'scGrid', v: 1 });
  var values = scAzureDecode_(String(r.grid || '[]'));
  if (!values.length) { console.log('Azure has no programs sheet — nothing copied.'); return { ok: false, rows: 0 }; }
  var width = values.reduce(function (m, row) { return Math.max(m, row.length); }, 0);
  values = values.map(function (row) { var x = row.slice(); while (x.length < width) x.push(''); return x; });
  var ss = openSpreadsheetByIdWithRetry_(scSpreadsheetId_(), '[SpecialClasses]'), name = scSheetName_(), sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
  sh.getRange(1, 1, values.length, width).setValues(values);
  scInvalidate_();
  console.log('Copied ' + (values.length - 1) + ' Special Classes (Azure version ' + r.version + ') into ' + name + '. Now remove SPECIAL_CLASSES_OWNER here and SC_OWNER in Azure.');
  return { ok: true, rows: values.length - 1, version: r.version };
}

/* ==========================================================================
 *  r136 — CHAT OWNED BY AZURE SQL (Azure Phase 3 step 4)
 * --------------------------------------------------------------------------
 *  Switch: Script Property CHAT_OWNER = azure (together with the Azure app setting CHAT_OWNER=azure). Unset → nothing
 *  here runs; the chat works exactly as before (Dashboard_Chat_Window sheet).
 *  When on: getChatMessages / postChatMessage read and post through the reverse bridge (azureReverseCall_, r134) — the
 *  messages live in Azure SQL, so both dashboards show one conversation. The list is cached under the usual
 *  CHAT_CACHE_KEY_ (10 minutes) and chatChanged_() still mints the version the page reloads on: called after a post here,
 *  and by Azure (signed forward action "chatChanged") after a post made on Azure.
 *  Loop guard: a post that came FROM Azure (session via 'azure') is refused — the owners disagree.
 * ========================================================================== */
var CHAT_AZURE_OWNER_PROP_ = 'CHAT_OWNER';
function chatAzureOwner_() {
  try { return String(PropertiesService.getScriptProperties().getProperty(CHAT_AZURE_OWNER_PROP_) || '').trim().toLowerCase() === 'azure'; }
  catch (e) { return false; }
}
var CHAT_AZURE_UNAVAILABLE_MSG_ = 'The chat is not available right now. Please try again in a minute.';
function chatAzureCall_(payload) {
  try { return azureReverseCall_(payload); }
  catch (e) { throw new Error(CHAT_AZURE_UNAVAILABLE_MSG_); } // azureReverseCall_ already logged the short reason
}
/** getChatMessages when Azure owns the chat (the session was checked by the caller). */
function chatAzureList_(session) {
  var cache = CacheService.getScriptCache();
  try { var hit = cache.get(CHAT_CACHE_KEY_); if (hit) return JSON.parse(hit); } catch (e) { /* ask Azure */ }
  var v0 = chatVersion_();
  var r = chatAzureCall_({ action: 'chatList', v: 1, email: session.email });
  if (r && typeof r.error === 'string') throw new Error(r.error);
  var out = (r && Array.isArray(r.value)) ? r.value : [];
  try { var json = JSON.stringify(out); if (Utilities.newBlob(json).getBytes().length < 95000 && chatVersion_() === v0) cache.put(CHAT_CACHE_KEY_, json, 600); } catch (eP) { /* next call asks again */ }
  return out;
}
/** postChatMessage when Azure owns the chat: Azure checks the person, works out name / class and stores it. */
function chatAzurePost_(sessionToken, session, message) {
  if (scSessionViaAzure_(sessionToken)) throw new Error('Chat owner settings disagree (Apps Script CHAT_OWNER=azure, but Azure CHAT_OWNER is not azure). Ask an Admin to set both the same — nothing was posted.');
  var r = chatAzureCall_({ action: 'call', v: 1, fn: 'postChatMessage', args: [message], email: session.email });
  chatChanged_();
  if (r && typeof r.error === 'string') throw new Error(r.error);
  return (r && Array.isArray(r.value)) ? r.value : [];
}
/** Owner only (editor): roll-back helper — writes Azure's chat (last 10 days, newest 200) into the Dashboard_Chat_Window
 *  sheet before CHAT_OWNER is switched back, so recent messages are not lost. */
function ONE_TIME_chatCopyAzureToSheet() {
  apsRequireOwnerOrTrigger_(null);
  var me = normalizeEmail_(Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail());
  var r = chatAzureCall_({ action: 'chatList', v: 1, email: me });
  var list = (r && Array.isArray(r.value)) ? r.value : [];
  var sheet = getOrCreateChatSheet_(), last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, Math.max(6, sheet.getLastColumn())).clearContent();
  if (list.length) sheet.getRange(2, 1, list.length, 6).setValues(list.map(function (m) { return [m.timestamp, m.email, m.role, m.name, m.message, m.className || '']; }));
  chatChanged_();
  console.log('Copied ' + list.length + ' chat message(s) from Azure into ' + CHAT_SHEET_NAME + '. Now remove CHAT_OWNER here and in Azure.');
  return { ok: true, messages: list.length };
}

/* ==========================================================================
 *  r137 — LIVE GOOGLE MEET CLASS STATUS FOR AZURE (action "classLive", read only)
 * --------------------------------------------------------------------------
 *  The live status needs the Meet audit log / Meet REST APIs this project already uses. Azure asks for the RESULT
 *  (once per ~30 s for the whole Azure app): for each class whose live status applies right now, the same
 *  { code, detail } classMeetApplyLive_ gives applyClassStatus_ here, plus who is in that class's Meet.
 *  Uses the cached snapshot (classMeetLiveSnapshot_ refreshes at most every 45–120 s, never forced) and COPIES of the
 *  started / ended marks: this action stores nothing itself (the snapshot keeps its own diagnostic, at most every
 *  5 minutes, exactly as on any dashboard visit).
 * ========================================================================== */
function azureBridgeClassLive_() {
  var courses = JSON.parse(JSON.stringify(readAllCoursesFromCache_() || [])), now = new Date(), props = PropertiesService.getScriptProperties();
  var snap = classMeetLiveSnapshot_(courses, now, false) || { at: 0, byCourse: {} };
  var started = {}, ended = {};
  try { started = JSON.parse(props.getProperty(CLASS_STARTED_MARK_PROP_KEY) || '{}'); } catch (e1) { started = {}; }
  try { ended = JSON.parse(props.getProperty(CLASS_MEET_ENDED_PROP_KEY) || '{}'); } catch (e2) { ended = {}; }
  var override = getClassStatusOverrideMap_(), cache = CacheService.getScriptCache(), out = {};
  courses.forEach(function (c) {
    var o = override[c.id];
    if (o && (o.status === 'cancelled' || o.status === 'rescheduled')) return; // manual status wins (Azure reads it too)
    var schedule = parseCourseSchedule_(c.name);
    if (!computeAutomaticClassStatus_(schedule, now, false).scheduledStartIso) return;
    var live = null;
    try { live = classMeetApplyLive_(c, schedule, now, snap, cache, started, ended); } catch (eOne) { live = null; }
    if (!live) return;
    var inMeet = [];
    (c.teachers || []).concat(c.students || []).forEach(function (p) { if (p && p.inMeet) inMeet.push({ e: normalizeEmail_(p.email), since: String(p.meetSince || '') }); });
    out[String(c.id)] = { code: live.code, detail: live.detail, inMeet: inMeet };
  });
  return { at: snap.at || 0, byCourse: out };
}

/* ==========================================================================
 *  r137 — JOBS ON AZURE'S TIMETABLE (Azure Phase 4 step 1)
 * --------------------------------------------------------------------------
 *  The five repeating jobs that decide for themselves what is due (every run is safe to repeat):
 *    apsWeeklyJobs (hourly — the 7 weekly jobs), amScheduler (hourly), processTemporaryTeacherAssignments (hourly),
 *    apsCoverageCleanup (30 min), processExamQuestionPaperAutoEmail (5 min).
 *  Switch, per job: Script Property APS_JOBS_ON_AZURE = comma list of those handler names, together with the Azure app
 *  setting AZURE_JOBS (same names). Then:
 *   - Azure calls the job here (signed action "job") on its timetable; the job runs exactly as from its trigger.
 *   - The Apps Script trigger of that job does nothing ("ON_AZURE") — no double run, nothing deleted.
 *   - Safety net: if Azure has not run a listed job for its fallback time (below), the Apps Script trigger runs it again
 *     (and logs why) — a job never stops because one side is misconfigured or down.
 *   - A job NOT listed here is refused when Azure asks (NOT_ON_AZURE) — Azure can never run a job Apps Script still runs.
 *  Runs answering with a Promise (the exam auto-email) are collected with the r135 "result" action.
 * ========================================================================== */
var AZURE_JOB_HANDLERS_ = { apsWeeklyJobs: 180, amScheduler: 180, processTemporaryTeacherAssignments: 180, apsCoverageCleanup: 90, processExamQuestionPaperAutoEmail: 30 }; // fallback minutes
var AZURE_JOB_LAST_PREFIX_ = 'APS_AZURE_JOB_LAST_';
var AZURE_JOB_RUN_ = null; // { handler, runId } — set ONLY while azureBridgeRunJob_ runs a job (after the signature check)
function azureJobsOnAzure_() {
  var o = {};
  try { String(PropertiesService.getScriptProperties().getProperty('APS_JOBS_ON_AZURE') || '').split(/[\s,]+/).forEach(function (h) { if (h && AZURE_JOB_HANDLERS_[h]) o[h] = true; }); } catch (e) { o = {}; }
  return o;
}
/** Called first by apsRequireTriggerCall_: 'AZURE_RUN' = this is Azure's run; 'ON_AZURE' = the trigger should skip; '' = as before. */
function azureJobGate_(e, handler) {
  if (e && e.azureJob && AZURE_JOB_RUN_ && AZURE_JOB_RUN_.handler === handler && AZURE_JOB_RUN_.runId === e.azureJob) return 'AZURE_RUN';
  if (!AZURE_JOB_HANDLERS_[handler] || !(e && e.triggerUid) || !azureJobsOnAzure_()[handler]) return '';
  var uid = String(e.triggerUid), real = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === handler && String(t.getUniqueId()) === uid; });
  if (!real) return ''; // not its own trigger → the usual check refuses it
  var last = Number(PropertiesService.getScriptProperties().getProperty(AZURE_JOB_LAST_PREFIX_ + handler) || 0);
  if (Date.now() - last <= AZURE_JOB_HANDLERS_[handler] * 60000) return 'ON_AZURE';
  console.warn('[AzureJobs] ' + handler + ' is set to run on Azure, but Azure has not run it for ' + AZURE_JOB_HANDLERS_[handler] + ' minutes — running it here (check the Azure log / AZURE_JOBS).');
  return '';
}
/** Signed action "job" { handler, runId }: runs one listed job exactly as its trigger would. */
function azureBridgeRunJob_(req) {
  var handler = String(req.handler || ''), runId = String(req.runId || ''), g = globalThis;
  if (!AZURE_JOB_HANDLERS_[handler] || typeof g[handler] !== 'function' || !/^[0-9a-f-]{8,64}$/i.test(runId)) throw portalErr_('BAD_REQUEST', 'This job cannot be run from Azure.');
  if (!azureJobsOnAzure_()[handler]) throw portalErr_('NOT_ON_AZURE', handler + ' still runs on its Apps Script trigger (add it to Script Property APS_JOBS_ON_AZURE).');
  PropertiesService.getScriptProperties().setProperty(AZURE_JOB_LAST_PREFIX_ + handler, String(Date.now()));
  AZURE_JOB_RUN_ = { handler: handler, runId: runId };
  var started = Date.now();
  try {
    var v = g[handler]({ azureJob: runId });
    if (v && typeof v.then === 'function') {
      var job = Utilities.getUuid().replace(/-/g, '');
      azureBridgeJobPut_(job, { email: 'azure-job', state: 'PENDING' });
      v.then(function (x) { azureBridgeJobPut_(job, { email: 'azure-job', state: 'DONE', value: azureJobSummary_(x) }); },
             function (err) { azureBridgeJobPut_(job, { email: 'azure-job', state: 'DONE', error: azureBridgeSafeMsg_(err) }); });
      return { pending: job };
    }
    console.log('[AzureJobs] ' + handler + ' ran for Azure in ' + Math.round((Date.now() - started) / 1000) + ' s');
    return { value: azureJobSummary_(v) };
  } catch (e) {
    console.error('[AzureJobs] ' + handler + ' failed: ' + azureBridgeSafeMsg_(e));
    return { error: azureBridgeSafeMsg_(e) };
  } finally { AZURE_JOB_RUN_ = null; } // the gate is checked at the very start of the job, so the run is already allowed
}
/** A short, safe summary of what the job returned (counts / skipped reasons — never message bodies or lists of people). */
function azureJobSummary_(x) {
  try { var t = JSON.stringify(x === undefined ? null : x); return t.length > 2000 ? t.slice(0, 2000) + '…' : t; } catch (e) { return String(x).slice(0, 200); }
}

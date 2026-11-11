/**
 * PortalBridge.gs — APS Classroom Dashboard r80. A separate file of the SAME Dashboard Apps Script project
 * (Apps Script shares globals across .gs files, so it uses Code.gs helpers directly). Kept out of Code.gs so
 * adding / removing the Parent Portal bridge never touches the main file.
 */
/* ==========================================================================
 *  r80 — 🔗 PARENT PORTAL BRIDGE (signed server-to-server endpoint)
 * --------------------------------------------------------------------------
 *  The APS Parent Portal is a SEPARATE Apps Script web app (PARENT_PORTAL/). The Dashboard stays the only
 *  integration hub (prompt §21.1): the Portal never holds Zoho, Gmail or Classroom credentials — it asks
 *  the Dashboard through doPost with an HMAC-SHA256-signed body.
 *   - Body: { portal:1, p:<JSON string>, ts:<ms>, nonce:<uuid>, sig:hex(HMAC(PORTAL_SHARED_SECRET, ts+'.'+nonce+'.'+p)) }.
 *     ts must be within 5 minutes; each nonce works once (CacheService, 10 min). Apps Script cannot read
 *     request headers, which is why the signature travels in the body.
 *   - Actions (nothing else is reachable): ping · sendEmail (one recipient, From donotreply@ via the Tickets
 *     mail profile, standard APS shell) · zohoUpsert (parent / student / enrollment, field API names from
 *     Script Property PORTAL_ZOHO_MAP — never hard-coded) · lookupStudent (course cache + Zoho; parent
 *     emails go back to the Portal SERVER only, which compares them) · listCourses (AY courses for the
 *     Portal class catalog import).
 *   - Every call is logged to the Portal_Bridge_Log sheet (action, result, no payload, no secrets).
 *   - With PORTAL_SHARED_SECRET unset the endpoint answers NOT_CONFIGURED to everything (safe default).
 *  No existing function, URL, role or sheet changes. This is the first doPost in this project.
 *  Prompt §21: toward — Dashboard remains the hub; Zoho writes use the existing zh* token / fetch helpers.
 * ========================================================================== */
var PORTAL_NONCE_PREFIX_ = 'aps_pp_nonce_';
var PORTAL_LOG_SHEET_ = 'Portal_Bridge_Log';
var PORTAL_LOG_HEADER_ = ['Date/Time (EST)', 'Action', 'Result', 'Code', 'Detail', 'Duration ms'];
var PORTAL_MAX_SKEW_MS_ = 5 * 60 * 1000;
var PORTAL_MAIL_DAILY_LIMIT_DEFAULT_ = 600;
var PORTAL_OTP_DAILY_LIMIT_DEFAULT_ = 800; // separate budget for Parent Portal sign-in codes (soft limit: CacheService counter)

function doPost(e) {
  var started = Date.now(), action = '', out;
  try {
    var raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
    if (raw.length > 200000) throw portalErr_('TOO_LARGE', 'Request too large.');
    var body = JSON.parse(raw || '{}');
    if (body && body.azure === 1) return azureBridgeDoPost_(body); // r122: Azure dashboard live-data bridge (AzureBridge.gs) — own secret, read only, not logged per call
    if (!body || body.portal !== 1) throw portalErr_('BAD_REQUEST', 'Unknown request.');
    var req = portalVerify_(body);
    action = req.action;
    out = { ok: true, result: portalDispatch_(req.action, req.data || {}) };
  } catch (err) {
    out = { ok: false, code: err && err.portalCode || 'ERROR', message: err && err.portalCode ? String(err.message) : 'The APS Dashboard could not complete this request.' };
    if (!(err && err.portalCode)) console.error('[PortalBridge] ' + action + ': ' + zhSafeErr_(err));
  }
  portalLog_(action || '(none)', out, Date.now() - started);
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function portalErr_(code, message) { var e = new Error(message); e.portalCode = code; return e; }
function portalHex_(bytes) { return bytes.map(function (b) { var h = (b < 0 ? b + 256 : b).toString(16); return h.length === 1 ? '0' + h : h; }).join(''); }
/** Verifies signature, freshness and single use. Returns the parsed { action, data }. */
function portalVerify_(body) {
  var secret = String(PropertiesService.getScriptProperties().getProperty('PORTAL_SHARED_SECRET') || '');
  if (secret.length < 24) throw portalErr_('NOT_CONFIGURED', 'The Parent Portal bridge is not configured on the Dashboard (PORTAL_SHARED_SECRET).');
  var p = String(body.p || ''), ts = String(body.ts || ''), nonce = String(body.nonce || ''), sig = String(body.sig || '');
  if (!/^\d{12,14}$/.test(ts) || !/^[0-9a-f-]{36}$/i.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) throw portalErr_('BAD_REQUEST', 'Malformed request.');
  var expect = portalHex_(Utilities.computeHmacSha256Signature(ts + '.' + nonce + '.' + p, secret));
  var diff = expect.length ^ sig.length;
  for (var i = 0; i < expect.length && i < sig.length; i++) diff |= expect.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) throw portalErr_('BAD_SIGNATURE', 'Request signature is not valid.');
  if (Math.abs(Date.now() - Number(ts)) > PORTAL_MAX_SKEW_MS_) throw portalErr_('STALE', 'Request expired.');
  var cache = CacheService.getScriptCache();
  if (cache.get(PORTAL_NONCE_PREFIX_ + nonce)) throw portalErr_('REPLAY', 'Request already used.');
  cache.put(PORTAL_NONCE_PREFIX_ + nonce, '1', 600);
  var req = JSON.parse(p);
  if (!req || typeof req.action !== 'string') throw portalErr_('BAD_REQUEST', 'Malformed request.');
  return req;
}
function portalDispatch_(action, d) {
  switch (action) {
    case 'ping': return { env: getDashboardEnvironment_().key, zohoConfigured: zhConfigured_(), mailMode: apsMailMode_('TICKETS'), zohoMap: !!portalZohoMap_(false) };
    case 'sendEmail': return portalSendEmail_(d);
    case 'zohoUpsert': return portalZohoUpsert_(d);
    case 'lookupStudent': return portalLookupStudent_(d);
    case 'listCourses': return portalListCourses_(d);
    default: throw portalErr_('UNKNOWN_ACTION', 'Unknown action.');
  }
}
function portalLog_(action, out, ms) {
  try {
    var ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    var sh = ss.getSheetByName(PORTAL_LOG_SHEET_);
    if (!sh) { sh = ss.insertSheet(PORTAL_LOG_SHEET_); sh.getRange(1, 1, 1, PORTAL_LOG_HEADER_.length).setValues([PORTAL_LOG_HEADER_]).setFontWeight('bold'); sh.setFrozenRows(1); }
    var row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, PORTAL_LOG_HEADER_.length).setNumberFormat('@').setValues([[Utilities.formatDate(new Date(), APS_TZ, 'MM/dd/yyyy HH:mm:ss'), String(action).slice(0, 40),
      out.ok ? 'OK' : 'ERROR', out.ok ? '' : String(out.code || ''), out.ok ? '' : String(out.message || '').slice(0, 200), String(ms)]]);
  } catch (e) { console.warn('[PortalBridge] log failed: ' + (e && e.message)); }
}

/* ---- sendEmail: one recipient, From donotreply@ (Tickets profile), APS shell; admin@ CC on request ---- */
function portalSendEmail_(d) {
  var to = (d.to || []).map(normalizeEmail_).filter(function (x) { return x; });
  if (to.length !== 1 || !isSyntacticallyValidEmail_(to[0])) throw portalErr_('INVALID', 'Exactly one valid recipient is required.');
  var subject = String(d.subject || '').replace(/[\r\n]+/g, ' ').slice(0, 180);
  if (!subject) throw portalErr_('INVALID', 'Subject is required.');
  // Sign-in codes have their own daily budget, so a flood of code requests can never block receipts / fee emails (and the reverse).
  var otp = d.kind === 'otp';
  var limit = otp ? (Number(rosterProp_('PORTAL_OTP_DAILY_LIMIT', String(PORTAL_OTP_DAILY_LIMIT_DEFAULT_))) || PORTAL_OTP_DAILY_LIMIT_DEFAULT_)
    : (Number(rosterProp_('PORTAL_MAIL_DAILY_LIMIT', String(PORTAL_MAIL_DAILY_LIMIT_DEFAULT_))) || PORTAL_MAIL_DAILY_LIMIT_DEFAULT_);
  var cache = CacheService.getScriptCache(), dayKey = 'aps_pp_mail_' + (otp ? 'otp_' : '') + Utilities.formatDate(new Date(), APS_TZ, 'yyyyMMdd');
  var used = Number(cache.get(dayKey) || 0);
  if (used >= limit) throw portalErr_('MAIL_LIMIT', 'Today\'s Parent Portal email limit was reached. Please try again tomorrow.');
  var btn = d.button && d.button.url && /^https:\/\/script\.google\.com\//.test(String(d.button.url)) ? { buttonUrl: String(d.button.url), buttonLabel: String(d.button.label || 'OPEN APS PARENT PORTAL').slice(0, 40) } : { noButton: true };
  btn.subtitle = 'Parent Portal';
  var html = apsEmailShell_(htmlEscape_(String(d.title || subject).slice(0, 120)), String(d.bodyHtml || ''), btn);
  var cc = d.ccAdmin === true ? [normalizeEmail_(rosterProp_('PORTAL_ADMIN_CC', 'admin@avvaiyarpadasalai.org'))] : [];
  var r = apsGmailSend_('TICKETS', { to: to, cc: cc, subject: subject, html: html, text: String(d.text || subject), replyTo: rosterProp_('PORTAL_REPLY_TO', 'admin@avvaiyarpadasalai.org') });
  if (!r.ok) throw portalErr_('MAIL_FAILED', 'The email could not be sent right now.');
  cache.put(dayKey, String(used + 1 + cc.length), 90000);
  return { sent: true, mode: r.mode };
}

/* ---- Zoho: logical record → Zoho API names (PORTAL_ZOHO_MAP), insert / update with the existing zh* helpers ---- */
/**
 * PORTAL_ZOHO_MAP (Script Property, JSON). Example (API names are the Zoho admin's, not these):
 * { "parent":     { "module": "Parent_Contacts", "duplicateCheck": ["Email"], "fields": { "email": "Email", "firstName": "First_Name", ... } },
 *   "student":    { "module": "Student_Contacts", "duplicateCheck": ["Portal_Student_ID"], "parentLookup": "Parent", "fields": { "portalStudentId": "Portal_Student_ID", ... },
 *                   "parentEmailFields": ["Parent_Email"] },
 *   "enrollment": { "module": "Enrollments", "duplicateCheck": ["Enrollment_ID"], "studentLookup": "Student", "parentLookup": "Parent", "fields": { "enrollmentId": "Enrollment_ID", ... } } }
 * Only keys listed in "fields" are sent, and a blank value is never sent (it would clear Zoho data).
 */
function portalZohoMap_(required) {
  var raw = zhProp_('PORTAL_ZOHO_MAP');
  if (!raw) { if (required) throw portalErr_('ZOHO_NOT_CONFIGURED', 'Zoho field mapping for the Parent Portal is not configured (PORTAL_ZOHO_MAP).'); return null; }
  try { return JSON.parse(raw); } catch (e) { throw portalErr_('ZOHO_NOT_CONFIGURED', 'PORTAL_ZOHO_MAP is not valid JSON.'); }
}
function portalZohoUpsert_(d) {
  var entity = String(d.entity || '');
  if (['parent', 'student', 'enrollment'].indexOf(entity) === -1) throw portalErr_('INVALID', 'Unknown Zoho entity.');
  if (!zhConfigured_()) throw portalErr_('ZOHO_NOT_CONFIGURED', 'Zoho is not connected on the Dashboard.');
  var map = portalZohoMap_(true)[entity];
  if (!map || !map.module || !map.fields) throw portalErr_('ZOHO_NOT_CONFIGURED', 'PORTAL_ZOHO_MAP has no "' + entity + '" entry.');
  var rec = d.record || {}, data = {};
  Object.keys(map.fields).forEach(function (k) {
    var api = String(map.fields[k] || '').replace(/[^0-9A-Za-z_]/g, ''), v = rec[k];
    if (!api || v === undefined || v === null || String(v).trim() === '') return;
    data[api] = String(v).slice(0, 2000);
  });
  if (map.parentLookup && rec.zohoParentId) data[String(map.parentLookup).replace(/[^0-9A-Za-z_]/g, '')] = { id: String(rec.zohoParentId).replace(/[^0-9]/g, '') };
  if (map.studentLookup && rec.zohoStudentId) data[String(map.studentLookup).replace(/[^0-9A-Za-z_]/g, '')] = { id: String(rec.zohoStudentId).replace(/[^0-9]/g, '') };
  var mod = encodeURIComponent(String(map.module).replace(/[^0-9A-Za-z_]/g, '')), zid = String(d.zohoId || '').replace(/[^0-9]/g, ''), r;
  if (zid) { data.id = zid; r = zhFetch_('put', '/' + mod, { data: [data] }); }
  else r = zhFetch_('post', '/' + mod + '/upsert', { data: [data], duplicate_check_fields: (map.duplicateCheck || []).map(function (x) { return String(x).replace(/[^0-9A-Za-z_]/g, ''); }) });
  var row = r.body && r.body.data && r.body.data[0];
  if ((r.code !== 200 && r.code !== 201 && r.code !== 202) || !row || row.code !== 'SUCCESS') {
    console.warn('[PortalBridge] Zoho ' + entity + ' upsert: ' + zhApiErr_(r, 'upsert') + (row ? ' ' + String(row.code) + ' ' + JSON.stringify(row.details || {}).slice(0, 200) : ''));
    throw portalErr_('ZOHO_ERROR', 'Zoho did not accept the ' + entity + ' record.');
  }
  return { id: String(row.details && row.details.id || zid), action: String(row.action || (zid ? 'update' : '')) };
}

/* ---- lookupStudent: is this APS email a current student? Course cache first, then Zoho for the parent emails ---- */
function portalLookupStudent_(d) {
  var email = normalizeEmail_(d.apsEmail);
  if (!isApsEmailAllowed_(email)) throw portalErr_('INVALID', 'Not an APS email address.');
  var courses = readAllCoursesFromCache_();
  var ay = (rosterAcademicYear_() || {}).suffix || COURSE_NAME_SUFFIX;
  var course = courses.filter(function (c) { return String(c.name || '').trim().slice(-ay.length) === ay && courseHasStudentEmail_(c, email); })[0] ||
    courses.filter(function (c) { return courseHasStudentEmail_(c, email); })[0] || null;
  var out = { found: !!course, name: course ? findDisplayName_(courses, email) : '', apsId: extractAPSID_(email), grade: course ? zhGradeLabel_(extractNilaiFromCourseName_(course.name)) : '',
    status: course ? 'Active — ' + String(course.name || '').split('|')[0].trim() : '', parentEmails: [], zohoStudentId: '' };
  if (zhConfigured_()) {
    try {
      var meta = zhMeta_(false);
      var hits = meta.fields.email ? zhSearchEmail_(meta, email, zhSettings_()).records : [];
      if (hits.length === 1) {
        var rec = hits[0], map = portalZohoMap_(false), fields = (map && map.student && map.student.parentEmailFields) || ['Parent_Email', 'Primary_Parent_Email', 'Parent_Email_Address'];
        out.found = true; out.zohoStudentId = String(rec.id || '');
        fields.forEach(function (f) { var v = normalizeEmail_(rec[f]); if (v && isSyntacticallyValidEmail_(v)) out.parentEmails.push(v); });
        if (!out.name) out.name = String(rec.Name || rec.Full_Name || rec.Student_Name || '').slice(0, 80);
      }
    } catch (e) { console.warn('[PortalBridge] Zoho lookup: ' + zhSafeErr_(e)); }
  }
  return out;
}

/* ---- listCourses: current-AY courses with schedule, teacher and roster emails (Portal class catalog import) ---- */
function portalListCourses_(d) {
  var ay = String(d.academicYear || COURSE_NAME_SUFFIX).replace(/[^A-Za-z0-9-]/g, '');
  var courses = readAllCoursesFromCache_();
  var two = function (n) { return ('0' + n).slice(-2); };
  var dayTok = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return { courses: courses.filter(function (c) { return String(c.name || '').trim().slice(-ay.length) === ay; }).map(function (c) {
    var sch = parseCourseSchedule_(c.name), head = String(c.name || '').split('|')[0], t = srmClassTeacher_(c, courses);
    var sec = /-\s*([A-Za-z0-9]+)\s*$/.exec(head.trim());
    return { id: String(c.id), name: String(c.name || ''), nilai: extractNilaiFromCourseName_(c.name), section: sec ? sec[1].toUpperCase() : '',
      schedule: sch && sch.start && sch.end ? { day: dayTok[sch.dayOfWeek], start: two(sch.start.hour) + ':' + two(sch.start.minute), end: two(sch.end.hour) + ':' + two(sch.end.minute) } : null,
      teacherEmail: t ? t.email : '', teacherName: t ? t.name : '', studentEmails: (c.students || []).map(function (s) { return normalizeEmail_(s.email); }).filter(Boolean) };
  }) };
}

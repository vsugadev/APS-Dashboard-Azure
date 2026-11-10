/**
 * APS Dashboard — EMERGENCY: "You have exceeded the property storage quota"
 * ---------------------------------------------------------------------------
 * Script Properties are full (Apps Script limit: 500 KB for the whole store).
 * Every dashboard load writes a little there (online dot / last login), so when
 * the store is full every load fails.
 *
 * HOW TO USE (Apps Script editor, as the script owner):
 *   1. File "+" → Script → name it APS_PropertyQuota_Fix → paste this file → Save.
 *   2. Run  apsPropReport      → View → Logs: total size + biggest keys (names and sizes only, never values).
 *   3. Run  apsPropFreeSpace   → frees only data the dashboard rebuilds by itself (list below).
 *   4. Reload the dashboard. Send the two log outputs to the developer.
 *   5. Delete this file afterwards (it is not needed by the dashboard).
 *
 * What apsPropFreeSpace removes (nothing else is touched; secrets are never read out):
 *   - attendanceFinalizedThrough_v1 / _v2: old versions no longer read (the code uses _v3).
 *   - presenceMap: keeps only people seen in the last 30 minutes (it only drives the green "online" dot).
 *   - teacherAvailabilityRealtimeMap: keeps only the 2 newest weeks (a live overlay; answers stay in the sheet).
 *   - GOOGLE_REVIEW_PROMPT_<email> (one per student): a student may see the monthly Google Review popup once more.
 *   - meetPresenceDiagnostic, classMeetLiveDiagnostic, attendanceSyncDiagnostic_v1: technical diagnostics only.
 *   - staffNameCache, referenceLetterJoinDateCache: look-up caches, refilled on demand.
 *   - ZOHO_SYNC_JOB_SEL_<n>: leftovers of a finished Zoho batch (skipped while a Zoho job is RUNNING).
 * It does NOT remove last-login times, student notice acceptances, availability, live status, settings or secrets.
 */
var APS_PROP_LIMIT_BYTES_ = 500 * 1024;

function apsPropSizes_() {
  var all = PropertiesService.getScriptProperties().getProperties(), rows = [], total = 0;
  Object.keys(all).forEach(function (k) {
    var b = Utilities.newBlob(k).getBytes().length + Utilities.newBlob(String(all[k])).getBytes().length;
    total += b; rows.push({ key: k, bytes: b });
  });
  rows.sort(function (a, b) { return b.bytes - a.bytes; });
  return { rows: rows, total: total, count: rows.length };
}

/** Key name with any email replaced by <email> (APS emails contain "_", so known per-person prefixes are handled first). */
function apsPropGroup_(k) {
  var pre = ['apsStudentNoticeAccepted_v1:', 'GOOGLE_REVIEW_PROMPT_', 'STUDENT_NOTICE_ACCEPTED_'];
  for (var i = 0; i < pre.length; i++) if (k.indexOf(pre[i]) === 0 && k.indexOf('@') > -1) return pre[i] + '<email>' + k.slice(k.indexOf('@')).replace(/^@[A-Za-z0-9.-]+\.[A-Za-z]+/, '');
  return k.replace(/[A-Za-z0-9.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]+/g, '<email>').replace(/_\d+$/, '_<n>');
}

/** Read-only: total size, the 30 biggest keys and per-prefix totals. Never logs a value. */
function apsPropReport() {
  var s = apsPropSizes_(), groups = {};
  s.rows.forEach(function (r) {
    var g = apsPropGroup_(r.key);
    groups[g] = groups[g] || { n: 0, bytes: 0 }; groups[g].n++; groups[g].bytes += r.bytes;
  });
  console.log('Script Properties: ' + s.count + ' keys, ' + Math.round(s.total / 1024) + ' KB of ' + Math.round(APS_PROP_LIMIT_BYTES_ / 1024) + ' KB limit (' + Math.round(100 * s.total / APS_PROP_LIMIT_BYTES_) + '%).');
  console.log('Biggest keys:\n' + s.rows.slice(0, 30).map(function (r) { return '  ' + Math.round(r.bytes / 102.4) / 10 + ' KB  ' + apsPropGroup_(r.key); }).join('\n'));
  console.log('By group:\n' + Object.keys(groups).sort(function (a, b) { return groups[b].bytes - groups[a].bytes; }).slice(0, 25)
    .map(function (g) { return '  ' + Math.round(groups[g].bytes / 102.4) / 10 + ' KB  (' + groups[g].n + ' keys)  ' + g; }).join('\n'));
  return { keys: s.count, kb: Math.round(s.total / 1024) };
}

/** Frees only rebuildable data (see the header). Safe to run more than once. */
function apsPropFreeSpace() {
  var props = PropertiesService.getScriptProperties(), before = apsPropSizes_().total, removed = [];
  // Best effort: the dashboard may hold the script lock while users keep retrying — the clean-up works without it.
  var lock = LockService.getScriptLock(), locked = false;
  try { locked = lock.tryLock(5000); } catch (eL) { locked = false; }
  if (!locked) removed.push('(script lock busy — continued without it)');
  try {
    // 0. unused old versions (the code reads only attendanceFinalizedThrough_v3) — deleted first to make room
    ['attendanceFinalizedThrough_v1', 'attendanceFinalizedThrough_v2'].forEach(function (k) {
      if (props.getProperty(k) !== null) { props.deleteProperty(k); removed.push(k + ' (old version, unused)'); }
    });
    // 1. presence map → only the last 30 minutes
    try {
      var p = JSON.parse(props.getProperty('presenceMap') || '{}') || {}, now = Date.now(), kept = {}, n0 = Object.keys(p).length;
      Object.keys(p).forEach(function (e) { var t = p[e] && Date.parse(p[e].lastSeen); if (t && now - t <= 30 * 60000) kept[e] = p[e]; });
      props.setProperty('presenceMap', JSON.stringify(kept)); // smaller value — allowed even when the store is full
      removed.push('presenceMap: ' + n0 + ' → ' + Object.keys(kept).length + ' entries');
    } catch (eP) { props.deleteProperty('presenceMap'); removed.push('presenceMap: cleared (' + eP.message + ')'); }
    // 1b. Teacher Availability live overlay → only the 2 newest weeks (the saved answers stay in the TEACHER_AVAILABILITY sheet)
    try {
      var ta = JSON.parse(props.getProperty('teacherAvailabilityRealtimeMap') || '{}') || {}, weeks = {};
      Object.keys(ta).forEach(function (k) { weeks[String(k).split('|')[0]] = true; });
      var keepW = Object.keys(weeks).sort().slice(-2), taKept = {}, t0 = Object.keys(ta).length;
      Object.keys(ta).forEach(function (k) { if (keepW.indexOf(String(k).split('|')[0]) > -1) taKept[k] = ta[k]; });
      props.setProperty('teacherAvailabilityRealtimeMap', JSON.stringify(taKept));
      removed.push('teacherAvailabilityRealtimeMap: ' + t0 + ' → ' + Object.keys(taKept).length + ' entries (kept ' + keepW.join(', ') + ')');
    } catch (eT) { removed.push('teacherAvailabilityRealtimeMap: not changed (' + eT.message + ')'); }
    // 2. fixed caches / diagnostics
    ['meetPresenceDiagnostic', 'classMeetLiveDiagnostic', 'attendanceSyncDiagnostic_v1', 'staffNameCache', 'referenceLetterJoinDateCache'].forEach(function (k) {
      if (props.getProperty(k) !== null) { props.deleteProperty(k); removed.push(k); }
    });
    // 3. per-student keys + finished Zoho batch leftovers
    var job = null; try { job = JSON.parse(props.getProperty('ZOHO_SYNC_JOB') || 'null'); } catch (eJ) { job = null; }
    var zohoRunning = !!(job && job.status === 'RUNNING');
    var gr = 0, zs = 0;
    props.getKeys().forEach(function (k) {
      if (k.indexOf('GOOGLE_REVIEW_PROMPT_') === 0) { props.deleteProperty(k); gr++; }
      else if (!zohoRunning && k.indexOf('ZOHO_SYNC_JOB_SEL_') === 0) { props.deleteProperty(k); zs++; }
    });
    removed.push('GOOGLE_REVIEW_PROMPT_<email>: ' + gr + ' keys');
    removed.push('ZOHO_SYNC_JOB_SEL_<n>: ' + zs + ' keys' + (zohoRunning ? ' (skipped — a Zoho job is running)' : ''));
  } finally { if (locked) { try { lock.releaseLock(); } catch (eR) { /* ignore */ } } }
  var after = apsPropSizes_().total;
  console.log('Removed / trimmed:\n  ' + removed.join('\n  '));
  console.log('Script Properties: ' + Math.round(before / 1024) + ' KB → ' + Math.round(after / 1024) + ' KB (limit 500 KB, ' + Math.round(100 * after / APS_PROP_LIMIT_BYTES_) + '% used).');
  if (after > 0.8 * APS_PROP_LIMIT_BYTES_) console.warn('Still above 80% — run apsPropReport and send the log to the developer before users sign in again.');
  return { beforeKb: Math.round(before / 1024), afterKb: Math.round(after / 1024) };
}

/**
 * Extra trim (run only if still above ~80 %): the country map keeps each person's CHOSEN Default Country, and drops
 * only the auto-detected country (it is detected again on that person's next dashboard visit — the flag chip
 * is missing until then). Nothing else is changed.
 */
function apsPropTrimCountry() {
  var props = PropertiesService.getScriptProperties(), before = apsPropSizes_().total;
  var m = {}; try { m = JSON.parse(props.getProperty('apsUserCountryMap_v1') || '{}') || {}; } catch (e) { console.warn('Country map unreadable — not changed.'); return; }
  var out = {}, n0 = Object.keys(m).length, kept = 0;
  Object.keys(m).forEach(function (email) {
    var e = m[email] || {};
    if (e.defaultCountryCode) { out[email] = { defaultCountryCode: e.defaultCountryCode, defaultCountryName: e.defaultCountryName || '', defaultUpdatedAt: e.defaultUpdatedAt || '' }; kept++; }
  });
  props.setProperty('apsUserCountryMap_v1', JSON.stringify(out)); // smaller value
  var after = apsPropSizes_().total;
  console.log('apsUserCountryMap_v1: ' + n0 + ' people → ' + kept + ' with a chosen Default Country kept (auto-detected countries are re-detected on the next visit).');
  console.log('Script Properties: ' + Math.round(before / 1024) + ' KB → ' + Math.round(after / 1024) + ' KB (limit 500 KB, ' + Math.round(100 * after / APS_PROP_LIMIT_BYTES_) + '% used).');
}
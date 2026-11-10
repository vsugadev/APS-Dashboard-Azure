// r103 — Property storage: big per-person maps in the second store (owner's User Properties), safe migration,
// a full store never stops the dashboard loading, availability overlay pruned, daily health check. (node test/storage.js)
const assert = require('assert');
const { setup } = require('./coveragefixture');
const tests = []; const t = (n, fn) => tests.push([n, fn]);
const J = x => JSON.parse(JSON.stringify(x));
const QUOTA = 'You have exceeded the property storage quota. Please remove some properties and try again.';

t('migration: old Script Property data is read, then moved on the first write (nothing lost)', () => {
  const F = setup(); const { G, env } = F;
  env.props.lastLoginMap = JSON.stringify({ 'old@aps.org': { gc: '2026-10-01T10:00:00.000Z', gm: null, db: '2026-10-02T10:00:00.000Z' } });
  env.props.onboardedStudents = JSON.stringify({ 'old@aps.org': '2026-09-01T00:00:00.000Z' });
  env.props.apsUserCountryMap_v1 = JSON.stringify({ 'old@aps.org': { countryCode: 'US', countryName: 'United States', defaultCountryCode: 'IN', defaultCountryName: 'India' } });
  assert.strictEqual(G.getLastLoginMap_()['old@aps.org'].gc, '2026-10-01T10:00:00.000Z', 'read before moving');
  G.recordHeartbeat_('me@aps.org');
  const ll = JSON.parse(env.userProps.lastLoginMap);
  assert.ok(ll['old@aps.org'] && ll['me@aps.org'] && ll['me@aps.org'].db, 'old entries kept + new visit added');
  assert.strictEqual(env.props.lastLoginMap, undefined, 'Script Property copy removed');
  assert.ok(env.userProps.presenceMap && env.props.presenceMap === undefined);
  assert.deepStrictEqual(J(G.getUserCountryMap_()), {}, 'r120: the old property country list is no longer read (USER_COUNTRY sheet; old list deleted)');
});
t('getDashboardData moves the onboarded map and still flags students correctly', () => {
  const F = setup(); const { G, env } = F;
  env.props.onboardedStudents = JSON.stringify({ 'keep@aps.org': '2026-09-01T00:00:00.000Z' });
  J(G.getDashboardData(F.tok2.admin));
  const m = G.apsBigJson_('onboardedStudents'); assert.ok(m['keep@aps.org'], 'old onboarded entry kept');
});
t('auto-detected country no longer erases the chosen Default Country (r103 bug fix; r120: USER_COUNTRY sheet)', () => {
  const F = setup(); const { G, env } = F;
  const tok = F.tok2.teacher;
  G.setMyDefaultCountry(tok, 'IN', 'India');
  G.recordViewerCountry(tok, 'GB', 'United Kingdom'); G.recordViewerCountry(tok, 'US', 'United States');
  const p = J(G.getMyCountryPreference(tok));
  assert.strictEqual(p.defaultCountryCode, 'IN'); assert.strictEqual(p.defaultCountryName, 'India'); assert.strictEqual(p.source, 'CHOSEN');
});
t('BOTH stores full: every page-load call still works for every role (no "property storage quota" error)', () => {
  const F = setup(); const { G, env } = F;
  const full = () => ({ getProperty: k => null, setProperty() { throw new Error(QUOTA); }, deleteProperty() {}, getKeys: () => [], getProperties: () => ({}) });
  const sp = G.PropertiesService.getScriptProperties, up = G.PropertiesService.getUserProperties;
  G.PropertiesService.getScriptProperties = () => Object.assign(sp(), { setProperty() { throw new Error(QUOTA); } });
  G.PropertiesService.getUserProperties = full;
  const warns = []; const cw = console.warn; console.warn = m => warns.push(String(m));
  try {
    ['admin', 'hm', 'teacher', 'vp', 'student', 'bod'].forEach(r => {
      const tok = F.tok2[r];
      Object.keys(env.cache).filter(k => /^aps_hb_/.test(k)).forEach(k => delete env.cache[k]);
      const d = J(G.getDashboardData(tok)); assert.ok(Array.isArray(d.courses), r + ' dashboard');
      J(G.getWeeklyPanelData(tok)); J(G.getRealtimeStatusSnapshot(tok));
      J(G.getStudentLoginNoticeStatus(tok));
    });
  } finally { G.PropertiesService.getScriptProperties = sp; G.PropertiesService.getUserProperties = up; console.warn = cw; }
  assert.ok(warns.some(w => /\[Storage\]/.test(w)), 'the failed writes are logged as warnings');
  assert.ok(!warns.some(w => /@/.test(w)), 'no email address in the warnings');
});
t('availability save still succeeds when the overlay cannot be written (answer is in the sheet)', () => {
  const F = setup(); const { G } = F;
  const sp = G.PropertiesService.getScriptProperties;
  const course = J(G.getWeeklyPanelData(F.tok2.admin)).availability[0];
  G.PropertiesService.getScriptProperties = () => Object.assign(sp(), { setProperty(k, v) { if (k === 'teacherAvailabilityRealtimeMap') throw new Error(QUOTA); return sp().setProperty(k, v); } });
  const cw = console.warn; console.warn = () => {};
  try { const r = G.setTeacherAvailabilityStatus(F.tok2.admin, course.courseId, 'confirmed', ''); assert.strictEqual(r.status, 'confirmed'); }
  finally { G.PropertiesService.getScriptProperties = sp; console.warn = cw; }
  assert.strictEqual(J(G.getWeeklyPanelData(F.tok2.admin)).availability.find(a => a.courseId === course.courseId).status, 'confirmed', 'saved in the sheet');
});
t('availability overlay keeps only the current week (old weeks pruned on every write)', () => {
  const F = setup(); const { G, env } = F;
  const wk = G.getCurrentWeekId_();
  env.props.teacherAvailabilityRealtimeMap = JSON.stringify({ 'WK-2026-09-04|X': { status: 'confirmed' }, 'WK-2026-10-02|Y': { status: 'pending' }, [wk + '|Z']: { status: 'pending' } });
  J(G.getWeeklyPanelData(F.tok2.admin));
  const keys = Object.keys(JSON.parse(env.props.teacherAvailabilityRealtimeMap));
  assert.ok(keys.length > 0 && keys.every(k => k.split('|')[0] >= wk), JSON.stringify(keys));
});
t('Google Review monthly prompt: read from the old key, recorded in the second store', () => {
  const F = setup(); const { G, env } = F;
  const tok = F.tok2.student; const email = JSON.parse(env.cache['aps_sess_' + tok]).email;
  const month = G.grMonth_();
  env.props['GOOGLE_REVIEW_PROMPT_' + email] = month;
  assert.strictEqual(G.grPromptState_(email, 'student').show, false, 'already shown this month (old store)');
  delete env.props['GOOGLE_REVIEW_PROMPT_' + email];
  G.recordGoogleReviewEvent(tok, 'GOOGLE_REVIEW_PROMPT_SHOWN', 'POPUP');
  assert.strictEqual(env.userProps['GOOGLE_REVIEW_PROMPT_' + email], month);
  assert.strictEqual(env.props['GOOGLE_REVIEW_PROMPT_' + email], undefined);
});
t('daily health check: moves leftovers, trims diagnostics above 70 %, one admin alert per day above 80 %', () => {
  const F = setup(); const { G, env } = F;
  env.props.presenceMap = '{"a@aps.org":{"lastSeen":"2026-10-30T00:00:00.000Z"}}';
  env.props['GOOGLE_REVIEW_PROMPT_s@aps.org'] = '2026-10';
  env.props.meetPresenceDiagnostic = 'x'.repeat(5000);
  env.props.BIG_SETTING = 'y'.repeat(420 * 1024); // pushes Script Properties above 80 %
  env.stats.mails.length = 0;
  const sent = []; const real = G.apsGmailSend_; G.apsGmailSend_ = (p, m) => { sent.push({ p, m }); return { ok: true }; };
  try {
    const h = G.apsPropHealth_(true);
    assert.ok(env.userProps.presenceMap && env.props.presenceMap === undefined, 'presence moved');
    assert.ok(env.userProps['GOOGLE_REVIEW_PROMPT_s@aps.org'] && !env.props['GOOGLE_REVIEW_PROMPT_s@aps.org'], 'review keys moved');
    assert.strictEqual(env.props.meetPresenceDiagnostic, undefined, 'diagnostic trimmed');
    assert.ok(h.scriptPct >= 80);
    assert.strictEqual(sent.length, 1); assert.strictEqual(sent[0].p, 'ATTENDANCE', 'from attendance@'); assert.ok(/storage almost full/.test(sent[0].m.subject));
    assert.ok(!/yyyy|BIG_SETTING|y{20}/.test(sent[0].m.html), 'no values in the alert');
    G.apsPropHealth_(true); assert.strictEqual(sent.length, 1, 'once per day');
  } finally { G.apsGmailSend_ = real; }
  assert.ok(env.props.BIG_SETTING, 'settings are never removed');
});
t('daily trigger runs the health check; apsStorageReport is editor-only', () => {
  const F = setup(); const { G } = F;
  let called = 0; const h = G.apsPropHealth_; G.apsPropHealth_ = () => { called++; return {}; };
  const gp = G.ScriptApp.getProjectTriggers; G.ScriptApp.getProjectTriggers = () => [{ getHandlerFunction: () => 'apsDailyForceSync', getUniqueId: () => 'u1' }];
  G.PropertiesService.getScriptProperties().setProperty('APS_DAILY_SYNC_ENABLED', 'false');
  try { G.apsDailyForceSync({ triggerUid: 'u1' }); } finally { G.ScriptApp.getProjectTriggers = gp; G.apsPropHealth_ = h; }
  assert.strictEqual(called, 1, 'runs even when the daily sync is off');
  G.Session = { getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => 'owner@aps.org' }) };
  assert.throws(() => G.apsStorageReport(), /Access denied/);
  ['GOOGLE_REVIEW_PROMPT_vihaan_k_aps1234@avvaiyarpadasalai.org', 'apsStudentNoticeAccepted_v1:sa0_aps6650@avvaiyarpadasalai.org_about', 'x_y@aps.org'].forEach(k => {
    const l = G.apsPropKeyLabel_(k); assert.ok(!/vihaan|sa0|aps1234|aps6650|x_y/.test(l) && l.includes('<email>'), l);
  });
});

// ---------------- r118: "🧹 Clean up temporary data" button (Admin Control → Backup & Archive) ----------------
function seedTemp(env, G) {
  env.props.presenceMap = '{"a@aps.org":{"lastSeen":"2026-10-30T00:00:00.000Z"}}';
  env.props['GOOGLE_REVIEW_PROMPT_kid_x_aps77@avvaiyarpadasalai.org'] = '2026-10';
  env.props['GOOGLE_REVIEW_PROMPT_s2@aps.org'] = '2026-09';
  env.props.meetPresenceDiagnostic = 'DIAGVALUE'.repeat(500);
  env.props.attendanceSyncDiagnostic_v1 = 'z'.repeat(800);
  const wk = G.getCurrentWeekId_();
  env.props.teacherAvailabilityRealtimeMap = JSON.stringify({ ['WK-2020-01-03|c1']: { weekId: 'WK-2020-01-03', courseId: 'c1', status: 'AVAILABLE' }, ['WK-2020-01-10|c2']: { weekId: 'WK-2020-01-10', courseId: 'c2' }, [wk + '|c3']: { weekId: wk, courseId: 'c3', status: 'AVAILABLE' } });
  env.props.SECRET_LIKE_SETTING = 'SECRETVALUE-do-not-show';
  env.props.MISSING_GRADING_CONFIG = '{"enabled":true}';
  return wk;
}
t('r118 status (in getMaintenanceStatus): usage of both stores + list of what can be cleaned — names and sizes only, never values', () => {
  const F = setup(); const { G, env } = F; seedTemp(env, G);
  const st = J(G.getMaintenanceStatus(F.tok2.admin)).storage;
  assert.ok(st.scriptKb > 0 && st.limitKb === 500 && typeof st.scriptPct === 'number' && typeof st.secondPct === 'number');
  const keys = st.items.map(i => i.key);
  assert.deepStrictEqual(keys, ['presenceMap', 'GOOGLE_REVIEW_PROMPT_<email> (2)', 'meetPresenceDiagnostic', 'attendanceSyncDiagnostic_v1', 'teacherAvailabilityRealtimeMap'], keys.join());
  assert.ok(/2 old-week availability entries/.test(st.items[4].action));
  assert.ok(st.freedKb >= 4);
  const raw = JSON.stringify(st);
  assert.ok(!/DIAGVALUE|SECRETVALUE|kid_x|aps77|lastSeen|SECRET_LIKE_SETTING|MISSING_GRADING_CONFIG/.test(raw), 'no values, no settings, no emails');
  assert.strictEqual(st.last, null);
  assert.strictEqual(env.props.meetPresenceDiagnostic.length, 4500, 'status is read-only');
});
t('r118 button: runs at ANY usage level, moves per-person data (kept), deletes only allow-listed diagnostics, prunes old weeks; settings untouched; logged + audited', () => {
  const F = setup(); const { G, env } = F; const wk = seedTemp(env, G);
  const r = J(G.runTempDataCleanup(F.tok2.admin));
  assert.ok(r.before.scriptPct < 70, 'works below the 70 % automatic threshold');
  assert.ok(r.after.scriptKb < r.before.scriptKb && r.freedKb > 0);
  assert.ok(env.userProps.presenceMap && env.props.presenceMap === undefined, 'presence moved, not lost');
  assert.strictEqual(env.userProps['GOOGLE_REVIEW_PROMPT_s2@aps.org'], '2026-09');
  assert.strictEqual(env.props.meetPresenceDiagnostic, undefined); assert.strictEqual(env.props.attendanceSyncDiagnostic_v1, undefined);
  assert.deepStrictEqual(Object.keys(JSON.parse(env.props.teacherAvailabilityRealtimeMap)), [wk + '|c3'], 'this week kept');
  assert.strictEqual(env.props.SECRET_LIKE_SETTING, 'SECRETVALUE-do-not-show'); assert.strictEqual(env.props.MISSING_GRADING_CONFIG, '{"enabled":true}');
  assert.deepStrictEqual(r.errors, []); assert.deepStrictEqual(r.storage.items, [], 'nothing left to clean');
  assert.ok(!/DIAGVALUE|SECRETVALUE|kid_x|aps77/.test(JSON.stringify(r)), 'result has no values / emails');
  const log = env.wb.getSheetByName('APS_STORAGE_CLEANUP_LOG').data;
  assert.deepStrictEqual(log[0], ['Run_At', 'By', 'Script_KB_Before', 'Script_KB_After', 'Second_KB_Before', 'Second_KB_After', 'Removed_Or_Moved', 'Result']);
  assert.strictEqual(log.length, 2); assert.strictEqual(log[1][1], 'admin@aps.org'); assert.strictEqual(log[1][7], 'OK');
  assert.ok(/GOOGLE_REVIEW_PROMPT_<email> \(2\)/.test(log[1][6]) && !/kid_x|DIAGVALUE/.test(log[1].join('|')));
  const last = J(G.getMaintenanceStatus(F.tok2.admin)).storage.last;
  assert.strictEqual(last.by, 'admin@aps.org'); assert.strictEqual(last.ok, true); assert.strictEqual(last.detail.removed, 6);
  const r2 = J(G.runTempDataCleanup(F.tok2.admin)); assert.deepStrictEqual(r2.handled, [], 'second click: nothing to do, still safe');
  assert.strictEqual(env.wb.getSheetByName('APS_STORAGE_CLEANUP_LOG').data[2][6], '(nothing to clean)');
});
t('r118 button: same daily health check behaviour as before (only trims above 70 %)', () => {
  const F = setup(); const { G, env } = F; seedTemp(env, G);
  const h = G.apsPropHealth_(false);
  assert.deepStrictEqual(J(h.trimmed), [], 'below 70 %: the daily check still does not trim');
  assert.ok(env.props.meetPresenceDiagnostic, 'diagnostic kept by the daily check');
  assert.ok(env.props.presenceMap === undefined, 'but still moves the per-person data');
});
t('r118 button: server-side permission (teacher / HM / VP / forged session refused), busy lock refused', () => {
  const F = setup(); const { G, env } = F; seedTemp(env, G);
  ['hm', 'vp', 'teacher'].forEach(r => assert.throws(() => G.runTempDataCleanup(F.tok2[r]), /Only Admin|Access denied|not allowed|permission/i, r));
  assert.throws(() => G.runTempDataCleanup('forged-token'), /session|sign in|expired|Access/i);
  assert.ok(env.props.meetPresenceDiagnostic, 'nothing removed by refused calls');
  const gl = G.LockService.getScriptLock; G.LockService.getScriptLock = () => ({ tryLock: () => false, releaseLock() {}, waitLock() { throw new Error('x'); } });
  try { assert.throws(() => G.runTempDataCleanup(F.tok2.admin), /try again in a minute/); } finally { G.LockService.getScriptLock = gl; }
  assert.ok(env.props.meetPresenceDiagnostic);
});

let fails = 0;
for (const [n, fn] of tests) { try { fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 4).join('\n   ')); } }
console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);

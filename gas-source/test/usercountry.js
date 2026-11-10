// r120 — country flags from the USER_COUNTRY Google Sheet, outside-USA people only (node test/usercountry.js)
const assert = require('assert');
const { setup } = require('./coveragefixture');
const { Sheet } = require('./gasmock'); // Apps Script Sheet.deleteRows(rowPosition, howMany)
Sheet.prototype.deleteRows = Sheet.prototype.deleteRows || function (pos, n) { this.data.splice(pos - 1, n); return this; };
const tests = []; const t = (n, fn) => tests.push([n, fn]);
const J = x => JSON.parse(JSON.stringify(x));
const D = '@avvaiyarpadasalai.org';
const rows = env => { const sh = env.wb.getSheetByName('USER_COUNTRY'); return sh ? sh.data.slice(1).filter(r => r && r[0]) : []; };
const emailOf = (env, tok) => JSON.parse(env.cache['aps_sess_' + tok]).email;

t('starts empty; United States / unknown = no row, no sheet write, no flag; first sign-in has no country step', () => {
  const F = setup(); const { G, env } = F;
  assert.strictEqual(env.wb.getSheetByName('USER_COUNTRY'), null, 'nothing created up front');
  const p = J(G.getMyCountryPreference(F.tok2.student));
  assert.strictEqual(p.hasDefault, true); assert.strictEqual(p.sheetMode, true); assert.strictEqual(p.countryCode, ''); assert.ok(!p.disabled);
  G.recordViewerCountry(F.tok2.student, 'US', 'United States');
  assert.strictEqual(env.wb.getSheetByName('USER_COUNTRY'), null, 'US: no sheet, no row');
  const kid = J(G.getDashboardData(F.tok2.admin)).courses.flatMap(c => c.students).find(s => s.email === 'sa0_aps6650' + D);
  assert.strictEqual(kid.countryFlag, '');
});
t('outside the USA: detected country saved once (one row with APSID, role, Source BROWSER); flag shown on rosters for everyone; same country again → no write; moved back to USA → row removed', () => {
  const F = setup(); const { G, env } = F; const tok = F.tok2.student, em = emailOf(env, tok);
  G.recordViewerCountry(tok, 'IN', 'India');
  let r = rows(env); assert.strictEqual(r.length, 1);
  assert.deepStrictEqual([r[0][0], r[0][1], r[0][3], r[0][4], r[0][5], r[0][6], r[0][9]], [em, 'APS6650', 'student', 'IN', 'India', 'BROWSER', em]);
  assert.strictEqual(r[0][2], 'Stu A0', 'name from the class roster');
  const kid = J(G.getDashboardData(F.tok2.admin)).courses.flatMap(c => c.students).find(s => s.email === em);
  assert.strictEqual(kid.countryCode, 'IN'); assert.strictEqual(kid.countryFlag, '🇮🇳'); assert.strictEqual(G.resolveCountryFlag_(G.getUserCountryMap_()[em]).source, 'browser'); // r121: countrySource no longer sent to the browser
  const at = r[0][8]; G.recordViewerCountry(tok, 'IN', 'India'); assert.strictEqual(rows(env)[0][8], at, 'no rewrite');
  G.recordViewerCountry(tok, 'CA', 'Canada'); r = rows(env); assert.strictEqual(r.length, 1); assert.strictEqual(r[0][4], 'CA');
  G.recordViewerCountry(tok, 'US', 'United States'); assert.strictEqual(rows(env).length, 0, 'back in the USA → no row');
  assert.ok(!env.wb.getSheetByName('USER_COUNTRY_AUDIT'), 'browser detection is not audited (noise)');
});
t('chosen by the person (flag → Change Country) wins over detection; choosing United States removes the row; audited', () => {
  const F = setup(); const { G, env } = F; const tok = F.tok2.teacher, em = emailOf(env, tok);
  G.recordViewerCountry(tok, 'GB', 'United Kingdom');
  const p = J(G.setMyDefaultCountry(tok, 'IN', 'India')); assert.strictEqual(p.sheetMode, true); assert.strictEqual(p.countryCode, 'IN'); assert.strictEqual(p.source, 'CHOSEN');
  G.recordViewerCountry(tok, 'GB', 'United Kingdom'); G.recordViewerCountry(tok, 'US', 'United States');
  assert.strictEqual(rows(env)[0][4], 'IN', 'detection never replaces a chosen country');
  assert.strictEqual(J(G.setMyDefaultCountry(tok, 'US', 'United States')).countryCode, ''); assert.strictEqual(rows(env).length, 0);
  const au = env.wb.getSheetByName('USER_COUNTRY_AUDIT').data;
  assert.deepStrictEqual(au[0], ['At', 'By', 'Email', 'Old_Country', 'New_Country', 'Source']);
  assert.deepStrictEqual(au.slice(1).map(x => [x[1], x[2], x[3], x[4], x[5]]), [[em, em, 'United Kingdom (GB)', 'India (IN)', 'CHOSEN'], [em, em, 'India (IN)', 'United States / none', 'CHOSEN']]);
});
t('Admin card: list with country counts, set / change / remove a person (Source ADMIN, audited, detection never replaces it), export CSV (formula-safe); teachers / HM refused server-side', () => {
  const F = setup(); const { G, env } = F;
  G.recordViewerCountry(F.tok2.student, 'IN', 'India'); G.recordViewerCountry(F.tok2.teacher, 'IN', 'India');
  let d = J(G.getUserCountryAdmin(F.tok2.admin));
  assert.strictEqual(d.rows.length, 2); assert.deepStrictEqual(d.countries, [{ country: 'India', count: 2 }]); assert.strictEqual(d.on, true);
  let r = J(G.setUserCountryByAdmin(F.tok2.admin, 'Parent_Kid_aps9999' + D, 'SG', 'Singapore'));
  assert.strictEqual(r.action, 'ADDED'); const row = rows(env).find(x => x[0] === 'parent_kid_aps9999' + D); assert.deepStrictEqual([row[4], row[6], row[9]], ['SG', 'ADMIN', 'admin@aps.org']);
  assert.strictEqual(J(G.setUserCountryByAdmin(F.tok2.admin, 'sa0_aps6650' + D, 'AU', 'Australia')).action, 'UPDATED');
  G.recordViewerCountry(F.tok2.student, 'IN', 'India'); assert.strictEqual(rows(env).find(x => x[0] === 'sa0_aps6650' + D)[4], 'AU', 'Admin value kept');
  assert.strictEqual(J(G.setUserCountryByAdmin(F.tok2.admin, 'parent_kid_aps9999' + D, 'US', 'United States')).action, 'REMOVED');
  assert.ok(env.wb.getSheetByName('USER_COUNTRY_AUDIT').data.slice(1).every(x => x[1] === 'admin@aps.org' && x[5] === 'ADMIN'));
  assert.throws(() => G.setUserCountryByAdmin(F.tok2.admin, 'not-an-email', 'IN', 'India'), /valid email/);
  assert.throws(() => G.setUserCountryByAdmin(F.tok2.admin, 'x@aps.org', 'ZZZ', 'x'), /valid country/);
  G.setUserCountryByAdmin(F.tok2.admin, 'evil@aps.org', 'IN', '=HYPERLINK("http://x")');
  const ex = J(G.exportUserCountry(F.tok2.admin)); assert.ok(/^APS_Users_Outside_USA_\d{4}-\d{2}-\d{2}\.csv$/.test(ex.fileName)); assert.strictEqual(ex.rows, 3);
  assert.ok(ex.csv.includes(`"'=HYPERLINK(""http://x"")"`), 'formula-safe'); assert.ok(rows(env).find(x => x[0] === 'evil@aps.org')[5].startsWith("'="), 'sheet cell formula-safe');
  ['teacher', 'hm', 'vp', 'student'].forEach(k => {
    assert.throws(() => G.getUserCountryAdmin(F.tok2[k]), /Only Admin|ACCESS_OFF|Access denied/i, k);
    assert.throws(() => G.setUserCountryByAdmin(F.tok2[k], 'a@aps.org', 'IN', 'India'), /Only Admin|ACCESS_OFF|Access denied/i, k);
    assert.throws(() => G.exportUserCountry(F.tok2[k]), /Only Admin|ACCESS_OFF|Access denied/i, k);
  });
});
t('read through the cache: dashboard loads read the sheet once; any change clears the cache; a sheet edited by hand is picked up after Refresh-free cache expiry or the next change', () => {
  const F = setup(); const { G, env } = F;
  G.recordViewerCountry(F.tok2.student, 'IN', 'India');
  const sh = env.wb.getSheetByName('USER_COUNTRY'); let reads = 0; const gr = sh.getRange.bind(sh);
  sh.getRange = function () { reads++; return gr.apply(null, arguments); };
  G.UC_MEMO_ = null; G.getDashboardData(F.tok2.admin); G.UC_MEMO_ = null; G.getDashboardData(F.tok2.hm); G.UC_MEMO_ = null; G.getDashboardData(F.tok2.teacher);
  assert.ok(reads <= 1, 'sheet read at most once for three loads (cache): ' + reads);
  G.setUserCountryByAdmin(F.tok2.admin, 'sa0_aps6650' + D, 'NZ', 'New Zealand'); G.UC_MEMO_ = null;
  const kid = J(G.getDashboardData(F.tok2.admin)).courses.flatMap(c => c.students).find(s => s.email === 'sa0_aps6650' + D);
  assert.strictEqual(kid.countryCode, 'NZ', 'change visible at once');
});
t('weekly prune also removes USER_COUNTRY rows of people in no active class and not updated for 180 days; switch OFF hides everything and saves nothing', () => {
  const F = setup(); const { G, env } = F;
  G.recordViewerCountry(F.tok2.student, 'IN', 'India');
  G.setUserCountryByAdmin(F.tok2.admin, 'gone_aps1' + D, 'IN', 'India'); G.setUserCountryByAdmin(F.tok2.admin, 'recent_aps2' + D, 'IN', 'India');
  const sh = env.wb.getSheetByName('USER_COUNTRY'); const gone = sh.data.find(x => x[0] === 'gone_aps1' + D); gone[8] = '2025-01-01 10:00:00';
  const st = sh.data.find(x => x[0] === 'sa0_aps6650' + D); st[8] = '2025-01-01 10:00:00'; G.ucInvalidate_();
  const courses = G.readAllCoursesFromCache_();
  G.rosterDataset_ = () => ({ classrooms: courses.map(c => ({ id: c.id, name: c.name, status: 'ACTIVE' })), teachers: [], students: courses.flatMap(c => (c.students || []).map(s => ({ c: c.id, e: s.email, s: 'ACTIVE' }))) });
  G.apsBigSet_('lastLoginMap', JSON.stringify(Object.fromEntries(Array.from({ length: 25 }, (_, i) => ['p' + i + '@aps.org', { db: new Date().toISOString() }]))));
  const dry = J(G.previewPersonDataPrune()); assert.strictEqual(dry.removed.countrySheet, 1); assert.strictEqual(rows(env).length, 3);
  const r = J(G.runPersonDataPruneNow()); assert.strictEqual(r.removed.countrySheet, 1);
  assert.deepStrictEqual(rows(env).map(x => x[0]).sort(), ['recent_aps2' + D, 'sa0_aps6650' + D], 'student in a class kept even though old; recent kept');
  env.props.APS_COUNTRY_FEATURE = 'off';
  assert.strictEqual(J(G.getMyCountryPreference(F.tok2.student)).disabled, true);
  const kid = J(G.getDashboardData(F.tok2.admin)).courses.flatMap(c => c.students).find(s => s.email === 'sa0_aps6650' + D); assert.strictEqual(kid.countryFlag, '');
  G.recordViewerCountry(F.tok2.teacher, 'FR', 'France'); assert.ok(!rows(env).some(x => x[4] === 'FR'), 'nothing saved while off');
  assert.strictEqual(J(G.getUserCountryAdmin(F.tok2.admin)).on, false);
});
t('Access Control: new row "🌍 Users outside the USA" under Volunteer/Teacher Management — Admin / Super Admin only (BOD, HM, teachers, students off); Super Admin can switch it off for Admin', () => {
  const F = setup(); const { G, env } = F;
  const SA = F.tok('sa@aps.org', 'superadmin');
  const row = J(G.getAccessControl(SA)).rows.find(r => r.key === 'teacherMgmt.userCountry');
  assert.ok(row && row.parent === 'teacherMgmt' && /Users outside the USA/.test(row.label), JSON.stringify(row));
  assert.throws(() => G.getUserCountryAdmin(F.tok2.bod), /Only Admin|ACCESS_OFF/, 'BOD (sees Teacher Appreciation) cannot see countries');
  assert.ok(J(G.getUserCountryAdmin(F.tok2.admin)).rows); assert.ok(J(G.getUserCountryAdmin(SA)).rows);
  G.saveAccessControl(SA, [{ role: 'admin', key: 'teacherMgmt.userCountry', visible: false }]);
  assert.throws(() => G.getUserCountryAdmin(F.tok2.admin), /ACCESS_OFF/, 'Super Admin switched it off for Admin');
  assert.ok(J(G.getUserCountryAdmin(SA)).rows, 'Super Admin always');
  assert.ok(J(G.getTeacherAppreciationData(F.tok2.admin, {})), 'Teacher Appreciation unaffected');
});

let fails = 0;
for (const [n, fn] of tests) { try { fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 6).join('\n   ')); } }
console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);

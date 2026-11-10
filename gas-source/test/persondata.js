// r119 — second property store diet: country feature OFF (+ data deleted), compact last-login / onboarded storage
// (exact round trip, transparent to callers), weekly prune of people who left (180 days). (node test/persondata.js)
const assert = require('assert');
const { setup } = require('./coveragefixture');
const tests = []; const t = (n, fn) => tests.push([n, fn]);
const J = x => JSON.parse(JSON.stringify(x));
const D = '@avvaiyarpadasalai.org';
const iso = ms => new Date(ms).toISOString();
const DAY = 86400000;

function bigMaps(n, now) {
  const ll = {}, ob = {};
  for (let i = 0; i < n; i++) {
    const e = 'firstname' + i + '_lastname_aps' + (1000 + i) + D;
    const base = now - (i % 50) * DAY - i * 7919;
    ll[e] = i % 3 === 0 ? { gc: iso(base - 3600e3), gm: iso(base - 7200e3), db: iso(base) } : i % 3 === 1 ? { gc: iso(base) } : { db: iso(base + 123) };
    ob[e] = iso(base - 30 * DAY);
  }
  return { ll, ob };
}

t('compact storage: realistic 1,500-person lists shrink by more than half and read back EXACTLY (same JSON, same key order)', () => {
  const F = setup(); const { G, env } = F;
  const { ll, ob } = bigMaps(1500, Date.now());
  const rawLL = JSON.stringify(ll), rawOB = JSON.stringify(ob);
  G.apsBigSet_('lastLoginMap', rawLL); G.apsBigSet_('onboardedStudents', rawOB);
  const sLL = env.userProps.lastLoginMap, sOB = env.userProps.onboardedStudents;
  assert.ok(/^\{"_c":2,"k":"ll"/.test(sLL) && /^\{"_c":2,"k":"ob"/.test(sOB), 'stored compact');
  assert.ok(!sLL.includes(D) && !sOB.includes(D), 'domain not repeated');
  console.log('   lastLogin ' + (rawLL.length / 1024).toFixed(1) + ' KB → ' + (sLL.length / 1024).toFixed(1) + ' KB; onboarded ' + (rawOB.length / 1024).toFixed(1) + ' KB → ' + (sOB.length / 1024).toFixed(1) + ' KB');
  assert.ok(sLL.length < rawLL.length * 0.5 && sOB.length < rawOB.length * 0.6);
  assert.strictEqual(G.apsBigGet_('lastLoginMap'), rawLL, 'apsBigGet_ returns the original text');
  assert.strictEqual(JSON.stringify(G.apsBigJson_('onboardedStudents')), rawOB);
  assert.strictEqual(JSON.stringify(J(G.getLastLoginMap_())), rawLL);
});
t('compact storage: odd entries are kept exactly as they were (legacy shape, nulls, non-APS domain, odd dates)', () => {
  const F = setup(); const { G, env } = F;
  const ll = { ['a' + D]: { ts: '2026-01-01T00:00:00.000Z', source: 'DB' }, 'x@gmail.com': { gc: '2026-10-01T10:00:00.000Z', gm: null, db: '2026-10-02T10:00:00.000Z' },
    ['b' + D]: { db: '2026-10-02T10:00:00Z' }, ['c' + D]: { db: 'not a date' }, ['d' + D]: { gm: '2026-10-02T10:00:00.000Z', gc: '2026-10-01T10:00:00.000Z' }, ['e' + D]: {} };
  const ob = { ['a' + D]: '2026-09-01T00:00:00.000Z', ['b' + D]: true, ['c' + D]: '2026-09-01' };
  const pad = bigMaps(30, Date.now()); Object.assign(ll, pad.ll); Object.assign(ob, pad.ob);
  G.apsBigSet_('lastLoginMap', JSON.stringify(ll)); G.apsBigSet_('onboardedStudents', JSON.stringify(ob));
  assert.ok(/^\{"_c":2/.test(env.userProps.lastLoginMap));
  assert.deepStrictEqual(J(G.getLastLoginMap_()), ll); assert.strictEqual(G.apsBigGet_('lastLoginMap'), JSON.stringify(ll));
  assert.strictEqual(G.apsBigGet_('onboardedStudents'), JSON.stringify(ob));
  // a key that ends in "@" or a broken value → stored unchanged
  G.apsBigSet_('lastLoginMap', JSON.stringify({ 'odd@': { db: '2026-10-02T10:00:00.000Z' } })); assert.strictEqual(env.userProps.lastLoginMap, '{"odd@":{"db":"2026-10-02T10:00:00.000Z"}}');
  G.apsBigSet_('lastLoginMap', 'not json'); assert.strictEqual(env.userProps.lastLoginMap, 'not json'); assert.strictEqual(G.apsBigGet_('lastLoginMap'), 'not json');
  // other keys never touched
  G.apsBigSet_('presenceMap', '{"z@x.org":{"lastSeen":"2026-10-30T00:00:00.000Z"}}'); assert.strictEqual(env.userProps.presenceMap, '{"z@x.org":{"lastSeen":"2026-10-30T00:00:00.000Z"}}');
});
t('transparent to the dashboard: old plain data is read as before; heartbeat / Classroom merge write compact; Last Login display and Onboarded flags unchanged', () => {
  const F = setup(); const { G, env } = F;
  const stu = 'sa0_aps6650' + D;
  const { ll, ob } = bigMaps(40, Date.now());
  ll[stu] = { gc: '2026-10-01T14:05:00.000Z', db: '2026-10-03T15:10:00.000Z' }; ob[stu] = '2026-09-01T00:00:00.000Z';
  env.userProps.lastLoginMap = JSON.stringify(ll); env.userProps.onboardedStudents = JSON.stringify(ob); // r118 format
  const before = J(G.getDashboardData(F.tok2.admin)).courses.flatMap(c => c.students).find(s => s.email === stu);
  assert.ok(/^10\/03 11:10 \(GC\/DB\)$/.test(before.lastLoginDisplay), before.lastLoginDisplay); assert.strictEqual(before.onboarded, true);
  G.mergeLastLoginActivity_({ [stu]: '2026-10-04T12:00:00.000Z' }, 'gm');
  assert.ok(/^\{"_c":2/.test(env.userProps.lastLoginMap), 'compacted on its next write');
  const m = J(G.getLastLoginMap_()); assert.deepStrictEqual(m[stu], { gc: '2026-10-01T14:05:00.000Z', gm: '2026-10-04T12:00:00.000Z', db: '2026-10-03T15:10:00.000Z' });
  G.mergeLastLoginActivity_({ [stu]: '2026-10-04T12:00:00.000Z' }, 'gm'); // existing code puts the entry in gc/gm/db order once
  const n0 = env.userProps.lastLoginMap; G.mergeLastLoginActivity_({ [stu]: '2026-10-04T12:00:00.000Z' }, 'gm'); assert.strictEqual(env.userProps.lastLoginMap, n0, 'same time again → no rewrite');
  G.recordHeartbeat_(stu);
  const after = J(G.getDashboardData(F.tok2.admin)).courses.flatMap(c => c.students).find(s => s.email === stu);
  assert.ok(/\(GC\/GM\/DB\)$/.test(after.lastLoginDisplay), after.lastLoginDisplay); assert.strictEqual(after.onboarded, true); assert.strictEqual(G.apsBigJson_('onboardedStudents')[stu], '2026-09-01T00:00:00.000Z', 'onboarded date kept (r121: not sent to the browser)');
  assert.ok(/^\{"_c":2,"k":"ob"/.test(env.userProps.onboardedStudents) || env.userProps.onboardedStudents === JSON.stringify(ob), 'onboarded unchanged or compacted');
});
t('country feature OFF (APS_COUNTRY_FEATURE = off): no country step, no flag, nothing saved; the old list is deleted by the daily check and listed / deleted by the Admin clean-up button', () => {
  const F = setup(); const { G, env } = F; env.props.APS_COUNTRY_FEATURE = 'off';
  env.userProps.apsUserCountryMap_v1 = JSON.stringify({ ['sa0_aps6650' + D]: { countryCode: 'US', countryName: 'United States', updatedAt: 'x' } });
  const pref = J(G.getMyCountryPreference(F.tok2.student));
  assert.strictEqual(pref.hasDefault, true, 'first sign-in skips the country step'); assert.strictEqual(pref.disabled, true); assert.strictEqual(pref.defaultFlag, '');
  G.recordViewerCountry(F.tok2.teacher, 'IN', 'India'); assert.ok(!/India/.test(env.userProps.apsUserCountryMap_v1), 'auto-detect not saved');
  assert.strictEqual(J(G.setMyDefaultCountry(F.tok2.teacher, 'IN', 'India')).disabled, true); assert.ok(!/India/.test(env.userProps.apsUserCountryMap_v1), 'default not saved');
  const kid = J(G.getDashboardData(F.tok2.admin)).courses.flatMap(c => c.students).find(s => s.email === 'sa0_aps6650' + D);
  assert.strictEqual(kid.countryFlag, ''); assert.strictEqual(kid.countryName, '');
  const st = J(G.getMaintenanceStatus(F.tok2.admin)).storage; const it = st.items.find(i => i.key === 'apsUserCountryMap_v1');
  assert.ok(it && /country feature switched off/.test(it.action), JSON.stringify(st.items));
  const r = J(G.runTempDataCleanup(F.tok2.admin)); assert.ok(r.handled.includes('apsUserCountryMap_v1')); assert.strictEqual(env.userProps.apsUserCountryMap_v1, undefined);
  env.props.apsUserCountryMap_v1 = '{"q@x.org":{"countryCode":"US"}}'; // a leftover copy in Script Properties
  G.apsPropHealth_(false); assert.strictEqual(env.props.apsUserCountryMap_v1, undefined); assert.strictEqual(env.userProps.apsUserCountryMap_v1, undefined, 'daily check deletes it everywhere');
});
t('r120: country feature ON by default (USER_COUNTRY sheet): the old property list is still deleted; nothing goes back into property storage', () => {
  const F = setup(); const { G, env } = F;
  env.userProps.apsUserCountryMap_v1 = '{"q@x.org":{"countryCode":"IN"}}';
  assert.strictEqual(J(G.getMyCountryPreference(F.tok2.teacher)).hasDefault, true, 'no country step at sign-in');
  G.setMyDefaultCountry(F.tok2.teacher, 'IN', 'India');
  const st = J(G.getMaintenanceStatus(F.tok2.admin)).storage; assert.ok(/USER_COUNTRY sheet/.test(st.items.find(i => i.key === 'apsUserCountryMap_v1').action));
  G.apsPropHealth_(false); assert.strictEqual(env.userProps.apsUserCountryMap_v1, undefined);
  assert.strictEqual(J(G.getMyCountryPreference(F.tok2.teacher)).countryCode, 'IN'); assert.ok(!Object.keys(env.props).concat(Object.keys(env.userProps)).some(k => /country/i.test(k) && k !== 'APS_COUNTRY_FEATURE'));
});

function pruneSetup() {
  const F = setup(); const { G, env } = F; const now = Date.now();
  const active = 'sa0_aps6650' + D, teacher = F.vpEmail;
  const ll = {}, ob = {};
  ll[active] = { db: iso(now - 400 * DAY) }; ob[active] = iso(now - 500 * DAY); // in a class → kept however old
  ll[teacher] = { gc: iso(now - 300 * DAY) };
  ll['left_old_aps1' + D] = { gc: iso(now - 200 * DAY), db: iso(now - 190 * DAY) }; ob['left_old_aps1' + D] = iso(now - 250 * DAY); // left, 190 days → removed
  ll['left_new_aps2' + D] = { db: iso(now - 100 * DAY) }; ob['left_new_aps2' + D] = iso(now - 300 * DAY); // left, but active 100 days ago → kept
  ll['staff@aps.org'] = { db: iso(now - 2 * DAY) }; // not in a class, uses the dashboard → kept
  ll['weird_aps3' + D] = { db: 'bad' }; // no readable date → kept
  ob['onlyob_aps4' + D] = iso(now - 400 * DAY); // only onboarded, old → removed
  for (let i = 0; i < 20; i++) ll['pad' + i + '_aps9' + i + D] = { db: iso(now - 5 * DAY) }; // recent → kept
  G.apsBigSet_('lastLoginMap', JSON.stringify(ll)); G.apsBigSet_('onboardedStudents', JSON.stringify(ob));
  const big = G.PropertiesService.getUserProperties();
  const mon = ms => new Date(ms).toISOString().slice(0, 7);
  big.setProperty('GOOGLE_REVIEW_PROMPT_left_old_aps1' + D, mon(now - 220 * DAY));
  big.setProperty('GOOGLE_REVIEW_PROMPT_left_new_aps2' + D, mon(now - 20 * DAY));
  big.setProperty('GOOGLE_REVIEW_PROMPT_' + active, mon(now - 300 * DAY));
  // roster: the fixture's active AY26-27 classes, with ACTIVE memberships
  const courses = G.readAllCoursesFromCache_();
  G.rosterDataset_ = () => ({ classrooms: courses.map(c => ({ id: c.id, name: c.name, status: 'ACTIVE' })), teachers: [], students: courses.flatMap(c => (c.students || []).map(s => ({ c: c.id, e: s.email, s: 'ACTIVE' }))) });
  return { F, G, env, big, active, teacher };
}
t('weekly prune: removes only people in no active AY26-27 class AND inactive for 180+ days (last login, onboarded, Google Review prompt); class members, recent and undated entries kept; counts only (no emails)', () => {
  const { G, big, active, teacher } = pruneSetup();
  const dry = J(G.previewPersonDataPrune());
  assert.strictEqual(dry.result, 'DRY_RUN'); assert.deepStrictEqual(dry.removed, { lastLogin: 1, onboarded: 2, googleReview: 1, countrySheet: 0 });
  assert.ok(G.getLastLoginMap_()['left_old_aps1' + D], 'dry run changes nothing');
  const r = J(G.runPersonDataPruneNow());
  assert.strictEqual(r.result, 'OK'); assert.strictEqual(r.keepDays, 180); assert.ok(r.activeClasses > 0 && r.activePeople > 0);
  const ll = J(G.getLastLoginMap_()), ob = J(G.apsBigJson_('onboardedStudents'));
  assert.ok(!ll['left_old_aps1' + D] && !ob['left_old_aps1' + D] && !ob['onlyob_aps4' + D], 'left 180+ days → removed');
  assert.ok(ll[active] && ob[active], 'in a class → kept'); assert.ok(ll[teacher], 'teacher in a class → kept');
  assert.ok(ll['left_new_aps2' + D] && ob['left_new_aps2' + D], 'left but active 100 days ago → kept');
  assert.ok(ll['staff@aps.org'] && ll['weird_aps3' + D]);
  assert.strictEqual(big.getProperty('GOOGLE_REVIEW_PROMPT_left_old_aps1' + D), null);
  assert.ok(big.getProperty('GOOGLE_REVIEW_PROMPT_left_new_aps2' + D) && big.getProperty('GOOGLE_REVIEW_PROMPT_' + active));
  assert.ok(!/@|aps\d/.test(JSON.stringify(r)), 'no emails in the result');
  assert.strictEqual(J(G.runPersonDataPruneNow()).removed.lastLogin, 0, 'second run: nothing more');
});
t('weekly prune safety: no roster → nothing removed; more than 40 % at once → SAFETY_STOP unless forced; APS_PERSON_DATA_KEEP_DAYS respected', () => {
  let s = pruneSetup();
  s.G.rosterDataset_ = () => ({ classrooms: [], teachers: [], students: [] });
  assert.strictEqual(J(s.G.runPersonDataPruneNow()).result, 'SKIPPED_NO_ROSTER'); assert.ok(s.G.getLastLoginMap_()['left_old_aps1' + D]);
  s = pruneSetup();
  const ll = J(s.G.getLastLoginMap_()); for (let i = 0; i < 40; i++) ll['gone' + i + '_aps5' + i + D] = { db: iso(Date.now() - 400 * DAY) };
  s.G.apsBigSet_('lastLoginMap', JSON.stringify(ll));
  const r = J(s.G.runPersonDataPruneNow()); assert.ok(/^SAFETY_STOP/.test(r.result), r.result); assert.ok(s.G.getLastLoginMap_()['gone1_aps51' + D], 'nothing changed');
  assert.strictEqual(J(s.G.runPersonDataPruneNow(true)).result, 'OK'); assert.ok(!s.G.getLastLoginMap_()['gone1_aps51' + D], 'forced from the editor');
  s = pruneSetup(); s.env.props.APS_PERSON_DATA_KEEP_DAYS = '365';
  const r3 = J(s.G.runPersonDataPruneNow()); assert.strictEqual(r3.keepDays, 365); assert.ok(s.G.getLastLoginMap_()['left_old_aps1' + D], '190 days < 365 → kept');
});
t('weekly job PERSON_DATA_PRUNE is in the one hourly scheduler (Sunday 3 AM); editor tools are owner-only; rollback tool writes the plain format', () => {
  const { G, env } = pruneSetup();
  const j = G.wjJob_('PERSON_DATA_PRUNE'); assert.strictEqual(j.dow, 0); assert.strictEqual(j.hour, 3);
  assert.ok(J(G.wjStatus_()).jobs.some(x => x.id === 'PERSON_DATA_PRUNE' && /Sunday ~3 AM/.test(x.when)));
  G.expandPersonDataForRollback(); assert.ok(!/^\{"_c":2/.test(env.userProps.lastLoginMap) && JSON.parse(env.userProps.lastLoginMap)['staff@aps.org'], 'plain format for r118');
  const c = J(G.compactPersonData()); assert.ok(/^\{"_c":2/.test(env.userProps.lastLoginMap)); assert.ok(c.secondKbAfter <= c.secondKbBefore);
  const realSession = G.Session; G.Session = { getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => 'owner@aps.org' }) };
  try { ['previewPersonDataPrune', 'runPersonDataPruneNow', 'compactPersonData', 'expandPersonDataForRollback'].forEach(f => assert.throws(() => G[f](), /Access denied/, f)); }
  finally { G.Session = realSession; }
});

let fails = 0;
for (const [n, fn] of tests) { try { fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 6).join('\n   ')); } }
console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);

// r121 — performance: realtime poll sends only the viewer's classes / people and only recent activity (shared 20-s map);
// request-scoped memo; slimmer getDashboardData payload. Same values on screen. (node test/perf121.js)
const assert = require('assert');
const { setup } = require('./coveragefixture');
const tests = []; const t = (n, fn) => tests.push([n, fn]);
const J = x => JSON.parse(JSON.stringify(x));
const D = '@avvaiyarpadasalai.org', iso = ms => new Date(ms).toISOString(), MIN = 60000;
const emailOf = (env, tok) => JSON.parse(env.cache['aps_sess_' + tok]).email;
function seed(F) {
  const { G, env } = F; const now = Date.now();
  const courses = G.readAllCoursesFromCache_();
  const stu = 'sa0_aps6650' + D, myCls = courses.filter(c => (c.students || []).some(s => s.email === stu)).map(c => String(c.id));
  const other = courses.find(c => !myCls.includes(String(c.id)) && (c.students || []).length);
  const otherStu = other.students[0].email;
  G.apsBigSet_('presenceMap', JSON.stringify({ [stu]: { lastSeen: iso(now - 9 * MIN), loginAt: iso(now - 60 * MIN) }, [otherStu]: { lastSeen: iso(now - 1 * MIN), loginAt: iso(now - 5 * MIN) }, ['old' + D]: { lastSeen: iso(now - 11 * MIN), loginAt: iso(now - 70 * MIN) } }));
  G.apsBigSet_('lastLoginMap', JSON.stringify({ [stu]: { gc: iso(now - 30 * 864e5), db: iso(now - 10 * MIN) }, [otherStu]: { db: iso(now - 2 * MIN) }, ['stale' + D]: { db: iso(now - 20 * MIN) } }));
  env.props[G.EXTERNAL_ACTIVITY_REALTIME_PROP_KEY] = JSON.stringify({ [stu]: { gm: iso(now - 170 * MIN), gc: null }, [otherStu]: { gm: null, gc: iso(now - 20 * MIN) }, ['gmold' + D]: { gm: iso(now - 190 * MIN), gc: iso(now - 30 * MIN) } });
  const wk = G.getCurrentWeekId_();
  env.props.teacherAvailabilityRealtimeMap = JSON.stringify({ [wk + '|' + myCls[0]]: { weekId: wk, courseId: myCls[0], status: 'CONFIRMED', updatedAt: iso(now - 10 * MIN) }, [wk + '|' + other.id]: { weekId: wk, courseId: other.id, status: 'CONFIRMED', updatedAt: iso(now - 5 * MIN) }, [wk + '|old']: { weekId: wk, courseId: 'old', status: 'CONFIRMED', updatedAt: iso(now - 20 * MIN) } });
  G.CacheService.getScriptCache().remove('aps_rt_recent_v1');
  return { stu, otherStu, myCls, other, wk };
}
t('realtime poll — Admin: every class, but only RECENT activity (presence ≤ 10 min, Meet ≤ 185 min, Classroom ≤ 25 min, last login / availability changed ≤ 15 min); values unchanged', () => {
  const F = setup(); const { G } = F; const s = seed(F);
  const r = J(G.getRealtimeStatusSnapshot(F.tok2.admin));
  assert.deepStrictEqual(Object.keys(r.presence).sort(), [s.otherStu, s.stu].sort(), 'presence ≤ 10 min');
  assert.deepStrictEqual(Object.keys(r.externalActivity).sort(), [s.otherStu, s.stu].sort(), 'Meet 170 min / Classroom 20 min kept, 190 / 30 min dropped');
  assert.deepStrictEqual(Object.keys(r.lastLogin).sort(), [s.otherStu, s.stu].sort(), 'changed in the last 15 min');
  assert.deepStrictEqual(Object.keys(r.lastLogin[s.stu]).sort(), ['db', 'gc'], 'whole entry (all sources), same values');
  assert.deepStrictEqual(Object.keys(r.weeklyAvailability).sort(), [s.wk + '|' + s.myCls[0], s.wk + '|' + s.other.id].sort());
  ['live', 'teacherNotInClass', 'needsTechSupport', 'classStatusManual', 'liveStatus', 'chatVersion', 'pollMs', 'serverTime'].forEach(k => assert.ok(k in r, k));
});
t('realtime poll — student / teacher: only their own classes and the people in them (no one else\'s last login or online status)', () => {
  const F = setup(); const { G, env } = F; const s = seed(F);
  const r = J(G.getRealtimeStatusSnapshot(F.tok2.student));
  assert.deepStrictEqual(Object.keys(r.presence), [s.stu]); assert.deepStrictEqual(Object.keys(r.lastLogin), [s.stu]); assert.deepStrictEqual(Object.keys(r.externalActivity), [s.stu]);
  assert.deepStrictEqual(Object.keys(r.weeklyAvailability), [s.wk + '|' + s.myCls[0]], 'other classes\' availability not sent');
  assert.ok(!JSON.stringify(r).includes(s.otherStu));
  const tr = J(G.getRealtimeStatusSnapshot(F.tok2.teacher)); const tEmail = emailOf(env, F.tok2.teacher);
  const tCls = G.readAllCoursesFromCache_().filter(c => (c.teachers || []).some(x => x.email === tEmail)).map(c => String(c.id));
  Object.keys(tr.weeklyAvailability).forEach(k => assert.ok(tCls.includes(k.split('|').pop())));
});
t('one shared recent-activity map for every viewer for 20 s (the big lists are read once, not on every poll); class-status changes still show at once', () => {
  const F = setup(); const { G, env } = F; const s = seed(F);
  G.getRealtimeStatusSnapshot(F.tok2.admin);
  const up = G.PropertiesService.getUserProperties(); let n = 0; const o = up.getProperty; up.getProperty = function () { n++; return o.apply(up, arguments); }; G.PropertiesService.getUserProperties = () => up;
  for (const k of ['admin', 'hm', 'teacher', 'student', 'vp']) G.getRealtimeStatusSnapshot(F.tok2[k]);
  assert.strictEqual(n, 0, 'no last-login / presence read for 5 more polls');
  up.getProperty = o;
  env.props.liveMap = JSON.stringify({ [s.myCls[0]]: { live: true, updatedAt: new Date().toISOString() } });
  assert.strictEqual(J(G.getRealtimeStatusSnapshot(F.tok2.admin)).live[s.myCls[0]].live, true, 'operational maps are read on every poll (not from the 20-s map)');
  assert.strictEqual(J(G.getRealtimeStatusSnapshot(F.tok2.student)).live[s.myCls[0]].live, true);
});
t('class list of a teacher / student is cached per person and refreshed after a roster write (course-memo generation)', () => {
  const F = setup(); const { G } = F; seed(F);
  const sess = { email: 'sa0_aps6650' + D, role: 'student' };
  const a = G.apsViewerScope_(sess); assert.strictEqual(a.all, false); assert.ok(a.ids.length >= 1 && a.em['sa0_aps6650' + D]);
  assert.strictEqual(G.apsViewerScope_({ email: 'admin@aps.org', role: 'admin' }).all, true);
  ['headmaster', 'superadmin', 'vcfo_amchsts_bod'].forEach(r => assert.strictEqual(G.apsViewerScope_({ email: 'x@aps.org', role: r }).all, true, r));
  const gen1 = G.apsCoursesMemoGen_(); G.invalidateCoursesMemo_(); G.readAllCoursesFromCache_(); assert.notStrictEqual(G.apsCoursesMemoGen_(), gen1, 'new generation after a write');
  assert.deepStrictEqual(G.apsViewerScope_(sess).ids, a.ids);
});
t('getDashboardData: smaller payload — unused person fields removed, default photo sent as "" (real photos kept); everything shown is unchanged', () => {
  const F = setup(); const { G } = F;
  const d = J(G.getDashboardData(F.tok2.admin)); const ppl = d.courses.flatMap(c => c.students.concat(c.teachers));
  ppl.forEach(p => ['lastLoginBySource', 'lastLoginSource', 'countrySource', 'onboardedAt'].forEach(f => assert.ok(!(f in p), f)));
  ['email', 'name', 'apsId', 'online', 'onlineSince', 'inMeet', 'lastLoginDisplay', 'lastLoginAt', 'countryFlag', 'countryName', 'countryCode', 'photo'].forEach(f => assert.ok(ppl.every(p => f in p), f));
  assert.ok(d.courses.flatMap(c => c.students).every(p => 'onboarded' in p), 'onboarded (students)');
  assert.ok(ppl.some(p => p.photo === ''), 'placeholder → ""'); assert.ok(!ppl.some(p => p.photo === G.PLACEHOLDER_PHOTO));
});
t('request-scoped memo: settings are read once per page load, and a change between two loads is seen at once (memo cleared after each request)', () => {
  const F = setup(); const { G, env } = F;
  const sp = G.PropertiesService.getScriptProperties(); const cnt = {}; const o = sp.getProperty; sp.getProperty = function (k) { cnt[k] = (cnt[k] || 0) + 1; return o.apply(sp, arguments); }; G.PropertiesService.getScriptProperties = () => sp;
  G.getDashboardData(F.tok2.admin); sp.getProperty = o;
  ['APS_COUNTRY_FEATURE', 'rosterHiddenStaffVisible_v1'].forEach(k => assert.ok((cnt[k] || 0) <= 1, k + ' read ' + cnt[k] + '×'));
  assert.strictEqual(G.APS_REQ_MEMO_, null, 'memo cleared');
  G.recordViewerCountry(F.tok2.student, 'IN', 'India');
  let kid = J(G.getDashboardData(F.tok2.admin)).courses.flatMap(c => c.students).find(s => s.email === 'sa0_aps6650' + D); assert.strictEqual(kid.countryFlag, '🇮🇳');
  env.props.APS_COUNTRY_FEATURE = 'off';
  kid = J(G.getDashboardData(F.tok2.admin)).courses.flatMap(c => c.students).find(s => s.email === 'sa0_aps6650' + D); assert.strictEqual(kid.countryFlag, '', 'switch seen on the next load');
  assert.throws(() => G.getDashboardData('bad-token'), /SESSION/); assert.strictEqual(G.APS_REQ_MEMO_, null, 'memo cleared after an error too');
});

let fails = 0;
for (const [n, fn] of tests) { try { fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 6).join('\n   ')); } }
console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);

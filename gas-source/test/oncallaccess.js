// r46: every Google Classroom teacher (incl. tcs_ / tts_) gets teacher access to that class; cards unchanged (node test/oncallaccess.js)
const assert = require('assert');
const { build } = require('./gradingfixture');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const J = x => JSON.parse(JSON.stringify(x));
const TCS = 'tcs_kavitha_aps8120@avvaiyarpadasalai.org', TTS = 'tts_ravi_aps9001@avvaiyarpadasalai.org';
function setup() {
  const F = build(); const { env, cls, ids, person } = F;
  { const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0); P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p; }
  cls.teachers[ids.N3EA].push(person('TCS1', 'Kavitha [TCS]', TCS));
  cls.teachers[ids.MAZ].push(person('TCS1', 'Kavitha [TCS]', TCS));
  cls.teachers[ids.N4AB].push(person('TTS1', 'Ravi - TTS', TTS));
  F.G.syncClassroomData();
  return F;
}
t('tcs_ teacher (not Primary) signs in as Teacher and sees exactly the classes she teaches in Classroom', () => {
  const F = setup(); const { G, ids } = F;
  const s = J(G.establishSessionForVerifiedClaims_({ email: TCS }));
  assert.strictEqual(s.ok, true); assert.strictEqual(s.user.role, 'teacher');
  const d = J(G.getDashboardData(F.tok(TCS, 'teacher')));
  assert.strictEqual(d.role, 'teacher');
  assert.deepStrictEqual(d.courses.map(c => String(c.id)).sort(), [ids.N3EA, ids.MAZ].sort());
  assert.ok(d.courses.every(c => c.viewerAccess && c.viewerAccess.label === 'Teacher'), JSON.stringify(d.courses.map(c => c.viewerAccess)));
});
t('display unchanged: the tcs_ / tts_ account is still not listed among the card teachers', () => {
  const F = setup(); const { G, ids } = F;
  const d = J(G.getDashboardData(F.tok('admin@aps.org', 'admin')));
  const n3ea = d.courses.find(c => String(c.id) === ids.N3EA), n4 = d.courses.find(c => String(c.id) === ids.N4AB);
  assert.ok(!n3ea.teachers.some(x => x.email === TCS)); assert.ok(!n4.teachers.some(x => x.email === TTS));
});
t('the full teacher roster never reaches the browser', () => {
  const F = setup(); const { G } = F;
  [['admin@aps.org', 'admin'], [TCS, 'teacher'], ['joshua_aps3407@avvaiyarpadasalai.org', 'student']].forEach(([e, r]) => {
    const d = J(G.getDashboardData(F.tok(e, r)));
    assert.ok(!JSON.stringify(d).includes('rosterTeacherEmails'), r);
  });
});
t('access is per class: the tts_ teacher cannot act on a class she is not in; teacher-scoped checks use the roster', () => {
  const F = setup(); const { G, ids } = F;
  const courses = G.readAllCoursesFromCache_();
  const c = id => courses.find(x => String(x.id) === id);
  assert.strictEqual(G.userHasCourseAccess_(TTS, c(ids.N4AB)), true);
  assert.strictEqual(G.userHasCourseAccess_(TTS, c(ids.N3EF)), false);
  assert.strictEqual(G.userHasCourseAccess_(TCS, c(ids.MAZ)), true);
  const d = J(G.getDashboardData(F.tok(TTS, 'teacher')));
  assert.deepStrictEqual(d.courses.map(x => String(x.id)), [ids.N4AB]);
});
t('an on-call account that is not in any Classroom stays Authorized (no classes)', () => {
  const F = setup(); const { G } = F;
  const s = J(G.establishSessionForVerifiedClaims_({ email: 'tcs_other_aps7777@avvaiyarpadasalai.org' }));
  assert.strictEqual(s.user.role, 'authorized');
});
t('r47: rostered (non-Primary) TCS_ and TTS_ teachers are kept for Attendance after a real sync; not sent to the browser', () => {
  const F = setup(); const { G, ids } = F;
  const courses = G.readAllCoursesFromCache_();
  const c = id => courses.find(x => String(x.id) === id);
  assert.ok(Array.isArray(c(ids.N3EA).onCallRoster) && c(ids.N3EA).onCallRoster.some(p => p.email === TCS), 'cache keeps the on-call roster');
  const names = id => J(G.attRosterTeachers_(c(id))).map(p => String(p.email).toLowerCase());
  assert.ok(names(ids.N3EA).includes(TCS) && names(ids.MAZ).includes(TCS), 'TCS_ on the Attendance roster');
  assert.ok(names(ids.N4AB).includes(TTS), 'TTS_ on the Attendance roster');
  const d = J(G.getDashboardData(F.tok('admin@aps.org', 'admin')));
  assert.ok(!JSON.stringify(d).includes('onCallRoster'));
});

t('r47: end-to-end — Attendance sync records the rostered TCS_ teacher; On-Call Teacher Attendance lists TCS_ and TTS_', () => {
  const F = setup(); const { G, ids, env } = F;
  const RealDate = Date, T = new RealDate('2026-09-28T09:30:00Z').getTime(); // Monday after the Sep 25-27 school weekend
  class D extends RealDate { constructor(...a) { if (a.length) super(...a); else super(T); } static now() { return T; } }
  G.Date = D;
  const at = (iso, email, mins, code) => ({ actor: { email }, id: { time: new RealDate(iso).toISOString() },
    events: [{ name: 'call_ended', parameters: [{ name: 'meeting_code', value: code }, { name: 'duration_seconds', intValue: String(mins * 60) }] }] });
  const items = [
    at('2026-09-26T17:25:00Z', 'teachera_aps101@avvaiyarpadasalai.org', 85, 'satclasscode'), // N3EA Sat 12:00–1:30 PM EDT
    at('2026-09-26T17:25:00Z', 'joshua_aps3407@avvaiyarpadasalai.org', 80, 'satclasscode'),
    at('2026-09-26T17:20:00Z', TCS, 60, 'satclasscode'),
    at('2026-09-27T01:00:00Z', TTS, 60, 'sunclasscode'), at('2026-09-27T01:00:00Z', 'teacherb_aps102@avvaiyarpadasalai.org', 85, 'sunclasscode') // N4AB Sun 7:30 PM? (outside window -> not joined)
  ];
  env.ctx.AdminReports.Activities.list = (u, app, o) => { const s = new RealDate(o.startTime).getTime(), e = o.endTime ? new RealDate(o.endTime).getTime() : Infinity;
    return { items: items.filter(it => { const x = new RealDate(it.id.time).getTime(); return x >= s && x <= e; }) }; };
  try { G.syncAttendanceForAllCourses({ full: true }); } catch (e) { console.log('sync note: ' + e.message); }
  const r = J(G.getOnCallTeacherAttendance(F.tok('admin@aps.org', 'admin'), { includeNotJoined: true }));
  const emails = [...new Set(r.rows.map(x => x.email))].sort();
  assert.ok(emails.includes(TCS), 'TCS_ captured: ' + emails.join(','));
  assert.ok(emails.includes(TTS), 'TTS_ captured: ' + emails.join(','));
  const asv = r.rows.find(x => x.email === TCS && String(x.courseId) === ids.N3EA);
  assert.ok(asv && asv.activeMinutes > 0, 'joined Sat class captured: ' + JSON.stringify(asv));
  const notJoined = r.rows.find(x => x.email === TCS && String(x.courseId) === ids.MAZ);
  assert.ok(notJoined && notJoined.activeMinutes === 0 && notJoined.onRoster === true, 'rostered Friday class, not joined, listed (includeNotJoined): ' + JSON.stringify(notJoined));
  const joinedOnly = J(G.getOnCallTeacherAttendance(F.tok('admin@aps.org', 'admin'), {}));
  assert.ok(joinedOnly.rows.some(x => x.email === TCS && x.activeMinutes > 0));
});

t('r48: tcs_asvika_aps8112 is no longer excluded — captured in On-Call Teacher Attendance (only vsugadev / vasuki stay excluded)', () => {
  const F = setup(); const { G } = F;
  const ASV = 'tcs_asvika_aps8112@avvaiyarpadasalai.org';
  assert.strictEqual(G.attIsExcludedEmail_(ASV), false, 'tcs_asvika not excluded');
  assert.strictEqual(G.attIsOnCallEmail_(ASV), true, 'tcs_asvika is an on-call (TCS_) account');
  assert.strictEqual(G.attIsExcludedEmail_('vasuki_aps999@avvaiyarpadasalai.org'), true, 'other explicit exclusions unchanged');
  assert.strictEqual(G.attIsExcludedEmail_('vsugadev@avvaiyarpadasalai.org'), true);
  assert.ok(!J(G.ATTENDANCE_ALWAYS_EXCLUDED_EMAILS_).includes(ASV));
});

t('r54: On-Call Coordinator (tcs_asvika, in no Classroom) signs in read-only and sees EVERY class; edits refused on the server', () => {
  const F = setup(); const { G, ids } = F;
  const ASV = 'tcs_asvika_aps8112@avvaiyarpadasalai.org';
  const s = J(G.establishSessionForVerifiedClaims_({ email: ASV }));
  assert.strictEqual(s.ok, true); assert.strictEqual(s.user.role, 'vcfo_amchsts_bod'); assert.strictEqual(s.user.roleLabel, 'On-Call Coordinator');
  assert.strictEqual(s.user.permissions.readOnly, true);
  const d = J(G.getDashboardData(F.tok(ASV, s.user.role)));
  const all = J(G.getDashboardData(F.tok('admin@aps.org', 'admin')));
  assert.strictEqual(d.courses.length, all.courses.length, 'all classes');
  assert.ok(d.courses.length > 0); assert.strictEqual(d.roleLabel, 'On-Call Coordinator');
  assert.doesNotThrow(() => G.getOnCallTeacherAttendance(F.tok(ASV, s.user.role), {}), 'On-Call Teacher Attendance is readable');
  assert.throws(() => G.setLiveStatus(F.tok(ASV, s.user.role), ids.MAZ, true));
  // a normal tcs_ teacher is unaffected
  assert.strictEqual(J(G.establishSessionForVerifiedClaims_({ email: TCS })).user.roleLabel, '');
});

console.log(pass + ' passed');

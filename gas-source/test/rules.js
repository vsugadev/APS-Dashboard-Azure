const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { makeContext } = require('./gasmock');
const { courses, audit, emails: E } = require('./fixtures2');
function fixedDate(iso) { const NOW = new Date(iso).getTime(); class Dt extends Date { constructor(...a){ if(a.length===0) super(NOW); else super(...a); } static now(){ return NOW; } } return Dt; }
const code = fs.readFileSync(__dirname + '/../Code.gs', 'utf8');
function boot(nowIso, opts) { opts = opts || {}; opts.Date = fixedDate(nowIso); const env = makeContext(opts); vm.runInContext(code, env.ctx, { filename: 'Code.gs' }); return env; }
function seed(env) { const sh = env.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h'); courses.forEach((c,i)=>{ const row = new Array(18).fill(''); row[0]=c.id; row[17]=JSON.stringify(c); sh.data[i+1]=row; }); }
function session(env, email, role) { const tok = 'tok_' + email; env.cache['aps_sess_' + tok] = JSON.stringify({ email, role }); return tok; }
let passed = 0; const t = (name, fn) => { fn(); passed++; console.log('PASS', name); };

const env = boot('2026-09-28T09:30:00Z', { auditItems: audit, props: { ATTENDANCE_WEEK1_START: '2026-09-11' } });
seed(env);
const c = env.ctx;

t('APSID derivation (centralized)', () => {
  assert.strictEqual(c.getAPSIdFromEmail('raja_aps1234@avvaiyarpadasalai.org'), 'APS1234');
  assert.strictEqual(c.getAPSIdFromEmail('kumar_APS5678@avvaiyarpadasalai.org'), 'APS5678');
  assert.strictEqual(c.getAPSIdFromEmail('suresh_APS9988@avvaiyarpadasalai.org'), 'APS9988');
  assert.strictEqual(c.getAPSIdFromEmail('unknown@example.com'), 'APSXXX');
  assert.strictEqual(c.getAPSIdFromEmail(''), 'APSXXX'); assert.strictEqual(c.getAPSIdFromEmail(null), 'APSXXX');
  assert.strictEqual(c.extractAPSID_('unknown@example.com'), 'NA', 'other screens keep their NA fallback');
});
t('effective class minutes: < 90 actual, >= 90 -> 95', () => {
  [[0,0],[30,30],[45,45],[60,60],[75,75],[89,89],[90,95],[91,95],[92,95],[93,95],[94,95],[95,95],[96,95],[100,95],[120,95],[130,95],[135,95],[150,95],[155,95]].forEach(([a,e]) => assert.strictEqual(c.getEffectiveClassMinutes(a), e, a + ' -> ' + e));
});

const sum = c.syncAttendanceForAllCourses();
const admin = session(env, 'admin@aps.org', 'admin');
let rows = c.getAttendanceRecordsForViewer(admin, { weekOf: 'WK-2026-09-25' });
const r = (email, courseId) => rows.find(x => x.email === email && (!courseId || x.courseId === courseId));
t('sync captured the week', () => { assert.strictEqual(sum.coursesFailed, 0); assert.ok(rows.length >= 14); });
t('130-min class: actual 130 kept, effective 95; teacher attendance stays 130', () => {
  const tr = r(E.T130); assert.strictEqual(tr.actualClassMinutes, 130); assert.strictEqual(tr.effectiveClassMinutes, 95); assert.strictEqual(tr.activeMinutes, 130); assert.strictEqual(tr.attendedPct, 100);
  assert.strictEqual(c.attClassMinutesLabel_(tr), 'Actual: 130 min · Calculation: 95 min (Max)');
});
t('students vs 95: 95->100%, 80->84.21%, 60->63.16%', () => {
  assert.strictEqual(r(E.RAJA).activeMinutes, 95); assert.strictEqual(r(E.RAJA).attendedPct, 100);
  assert.strictEqual(r(E.KUMAR).activeMinutes, 80, 'overlapping joins not double-counted'); assert.strictEqual(r(E.KUMAR).attendedPct, 84.21);
  assert.strictEqual(r(E.SURESH).activeMinutes, 60, 'minutes before the teacher joined not counted'); assert.strictEqual(r(E.SURESH).attendedPct, 63.16);
  assert.strictEqual(r(E.RAJA).apsId, 'APS1234'); assert.strictEqual(r(E.KUMAR).apsId, 'APS5678'); assert.strictEqual(r(E.UNK).apsId, 'APSXXX');
});
t('75-min class + 60 min = 60/75 = 80%', () => { const d = r(E.DEVI); assert.strictEqual(d.effectiveClassMinutes, 75); assert.strictEqual(d.attendedPct, 80); assert.strictEqual(c.attClassMinutesLabel_(d), 'Actual: 75 min · Calculation: 75 min'); });
t('89-min class (teacher rejoined) + 80 min = 80/89 = 89.89%', () => { const e = r(E.ELA); assert.strictEqual(e.actualClassMinutes, 89); assert.strictEqual(e.effectiveClassMinutes, 89); assert.strictEqual(e.attendedPct, 89.89); assert.strictEqual(r(E.T89).activeMinutes, 79, 'teacher active minutes exclude the 10-min gap'); });
t('90-min class + 90 min = 90/95 = 94.74%', () => { const f = r(E.FARI); assert.strictEqual(f.actualClassMinutes, 90); assert.strictEqual(f.effectiveClassMinutes, 95); assert.strictEqual(f.attendedPct, 94.74); });
t('multiple classes in a week: 75 + 130 + 85 -> 75 + 95 + 85 = 255 effective', () => {
  const mani = rows.filter(x => x.email === E.MANI);
  assert.strictEqual(mani.length, 3);
  assert.strictEqual(JSON.stringify(mani.map(x => x.effectiveClassMinutes).sort((a,b)=>a-b)), '[75,85,95]');
  assert.strictEqual(mani.reduce((n, x) => n + x.effectiveClassMinutes, 0), 255);
  assert.strictEqual(JSON.stringify(mani.map(x => x.actualClassMinutes).sort((a,b)=>a-b)), '[75,85,130]');
});
t('overall % weights by effective minutes', () => {
  const summary = c.readAttendanceSummaryMap_();
  const k = c.attSummaryKey_('800000000130', E.KUMAR); assert.strictEqual(summary[k].call, 95); // effective, not 130
});
t('re-sync (scheduled + Sync Now x2) is idempotent: no duplicates, same data', () => {
  const count = () => Object.values(env.wb.sheets).filter(s => /^AWK\d+ATT$/.test(s.name)).reduce((n, s) => n + s.data.slice(1).filter(x => x[0]).length, 0);
  const snap = () => JSON.stringify(c.getAttendanceRecordsForViewer(admin, {}).map(x => [x.courseId, x.date, x.email, x.role, x.attendedPct, x.score, x.actualClassMinutes, x.effectiveClassMinutes]));
  const n0 = count(), s0 = snap();
  c.syncAttendanceForAllCourses(); c.forceSyncAttendanceNow(admin); c.forceSyncAttendanceNow(admin);
  assert.strictEqual(count(), n0); assert.strictEqual(snap(), s0);
});
t('override preserved across Sync Now; audit carries APSIDs', () => {
  c.editAttendanceRecordStatus(admin, '800000000130', '2026-09-25', E.SURESH, 'STUDENT', 'EXCUSED', 'Doctor note provided by the parent today');
  c.forceSyncAttendanceNow(admin);
  rows = c.getAttendanceRecordsForViewer(admin, { weekOf: 'WK-2026-09-25' });
  const s = r(E.SURESH); assert.strictEqual(s.status, 'EXCUSED'); assert.strictEqual(s.score, 70); assert.strictEqual(s.attendedPct, 63.16, 'captured % still the Meet value');
  const log = c.getAttendanceAuditLog(admin, {}); assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].personApsId, 'APS9988'); assert.strictEqual(log[0].personEmail, E.SURESH.toLowerCase()); assert.strictEqual(log[0].reason, 'Doctor note provided by the parent today');
});
t('roles unchanged: student sees only own rows; teacher only own classes', () => {
  const st = c.getAttendanceRecordsForViewer(session(env, E.RAJA, 'student'), {}); assert.ok(st.length && st.every(x => x.email === E.RAJA && !x.editable));
  const te = c.getAttendanceRecordsForViewer(session(env, E.T75, 'teacher'), {}); assert.ok(te.length && te.every(x => x.role === 'STUDENT'));
  // r108: own class rows as before; rows of the SAME students in another / previous class are view-only and labelled
  const own = te.filter(x => x.courseId === '800000000075'), other = te.filter(x => x.courseId !== '800000000075');
  const mine = new Set(own.map(x => x.email));
  assert.ok(own.length && own.every(x => !x.previousClass));
  assert.ok(other.every(x => x.previousClass === true && x.editable === false && mine.has(x.email)), JSON.stringify(other.map(x => [x.courseId, x.email])));
  assert.throws(() => c.getAttendanceAuditLog(session(env, E.T75, 'teacher'), {}));
});
t('rows carry class teacher(s) for the Teacher filter', () => { assert.deepStrictEqual(JSON.parse(JSON.stringify(r(E.RAJA).classTeachers)), [{ name: 'Teacher A', email: E.T130, apsId: 'APS1001' }]); });
t('report email shows Actual/Calculation and APSID', () => {
  const e2 = boot('2026-09-28T11:00:00Z', { auditItems: audit, props: env.props }); e2.wb.sheets = env.wb.sheets; Object.values(e2.wb.sheets).forEach(s => s.wb = e2.wb);
  e2.ctx.sendWeeklyAttendanceReports();
  const m = e2.stats.mails.find(x => /NILAI 3 - EF/.test(x.subject)); assert.ok(m);
  assert.ok(m.htmlBody.includes('Actual: 130 min · Calculation: 95 min (Max)')); assert.ok(m.htmlBody.includes('APS1234')); assert.ok(m.htmlBody.includes('Teacher A'));
});
t('SUPERADMIN_EMAILS and VCFO_AMCHATS_BOD_EMAILS excluded too', () => {
  const e3 = boot('2026-09-28T09:30:00Z', { auditItems: audit, props: { SUPERADMIN_EMAILS: JSON.stringify(['Kumar_APS5678@avvaiyarpadasalai.org']), VCFO_AMCHATS_BOD_EMAILS: JSON.stringify([E.DEVI]) } });
  assert.ok(e3.ctx.attIsExcludedEmail_(E.KUMAR)); assert.ok(e3.ctx.attIsExcludedEmail_(E.DEVI)); assert.ok(!e3.ctx.attIsExcludedEmail_(E.RAJA));
});
// ===== User's example: NILAI 7 - CB, teacher 7:25 PM - 10:00 PM (155 min, 147 active after a short drop) =====
{
  const { ev } = require('./fixtures2');
  const T = 'teachercb_aps4001@avvaiyarpadasalai.org', S1 = 'arun_aps4101@avvaiyarpadasalai.org', S2 = 'bala_aps4102@avvaiyarpadasalai.org', S3 = 'chitra_aps4103@avvaiyarpadasalai.org';
  const cb = [{ id: '900000000007', name: 'NILAI 7 - CB | FRI 7:30 - 9:00 PM EST | AY26-27', teachers: [{ name: 'Teacher CB', email: T }],
    students: [{ name: 'Arun', email: S1 }, { name: 'Bala', email: S2 }, { name: 'Chitra', email: S3 }] }];
  const at = (hm) => new Date('2026-09-25T' + hm + ':00-04:00').toISOString();
  const au = [ev(T, 'cbx-cbxx-cbx', at('19:25'), at('21:00')), ev(T, 'cbx-cbxx-cbx', at('21:08'), at('22:00')), // 155-min window, 147 active
    ev(S1, 'cbx-cbxx-cbx', at('19:30'), at('22:00')), ev(S2, 'cbx-cbxx-cbx', at('19:30'), at('20:50')), ev(S3, 'cbx-cbxx-cbx', at('19:40'), at('20:40'))];
  const e4 = boot('2026-09-28T09:30:00Z', { auditItems: au }); const sh = e4.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h'); const row = new Array(18).fill(''); row[0] = cb[0].id; row[17] = JSON.stringify(cb[0]); sh.data[1] = row;
  e4.ctx.syncAttendanceForAllCourses();
  const tok = session(e4, 'admin@aps.org', 'admin');
  const rr = e4.ctx.getAttendanceRecordsForViewer(tok, { weekOf: 'WK-2026-09-25' });
  const g = em => rr.find(x => x.email === em);
  t('NILAI 7 - CB: teacher 7:25 PM - 10:00 PM -> Actual 155, Calculation 95 (Max); teacher credited 95/95 = 100%', () => {
    const tr = g(T); assert.strictEqual(tr.firstJoin, '7:25 PM'); assert.strictEqual(tr.lastLeave, '10:00 PM');
    assert.strictEqual(tr.actualClassMinutes, 155); assert.strictEqual(tr.effectiveClassMinutes, 95); assert.strictEqual(tr.callMinutes, 95);
    assert.strictEqual(tr.activeMinutes, 147); assert.strictEqual(e4.ctx.attCountedMinutes_(tr), 95); assert.strictEqual(tr.attendedPct, 100); assert.strictEqual(tr.score, 100);
    assert.strictEqual(e4.ctx.attClassMinutesLabel_(tr), 'Actual: 155 min · Calculation: 95 min (Max)');
  });
  t('NILAI 7 - CB students measured against 95: 150->100%, 80->84.21% (score 100), 60->63.16% (score 90)', () => {
    assert.strictEqual(g(S1).attendedPct, 100); assert.strictEqual(g(S1).callMinutes, 95); assert.strictEqual(e4.ctx.attCountedMinutes_(g(S1)), 95);
    assert.strictEqual(g(S2).attendedPct, 84.21); assert.strictEqual(g(S2).score, 100);
    assert.strictEqual(g(S3).attendedPct, 63.16); assert.strictEqual(g(S3).score, 90);
  });
  // A row captured BEFORE the rule (no Actual/Effective columns; Call Minutes = 155, % against 155): must show 95 immediately.
  const w = e4.wb.sheets['AWK03ATT'];
  const C = e4.ctx.ATTENDANCE_COL_;
  w.data.forEach((r, i) => { if (i === 0 || !r[0]) return; r[C.CALL_MINUTES] = '155'; r[C.ACTUAL_CLASS_MINUTES] = ''; r[C.EFFECTIVE_CLASS_MINUTES] = ''; r[C.CLASS_WINDOW_BASIS] = '';
    r[C.ATTENDED_PCT] = String(Math.round(Number(r[C.ACTIVE_MINUTES]) / 155 * 1000) / 10); });
  const lr = e4.ctx.getAttendanceRecordsForViewer(tok, { weekOf: 'WK-2026-09-25' });
  const lg = em => lr.find(x => x.email === em);
  t('old row (147 / 155) is displayed and scored as 95 / 95 (Max) before any re-sync', () => {
    const tr = lg(T); assert.strictEqual(tr.callMinutes, 95); assert.strictEqual(tr.effectiveClassMinutes, 95); assert.strictEqual(tr.actualClassMinutes, 155); assert.strictEqual(tr.attendedPct, 100);
    assert.strictEqual(lg(S3).attendedPct, 63.16); assert.strictEqual(lg(S3).score, 90); assert.strictEqual(lg(S2).attendedPct, 84.21);
  });
  t('next sync rewrites the old rows with the new columns (no duplicates)', () => {
    const n0 = w.data.slice(1).filter(x => x[0]).length;
    e4.ctx.forceSyncAttendanceNow(tok);
    assert.strictEqual(w.data.slice(1).filter(x => x[0]).length, n0);
    w.data.slice(1).filter(x => x[0]).forEach(x => { assert.strictEqual(x[C.CALL_MINUTES], '95'); assert.strictEqual(x[C.ACTUAL_CLASS_MINUTES], '155'); assert.strictEqual(x[C.EFFECTIVE_CLASS_MINUTES], '95'); });
  });
}
// ===== On-Call (TCS_/TTS_) teacher attendance =====
{
  const { ev } = require('./fixtures2');
  const D = 'avvaiyarpadasalai.org';
  const TP = 'tprimary_aps5001@' + D, TQ = 'tqprimary_aps5002@' + D, RAVI = 'tcs_ravi_aps8101@' + D, MEENA = 'TTS_meena_aps8201@' + D, BODTCS = 'tcs_bod_aps9000@' + D;
  const P1 = 'pstu_aps5101@' + D, Q1 = 'qstu_aps5201@' + D;
  const oc = [
    { id: '910000000001', name: 'NILAI 1 - P | FRI 7:30 - 9:00 PM EST | AY26-27', teachers: [{ name: 'Teacher P', email: TP }, { name: 'Ravi (On-Call)', email: RAVI }], students: [{ name: 'P Student', email: P1 }] },
    { id: '910000000002', name: 'NILAI 1 - Q | FRI 7:30 - 9:00 PM EST | AY26-27', teachers: [{ name: 'Teacher Q', email: TQ }, { name: 'Ravi (On-Call)', email: RAVI }], students: [{ name: 'Q Student', email: Q1 }] }
  ];
  const at = (hm) => new Date('2026-09-25T' + hm + ':00-04:00').toISOString();
  const au = [
    ev(TP, 'ppp-pppp-ppp', at('19:30'), at('21:00')), ev(P1, 'ppp-pppp-ppp', at('19:30'), at('21:00')),
    ev(Q1, 'qqq-qqqq-qqq', at('19:30'), at('20:30')),
    ev(RAVI, 'qqq-qqqq-qqq', at('19:25'), at('21:10')),                 // rostered in BOTH, substitutes in Q only
    ev(MEENA.toLowerCase(), 'ppp-pppp-ppp', at('19:40'), at('20:40')),   // not on any roster, joins P
    ev(BODTCS, 'ppp-pppp-ppp', at('20:00'), at('20:30'))                 // tcs_ account that is also in the BOD list
  ];
  const e5 = boot('2026-09-28T09:30:00Z', { auditItems: au, props: { VCFO_AMCHATS_BOD_EMAILS: JSON.stringify([BODTCS, 'bod@aps.org']) } });
  const sh = e5.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h'); oc.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); sh.data[i + 1] = row; });
  e5.ctx.syncAttendanceForAllCourses();
  const adm = session(e5, 'admin@aps.org', 'admin');
  const all = e5.ctx.getAttendanceRecordsForViewer(adm, { weekOf: 'WK-2026-09-25' });
  const f = (em, cid) => all.find(x => x.email.toLowerCase() === em.toLowerCase() && x.courseId === cid);
  t('on-call prefixes: TCS_ / TTS_ (case-insensitive)', () => { assert.ok(e5.ctx.attIsOnCallEmail_(RAVI)); assert.ok(e5.ctx.attIsOnCallEmail_(MEENA)); assert.ok(!e5.ctx.attIsOnCallEmail_(TP)); });
  t('a rostered on-call teacher joining class Q never defines class P (0 min in P)', () => {
    const pr = f(TP, '910000000001'); assert.strictEqual(pr.classWindowBasis, 'TEACHER'); assert.strictEqual(pr.actualClassMinutes, 90);
    assert.strictEqual(f(RAVI, '910000000001').activeMinutes, 0);
  });
  t('class Q (regular teacher absent): on-call Ravi defines the window -> Actual 105, Calculation 95 (Max)', () => {
    const q = f(Q1, '910000000002'); assert.strictEqual(q.classWindowBasis, 'ON_CALL_TEACHER'); assert.strictEqual(q.actualClassMinutes, 105); assert.strictEqual(q.effectiveClassMinutes, 95); assert.strictEqual(q.attendedPct, 63.16);
    assert.strictEqual(f(RAVI, '910000000002').activeMinutes, 105);
  });
  t('on-call teacher NOT on the roster who joined P is captured (ON_CALL_GUEST)', () => {
    const m = f(MEENA, '910000000001'); assert.ok(m); assert.strictEqual(m.role, 'TEACHER'); assert.strictEqual(m.captureSource, 'MEET_AUDIT_ON_CALL_GUEST'); assert.strictEqual(m.activeMinutes, 60);
    assert.strictEqual(m.personName, 'Tts Meena');
  });
  t('tcs_ account also in the BOD list is still captured; plain BOD still excluded', () => {
    assert.ok(f(BODTCS, '910000000001')); assert.ok(e5.ctx.attIsExcludedEmail_('bod@aps.org')); assert.ok(!e5.ctx.attIsExcludedEmail_(BODTCS));
  });
  t('getOnCallTeacherAttendance: joined-only by default, all rostered with includeNotJoined, summary per teacher', () => {
    const d = e5.ctx.getOnCallTeacherAttendance(adm, { weekOf: 'WK-2026-09-25' });
    assert.strictEqual(d.rows.length, 3); assert.ok(d.rows.every(r => r.activeMinutes > 0));
    const ravi = d.teachers.find(x => x.email === RAVI); assert.strictEqual(ravi.classesJoined, 1); assert.strictEqual(ravi.meetMinutes, 105); assert.strictEqual(ravi.countedMinutes, 95); assert.strictEqual(ravi.apsId, 'APS8101');
    assert.strictEqual(d.rows.find(r => r.email === MEENA.toLowerCase()).onRoster, false);
    const d2 = e5.ctx.getOnCallTeacherAttendance(adm, { weekOf: 'WK-2026-09-25', includeNotJoined: true }); assert.strictEqual(d2.rows.length, 4);
    const d3 = e5.ctx.getOnCallTeacherAttendance(adm, {}); assert.ok(d3.rows.length >= 3, 'all weeks');
    assert.strictEqual(JSON.stringify(d3.prefixes), JSON.stringify(['tcs_', 'tts_']));
  });
  t('On-Call report access: Admin/SuperAdmin/HM/BOD yes; Teacher/Student no', () => {
    ['admin', 'superadmin', 'headmaster', 'vcfo_amchsts_bod'].forEach(r => assert.ok(e5.ctx.getOnCallTeacherAttendance(session(e5, 'x_' + r + '@aps.org', r), {})));
    ['teacher', 'student'].forEach(r => assert.throws(() => e5.ctx.getOnCallTeacherAttendance(session(e5, 'y_' + r + '@aps.org', r), {}), /Only Admin/));
  });
  t('re-sync twice: no duplicate on-call guest rows', () => {
    const n = () => e5.wb.sheets['AWK03ATT'].data.slice(1).filter(x => x[0]).length; const n0 = n();
    e5.ctx.forceSyncAttendanceNow(adm); e5.ctx.forceSyncAttendanceNow(adm); assert.strictEqual(n(), n0);
  });
}
// ===== Mandatory reason (5-25 words) + Bulk override =====
{
  const e6 = boot('2026-09-28T09:30:00Z', { auditItems: audit }); seed(e6); e6.ctx.syncAttendanceForAllCourses();
  const adm = session(e6, 'admin@aps.org', 'admin'), hm = session(e6, 'hm2@aps.org', 'headmaster'), tch = session(e6, E.T130, 'teacher');
  const W = 'WK-2026-09-25';
  t('reason: missing / 4 words / 26 words rejected; 5 and 25 words accepted (single override, incl. clear)', () => {
    ['', 'too short a reason', Array(26).fill('word').join(' ')].forEach(rs => assert.throws(() => e6.ctx.editAttendanceRecordStatus(adm, '800000000130', '2026-09-25', E.RAJA, 'STUDENT', 'ABSENT', rs), /5 to 25 words/));
    assert.strictEqual(e6.ctx.editAttendanceRecordStatus(tch, '800000000130', '2026-09-25', E.RAJA, 'STUDENT', 'ABSENT', 'one two three four five').status, 'ABSENT');
    assert.throws(() => e6.ctx.editAttendanceRecordStatus(tch, '800000000130', '2026-09-25', E.RAJA, 'STUDENT', 'AUTO', 'undo'), /5 to 25 words/);
    assert.strictEqual(e6.ctx.editAttendanceRecordStatus(tch, '800000000130', '2026-09-25', E.RAJA, 'STUDENT', 'AUTO', Array(25).fill('ok').join(' ')).cleared, true);
    assert.strictEqual(e6.ctx.attValidateOverrideReason_('  spaced   out    reason   with    words  '), 'spaced out reason with words');
  });
  t('bulk: Admin/Super Admin only (HM, Teacher refused)', () => {
    const p = { weekOf: W, roles: ['STUDENT'], newStatus: 'EXCUSED', reason: 'Class cancelled due to the school holiday', dryRun: true };
    assert.throws(() => e6.ctx.bulkOverrideAttendance(hm, p), /Admin or Super Admin/); assert.throws(() => e6.ctx.bulkOverrideAttendance(tch, p), /Admin or Super Admin/);
    assert.ok(e6.ctx.bulkOverrideAttendance(session(e6, 'sa@aps.org', 'superadmin'), p));
  });
  const count = () => e6.wb.sheets['AWK03ATT'].data.slice(1).filter(x => x[0]).length;
  const n0 = count();
  const allWeek = () => e6.ctx.getAttendanceRecordsForViewer(adm, { weekOf: W });
  t('bulk preview (dry run) counts without writing', () => {
    const before = JSON.stringify(allWeek());
    const r = e6.ctx.bulkOverrideAttendance(adm, { weekOf: W, roles: ['STUDENT'], newStatus: 'EXCUSED', dryRun: true });
    const students = allWeek().filter(x => x.role === 'STUDENT').length;
    assert.strictEqual(r.changed, students); assert.strictEqual(r.teachers, 0); assert.strictEqual(r.classes, 5);
    assert.strictEqual(JSON.stringify(allWeek()), before); assert.strictEqual(e6.ctx.getAttendanceAuditLog(adm, {}).length, 2, 'only the 2 single overrides so far');
  });
  t('bulk apply: one class, teachers only -> PRESENT; reason required', () => {
    assert.throws(() => e6.ctx.bulkOverrideAttendance(adm, { weekOf: W, courseId: '800000000075', roles: ['TEACHER'], newStatus: 'PRESENT', reason: 'short' }), /5 to 25 words/);
    const r = e6.ctx.bulkOverrideAttendance(adm, { weekOf: W, courseId: '800000000075', roles: ['TEACHER'], newStatus: 'PRESENT', reason: 'Teacher attendance confirmed by the principal office' });
    assert.strictEqual(r.changed, 1); assert.strictEqual(r.teachers, 1);
    const tr = allWeek().find(x => x.email === E.T75); assert.strictEqual(tr.status, 'PRESENT'); assert.strictEqual(tr.overrideBy, 'admin@aps.org'); assert.strictEqual(tr.isOverridden, true);
  });
  t('bulk apply: all classes, students currently PRESENT -> EXCUSED (70); others untouched; audit row per record', () => {
    const before = allWeek();
    const presentStudents = before.filter(x => x.role === 'STUDENT' && x.status === 'PRESENT');
    const r = e6.ctx.bulkOverrideAttendance(adm, { weekOf: W, roles: ['STUDENT'], onlyStatus: 'PRESENT', newStatus: 'EXCUSED', reason: 'Class cancelled due to the school holiday' });
    assert.strictEqual(r.changed, presentStudents.length);
    const after = allWeek();
    presentStudents.forEach(p => { const a = after.find(x => x.email === p.email && x.courseId === p.courseId); assert.strictEqual(a.status, 'EXCUSED'); assert.strictEqual(a.score, 70); assert.strictEqual(a.attendedPct, p.attendedPct, 'captured % kept'); });
    before.filter(x => !(x.role === 'STUDENT' && x.status === 'PRESENT')).forEach(p => { const a = after.find(x => x.email === p.email && x.courseId === p.courseId && x.role === p.role); assert.strictEqual(a.status, p.status); });
    const log = e6.ctx.getAttendanceAuditLog(adm, {}); const bulk = log.filter(l => l.action === 'BULK_OVERRIDE');
    assert.strictEqual(bulk.length, presentStudents.length + 1); assert.ok(bulk.every(l => l.editedByEmail === 'admin@aps.org' && /school holiday|principal office/.test(l.reason)));
    assert.strictEqual(count(), n0, 'no rows added');
  });
  t('bulk re-apply is a no-op; overall % updated; sync keeps bulk overrides', () => {
    const r = e6.ctx.bulkOverrideAttendance(adm, { weekOf: W, roles: ['STUDENT'], onlyStatus: 'EXCUSED', newStatus: 'EXCUSED', reason: 'Class cancelled due to the school holiday', dryRun: true });
    assert.strictEqual(r.changed, 0);
    const sm = e6.ctx.readAttendanceSummaryMap_()[e6.ctx.attSummaryKey_('800000000089', E.ELA)]; assert.strictEqual(sm.overallPct, 70);
    e6.ctx.forceSyncAttendanceNow(adm);
    assert.strictEqual(allWeek().find(x => x.email === E.ELA).status, 'EXCUSED'); assert.strictEqual(count(), n0);
  });
  t('bulk clear overrides restores captured statuses', () => {
    const r = e6.ctx.bulkOverrideAttendance(adm, { weekOf: W, roles: ['STUDENT', 'TEACHER'], newStatus: 'AUTO', reason: 'Holiday was rescheduled so restoring captured data' });
    assert.ok(r.changed >= 2); assert.ok(allWeek().every(x => !x.isOverridden));
    assert.ok(e6.ctx.getAttendanceAuditLog(adm, {}).some(l => l.action === 'BULK_CLEAR_OVERRIDE'));
  });
}
// ===== On-Call attendance with the PRODUCTION hidden-prefix config (tcs_ / tts_ hidden from rosters) =====
{
  const { ev } = require('./fixtures2');
  const D = 'avvaiyarpadasalai.org';
  const TP = 'tprimary_aps5001@' + D, RAVI = 'tcs_ravi_aps8101@' + D, MEENA = 'tts_meena_aps8201@' + D, ASV = 'tcs_asvika_aps8112@' + D, HID = 'aps_support@' + D;
  const P1 = 'pstu_aps5101@' + D;
  const oc = [{ id: '920000000001', name: 'NILAI 2 - P | FRI 7:30 - 9:00 PM EST | AY26-27', teachers: [{ name: 'Teacher P', email: TP }], students: [{ name: 'P Student', email: P1 }] }];
  const at = (hm) => new Date('2026-09-25T' + hm + ':00-04:00').toISOString();
  const au = [ev(TP, 'ppp-pppp-ppp', at('19:30'), at('21:00')), ev(P1, 'ppp-pppp-ppp', at('19:30'), at('21:00')),
    ev(RAVI, 'ppp-pppp-ppp', at('19:35'), at('20:35')), ev(MEENA, 'ppp-pppp-ppp', at('19:40'), at('20:10')),
    ev(ASV, 'ppp-pppp-ppp', at('19:40'), at('20:10')), ev(HID, 'ppp-pppp-ppp', at('19:40'), at('20:10'))];
  const e7 = boot('2026-09-28T09:30:00Z', { auditItems: au, props: { HIDDEN_TEACHER_EMAIL_PREFIXES: JSON.stringify(['aps_', 'tcs_', 'tts_']), ATTENDANCE_EXCLUDED_EMAILS: JSON.stringify([ASV]) } });
  const sh = e7.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h'); oc.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); sh.data[i + 1] = row; });
  e7.ctx.syncAttendanceForAllCourses();
  const adm = session(e7, 'admin@aps.org', 'admin');
  t('prod config (tcs_/tts_ in HIDDEN_TEACHER_EMAIL_PREFIXES): On-Call Teacher Attendance is captured, not blank', () => {
    const d = e7.ctx.getOnCallTeacherAttendance(adm, { weekOf: 'WK-2026-09-25' });
    const em = d.rows.map(r => r.email).sort();
    assert.strictEqual(JSON.stringify(em), JSON.stringify([MEENA, RAVI].sort()));
    assert.strictEqual(d.rows.find(r => r.email === RAVI).activeMinutes, 60);
    assert.ok(!e7.ctx.attIsExcludedEmail_(RAVI) && !e7.ctx.attIsExcludedEmail_(MEENA));
  });
  t('explicit ATTENDANCE_EXCLUDED_EMAILS still wins for a tcs_ account; other hidden prefixes (aps_) still excluded', () => {
    assert.ok(e7.ctx.attIsExcludedEmail_(ASV)); assert.ok(e7.ctx.attIsExcludedEmail_(HID));
    const all = e7.ctx.getAttendanceRecordsForViewer(adm, { weekOf: 'WK-2026-09-25' });
    assert.ok(!all.some(r => r.email === ASV || r.email === HID));
  });
  t('Teacher Availability report still leaves hidden-prefix (tcs_/tts_) accounts out', () => {
    assert.ok(e7.ctx.ctaExcluded_(RAVI, e7.ctx.ctaExcludeRule_(), {}));
    assert.ok(!e7.ctx.ctaExcluded_(TP, e7.ctx.ctaExcludeRule_(), {}));
  });
}
// ===== On-call teachers kept off the class card (course.onCallTeacherCandidates) are still on the Attendance roster =====
{
  const { ev } = require('./fixtures2');
  const D = 'avvaiyarpadasalai.org';
  const TP = 'tprimary_aps5001@' + D, RAVI = 'TCS_ravi_aps8101@' + D, MEENA = 'TTS_meena_aps8201@' + D, P1 = 'pstu_aps5101@' + D;
  const oc = [{ id: '930000000001', name: 'NILAI 3 - P | FRI 7:30 - 9:00 PM EST | AY26-27', teachers: [{ name: 'Teacher P', email: TP }], students: [{ name: 'P Student', email: P1 }],
    onCallTeacherCandidates: [{ name: 'Ravi', email: RAVI }, { name: 'Meena', email: MEENA }] }];
  const at = (hm) => new Date('2026-09-25T' + hm + ':00-04:00').toISOString();
  const au = [ev(TP, 'ppp-pppp-ppp', at('19:30'), at('21:00')), ev(P1, 'ppp-pppp-ppp', at('19:30'), at('21:00')), ev(MEENA.toLowerCase(), 'ppp-pppp-ppp', at('19:40'), at('20:40'))];
  const e8 = boot('2026-09-28T09:30:00Z', { auditItems: au, props: { HIDDEN_TEACHER_EMAIL_PREFIXES: JSON.stringify(['aps_', 'tcs_']) } });
  const sh = e8.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h'); oc.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); sh.data[i + 1] = row; });
  e8.ctx.syncAttendanceForAllCourses();
  const adm = session(e8, 'admin@aps.org', 'admin');
  t('On-Call: rostered TCS_ / TTS_ teachers (hidden from the card) are captured; upper-case prefixes match', () => {
    const d = e8.ctx.getOnCallTeacherAttendance(adm, { weekOf: 'WK-2026-09-25', includeNotJoined: true });
    const em = d.rows.map(r => r.email).sort();
    assert.strictEqual(JSON.stringify(em), JSON.stringify(['tcs_ravi_aps8101@' + D, 'tts_meena_aps8201@' + D]), JSON.stringify(em));
    assert.strictEqual(d.rows.find(r => /meena/.test(r.email)).activeMinutes, 60);
    assert.strictEqual(d.rows.find(r => /ravi/.test(r.email)).activeMinutes, 0, 'rostered, did not join -> listed with includeNotJoined');
    assert.ok(e8.ctx.isOnCallTeacherEmail_(MEENA) && e8.ctx.isOnCallTeacherEmail_(RAVI), 'TTS_ and TCS_ both on-call (card)');
  });
}
console.log('\nALL ' + passed + ' ACCEPTANCE TESTS PASSED');

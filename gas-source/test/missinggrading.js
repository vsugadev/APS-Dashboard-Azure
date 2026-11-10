// r116 — Homework Pending Grading > 3 Weeks (Grading Help Team weekly report) (node test/missinggrading.js)
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { makeContext, Sheet } = require('./gasmock');
const tests = []; const t = (name, fn) => tests.push([name, fn]);
function fixedDate(iso) { let NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } static set(i) { NOW = new Date(i).getTime(); } } return D; }
Sheet.prototype.getMaxRows = function () { return 5000; };
const D = fixedDate('2026-11-10T13:35:00Z'); // Tue Nov 10 2026, 8:35 AM EST
const env = makeContext({ Date: D, props: { APS_ENVIRONMENT: 'LIVE' } });
env.ctx.ScriptApp.WeekDay = Object.assign(env.ctx.ScriptApp.WeekDay || {}, { TUESDAY: 'TUESDAY' });
let classroomTouched = 0;
env.ctx.Classroom = new Proxy({}, { get() { classroomTouched++; throw new Error('Classroom API must not be used'); } });
vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), env.ctx, { filename: 'Code.gs' });
const G = env.ctx, J = x => JSON.parse(JSON.stringify(x)), DOM = '@avvaiyarpadasalai.org';
const day = n => { const d = new Date(Date.UTC(2026, 10, 10) - n * 86400000); return d.toISOString().slice(0, 10) + ' 18:00:00'; }; // turned in n days before Tue 11/10
const C = (id, name, teacher) => ({ id, name: name + ' | AY26-27', courseState: 'ACTIVE', link: 'https://classroom.google.com/c/' + id, teachers: [teacher], students: [], classSupport: [{ email: teacher.email, roles: ['PRIMARY_TEACHER'], sources: ['DESCRIPTION'], member: true }] });
const TA = { name: 'Anbu Teacher', email: 'anbu_aps801' + DOM }, TB = { name: 'Bala Teacher', email: 'bala_aps802' + DOM };
const COURSES = [C('C1', 'NILAI 3 - EE | FRI 6:30 - 8:00 PM EST', TA), C('C2', 'NILAI 1 - EA | SAT 10:00 - 11:30 AM EST', TB), C('C9', 'NILAI 99 - TEST | FRI 6:30 - 8:00 PM EST', TA), C('C3', 'NILAI 4 - EB | SUN 7:30 - 9:00 PM EST', TB)];
const cs = env.wb.insertSheet('Courses'); cs.data[0] = new Array(18).fill('h');
COURSES.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); cs.data[i + 1] = row; });
const STU = (n, id, c, s) => ({ c, u: 'U' + id, e: n + '_aps' + id + DOM, n: 'Student ' + n, a: 'APS' + id, s: s || 'ACTIVE' });
const st = [STU('arun', 3001, 'C1'), STU('bala', 3002, 'C1'), STU('chitra', 3003, 'C1'), STU('devi', 3004, 'C1'), STU('ezhil', 3005, 'C1'), STU('gone', 3006, 'C1', 'REMOVED'),
  STU('hari', 3007, 'C2'), STU('indu', 3008, 'C2'), STU('test', 3009, 'C9'), STU('kavi', 3010, 'C3')];
let DS = { classrooms: ['C1', 'C2', 'C9', 'C3'].map(id => ({ id, name: COURSES.find(c => c.id === id).name, status: 'ACTIVE' })), students: st };
G.rosterDataset_ = () => DS;
const W = (id, t, lk) => ({ id, t, type: 'ASSIGNMENT', max: '100', ad: '2026-09-20 12:00:00', due: '', lsn: '', lk: lk === undefined ? 'https://classroom.google.com/c/X/a/' + id + '/details' : lk });
const S = (w, s, state, n, extra) => Object.assign({ w, u: s.u, e: s.e, st: state, ti: n === null ? '' : day(n), g: '', dg: '' }, extra || {});
let GR;
const reset = () => {
  GR = {
    C1: { w: [W('h1', 'HW_LSN_3'), W('q1', 'QUZ_LSN_3'), W('a1', 'ATT_LSN_3'), W('p1', 'TRMST01PRO01 recitation'), W('m1', 'MODEL_EXAM_1'), W('x1', 'Welcome notes')],
      s: [S('h1', st[0], 'TURNED_IN', 30), S('h1', st[1], 'TURNED_IN', 21), S('h1', st[2], 'TURNED_IN', 20), S('h1', st[3], 'CREATED', null), S('h1', st[4], 'RETURNED', 40, { g: '90' }),
        S('h1', st[5], 'TURNED_IN', 35), // removed from the class → not listed
        S('q1', st[0], 'TURNED_IN', 25, { dg: '8' }), S('q1', st[1], 'RECLAIMED_BY_STUDENT', 30), S('q1', st[2], 'TURNED_IN', 23, { g: '10' }),
        S('a1', st[0], 'TURNED_IN', 30), S('p1', st[2], 'TURNED_IN', 22), S('m1', st[0], 'TURNED_IN', 30), S('x1', st[0], 'TURNED_IN', 30)] },
    C2: { w: [W('h2', 'HW_LSN_2', '')], s: [S('h2', st[6], 'TURNED_IN', 45), S('h2', st[7], 'TURNED_IN', 45), S('h2', st[7], 'TURNED_IN', 45)] }, // duplicate row → one record
    C9: { w: [W('h9', 'HW_LSN_1')], s: [S('h9', st[8], 'TURNED_IN', 40)] }, // test class → never listed
    C3: { w: [W('h3', 'HW_LSN_1'), W('h4', 'HW_LSN_2')], s: [S('h3', st[9], 'TURNED_IN', 28), S('h4', st[9], 'TURNED_IN', 28)] }
  };
};
reset();
G.gradesForCourses_ = ids => { const o = {}; ids.forEach(id => { o[id] = GR[id] || { w: [], s: [] }; }); return o; };
let SYNC = { lastSyncAt: D.now() - 15 * 3600000, result: 'COMPLETED', lastSync: '11/09/2026 05:00 PM', grades: {}, errors: [] };
G.gradesLastSync_ = () => SYNC;
let EXCL = { exAssign: { 'C3|h4': true }, exStudent: {}, type: {}, reviewed: {}, notes: {}, rows: [] }; // HW_LSN_2 of C3 excluded in Assignment Monitoring
G.amOverrides_ = () => EXCL;
const mails = []; let mailFail = false;
G.apsGmailSend_ = (p, m) => { if (mailFail) return { ok: false, error: 'HTTP 500 Bearer ya29.secret' }; mails.push({ p, m: Object.assign(J(Object.assign({}, m, { attachments: undefined })), { att: (m.attachments || []).map(a => ({ name: a.getName ? a.getName() : a.name, text: a.getDataAsString ? a.getDataAsString() : '' })) }) }); return { ok: true }; };
const tok = (email, role) => { const k = 'tok_' + email; env.cache['aps_sess_' + k] = JSON.stringify({ email, role }); return k; };
const ADMIN = tok('info' + DOM, 'admin'), TEACH = tok(TA.email, 'teacher');
const props = G.PropertiesService.getScriptProperties();
const rows = name => { const s = env.wb.sheets[name]; if (!s) return []; const h = s.data[0]; return s.data.slice(1).filter(r => r && r.some(Boolean)).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const collect = () => J(G.mhgCollect_(G.mhgConfig_(), new D()));
const keyOf = r => r.className.split(' |')[0] + ' ' + r.title + ' ' + r.name;

t('rules: turned in > 21 days and not returned (30 ✓, exactly 21 ✗, 20 ✗, never submitted ✗, returned ✗, reclaimed ✗, removed student ✗, ATT / exam / other ✗, test class ✗, AM-excluded ✗)', () => {
  const s = collect(), k = s.records.map(keyOf);
  assert.deepStrictEqual(k.sort(), ['NILAI 1 - EA HW_LSN_2 Student hari', 'NILAI 1 - EA HW_LSN_2 Student indu', 'NILAI 3 - EE HW_LSN_3 Student arun', 'NILAI 3 - EE QUZ_LSN_3 Student arun', 'NILAI 3 - EE QUZ_LSN_3 Student chitra',
    'NILAI 3 - EE TRMST01PRO01 recitation Student chitra', 'NILAI 4 - EB HW_LSN_1 Student kavi'].sort(), JSON.stringify(k));
  assert.strictEqual(s.classes, 3); assert.strictEqual(s.assignments, 5);
});
t('duplicate API rows → one record; pending kinds: not graded / draft (Return only) / grade entered; days from the latest turn-in (EST)', () => {
  const s = collect();
  assert.strictEqual(s.records.filter(r => r.name === 'Student indu').length, 1);
  const q = s.records.filter(r => r.title === 'QUZ_LSN_3');
  assert.strictEqual(q.find(r => r.name === 'Student arun').kind, 'DRAFT_NOT_RETURNED');
  assert.strictEqual(q.find(r => r.name === 'Student chitra').kind, 'GRADED_NOT_RETURNED');
  assert.strictEqual(s.records.find(r => r.title === 'HW_LSN_3').kind, 'NOT_GRADED');
  assert.strictEqual(s.records.find(r => r.title === 'HW_LSN_3').days, 30);
  assert.deepStrictEqual(s.records.map(r => r.days), s.records.map(r => r.days).slice().sort((a, b) => b - a), 'oldest first');
});
t('scope: homework only setting drops quizzes and projects; at least one type required; recipients must be APS addresses', () => {
  G.saveMissingGradingConfig(ADMIN, { categories: ['HW'] });
  assert.ok(collect().records.every(r => r.code === 'HW'));
  G.saveMissingGradingConfig(ADMIN, J(G.mhgDefaults_()));
  assert.throws(() => G.saveMissingGradingConfig(ADMIN, { categories: [] }), /at least one/);
  assert.throws(() => G.saveMissingGradingConfig(ADMIN, { to: 'help@gmail.com' }), /avvaiyarpadasalai/);
  assert.throws(() => G.saveMissingGradingConfig(ADMIN, { days: 3 }), /7 to 120/);
  assert.throws(() => G.saveMissingGradingConfig(TEACH, {}), /permission/);
});
t('one consolidated email: donotreply@ (TICKETS) To grading@ CC admin@, subject with the date, summary, grouped by class with Open Google Classroom + Open assignment links', () => {
  const r = J(G.sendMissingGradingNow(ADMIN, {}));
  assert.strictEqual(r.email, 'SENT'); assert.strictEqual(mails.length, 1);
  const m = mails[0];
  assert.strictEqual(m.p, 'TICKETS'); assert.deepStrictEqual(m.m.to, ['grading@avvaiyarpadasalai.org']); assert.deepStrictEqual(m.m.cc, ['admin@avvaiyarpadasalai.org']);
  assert.strictEqual(m.m.subject, 'APS Google Classroom – Homework Pending Grading > 3 Weeks – 11/10/2026');
  const h = m.m.html;
  ['Classes affected', 'Assignments affected', 'Student submissions pending', 'Open Google Classroom', 'Open assignment', 'Draft grade — needs Return', 'Grade entered — not returned', 'Teacher: Anbu Teacher', 'New on the list this week']
    .forEach(x => assert.ok(h.includes(x), x));
  assert.ok(h.includes('href="https://classroom.google.com/c/C1"') && h.includes('href="https://classroom.google.com/c/X/a/h1/details"'));
  assert.ok(h.indexOf('NILAI 1 - EA') < h.indexOf('NILAI 3 - EE'), 'class with the oldest work first');
  assert.ok(!/stu.*grade.*file|drive\.google/i.test(h), 'no student files');
  assert.ok(!m.m.att.length, 'no attachment for a short list');
});
t('re-run the same day: not sent twice (unless "send again"); next week: new / cleared counts and "weeks on the list"', () => {
  assert.strictEqual(J(G.sendMissingGradingNow(ADMIN, {})).email, 'ALREADY_SENT_TODAY'); assert.strictEqual(mails.length, 1);
  assert.strictEqual(J(G.sendMissingGradingNow(ADMIN, { resend: true })).email, 'SENT'); assert.strictEqual(mails.length, 2);
  // one week later: arun's HW was returned, a new one appears (bala 21 → 28 days)
  D.set('2026-11-17T13:35:00Z'); SYNC = Object.assign({}, SYNC, { lastSyncAt: D.now() - 15 * 3600000 });
  GR.C1.s.find(x => x.w === 'h1' && x.u === 'U3001').st = 'RETURNED';
  const r = J(G.sendMissingGradingNow(ADMIN, {}));
  assert.strictEqual(r.cleared, 1, 'arun HW cleared'); assert.strictEqual(r.isNew, 2, 'bala (now 28 days) + chitra (now 27 days)');
  const h = mails[mails.length - 1].m.html;
  assert.ok(/on this list for 2 weeks/.test(h));
  const log = rows('MISSING_GRADING_LOG'); assert.ok(log.some(x => x.Status === 'CLEARED' && /h1\|U3001/.test(x.Record_Key)));
  D.set('2026-11-10T13:35:00Z'); SYNC = Object.assign({}, SYNC, { lastSyncAt: D.now() - 15 * 3600000 }); reset();
});
t('nothing pending → no email, run logged NO_MISSING_HOMEWORK_GRADING_FOUND', () => {
  const keep = GR; GR = {}; const n = mails.length;
  const r = J(G.mhgRun_(new D(), 'manual', 'test', { force: true, resend: true }));
  assert.strictEqual(r.found, 0); assert.strictEqual(r.email, 'NONE'); assert.strictEqual(mails.length, n);
  assert.ok(rows('MISSING_GRADING_RUNS').some(x => x.Result === 'NO_MISSING_HOMEWORK_GRADING_FOUND'));
  GR = keep;
});
t('a class that could not be scanned / stale sync → WARNING in the email (never presented as complete); the rest still reported', () => {
  SYNC = Object.assign({}, SYNC, { lastSyncAt: D.now() - 40 * 3600000, errors: [{ classroom: 'NILAI 5 - EA | FRI', operation: 'List Submissions', error: 'Permission denied' }], grades: { classroomsDeferred: 2 } });
  const r = J(G.sendMissingGradingNow(ADMIN, { resend: true }));
  assert.strictEqual(r.email, 'SENT'); assert.strictEqual(r.warnings.length, 3);
  const h = mails[mails.length - 1].m.html;
  assert.ok(h.includes('WARNING:') && h.includes('Some Google Classroom classes could not be scanned') && h.includes('NILAI 5 - EA') && h.includes('40 hours ago') && h.includes('2 classroom(s) did not fit'));
  SYNC = { lastSyncAt: D.now() - 15 * 3600000, result: 'COMPLETED', lastSync: '11/09/2026 05:00 PM', grades: {}, errors: [] };
});
t('long list → the oldest N rows in the email + the full list attached as CSV (formula-safe)', () => {
  G.saveMissingGradingConfig(ADMIN, Object.assign(J(G.mhgDefaults_()), { maxRowsInEmail: 50 }));
  for (let i = 0; i < 60; i++) { const s = STU('extra' + i, 5000 + i, 'C2'); DS.students.push(s); GR.C2.s.push(S('h2', s, 'TURNED_IN', 30 + (i % 5))); }
  DS.students.push(STU('=cmd', 5999, 'C2')); GR.C2.s.push(S('h2', DS.students[DS.students.length - 1], 'TURNED_IN', 30));
  G.sendMissingGradingNow(ADMIN, { resend: true });
  const m = mails[mails.length - 1].m;
  assert.strictEqual(m.att.length, 1); assert.ok(/homework_pending_grading_2026-11-10\.csv/.test(m.att[0].name));
  assert.ok(/Showing the oldest 50 of 68 submissions/.test(m.html), m.html.match(/Showing[^<]*/));
  const p = J(G.previewMissingGrading(ADMIN)); assert.strictEqual(p.found, 68); assert.ok(p.csv.includes('"\'=cmd"') || p.csv.includes("Student =cmd"), 'student name text kept as text');
  assert.ok(!/^=/m.test(p.csv.split('\r\n').map(l => l.split('","')[4] || '').join('\n')));
  G.saveMissingGradingConfig(ADMIN, J(G.mhgDefaults_())); reset(); DS.students = DS.students.slice(0, 10);
});
t('email failure → logged FAILED with the error masked; switch OFF → the weekly trigger sends nothing', () => {
  mailFail = true; const r = J(G.sendMissingGradingNow(ADMIN, { resend: true })); mailFail = false;
  assert.strictEqual(r.email, 'FAILED');
  const last = rows('MISSING_GRADING_RUNS').pop(); assert.strictEqual(last.Email_Status, 'FAILED'); assert.ok(!/ya29\.secret/.test(last.Error));
  G.saveMissingGradingConfig(ADMIN, Object.assign(J(G.mhgDefaults_()), { enabled: false }));
  const guard = G.apsRequireTriggerCall_; G.apsRequireTriggerCall_ = () => {};
  const n = mails.length; assert.strictEqual(J(G.apsMissingGradingWeekly({ triggerUid: 'x' })).skipped, 'OFF'); assert.strictEqual(mails.length, n);
  G.apsRequireTriggerCall_ = guard;
  G.saveMissingGradingConfig(ADMIN, J(G.mhgDefaults_()));
});
t('admin card data + weekly-jobs scheduler (Tuesday 8 AM job) installed once; teacher refused', () => {
  env.stats.triggers.length = 0;
  const d = J(G.getMissingGradingAdmin(ADMIN));
  assert.ok(d.runs.length >= 3 && d.config.to[0] === 'grading@avvaiyarpadasalai.org' && d.categories.length === 3);
  G.getMissingGradingAdmin(ADMIN);
  const tr = env.stats.triggers.filter(x => x.fn === 'apsWeeklyJobs'); // r117: Tuesday job of the one hourly scheduler
  assert.strictEqual(tr.length, 1); assert.strictEqual(tr[0].everyHours, 1); assert.deepStrictEqual([G.wjJob_('MISSING_GRADING_REPORT').dow, G.wjJob_('MISSING_GRADING_REPORT').hour], [2, 8]);
  assert.throws(() => G.getMissingGradingAdmin(TEACH), /permission/);
  assert.throws(() => G.previewMissingGrading(TEACH), /permission/);
});
t('the Grading Help Team account (grading@) is support staff: hidden, never a class teacher, never in attendance', () => {
  const g = 'grading@avvaiyarpadasalai.org';
  assert.strictEqual(G.isRosterHiddenStaffEmail_(g), true);
  assert.strictEqual(G.attIsExcludedEmail_(g), true);
  assert.strictEqual(G.isHiddenTeacherName_('APS Grading Team', g), true);
  const c = { teachers: [{ name: 'APS Grading Team', email: g }, { name: 'Real Teacher', email: 'real_aps1' + DOM }] };
  assert.strictEqual(G.primaryTeacherOf_(c).email, 'real_aps1' + DOM, 'never the fallback class teacher');
  assert.strictEqual(G.isRosterHiddenStaffEmail_('real_aps1' + DOM), false);
});
t('never touches Google Classroom (no API call; read-only)', () => { assert.strictEqual(classroomTouched, 0); });

module.exports = { G, env, tok, mails, D, J, ADMIN };
if (require.main === module) {
let fails = 0;
for (const [n, fn] of tests) { try { fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 6).join('\n   ')); } }
console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);
}

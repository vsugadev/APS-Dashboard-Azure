// r114 / r115 — Weekly Teacher Appreciation: scoring, storage, access, dashboard endpoints (+ r115 emails) (node test/teacherappreciation.js)
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { makeContext, Sheet } = require('./gasmock');
const tests = []; const t = (name, fn) => tests.push([name, fn]);
function fixedDate(iso) { let NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } static set(i) { NOW = new Date(i).getTime(); } } return D; }
Sheet.prototype.getMaxRows = function () { return 5000; };
const D = fixedDate('2026-11-12T00:05:00Z'); // Wed Nov 11 2026, 7:05 PM EST
const env = makeContext({ Date: D, props: { APS_ENVIRONMENT: 'LIVE' } });
env.ctx.ScriptApp.WeekDay = Object.assign(env.ctx.ScriptApp.WeekDay || {}, { WEDNESDAY: 'WEDNESDAY' });
let classroomTouched = 0;
env.ctx.Classroom = new Proxy({}, { get() { classroomTouched++; throw new Error('Classroom API must not be used'); } });
vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), env.ctx, { filename: 'Code.gs' });
const G = env.ctx, DOM = '@avvaiyarpadasalai.org', J = x => JSON.parse(JSON.stringify(x));
const P = (n, id) => ({ name: n, email: n.toLowerCase().replace(/\s+/g, '') + '_aps' + id + DOM });
const tA = P('Anbu Teacher', 801), tB = P('Bala Teacher', 802), tC = P('Chitra Teacher', 803), tD = P('Devi Teacher', 804), tE = P('Ezhil Sub', 805), tF = P('Fathima Teacher', 806), tG = P('Gowri Teacher', 807);
const S = (k, n) => Array.from({ length: n }, (_, i) => P('Stu' + k + i, 4000 + k * 10 + i));
const STU = { F1: S(1, 5), S1: S(2, 6), F2: S(3, 4), U1: S(4, 4), F3: S(5, 3), M1: S(6, 3) };
const C = (id, name, teacher, students) => ({ id, name: name + ' | AY26-27', courseState: 'ACTIVE', teachers: [teacher], students, classSupport: [{ email: teacher.email, roles: ['PRIMARY_TEACHER'], sources: ['DESCRIPTION'], member: true }] });
const COURSES = [
  C('F1', 'NILAI 3 - EE | FRI 6:30 - 8:00 PM EST', tA, STU.F1), C('S1', 'NILAI 1 - EA | SAT 10:00 - 11:30 AM EST', tB, STU.S1), C('F2', 'NILAI 2 - EB | FRI 7:30 - 9:00 PM EST', tC, STU.F2),
  C('U1', 'NILAI 4 - EC | SUN 7:30 - 9:00 PM EST', tD, STU.U1), C('F3', 'NILAI 5 - ED | FRI 6:30 - 8:00 PM EST', tF, STU.F3), C('M1', 'NILAI 6 - EA | MON 7:30 - 9:00 PM EST', tG, STU.M1)
];
const cs = env.wb.insertSheet('Courses'); cs.data[0] = new Array(18).fill('h');
COURSES.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); cs.data[i + 1] = row; });
function friOf(d) { const x = new Date(d + 'T12:00:00Z'), off = [-2, 4, 3, 2, 1, 0, -1][x.getUTCDay()]; return new Date(x.getTime() + off * 86400000).toISOString().slice(0, 10); }
let RECS = [];
const R = (cid, p, date, status, role, extra) => RECS.push(Object.assign({ courseId: cid, email: p.email, personName: p.name, date, weekOf: 'WK-' + friOf(date), role: role || 'STUDENT', status,
  overrideStatus: '', activeMinutes: status === 'ABSENT' ? 0 : 85, callMinutes: 95, firstJoin: '', schedStart: '', captureSource: 'MEET_AUDIT_MAPPED_CODE' }, extra || {}));
const WEEKS = ['2026-10-16', '2026-10-23', '2026-10-30', '2026-11-06'];
WEEKS.forEach(fri => { // tA held every Friday: on time, everyone present
  R('F1', tA, fri, 'PRESENT', 'TEACHER', { firstJoin: '6:29 PM', schedStart: '6:30 PM', activeMinutes: 95 });
  STU.F1.forEach(s => R('F1', s, fri, 'PRESENT'));
});
['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07'].forEach((sat, i) => { // tB held Saturdays (late 8 min), half the students
  if (i % 2 === 0 && sat !== '2026-11-07') return; // held weeks: 10-24, 11-07 only → consistency over held weeks
  R('S1', tB, sat, 'PRESENT', 'TEACHER', { firstJoin: '10:08 AM', schedStart: '10:00 AM', activeMinutes: 85 });
  STU.S1.forEach((s, j) => R('S1', s, sat, j < 3 ? 'PRESENT' : 'ABSENT'));
});
// tC on approved leave Fri 11/06 (absent), nobody else
R('F2', tC, '2026-11-06', 'ABSENT', 'TEACHER'); STU.F2.forEach(s => R('F2', s, '2026-11-06', 'ABSENT'));
// tD absent Sun 11/08, covered by tE (on time)
R('U1', tD, '2026-11-08', 'ABSENT', 'TEACHER'); R('U1', tE, '2026-11-08', 'PRESENT', 'TEACHER', { firstJoin: '7:30 PM', schedStart: '7:30 PM', activeMinutes: 90 });
STU.U1.forEach(s => R('U1', s, '2026-11-08', 'PRESENT'));
// tF: no Google Meet activity at all
R('F3', tF, '2026-11-06', 'ABSENT', 'TEACHER', { captureSource: 'MEET_AUDIT_NO_ACTIVITY' }); STU.F3.forEach(s => R('F3', s, '2026-11-06', 'ABSENT', 'STUDENT', { captureSource: 'MEET_AUDIT_NO_ACTIVITY' }));
// tG: Monday 11/02 is a school holiday (no rows)
let reads = 0;
G.attReadRecordsForFilters_ = (f, allowed) => { reads++; return RECS.filter(r => (!allowed || allowed[r.courseId]) && (!f.weekOf || r.weekOf === f.weekOf)).map(r => Object.assign({}, r)); };
G.isAPSSchoolHoliday = d => d === '2026-11-02';
G.lvRows_ = () => [{ Role: 'teacher', Status: 'APPROVED', User_Email: tC.email, Leave_Start_Date: '2026-11-05', Leave_End_Date: '2026-11-07' }];
G.cctReadRecords_ = () => ({});
// ---- Grading sync data (no Classroom API) ----
let SYNC = { lastSyncAt: D.now() - 2 * 3600000, result: 'COMPLETED', lastSync: '11/11/2026 05:00 PM' };
G.gradesLastSync_ = () => SYNC;
const W = (id, t, ad, due) => ({ id, t, type: 'ASSIGNMENT', max: '100', ad, due: due || '', lsn: '' });
const GR = {
  F1: { w: [W('a1', 'ATT_LSN_9', '2026-11-05 12:00:00', '2026-11-08 12:00:00'), W('h1', 'HW_LSN_9', '2026-11-06 12:00:00', '2026-11-13 17:30:00'), W('q1', 'QUZ_LSN_9', '2026-11-06 12:10:00', '2026-11-13 18:00:00'),
    W('h0', 'HW_LSN_8', '2026-10-30 12:00:00', '2026-11-06 17:30:00'), W('h7', 'HW_LSN_7', '2026-10-23 12:00:00', '2026-10-30 17:30:00'), W('h6', 'HW_LSN_6', '2026-10-16 12:00:00', '2026-10-23 17:30:00')],
    s: [{ w: 'h7', e: STU.F1[0].email, st: 'RETURNED', g: '90', ti: '2026-10-25 10:00:00', gd: '2026-10-27 10:00:00' }, { w: 'h7', e: STU.F1[1].email, st: 'RETURNED', g: '80', ti: '2026-10-26 10:00:00', gd: '2026-10-28 10:00:00' },
      { w: 'h7', e: STU.F1[2].email, st: 'RETURNED', g: '100', ti: '2026-10-29 10:00:00', gd: '2026-10-25 09:00:00' }, // graded BEFORE turn-in → flagged, not counted
      { w: 'h1', e: STU.F1[0].email, st: 'TURNED_IN', ti: '2026-11-07 10:00:00' }, { w: 'h1', e: STU.F1[1].email, st: 'TURNED_IN', ti: '2026-11-07 11:00:00' }, { w: 'h1', e: STU.F1[2].email, st: 'TURNED_IN', ti: '2026-11-07 12:00:00' },
      { w: 'h1', e: STU.F1[3].email, st: 'TURNED_IN', ti: '2026-11-08 12:00:00' }, { w: 'q1', e: STU.F1[0].email, st: 'TURNED_IN', ti: '2026-11-07 10:00:00' }, { w: 'q1', e: STU.F1[1].email, st: 'TURNED_IN', ti: '2026-11-07 10:00:00' },
      { w: 'q1', e: STU.F1[2].email, st: 'TURNED_IN', ti: '2026-11-07 10:00:00' }, { w: 'q1', e: STU.F1[3].email, st: 'TURNED_IN', ti: '2026-11-07 10:00:00' }] },
  S1: { w: [W('a2', 'ATT_LSN_9', '2026-11-07 09:00:00', '2026-11-09 09:00:00'), W('h2', 'HW_LSN_9', '2026-11-07 09:30:00', ''), W('h8', 'HW_LSN_7', '2026-10-24 09:30:00', '2026-10-31 09:00:00')],
    s: [{ w: 'h8', e: STU.S1[0].email, st: 'RETURNED', g: '70', ti: '2026-10-25 10:00:00', gd: '2026-10-26 10:00:00' }, { w: 'h8', e: STU.S1[1].email, st: 'TURNED_IN', ti: '2026-10-25 10:00:00' }] }
};
G.gradesForCourses_ = ids => { const o = {}; ids.forEach(id => { o[id] = GR[id] || { w: [], s: [] }; }); return o; };
const tok = (email, role) => { const k = 'tok_' + email; env.cache['aps_sess_' + k] = JSON.stringify({ email, role }); return k; };
const ADMIN = tok('info@avvaiyarpadasalai.org', 'admin'), BOD = tok('bod_aps1' + DOM, 'vcfo_amchsts_bod'), TEACH = tok(tA.email, 'teacher'), HM = tok('hm.nilai3_aps9012' + DOM, 'headmaster');
const WK = 'WK-2026-11-06';
const sheetRows = name => { const s = env.wb.sheets[name]; if (!s) return []; const h = s.data[0]; return s.data.slice(1).filter(r => r && r.some(Boolean)).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const byName = (ev, p) => ev.teachers.find(x => x.email === p.email);

t('completed week = the Monday–Sunday that just ended (Wed → last week; Sunday → the week before; Monday → yesterday’s week)', () => {
  assert.strictEqual(G.taCompletedWeek_(new D()), WK);
  assert.strictEqual(G.taCompletedWeek_(new Date('2026-11-08T23:00:00Z')), 'WK-2026-10-30', 'Sunday evening: this week is not over');
  assert.strictEqual(G.taCompletedWeek_(new Date('2026-11-09T15:00:00Z')), WK, 'Monday: the week that ended yesterday');
  const b = G.taWeekBounds_(WK); assert.strictEqual(b.start, '2026-11-02'); assert.strictEqual(b.end, '2026-11-08');
});
t('scoring: on-time teacher with full classes, posting and grading → 100 Exceptional; graded-before-turn-in is flagged and not counted', () => {
  const ev = J(G.taEvaluate_(WK, new D()));
  const a = byName(ev, tA);
  assert.deepStrictEqual(a.metrics, { completion: 100, punctuality: 100, attendance: 100, engagement: 100, grading: 100, consistency: 100 }, JSON.stringify(a.metrics));
  assert.strictEqual(a.score, 100); assert.strictEqual(a.band, 'EXCEPTIONAL'); assert.strictEqual(a.eligible, true); assert.strictEqual(a.gradedBeforeTurnIn, 1);
  assert.strictEqual(a.submissionRate, 80); // 4 of 5 students turned in HW and QUZ
  assert.deepStrictEqual(a.highlights, ['ALL_CLASSES', 'ON_TIME', 'ATTENDANCE', 'POSTED']);
  assert.strictEqual(ev.counts.gradedBeforeTurnIn, 1);
});
t('scoring: late teacher, half attendance, partial posting → weighted and below Good; student non-submission never lowers the score', () => {
  const ev = J(G.taEvaluate_(WK, new D()));
  const b = byName(ev, tB);
  assert.strictEqual(b.metrics.punctuality, 50, '8 min late → 50');
  assert.strictEqual(b.metrics.attendance, 62.5, '50% present against an 80% target');
  assert.strictEqual(b.metrics.engagement, 50, 'ATT posted (1) + HW without due date (0.5) + no quiz (0) of 3');
  assert.strictEqual(b.metrics.grading, 50, '1 of 2 turned-in items graded within 7 days');
  assert.strictEqual(b.metrics.consistency, 100, 'posted in both weeks a class was held');
  assert.strictEqual(b.metrics.completion, 100, '85 active minutes ≥ 60% of 90 → full');
  assert.strictEqual(b.score, (100 * 25 + 50 * 15 + 62.5 * 20 + 50 * 20 + 50 * 10 + 100 * 10) / 100); // 70
  assert.strictEqual(b.band, 'IMPROVEMENT_OPPORTUNITY'); assert.strictEqual(b.eligible, false);
});
t('excluded, never zero: approved leave / covered class / no Meet activity / school holiday → Insufficient data with the reason', () => {
  const ev = J(G.taEvaluate_(WK, new D()));
  const c = byName(ev, tC), d = byName(ev, tD), f = byName(ev, tF), g = byName(ev, tG);
  [c, d, f, g].forEach(x => { assert.strictEqual(x.band, 'INSUFFICIENT_DATA', x.email); assert.strictEqual(x.score, null); assert.strictEqual(x.eligible, false); });
  assert.ok(c.details.some(o => o.s === 'TEACHER_LEAVE'));
  assert.ok(d.details.some(o => o.s === 'COVERED' && /Ezhil/.test(o.r)));
  assert.ok(f.reasons.some(r => /No Google Meet activity/.test(r)), JSON.stringify(f.reasons));
  assert.ok(g.details.some(o => o.s === 'SCHOOL_LEAVE') && g.reasons.some(r => /school leave/.test(r)), JSON.stringify(g.reasons));
  assert.ok(c.reasons.includes('On approved leave') && d.reasons.includes('Class covered by another teacher'), JSON.stringify([c.reasons, d.reasons]));
  const e = byName(ev, tE); // the substitute gets the class (completion + punctuality), but alone that is < 70 % of the weights
  assert.ok(e && e.held === 1 && e.metrics.punctuality === 100 && e.band === 'INSUFFICIENT_DATA' && e.reasons.some(r => /Only 60%/.test(r)), JSON.stringify(e));
  assert.deepStrictEqual(e.classes, ['NILAI 4 - EC (covered)']);
  assert.strictEqual(ev.counts.classesNotVerified, 1);
});
t('stale Google Classroom data (grade sync older than 30 h) → nobody is scored (never appreciation on incomplete data)', () => {
  const keep = SYNC; SYNC = Object.assign({}, SYNC, { lastSyncAt: D.now() - 40 * 3600000 });
  try {
    const ev = J(G.taEvaluate_(WK, new D()));
    assert.ok(ev.teachers.every(x => x.band === 'INSUFFICIENT_DATA'), JSON.stringify(ev.teachers.map(x => x.band)));
    assert.ok(byName(ev, tA).reasons.some(r => /grade sync/.test(r)));
    assert.strictEqual(ev.counts.eligible, 0);
  } finally { SYNC = keep; }
});
t('config: validation (weights = 100, band order, punctuality order, admin email domain, expected items) and per-Nilai expected items', () => {
  const base = J(G.TA_DEFAULTS_);
  const bad = (mut, re) => { const c = J(base); mut(c); const r = G.taValidateConfig_(c); assert.ok(!r.ok && re.test(r.error), r.error); };
  bad(c => { c.weights.completion = 30; }, /add up to 100/);
  bad(c => { c.bands.good = 95; }, /Exceptional > Outstanding > Good/);
  bad(c => { c.punctuality.good = 1; }, /must increase/);
  bad(c => { c.adminEmails = ['someone@gmail.com']; }, /avvaiyarpadasalai\.org/);
  bad(c => { c.expected = { 'NILAI 1': ['ATT', 'EXAM'] }; }, /ATT, HW and QUZ/);
  const ok = J(base); ok.expected = { 'nilai 1': 'att, hw' }; ok.adminEmails = 'admin@avvaiyarpadasalai.org, info@avvaiyarpadasalai.org';
  assert.ok(G.taValidateConfig_(ok).ok); assert.deepStrictEqual(J(ok.expected['NILAI 1']), ['ATT', 'HW']); assert.deepStrictEqual(J(ok.expected.DEFAULT), ['ATT', 'HW', 'QUZ']);
  assert.strictEqual(ok.adminEmails.length, 2);
});
t('access: Admin full, BOD read-only, Teacher / HM refused (server-side)', () => {
  assert.throws(() => G.getTeacherAppreciationData(TEACH, {}), /ACCESS_OFF|available to Admin/);
  assert.throws(() => G.getTeacherAppreciationData(HM, {}), /ACCESS_OFF|available to Admin/);
  const b = J(G.getTeacherAppreciationData(BOD, {})); assert.strictEqual(b.canEdit, false);
  assert.throws(() => G.saveTeacherAppreciationConfig(BOD, J(G.TA_DEFAULTS_)), /Read-only/);
  assert.throws(() => G.runTeacherAppreciationNow(BOD, {}), /Read-only/);
  assert.throws(() => G.previewTeacherAppreciation(TEACH, {}), /ACCESS_OFF|available to Admin/);
});
t('run: scores saved once per teacher-week (upsert — a second run updates, never duplicates); run logged; trigger Wednesday 7 PM created once', () => {
  env.stats.triggers.length = 0;
  const d = J(G.getTeacherAppreciationData(ADMIN, {}));
  assert.strictEqual(d.canEdit, true);
  const trig = env.stats.triggers.filter(x => x.fn === 'apsWeeklyJobs'); // r117: Wednesday job of the one hourly scheduler
  assert.strictEqual(trig.length, 1); assert.strictEqual(trig[0].everyHours, 1);
  const job = G.wjJob_('TEACHER_APPRECIATION'); assert.deepStrictEqual([job.dow, job.hour], [3, 19]);
  G.getTeacherAppreciationData(ADMIN, {}); assert.strictEqual(env.stats.triggers.filter(x => x.fn === 'apsWeeklyJobs').length, 1, 'no duplicate trigger');
  const r1 = J(G.runTeacherAppreciationNow(ADMIN, { weekId: WK }));
  assert.ok(r1.ok && r1.weekId === WK);
  const n1 = sheetRows('TEACHER_APPRECIATION_SCORES').length;
  assert.strictEqual(n1, 7, 'six class teachers + the substitute');
  G.runTeacherAppreciationNow(ADMIN, { weekId: WK });
  assert.strictEqual(sheetRows('TEACHER_APPRECIATION_SCORES').length, n1, 'second run: no duplicate rows');
  const row = sheetRows('TEACHER_APPRECIATION_SCORES').find(r => r.Teacher_Email === tA.email);
  assert.strictEqual(row.Score, '100'); assert.strictEqual(row.Band, 'EXCEPTIONAL'); assert.strictEqual(row.Eligible, 'YES'); assert.strictEqual(row.Teacher_APSID, 'APS801');
  assert.ok(sheetRows('TEACHER_APPRECIATION_RUNS').length >= 2);
  assert.throws(() => G.runTeacherAppreciationNow(ADMIN, { weekId: 'WK-2026-11-13' }), /not finished/);
});
t('dashboard data comes from the saved scores (viewing never re-scores); history + monthly averages; export CSV is formula-safe', () => {
  const before = reads;
  const d = J(G.getTeacherAppreciationData(ADMIN, { weekId: WK }));
  assert.strictEqual(reads, before, 'no attendance read when viewing');
  assert.strictEqual(d.week.teachers.length, 7); assert.strictEqual(d.week.counts.EXCEPTIONAL, 1);
  assert.ok(d.weeks.some(w => w.id === WK));
  const h = J(G.getTeacherAppreciationHistory(ADMIN, tA.email));
  assert.strictEqual(h.weeks.length, 1); assert.strictEqual(h.months[0].average, 100);
  // a name starting with "=" must not become a formula
  const sh = env.wb.sheets.TEACHER_APPRECIATION_SCORES, hd = sh.data[0], i = sh.data.findIndex(r => r && r[hd.indexOf('Teacher_Email')] === tB.email);
  sh.data[i][hd.indexOf('Teacher_Name')] = '=HYPERLINK("x")';
  const x = J(G.exportTeacherAppreciation(ADMIN, { weekId: WK }));
  assert.ok(x.rows === 7 && /teacher_appreciation_WK-2026-11-06/.test(x.fileName));
  assert.ok(x.csv.includes('"\'=HYPERLINK(""x"")"'), 'formula escaped');
  sh.data[i][hd.indexOf('Teacher_Name')] = tB.name;
});
t('preview with draft settings: in memory only (nothing saved); different weights change the score; save is versioned and audited', () => {
  const nBefore = sheetRows('TEACHER_APPRECIATION_SCORES').length;
  const cfg = J(G.TA_DEFAULTS_); cfg.weights = { completion: 50, punctuality: 50, attendance: 0, engagement: 0, grading: 0, consistency: 0 };
  const p = J(G.previewTeacherAppreciation(ADMIN, { weekId: WK, config: cfg }));
  const b = p.teachers.find(x => x.email === tB.email);
  assert.strictEqual(b.score, (100 * 50 + 50 * 50) / 100); // 75 with only completion + punctuality
  assert.strictEqual(sheetRows('TEACHER_APPRECIATION_SCORES').length, nBefore);
  assert.throws(() => G.previewTeacherAppreciation(ADMIN, { weekId: WK, config: Object.assign(J(cfg), { weights: { completion: 1, punctuality: 1, attendance: 1, engagement: 1, grading: 1, consistency: 1 } }) }), /add up to 100/);
  const s1 = J(G.saveTeacherAppreciationConfig(ADMIN, Object.assign(J(G.TA_DEFAULTS_), { appreciateMin: 80 })));
  assert.strictEqual(s1.changed, 1); assert.strictEqual(s1.version, '1');
  assert.strictEqual(J(G.saveTeacherAppreciationConfig(ADMIN, Object.assign(J(G.TA_DEFAULTS_), { appreciateMin: 80 }))).changed, 0);
  assert.strictEqual(G.taConfig_().appreciateMin, 80);
  const au = sheetRows('TEACHER_APPRECIATION_CONFIG_AUDIT'); assert.ok(au.some(r => r.Setting === 'appreciateMin' && r.Old_Value === '85' && r.New_Value === '80'));
  G.saveTeacherAppreciationConfig(ADMIN, J(G.TA_DEFAULTS_)); // back to the defaults
  assert.strictEqual(G.taConfig_().version, '2');
});
t('a damaged config sheet never breaks the run (defaults used)', () => {
  const sh = env.wb.sheets.TEACHER_APPRECIATION_CONFIG, i = sh.data.findIndex(r => r && r[0] === 'weights');
  const keep = sh.data[i][1]; sh.data[i][1] = '{"completion":90}';
  try { assert.deepStrictEqual(J(G.taConfig_().weights), J(G.TA_DEFAULTS_.weights)); } finally { sh.data[i][1] = keep; }
});
t('no Google Classroom API call anywhere', () => { assert.strictEqual(classroomTouched, 0); });
if (typeof module !== 'undefined') module.exports = { env, G, D, tok, sheetRows, tests, t, P, tA, tB, WK, J, ADMIN, BOD };

if (require.main === module || process.env.TA_RUN_ALL) {
  let fails = 0;
  for (const [n, fn] of tests) { try { fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 6).join('\n   ')); } }
  console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);
}

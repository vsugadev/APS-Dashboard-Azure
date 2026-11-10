// r107 — Continuous Student Absence Monitoring (> 4 consecutive class weeks) + emails (node test/absence.js)
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { makeContext, Sheet } = require('./gasmock');
const tests = []; const t = (name, fn) => tests.push([name, fn]);
function fixedDate(iso) { let NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } static set(i) { NOW = new Date(i).getTime(); } } return D; }
Sheet.prototype.getMaxRows = function () { return 5000; };
const D = fixedDate('2026-11-04T14:30:00Z'); // Wed Nov 4 2026, 9:30 AM EST
const env = makeContext({ Date: D, props: { APS_ENVIRONMENT: 'LIVE' } });
env.ctx.ScriptApp.WeekDay = Object.assign(env.ctx.ScriptApp.WeekDay || {}, { WEDNESDAY: 'WEDNESDAY' });
let classroomTouched = 0;
env.ctx.Classroom = new Proxy({}, { get() { classroomTouched++; throw new Error('Classroom API must not be used'); } });
vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), env.ctx, { filename: 'Code.gs' });
const J = x => JSON.parse(JSON.stringify(x));
const G = env.ctx, DOM = '@avvaiyarpadasalai.org';
const S = (n, id) => ({ name: 'Student ' + n, email: 'stu' + n + '_aps' + id + DOM });
const tA = { name: 'Anbu Teacher', email: 'anbu_aps801' + DOM }, tC = { name: 'Chitra Teacher', email: 'chitra_aps803' + DOM };
const HM = 'hm_aps901' + DOM, VP = 'vp_aps902' + DOM;
const st = {
  s1: S(1, 4001), s2: S(2, 4002), s3: S(3, 4003), s4: S(4, 4004), s7: S(7, 4007), s9: S(9, 4009), s6: S(6, 4006), s12: S(12, 4012), s11: S(11, 4011), keep: S('keep', 4099),
  s5: S(5, 4005), s5b: S('5b', 4055), s10: S(10, 4010), s10b: S('10b', 4100), s8: S(8, 4008)
};
const C = (id, name, teachers, students, support) => ({ id, name: name + ' | AY26-27', courseState: 'ACTIVE', teachers, students, classSupport: support });
const COURSES = [
  C('F1', 'NILAI 3 - PB | FRI 9:00 - 10:30 PM EST', [tA], [st.s1, st.s2, st.s3, st.s4, st.s7, st.s9, st.s6, st.s12, st.s11, st.keep],
    [{ email: tA.email, roles: ['PRIMARY_TEACHER'] }, { email: HM, roles: ['HM'] }, { email: VP, roles: ['VP'] }]),
  C('F3', 'NILAI 5 - PA | FRI 6:30 - 8:00 PM EST', [tC], [st.s5, st.s5b], [{ email: tC.email, roles: ['PRIMARY_TEACHER'] }]),
  C('F2', 'NILAI 2 - SA | SAT 12:00 - 1:30 PM EST', [], [st.s10, st.s10b], []), // no teacher email on this class
  C('F9', 'NILAI 99 - TEST | FRI 6:30 - 8:00 PM EST', [tA], [S(99, 4999)], [])
];
const cs = env.wb.insertSheet('Courses'); cs.data[0] = new Array(18).fill('h');
COURSES.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); cs.data[i + 1] = row; });
// ---- attendance records (the existing AWK reader is tested elsewhere; feed it rows) ----
const FRI = ['2026-09-18', '2026-09-25', '2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30'];
const SAT = FRI.map(d => new Date(new Date(d + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10));
let RECS = [], reads = 0;
const R = (cid, p, date, status, role, override) => RECS.push({ courseId: cid, email: p.email, personName: p.name, date, weekOf: 'WK-' + (role === 'SAT' ? '' : '') + friOf(date), role: role || 'STUDENT', status, overrideStatus: override || '', activeMinutes: status === 'ABSENT' ? 0 : 80 });
function friOf(d) { const x = new Date(d + 'T12:00:00Z'), dow = x.getUTCDay(), off = [-2, 4, 3, 2, 1, 0, -1][dow]; return new Date(x.getTime() + off * 86400000).toISOString().slice(0, 10); }
const pattern = (cid, p, dates, codes) => dates.forEach((d, i) => { const c = codes[i]; if (c === '-') return; R(cid, p, d, c === 'A' ? 'PRESENT' : 'ABSENT', 'STUDENT', c === 'E' ? 'EXCUSED' : ''); });
// F1: teacher present every Friday (all sessions conducted)
FRI.forEach(d => R('F1', tA, d, 'PRESENT', 'TEACHER'));
pattern('F1', st.s1, FRI, 'AXXXXXX');   // 6 weeks absent → notify
pattern('F1', st.s2, FRI, 'AAAXXXX');   // exactly 4 → no
pattern('F1', st.s3, FRI, 'AAAAAXX');   // 2 → no
pattern('F1', st.s4, FRI, 'XXXXXXA');   // attended last week → no
pattern('F1', st.s7, FRI, 'XXEEXXX');   // excused weeks skipped → 5 absent → notify
pattern('F1', st.s9, FRI, 'AXXXXXX');   // on approved leave today → excluded
pattern('F1', st.s6, FRI, 'AX-X-X-');   // missing rows are NOT absences → 3 counted → no
pattern('F1', st.s12, FRI, '----XXX');  // joined recently: 3 weeks of history → no
pattern('F1', st.s11, FRI, 'AXXXXXX');  // notify, but the email fails once
pattern('F1', st.keep, FRI, 'AAAAAAA');
pattern('F1', st.s8, FRI, 'AXXXXXX');   // withdrawn: rows exist but no longer on the roster → excluded
// F3: week 3 (10-02) cancelled in Class Coverage Tracking, week 5 (10-16) nobody joined (not held)
FRI.forEach((d, i) => { if (i !== 4) R('F3', tC, d, 'PRESENT', 'TEACHER'); else R('F3', tC, d, 'ABSENT', 'TEACHER'); });
pattern('F3', st.s5b, FRI, 'AAAAXAA');
pattern('F3', st.s5, FRI, 'XXXXXXX');   // 7 calendar weeks absent; 10-02 cancelled + 10-16 not held → 5 counted
// F2 (Saturday, no teacher email): conducted because s10b joins
pattern('F2', st.s10b, SAT, 'AAAAAAA');
pattern('F2', st.s10, SAT, 'AXXXXXX'); // 6 → notify, CC admin@ (no teacher)
G.attReadRecordsForFilters_ = (f, allowed) => { reads++; return RECS.filter(r => !allowed || allowed[r.courseId]).map(r => Object.assign({}, r)); };
G.lvStudentLeaveIndex_ = () => ({ [st.s9.email]: [{ Leave_Start_Date: '2026-10-25', Leave_End_Date: '2026-11-20' }] });
const CCTH = vm.runInContext('CCT_HEADER_', env.ctx), CCTS = vm.runInContext('CCT_SHEET_', env.ctx);
const cct = G.ctaSheet_(CCTS, CCTH); const r0 = new Array(CCTH.length).fill(''); r0[0] = 'CCT1'; r0[1] = 'WK-2026-10-02'; r0[2] = 'F3'; r0[7] = 'CLASS_CANCELLED'; cct.appendRow(r0);
// ---- mail capture ----
const sent = []; let failFor = null, failAdmin = false;
G.apsGmailSend_ = (profile, m) => {
  if (failFor && m.to.includes(failFor)) { failFor = null; return { ok: false, error: 'Gmail API HTTP 500 Bearer ya29.secret' }; }
  if (failAdmin && /Students Not Attending/.test(m.subject)) { failAdmin = false; return { ok: false, error: 'HTTP 503' }; }
  sent.push({ profile, m: JSON.parse(JSON.stringify(m)) }); return { ok: true };
};
const at = iso => D.set(iso);
const log = () => { const s = env.wb.sheets.STUDENT_ABSENCE_NOTIFICATIONS; if (!s) return []; const h = s.data[0]; return s.data.slice(1).filter(r => r && r.some(Boolean)).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const students = () => sent.filter(x => /We Miss You/.test(x.m.subject));
const admins = () => sent.filter(x => /Students Not Attending/.test(x.m.subject));
const props = G.PropertiesService.getScriptProperties();
G.Session = { getActiveUser: () => ({ getEmail: () => 'owner@aps.org' }), getEffectiveUser: () => ({ getEmail: () => 'owner@aps.org' }) };
const run = () => JSON.parse(JSON.stringify(G.runStudentAbsenceNow()));

t('evaluation: only students absent MORE than 4 consecutive conducted class weeks qualify (2 / exactly 4 / attended last week / missing rows / short history / withdrawn / on leave / cancelled + not-held classes)', () => {
  const ev = JSON.parse(JSON.stringify(G.saEvaluate_(new D())));
  const q = Object.fromEntries(ev.qualifying.map(x => [x.email.split('_')[0], x]));
  assert.deepStrictEqual(Object.keys(q).sort(), ['stu1', 'stu10', 'stu11', 'stu5', 'stu7'], JSON.stringify(Object.keys(q)));
  assert.strictEqual(q.stu1.weeksAbsent, 6); assert.strictEqual(q.stu1.lastAttended, '2026-09-18'); assert.strictEqual(q.stu1.absenceStartWeek, 'WK-2026-09-25');
  assert.strictEqual(q.stu7.weeksAbsent, 5, 'excused weeks neither count nor break the run'); assert.strictEqual(q.stu7.lastAttended, '', 'never attended this year');
  assert.strictEqual(q.stu10.weeksAbsent, 6);
  assert.strictEqual(q.stu1.apsId, 'APS4001'); assert.strictEqual(q.stu1.nilai, 'NILAI 3'); assert.strictEqual(q.stu1.classes, 'NILAI 3 - PB');
  assert.ok(/FRI 9:00 - 10:30 PM EST/.test(q.stu1.schedule));
  assert.strictEqual(q.stu1.teachers[0].email, tA.email); assert.strictEqual(q.stu1.hm[0].email, HM); assert.strictEqual(q.stu1.vp[0].email, VP);
  assert.strictEqual(ev.onLeave, 1, 'student on approved leave excluded');
  assert.ok(!ev.qualifying.some(x => x.email === st.s8.email), 'withdrawn (not on roster) excluded');
  assert.ok(!ev.qualifying.some(x => /99/.test(x.classes)), 'test classroom excluded');
  assert.strictEqual(q.stu5.weeksAbsent, 5, 'F3: 7 Fridays absent, but 10-02 cancelled and 10-16 not held → 5 counted');
  assert.strictEqual(reads, 1, 'one bulk attendance read'); assert.strictEqual(classroomTouched, 0, 'no Classroom API');
});
t('cancelled / not-held sessions are not counted: a student absent on every Friday is notified only when MORE than 4 conducted sessions are missed', () => {
  // F3 conducted, not-cancelled Fridays: 09-18, 09-25, 10-09, 10-23, 10-30 = 5 → s5 has 5 absences → qualifies only if >4: yes 5 > 4.
  // Make it exactly 4 by cancelling one more week → no notification.
  const r1 = new Array(CCTH.length).fill(''); r1[0] = 'CCT2'; r1[1] = 'WK-2026-09-18'; r1[2] = 'F3'; r1[7] = 'CLASS_CANCELLED'; cct.appendRow(r1);
  let ev = G.saEvaluate_(new D()); assert.ok(!Array.from(ev.qualifying).some(x => x.email === st.s5.email), '4 counted sessions (2 cancelled/not held removed) → no email');
  cct.data = cct.data.filter(r => r[0] !== 'CCT2');
  ev = G.saEvaluate_(new D()); const q5 = Array.from(ev.qualifying).find(x => x.email === st.s5.email);
  assert.ok(q5 && q5.weeksAbsent === 5, 'exactly the 5 conducted sessions are counted (cancelled 10-02 and not-held 10-16 skipped)');
});
t('DRY RUN (default): no student email, no notification rows; admin@ gets one "[DRY RUN]" preview; a RUN row records the counts', () => {
  sent.length = 0;
  const r = run();
  assert.strictEqual(r.summary.mode, 'DRY_RUN');
  assert.strictEqual(students().length, 0, 'no student email in dry run');
  assert.strictEqual(sent.length, 1); assert.strictEqual(sent[0].m.subject, '[DRY RUN] APS – Students Not Attending Tamil Classes for More Than 4 Weeks');
  assert.deepStrictEqual(Array.from(sent[0].m.to), ['admin@avvaiyarpadasalai.org']); assert.strictEqual(sent[0].profile, 'TICKETS');
  assert.ok(/DRY RUN/.test(sent[0].m.text) && /Student 1/.test(sent[0].m.text));
  const L = log(); assert.ok(L.every(x => x.Record_Type === 'RUN'), 'only the RUN row'); assert.ok(/mode=DRY_RUN; by=editor; evaluated=\d+; onLeave=1; insufficientHistory=\d+; qualifying=5/.test(L[0].Run_Summary), L[0].Run_Summary);
});
t('LIVE: one email per qualifying student (To student, CC class teacher, from donotreply@, exact subject + body incl. shared-account text); failures logged, others continue; one admin report', () => {
  G.enableStudentAbsenceEmails(); sent.length = 0; failFor = st.s11.email;
  const r = run();
  assert.strictEqual(r.summary.mode, 'LIVE');
  const se = students(); assert.strictEqual(se.length, 4, 'stu1, stu5, stu7, stu10 (stu11 failed)');
  const m1 = se.find(x => x.m.to[0] === st.s1.email).m;
  assert.strictEqual(sent.find(x => x.m === undefined), undefined);
  assert.strictEqual(m1.subject, 'APS – We Miss You in Tamil Class!');
  assert.deepStrictEqual(Array.from(m1.cc), [tA.email], 'CC the class teacher');
  assert.strictEqual(G.apsMailFrom_('TICKETS'), 'donotreply@avvaiyarpadasalai.org');
  ['Dear Student and Parent,', 'Vanakkam!', 'We noticed that you have not joined your Tamil classes for more than four consecutive weeks.', 'We miss your participation in our Tamil classes!',
   '1. Resume attending your scheduled Tamil classes.', '2. Inform your class teacher if you are facing any difficulties attending classes.', '3. Contact your respective teacher if you need any assistance.',
   'Important – Shared Student Accounts', 'Twins studying in the same Nilai may share one APS Student Account.', 'Siblings studying in the same Nilai may occasionally use a shared account.',
   'If this applies to your family, please ignore this automated absence notification.', 'switch between the respective APS Student Accounts when attending classes',
   'Warm regards,', 'APS Tech Support Team', 'Avvaiyar Padasalai – World\'s First Online Tamil School', 'https://www.avvaiyarpadasalai.org'].forEach(x => assert.ok(m1.text.includes(x), x));
  assert.ok(m1.html.includes('Important – Shared Student Accounts'));
  const m10 = se.find(x => x.m.to[0] === st.s10.email).m; assert.deepStrictEqual(Array.from(m10.cc), ['admin@avvaiyarpadasalai.org'], 'no teacher email → established fallback admin@');
  const a = admins(); assert.strictEqual(a.length, 1); const am = a[0].m;
  assert.strictEqual(am.subject, 'APS – Students Not Attending Tamil Classes for More Than 4 Weeks'); assert.deepStrictEqual(Array.from(am.to), ['admin@avvaiyarpadasalai.org']);
  ['Student Name', 'APS ID', 'Student APS Email', 'Nilai', 'Class Name', 'Class Schedule', 'Teacher', 'HM', 'VP', 'Last Attended Date', 'Consecutive Weeks Absent'].forEach(h => assert.ok(am.html.includes('>' + h + '<'), h));
  ['APS4001', st.s1.email, 'NILAI 3 - PB', 'FRI 9:00 - 10:30 PM EST', '09/18/2026', 'Not attended this year', 'Failed — will retry', 'HM and VP', 'contact the student / parent'].forEach(x => assert.ok(am.html.includes(x), x));
  if (process.env.SA_DUMP) { fs.writeFileSync(process.env.SA_DUMP + '_student.html', m1.html); fs.writeFileSync(process.env.SA_DUMP + '_admin.html', am.html); }
  const L = log().filter(x => x.Record_Type === 'STUDENT');
  assert.strictEqual(L.length, 5);
  const l1 = L.find(x => x.Student_Email === st.s1.email);
  assert.deepStrictEqual([l1.Notification_Key, l1.Student_Email_Status, l1.Teacher_CC, l1.Admin_Reported, l1.Consecutive_Weeks_Absent, l1.Last_Attended_Date], ['APS4001|WK-2026-09-25', 'SENT', tA.email, 'TRUE', '6', '2026-09-18']);
  assert.ok(l1.Student_Email_At && l1.Admin_Reported_At);
  const l11 = L.find(x => x.Student_Email === st.s11.email); assert.strictEqual(l11.Student_Email_Status, 'FAILED'); assert.ok(/HTTP 500/.test(l11.Error) && !/ya29\.secret/.test(l11.Error), 'reason logged, token masked');
  const l10 = L.find(x => x.Student_Email === st.s10.email); assert.ok(/^MISSING/.test(l10.Teacher_CC), 'missing teacher email logged');
  const run1 = log().filter(x => x.Record_Type === 'RUN').pop().Run_Summary; assert.ok(/mode=LIVE/.test(run1) && /sent=4; failed=1/.test(run1) && /teacherEmailMissing=1/.test(run1) && /adminReport=SENT/.test(run1), run1);
});
t('re-run: successful notifications are never resent; the failed one is retried; no new admin report when nobody new qualifies... except the retried student, already in the report', () => {
  sent.length = 0; at('2026-11-04T16:00:00Z');
  const r = run();
  assert.deepStrictEqual(students().map(x => x.m.to[0]), [st.s11.email], 'only the failed one retried');
  assert.strictEqual(r.summary.skippedDuplicates, 4);
  assert.strictEqual(admins().length, 0, 'everyone already in a sent admin report → no admin email');
  assert.strictEqual(log().filter(x => x.Record_Type === 'STUDENT').length, 5, 'no duplicate rows');
  sent.length = 0; run(); assert.strictEqual(sent.length, 0, 'third run: nothing');
});
t('next Wednesday, still absent: same notification key → no second student email; the weeks-absent count is refreshed', () => {
  FRI.push('2026-11-06'); R('F1', tA, '2026-11-06', 'PRESENT', 'TEACHER'); R('F1', st.s1, '2026-11-06', 'ABSENT'); R('F1', st.keep, '2026-11-06', 'PRESENT');
  sent.length = 0; at('2026-11-11T14:30:00Z'); run();
  assert.strictEqual(students().length, 0); assert.strictEqual(log().find(x => x.Student_Email === st.s1.email).Consecutive_Weeks_Absent, '7');
});
t('admin report failure: student emails are not resent, the admin report is retried on the next run with the same students', () => {
  pattern('F1', st.s3, ['2026-11-06'], 'X'); // s3 (2 → 3 weeks) still no
  // a new student crosses the threshold
  ['2026-11-13'].forEach(d => { R('F1', tA, d, 'PRESENT', 'TEACHER'); R('F1', st.s2, d, 'ABSENT'); R('F1', st.s2, '2026-11-06', 'ABSENT'); });
  sent.length = 0; failAdmin = true; at('2026-11-18T14:30:00Z'); run();
  assert.deepStrictEqual(students().map(x => x.m.to[0]), [st.s2.email]); assert.strictEqual(admins().length, 0, 'admin send failed');
  assert.strictEqual(log().find(x => x.Student_Email === st.s2.email).Admin_Reported, 'FALSE');
  sent.length = 0; at('2026-11-18T15:30:00Z'); run();
  assert.strictEqual(students().length, 0, 'student email not resent'); assert.strictEqual(admins().length, 1, 'admin report retried');
  const am = admins()[0].m.html; assert.ok(am.includes(st.s2.email) && /Still absent — already reported earlier/.test(am), 'new student + still-absent context');
});
t('student returns, then is absent again for more than 4 weeks → a NEW notification cycle', () => {
  R('F1', st.s1, '2026-11-13', 'PRESENT');
  ['2026-11-20', '2026-11-27', '2026-12-04', '2026-12-11', '2026-12-18'].forEach(d => { R('F1', tA, d, 'PRESENT', 'TEACHER'); R('F1', st.s1, d, 'ABSENT'); });
  sent.length = 0; at('2026-12-23T14:30:00Z'); run();
  assert.ok(students().some(x => x.m.to[0] === st.s1.email), 'new cycle email');
  const keys = log().filter(x => x.Student_Email === st.s1.email).map(x => x.Notification_Key);
  assert.deepStrictEqual(keys, ['APS4001|WK-2026-09-25', 'APS4001|WK-2026-11-20']);
});
t('no qualifying students → no admin report, no student email (live)', () => {
  const saved = RECS; RECS = RECS.filter(r => r.status !== 'ABSENT'); sent.length = 0;
  const r = run(); RECS = saved;
  assert.strictEqual(sent.length, 0); assert.strictEqual(r.summary.qualifying, 0); assert.strictEqual(r.summary.admin, 'NOT_NEEDED');
});
t('trigger (r117): Wednesday ~9 AM through the one hourly apsWeeklyJobs scheduler (re-run safe); an old per-job trigger does nothing; dry run toggles are editor only', () => {
  env.stats.triggers.push({ fn: 'apsStudentAbsenceWeekly', weekDay: 'WEDNESDAY', hour: 9, minute: 30 }); // left over from r107
  G.createStudentAbsenceTrigger(); G.createStudentAbsenceTrigger();
  assert.strictEqual(env.stats.triggers.filter(x => x.fn === 'apsStudentAbsenceWeekly').length, 0, 'old per-job trigger removed');
  assert.strictEqual(env.stats.triggers.filter(x => x.fn === 'apsWeeklyJobs').length, 1, 'one scheduler');
  const gp = G.ScriptApp.getProjectTriggers; G.ScriptApp.getProjectTriggers = () => gp().concat([{ fn: 'apsStudentAbsenceWeekly' }].map(x => ({ getHandlerFunction: () => x.fn }))).map(x => Object.assign(x, { getUniqueId: () => 'uid-' + x.getHandlerFunction() }));
  try {
    assert.throws(() => G.apsStudentAbsenceWeekly({ triggerUid: 'forged' }), /Access denied/);
    sent.length = 0; assert.deepStrictEqual(J(G.apsStudentAbsenceWeekly({ triggerUid: 'uid-apsStudentAbsenceWeekly' })), { skipped: 'MOVED_TO_WEEKLY_JOBS' }); assert.strictEqual(sent.length, 0);
  } finally { G.ScriptApp.getProjectTriggers = gp; }
  const r = J(G.wjRun_(new D(), 'test', { only: 'STUDENT_ABSENCE', force: true })); assert.strictEqual(r.ran[0].result, 'OK', 'the scheduler runs the absence job');
  G.Session = { getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => 'owner@aps.org' }) };
  ['createStudentAbsenceTrigger', 'runStudentAbsenceNow', 'previewStudentAbsence', 'enableStudentAbsenceEmails', 'disableStudentAbsenceEmails', 'removeStudentAbsenceTrigger'].forEach(f => assert.throws(() => G[f](), /Access denied/, f));
  G.Session = { getActiveUser: () => ({ getEmail: () => 'owner@aps.org' }), getEffectiveUser: () => ({ getEmail: () => 'owner@aps.org' }) };
  G.disableStudentAbsenceEmails(); assert.strictEqual(props.getProperty('STUDENT_ABSENCE_DRY_RUN'), 'true');
});
t('§31: only one small setting in Script Properties; no per-student keys', () => {
  const keys = props.getKeys().filter(k => /ABSENCE/i.test(k));
  assert.deepStrictEqual(keys, ['STUDENT_ABSENCE_DRY_RUN']);
  assert.ok(!props.getKeys().some(k => /@/.test(k)));
});

t('full scale (§31): ~180 classes, ~1,080 students, 30 weeks of attendance — one bulk read, evaluated well inside the time limit', () => {
  const many = [], recs = [];
  for (let c = 0; c < 180; c++) {
    const id = 'X' + c, studs = Array.from({ length: 6 }, (_, i) => ({ name: 'S' + c + '-' + i, email: 'x' + c + 'n' + i + '_aps' + (5000 + c * 6 + i) + DOM }));
    many.push(C(id, 'NILAI ' + (1 + c % 8) + ' - Z' + c + ' | FRI 6:30 - 8:00 PM EST', [tA], studs, [{ email: tA.email, roles: ['PRIMARY_TEACHER'] }]));
    for (let w = 0; w < 30; w++) {
      const d = new Date(Date.UTC(2026, 3, 3) + w * 7 * 86400000).toISOString().slice(0, 10); // Fridays from Apr 3
      recs.push({ courseId: id, email: tA.email, date: d, weekOf: 'WK-' + d, role: 'TEACHER', status: 'PRESENT', overrideStatus: '', activeMinutes: 80 });
      studs.forEach((p, i) => recs.push({ courseId: id, email: p.email, date: d, weekOf: 'WK-' + d, role: 'STUDENT', status: (i === 0 && w > 20) ? 'ABSENT' : 'PRESENT', overrideStatus: '', activeMinutes: 80 }));
    }
  }
  const realRead = G.readAllCoursesFromCache_; G.readAllCoursesFromCache_ = () => JSON.parse(JSON.stringify(COURSES.concat(many)));
  const saved = RECS; RECS = recs; reads = 0; at('2026-11-04T14:30:00Z');
  const t0 = Date.now ? process.hrtime.bigint() : 0n; const ev = G.saEvaluate_(new D()); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  RECS = saved; G.readAllCoursesFromCache_ = realRead;
  assert.strictEqual(reads, 1, 'one bulk read');
  assert.ok(ev.evaluated >= 1080, String(ev.evaluated));
  assert.strictEqual(Array.from(ev.qualifying).filter(q => /^x\d+n0_/.test(q.email)).length, 180, 'the first student of every class: 9 weeks absent → qualifies');
  assert.ok(ms < 20000, 'evaluated in ' + Math.round(ms) + ' ms');
  console.log('   full-scale evaluation: ' + recs.length + ' attendance rows, ' + ev.evaluated + ' students in ' + Math.round(ms) + ' ms');
});

(async () => {
  let fails = 0;
  for (const [n, fn] of tests) { try { await fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 6).join('\n   ')); } }
  console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);
})();

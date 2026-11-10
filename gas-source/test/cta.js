// Weekly Class Teacher Availability Email Report — server tests (node test/cta.js)
const assert = require('assert');
const vm = require('vm');
const { build } = require('./gradingfixture');
let pass = 0;
const eq = (a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);
const t = (name, fn) => { try { fn(); pass++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name + '\n' + (e.stack || e)); process.exitCode = 1; } };

function setup(props) {
  const F = build({ props: props || {} });
  const { env, cls, P } = F;
  // Courses cache in the shape buildCourseRecord_ writes (support accounts already removed).
  const courses = cls.courses.filter(c => /AY2[56]-2[67]$/.test(c.name)).map(c => ({ id: c.id, name: c.name, section: '',
    teachers: (cls.teachers[c.id] || []).filter(x => !/tech support/i.test(x.profile.name.fullName)).map(x => ({ name: x.profile.name.fullName, email: x.profile.emailAddress })),
    students: (cls.students[c.id] || []).map(x => ({ name: x.profile.name.fullName, email: x.profile.emailAddress })) }));
  env.ctx.__courses = courses;
  vm.runInContext('readAllCoursesFromCache_ = function () { return JSON.parse(JSON.stringify(__courses)); };', env.ctx);
  // A "teacher" role user with no Google Classroom.
  const roles = env.wb.insertSheet('Dashboard_User_Roles');
  roles.getRange(1, 1, 2, 5).setValues([['Email', 'Role', 'Active', 'Updated At', 'Updated By'], ['newteacher_aps9999@avvaiyarpadasalai.org', 'teacher', true, '', '']]);
  return F;
}
const at = iso => new Date(iso);
// Oct 2026 (EDT, UTC-4): Mon 5, Tue 6, Wed 7, Thu 8, Fri 9, Sat 10, Sun 11.
const TUE_1805 = '2026-10-06T22:05:00Z', WED_1700 = '2026-10-07T21:00:00Z', WED_1810 = '2026-10-07T22:10:00Z', MON_1805 = '2026-10-05T22:05:00Z',
  SAT_1805 = '2026-10-10T22:05:00Z', SUN_1805 = '2026-10-11T22:05:00Z', FRI_1745 = '2026-10-09T21:45:00Z';

t('teacher submit: validation, role checks, upsert', () => {
  const { G, tok, P, env } = setup();
  const ta = tok(P.TA.profile.emailAddress, 'teacher');
  assert.throws(() => G.submitClassTeacherAvailability(ta, { status: 'maybe' }), /choose a Status/);
  assert.throws(() => G.submitClassTeacherAvailability(ta, { status: 'confirmed', nilai: ['NILAI 3'], times: [] }), /at least one Nilai/);
  assert.throws(() => G.submitClassTeacherAvailability(tok('admin@aps.org', 'admin'), { status: 'confirmed' }), /Only a Teacher/);
  assert.throws(() => G.submitClassTeacherAvailability(tok('joshua_aps3407@avvaiyarpadasalai.org', 'student'), { status: 'confirmed' }), /Only a Teacher/);
  assert.throws(() => G.submitClassTeacherAvailability(tok('bod@aps.org', 'vcfo_amchsts_bod'), { status: 'confirmed' }), /Only a Teacher/);
  const r = G.submitClassTeacherAvailability(ta, { status: 'confirmed', nilai: ['NILAI 4', 'NILAI 3', 'BOGUS'], times: ['SAT 12:00 - 1:30 PM EST', 'FRI 6:30 - 8:00 PM EST', 'X'] });
  eq(r.nilai, ['NILAI 3', 'NILAI 4'], 'configured order, unknown dropped');
  eq(r.times, ['FRI 6:30 - 8:00 PM EST', 'SAT 12:00 - 1:30 PM EST']);
  const sh = env.wb.getSheetByName('Teacher_Availability_Selection');
  assert.strictEqual(sh.getLastRow(), 2);
  G.submitClassTeacherAvailability(ta, { status: 'not_available', nilai: ['NILAI 3'], times: ['FRI 6:30 - 8:00 PM EST'] });
  assert.strictEqual(sh.getLastRow(), 2, 'second submit updates the same row');
  const row = sh.getRange(2, 1, 1, 11).getValues()[0];
  assert.strictEqual(row[2], P.TA.profile.emailAddress); assert.strictEqual(row[4], 'APS101'); assert.strictEqual(row[7], 'not_available');
  assert.strictEqual(row[5], '', 'not available clears the Nilai'); assert.strictEqual(row[1], 'AY26-27');
});

t('report model: every teacher listed, Not Assigned, NOT SUBMITTED, class-card fallback, summary', () => {
  const { G, tok, P, env } = setup();
  G.submitClassTeacherAvailability(tok(P.TA.profile.emailAddress, 'teacher'), { status: 'confirmed', nilai: ['NILAI 3'], times: ['FRI 6:30 - 8:00 PM EST', 'SAT 12:00 - 1:30 PM EST'] });
  G.submitClassTeacherAvailability(tok('newteacher_aps9999@avvaiyarpadasalai.org', 'teacher'), { status: 'pending', nilai: ['MAZHALAI'], times: [] });
  // Teacher X1 answered only on the class card ("This Week") -> used as fallback.
  const wk = G.getCurrentWeekId_();
  const av = G.getOrCreateTeacherAvailabilitySheet_();
  av.appendRow([wk, 'tx1_aps301@avvaiyarpadasalai.org', 'Teacher X1', '9001', 'NILAI 2 - X1 | FRI 6:30 - 8:00 PM EST | AY26-27', '', 'confirmed', '', '', '', '']);
  av.appendRow([wk, 'tx2_aps302@avvaiyarpadasalai.org', 'Teacher X2', '9002', 'NILAI 3 - X2 | FRI 6:30 - 8:00 PM EST | AY26-27', '', 'not_available', 'need_hm_support', '', '', '']);
  av.appendRow(['WK-2020-01-03', 'tx3_aps303@avvaiyarpadasalai.org', 'Teacher X3', '9003', 'x', '', 'confirmed', '', '', '', '']); // other week -> ignored
  const m = G.ctaBuildReport_(new Date());
  const by = e => m.rows.find(r => r.email === e);
  const ta = by(P.TA.profile.emailAddress);
  assert.strictEqual(ta.status, 'AVAILABLE'); eq(ta.classrooms.length, 2);
  assert.ok(ta.classrooms.every(c => /AY26-27$/.test(c)), 'AY26-27 classrooms only');
  const nt = by('newteacher_aps9999@avvaiyarpadasalai.org');
  assert.ok(nt, 'role-only teacher listed'); assert.strictEqual(nt.classrooms.length, 0); assert.strictEqual(nt.status, 'PENDING');
  assert.strictEqual(by('tx1_aps301@avvaiyarpadasalai.org').status, 'AVAILABLE');
  eq(by('tx1_aps301@avvaiyarpadasalai.org').nilai, ['NILAI 2']);
  assert.strictEqual(by('tx1_aps301@avvaiyarpadasalai.org').source, 'class');
  assert.strictEqual(by('tx2_aps302@avvaiyarpadasalai.org').status, 'NOT AVAILABLE');
  assert.strictEqual(by('tx3_aps303@avvaiyarpadasalai.org').status, 'NOT SUBMITTED');
  assert.ok(!by('support@avvaiyarpadasalai.org'), 'support account hidden');
  assert.ok(!by('hm@aps.org') && !by('admin@aps.org'), 'HM / Admin co-teachers are not listed as class teachers');
  assert.ok(!m.rows.some(r => /OLD/.test(r.classrooms.join())), 'AY25-26 classroom excluded');
  const s = m.summary;
  assert.strictEqual(s.total, m.rows.length);
  assert.strictEqual(s.submitted + s.notSubmitted, s.total);
  assert.strictEqual(s.submitted, 4); assert.strictEqual(s.available, 2); assert.strictEqual(s.notAvailable, 1); assert.strictEqual(s.pending, 1);
  assert.strictEqual(s.withClassroom + s.withoutClassroom, s.total); assert.strictEqual(s.withoutClassroom, 1);
  assert.strictEqual(s.combos, 3, 'N3xFRI, N3xSAT, N2xFRI'); assert.strictEqual(s.combosPossible, 11 * 5);
  eq(m.nilaiOptions.slice(0, 3), ['MUNMAZHALAI', 'MAZHALAI', 'NILAI 1']);
  assert.strictEqual(m.byNilai.find(g => g.nilai === 'NILAI 3').teachers.length, 1);
  assert.strictEqual(m.byTime.find(g => g.time === 'FRI 6:30 - 8:00 PM EST').teachers.length, 2);
  eq(m.rows.map(r => r.n), m.rows.map((_, i) => i + 1));
});

t('email HTML + text: sections, missing values, escaping, closing, size', () => {
  const { G, tok, P } = setup();
  G.submitClassTeacherAvailability(tok(P.TA.profile.emailAddress, 'teacher'), { status: 'confirmed', nilai: ['NILAI 3'], times: ['FRI 6:30 - 8:00 PM EST'] });
  const m = G.ctaBuildReport_(at(TUE_1805));
  assert.ok(m.attention.length > 0, 'fixture has Not Set classes');
  m.attention[0].name = '<b>x</b>';
  const h = G.ctaRenderHtml_(m, false), txt = G.ctaRenderText_(m, false);
  ['Weekly Class Teacher Availability Report', 'Upcoming Week: <b>Oct 9 - Oct 11, 2026</b>', 'Vanakkam', 'Total Classes', 'Available to Take Class', 'Not Available to Take Class', 'Availability Not Set',
    'Grade-Level Availability Summary', 'Teachers Requiring Follow-Up — Not Available to Take Class (0)', 'have not set their availability for the upcoming week yet', 'Action reminder:',
    '<a href="https://www.namaps.org/dashboard"', 'Open APS Dashboard',
    'Regards,<br>APS Tech Support Team<br>Avvaiyar Padasalai<br>World’s First Online Tamil School'].forEach(x => assert.ok(h.includes(x), 'html has ' + x)); // r62: no names table here — this fixture has no Not Available class
  ['Grade-wise Availability', 'Time-wise Availability', 'Complete List'].forEach(x => assert.ok(!h.includes(x), 'html must not have ' + x));
  // r62: Not Set teachers are metrics only in the email — no names, emails or classes (and nothing unescaped)
  assert.ok(!h.includes('<b>x</b>') && !h.includes('&lt;b&gt;x&lt;/b&gt;') && !txt.includes('<b>x</b>'), 'Not Set teacher name not listed');
  m.attention.filter(r => r.classStatus.status !== 'not_available').forEach(r => { if (r.email) { assert.ok(!h.includes(r.email) && !txt.includes(r.email), 'Not Set email hidden: ' + r.email); } });
  assert.ok(!h.includes('Teachers Requiring Follow-Up — Availability Not Set') && !txt.includes('TEACHERS REQUIRING FOLLOW-UP - AVAILABILITY NOT SET'));
  ['WEEKLY CLASS TEACHER AVAILABILITY REPORT', 'Upcoming Week: Oct 9 - Oct 11, 2026', 'GRADE-LEVEL AVAILABILITY SUMMARY', 'NOT AVAILABLE TO TAKE CLASS (0)', 'AVAILABILITY NOT SET', 'have not set their availability', 'https://www.namaps.org/dashboard', 'APS Tech Support Team'].forEach(x => assert.ok(txt.includes(x), 'text has ' + x));
  ['GRADE-WISE', 'TIME-WISE', 'COMPLETE LIST'].forEach(x => assert.ok(!txt.includes(x), 'text must not have ' + x));
  assert.ok(!h.includes('TEST EMAIL'));
  assert.ok(G.ctaRenderHtml_(m, true).includes('TEST EMAIL'));
  console.log('    email size ' + Buffer.byteLength(h) + ' bytes, ' + m.classSummary.classes + ' classes'); assert.ok(Buffer.byteLength(h) < 100000, 'below Gmail clipping');
  assert.strictEqual(G.ctaSubject_(m, false), 'APS Weekly Class Teacher Availability Report – Tuesday, 10/06/2026');
  assert.strictEqual(G.ctaSubject_(m, true), '[TEST] APS Weekly Class Teacher Availability Report – 10/06/2026');
});

t('schedule: Tue-Fri 6 PM only, once a day, recipients, log', () => {
  const { G, env } = setup();
  const mails = env.stats.mails;
  for (const d of [MON_1805, SAT_1805, SUN_1805]) assert.match(G.ctaRunScheduled_(at(d), 't').skipped, /not a report day/);
  assert.match(G.ctaRunScheduled_(at(WED_1700), 't').skipped, /outside/);
  assert.strictEqual(mails.length, 0);
  const r = G.ctaRunScheduled_(at(TUE_1805), 't');
  assert.strictEqual(r.sent, true);
  assert.strictEqual(mails.length, 1, 'one consolidated email');
  assert.strictEqual(mails[0].to, 'teachers@avvaiyarpadasalai.org');
  assert.strictEqual(mails[0].cc, 'admin@avvaiyarpadasalai.org', 'r53: admin@ is CC');
  assert.strictEqual(mails[0].via, 'gmail');
  assert.ok(/<attendance@avvaiyarpadasalai\.org>$/.test(mails[0].from), 'r53: From attendance@');
  assert.strictEqual(mails[0].replyTo, 'attendance@avvaiyarpadasalai.org');
  assert.strictEqual(mails[0].subject, 'APS Weekly Class Teacher Availability Report – Tuesday, 10/06/2026');
  assert.ok(mails[0].htmlBody.includes('Grade-Level Availability Summary') && mails[0].body.includes('GRADE-LEVEL AVAILABILITY SUMMARY'));
  assert.match(G.ctaRunScheduled_(at('2026-10-06T23:30:00Z'), 't').skipped, /already sent today/);
  assert.strictEqual(mails.length, 1, 'duplicate protection');
  assert.strictEqual(G.ctaRunScheduled_(at(WED_1810), 't').sent, true);
  assert.strictEqual(G.ctaRunScheduled_(at(FRI_1745), 't').sent, true, 'trigger firing up to 15 min early still sends');
  assert.strictEqual(mails.length, 3);
  const log = env.wb.getSheetByName('Teacher_Availability_Email_Log');
  assert.strictEqual(log.getLastRow(), 4);
  assert.strictEqual(log.getRange(2, 3).getValues()[0][0], 'SENT');
  env.props.APS_CLASS_TEACHER_AVAILABILITY_EMAIL_ENABLED = 'false';
  assert.strictEqual(G.ctaRunScheduled_(at('2026-10-08T22:05:00Z'), 't').skipped, 'disabled');
  delete env.props.APS_CLASS_TEACHER_AVAILABILITY_EMAIL_ENABLED;
  env.props.APS_CLASS_TEACHER_AVAILABILITY_EMAIL_TO = 'a@x.org; bad, A@x.org';
  env.props.APS_CLASS_TEACHER_AVAILABILITY_HOUR = '9';
  assert.match(G.ctaRunScheduled_(at('2026-10-08T22:05:00Z'), 't').skipped, /outside the 9:00/);
  assert.strictEqual(G.ctaRunScheduled_(at('2026-10-08T13:05:00Z'), 't').sent, true);
  assert.strictEqual(mails[3].to, 'a@x.org');
  env.stats.mails.length = 0;
  vm.runInContext('__realSend = attMailSend_; attMailSend_ = function () { throw new Error("Service invoked too many times"); };', env.ctx);
  const f = G.ctaRunScheduled_(at('2026-10-09T13:05:00Z'), 't');
  assert.match(f.error, /too many times/);
  assert.strictEqual(log.getRange(log.getLastRow(), 3).getValues()[0][0], 'FAILED');
  assert.notStrictEqual(env.props.CTA_EMAIL_LAST_SENT_DATE, '2026-10-09', 'failed day not marked sent');
});

t('trigger: one daily trigger, handler refuses browser calls, disabled removes it', () => {
  const { G, env } = setup();
  G.ctaEnsureTrigger_();
  let mine = env.stats.triggers.filter(x => x.fn === 'sendWeeklyClassTeacherAvailabilityReport');
  assert.strictEqual(mine.length, 1);
  eq([mine[0].everyDays, mine[0].hour, mine[0].minute, mine[0].tz], [1, 18, 0, 'America/New_York']);
  G.ctaEnsureTrigger_(); G.ctaEnsureTrigger_();
  assert.strictEqual(env.stats.triggers.filter(x => x.fn === 'sendWeeklyClassTeacherAvailabilityReport').length, 1, 'idempotent');
  assert.throws(() => G.sendWeeklyClassTeacherAvailabilityReport(), /Access denied/);
  assert.throws(() => G.sendWeeklyClassTeacherAvailabilityReport({ triggerUid: 'forged' }), /Access denied/);
  const uid = env.stats.triggers.find(x => x.fn === 'sendWeeklyClassTeacherAvailabilityReport').uid;
  const r = G.sendWeeklyClassTeacherAvailabilityReport({ triggerUid: uid });
  assert.ok(r.sent || r.skipped, 'real trigger accepted');
  env.props.APS_CLASS_TEACHER_AVAILABILITY_HOUR = '19';
  G.ctaEnsureTrigger_();
  mine = env.stats.triggers.filter(x => x.fn === 'sendWeeklyClassTeacherAvailabilityReport');
  assert.strictEqual(mine.length, 1); assert.strictEqual(mine[0].hour, 19);
  env.props.APS_CLASS_TEACHER_AVAILABILITY_EMAIL_ENABLED = 'false';
  G.ctaEnsureTrigger_();
  assert.strictEqual(env.stats.triggers.filter(x => x.fn === 'sendWeeklyClassTeacherAvailabilityReport').length, 0);
  // Installed from the Admin-visit hook, alongside the daily 5 PM syncs.
  delete env.props.APS_CLASS_TEACHER_AVAILABILITY_EMAIL_ENABLED;
  G.rosterEnsureTrigger_(true);
  assert.strictEqual(env.stats.triggers.filter(x => x.fn === 'sendWeeklyClassTeacherAvailabilityReport').length, 1);
  assert.strictEqual(env.stats.triggers.filter(x => x.fn === 'apsDailyForceSync').length, 1, 'daily sync triggers untouched');
});

t('test email: Admin only, [TEST] subject, to the Admin, rate limited, editor -> owner', () => {
  const { G, tok, env } = setup();
  assert.throws(() => G.sendWeeklyClassTeacherAvailabilityTestEmail(tok('hm@aps.org', 'headmaster')), /Only an Admin/);
  assert.throws(() => G.sendWeeklyClassTeacherAvailabilityTestEmail(tok('teachera_aps101@avvaiyarpadasalai.org', 'teacher')), /Only an Admin/);
  assert.throws(() => G.sendWeeklyClassTeacherAvailabilityTestEmail('expired'), /SESSION_EXPIRED/);
  const r = G.sendWeeklyClassTeacherAvailabilityTestEmail(tok('admin@aps.org', 'admin'));
  eq(Array.from(r.to), ['admin@aps.org']);
  const mail = env.stats.mails[0];
  assert.match(mail.subject, /^\[TEST\] APS Weekly Class Teacher Availability Report – \d\d\/\d\d\/\d{4}$/);
  assert.ok(mail.htmlBody.includes('TEST EMAIL'));
  assert.throws(() => G.sendWeeklyClassTeacherAvailabilityTestEmail(tok('admin@aps.org', 'admin')), /less than a minute/);
  assert.strictEqual(env.props.CTA_EMAIL_LAST_SENT_DATE, undefined, 'test never marks the day as sent');
  Object.keys(env.cache).forEach(k => { if (k === 'ctaTestEmailSent') delete env.cache[k]; });
  G.sendWeeklyClassTeacherAvailabilityTestEmail();
  assert.strictEqual(env.stats.mails[1].to, 'owner@aps.org', 'editor run goes only to the script owner');
  assert.strictEqual(env.wb.getSheetByName('Teacher_Availability_Email_Log').getRange(2, 2).getValues()[0][0], 'TEST');
});

t('view payload by role', () => {
  const { G, tok, P } = setup();
  const tv = G.getClassTeacherAvailabilityView(tok(P.TA.profile.emailAddress, 'teacher'));
  assert.ok(tv.me && tv.canSubmit && !tv.report && !tv.canSendTest);
  assert.strictEqual(tv.me.apsId, 'APS101'); assert.strictEqual(tv.me.classrooms.length, 2); assert.strictEqual(tv.mine, null);
  assert.strictEqual(tv.nilaiOptions.length, 11); assert.strictEqual(tv.timeOptions.length, 5);
  assert.strictEqual(tv.schedule.to.length, 0, 'teachers do not get the recipient list');
  const nv = G.getClassTeacherAvailabilityView(tok('newteacher@avvaiyarpadasalai.org', 'teacher'));
  assert.strictEqual(nv.me.apsId, 'APSXXX'); assert.strictEqual(nv.me.classrooms.length, 0);
  const av = G.getClassTeacherAvailabilityView(tok('admin@aps.org', 'admin'));
  assert.ok(av.report && av.canSendTest && !av.me && av.schedule.to.length === 1 && av.schedule.cc[0] === 'admin@avvaiyarpadasalai.org' && av.schedule.from === 'attendance@avvaiyarpadasalai.org');
  const hv = G.getClassTeacherAvailabilityView(tok('hm@aps.org', 'headmaster'));
  assert.ok(hv.report && !hv.canSendTest);
  const bv = G.getClassTeacherAvailabilityView(tok('bod@aps.org', 'vcfo_amchsts_bod'));
  assert.ok(bv.report && !bv.canSendTest && !bv.canSubmit);
  assert.throws(() => G.getClassTeacherAvailabilityView(tok('joshua_aps3407@avvaiyarpadasalai.org', 'student')), /Teachers, Head Masters and Admins only/);
});

t('class-card status lines (AVAIL_STATUS_INFO / AVAIL_ALT_LABELS wording) per classroom in report + email', () => {
  const { G, P } = setup();
  const at0 = '2026-10-01T20:10:32.000Z'; // 16:10:32 ET
  assert.strictEqual(G.ctaAvailText_({ status: 'confirmed', by: 'Teacher A Long Name Here', at: at0 }, true), '\ud83d\udfe2 Available to Take Classes \u2022 Teacher A Long \u2022 10/01 16:10:32 ET \u2022 Confirm - I\'m Available');
  assert.strictEqual(G.ctaAvailText_({ status: 'not_available', alternative: 'parent_teacher_arranged', by: 'Admin \u00b7 info', at: at0 }, true), '\ud83d\udfe1 Not Available to Take Classes \u2022 Admin \u00b7 info \u2022 10/01 16:10:32 ET \u2022 Parent-Teacher Arranged');
  assert.strictEqual(G.ctaAvailText_({ status: 'not_available', alternative: 'on_call_assigned', by: 'x', at: at0 }, false), 'Not Available to Take Classes \u2022 x \u2022 10/01 16:10:32 ET \u2022 Alternative: On-Call Assigned');
  assert.strictEqual(G.ctaAvailText_({ status: 'pending' }, true), '\u26aa Not Set');
  const wk = G.getCurrentWeekId_();
  G.getOrCreateTeacherAvailabilitySheet_().appendRow([wk, P.TA.profile.emailAddress, 'Teacher A', '8001', 'x', '', 'not_available', 'sub_teacher_arranged', at0, 'a', 'Admin \u00b7 info']);
  const m = G.ctaBuildReport_(new Date());
  const ta = m.rows.find(r => r.email === P.TA.profile.emailAddress);
  assert.strictEqual(ta.classStatus.length, ta.classrooms.length);
  const i = ta.classrooms.findIndex(c => /^NILAI 3 - EF/.test(c));
  assert.strictEqual(ta.classStatus[i].alternative, 'sub_teacher_arranged');
  assert.strictEqual(ta.classStatus[1 - i].status, 'pending');
  const h = G.ctaRenderHtml_(m, false), txt = G.ctaRenderText_(m, false);
  assert.ok(h.includes('Not Available to Take Classes \u2022 Admin \u00b7 info \u2022 10/01 16:10:32 ET \u2022 Sub-Teacher Arranged'));
  assert.ok(txt.includes('| Not Available to Take Classes \u2022 Admin \u00b7 info \u2022 10/01 16:10:32 ET \u2022 Sub-Teacher Arranged | Not Available'));
  assert.ok(!/NILAI 3 - NILAI 3 - EA[^\n]*\| Not Set \| Not Set/.test(txt), 'r62: the Not Set class is not listed in the email');
  assert.ok(/AVAILABILITY NOT SET\n\d+ class(es)? \(\d+ teachers?\) have not set/.test(txt), 'r62: Not Set shown as metrics');
});

t('test email: a failed send can be retried at once (rate-limit cleared)', () => {
  const { G, tok, env } = setup();
  vm.runInContext('__s = attMailSend_; attMailSend_ = function () { throw new Error("Mail quota"); };', env.ctx);
  assert.throws(() => G.sendWeeklyClassTeacherAvailabilityTestEmail(tok('admin@aps.org', 'admin')), /Test email failed: Mail quota/);
  vm.runInContext('attMailSend_ = __s;', env.ctx);
  assert.strictEqual(G.sendWeeklyClassTeacherAvailabilityTestEmail(tok('admin@aps.org', 'admin')).sent, true);
});

t('upcoming week only: ACTIVE AY26-27 classes, exclusions, grade-level counts, Not Available vs Not Set kept apart', () => {
  const { G, env, tok } = setup({ ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS: JSON.stringify(['hidden_aps1@avvaiyarpadasalai.org']), SUPERADMIN_EMAILS: JSON.stringify(['super@aps.org']) });
  const T = (name, email) => ({ name, email });
  env.ctx.__courses = [
    { id: 'C1', name: 'NILAI 1 - AA | FRI 6:30 - 8:00 PM EST | AY26-27', teachers: [T('TTS Helper', 'TTS_helper@avvaiyarpadasalai.org'), T('One', 'one_aps1001@avvaiyarpadasalai.org')] },
    { id: 'C2', name: 'NILAI 1 - AB | SAT 12:00 - 1:30 PM EST | AY26-27', teachers: [T('Sugadev', 'vsugadev@avvaiyarpadasalai.org'), T('Two', 'two_aps1002@avvaiyarpadasalai.org')] },
    { id: 'C3', name: 'NILAI 1 - AC | SUN 7:30 - 9:00 PM EST | AY26-27', teachers: [T('Hidden', 'hidden_aps1@avvaiyarpadasalai.org'), T('Super', 'super@aps.org'), T('Three', 'three_aps1003@avvaiyarpadasalai.org')] },
    { id: 'C4', name: 'MAZHALAI - CB | FRI 7:30 - 9:00 PM EST | AY26-27', teachers: [T('Role Admin', 'roleadmin@avvaiyarpadasalai.org'), T('Four', 'four_aps1004@avvaiyarpadasalai.org')] },
    { id: 'C5', name: 'NILAI 2 - AA | FRI 6:30 - 8:00 PM EST | AY26-27', teachers: [T('HM', 'hm@aps.org')] },
    { id: 'C6', name: 'NILAI 3 - OLD | FRI 6:30 - 8:00 PM EST | AY25-26', teachers: [T('Old', 'old_aps1@avvaiyarpadasalai.org')] },
    { id: 'C7', name: 'NILAI 4 - ARC | FRI 6:30 - 8:00 PM EST | AY26-27', courseState: 'ARCHIVED', teachers: [T('Arch', 'arch_aps1@avvaiyarpadasalai.org')] }
  ];
  env.wb.getSheetByName('Dashboard_User_Roles').appendRow(['roleadmin@avvaiyarpadasalai.org', 'admin', true, '', '']);
  vm.runInContext('CacheService.getScriptCache().remove(USER_ROLE_CACHE_KEY)', env.ctx);
  const wk = G.getCurrentWeekId_(), av = G.getOrCreateTeacherAvailabilitySheet_(), at0 = '2026-09-30T14:49:06.000Z';
  av.appendRow([wk, 'one_aps1001@avvaiyarpadasalai.org', 'One', 'C1', 'x', '', 'confirmed', '', at0, 'x', 'One']);
  av.appendRow([wk, 'two_aps1002@avvaiyarpadasalai.org', 'Two', 'C2', 'x', '', 'not_available', 'need_hm_support', at0, 'x', 'Sangamithra Poi']);
  av.appendRow(['WK-2026-09-25', 'three_aps1003@avvaiyarpadasalai.org', 'Three', 'C3', 'x', '', 'confirmed', '', at0, 'x', 'Three']); // past week -> ignored
  av.appendRow([wk, 'four_aps1004@avvaiyarpadasalai.org', 'Four', 'C4', 'x', '', 'pending', '', at0, 'x', 'Admin']); // reset -> Not Set
  const m = G.ctaBuildReport_(new Date());
  const emails = m.rows.map(r => r.email).concat(m.attention.map(r => r.email)).join(' ');
  ['tts_helper', 'vsugadev', 'hidden_aps1', 'super@aps.org', 'roleadmin', 'hm@aps.org', 'old_aps1', 'arch_aps1'].forEach(x => assert.ok(!emails.includes(x), 'excluded ' + x));
  const g = n => m.gradeLevel.find(x => x.nilai === n);
  eq(g('NILAI 1'), { nilai: 'NILAI 1', classes: 3, available: 1, notAvailable: 1, notSet: 1 });
  eq(g('MAZHALAI'), { nilai: 'MAZHALAI', classes: 1, available: 0, notAvailable: 0, notSet: 1 });
  eq(g('NILAI 2'), { nilai: 'NILAI 2', classes: 1, available: 0, notAvailable: 0, notSet: 1 });
  assert.strictEqual(g('NILAI 3').classes + g('NILAI 4').classes, 0, 'AY25-26 and ARCHIVED classes not counted');
  const cs = m.classSummary;
  assert.strictEqual(cs.classes, 5); assert.strictEqual(cs.available + cs.notAvailable + cs.notSet, cs.classes);
  assert.deepStrictEqual([cs.available, cs.notAvailable, cs.notSet], [1, 1, 3]);
  assert.strictEqual(cs.teachers, 5, 'four teachers + one class with no eligible teacher');
  const na = m.attention.filter(r => r.classStatus.status === 'not_available'), ns = m.attention.filter(r => r.classStatus.status !== 'not_available');
  eq(na.map(r => [r.name, r.email, r.status]), [['Two', 'two_aps1002@avvaiyarpadasalai.org', 'Not Available to Take Classes']]);
  assert.strictEqual(G.ctaAvailText_(na[0].classStatus, false), 'Not Available to Take Classes • Sangamithra Poi • 09/30 10:49:06 ET • Need HM Support');
  eq(ns.map(r => r.name), ['Four', 'Three', 'Not Assigned']); // MAZHALAI first (Nilai order), past-week answer ignored, HM-only class -> Not Assigned
  assert.ok(ns.every(r => r.status === 'Not Set'));
  const h = G.ctaRenderHtml_(m, false);
  assert.ok(h.includes('Not Available (1)') === false && h.includes('Not Available to Take Class (1)'));
  // r62: Not Set = metrics only — 3 classes counted, none of their teachers named
  const tx = G.ctaRenderText_(m, false);
  assert.ok(h.includes('<b>3</b> classes (') && /AVAILABILITY NOT SET\n3 classes \(\d+ teachers?\)/.test(tx));
  ['four_aps1004@', 'three_aps1003@'].forEach(e => assert.ok(!h.includes(e) && !tx.includes(e), 'Not Set teacher hidden: ' + e));
  assert.ok(h.includes('two_aps1002@avvaiyarpadasalai.org') && tx.includes('two_aps1002@avvaiyarpadasalai.org'), 'Not Available teacher still listed');
  assert.ok(h.includes('<th style="background:#f1f3f4;text-align:left;">APS Email</th>'), 'Not Available table keeps its columns');
  if (process.env.CTA_DUMP) require('fs').writeFileSync(process.env.CTA_DUMP, h); // optional: save the sample email for a visual check
  env.props.APS_CLASS_TEACHER_AVAILABILITY_EXCLUDE_PREFIXES = 'one_';
  env.props.APS_DASHBOARD_PUBLIC_URL = 'https://example.org/dash';
  const m2 = G.ctaBuildReport_(new Date());
  assert.ok(!m2.rows.some(r => r.email.startsWith('one_')) && m2.rows.some(r => r.email.startsWith('tts_')), 'exclusion prefixes are configurable');
  assert.ok(G.ctaRenderHtml_(m2, false).includes('href="https://example.org/dash"'));
});

t('Teacher Availability report honours the attendance exclusions (constant + ATTENDANCE_EXCLUDED_EMAILS Script Property)', () => {
  const { G, env } = setup({ ATTENDANCE_EXCLUDED_EMAILS: JSON.stringify(['Prop_Excluded_aps77@avvaiyarpadasalai.org']) });
  const T = (name, email) => ({ name, email });
  env.ctx.__courses = [
    { id: 'V1', name: 'MUNMAZHALAI - CA | FRI 7:30 - 9:00 PM EST | AY26-27', teachers: [T('Vasuki Subramaniyam', 'vasuki_aps999@avvaiyarpadasalai.org'), T('Samyuktaa', 'samyuktaa_aps8074@avvaiyarpadasalai.org')] },
    { id: 'V2', name: 'MUNMAZHALAI - CB | FRI 7:30 - 9:00 PM EST | AY26-27', teachers: [T('Vasuki Subramaniyam', 'Vasuki_APS999@avvaiyarpadasalai.org')] },
    { id: 'V3', name: 'NILAI 1 - AA | FRI 6:30 - 8:00 PM EST | AY26-27', teachers: [T('Asvika', 'tcs_asvika_aps8112@avvaiyarpadasalai.org'), T('Prop', 'prop_excluded_aps77@avvaiyarpadasalai.org'), T('Kavin', 'kavin_aps989@avvaiyarpadasalai.org')] }
  ];
  const m = G.ctaBuildReport_(new Date());
  const all = JSON.stringify(m.rows.map(r => r.email).concat(m.attention.map(r => r.email))).toLowerCase();
  ['vasuki_aps999', 'prop_excluded_aps77'].forEach(x => assert.ok(!all.includes(x), 'excluded ' + x));
  // r48: tcs_asvika is no longer excluded — like every other tcs_/tts_ account she appears only where Classroom lists her as a class (Primary) teacher.
  eq(m.attention.map(r => [r.classroom.slice(0, 16), r.name]), [['MUNMAZHALAI - CA', 'Samyuktaa'], ['MUNMAZHALAI - CB', 'Not Assigned'], ['NILAI 1 - AA | F', 'Asvika']]);
  assert.strictEqual(m.classSummary.classes, 3, 'classes are still counted');
});

t('r53: an old To list that still names admin@ moves it to CC; test email is not CC-d', () => {
  const { G, tok, env } = setup({ APS_CLASS_TEACHER_AVAILABILITY_EMAIL_TO: 'teachers@avvaiyarpadasalai.org,admin@avvaiyarpadasalai.org' });
  const cfg = G.ctaConfig_();
  eq(cfg.to, ['teachers@avvaiyarpadasalai.org']); eq(cfg.cc, ['admin@avvaiyarpadasalai.org']);
  assert.strictEqual(G.sendWeeklyClassTeacherAvailabilityTestEmail(tok('admin@aps.org', 'admin')).sent, true);
  const m = env.stats.mails[env.stats.mails.length - 1];
  assert.strictEqual(m.to, 'admin@aps.org'); assert.strictEqual(m.cc, ''); assert.ok(/attendance@/.test(m.from));
});

t('r53: attendance@ sign-in failure pauses (no other sender), day not marked sent, one admin alert', () => {
  const { G, env } = setup({ ATTENDANCE_REFRESH_TOKEN: '' });
  const sent = [];
  env.ctx.MailApp.sendEmail = p => sent.push(p);
  const r = G.ctaRunScheduled_(at(TUE_1805), 't');
  assert.match(r.error, /Attendance email is not configured/);
  assert.strictEqual(env.stats.mails.length, 0, 'nothing sent through Gmail');
  assert.strictEqual(sent.length, 1, 'one alert to admin@');
  assert.strictEqual(sent[0].to, 'admin@avvaiyarpadasalai.org'); assert.match(sent[0].subject, /ACTION NEEDED/);
  assert.ok(!/att-client|att-secret/.test(sent[0].body + sent[0].htmlBody), 'no secrets in the alert');
  assert.notStrictEqual(env.props.CTA_EMAIL_LAST_SENT_DATE, '2026-10-06');
  G.ctaRunScheduled_(at('2026-10-06T22:30:00Z'), 't');
  assert.strictEqual(sent.length, 1, 'alert throttled');
});

t('r53: daily attendance@ limit (ATTENDANCE_MAIL_DAILY_LIMIT) is counted per recipient', () => {
  const { G, env } = setup({ ATTENDANCE_MAIL_DAILY_LIMIT: '1' });
  const r = G.ctaRunScheduled_(at(TUE_1805), 't');
  assert.match(r.error, /daily attendance email limit/);
  assert.strictEqual(env.stats.mails.length, 0);
  env.props.ATTENDANCE_MAIL_DAILY_LIMIT = '10';
  assert.strictEqual(G.ctaRunScheduled_(at('2026-10-06T22:20:00Z'), 't').sent, true);
  assert.strictEqual(G.attMailBudget_().used, 2, 'to + cc counted');
});

console.log(pass + ' passed');

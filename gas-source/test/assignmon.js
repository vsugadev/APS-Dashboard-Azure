// r85: 📚 Assignment & Grading Monitoring — server tests (node test/assignmon.js)
const assert = require('assert');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const { setup, J, D } = require('./amfixture');
const L = v => (Array.isArray(v) ? v : String(v || '').split(/\s*,\s*/)).filter(Boolean);

t('status model = the Classroom Grades tab: submitted-not-graded is UNGRADED (never MISSING); draft grades are not grades; "100 · Not turned in" GRADED; "0 · Missing" MISSING; no points + turned in = done', () => {
  const F = setup(), G = F.G, now = '2026-10-22 12:00:00', past = '2026-10-20 12:00:00', fut = '2026-10-25 12:00:00';
  const T = { grading: true, missing: true }, W = (due, max) => ({ due: due, max: max === undefined ? 100 : max });
  const s = (st, g) => ({ st: st, g: g === undefined ? '' : g });
  assert.strictEqual(G.amStatus_(s('TURNED_IN'), W(past), T, now, false), 'UNGRADED', '"__/100 Done late"');
  assert.strictEqual(G.amStatus_(s('TURNED_IN', 8), W(past), T, now, false), 'GRADED');
  assert.strictEqual(G.amStatus_(s('RETURNED', 9), W(past), T, now, false), 'RETURNED');
  assert.strictEqual(G.amStatus_(s('TURNED_IN'), W(past, ''), T, now, false), 'TURNED_IN', 'ungraded QUZ (no points) "Turned in" = done');
  assert.strictEqual(G.amStatus_(s('CREATED', 100), W(past), T, now, false), 'GRADED', 'ATT "100 · Not turned in"');
  assert.strictEqual(G.amStatus_(s('CREATED', 0), W(past), T, now, false), 'MISSING', '"0 · Missing"');
  assert.strictEqual(G.amStatus_(s('CREATED', ''), W(past), T, now, false), 'MISSING', '"0 · Draft · Missing" (draft is not a grade)');
  assert.strictEqual(G.amStatus_(s('RECLAIMED_BY_STUDENT'), W(past), T, now, false), 'MISSING');
  assert.strictEqual(G.amStatus_(s('NEW'), W(fut), T, now, false), 'NOT_STARTED');
  assert.strictEqual(G.amStatus_(s('NEW'), W(''), T, now, false), 'NOT_STARTED', 'no due date → never missing');
  assert.strictEqual(G.amStatus_(s('TURNED_IN'), W(past), { grading: false, missing: true }, now, false), 'TURNED_IN', 'grading monitoring off');
  assert.strictEqual(G.amStatus_(s('NEW'), W(past), { grading: true, missing: false }, now, false), 'NOT_STARTED', 'missing monitoring off');
  assert.strictEqual(G.amStatus_(s('NEW'), W(past), T, now, true), 'EXCLUDED');
});

t('controlled classification: ATT / HW / QUIZ (QUZ) prefixes only; UNCLASSIFIED otherwise; Admin types are configurable', () => {
  const F = setup(), G = F.G, c = G.amConfig_();
  [['HW_LSN_4', 'HW'], ['HW-04', 'HW'], ['hw 4', 'HW'], ['ATT_LSN_5', 'ATT'], ['att lsn 2', 'ATT'], ['QUZ_LSN_3', 'QUIZ'], ['QUIZ-04', 'QUIZ'], ['QUIZ', 'QUIZ']].forEach(x => assert.strictEqual(G.amClassify_(x[0], c), x[1], x[0]));
  ['HWK', 'Homework week 4', 'ATTENDANCE NOTES', 'Reading Material', 'TRMST01PROO1', 'Class Information', 'QUIZZES review', 'MODEL_EXAM'].forEach(x => assert.strictEqual(G.amClassify_(x, c), '', x));
  F.cfg({ types: c.types.concat([{ code: 'PROJ', label: 'Project', patterns: 'TRMST', monitor: true, missing: true, grading: true }]) });
  assert.strictEqual(G.amClassify_('TRMST01PROO1', G.amConfig_()), 'PROJ');
});

t('monitoring model: counts per assignment / class; ungraded never counted as missing; escalation 1→4; class health; Grading tab itself unchanged', () => {
  const F = setup(), d = F.am(F.admin), c = d.classes.find(x => x.id === F.ids.N3EF);
  const a = t => c.assignments.find(x => x.title === t);
  assert.deepStrictEqual([a('HW_LSN_2').counts.missing, a('HW_LSN_2').counts.ungraded, a('HW_LSN_2').counts.submitted], [1, 1, 1], 'Joshua turned in (ungraded), Raja missing');
  assert.deepStrictEqual([a('HW-05').counts.missing, a('HW-05').counts.graded], [1, 1], 'hyphen title monitored: "0" missing, "10" graded');
  assert.strictEqual(a('ATT_LSN_1').health, 'GREEN'); assert.strictEqual(a('HW_LSN_2').health, 'RED');
  assert.ok(!c.assignments.some(x => /Reading/.test(x.title)), 'unclassified not monitored');
  assert.strictEqual(c.health, 'RED');
  const it = d.items.filter(i => i.c === F.ids.N3EF);
  const find = (n, ti) => it.find(i => i.name === n && i.title === ti);
  assert.strictEqual(find('Joshua Kumar', 'HW_LSN_2').status, 'UNGRADED'); assert.strictEqual(find('Joshua Kumar', 'HW_LSN_2').level, 0, 'within the grading grace');
  assert.strictEqual(find('Raja', 'HW_LSN_1').level, 4, 'ungraded 14 days → Admin'); assert.strictEqual(find('Raja', 'QUZ_LSN_1').level, 4);
  assert.strictEqual(find('Raja', 'HW_LSN_2').level, 3, 'repeated missing → VP / HM');
  assert.strictEqual(find('Joshua Kumar', 'HW_LSN_3').status, 'NOT_STARTED', 'due soon');
  assert.ok(c.counts.missing === it.filter(i => i.status === 'MISSING').length);
  assert.ok(d.totals.submissionRate > 0 && d.totals.gradingRate > 0); assert.ok(d.summary.red >= 1 && d.summary.green >= 1);
  const tr = d.teachers.find(x => x.email === 'teachera_aps101' + D); assert.ok(tr && tr.counts.ungraded >= 3 && tr.attention !== 'GREEN');
  // the Grading tab (Examination → Grading) still shows only its approved prefixes
  const g = J(F.G.getGradingData(F.admin));
  assert.ok(!g.work.some(w => w.t === 'HW-05'), 'Grading tab unchanged'); assert.ok(g.work.some(w => w.t === 'HW_LSN_3'));
  // student list of one class
  const k = J(F.G.getAssignmentMonitoringClass(F.admin, F.ids.N3EF, {}));
  const raja = k.students.find(s => s.name === 'Raja'), josh = k.students.find(s => s.name === 'Joshua Kumar');
  assert.strictEqual(raja.overall, 'ACTION_REQUIRED'); assert.strictEqual(raja.cells.W4, 'MISSING'); assert.strictEqual(josh.cells.W1, 'RETURNED');
  // date range
  const d2 = F.am(F.admin, { from: '2001-01-01', to: '2001-01-02' }); assert.strictEqual(d2.items.length, 0); assert.strictEqual(d2.window.from, '2001-01-01');
});

t('access: Admin / Super Admin / HM see every class; teachers hidden by default; a class VP sees ONLY their classes; students hidden by default, then only their own rows; BOD off by default', () => {
  const F = setup(), G = F.G;
  assert.ok(F.am(F.admin).scopeAll && F.am(F.sa).scopeAll && F.am(F.hm).scopeAll);
  assert.throws(() => F.am(F.teacherB), /ACCESS_OFF/); assert.throws(() => F.am(F.student), /ACCESS_OFF/); assert.throws(() => F.am(F.bod), /ACCESS_OFF/);
  const v = F.am(F.vp); assert.deepStrictEqual(v.classes.map(c => c.id), [F.ids.N3EF]); assert.strictEqual(v.canAdmin, false);
  assert.throws(() => G.getAssignmentMonitoringClass(F.vp, F.ids.N4AB, {}), /permission/);
  assert.throws(() => G.amAdminAction(F.vp, { action: 'ADD_NOTE' }), /You do not have permission/); assert.throws(() => G.getAssignmentMonitoringAdmin(F.hm), /You do not have permission/);
  assert.strictEqual(J(G.getDashboardData(F.vp)).assignMonAccess, true); assert.strictEqual(J(G.getDashboardData(F.teacherB)).assignMonAccess, false);
  assert.strictEqual(J(G.getDashboardData(F.hm)).assignMonAccess, true); assert.strictEqual(J(G.getDashboardData(F.student)).assignMonAccess, false);
  // Access Control: switch on Teacher + Student
  G.saveAccessControl(F.admin, [{ role: 'teacher', key: 'assignMon', visible: true }, { role: 'student', key: 'assignMon', visible: true }]);
  const tb = F.am(F.teacherB); assert.ok(tb.classes.length >= 3 && !tb.classes.some(c => c.id === F.ids.N3EF), 'own classes only');
  const s = F.am(F.student); assert.strictEqual(s.student, true);
  assert.ok(s.items.every(i => i.email === 'raja_aps1234' + D), 'own rows only'); assert.ok(s.items.length >= 3);
  assert.deepStrictEqual(s.teachers, []); assert.ok(s.classes.every(c => !c.teacherEmail));
  const sk = J(G.getAssignmentMonitoringClass(F.student, F.ids.N3EF, {})); assert.deepStrictEqual(sk.students.map(x => x.name), ['Raja']);
  assert.ok(J(G.getAssignmentMonitoringHistory(F.student)).history.every(h => h.student === 'raja_aps1234' + D));
  // Super Admin switches it off for Admin
  G.saveAccessControl(F.sa, [{ role: 'admin', key: 'assignMon', visible: false }]);
  assert.throws(() => F.am(F.admin), /ACCESS_OFF/); assert.throws(() => G.getAssignmentMonitoringAdmin(F.admin), /ACCESS_OFF/);
});

t('master ON / OFF: OFF → only Admin / Super Admin (tab + Admin Control), no emails, scheduler removed; audited', () => {
  const F = setup(), G = F.G;
  F.cfg({ studentEmails: true });
  assert.strictEqual(F.env.stats.triggers.filter(x => x.fn === 'amScheduler').length, 1, 'scheduler installed when an email channel is on');
  F.cfg({ enabled: false });
  assert.strictEqual(G.ScriptApp.getProjectTriggers().filter(x => x.getHandlerFunction() === 'amScheduler').length, 0, 'removed when OFF');
  assert.throws(() => F.am(F.hm), /turned off by the APS administrator/); assert.throws(() => F.am(F.vp), /turned off/);
  assert.strictEqual(J(G.getDashboardData(F.hm)).assignMonAccess, false);
  assert.strictEqual(F.am(F.admin).enabled, false, 'Admin still opens it'); assert.strictEqual(J(G.getDashboardData(F.admin)).assignMonAccess, true);
  assert.ok(/turned off/i.test(J(G.amRunStudentReminders_(new Date(), {})).message));
  const aud = F.sheet('AM_Audit_Log').slice(1).map(r => r[3]); assert.ok(aud.includes('MONITORING_OFF') && aud.includes('CONFIG_CHANGED'));
  // bad values fall back to safe defaults
  const c = F.cfg({ enabled: true, r48Hours: 99999, maxEmailsPerRun: -3, trainingUrl: 'javascript:alert(1)', types: [] }).config;
  assert.strictEqual(c.r48Hours, 48); assert.strictEqual(c.maxEmailsPerRun, 150); assert.strictEqual(c.trainingUrl, ''); assert.strictEqual(c.types.length, 3);
  assert.throws(() => G.saveAssignmentMonitoringConfig(F.hm, {}), /You do not have permission/);
});

t('student reminders (Level 1): 48 h / missing stages, one email per student, From donotreply@, all required details; never twice; live check skips work turned in since the sync', () => {
  const F = setup(), G = F.G;
  F.cfg({ studentEmails: true });
  F.env.stats.mails.length = 0;
  const r = J(G.amRunStudentReminders_(new Date(), {}));
  const m = F.mails(/APS Action Required/);
  assert.strictEqual(r.sent, 2, r.message); assert.strictEqual(m.length, 2);
  const j = m.find(x => L(x.to)[0] === 'joshua_aps3407' + D), ra = m.find(x => L(x.to)[0] === 'raja_aps1234' + D);
  assert.strictEqual(j.subject, 'APS Action Required – 2 assignments need your attention', 'one email for both of Joshua\'s items');
  ['Joshua Kumar', 'NILAI 3 - EF', 'HW_LSN_3', 'HW-05', 'Homework', 'EST', 'Not started', 'Missing', 'Turn in', 'classroom.google.com'].forEach(x => assert.ok(j.htmlBody.includes(x), x));
  assert.ok(/donotreply@/.test(j.from));
  assert.strictEqual(ra.subject, 'APS Action Required – HW_LSN_2 Missing'); assert.ok(ra.htmlBody.includes('past due'));
  assert.ok(!ra.htmlBody.includes('HW_LSN_1'), 'submitted-but-ungraded work is never in a student reminder');
  const log = F.sheet('AM_Notification_Log').slice(1); assert.ok(log.some(x => /\|W7\|joshua_aps3407@avvaiyarpadasalai\.org\|R48$/.test(x[1]) && x[11] === 'SENT'));
  // second run (scheduler fires twice) → nothing
  assert.strictEqual(J(G.amRunStudentReminders_(new Date(), {})).sent, 0); assert.strictEqual(F.mails(/APS Action Required/).length, 2);
  // later stage: 30 h later the same item is in the due-day window → DUE_DAY once; an earlier stage is never re-sent
  const later = new Date(Date.now() + 26 * 3600000);
  F.cls.subs[F.ids.N3EF] = F.cls.subs[F.ids.N3EF].filter(s => !(s.courseWorkId === 'W8')); // (keep the rest)
  const r2 = J(G.amRunStudentReminders_(later, {}));
  assert.ok(F.sheet('AM_Notification_Log').slice(1).some(x => /\|W7\|joshua.*\|DUE_DAY$/.test(x[1])), r2.message);
  // live check: Joshua turns HW_LSN_3 in after the sync → no reminder
  const F2 = setup(); F2.cfg({ studentEmails: true });
  F2.cls.subs[F2.ids.N3EF].find(s => s.courseWorkId === 'W7' && s.userId === 'UJ').state = 'TURNED_IN';
  const r3 = J(F2.G.amRunStudentReminders_(new Date(), {}));
  assert.strictEqual(r3.skippedLive, 1); assert.ok(!F2.mails(/HW_LSN_3/).length);
  // live check failure → suppressed, logged, nothing sent
  const F3 = setup(); F3.cfg({ studentEmails: true }); F3.cls.fail[F3.ids.N3EF] = { op: 'subs', msg: 'backendError' };
  const r4 = J(F3.G.amRunStudentReminders_(new Date(), {}));
  assert.strictEqual(r4.sent, 0); assert.ok(F3.sheet('AM_Notification_Log').slice(1).some(x => x[11] === 'SUPPRESSED'));
  assert.ok(F3.sheet('AM_Audit_Log').slice(1).some(x => x[3] === 'REMINDER_SUPPRESSED'));
  // the hourly trigger refuses a browser call
  assert.throws(() => G.amScheduler({}), /Access denied/);
});

t('teacher "Action Required" (Level 2): one consolidated email per class (missing / submitted-not-graded / summary / Classroom + grading-training links), at most every N days; weekly teacher + Admin summaries once per week', () => {
  const F = setup(), G = F.G;
  F.cfg({ teacherActionEmails: true, trainingUrl: 'https://example.org/how-to-grade' });
  F.env.stats.mails.length = 0;
  const r = J(G.amRunTeacherAction_(new Date(), {}));
  const m = F.mails(/Action Required – NILAI 3 - EF$/); assert.strictEqual(m.length, 1, r.message);
  const e = m[0]; assert.deepStrictEqual(L(e.to), ['teachera_aps101' + D]); assert.ok(/donotreply@/.test(e.from));
  ['Student Submission Issues', 'Raja – QUZ_LSN_1 – Missing', 'Grading Issues', 'Raja – HW_LSN_1 – Submitted, Not Graded', 'Grading completion', 'Assignments monitored', 'https://example.org/how-to-grade'].forEach(x => assert.ok(e.htmlBody.includes(x), x));
  assert.ok(!e.htmlBody.includes('Joshua Kumar – HW_LSN_2 – Submitted'), 'within the grading grace → not in the teacher email yet');
  G.amRunTeacherAction_(new Date(), {}); G.amRunTeacherAction_(new Date(Date.now() + 2 * F.day), {});
  assert.strictEqual(F.mails(/Action Required – NILAI 3 - EF$/).length, 1, 'at most every 3 days');
  G.amRunTeacherAction_(new Date(Date.now() + 3.1 * F.day), {});
  assert.strictEqual(F.mails(/Action Required – NILAI 3 - EF$/).length, 2);
  // weekly
  F.env.stats.mails.length = 0;
  const w = J(G.amRunWeekly_(new Date(), { force: true }));
  assert.ok(w.teacherSent >= 1 && w.adminSent === 1);
  const adm = F.mails(/^APS Assignment Monitoring – Weekly Summary$/)[0];
  ['Active Classes', 'Classes Monitored', 'Student Submission Rate', 'Teacher Grading Completion', 'Missing Assignments', 'Ungraded Submissions', 'Students With Repeated Missing Assignments', 'VIEW ASSIGNMENT MONITORING'].forEach(x => assert.ok(adm.htmlBody.includes(x), x));
  assert.deepStrictEqual(L(adm.to), ['admin@avvaiyarpadasalai.org']);
  const tw = F.mails(/^APS Weekly Assignment Summary – NILAI 3 - EF$/)[0]; ['Assignments', 'Students Needing Attention', 'Teacher action'].forEach(x => assert.ok(tw.htmlBody.includes(x), x));
  assert.strictEqual(J(G.amRunWeekly_(new Date(), { force: true })).adminSent, 0, 'once per week');
});

t('Admin actions: exclude student (reason required) → EXCLUDED + audit; exclude / include assignment; reviewed stops escalation; note; manual reminders need confirmation; unclassified → SET_TYPE → monitored after sync', () => {
  const F = setup(), G = F.G, A = req => J(G.amAdminAction(F.admin, req));
  const raja = 'raja_aps1234' + D;
  assert.throws(() => A({ action: 'EXCLUDE_STUDENT', courseId: F.ids.N3EF, workId: 'W4', studentEmail: raja, reason: '' }), /reason/);
  A({ action: 'EXCLUDE_STUDENT', courseId: F.ids.N3EF, workId: 'W4', studentEmail: raja, reason: 'Approved absence' });
  let k = J(G.getAssignmentMonitoringClass(F.admin, F.ids.N3EF, {})); assert.strictEqual(k.students.find(s => s.name === 'Raja').cells.W4, 'EXCLUDED');
  const aud = F.sheet('AM_Audit_Log').slice(1).find(r => r[3] === 'EXCLUDE_STUDENT');
  assert.ok(aud && aud[1] === 'admin@aps.org' && aud[9] === 'APS1234' && aud[7] === 'HW_LSN_2' && aud[10] === 'Approved absence');
  A({ action: 'INCLUDE_STUDENT', courseId: F.ids.N3EF, workId: 'W4', studentEmail: raja });
  k = J(G.getAssignmentMonitoringClass(F.admin, F.ids.N3EF, {})); assert.strictEqual(k.students.find(s => s.name === 'Raja').cells.W4, 'MISSING');
  A({ action: 'EXCLUDE_ASSIGNMENT', courseId: F.ids.N3EF, workId: 'W8', reason: 'Practice only' });
  assert.ok(F.am(F.admin).classes.find(c => c.id === F.ids.N3EF).assignments.find(a => a.title === 'HW-05').excluded);
  A({ action: 'MARK_REVIEWED', courseId: F.ids.N3EF, workId: 'W2', studentEmail: raja, reason: 'Parent called' });
  const it = F.am(F.admin).items.find(i => i.w === 'W2' && i.email === raja); assert.strictEqual(it.level, 0); assert.ok(it.reviewed);
  A({ action: 'ADD_NOTE', courseId: F.ids.N3EF, workId: 'W2', studentEmail: raja, reason: 'Will submit Monday' });
  assert.strictEqual(F.am(F.admin).items.find(i => i.w === 'W2' && i.email === raja).notes[0].text, 'Will submit Monday');
  assert.throws(() => A({ action: 'SEND_STUDENT_REMINDER', courseId: F.ids.N3EF, workId: 'W4', studentEmail: raja }), /confirm/);
  F.env.stats.mails.length = 0;
  const s = A({ action: 'SEND_STUDENT_REMINDER', courseId: F.ids.N3EF, workId: 'W4', studentEmail: raja, confirmed: true });
  assert.ok(s.ok, s.message); assert.strictEqual(F.mails(/APS Action Required/).length, 1, 'manual reminder works even with the channel OFF');
  assert.throws(() => A({ action: 'SEND_TEACHER_REMINDER', courseId: F.ids.N3EF }), /confirm/);
  assert.ok(A({ action: 'SEND_TEACHER_REMINDER', courseId: F.ids.N3EF, confirmed: true }).ok);
  assert.throws(() => A({ action: 'RUN_REMINDERS_NOW', confirmed: true }), /turned off/);
  // unclassified coursework
  const ad = J(G.getAssignmentMonitoringAdmin(F.admin)); const rl = ad.unclassified.find(u => u.title === 'Reading Log'); assert.ok(rl);
  assert.ok(ad.overrides.length >= 2 && ad.audit.length >= 5 && ad.history.length >= 2);
  F.cls.subs[F.ids.N3EF].push({ courseWorkId: 'W6', userId: 'UJ', state: 'TURNED_IN' });
  A({ action: 'SET_TYPE', type: 'HW', title: 'Reading Log', items: rl.items });
  F.sync();
  assert.ok(F.sheet('Grading_CourseWork').some(r => r[3] === 'Reading Log'), 'captured by the next sync');
  assert.ok(!J(G.getAssignmentMonitoringAdmin(F.admin)).unclassified.some(u => u.title === 'Reading Log'));
  const syn = A({ action: 'SYNC_NOW' }); assert.ok(syn.ok, syn.message);
  assert.ok(F.sheet('AM_Audit_Log').slice(1).some(r => r[3] === 'MANUAL_SYNC'));
});

t('home card: counts for this week, scoped and cached', () => {
  const F = setup(), G = F.G;
  const c = J(G.getAssignmentHealthCard(F.admin)); assert.ok(c.missing >= 2 && c.awaitingGrading >= 1 && c.completed >= 1 && c.submissionRate !== null);
  const v = J(G.getAssignmentHealthCard(F.vp)); assert.ok(v.completed <= c.completed);
  assert.throws(() => G.getAssignmentHealthCard(F.teacherB), /ACCESS_OFF/);
  assert.ok('getAssignmentHealthCard' in J(G.getStartupBundle(F.admin, ['getAssignmentHealthCard'])));
});

t('monitoring OFF → the Grading sync captures exactly what it did before (no extra titles, no unclassified list)', () => {
  const F = setup();
  F.cfg({ enabled: false });
  F.cls.work[F.ids.N3EF].push({ id: 'W9', title: 'HW-06', workType: 'ASSIGNMENT', state: 'PUBLISHED', maxPoints: 10, creationTime: new Date().toISOString() });
  const before = F.sheet('AM_Unclassified_CourseWork').length;
  F.sync();
  assert.ok(!F.sheet('Grading_CourseWork').some(r => r[3] === 'HW-06'), 'not captured while OFF');
  assert.strictEqual(F.sheet('AM_Unclassified_CourseWork').length, before, 'unclassified list untouched while OFF');
  F.cfg({ enabled: true }); F.sync();
  assert.ok(F.sheet('Grading_CourseWork').some(r => r[3] === 'HW-06'), 'captured once ON');
});

console.log(process.exitCode ? 'SOME ASSIGNMENT MONITORING TESTS FAILED' : 'ALL ' + pass + ' ASSIGNMENT MONITORING TESTS PASSED');

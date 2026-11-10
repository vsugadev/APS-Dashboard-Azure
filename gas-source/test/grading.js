// Server tests: Examination > Grading = Google Classroom Grades (attendance excluded) with assigned-only access for every role,
// minimal API usage, upsert, status mapping, roster capture behind it, export, sync permissions, trigger, kill switch.
const assert = require('assert'); const vm = require('vm');
const { build } = require('./gradingfixture');
const { env, cls, ids, tok, J, G } = build();
const tests = []; const t = (name, fn) => tests.push([name, fn]);
const admin = tok('admin@aps.org', 'admin'), hm = tok('hm@aps.org', 'headmaster'), bod = tok('bod@amchats.org', 'vcfo_amchsts_bod');
const ta = tok('teachera_aps101@avvaiyarpadasalai.org', 'teacher'), tb = tok('teacherb_aps102@avvaiyarpadasalai.org', 'teacher');
const joshua = tok('joshua_aps3407@avvaiyarpadasalai.org', 'student'), raja = tok('raja_aps1234@avvaiyarpadasalai.org', 'student');
const sheet = n => env.wb.sheets[n];
const rows = n => sheet(n) ? sheet(n).data.slice(1).filter(r => r && r.some(v => v !== '' && v !== undefined)) : [];
const col = (n, h) => sheet(n).data[0].indexOf(h);
const cell = (n, r, h) => r[col(n, h)];
const sub = (cid, w, u) => rows('Grading_Submissions').find(r => cell('Grading_Submissions', r, 'Submission_Key') === cid + '|' + w + '|' + u);
const audit = () => rows('Roster_Audit_Log').map(r => [cell('Roster_Audit_Log', r, 'Role'), cell('Roster_Audit_Log', r, 'Action'), cell('Roster_Audit_Log', r, 'Result')].join('|'));
const calls = () => J(cls.calls);
const resetCalls = () => Object.keys(cls.calls).forEach(k => { cls.calls[k] = 0; });
const report = (tokn, f) => { const d = J(G.getGradingData(tokn)); return J(G.gradingReportRows_(d, f || {})); };

t('parser + role gate + kill switch (cached 5 min)', () => {
  assert.deepStrictEqual(J(G.parseAPSClassroomName('NILAI 3 - EF | FRI 6:30 - 8:00 PM EST | AY26-27')), { academicYear: '2026-2027', nilai: 'NILAI 3', section: 'EF', day: 'FRI', startTime: '6:30 PM', endTime: '8:00 PM', timezone: 'EST' });
  assert.strictEqual(G.parseAPSClassroomName('MAZHALAI - CB | FRI 7:30 - 9:00 PM EST | AY26-27').nilai, 'MAZHALAI');
  assert.deepStrictEqual(['admin', 'superadmin', 'headmaster', 'vcfo_amchsts_bod', 'teacher', 'student', 'authorized'].map(r => G.rosterAccessForRole_(r)), ['ADMIN', 'ADMIN', 'HM', 'BOD', 'TEACHER', 'STUDENT', '']);
  assert.strictEqual(G.buildAuthenticatedUserPayload_({ email: 'admin@aps.org', role: 'admin' }, []).gradingAccess, 'ADMIN');
  env.props.APS_CLASSROOM_ROSTER_ENABLED = 'false';
  const reset = () => { delete env.cache.rosterEnabled; vm.runInContext('ROSTER_MEMO_.enabled = null;', env.ctx); };
  reset();
  assert.throws(() => G.getGradingData(admin), /Access denied/);
  delete env.props.APS_CLASSROOM_ROSTER_ENABLED; reset();
});
let first;
t('first Sync Now (refresh rosters): >100 classrooms via pagination, approved assignments only (ATT_ now captured), 2 API calls per classroom, fields masks used', () => {
  resetCalls();
  first = J(G.syncGrading(admin, { refreshRoster: true }));
  assert.strictEqual(first.result, 'COMPLETED', JSON.stringify(first.errors));
  assert.strictEqual(first.roster.activeClassrooms, 116, 'previous-year course skipped');
  const g = first.grades;
  assert.deepStrictEqual([g.classrooms, g.classroomsProcessed, g.classroomsDeferred], [116, 116, 0]);
  const c = calls();
  assert.strictEqual(c.work, 116, 'one assignments call per classroom');
  assert.strictEqual(c.subs, 7, 'one submissions stream per classroom WITH approved assignments (6 classrooms incl. the ATT_-only one; the 150-student one = 2 pages); empty classrooms skipped');
  assert.strictEqual(g.apiCalls, c.work + c.subs);
  assert.ok(cls.lastWorkArgs.fields && /courseWork\(id,title/.test(cls.lastWorkArgs.fields) && cls.lastSubArgs[1] === '-' && /studentSubmissions\(/.test(cls.lastSubArgs[2].fields));
  const titles = rows('Grading_CourseWork').map(r => cell('Grading_CourseWork', r, 'Title'));
  assert.ok(titles.includes('ATT_LSN_1'), 'ATT_ items are captured (ATTENDANCE): ' + titles);
  assert.ok(!titles.includes('Reading Log'), 'unapproved titles are never captured: ' + titles);
  assert.ok(titles.includes('att lsn 2'), 'r85: captured for Assignment Monitoring only (ATT pattern) — the Grading tab still hides it (assignmon.js)');
  assert.ok(!titles.includes('HW_LSN_9 draft'), 'draft (unpublished) assignments are not captured');
  assert.strictEqual(rows('Grading_Submissions').filter(r => cell('Grading_Submissions', r, 'Course_ID') === ids.BIG).length, 150, 'submission pages followed');
  assert.ok(sub(ids.N3EF, 'W3', 'UJ'), 'ATT_ submission stored');
});
t('submission fields + status mapping like the Classroom Grades tab', () => {
  const r = sub(ids.N3EF, 'W1', 'UJ');
  assert.deepStrictEqual(['Student_Email', 'Student_Name', 'APSID', 'State', 'Assigned_Grade'].map(h => cell('Grading_Submissions', r, h)), ['joshua_aps3407@avvaiyarpadasalai.org', 'Joshua Kumar', 'APS3407', 'RETURNED', '9']);
  assert.ok(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(cell('Grading_Submissions', r, 'Turn_In_Date')) && cell('Grading_Submissions', r, 'Graded_Date') && cell('Grading_Submissions', r, 'Returned_Date'));
  const rep = report(admin, { courseId: ids.N3EF });
  const find = (u, title) => rep.find(x => x.email.startsWith(u) && x.title === title);
  assert.deepStrictEqual([find('joshua', 'HW_LSN_1').status, find('joshua', 'HW_LSN_1').gradedType, find('joshua', 'HW_LSN_1').grade, find('joshua', 'HW_LSN_1').max], ['COMPLETED', 'GRADED', '9', '10'], 'RETURNED is shown as COMPLETED');
  assert.strictEqual(find('joshua', 'HW_LSN_2').status, 'TURNED_IN_LATE');
  assert.strictEqual(find('joshua', 'QUZ_LSN_2').status, 'ASSIGNED', 'not yet due');
  assert.deepStrictEqual([find('raja', 'HW_LSN_1').status, find('raja', 'HW_LSN_1').gradedType, find('raja', 'HW_LSN_1').grade], ['TURNED_IN', 'UNGRADED', ''], 'draft mark is not a grade and is not shown');
  assert.ok(!JSON.stringify(G.getGradingData(admin)).includes('"dg"'), 'draft marks never sent to the browser');
  assert.strictEqual(find('raja', 'QUZ_LSN_1').status, 'RECLAIMED');
  assert.strictEqual(find('raja', 'HW_LSN_2').status, 'MISSING', 'past due, not turned in');
  assert.strictEqual(find('raja', 'QUZ_LSN_2').status, 'ASSIGNED', 'no submission record yet -> still listed');
  assert.ok(!find('joshua', 'Reading Log'), 'unapproved assignment never listed');
  assert.ok(find('joshua', 'ATT_LSN_1'), 'ATT_ assignment listed');
  const d = J(G.getGradingData(admin));
  const cat = {}; d.work.forEach(w => { cat[w.t] = w.cat; });
  assert.deepStrictEqual([cat.HW_LSN_1, cat.ATT_LSN_1, cat.QUZ_LSN_1], ['HOMEWORK', 'ATTENDANCE', 'QUIZ']);
});
t('re-sync: no duplicates; rosters NOT re-read while fresh (token saving); deleted assignment disappears', () => {
  const before = [rows('Grading_CourseWork').length, rows('Grading_Submissions').length];
  resetCalls();
  const s = J(G.syncGrading(admin, {}));
  assert.ok(!s.roster, 'roster still fresh -> not refreshed');
  assert.deepStrictEqual([calls().courses, calls().teachers, calls().students], [0, 0, 0]);
  assert.deepStrictEqual([rows('Grading_CourseWork').length, rows('Grading_Submissions').length], before);
  assert.deepStrictEqual([s.grades.newSubmissions, s.grades.updatedSubmissions], [0, 0]);
  cls.work[ids.N3EF] = cls.work[ids.N3EF].filter(w => w.id !== 'W6');
  cls.subs[ids.N3EF].find(x => x.courseWorkId === 'W1' && x.userId === 'UR').assignedGrade = 8; // teacher returned Raja's mark
  const s2 = J(G.syncGrading(admin, {}));
  assert.strictEqual(s2.grades.updatedSubmissions, 1);
  const rep = report(admin, { courseId: ids.N3EF });
  assert.ok(!rep.some(x => x.title === 'Reading Log'), 'deleted in Classroom -> not shown');
  assert.strictEqual(rep.find(x => x.email.startsWith('raja') && x.title === 'HW_LSN_1').gradedType, 'GRADED');
});
t('fields mask rejected by the service -> automatic fallback without it', () => {
  cls.rejectFields = true;
  vm.runInContext('GRADES_MEMO_.fieldsOk = true;', env.ctx);
  const s = J(G.syncGrading(admin, {}));
  assert.strictEqual(s.result, 'COMPLETED', JSON.stringify(s.errors));
  cls.rejectFields = false; vm.runInContext('GRADES_MEMO_.fieldsOk = true;', env.ctx);
});
t('errors isolated per classroom; other classrooms still synced', () => {
  cls.fail[ids.N4AB] = { op: 'subs', msg: 'The caller does not have permission' };
  const s = J(G.syncGrading(admin, {}));
  assert.strictEqual(s.result, 'COMPLETED_WITH_ERRORS');
  assert.deepStrictEqual([s.errors[0].courseId, s.errors[0].operation], [ids.N4AB, 'List Submissions']);
  assert.ok(/be able to see this classroom/.test(s.errors[0].error) && /apsOwnerReauthorizeAllScopes/.test(s.errors[0].error));
  assert.strictEqual(s.grades.classroomsProcessed, 116);
  assert.ok(sub(ids.N4AB, 'F1', 'UV'), 'previous grades kept');
  delete cls.fail[ids.N4AB];
});
t('time budget: classrooms that do not fit are deferred and done first next run', () => {
  const max = G.ROSTER_CONFIG.MAX_RUN_MS;
  G.ROSTER_CONFIG.MAX_RUN_MS = -1;
  const s = J(G.syncGrading(admin, {}));
  assert.deepStrictEqual([s.result, s.grades.classroomsProcessed, s.grades.classroomsDeferred], ['PARTIAL', 0, 116]);
  G.ROSTER_CONFIG.MAX_RUN_MS = max;
  assert.strictEqual(J(G.syncGrading(admin, {})).result, 'COMPLETED');
});
t('ACCESS — Admin and HM see ONLY classrooms they are assigned to (unless APS_GRADING_ALL_CLASSES_ROLES)', () => {
  const a = J(G.getGradingData(admin));
  assert.deepStrictEqual(a.classrooms.map(c => c.id), [ids.N3EF], 'admin teaches only NILAI 3 - EF');
  assert.ok(a.canSync && a.canExport && a.lastSync && !a.ownOnly);
  assert.ok(a.students.every(s => s.c === ids.N3EF) && a.subs.every(s => s.c === ids.N3EF));
  const h = J(G.getGradingData(hm));
  assert.deepStrictEqual(h.classrooms.map(c => c.id), [ids.N4AB]); assert.ok(!h.canSync && h.canExport && !h.lastSync, 'HM: no sync (API quota is Admin-only)');
  assert.throws(() => G.syncGrading(hm, {}), /permission to synchronize/);
  env.props.APS_GRADING_ALL_CLASSES_ROLES = 'ADMIN,HM';
  assert.strictEqual(J(G.getGradingData(admin)).classrooms.length, 116);
  delete env.props.APS_GRADING_ALL_CLASSES_ROLES;
});
t('ACCESS — no teacher names / emails anywhere in the Grading data', () => {
  const d = J(G.getGradingData(ta)); delete d.me; // the caller's own email is fine
  const text = JSON.stringify(d) + JSON.stringify((({ me, ...x }) => x)(J(G.getGradingData(joshua)))) + JSON.stringify((({ me, ...x }) => x)(J(G.getGradingData(admin))));
  assert.ok(!/teachera_|teacherb_|Teacher A|Teacher B|support@|APS Tech Support|hm@aps/.test(text), 'teacher details leaked');
});
t('ACCESS — Teacher: own classrooms with all their students; BOD (not assigned) sees nothing; sync denied', () => {
  const d = J(G.getGradingData(ta));
  assert.deepStrictEqual(d.classrooms.map(c => c.id).sort(), [ids.N3EF, ids.N3EA].sort());
  assert.strictEqual(d.classrooms.find(c => c.id === ids.N3EF).section, 'Teacher: DIYA BALAMURUGAN \ud83d\udcde[630-973-6617] |HM: Karunambikai [\ud83d\udcde+919686457264]', 'Google Classroom section sent (no extra API call)');
  assert.ok(d.students.some(s => s.e.startsWith('raja')) && !d.students.some(s => s.e.startsWith('vani')));
  assert.ok(!d.canSync && d.canExport && !d.lastSync);
  assert.throws(() => G.syncGrading(ta, {}), /^Error: Access denied\. You do not have permission to synchronize Google Classroom grades\.$/);
  const b = J(G.getGradingData(bod));
  assert.deepStrictEqual([b.classrooms.length, b.canSync, b.canExport], [0, false, false]);
  assert.throws(() => G.exportGrading(bod, {}), /Access denied/);
  assert.ok(audit().includes('TEACHER|SYNC_GRADES|DENIED'));
});
t('ACCESS — Student: only own rows of own classrooms; cannot export or sync', () => {
  const d = J(G.getGradingData(joshua));
  assert.ok(d.ownOnly);
  assert.deepStrictEqual(d.classrooms.map(c => c.id).sort(), [ids.N3EF, ids.N3EA, ids.N4AB].sort());
  assert.ok(d.students.every(s => s.e === 'joshua_aps3407@avvaiyarpadasalai.org'), 'only themselves');
  assert.ok(!JSON.stringify(d).includes('raja_aps1234') && !JSON.stringify(d).includes('vani'));
  assert.ok(d.subs.every(s => s.u === 'UJ'));
  const r = J(G.getGradingData(raja));
  assert.ok(r.subs.every(s => s.u === 'UR') && r.classrooms.length === 1);
  assert.throws(() => G.exportGrading(joshua, {}), /Access denied/);
  assert.throws(() => G.syncGrading(joshua, {}), /permission to synchronize/);
  assert.throws(() => G.getGradingData('bogus'), /SESSION_EXPIRED/);
});
t('Export: server-side, filtered, authorized only; another classroom is refused', () => {
  const ex = J(G.exportGrading(ta, { courseId: ids.N3EF, assignment: 'HW_LSN_1' }));
  const lines = ex.csv.replace(/^\ufeff/, '').split('\r\n');
  assert.strictEqual(lines[0], '"Student Name","Student Email Address","APSID","Google Classroom Name","Nilai","Assignment","Assignment Type","Assigned Date","Due Date","Turned In Date","Graded Mark","Max Points","Graded Type","Graded Date","Returned Date","Status"');
  assert.strictEqual(ex.rows, 2); assert.ok(lines.slice(1).every(l => l.includes('"HW_LSN_1"')));
  assert.ok(!/ATT_LSN/.test(ex.csv));
  assert.throws(() => G.exportGrading(ta, { courseId: ids.N4AB }), /Access denied/);
  assert.ok(audit().includes('TEACHER|EXPORT_GRADES|SUCCESS') && audit().includes('TEACHER|EXPORT_GRADES|DENIED'));
});
t('daily automatic sync at 5:00 PM EST: Force Sync, Attendance Sync Now and Grading Sync Now each get a daily trigger; handlers refuse browser calls; note shows the next 5 PM', () => {
  delete env.cache.apsTriggersChecked_v2;
  G.getGradingData(admin); // Admin visit installs / repairs the triggers
  const daily = env.stats.triggers.filter(x => ['apsDailyForceSync', 'apsDailyAttendanceSync', 'classroomRosterAutoSync', 'apsDailyMeetLinkAutoMap'].includes(x.fn));
  assert.deepStrictEqual(daily.map(x => [x.fn, x.everyDays, x.hour, x.minute, x.tz]).sort(), [['apsDailyAttendanceSync', 1, 17, 0, 'America/New_York'], ['apsDailyForceSync', 1, 17, 0, 'America/New_York'], ['apsDailyMeetLinkAutoMap', 1, 17, 0, 'America/New_York'], ['classroomRosterAutoSync', 1, 17, 0, 'America/New_York']]);
  G.rosterEnsureTrigger_(true);
  assert.strictEqual(env.stats.triggers.filter(x => x.fn === 'classroomRosterAutoSync').length, 1, 'idempotent');
  ['apsDailyForceSync', 'apsDailyAttendanceSync', 'classroomRosterAutoSync', 'apsDailyMeetLinkAutoMap'].forEach(fn => { assert.throws(() => G[fn]({}), /Access denied/); assert.throws(() => G[fn]({ triggerUid: 'guess' }), /Access denied/); });
  const g = env.stats.triggers.find(x => x.fn === 'classroomRosterAutoSync');
  const s = J(G.classroomRosterAutoSync({ triggerUid: g.uid }));
  assert.ok(s.grades && s.trigger === 'SCHEDULED');
  const nr = J(G.getGradingData(joshua)).nextRefresh;
  assert.ok(nr.auto && nr.hour === 17 && /05:00 PM EST$/.test(nr.label) && nr.at > Date.now() && nr.at <= Date.now() + 86400000 + 1000, JSON.stringify(nr));
  env.props.APS_DAILY_SYNC_ENABLED = 'false'; G.rosterEnsureTrigger_(true);
  assert.strictEqual(env.stats.triggers.filter(x => ['apsDailyForceSync', 'apsDailyAttendanceSync', 'classroomRosterAutoSync'].includes(x.fn)).length, 0, 'switched off -> triggers removed');
  assert.deepStrictEqual(J(G.getGradingData(joshua)).nextRefresh, { auto: false, label: '' });
  delete env.props.APS_DAILY_SYNC_ENABLED;
});
t('roster behind the grades: removed student -> INACTIVE (grades kept), safety when Classroom returns 0 classrooms', () => {
  cls.students[ids.N3EF] = cls.students[ids.N3EF].filter(s => s.userId !== 'UR');
  G.syncGrading(admin, { refreshRoster: true });
  const st = rows('Roster_Students').find(r => cell('Roster_Students', r, 'Enrollment_Key') === ids.N3EF + '|UR');
  assert.strictEqual(cell('Roster_Students', st, 'Membership_State'), 'INACTIVE');
  assert.ok(!report(admin, { courseId: ids.N3EF }).some(x => x.email.startsWith('raja')), 'inactive students hidden by default');
  assert.ok(report(admin, { courseId: ids.N3EF, studentStatus: 'INACTIVE' }).some(x => x.email.startsWith('raja')), 'and kept for history');
  assert.strictEqual(J(G.getGradingData(raja)).classrooms.length, 0, 'removed student no longer assigned');
  const saved = cls.courses; cls.courses = [];
  const s = J(G.syncGrading(admin, { refreshRoster: true }));
  cls.courses = saved;
  assert.ok(/NOT marked inactive/.test(s.errors.map(e => e.error).join(' ')));
  assert.strictEqual(rows('Roster_Classrooms').filter(r => cell('Roster_Classrooms', r, 'Status') === 'ACTIVE').length, 116);
});
t('Oct 2026 policy: every button that spends Google API quota is Admin-only on the server too (Force Sync, Attendance Sync Now, Grading Sync Now)', () => {
  assert.throws(() => G.forceSyncClassroomData(hm), /Only an Admin can force a sync/);
  assert.throws(() => G.forceSyncAttendanceNow(hm), /Only Admin\/Super Admin can run the attendance sync/);
  assert.throws(() => G.syncGrading(hm, {}), /permission to synchronize/);
  assert.throws(() => G.syncGrading(bod, {}), /permission to synchronize/);
});
t('only one sync at a time', () => {
  env.props.ROSTER_SYNC_RUNNING = String(Date.now());
  assert.ok(J(G.syncGrading(admin, {})).alreadyRunning);
  delete env.props.ROSTER_SYNC_RUNNING;
});
t('cached reads: per-classroom cache entries; no sheet read until the next sync', () => {
  vm.runInContext('GRADES_MEMO_.ds = null; ROSTER_MEMO_.ds = null;', env.ctx);
  G.getGradingData(ta);
  const sh = sheet('Grading_Submissions'); const r = sh.data.findIndex(x => x && x[col('Grading_Submissions', 'Submission_Key')] === ids.N3EF + '|W1|UJ');
  sh.data[r][col('Grading_Submissions', 'Assigned_Grade')] = '99';
  vm.runInContext('GRADES_MEMO_.ds = null;', env.ctx);
  assert.ok(!JSON.stringify(G.getGradingData(ta)).includes('"99"'), 'served from cache');
  G.syncGrading(admin, {});
  assert.strictEqual(cell('Grading_Submissions', sub(ids.N3EF, 'W1', 'UJ'), 'Assigned_Grade'), '9', 'sync restores the Classroom value');
});

t('missing OAuth scope: stops at the first classroom, names the scope + fix, keeps stored grades', () => {
  const before = cell('Grading_Submissions', sub(ids.N3EF, 'W1', 'UJ'), 'Assigned_Grade');
  const SCOPE = 'You do not have permission to call classroom.courses.courseWork.list. Required permissions: https://www.googleapis.com/auth/classroom.coursework.students';
  cls.courses.forEach(c => { cls.fail[c.id] = { op: 'work', msg: SCOPE }; });
  const w0 = cls.calls.work;
  const r = J(G.syncGrading(admin, {}));
  cls.courses.forEach(c => { delete cls.fail[c.id]; });
  assert.strictEqual(r.result, 'FAILED');
  assert.strictEqual(cls.calls.work - w0, 1, 'one coursework call, not one per classroom');
  assert.strictEqual(r.errorCount, 1);
  assert.ok(/not authorized for https:\/\/www.googleapis.com\/auth\/classroom.coursework.students\b/.test(r.errors[0].error) && /oauthScopes/.test(r.errors[0].error) && /apsOwnerReauthorizeAllScopes/.test(r.errors[0].error), r.errors[0].error);
  assert.strictEqual(cell('Grading_Submissions', sub(ids.N3EF, 'W1', 'UJ'), 'Assigned_Grade'), before, 'stored grades untouched');
  assert.strictEqual(J(G.syncGrading(admin, {})).result, 'COMPLETED', 'next sync after re-authorizing works');
});

t('attendance: always-excluded accounts never captured; on-call accounts (incl. tcs_asvika since r48) are', () => {
  ['vasuki_aps999@avvaiyarpadasalai.org', 'vsugadev@avvaiyarpadasalai.org'].forEach(e => assert.strictEqual(G.attIsExcludedEmail_(e), true, e));
  assert.strictEqual(G.attIsExcludedEmail_('TCS_Asvika_aps8112@avvaiyarpadasalai.org'), false, 'r48: tcs_asvika is captured');
  assert.strictEqual(G.attIsExcludedEmail_('tcs_other_aps1@avvaiyarpadasalai.org'), false);
  assert.strictEqual(G.attIsOnCallEmail_('tcs_other_aps1@avvaiyarpadasalai.org'), true);
});

t('approved-prefix categories (deterministic, no fuzzy match)', () => {
  const m = x => G.gradesCategory_(x);
  assert.deepStrictEqual(['HW_LSN_1', 'ATT_LSN_1', 'QUZ_LSN_1', 'TRMST01PRO01', 'MODEL_EXAM_1', 'EXAM_1', ' hw_lsn_3 '].map(m), ['HOMEWORK', 'ATTENDANCE', 'QUIZ', 'PROJECT WORK', 'EXAMINATION', 'EXAMINATION', 'HOMEWORK']);
  assert.deepStrictEqual(['WELCOME', 'CLASS MATERIAL', '[MATERIAL] Something', 'NOTES', 'Reading Log', 'att lsn 2', 'HWLSN1', 'QUIZ_1', 'MY_EXAM'].map(m), ['', '', '', '', '', '', '', '', '']);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) { try { await fn(); passed++; console.log('PASS', name); } catch (e) { console.log('FAIL', name); console.log(e && e.stack || e); process.exit(1); } }
console.log('\nALL ' + passed + ' GRADING TESTS PASSED');
})();

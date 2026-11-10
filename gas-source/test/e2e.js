const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { makeContext } = require('./gasmock');
const { courses, audit, ev } = require('./fixtures');
function fixedDate(iso) { const NOW = new Date(iso).getTime(); class D extends Date { constructor(...a){ if(a.length===0) super(NOW); else super(...a); } static now(){ return NOW; } } return D; }
const code = fs.readFileSync(__dirname + '/../Code.gs', 'utf8');
function boot(nowIso, opts) { opts = opts || {}; opts.Date = fixedDate(nowIso); const env = makeContext(opts); vm.runInContext(code, env.ctx, { filename: 'Code.gs' }); return env; }
function reboot(prev, nowIso, opts) { const env = boot(nowIso, Object.assign({ auditItems: audit, props: prev.props }, opts || {})); env.wb.sheets = prev.wb.sheets; Object.values(env.wb.sheets).forEach(s => s.wb = env.wb); Object.assign(env.cache, prev.cache); return env; }
function seedCourses(env, list) { const sh = env.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h'); (list || courses).forEach((c,i)=>{ const row = new Array(18).fill(''); row[0]=c.id; row[17]=JSON.stringify(c); sh.data[i+1]=row; }); }
function session(env, email, role) { const tok = 'tok_' + email; env.cache['aps_sess_' + tok] = JSON.stringify({ email, role }); return tok; }
const J = x => JSON.parse(JSON.stringify(x));
let passed = 0; const t = (name, fn) => { fn(); passed++; console.log('PASS', name); };
const A = '700000000001', B = '700000000002';
const EXCLUDED = ['hm@aps.org', 'aps_support@aps.org', 'admin@aps.org', 'vsugadev@avvaiyarpadasalai.org'];

// ================= capture + scoring (Sat Sep 26 2pm EDT) =================
// Current-week-only sync (Oct 2026): history is built the way production builds it — one sync inside each week.
let env = boot('2026-09-12T18:00:00Z', { auditItems: audit });
seedCourses(env);
const sum1 = env.ctx.syncAttendanceForAllCourses();
env = reboot(env, '2026-09-19T18:00:00Z'); const sum2 = env.ctx.syncAttendanceForAllCourses();
const snapW1 = JSON.stringify(env.wb.sheets['AWK01ATT'].data);
const snapW2before = JSON.stringify(env.wb.sheets['AWK02ATT'].data);
env = reboot(env, '2026-09-26T18:00:00Z');
const sum = env.ctx.syncAttendanceForAllCourses();
t('each run captures ONLY its current week', () => {
  assert.deepStrictEqual(J(sum1.weekSheetsWritten), ['AWK01ATT']); assert.deepStrictEqual(J(sum2.weekSheetsWritten), ['AWK02ATT']);
  assert.strictEqual(sum.mode, 'SCHEDULED'); assert.strictEqual(sum.coursesInScope, 2); assert.strictEqual(sum.occurrencesCaptured, 2);
  assert.deepStrictEqual(J(sum.weekSheetsWritten), ['AWK03ATT']); assert.strictEqual(sum.syncWeek, 'WK-2026-09-25');
});
t('past weeks are not touched by a later sync', () => {
  assert.strictEqual(JSON.stringify(env.wb.sheets['AWK01ATT'].data), snapW1); assert.strictEqual(JSON.stringify(env.wb.sheets['AWK02ATT'].data), snapW2before);
});
t('Admin/HM/hidden-prefix accounts never captured', () => {
  Object.values(env.wb.sheets).filter(s => /^AWK/.test(s.name)).forEach(sh => sh.data.slice(1).forEach(r => assert.ok(!EXCLUDED.includes(r[12]), sh.name + ' has ' + r[12])));
  ['AWK01ATT','AWK02ATT','AWK03ATT'].forEach(n => assert.strictEqual(env.wb.sheets[n].data.slice(1).filter(r => r[0]).length, 7));
});
const admin = session(env, 'admin@aps.org', 'admin');
let rows = env.ctx.getAttendanceRecordsForViewer(admin, {});
const CUR = { 't1@aps.org':'2026-09-25','s1@aps.org':'2026-09-25','s2@aps.org':'2026-09-25','s3@aps.org':'2026-09-25','t2@aps.org':'2026-09-26','s4@aps.org':'2026-09-26','s5@aps.org':'2026-09-26' };
const by = (e, d) => rows.find(r => r.email === e && r.date === (d || CUR[e]));
t('class window = teacher first join .. last leave; actual kept, effective = 95 when actual >= 90 (excluded staff ignored)', () => {
  const r = by('s1@aps.org'); assert.strictEqual(r.callStart, '7:25 PM'); assert.strictEqual(r.callEnd, '9:05 PM');
  assert.strictEqual(r.actualClassMinutes, 100); assert.strictEqual(r.effectiveClassMinutes, 95); assert.strictEqual(r.callMinutes, 95); assert.strictEqual(r.classWindowBasis, 'TEACHER');
  const s4 = by('s4@aps.org'); assert.strictEqual(s4.classWindowBasis, 'CLASS', 'teacher absent -> whole-class window'); assert.strictEqual(s4.actualClassMinutes, 90); assert.strictEqual(s4.callMinutes, 95); assert.strictEqual(s4.callStart, '12:00 PM');
});
t('score tiers from attended % of call window', () => {
  assert.strictEqual(by('s1@aps.org').attendedPct, 94.74); assert.strictEqual(by('s1@aps.org').score, 100); assert.strictEqual(by('s1@aps.org').status, 'PRESENT');
  assert.strictEqual(by('s2@aps.org').attendedPct, 47.37); assert.strictEqual(by('s2@aps.org').score, 70); assert.strictEqual(by('s2@aps.org').status, 'PARTIAL');
  assert.strictEqual(by('s3@aps.org').score, 0); assert.strictEqual(by('s3@aps.org').status, 'ABSENT');
  assert.strictEqual(by('s5@aps.org').attendedPct, 52.63); assert.strictEqual(by('s5@aps.org').score, 80);
  assert.strictEqual(by('t1@aps.org').score, 100);
  assert.strictEqual(by('s1@aps.org','2026-09-18').callMinutes, 0); assert.strictEqual(by('s1@aps.org','2026-09-18').score, 0);
});
t('tier boundaries', () => {
  const f = env.ctx.attScoreForPct_;
  [[100,100],[75.1,100],[75,90],[60,90],[59.9,80],[50,80],[49,70],[40,70],[39,60],[30,60],[29,50],[20,50],[19.9,0],[0,0]].forEach(([p,s]) => assert.strictEqual(f(p), s, p + '% -> ' + s));
});
t('overall % weighted by call hours (weeks with no call carry no weight)', () => {
  assert.strictEqual(by('s1@aps.org').overallPct, 100); assert.strictEqual(by('s2@aps.org').overallPct, 70); assert.strictEqual(by('s5@aps.org').overallPct, 80);
  assert.ok(env.wb.sheets['Attendance_Summary']); assert.ok(!env.wb.sheets['Attendance_Summary'].data.some(r => EXCLUDED.includes(r[3])));
});
t('viewer never returns excluded accounts', () => assert.ok(rows.every(r => !EXCLUDED.includes(r.email))));

// ================= overrides -> fixed scores + overall adjusts =================
const teacher = session(env, 't1@aps.org', 'teacher'), hm = session(env, 'hm@aps.org', 'headmaster'), student = session(env, 's3@aps.org', 'student');
t('EXCUSED -> 70, overall updates', () => { const r = env.ctx.editAttendanceRecordStatus(teacher, A, '2026-09-25', 's3@aps.org', 'STUDENT', 'EXCUSED', 'Doctor note provided by the parent today'); assert.strictEqual(r.score, 70); rows = env.ctx.getAttendanceRecordsForViewer(admin, {}); assert.strictEqual(by('s3@aps.org').score, 70); assert.strictEqual(by('s3@aps.org').overallPct, 70); });
t('PARTIAL -> 70', () => { assert.strictEqual(env.ctx.editAttendanceRecordStatus(hm, A, '2026-09-25', 's1@aps.org', 'STUDENT', 'PARTIAL', 'Student left the class early today').score, 70); });
t('PRESENT -> 100', () => { assert.strictEqual(env.ctx.editAttendanceRecordStatus(hm, A, '2026-09-25', 's2@aps.org', 'STUDENT', 'PRESENT', 'Home wifi failed but student attended').score, 100); });
t('ABSENT -> 0', () => { assert.strictEqual(env.ctx.editAttendanceRecordStatus(hm, B, '2026-09-26', 's4@aps.org', 'STUDENT', 'ABSENT', 'Marked absent after checking with teacher').score, 0); });
t('override on a no-call week weighs by scheduled time', () => { env.ctx.editAttendanceRecordStatus(hm, A, '2026-09-18', 's3@aps.org', 'STUDENT', 'PRESENT', 'Student completed the make up class'); rows = env.ctx.getAttendanceRecordsForViewer(admin, {}); assert.strictEqual(by('s3@aps.org').overallPct, Math.round((70*95 + 100*90)/185*10)/10); });
t('clear override restores captured score', () => { const r = env.ctx.editAttendanceRecordStatus(hm, B, '2026-09-26', 's4@aps.org', 'STUDENT', 'AUTO', 'Override was entered by mistake earlier'); assert.strictEqual(r.score, 100); });
t('student view read-only with scores', () => { const sr = env.ctx.getAttendanceRecordsForViewer(student, { weekOf: 'WK-2026-09-25' }); assert.strictEqual(sr.length, 1); assert.strictEqual(sr[0].score, 70); assert.strictEqual(sr[0].editable, false); assert.throws(() => env.ctx.editAttendanceRecordStatus(student, A, '2026-09-25', 's3@aps.org', 'STUDENT', 'PRESENT', '')); });

// ================= Sync Now = full refresh, updates in place, no duplicates =================
const countRows = e => Object.values(e.wb.sheets).filter(s => /^AWK\d+ATT$/.test(s.name)).reduce((n, s) => n + s.data.slice(1).filter(r => r[0]).length, 0);
const before = countRows(env);
env = reboot(env, '2026-09-27T20:00:00Z'); env.ctx.syncAttendanceForAllCourses(); // finalizes everything
env.wb.sheets['AWK03ATT'].data.push(['2026-09-25', A, courses[0].name, '', '', 'FRI', '', '', 'EST', '', 'The HM', '', 'hm@aps.org', 'TEACHER']); // stale excluded row
const full = env.ctx.forceSyncAttendanceNow(session(env, 'admin@aps.org', 'admin'));
t('Sync Now re-captures the CURRENT week only (full refresh)', () => { assert.strictEqual(full.mode, 'FULL_REFRESH'); assert.strictEqual(full.occurrencesCaptured, 2); assert.strictEqual(full.fullRefreshRemaining, 0); assert.deepStrictEqual(J(full.weekSheetsWritten), ['AWK03ATT']); });
t('a teacher override on a PAST week survives Sync Now (past sheets never written)', () => {
  const r = env.ctx.getAttendanceRecordsForViewer(session(env, 'admin@aps.org', 'admin'), {}).find(x => x.email === 's3@aps.org' && x.date === '2026-09-18');
  assert.strictEqual(r.status, 'PRESENT'); assert.strictEqual(r.score, 100);
});
t('no duplicate entries after repeated syncs', () => { assert.strictEqual(countRows(env), before); env.ctx.forceSyncAttendanceNow(session(env, 'admin@aps.org', 'admin')); assert.strictEqual(countRows(env), before); });
t('stale excluded rows purged on write', () => assert.ok(!env.wb.sheets['AWK03ATT'].data.some(r => r && r[12] === 'hm@aps.org')));
t('overrides kept through full refresh', () => { rows = env.ctx.getAttendanceRecordsForViewer(session(env,'admin@aps.org','admin'), {}); assert.strictEqual(by('s3@aps.org').status, 'EXCUSED'); assert.strictEqual(by('s3@aps.org').score, 70); assert.strictEqual(by('s2@aps.org').score, 100); });

// ================= late in the year: Sync Now never walks back through past weeks =================
let envL = boot('2027-01-17T20:00:00Z', { auditItems: audit }); seedCourses(envL);
const L1 = envL.ctx.forceSyncAttendanceNow(session(envL, 'admin@aps.org', 'admin'));
t('Sync Now in January queries only the current week (2 class dates), no cursor, one week sheet', () => {
  assert.strictEqual(envL.stats.reportsCalls, 2); assert.strictEqual(L1.fullRefreshRemaining, 0); assert.ok(!envL.props.attendanceFullRefreshCursor_v1);
  assert.strictEqual(Object.keys(envL.wb.sheets).filter(n => /^AWK\d+ATT$/.test(n)).length, 1); assert.strictEqual(L1.fromDate, '2027-01-11', 'past weeks skipped before any work');
});
// Monday after the week: previous week is past -> nothing synced (strict); optional grace setting allows it
let envM = reboot(env, '2026-09-28T16:00:00Z');
const snapW3 = JSON.stringify(envM.wb.sheets['AWK03ATT'].data);
const M1 = envM.ctx.syncAttendanceForAllCourses();
t('Monday: the just-ended week is past -> not synced, sheet unchanged', () => { assert.strictEqual(M1.occurrencesCaptured, 0); assert.strictEqual(JSON.stringify(envM.wb.sheets['AWK03ATT'].data), snapW3); assert.strictEqual(M1.syncWeek, 'WK-2026-10-02'); });
let envE = reboot(env, '2026-09-28T09:30:00Z');
const E1 = envE.ctx.forceSyncAttendanceNow(session(envE, 'admin@aps.org', 'admin'));
t('Monday 5:30 AM (existing Monday 5 AM trigger): default grace still finishes last weekend', () => { assert.strictEqual(E1.occurrencesCaptured, 2); assert.ok(J(E1.syncSheets).includes('AWK03ATT')); });
let envS = reboot(env, '2026-09-28T09:30:00Z'); envS.props.ATTENDANCE_PREVIOUS_WEEK_GRACE_HOURS = '0';
t('ATTENDANCE_PREVIOUS_WEEK_GRACE_HOURS=0: strictly the current week, even at 5:30 AM Monday', () => { const r = envS.ctx.forceSyncAttendanceNow(session(envS, 'admin@aps.org', 'admin')); assert.strictEqual(r.occurrencesCaptured, 0); assert.ok(!J(r.syncSheets).includes('AWK03ATT')); });
let envG = reboot(env, '2026-09-28T16:00:00Z'); envG.props.ATTENDANCE_PREVIOUS_WEEK_GRACE_HOURS = '24';
const G1 = envG.ctx.forceSyncAttendanceNow(session(envG, 'admin@aps.org', 'admin'));
t('ATTENDANCE_PREVIOUS_WEEK_GRACE_HOURS=24: Monday may still finish last week; overrides kept', () => {
  assert.strictEqual(G1.occurrencesCaptured, 2); assert.ok(J(G1.syncSheets).includes('AWK03ATT'));
  const r = envG.ctx.getAttendanceRecordsForViewer(session(envG, 'admin@aps.org', 'admin'), {}).find(x => x.email === 's3@aps.org' && x.date === '2026-09-25'); assert.strictEqual(r.status, 'EXCUSED');
});

// ================= triggers =================
t('triggers: Monday 5 AM sync, daily 7 AM report check; old ones replaced', () => {
  env.stats.triggers = [{ fn: 'syncAttendanceForAllCourses', everyMinutes: 15 }];
  env.ctx.createAttendanceSyncTrigger(); env.ctx.createAttendanceSyncTrigger();
  assert.deepStrictEqual(J(env.stats.triggers), [
    { fn: 'syncAttendanceForAllCourses', weekDay: 'MONDAY', hour: 5, minute: 0, tz: 'America/New_York' },
    { fn: 'sendWeeklyAttendanceReports', everyDays: 1, hour: 7, minute: 0, tz: 'America/New_York' }]);
});

// ================= weekly report email (Mon Sep 28 7 AM EDT) =================
let envR = reboot(env, '2026-09-28T11:00:00Z');
const rep1 = envR.ctx.sendWeeklyAttendanceReports();
const mails = envR.stats.mails;
t('one consolidated email per classroom for last week', () => { assert.strictEqual(rep1.weekNo, 3); assert.strictEqual(rep1.sent, 2); assert.strictEqual(mails.length, 2); });
t('recipients: teachers + students, cc admin@ only (r53), no excluded; From attendance@, Reply-To the class teacher', () => {
  const m = mails.find(x => /MAZHALAI/.test(x.subject));
  assert.deepStrictEqual(m.to.split(',').sort(), ['s1@aps.org','s2@aps.org','s3@aps.org','t1@aps.org']);
  assert.strictEqual(m.cc, 'admin@avvaiyarpadasalai.org');
  assert.strictEqual(m.via, 'gmail'); assert.ok(/^APS Attendance <attendance@avvaiyarpadasalai\.org>$/.test(m.from), m.from);
  assert.strictEqual(m.replyTo, 't1@aps.org');
  assert.strictEqual(envR.ctx.attMailBudget_().used, 5 + 4, 'recipients counted against attendance@ daily limit');
  assert.ok(/Week 3 \(Sep 25 - Sep 27, 2026\)/.test(m.subject));
});
t('email content: teacher name+email, contact-teacher note, scores, overall, APS template', () => {
  const h = mails.find(x => /MAZHALAI/.test(x.subject)).htmlBody;
  ['Teacher One', 't1@aps.org', 'Need a change or correction?', 'contact your Class Teacher', 'Stu One', 'Week Score', 'Overall (all weeks)', '7:25 PM - 9:05 PM EST — Actual: 100 min · Calculation: 95 min (Max)', 'adjusted by teacher', 'ACCESS APS DASHBOARD', 'Avvaiyar Padasalai']
    .forEach(s => assert.ok(h.includes(s), 'missing: ' + s));
  assert.ok(!h.includes('The HM') && !h.includes('Support Acct'));
});
t('same-day rerun does not resend', () => { const r = envR.ctx.sendWeeklyAttendanceReports(); assert.ok(r.skipped); assert.strictEqual(envR.stats.mails.length, 2); });
let envT = reboot(envR, '2026-09-29T11:00:00Z');
t('Tuesday: nothing to resume -> no email', () => { assert.ok(envT.ctx.sendWeeklyAttendanceReports().skipped); assert.strictEqual(envT.stats.mails.length, 0); });
t('non-Monday first run does not send', () => { const e2 = reboot(env, '2026-09-30T11:00:00Z'); delete e2.props.attendanceReportState_v1; assert.ok(e2.ctx.sendWeeklyAttendanceReports().skipped); });

// quota (r53: attendance@ daily limit): first class needs 4+1=5, second 3+1=4 -> with limit 8 only the first goes; Tuesday resumes the second
let envQ = reboot(env, '2026-09-28T11:00:00Z'); delete envQ.props.attendanceReportState_v1; delete envQ.props.ATT_MAIL_DAILY_COUNT; envQ.props.ATTENDANCE_MAIL_DAILY_LIMIT = '8';
const q1 = envQ.ctx.sendWeeklyAttendanceReports();
t('quota reached -> pauses, remembers progress', () => { assert.ok(q1.quotaHit); assert.strictEqual(q1.sent, 1); assert.strictEqual(q1.remaining, 1); });
let envQ2 = reboot(envQ, '2026-09-29T11:00:00Z');
const q2 = envQ2.ctx.sendWeeklyAttendanceReports();
t('Tuesday resumes the rest, never re-sends the first', () => { assert.strictEqual(q2.sent, 1); assert.strictEqual(envQ2.stats.mails.length, 1); assert.ok(/NILAI/.test(envQ2.stats.mails[0].subject)); });

// r53: attendance@ cannot sign in -> batch PAUSED (nothing sent from any other address), admin alerted once, resumes Tuesday
let envA = reboot(env, '2026-09-28T11:00:00Z', { gmailAuthFail: true }); delete envA.props.attendanceReportState_v1; delete envA.props.ATT_MAIL_ALERT_AT;
const alerts = []; envA.ctx.MailApp.sendEmail = p => alerts.push(p);
const a1 = envA.ctx.sendWeeklyAttendanceReports();
t('r53: sign-in failure pauses the batch and alerts admin@ once', () => {
  assert.ok(a1.paused); assert.strictEqual(a1.sent, 0); assert.strictEqual(a1.remaining, 2); assert.strictEqual(envA.stats.mails.length, 0);
  assert.strictEqual(alerts.length, 1); assert.strictEqual(alerts[0].to, 'admin@avvaiyarpadasalai.org'); assert.ok(!/att-secret|att-refresh/.test(alerts[0].body));
  assert.strictEqual(JSON.parse(envA.props.attendanceReportState_v1).done, false);
});
let envA2 = reboot(envA, '2026-09-29T11:00:00Z');
const a2 = envA2.ctx.sendWeeklyAttendanceReports();
t('r53: Tuesday resumes the paused batch once attendance@ works', () => { assert.strictEqual(a2.sent, 2); assert.strictEqual(envA2.stats.mails.length, 2); });
let envN = reboot(env, '2026-09-28T11:00:00Z'); delete envN.props.attendanceReportState_v1; envN.props.ATTENDANCE_REFRESH_TOKEN = ''; envN.ctx.MailApp.sendEmail = () => {};
t('r53: not configured -> paused, nothing sent; preview explains why', () => {
  const r = envN.ctx.sendWeeklyAttendanceReports(); assert.ok(r.paused); assert.strictEqual(envN.stats.mails.length, 0);
  assert.throws(() => envN.ctx.sendAttendanceReportPreviewToMe(B), /Attendance email is not configured/);
});

// PRIVATE audience option
let envP = reboot(env, '2026-09-28T11:00:00Z'); delete envP.props.attendanceReportState_v1; envP.props.ATTENDANCE_REPORT_AUDIENCE = 'PRIVATE';
envP.ctx.sendWeeklyAttendanceReports();
t('PRIVATE mode: teacher+cc get table, each student only their own row', () => {
  const ms = envP.stats.mails.filter(m => /MAZHALAI/.test(m.subject));
  assert.strictEqual(ms.length, 4);
  const s2 = ms.find(m => m.to === 's2@aps.org'); assert.ok(s2.htmlBody.includes('Stu Two') && !s2.htmlBody.includes('Stu One')); assert.ok(!s2.cc);
});
// preview
let envV = reboot(env, '2026-09-28T11:00:00Z');
const pv = envV.ctx.sendAttendanceReportPreviewToMe(B);
t('preview goes only to the runner', () => { assert.strictEqual(envV.stats.mails.length, 1); assert.strictEqual(envV.stats.mails[0].to, 'owner@aps.org'); assert.ok(!envV.stats.mails[0].cc); assert.strictEqual(pv.sent, 1); });

// ================= carried-over behaviour =================
env = boot('2026-09-26T18:00:00Z', { auditItems: audit, failReports: true }); seedCourses(env);
t('Meet audit down: nothing written', () => { const sd = env.ctx.syncAttendanceForAllCourses(); assert.ok(sd.degraded); assert.strictEqual(Object.keys(env.wb.sheets).filter(n => /^AWK/.test(n)).length, 0); });
env = boot('2026-09-26T18:00:00Z', { auditItems: audit }); seedCourses(env);
const mapSh = env.wb.insertSheet('Course_AWK_Map'); mapSh.data[0] = ['Course ID','AWK Sheet','n','t']; mapSh.data[1] = [A,'AWK01ATT','x','y'];
const legacy = env.wb.insertSheet('AWK01ATT'); legacy.data[0] = ['Attendance Date'];
legacy.data[1] = [new Date('2026-09-18T04:00:00Z'),A,courses[0].name,'MAZHALAI','CB','FRI','','','EST','AY26-27','Stu One','','s1@aps.org','STUDENT',1,'','','',90,'PRESENT',''];
legacy.data[2] = [new Date('2026-09-18T04:00:00Z'),A,courses[0].name,'MAZHALAI','CB','FRI','','','EST','AY26-27','The HM','','hm@aps.org','TEACHER',1,'','','',90,'PRESENT',''];
env.ctx.syncAttendanceForAllCourses();
t('legacy migration keeps OLD_ backup, drops excluded rows from week sheets; the sync itself writes only the current week', () => { assert.ok(env.wb.sheets['OLD_AWK01ATT']); assert.ok(!env.wb.sheets['AWK02ATT'].data.some(r => r && r[12] === 'hm@aps.org')); assert.strictEqual(env.wb.sheets['AWK02ATT'].data.slice(1).filter(r => r[0]).length, 1); assert.strictEqual(env.wb.sheets['AWK03ATT'].data.slice(1).filter(r => r[0]).length, 7); });
const envFb = boot('2026-09-26T18:00:00Z', { auditItems: audit, failBatchGet: true }); envFb.wb.sheets = env.wb.sheets;
t('batchGet fallback parity', () => { const k = r => r.email + r.date + r.score + r.callStart; assert.strictEqual(JSON.stringify(envFb.ctx.getAttendanceRecordsForViewer(session(envFb,'admin@aps.org','admin'), {}).map(k)), JSON.stringify(env.ctx.getAttendanceRecordsForViewer(session(env,'admin@aps.org','admin'), {}).map(k))); });
t('teacher scope + mine', () => { const tt = session(env, 't1@aps.org', 'teacher'); assert.ok(env.ctx.getAttendanceRecordsForViewer(tt, {}).every(r => r.courseId === A && r.role === 'STUDENT' && r.editable)); assert.ok(env.ctx.getAttendanceRecordsForViewer(tt, { scope: 'mine' }).every(r => r.email === 't1@aps.org' && !r.editable)); });

// ================= always-excluded address + Script Property additions =================
env = boot('2026-09-26T18:00:00Z', { auditItems: audit, props: { ATTENDANCE_EXCLUDED_EMAILS: JSON.stringify(['s5@aps.org']) } }); seedCourses(env);
env.ctx.syncAttendanceForAllCourses();
t('vsugadev@ always excluded (any case); property adds more', () => {
  const all = env.ctx.getAttendanceRecordsForViewer(session(env, 'x@aps.org', 'headmaster'), {});
  assert.ok(!all.some(r => /vsugadev/i.test(r.email)), 'vsugadev present');
  assert.ok(!all.some(r => r.email === 's5@aps.org'), 's5 should be excluded by property');
  const s4 = all.find(r => r.email === 's4@aps.org' && r.date === '2026-09-26');
  assert.strictEqual(s4.actualClassMinutes, 90, 'excluded account must not stretch the call window'); assert.strictEqual(s4.callMinutes, 95);
  assert.ok(env.ctx.attIsExcludedEmail_('VSUGADEV@avvaiyarpadasalai.org'));
});

console.log('\nALL ' + passed + ' TESTS PASSED');

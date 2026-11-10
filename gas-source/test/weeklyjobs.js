// r117 — one hourly apsWeeklyJobs scheduler replaces the per-job weekly triggers (node test/weeklyjobs.js)
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { makeContext, Sheet } = require('./gasmock');
const tests = []; const t = (name, fn) => tests.push([name, fn]);
function fixedDate(iso) { let NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } static set(i) { NOW = new Date(i).getTime(); } static add(ms) { NOW += ms; } } return D; }
Sheet.prototype.getMaxRows = function () { return 5000; };
const D = fixedDate('2026-11-06T17:00:00Z'); // Fri Nov 6 2026, 12:00 PM EST — install day
const env = makeContext({ Date: D, props: { APS_ENVIRONMENT: 'LIVE' } });
vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), env.ctx, { filename: 'Code.gs' });
const G = env.ctx, J = x => JSON.parse(JSON.stringify(x));
const est = (ymd, hm) => { const [h, m] = hm.split(':').map(Number); return new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), h + 5, m)).toISOString(); }; // EST = UTC-5 in November
const ran = []; let failNext = {}, slow = 0;
const stub = (name, id) => { G[name] = function () { ran.push(id); if (failNext[id]) { failNext[id]--; throw new Error('boom ' + id + ' Bearer ya29.secret'); } if (slow) D.add(slow); return { ok: true }; }; };
stub('admcRun_', 'MULTIPLE_CLASSROOM_REPORT'); stub('mhgRun_', 'MISSING_GRADING_REPORT'); stub('saRun_', 'STUDENT_ABSENCE');
stub('ccwRunAnalysis_', 'CLASS_CONSOLIDATION_ANALYSIS'); stub('ccwRunEmail_', 'CLASS_CONSOLIDATION_EMAIL'); stub('apsPersonDataPrune_', 'PERSON_DATA_PRUNE'); // r119
G.taRun_ = (n, tr, by, o) => { ran.push(o && o.continueRun ? 'TA_CONTINUE:' + o.weekId : 'TEACHER_APPRECIATION'); return { ok: true, delivery: {} }; };
G.apsMaintenanceEnabled_ = () => true; G.apsSystemBackup_ = () => { ran.push('WEEKLY_MAINTENANCE'); return { name: 'b', files: [], errors: [] }; }; G.apsMaintenanceRecord_ = () => {}; G.apsAuditArchive_ = () => ({ moved: 0 });
let leaveDay = null; G.apsLeaveSkip_ = (area, d) => !!leaveDay && G.Utilities.formatDate(d, 'America/New_York', 'yyyy-MM-dd') === leaveDay;
const props = G.PropertiesService.getScriptProperties();
const at = (ymd, hm) => { D.set(est(ymd, hm)); ran.length = 0; const res = J(G.wjRun_(new D(), 'test', {})); return { ran: ran.slice(), res }; };
const fns = () => env.stats.triggers.map(x => x.fn);
const OLD = ['apsWeeklyMaintenance', 'apsWeeklyMultipleClassroomReport', 'apsMissingGradingWeekly', 'apsStudentAbsenceWeekly', 'apsClassConsolidationAnalysis', 'apsClassConsolidationEmail', 'apsTeacherAppreciationWeekly'];
const OTHER = ['apsDailyForceSync', 'apsDailyAttendanceSync', 'classroomRosterAutoSync', 'apsDailyMeetLinkAutoMap', 'sendWeeklyAttendanceReports', 'sendWeeklyClassTeacherAvailabilityReport', 'amScheduler', 'processTemporaryTeacherAssignments', 'apsCoverageCleanup',
  'ptaFridayHandler', 'ptaSaturdayHandler', 'ptaSundayHandler', 'apsDailySummaryPrep'];

t('migration at the 20-trigger limit: the 7 per-job weekly triggers are deleted FIRST, then one hourly apsWeeklyJobs is created; other triggers untouched; re-run safe', () => {
  env.stats.triggers.length = 0;
  OLD.concat(OTHER).forEach(fn => env.stats.triggers.push({ fn }));
  assert.strictEqual(env.stats.triggers.length, 20);
  const r = J(G.apsEnsureWeeklyJobsTrigger_());
  assert.deepStrictEqual(r, { removed: 7, created: true });
  assert.strictEqual(env.stats.triggers.length, 14, '20 → 14 (frees 6 slots)');
  assert.ok(OLD.every(f => fns().indexOf(f) === -1)); assert.ok(OTHER.every(f => fns().indexOf(f) > -1));
  const wj = env.stats.triggers.filter(x => x.fn === 'apsWeeklyJobs'); assert.strictEqual(wj.length, 1); assert.strictEqual(wj[0].everyHours, 1);
  assert.deepStrictEqual(J(G.apsEnsureWeeklyJobsTrigger_()), { removed: 0, created: false }); assert.strictEqual(env.stats.triggers.length, 14);
});
t('production list (19 triggers, screenshot 2026-11-06): the 4 old weekly triggers go, apsWeeklyJobs comes in → 16; all 15 others kept', () => {
  const PROD = ['apsClassConsolidationAnalysis', 'sendWeeklyAttendanceReports', 'classroomRosterAutoSync', 'apsPtaCoverageNotifySunday', 'apsPtaCoverageNotifyFriday', 'apsDailySummaryReport', 'apsWeeklyMaintenance', 'amScheduler', 'sendWeeklyClassTeacherAvailabilityReport', 'apsAttQuzMarkCompleteDaily', 'apsPtaCoverageNotifySaturday', 'apsStudentAbsenceWeekly', 'processTemporaryTeacherAssignments', 'apsMonthlySummaryReport', 'apsClassConsolidationEmail', 'apsDailyMeetLinkAutoMap', 'apsDailyForceSync', 'apsDailySummaryPrep', 'apsDailyAttendanceSync'];
  const saved = env.stats.triggers.splice(0); const st = props.getProperty('APS_WEEKLY_JOBS_STATE');
  PROD.forEach(fn => env.stats.triggers.push({ fn }));
  assert.deepStrictEqual(J(G.apsEnsureWeeklyJobsTrigger_()), { removed: 4, created: true });
  assert.strictEqual(env.stats.triggers.length, 16);
  PROD.filter(f => OLD.indexOf(f) === -1).forEach(f => assert.ok(fns().indexOf(f) > -1, f + ' kept'));
  env.stats.triggers.splice(0); saved.forEach(x => env.stats.triggers.push(x)); props.setProperty('APS_WEEKLY_JOBS_STATE', st);
});
t('first install marks this week\'s passed slots as done — nothing runs by surprise on the install day', () => {
  const st = JSON.parse(props.getProperty('APS_WEEKLY_JOBS_STATE'));
  assert.ok(Object.values(st.jobs).every(j => j.result === 'BASELINE'));
  assert.deepStrictEqual(at('2026-11-06', '13:10').ran, []);
  assert.deepStrictEqual(at('2026-11-07', '09:10').ran, [], 'Saturday: nothing');
});
t('each job runs in the first hourly check at or after its hour, once a week (Sun 2 · Mon 7 · Tue 8 · Wed 9 · Wed 19 analysis + appreciation · email ≥ 25 min after the analysis)', () => {
  assert.deepStrictEqual(at('2026-11-08', '01:40').ran, [], 'not yet');
  assert.deepStrictEqual(at('2026-11-08', '02:12').ran, ['WEEKLY_MAINTENANCE']);
  assert.deepStrictEqual(at('2026-11-08', '03:12').ran, ['PERSON_DATA_PRUNE'], 'maintenance once a week; r119 person-data prune at 3 AM');
  assert.deepStrictEqual(at('2026-11-09', '07:05').ran, ['MULTIPLE_CLASSROOM_REPORT']);
  assert.deepStrictEqual(at('2026-11-10', '07:55').ran, []);
  assert.deepStrictEqual(at('2026-11-10', '08:20').ran, ['MISSING_GRADING_REPORT']);
  assert.deepStrictEqual(at('2026-11-11', '09:41').ran, ['STUDENT_ABSENCE']);
  assert.deepStrictEqual(at('2026-11-11', '19:03').ran, ['CLASS_CONSOLIDATION_ANALYSIS', 'TEACHER_APPRECIATION'], 'email waits 25 min after the analysis');
  assert.deepStrictEqual(at('2026-11-11', '19:14').ran, []);
  assert.deepStrictEqual(at('2026-11-11', '20:03').ran, ['CLASS_CONSOLIDATION_EMAIL']);
  assert.deepStrictEqual(at('2026-11-11', '21:03').ran, []);
  assert.ok(G.SpreadsheetApp || true);
  const log = env.wb.sheets.APS_WEEKLY_JOBS_LOG.data.slice(1).filter(r => r && r[0]);
  assert.strictEqual(log.length, 8); assert.ok(log.every(r => /^OK/.test(r[3])));
});
t('a missed run is caught up within 24 hours, not later', () => {
  assert.deepStrictEqual(at('2026-11-16', '15:30').ran, ['MULTIPLE_CLASSROOM_REPORT'], 'Monday 7 AM missed → caught up in the afternoon');
  assert.deepStrictEqual(at('2026-11-18', '10:30').ran, ['STUDENT_ABSENCE']);
  // Tuesday 11/17 8 AM missed entirely (no check for more than 24 h) → skipped this week
  assert.deepStrictEqual(at('2026-11-18', '11:00').ran, [], 'Tuesday 8 AM + 24 h passed');
});
t('a failed job is retried on the next hourly checks (3 attempts), the error masked', () => {
  failNext.WEEKLY_MAINTENANCE = 0; failNext.MULTIPLE_CLASSROOM_REPORT = 5;
  assert.deepStrictEqual(at('2026-11-23', '07:10').ran, ['MULTIPLE_CLASSROOM_REPORT']);
  let st = JSON.parse(props.getProperty('APS_WEEKLY_JOBS_STATE')).jobs.MULTIPLE_CLASSROOM_REPORT;
  assert.strictEqual(st.result, 'ERROR'); assert.strictEqual(st.attempts, 1); assert.ok(!/ya29\.secret/.test(st.error));
  assert.deepStrictEqual(at('2026-11-23', '08:10').ran, ['MULTIPLE_CLASSROOM_REPORT']);
  assert.deepStrictEqual(at('2026-11-23', '09:10').ran, ['MULTIPLE_CLASSROOM_REPORT']);
  assert.deepStrictEqual(at('2026-11-23', '10:10').ran, [], 'gave up after 3 attempts');
  failNext = {};
});
t('school leave day: the job is recorded as SKIPPED_SCHOOL_LEAVE and not run (same guard as before)', () => {
  leaveDay = '2026-11-24';
  assert.deepStrictEqual(at('2026-11-24', '08:15').ran, []);
  assert.strictEqual(JSON.parse(props.getProperty('APS_WEEKLY_JOBS_STATE')).jobs.MISSING_GRADING_REPORT.result, 'SKIPPED_SCHOOL_LEAVE');
  assert.deepStrictEqual(at('2026-11-24', '09:15').ran, [], 'not retried');
  leaveDay = null;
});
t('time budget: after a long job no new job starts — the next due job runs on the next hourly check', () => {
  assert.deepStrictEqual(at('2026-11-25', '09:30').ran, ['STUDENT_ABSENCE']);
  slow = 90 * 1000;
  assert.deepStrictEqual(at('2026-11-25', '19:02').ran, ['CLASS_CONSOLIDATION_ANALYSIS'], 'appreciation waits');
  slow = 0;
  assert.deepStrictEqual(at('2026-11-25', '20:02').ran, ['TEACHER_APPRECIATION', 'CLASS_CONSOLIDATION_EMAIL']);
});
t('switch a job off / on with the old remove… / create… editor tools', () => {
  G.removeStudentAbsenceTrigger();
  assert.deepStrictEqual(at('2026-12-02', '09:30').ran, []);
  G.createStudentAbsenceTrigger();
  assert.deepStrictEqual(at('2026-12-02', '10:30').ran, ['STUDENT_ABSENCE']);
});
t('an old per-job trigger that still fires after the move does nothing and is removed; the scheduler handler only runs from its own trigger', () => {
  env.stats.triggers.push({ fn: 'apsTeacherAppreciationWeekly' });
  const gp = G.ScriptApp.getProjectTriggers; G.ScriptApp.getProjectTriggers = () => gp().map(x => Object.assign(x, { getUniqueId: () => 'uid-' + x.getHandlerFunction() }));
  try {
    ran.length = 0;
    assert.deepStrictEqual(J(G.apsTeacherAppreciationWeekly({ triggerUid: 'uid-apsTeacherAppreciationWeekly' })), { skipped: 'MOVED_TO_WEEKLY_JOBS' });
    assert.deepStrictEqual(ran, []); assert.strictEqual(fns().indexOf('apsTeacherAppreciationWeekly'), -1);
    assert.throws(() => G.apsWeeklyJobs({ triggerUid: 'forged' }), /Access denied/);
    D.set(est('2026-12-06', '02:20')); ran.length = 0; G.apsWeeklyJobs({ triggerUid: 'uid-apsWeeklyJobs' }); assert.deepStrictEqual(ran, ['WEEKLY_MAINTENANCE']);
  } finally { G.ScriptApp.getProjectTriggers = gp; }
});
t('Teacher Appreciation emails left pending (no slot for the one-time continuation trigger) are finished by the next hourly check', () => {
  props.setProperty('TEACHER_APPRECIATION_CONTINUE', 'WK-2026-11-27');
  assert.deepStrictEqual(at('2026-12-06', '05:10').ran, ['PERSON_DATA_PRUNE', 'TA_CONTINUE:WK-2026-11-27']);
  assert.strictEqual(props.getProperty('TEACHER_APPRECIATION_CONTINUE'), null);
});
t('status (Admin Control → Backup & Archive): every job, last run, next run, triggers used of 20', () => {
  D.set(est('2026-12-07', '12:00'));
  const s = J(G.wjStatus_(new D()));
  assert.strictEqual(s.installed, true); assert.strictEqual(s.limit, 20); assert.strictEqual(s.triggersUsed, 14);
  assert.strictEqual(s.jobs.length, 8);
  const m = s.jobs.find(j => j.id === 'WEEKLY_MAINTENANCE'); assert.strictEqual(m.lastResult, 'OK'); assert.strictEqual(m.next, '2026-12-13');
  assert.ok(s.jobs.find(j => j.id === 'CLASS_CONSOLIDATION_EMAIL').when.includes('after class consolidation analysis'));
  assert.ok(s.handlers.some(h => h.handler === 'apsWeeklyJobs'));
});
t('editor-only tools refuse web-app visitors', () => {
  env.stats.activeUser = '';
  ['createWeeklyJobsTrigger', 'weeklyJobsStatus'].forEach(f => assert.throws(() => G[f](), /Access denied/, f));
  assert.throws(() => G.runWeeklyJobNow('TEACHER_APPRECIATION'), /Access denied/);
  env.stats.activeUser = undefined;
  assert.throws(() => G.runWeeklyJobNow('NOPE'), /Unknown job/);
  ran.length = 0; G.runWeeklyJobNow('TEACHER_APPRECIATION'); assert.deepStrictEqual(ran, ['TEACHER_APPRECIATION']);
});

let fails = 0;
for (const [n, fn] of tests) { try { fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 6).join('\n   ')); } }
console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);

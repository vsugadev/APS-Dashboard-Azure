// r141 — fixed-time jobs on Azure's timetable. node test/azuretimed.js
const fs = require('fs'); const vm = require('vm'); const assert = require('assert'); const crypto = require('crypto');
const { makeContext } = require('./gasmock');
const SECRET = 'k'.repeat(64);
const env = makeContext({ props: { APS_ENVIRONMENT: 'LIVE', AZURE_BRIDGE_SECRET: SECRET } });
env.ctx.ContentService = env.ctx.ContentService || { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) };
env.ctx.Utilities.getUuid = () => crypto.randomUUID();
const H = ['apsDailyForceSync', 'apsDailyAttendanceSync', 'classroomRosterAutoSync', 'apsDailyMeetLinkAutoMap', 'sendWeeklyClassTeacherAvailabilityReport', 'apsAttQuzMarkCompleteDaily', 'apsDailySummaryPrep', 'apsDailySummaryReport', 'apsMonthlySummaryReport', 'apsPtaCoverageNotifyFriday', 'apsPtaCoverageNotifySaturday', 'apsPtaCoverageNotifySunday'];
const triggers = H.map((h) => ({ getHandlerFunction: () => h, getUniqueId: () => 'T-' + h }));
env.ctx.ScriptApp.getProjectTriggers = () => triggers; env.ctx.ScriptApp.deleteTrigger = () => {};
vm.runInContext(['Code.gs', 'PortalBridge.gs', 'AzureBridge.gs'].map(f => fs.readFileSync(__dirname + '/../' + f, 'utf8')).join('\n'), env.ctx, { filename: 'project.gs' });
const G = env.ctx; let passed = 0; const t = (n, fn) => { fn(); passed++; console.log('PASS', n); };
const ran = {}; G.syncClassroomData_ = () => { ran.sync = (ran.sync || 0) + 1; return {}; }; G.apsPropHealth_ = () => {};
G.syncAttendanceForAllCourses_ = () => { ran.att = (ran.att || 0) + 1; return {}; }; G.ctaRunScheduled_ = () => { ran.cta = (ran.cta || 0) + 1; return {}; };
G.dsMorning_ = () => { ran.ds = (ran.ds || 0) + 1; return {}; }; G.dsMigrateIfEvening_ = () => false; G.ptaRunWindow_ = () => { ran.pta = (ran.pta || 0) + 1; return {}; };
t('not listed: every trigger runs as before', () => {
  G.apsDailyForceSync({ triggerUid: 'T-apsDailyForceSync' }); G.sendWeeklyClassTeacherAvailabilityReport({ triggerUid: 'T-sendWeeklyClassTeacherAvailabilityReport' });
  G.apsDailySummaryReport({ triggerUid: 'T-apsDailySummaryReport' }); G.apsPtaCoverageNotifyFriday({ triggerUid: 'T-apsPtaCoverageNotifyFriday' });
  assert.deepStrictEqual(ran, { sync: 1, cta: 1, ds: 1, pta: 1 });
});
t('listed + Azure alive: all 12 triggers skip (ON_AZURE)', () => {
  env.props.APS_JOBS_ON_AZURE = H.join(','); env.props.APS_AZURE_JOB_LAST_processExamQuestionPaperAutoEmail = String(Date.now());
  H.forEach((h) => assert.deepStrictEqual(JSON.parse(JSON.stringify(G[h]({ triggerUid: 'T-' + h }))), { skipped: 'ON_AZURE' }, h));
  assert.deepStrictEqual(ran, { sync: 1, cta: 1, ds: 1, pta: 1 });
});
t('listed + Azure silent 31 min: the trigger runs it (take-over mark)', () => {
  env.props.APS_AZURE_JOB_LAST_processExamQuestionPaperAutoEmail = String(Date.now() - 31 * 60000);
  G.apsDailyForceSync({ triggerUid: 'T-apsDailyForceSync' }); assert.strictEqual(ran.sync, 2);
  assert.ok(Number(env.props.APS_AZURE_JOB_TAKEOVER_apsDailyForceSync) > Date.now() - 5000);
});
t('schedule: 12 jobs with hours from the settings; installed flags', () => {
  const s = G.azureBridgeJobSchedule_(); assert.strictEqual(s.jobs.length, 12); assert.ok(s.jobs.every((j) => j.installed));
  assert.strictEqual(s.jobs.find((j) => j.handler === 'apsDailySummaryPrep').hour, 6);
});
console.log('azuretimed: ' + passed + ' passed');

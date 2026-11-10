// r55: editor-only / trigger-only entry points refuse web-app visitors (node test/editoronly.js)
const assert = require('assert');
const { build } = require('./gradingfixture');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const F = build(); const { env, G } = F;
{ const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0); P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p; }
const GUARDED = ['syncClassroomData', 'syncAttendanceForAllCourses', 'sendWeeklyAttendanceReports', 'sendAttendanceReportPreviewToMe', 'createSyncTrigger',
  'createAttendanceSyncTrigger', 'apsOwnerReauthorizeAllScopes', 'checkExamQuestionPaperSetup', 'getUserCountryFlag'];
t('a web-app visitor (anonymous) is refused by every editor-only function', () => {
  env.stats.activeUser = '';
  GUARDED.forEach(fn => assert.throws(() => G[fn](), /Access denied/, fn));
});
t('another signed-in account (same domain) is refused too', () => {
  env.stats.activeUser = 'someone@avvaiyarpadasalai.org';
  GUARDED.forEach(fn => assert.throws(() => G[fn](), /Access denied/, fn));
});
t('a forged trigger event is refused', () => {
  env.stats.activeUser = '';
  assert.throws(() => G.syncClassroomData({ triggerUid: '12345' }), /Access denied/);
  assert.throws(() => G.syncAttendanceForAllCourses({ triggerUid: '12345' }), /Access denied/);
  assert.throws(() => G.sendWeeklyAttendanceReports({ triggerUid: '12345' }), /Access denied/);
});
t('the script owner in the editor can still run them', () => {
  env.stats.activeUser = 'owner@aps.org';
  assert.doesNotThrow(() => G.syncClassroomData());
  assert.doesNotThrow(() => G.syncAttendanceForAllCourses());
});
t('the dashboard Force Sync (Admin session) still works for a visitor-context call', () => {
  env.stats.activeUser = '';
  const fn = ['forceSyncNow', 'forceSync', 'forceSyncClassroomData'].find(n => typeof G[n] === 'function');
  assert.ok(fn, 'force sync endpoint exists');
  assert.doesNotThrow(() => G[fn](F.tok('admin@aps.org', 'admin')));
  assert.throws(() => G[fn](F.tok('joshua_aps3407@avvaiyarpadasalai.org', 'student')));
  assert.doesNotThrow(() => G.forceSyncAttendanceNow(F.tok('admin@aps.org', 'admin')), 'Sync Attendance Now');
  assert.throws(() => G.forceSyncAttendanceNow(F.tok('joshua_aps3407@avvaiyarpadasalai.org', 'student')));
  env.stats.activeUser = undefined;
});
console.log(pass + ' passed');

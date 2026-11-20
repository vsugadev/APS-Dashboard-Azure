// r137 — jobs on Azure's timetable + live class status for Azure. node test/azurejobs.js
// Real Code.gs + PortalBridge.gs + AzureBridge.gs in the Apps Script mock.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert'); const crypto = require('crypto');
const { makeContext } = require('./gasmock');
const SECRET = 'q'.repeat(64);
const env = makeContext({ props: { APS_ENVIRONMENT: 'LIVE', AZURE_BRIDGE_SECRET: SECRET } });
env.ctx.ContentService = env.ctx.ContentService || { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) };
env.ctx.Utilities.getUuid = () => crypto.randomUUID();
const triggers = ['amScheduler', 'apsWeeklyJobs', 'processTemporaryTeacherAssignments', 'apsCoverageCleanup', 'processExamQuestionPaperAutoEmail'].map((h) => ({ getHandlerFunction: () => h, getUniqueId: () => 'T-' + h }));
env.ctx.ScriptApp.getProjectTriggers = () => triggers; env.ctx.ScriptApp.deleteTrigger = () => {};
vm.runInContext(['Code.gs', 'PortalBridge.gs', 'AzureBridge.gs'].map(f => fs.readFileSync(__dirname + '/../' + f, 'utf8')).join('\n'), env.ctx, { filename: 'project.gs' });
const G = env.ctx; const J = x => JSON.parse(JSON.stringify(x));
let passed = 0; const t = (name, fn) => { fn(); passed++; console.log('PASS', name); };
const call = (payload) => { const p = JSON.stringify(payload), ts = String(Date.now()), nonce = crypto.randomUUID();
  return JSON.parse(G.doPost({ postData: { contents: JSON.stringify({ azure: 1, p, ts, nonce, sig: crypto.createHmac('sha256', SECRET).update(ts + '.' + nonce + '.' + p).digest('hex') }) } }).getContent()); };
let ran = {};
G.amSchedulerRun_ = () => { ran.am = (ran.am || 0) + 1; return { ok: 1 }; }; G.apsLeaveSkip_ = () => false;
G.wjRun_ = () => { ran.wj = (ran.wj || 0) + 1; return { ran: [] }; };
G.ttmProcess_ = () => { ran.ttm = (ran.ttm || 0) + 1; return {}; };
G.tccRunCleanup_ = () => { ran.tcc = (ran.tcc || 0) + 1; return {}; };

t('nothing listed: every trigger runs as before; Azure is refused (NOT_ON_AZURE)', () => {
  assert.deepStrictEqual(J(G.amScheduler({ triggerUid: 'T-amScheduler' })), { ok: 1 });
  G.apsWeeklyJobs({ triggerUid: 'T-apsWeeklyJobs' }); G.processTemporaryTeacherAssignments({ triggerUid: 'T-processTemporaryTeacherAssignments' }); G.apsCoverageCleanup({ triggerUid: 'T-apsCoverageCleanup' });
  assert.deepStrictEqual(ran, { am: 1, wj: 1, ttm: 1, tcc: 1 });
  assert.strictEqual(call({ action: 'job', v: 1, handler: 'amScheduler', runId: crypto.randomUUID() }).code, 'NOT_ON_AZURE');
});
t('listed: Azure runs each of the five; their triggers then skip; a stale Azure run lets the trigger take over', () => {
  env.props.APS_JOBS_ON_AZURE = 'amScheduler,apsWeeklyJobs,processTemporaryTeacherAssignments,apsCoverageCleanup';
  ran = {};
  for (const h of ['amScheduler', 'apsWeeklyJobs', 'processTemporaryTeacherAssignments', 'apsCoverageCleanup']) assert.ok(call({ action: 'job', v: 1, handler: h, runId: crypto.randomUUID() }).ok, h);
  assert.deepStrictEqual(ran, { am: 1, wj: 1, ttm: 1, tcc: 1 });
  for (const h of ['amScheduler', 'apsWeeklyJobs', 'processTemporaryTeacherAssignments', 'apsCoverageCleanup']) assert.deepStrictEqual(J(G[h]({ triggerUid: 'T-' + h })), { skipped: 'ON_AZURE' }, h);
  env.props.APS_AZURE_JOB_LAST_apsCoverageCleanup = String(Date.now() - 91 * 60000);
  G.apsCoverageCleanup({ triggerUid: 'T-apsCoverageCleanup' }); assert.strictEqual(ran.tcc, 2, 'cleanup taken over after 90 min without Azure');
});
t('cannot be faked: a browser call with azureJob, a fake trigger id, an unknown job, a bad signature', () => {
  assert.throws(() => G.amScheduler({ azureJob: 'abcdef1234' }), /Access denied/);
  assert.throws(() => G.amScheduler({ triggerUid: 'FAKE' }), /Access denied/);
  assert.strictEqual(call({ action: 'job', v: 1, handler: 'ONE_TIME_showAzureBridgeSecret', runId: crypto.randomUUID() }).code, 'BAD_REQUEST');
  const p = JSON.stringify({ action: 'job', v: 1, handler: 'amScheduler', runId: crypto.randomUUID() }), ts = String(Date.now()), nonce = crypto.randomUUID();
  assert.strictEqual(JSON.parse(G.doPost({ postData: { contents: JSON.stringify({ azure: 1, p, ts, nonce, sig: '0'.repeat(64) }) } }).getContent()).code, 'BAD_SIGNATURE');
  assert.strictEqual(G.AZURE_JOB_RUN_, null);
});
t('classLive answers; it stores nothing itself (only the snapshot\'s own throttled diagnostic, as on any visit)', () => {
  G.readAllCoursesFromCache_ = () => []; const strip = () => JSON.stringify(Object.keys(env.props).filter(k => k !== 'classMeetLiveDiagnostic').sort().map(k => [k, env.props[k]])); const before = strip();
  assert.deepStrictEqual(call({ action: 'classLive', v: 1 }).ok, true); assert.strictEqual(strip(), before);
});
console.log('\nALL ' + passed + ' AZURE JOBS / LIVE STATUS TESTS PASSED');

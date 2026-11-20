/** Phase 4 step 1 (v0.17.0): jobs on Azure's timetable — scheduler, lease, runner and the real Apps Script gate. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import crypto from 'crypto';
import { JobScheduler, MemoryJobStore, MssqlJobStore, bridgeJobRunner, parseJobList, JOB_CATALOG } from '../src/jobs/scheduler';

test('AZURE_JOBS: only known jobs, no duplicates; unknown names reported', () => {
  assert.deepEqual(parseJobList(' amScheduler, apsWeeklyJobs amScheduler,deleteEverything '), { on: ['amScheduler', 'apsWeeklyJobs'], unknown: ['deleteEverything'] });
  assert.deepEqual(parseJobList(''), { on: [], unknown: [] });
});

test('timetable: each enabled job once per interval; two instances never run the same slot; a running job is not started again; every run recorded', async () => {
  let now = 1_800_000_000_000; const store = new MemoryJobStore(); const runs: string[] = []; let release: () => void = () => {};
  const runner = async (h: string) => { runs.push(h); if (h === 'apsWeeklyJobs') await new Promise<void>((r) => { release = r; }); return { ok: true, summary: '{"sent":1}' }; };
  const a = new JobScheduler(['amScheduler', 'apsWeeklyJobs', 'processExamQuestionPaperAutoEmail'], store, runner, () => now, () => {});
  const b = new JobScheduler(['amScheduler', 'apsWeeklyJobs', 'processExamQuestionPaperAutoEmail'], store, runner, () => now, () => {});
  const s1 = await a.tick(), s2 = await b.tick();
  assert.deepEqual(s1.sort(), ['amScheduler', 'apsWeeklyJobs', 'processExamQuestionPaperAutoEmail']); assert.deepEqual(s2, [], 'the other instance does not run the same slot');
  await new Promise((r) => setImmediate(r));
  now += 5 * 60_000; const s3 = await a.tick(); assert.deepEqual(s3, ['processExamQuestionPaperAutoEmail'], 'only the 5-minute job is due');
  assert.equal(a.isRunning('apsWeeklyJobs'), true);
  now += 60 * 60_000; const s4 = await a.tick(); assert.ok(!s4.includes('apsWeeklyJobs'), 'still running → not started twice'); assert.ok(s4.includes('amScheduler'));
  release(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.ok(store.runs.length >= 4 && store.runs.every((r) => r.ok && r.summary === '{"sent":1}'));
  const c = new JobScheduler([], store, runner, () => now, () => {}); assert.deepEqual(await c.tick(), []);
  assert.equal(JOB_CATALOG.length, 5);
});

test('SQL: tables created once; the lease is one atomic statement; parameterised only', async () => {
  const qs: string[] = []; const req = () => { const r: any = { input: () => r, query: async (q: string) => { qs.push(q); return { recordset: [{ holder: 'h'.repeat(36), t: null }] }; } }; return r; };
  const s = new MssqlJobStore(async () => ({ request: req }) as any, { NVarChar: () => 0, Char: () => 0, DateTime2: () => 0, Bit: 0 } as any);
  assert.equal(await s.lease('amScheduler', 'h'.repeat(36), 1, 2), true); assert.equal(await s.lease('amScheduler', 'x'.repeat(36), 1, 2), false);
  await s.record({ handler: 'amScheduler', runId: 'r'.repeat(36), startedAt: 1, finishedAt: 2, ok: true, summary: "'); DROP TABLE x;--" }); assert.equal(await s.lastStarted('amScheduler'), 0);
  assert.equal(qs.filter((q) => /CREATE TABLE dbo\.job_run/.test(q)).length, 1);
  assert.ok(qs.some((q) => /UPDATE dbo\.job_lease WITH \(UPDLOCK, HOLDLOCK\)/.test(q))); assert.ok(qs.every((q) => !q.includes('DROP TABLE x')));
});

const GAS = path.resolve(__dirname, '..', '..', 'gas-source'); const have = fs.existsSync(path.join(GAS, 'AzureBridge.gs'));
const SECRET = 'j'.repeat(64), URL = 'https://script.google.com/macros/s/TEST/exec';
function appsScript(props: Record<string, string> = {}) {
  const { makeContext } = require(path.join(GAS, 'test', 'gasmock'));
  const env = makeContext({ props: { APS_ENVIRONMENT: 'LIVE', AZURE_BRIDGE_SECRET: SECRET, ...props } });
  env.ctx.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) };
  env.ctx.Utilities.getUuid = () => crypto.randomUUID();
  const triggers: any[] = [{ getHandlerFunction: () => 'amScheduler', getUniqueId: () => 'T-AM' }];
  env.ctx.ScriptApp.getProjectTriggers = () => triggers; env.ctx.ScriptApp.deleteTrigger = () => {};
  vm.runInContext(['Code.gs', 'PortalBridge.gs', 'AzureBridge.gs'].map((f) => fs.readFileSync(path.join(GAS, f), 'utf8')).join('\n'), env.ctx, { filename: 'project.gs' });
  const fetchImpl: any = async (_u: string, init: { body: string }) => { const t = env.ctx.doPost({ postData: { contents: init.body } }).getContent(); return { ok: true, status: 200, text: async () => t }; };
  return { env, G: env.ctx as any, fetchImpl };
}

test('Apps Script r137 (real code): Azure runs a listed job exactly as its trigger; a job not listed is refused; the trigger then skips; it takes over again when Azure misses the job; a browser cannot fake an Azure run', { skip: !have && 'gas-source not found' }, async () => {
  const A = appsScript(); const G = A.G; let runs = 0;
  G.amSchedulerRun_ = () => { runs++; return { teacherEmails: 2 }; };
  G.apsLeaveSkip_ = () => false;
  const run = bridgeJobRunner(URL, SECRET, A.fetchImpl, Date.now, async () => { await new Promise((r) => setImmediate(r)); });
  assert.deepEqual(await run('amScheduler', crypto.randomUUID()), { ok: false, summary: 'NOT_ON_AZURE — add it to Apps Script Script Property APS_JOBS_ON_AZURE' }); assert.equal(runs, 0);
  A.env.props.APS_JOBS_ON_AZURE = 'amScheduler, processExamQuestionPaperAutoEmail';
  assert.deepEqual(await run('amScheduler', crypto.randomUUID()), { ok: true, summary: '{"teacherEmails":2}' }); assert.equal(runs, 1);
  assert.ok(Number(A.env.props.APS_AZURE_JOB_LAST_amScheduler) > Date.now() - 5000, 'last Azure run recorded');
  // the Apps Script trigger now skips (no double run)
  assert.deepEqual(J(G.amScheduler({ triggerUid: 'T-AM' })), { skipped: 'ON_AZURE' }); assert.equal(runs, 1);
  // Azure missed it for longer than the fallback (180 min) → the trigger runs it again
  A.env.props.APS_AZURE_JOB_LAST_amScheduler = String(Date.now() - 181 * 60000);
  assert.deepEqual(J(G.amScheduler({ triggerUid: 'T-AM' })), { teacherEmails: 2 }); assert.equal(runs, 2);
  // not a real trigger, not Azure's run → refused as before
  assert.throws(() => G.amScheduler({ azureJob: 'abcdef12' }), /Access denied/); assert.throws(() => G.amScheduler({ triggerUid: 'FAKE' }), /Access denied/);
  // unlisted job names are refused at the bridge
  assert.equal((await run('deleteAllData', crypto.randomUUID())).summary, 'BAD_REQUEST');
  // a Promise-answering job (exam auto-email) is collected
  G.examQpTeacherCopyEmailRun_ = () => ({ pending: true }); G.examQpAutoRun_ = () => Promise.resolve({ sent: 4, remaining: 0 });
  assert.deepEqual(await run('processExamQuestionPaperAutoEmail', crypto.randomUUID()), { ok: true, summary: '{"sent":4,"remaining":0}' });
  assert.equal(G.AZURE_JOB_RUN_, null, 'the run marker is cleared');
});
function J(x: unknown) { return JSON.parse(JSON.stringify(x)); }

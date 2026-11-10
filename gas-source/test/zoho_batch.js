// r73: Zoho CRM Sync — batch mode (URL-length fix, batches, resumable jobs, continuation trigger, daily run, minimal API calls).
// node test/zoho_batch.js
const assert = require('assert');
const { setup } = require('./coveragefixture');
const { install } = require('./zohomock');
const J = x => JSON.parse(JSON.stringify(x));
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const sheet = (F, n) => { const s = F.env.wb.getSheetByName(n); return s ? s.getDataRange().getValues() : []; };
const zid = i => String(5725767000000000000n + BigInt(i * 1013)); // real-looking 19-digit Zoho ids
function prep(opts) {
  const F = setup(); const Z = install(F.env, opts); F.A = F.tok2.admin;
  const L = J(F.G.loadZohoSyncStudents(F.A)).rows.filter(r => !r.multiple);
  L.forEach((r, i) => Z.records.push({ id: zid(i), Student_APS_Email_Address: r.email, Grade: 'Nilai 1' })); // every student needs an update
  F.P = F.env.ctx.PropertiesService.getScriptProperties();
  return { F, Z, G: F.G, L };
}
const trig = F => F.env.stats.triggers.filter(x => x.fn === 'apsZohoSyncContinue');
const zohoUrls = Z => Z.requests.filter(r => /zohoapis/.test(r.url)).map(r => r.url);

t('the reported error: "Limit Exceeded: URLFetch URL Length" no longer happens — every Zoho URL stays under 2 KB, even with 19-digit ids', () => {
  const { F, Z, G, L } = prep();
  assert.ok(L.length > 300);
  const R = J(G.runZohoStudentSync(F.A, { all: true, confirmed: true, requestId: 'u1', batchSize: 100 }));
  assert.strictEqual(R.summary.errors, 0); assert.strictEqual(R.summary.updated, L.length);
  assert.ok(zohoUrls(Z).every(u => u.length <= 2000), 'longest URL ' + Math.max(...zohoUrls(Z).map(u => u.length)));
  assert.ok(Z.calls.ids > Math.ceil(L.length / 100), '100-record batches need two id reads each (URL limit)');
});
t('batch size 75 (default): one read-by-id + one update per batch; ≤75 records per update; whole school done; API calls reported', () => {
  const { F, Z, G, L } = prep();
  assert.strictEqual(J(G.getZohoSyncStatus(F.A)).batchSize, 75);
  const R = J(G.runZohoStudentSync(F.A, { all: true, confirmed: true, requestId: 'b1' }));
  const batches = Math.ceil((L.length + 1) / 75); // + the student in two classes (counted, never sent)
  assert.strictEqual(R.summary.batches, batches); assert.strictEqual(R.summary.batchSize, 75);
  assert.strictEqual(Z.calls.ids, batches, 'one read-by-id per batch'); assert.strictEqual(Z.calls.put, batches, 'one update per batch');
  assert.ok(Z.puts.every(p => p.data.length <= 75));
  assert.strictEqual(R.summary.apiCalls, Z.calls.list + Z.calls.ids + Z.calls.put + (Z.calls.search || 0) + Z.calls.modules + Z.calls.fields);
  assert.strictEqual(R.summary.updated, L.length); assert.strictEqual(R.inProgress, false);
  assert.strictEqual(Z.calls.token, 1, 'one OAuth sign-in for the whole run (token cached)');
});
t('nothing to change → no read-by-id and no update calls at all; Preview then Sync reuses the one Zoho list read', () => {
  const { F, Z, G, L } = prep();
  L.forEach((r, i) => Object.assign(Z.records[i], { Grade: r.grade, Google_Classroom_Full_Name: r.classroom, Teacher_Name: r.teacherName, Teacher_Email_Address: r.teacherEmail }));
  J(G.previewZohoStudentSync(F.A)); const lists = Z.calls.list;
  const R = J(G.runZohoStudentSync(F.A, { all: true, confirmed: true, requestId: 'n1' }));
  assert.strictEqual(Z.calls.list, lists, 'sync reused the preview read'); assert.strictEqual(Z.calls.ids, 0); assert.strictEqual(Z.calls.put, 0);
  assert.strictEqual(R.summary.noChange, L.length); assert.strictEqual(R.summary.apiCalls, 0);
});
t('page-driven job: start → steps (one batch each) with progress, never repeats or skips a student → DONE; trigger safety net set and removed', () => {
  const { F, Z, G, L } = prep();
  F.P.setProperty('ZOHO_SYNC_STEP_MS', '1');
  const s0 = J(G.startZohoSyncJob(F.A, { all: true, confirmed: true, batchSize: 50 })).job;
  assert.deepStrictEqual([s0.status, s0.processed, s0.batchSize, s0.batchesTotal], ['RUNNING', 0, 50, Math.ceil(s0.total / 50)]);
  assert.strictEqual(trig(F).length, 1, 'safety-net continuation trigger');
  assert.throws(() => G.startZohoSyncJob(F.A, { all: true, confirmed: true }), /already running/);
  const seen = {}; let steps = 0, d;
  do { d = J(G.stepZohoSyncJob(F.A)); steps++; d.rows.forEach(r => { assert.ok(!seen[r.email], 'twice: ' + r.email); seen[r.email] = 1; }); if (!d.done) { assert.strictEqual(d.job.processed, steps * 50); assert.strictEqual(trig(F).length, 1); } } while (!d.done && steps < 50);
  assert.strictEqual(d.job.status, 'DONE'); assert.strictEqual(Object.keys(seen).length, s0.total); assert.strictEqual(steps, s0.batchesTotal);
  assert.strictEqual(trig(F).length, 0, 'trigger removed when done');
  assert.strictEqual(d.job.totals.updated, L.length);
  const log = sheet(F, 'ZOHO_STUDENT_CONTACT_SYNC_LOG');
  assert.strictEqual(log.filter(r => r[17] === 'RUN' && /^Batch \d+ of \d+/.test(r[18])).length, s0.batchesTotal); assert.ok(log.some(r => /^Finished — /.test(r[18])));
  assert.strictEqual(J(G.getZohoSyncJob(F.A)).job.status, 'DONE');
});
t('page closed: the continuation trigger finishes the job on its own', () => {
  const { F, G, L } = prep();
  F.P.setProperty('ZOHO_SYNC_STEP_MS', '1');
  J(G.startZohoSyncJob(F.A, { all: true, confirmed: true, batchSize: 25 })); J(G.stepZohoSyncJob(F.A));
  G.apsZohoSyncContinue(); // trigger budget (4.5 min) is plenty here
  const j = J(G.getZohoSyncJob(F.A)).job; assert.strictEqual(j.status, 'DONE'); assert.strictEqual(j.totals.updated, L.length); assert.strictEqual(trig(F).length, 0);
});
t('cancel stops after the current batch (updated students stay updated); a stalled job is closed and a new one can start', () => {
  const { F, Z, G } = prep();
  F.P.setProperty('ZOHO_SYNC_STEP_MS', '1');
  J(G.startZohoSyncJob(F.A, { all: true, confirmed: true, batchSize: 25 })); J(G.stepZohoSyncJob(F.A));
  const c = J(G.cancelZohoSyncJob(F.A)).job; assert.strictEqual(c.status, 'CANCELLED'); assert.strictEqual(c.processed, 25); assert.strictEqual(trig(F).length, 0);
  const puts = Z.calls.put; const d = J(G.stepZohoSyncJob(F.A)); assert.ok(d.done); assert.strictEqual(Z.calls.put, puts, 'nothing after cancel');
  J(G.startZohoSyncJob(F.A, { all: true, confirmed: true, batchSize: 25 }));
  const job = JSON.parse(F.P.getProperty('ZOHO_SYNC_JOB')); job.updatedAtMs = Date.now() - 31 * 60000; F.P.setProperty('ZOHO_SYNC_JOB', JSON.stringify(job));
  assert.ok(J(G.getZohoSyncJob(F.A)).job.stale);
  assert.ok(J(G.startZohoSyncJob(F.A, { all: true, confirmed: true })).job.status === 'RUNNING', 'stale job does not block');
});
t('Sync Selected as a job: only the selected students (list kept in chunked properties, cleaned up after)', () => {
  const { F, Z, G, L } = prep();
  F.P.setProperty('ZOHO_SYNC_STEP_MS', '1');
  const pick = L.slice(10, 260).map(r => r.email); // 250 emails > one 8 KB property
  J(G.startZohoSyncJob(F.A, { emails: pick, confirmed: true, batchSize: 75 }));
  assert.ok(F.P.getProperty('ZOHO_SYNC_JOB_SEL_1'), 'stored in more than one property');
  let d; do { d = J(G.stepZohoSyncJob(F.A)); } while (!d.done);
  assert.strictEqual(d.job.processed, 250); assert.strictEqual(d.job.totals.updated, 250);
  assert.strictEqual([].concat(...Z.puts.map(p => p.data)).length, 250);
  assert.strictEqual(F.P.getProperty('ZOHO_SYNC_JOB_SEL_0'), null, 'selection cleaned up');
});
t('a failing batch marks only its students ERROR and the job goes on; repeated step failures end the job as FAILED', () => {
  const { F, Z, G } = prep();
  Z.failIds[zid(3)] = 'invalid data';
  const R = J(G.runZohoStudentSync(F.A, { all: true, confirmed: true, requestId: 'e1' }));
  assert.strictEqual(R.summary.errors, 1); assert.ok(R.summary.updated > 300);
  const P2 = prep(); P2.F.P.setProperty('ZOHO_SYNC_STEP_MS', '1');
  J(P2.G.startZohoSyncJob(P2.F.A, { all: true, confirmed: true }));
  P2.Z.tokenFails = true; P2.F.env.ctx.CacheService.getScriptCache().remove('aps_zoho_at_v1');
  for (let i = 0; i < 3; i++) J(P2.G.stepZohoSyncJob(P2.F.A));
  const j = J(P2.G.getZohoSyncJob(P2.F.A)).job; assert.strictEqual(j.status, 'FAILED'); assert.ok(/sign-in failed/.test(j.lastError));
});
t('daily schedule runs as a batch job (marked scheduled), keeps the last-run summary; non-admins cannot start / step / cancel', () => {
  const { F, G, L } = prep();
  J(G.saveZohoSyncSchedule(F.A, { enabled: true, hour: 6, minute: 0 }));
  G.apsZohoDailySync();
  const j = J(G.getZohoSyncJob(F.A)).job; assert.strictEqual(j.status, 'DONE'); assert.ok(j.scheduled); assert.strictEqual(j.op, 'SCHEDULED_SYNC_ALL'); assert.strictEqual(j.totals.updated, L.length);
  const last = J(G.getZohoSyncStatus(F.A)).schedule.last; assert.strictEqual(last.summary.updated, L.length); assert.strictEqual(last.jobId, j.id); assert.ok(last.batches >= 5);
  for (const k of ['hm', 'vp', 'teacher', 'student', 'bod']) for (const fn of ['startZohoSyncJob', 'stepZohoSyncJob', 'getZohoSyncJob', 'cancelZohoSyncJob']) assert.throws(() => G[fn](F.tok2[k], { all: true, confirmed: true }), /Only Admin|ACCESS_OFF/, k + ' ' + fn);
});
console.log(process.exitCode ? 'SOME ZOHO BATCH TESTS FAILED' : 'ALL ' + pass + ' ZOHO BATCH TESTS PASSED');

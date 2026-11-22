/** Phase 6 (v0.21.0): parallel-run kit — test group (server-side), test-run bar, difference reports, readiness. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { signInWithClaims, requireSession } from '../src/app/context';
import { MemoryFeedbackStore, MssqlFeedbackStore, readinessLines, parseParallelUsers, inParallelGroup, PR_NOT_IN_GROUP_MSG, PR_MAX_PER_DAY, type ReadinessFacts } from '../src/parallel/parallelRun';
import { buildRegistry } from '../src/server';
import { DashboardPage } from '../src/web/render';
import { testContext, testConfig } from './helpers';

const D = '@avvaiyarpadasalai.org';

test('test group: e-mails and role names; empty list = everyone', () => {
  const g = parseParallelUsers(' admin, Headmaster ; Priya_APS8001' + D + ' ');
  assert.deepEqual([...g.roles], ['admin', 'headmaster']); assert.deepEqual([...g.emails], ['priya_aps8001' + D]);
  assert.equal(inParallelGroup(testConfig(), 'anyone' + D, 'student'), true);
  const cfg = testConfig({ parallelRunUsers: 'admin, priya_aps8001' + D });
  assert.equal(inParallelGroup(cfg, 'x' + D, 'admin'), true); assert.equal(inParallelGroup(cfg, 'PRIYA_aps8001' + D, 'teacher'), true);
  assert.equal(inParallelGroup(cfg, 'kavi_aps8002' + D, 'teacher'), false);
});

test('test group is enforced on the SERVER: sign-in refused with a clear message; an existing session stops when the list changes', async () => {
  const ctx: any = testContext({ cfg: testConfig({ parallelRunUsers: 'admin, priya_aps8001' + D }) });
  const t = await signInWithClaims(ctx, { email: 'priya_aps8001' + D, email_verified: true }); assert.equal(t.ok, true);
  const a = await signInWithClaims(ctx, { email: 'admin' + D, email_verified: true }); assert.equal(a.ok, true);
  const k = await signInWithClaims(ctx, { email: 'kavi_aps8002' + D, email_verified: true });
  assert.deepEqual(k, { ok: false, code: 'invalid_token', message: PR_NOT_IN_GROUP_MSG });
  const s = await signInWithClaims(ctx, { email: 'meena_aps5555' + D, email_verified: true }); assert.equal(s.ok, false, 'a student not in the group');
  const tok = (t as any).token;
  assert.equal((await requireSession(ctx, tok)).email, 'priya_aps8001' + D);
  ctx.cfg = { ...ctx.cfg, parallelRunUsers: 'admin' };
  await assert.rejects(requireSession(ctx, tok), new RegExp(PR_NOT_IN_GROUP_MSG.slice(0, 30)));
  const reg = buildRegistry(); assert.deepEqual(await reg.call(ctx, 'getCurrentUser', [tok]), { err: PR_NOT_IN_GROUP_MSG });
});

test('Report a difference: session required; stored with who / role / screen; short text refused; 30 a day; no database → clear message', async () => {
  const ctx: any = testContext(); const reg = buildRegistry(); const store = new MemoryFeedbackStore();
  const tok = (await signInWithClaims(ctx, { email: 'priya_aps8001' + D, email_verified: true }) as any).token;
  assert.match(String((await reg.call(ctx, 'azureReportDifference', [tok, { text: 'The class card shows the wrong time.' }]) as any).err), /not available right now/);
  ctx.feedback = store;
  assert.match(String((await reg.call(ctx, 'azureReportDifference', ['nope', { text: 'x x x x x x' }]) as any).err), /session/i);
  assert.match(String((await reg.call(ctx, 'azureReportDifference', [tok, { text: 'hm' }]) as any).err), /describe the difference/);
  const r = await reg.call(ctx, 'azureReportDifference', [tok, { text: '  The class card shows the wrong time.\u0007 ', screen: 'Classes #classes', userAgent: 'UA', role: 'superadmin', email: 'fake' + D }]) as any;
  assert.deepEqual(r, { ok: { ok: true, id: 1 } });
  assert.equal(store.rows[0].email, 'priya_aps8001' + D); assert.equal(store.rows[0].role, 'teacher', 'role from the session, never from the browser');
  assert.equal(store.rows[0].text, 'The class card shows the wrong time.'); assert.equal(store.rows[0].screen, 'Classes #classes');
  for (let i = 1; i < PR_MAX_PER_DAY; i++) await reg.call(ctx, 'azureReportDifference', [tok, { text: 'difference number ' + i }]);
  assert.match(String((await reg.call(ctx, 'azureReportDifference', [tok, { text: 'one too many today' }]) as any).err), /30 reports today/);
  assert.equal(store.rows.length, PR_MAX_PER_DAY);
  assert.equal((await reg.call(ctx, 'azureReportDifference', [tok, { text: 'x'.repeat(5000) }]) as any).err !== undefined, true, 'over the daily limit');
});

test('page: the test-run bar is added only with PARALLEL_RUN=on; only an https official link is used; Dashboard.html otherwise unchanged', () => {
  const page = new DashboardPage(path.join(__dirname, '..', '..', 'public', 'Dashboard.html'));
  const base = { authUrl: '#', token: null, user: null, error: null };
  const off = page.render(base), on = page.render({ ...base, parallel: { officialUrl: 'https://script.google.com/macros/s/X/exec' } });
  assert.ok(!off.includes('aps-parallel.js'));
  assert.match(on, /<script src="\/aps-parallel\.js" defer data-official="https:\/\/script\.google\.com\/macros\/s\/X\/exec"><\/script>/);
  assert.match(page.render({ ...base, parallel: { officialUrl: 'javascript:alert(1)' } }), /data-official=""/);
  assert.equal(on.replace(/<script src="\/aps-parallel\.js"[^>]*><\/script>/, ''), off);
});

test('readiness: every module listed OK / CHECK with the fix; the test group and reporting are part of it', () => {
  const f: ReadinessFacts = { googleOk: true, bridgeOk: true, sessionsSql: true, chatReady: true, classLiveError: null, jobs: ['amScheduler'], timedJobs: ['apsDailyForceSync'], mailOk: true, mailJobs: ['MULTIPLE_CLASSROOM_REPORT'], mailJobsPreview: true, dbCopy: ['main'], dbReads: [], feedbackReady: true };
  const ready = readinessLines(testConfig({ scOwner: 'azure', chatOwner: 'azure', mailEnabled: true, parallelRunOn: true, parallelRunUsers: 'admin,headmaster,a' + D }), f);
  assert.ok(ready.every((l) => l.startsWith('OK')), ready.join('\n'));
  assert.ok(ready.some((l) => /Test group: admin, headmaster, 1 named person/.test(l)));
  const open = readinessLines(testConfig(), { ...f, googleOk: false, feedbackReady: false });
  assert.ok(open.some((l) => /^CHECK  Test group: EVERYONE can sign in — set PARALLEL_RUN_USERS/.test(l)));
  assert.ok(open.some((l) => /^CHECK  Google sign-in data/.test(l))); assert.ok(open.some((l) => /^CHECK  Test-run bar .* set PARALLEL_RUN=on/.test(l)));
});

test('SQL: reports table created once; parameterised insert', async () => {
  const qs: string[] = []; const req = () => { const r: any = { input: () => r, query: async (q: string) => { qs.push(q); return { recordset: [{ id: 7 }] }; } }; return r; };
  const s = new MssqlFeedbackStore(async () => ({ request: req }) as any, { NVarChar: () => 0, DateTime2: () => 0 } as any);
  assert.equal(await s.add({ at: 1, email: 'a' + D, role: 'teacher', screen: 's', text: "x'); DROP TABLE t;--", userAgent: '' }), 7);
  await s.add({ at: 1, email: 'a' + D, role: 'teacher', screen: 's', text: 'ok text', userAgent: '' });
  assert.equal(qs.filter((q) => /CREATE TABLE dbo\.parallel_feedback/.test(q)).length, 1); assert.ok(qs.every((q) => !q.includes('DROP TABLE t')));
});

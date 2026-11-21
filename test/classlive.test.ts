/** Phase 3 step 5 (v0.17.0): live Google Meet class status from Apps Script — source, runtime, and the real Code.gs action. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import crypto from 'crypto';
import { BridgeClassLive, applyClassLive } from '../src/live/classLive';
import { testContext, testConfig } from './helpers';
import { gasRun } from '../src/api/endpoints/classes';

const URL = 'https://script.google.com/macros/s/TEST/exec', SECRET = 'l'.repeat(64);
const ok = (result: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result }) });

test('one request per 30 s for the whole app; last answer kept 5 min when the bridge fails; bad entries dropped; logged at most every 5 min', async () => {
  let now = 1_800_000_000_000, calls = 0, mode = 'ok'; const logs: string[] = [];
  const f: any = async (_u: string, init: any) => { calls++; assert.equal(JSON.parse(JSON.parse(init.body).p).action, 'classLive');
    if (mode === 'down') return { ok: false, status: 503, text: async () => '' };
    return ok({ at: now, byCourse: { '101': { code: 'started', detail: { text: 'Teacher joined 6:31 PM · 2 students joined' }, inMeet: [{ e: 'Priya_aps8001@avvaiyarpadasalai.org', since: 'x' }] }, '102': { code: 'BAD CODE!' }, '103': null } }); };
  const s = new BridgeClassLive(URL, SECRET, f, () => now, (m) => logs.push(m));
  const a = await s.peek(); assert.ok(a); assert.deepEqual(Object.keys(a!.byCourse), ['101']); assert.equal(a!.byCourse['101'].inMeet[0].e, 'priya_aps8001@avvaiyarpadasalai.org');
  await s.peek(); await s.peek(); assert.equal(calls, 1, 'cached');
  mode = 'down'; now += 31_000; assert.ok(await s.peek(), 'stale answer while refreshing'); await new Promise((r) => setImmediate(r));
  now += 4 * 60_000; assert.ok(await s.peek(), 'kept up to 5 minutes');
  now += 2 * 60_000; await s.peek(); await new Promise((r) => setImmediate(r)); assert.equal(await s.peek(), null, 'then schedule-based status only');
  assert.equal(logs.length, 2, 'at most once per 5 minutes (the test spans 6)'); assert.match(logs[0], /live Google Meet status not available/); assert.ok(!logs[0].includes(SECRET));
});

test('applyClassLive: same contract as classMeetApplyLive_ — people in this class\'s Meet light up; others untouched', () => {
  const c: any = { id: '101', teachers: [{ email: 'priya_aps8001@avvaiyarpadasalai.org' }], students: [{ email: 'meena_aps5555@avvaiyarpadasalai.org' }] };
  const r = applyClassLive({ at: 1, byCourse: { '101': { code: 'started', detail: { text: 'T' }, inMeet: [{ e: 'priya_aps8001@avvaiyarpadasalai.org', since: '2026-11-20T23:31:00.000Z' }] } } }, c);
  assert.deepEqual(r, { code: 'started', detail: { text: 'T' } });
  assert.equal(c.teachers[0].inMeet, true); assert.equal(c.teachers[0].meetSince, '2026-11-20T23:31:00.000Z'); assert.equal(c.students[0].inMeet, undefined);
  assert.equal(applyClassLive({ at: 1, byCourse: {} }, c), null);
});

test('the copied applyClassStatus_ uses Apps Script\'s live result for today\'s class (label, colour, detail) and falls back without it', async () => {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  if (et.getHours() < 1 || et.getHours() >= 22) return; // the test class must sit inside today (ET)
  const day = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][et.getDay()];
  const fmt = (d: Date) => { let h = d.getHours() % 12; if (!h) h = 12; return h + ':' + String(d.getMinutes()).padStart(2, '0') + (d.getHours() < 12 ? ' AM' : ' PM'); };
  const name = `NILAI 3 - EF | ${day} ${fmt(new Date(et.getTime() - 10 * 60_000))} - ${fmt(new Date(et.getTime() + 60 * 60_000))} EST | AY26-27`;
  const course = () => [{ id: '777', name, courseState: 'ACTIVE', teachers: [{ email: 'priya_aps8001@avvaiyarpadasalai.org', name: 'Priya' }], students: [{ email: 'meena_aps5555@avvaiyarpadasalai.org', name: 'Meena' }] }];
  const ctx: any = testContext({ cfg: testConfig() });
  const detail = { text: 'Teacher joined 6:31 PM · 1 student joined', teacherJoined: true, studentsJoined: 1, liveNow: true, sources: ['Meet audit log'] };
  ctx.classLive = { peek: async () => ({ at: Date.now(), byCourse: { '777': { code: 'started', detail, inMeet: [{ e: 'meena_aps5555@avvaiyarpadasalai.org', since: 's' }] } } }) };
  const withLive: any = await gasRun(ctx, null, (S) => { const cs = course(); S.applyClassStatus_(cs); return cs[0]; });
  assert.equal(withLive.classStatus, 'started'); assert.deepEqual(withLive.classMeetDetail, detail); assert.equal(withLive.students[0].inMeet, true);
  assert.ok(withLive.classStatusLabel && withLive.classStatusColorCategory, 'Code.gs label + colour');
  ctx.classLive = { peek: async () => null };
  const without: any = await gasRun(ctx, null, (S) => { const cs = course(); S.applyClassStatus_(cs); return cs[0]; });
  assert.equal(without.classMeetDetail && without.classMeetDetail.statusUnknown, true, 'v0.18.0: "not known", as Apps Script when its Meet check cannot see a class');
  assert.match(String(without.classMeetDetail.text), /Live Google Meet status not available|not started|ended|No Google Meet activity/); assert.notEqual(without.students[0].inMeet, true);
});

const GAS = path.resolve(__dirname, '..', '..', 'gas-source'); const have = fs.existsSync(path.join(GAS, 'AzureBridge.gs'));
test('AzureBridge.gs r137 classLive (real code, signed): per class the classMeetApplyLive_ result + who is in Meet; manual Cancelled skipped; nothing written', { skip: !have && 'gas-source not found' }, () => {
  const { makeContext } = require(path.join(GAS, 'test', 'gasmock'));
  const env = makeContext({ props: { APS_ENVIRONMENT: 'LIVE', AZURE_BRIDGE_SECRET: SECRET } });
  env.ctx.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) };
  vm.runInContext(['Code.gs', 'PortalBridge.gs', 'AzureBridge.gs'].map((f) => fs.readFileSync(path.join(GAS, f), 'utf8')).join('\n'), env.ctx, { filename: 'project.gs' });
  const G: any = env.ctx;
  G.readAllCoursesFromCache_ = () => [{ id: '1', name: 'A', teachers: [{ email: 'T1@x.org' }], students: [{ email: 's1@x.org' }] }, { id: '2', name: 'B', teachers: [], students: [] }, { id: '3', name: 'C', teachers: [], students: [] }];
  G.classMeetLiveSnapshot_ = (_c: unknown, _n: Date, force: boolean) => { assert.equal(force, false, 'never forced'); return { at: 123, byCourse: {} }; };
  G.computeAutomaticClassStatus_ = () => ({ scheduledStartIso: '2026-11-20T23:30:00.000Z' });
  G.getClassStatusOverrideMap_ = () => ({ '3': { status: 'cancelled' } });
  G.classMeetApplyLive_ = (c: any, _s: unknown, _n: Date, _snap: unknown, _cache: unknown, started: any) => { started.x = 1; if (c.id !== '1') return null; c.teachers[0].inMeet = true; c.teachers[0].meetSince = 'since'; return { code: 'started', detail: { text: 'T' } }; };
  const before = JSON.stringify(env.props);
  const p = JSON.stringify({ action: 'classLive', v: 1 }), ts = String(Date.now()), nonce = crypto.randomUUID();
  const r = JSON.parse(G.doPost({ postData: { contents: JSON.stringify({ azure: 1, p, ts, nonce, sig: crypto.createHmac('sha256', SECRET).update(ts + '.' + nonce + '.' + p).digest('hex') }) } }).getContent());
  assert.deepEqual(r, { ok: true, result: { at: 123, byCourse: { '1': { code: 'started', detail: { text: 'T' }, inMeet: [{ e: 't1@x.org', since: 'since' }] } } } });
  assert.equal(JSON.stringify(env.props), before, 'no property written');
});

test('settings copy in Azure SQL: saved at most once a minute after a good snapshot; after a restart with the bridge down Azure starts from it (≤ 30 min), never older', async () => {
  const { AppsScriptLiveSource } = await import('../src/live/liveSource');
  const { MemoryLiveMirror, MssqlLiveMirror } = await import('../src/db/liveMirror');
  let now = 1_800_000_000_000, mode = 'ok'; const m = new MemoryLiveMirror();
  const f: any = async () => mode === 'ok' ? ok({ script: { presenceMap: '{"a@x":{}}', SECRET_X: 'never' }, user: {} }) : { ok: false, status: 503, text: async () => '' };
  const a = new AppsScriptLiveSource(URL, SECRET, f, () => now).useMirror(m);
  await a.get(); await new Promise((r) => setImmediate(r)); assert.equal(m.saves, 1);
  assert.ok(!JSON.stringify(m.copy).includes('never'), 'only the allow-listed snapshot is stored');
  now += 25_000; await a.get(); await new Promise((r) => setImmediate(r)); assert.equal(m.saves, 1, 'not more than once a minute');
  now += 40_000; await a.get(); await new Promise((r) => setImmediate(r)); assert.equal(m.saves, 2);
  mode = 'down'; now += 20 * 60_000;
  const restarted = new AppsScriptLiveSource(URL, SECRET, f, () => now).useMirror(m);
  assert.equal((await restarted.get()).script.presenceMap, '{"a@x":{}}', 'from the copy');
  const old = new AppsScriptLiveSource(URL, SECRET, f, () => now + 15 * 60_000).useMirror(m);
  assert.deepEqual(await old.get(), { script: {}, user: {} }, 'a copy older than 30 minutes is not used');
  const qs: string[] = []; const req = () => { const r: any = { input: () => r, query: async (q: string) => { qs.push(q); return { recordset: [] }; } }; return r; };
  const sqlM = new MssqlLiveMirror(async () => ({ request: req }) as any, { NVarChar: () => 0, MAX: 0, DateTime2: () => 0 } as any);
  await sqlM.save({ script: { k: 'v' }, user: {} }, 1); assert.equal(await sqlM.load(), null);
  assert.equal(qs.filter((q) => /CREATE TABLE dbo\.live_props/.test(q)).length, 1); assert.ok(qs.every((q) => !q.includes("'v'")));
});

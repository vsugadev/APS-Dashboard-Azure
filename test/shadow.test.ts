/** v0.22.0: shadow comparison of real requests — Apps Script vs Azure (parallel run). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import crypto from 'crypto';
import { SHADOW_FNS, diffJson, pathPattern, ShadowComparer, MemoryShadowStore, MssqlShadowStore, bridgeAppsScriptRunner, type AppsScriptRunner } from '../src/parallel/shadow';
import { buildRegistry } from '../src/server';
import { signInWithClaims } from '../src/app/context';
import { testContext, testConfig } from './helpers';

const GAS = path.resolve(__dirname, '..', '..', 'gas-source'); const have = fs.existsSync(path.join(GAS, 'AzureBridge.gs'));
const D = '@avvaiyarpadasalai.org';

test('lists: Azure SHADOW_FNS = Apps Script AZURE_BRIDGE_SHADOW_; every one is answered by Azure itself; the main screen and cache/trigger writers are not included', { skip: !have && 'gas-source not found' }, () => {
  const src = fs.readFileSync(path.join(GAS, 'AzureBridge.gs'), 'utf8');
  const m = /var AZURE_BRIDGE_SHADOW_ = (\[[\s\S]*?\]);/.exec(src)!; const gas = vm.runInNewContext(m[1]) as string[];
  assert.deepEqual([...gas].sort(), [...SHADOW_FNS].sort());
  const reg = buildRegistry(); for (const f of SHADOW_FNS) assert.ok(reg.has(f), f);
  const { WRITE_THROUGH, READ_THROUGH } = require('../src/api/endpoints/writes');
  for (const f of SHADOW_FNS) assert.ok(WRITE_THROUGH.indexOf(f) < 0 && READ_THROUGH.indexOf(f) < 0, f + ' must be answered by Azure itself, not passed through');
  for (const f of ['getDashboardData', 'getRealtimeStatusSnapshot', 'getDirectoryIndex', 'getDashboardRolePermissions', 'getClassTeacherAvailabilityView']) assert.ok(SHADOW_FNS.indexOf(f) < 0, f);
});

test('guard: no shadow function reaches a Code.gs writer (transitively) other than idempotent sheet creation / the attendance diagnostic', { skip: !have && 'gas-source not found' }, () => {
  const src = fs.readFileSync(path.join(GAS, 'Code.gs'), 'utf8');
  const defs: Record<string, string> = {}; const re = /^function ([A-Za-z_$][\w$]*)\s*\(/gm; const starts: [string, number][] = []; let m;
  while ((m = re.exec(src))) starts.push([m[1], m.index]);
  starts.forEach(([n, i], k) => { defs[n] = src.slice(i, k + 1 < starts.length ? starts[k + 1][1] : src.length); });
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const WRITE = /\.setProperty\(|\.setProperties\(|\.deleteProperty\(|\.setValue\(|\.setValues\(|\.appendRow\(|\.deleteRow|\.insertSheet\(|\.clear\(|\.clearContents\(|MailApp\.|GmailApp\.|apsGmailSend_\(|UrlFetchApp\.fetch|Classroom\.[A-Z]\w*\.(create|patch|delete|update|modify)|DriveApp\.create|\.createFile\(|ScriptApp\.newTrigger|ScriptApp\.deleteTrigger|\.setSharing|apsBigSet_\(|\.insertRow|deleteSheet/;
  const BENIGN = /^(getWorkbook_|logAttendanceSyncDiagnostic_|ensureSheetHeader_|rosterSheet_|ctaSheet_|slSheet_|scSheet_|scEnrSheet_|tkSheet_|zhSheet_|ucSheet_|examQpSheet_|getOrCreate\w*Sheet_)$/;
  const closure = (f: string, seen = new Set<string>()): Set<string> => { if (seen.has(f)) return seen; seen.add(f); for (const id of new Set(strip(defs[f] || '').match(/(?<![.\w$])[A-Za-z_$][\w$]*(?=\s*\()/g) || [])) if (defs[id]) closure(id, seen); return seen; };
  for (const f of SHADOW_FNS) {
    assert.ok(defs[f], f + ' not in Code.gs');
    const bad = [...closure(f)].filter((x) => WRITE.test(strip(defs[x])) && !BENIGN.test(x));
    assert.deepEqual(bad, [], f + ' reaches a writer');
  }
});

test('diffJson: same → none; values / types / lengths / keys reported as PATHS only; volatile keys and SHADOW_IGNORE skipped', () => {
  assert.deepEqual(diffJson({ a: [1, { b: 'x' }], generatedAt: 1 }, { a: [1, { b: 'x' }], generatedAt: 2 }), []);
  const d = diffJson({ rows: [{ s: 'OPEN', e: 'a@x' }, { s: 'OPEN' }], n: 2, only: 1 }, { rows: [{ s: 'CLOSED', e: 'a@x' }], n: '2', other: 1 });
  assert.deepEqual(d, [{ path: '$.rows', kind: 'length 2≠1' }, { path: '$.rows[0].s', kind: 'value' }, { path: '$.n', kind: 'type number≠string' }, { path: '$.only', kind: 'only in Apps Script' }, { path: '$.other', kind: 'only in Azure' }]);
  assert.ok(!JSON.stringify(d).includes('OPEN'), 'no values');
  assert.deepEqual(diffJson({ a: 1, b: 2 }, { a: 9, b: 2 }, /^\$\.a$/), []);
  assert.equal(pathPattern('$.rows[12].x[3]'), '$.rows[*].x[*]');
});

function setup(gas: AppsScriptRunner, opts: Partial<{ samplePct: number; dailyCap: number }> = {}) {
  const ctx: any = testContext(); const reg = buildRegistry(); const store = new MemoryShadowStore(); const logs: string[] = []; let now = 1_800_000_000_000; const slept: number[] = [];
  const sc = new ShadowComparer(reg, gas, store, { samplePct: 100, dailyCap: 400, ignore: null, ...opts }, () => now, () => 0, async (ms) => { slept.push(ms); now += ms; }, (m) => logs.push(m));
  return { ctx, reg, store, logs, sc, slept, tick: (ms: number) => { now += ms; } };
}

test('compare: MATCH; a persisting difference is confirmed after 90 s and logged with paths; a timing difference that disappears is a MATCH; one side failing is an ERROR', async () => {
  const value = { list: [{ id: 1, status: 'OPEN' }] };
  const s = setup(async () => ({ ok: value }));
  const tok = (await signInWithClaims(s.ctx, { email: 'admin' + D, email_verified: true }) as any).token;
  const r1 = await s.sc.compare(s.ctx, 'getKnowledgeBaseVideos', [tok], { ok: value }, 12);
  assert.equal(r1!.result, 'MATCH'); assert.equal(r1!.role, 'admin'); assert.equal(s.slept.length, 0);

  let calls = 0; const s2 = setup(async () => { calls++; return { ok: { list: [{ id: 1, status: 'CLOSED' }] } }; });
  const tok2 = (await signInWithClaims(s2.ctx, { email: 'admin' + D, email_verified: true }) as any).token;
  const az = await s2.reg.call(s2.ctx, 'getKnowledgeBaseVideos', [tok2]);
  const r2 = await s2.sc.compare(s2.ctx, 'getKnowledgeBaseVideos', [tok2], az, 5);
  assert.equal(r2!.result, 'DIFFERENT'); assert.deepEqual(s2.slept, [90_000]); assert.equal(calls, 2); assert.match(r2!.note, /confirmed after 90 s/);
  assert.match(s2.logs.join('\n'), /\[Shadow\] getKnowledgeBaseVideos \(admin\): DIFFERENT/); assert.equal(s2.store.rows.length, 1);

  let n = 0; const s3 = setup(async () => (++n === 1 ? { ok: { x: 1 } } : { ok: null }));
  const tok3 = (await signInWithClaims(s3.ctx, { email: 'admin' + D, email_verified: true }) as any).token;
  const r3 = await s3.sc.compare(s3.ctx, 'getShowContactPhone', [tok3], await s3.reg.call(s3.ctx, 'getShowContactPhone', [tok3]), 3);
  const azAgain = (await s3.reg.call(s3.ctx, 'getShowContactPhone', [tok3]) as any).ok;
  assert.equal(r3!.result, JSON.stringify(azAgain) === 'null' ? 'MATCH' : 'DIFFERENT');

  const s4 = setup(async () => ({ err: 'Only Admin can view this, a@b.org' }));
  const tok4 = (await signInWithClaims(s4.ctx, { email: 'admin' + D, email_verified: true }) as any).token;
  const r4 = await s4.sc.compare(s4.ctx, 'getKnowledgeBaseVideos', [tok4], { ok: [] }, 3);
  assert.equal(r4!.result, 'ERROR'); assert.match(r4!.note, /Apps Script: Only Admin can view this, <email>/);
  const r5 = await setup(async () => ({ err: 'same' })).sc.compare(s4.ctx, 'x', [tok4], { err: 'same' }, 1); assert.equal(r5!.result, 'MATCH');
});

test('observe: only shadow functions, only signed-in calls, sampled, 1 per function per 2 min, 2 at a time, daily cap — never blocks the answer', async () => {
  let gasCalls = 0; let release: () => void = () => {};
  const s = setup(async () => { gasCalls++; await new Promise<void>((r) => { release = r; }); return { ok: null }; }, { dailyCap: 3 });
  const tok = (await signInWithClaims(s.ctx, { email: 'admin' + D, email_verified: true }) as any).token;
  s.sc.observe(s.ctx, 'saveAccessControl', [tok], { ok: 1 }, 1); s.sc.observe(s.ctx, 'getDashboardData', [tok], { ok: 1 }, 1);
  s.sc.observe(s.ctx, 'getKnowledgeBaseVideos', [], { ok: 1 }, 1);
  await new Promise((r) => setImmediate(r)); assert.equal(gasCalls, 0);
  s.sc.observe(s.ctx, 'getKnowledgeBaseVideos', [tok], { ok: null }, 1); s.sc.observe(s.ctx, 'getKnowledgeBaseVideos', [tok], { ok: null }, 1);
  s.sc.observe(s.ctx, 'getShowContactPhone', [tok], { ok: null }, 1); s.sc.observe(s.ctx, 'getCourseNameSuffix', [tok], { ok: null }, 1);
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  assert.equal(gasCalls, 2, 'one per function, at most 2 at a time'); release(); release();
  const off = setup(async () => { gasCalls++; return { ok: null }; }, { samplePct: 0 }); off.sc.observe(off.ctx, 'getKnowledgeBaseVideos', [tok], { ok: null }, 1);
  await new Promise((r) => setImmediate(r)); assert.equal(gasCalls, 2, 'SHADOW_SAMPLE 0 = off');
});

test('real Apps Script (r140): a shadow call runs only listed functions and only with shadow:true; Azure and Apps Script answers compared end to end', { skip: !have && 'gas-source not found' }, async () => {
  const SECRET = 's'.repeat(64);
  const { makeContext } = require(path.join(GAS, 'test', 'gasmock'));
  const env = makeContext({ props: { APS_ENVIRONMENT: 'LIVE', AZURE_BRIDGE_SECRET: SECRET } });
  env.ctx.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) };
  env.ctx.Utilities.getUuid = () => crypto.randomUUID(); env.ctx.ScriptApp.getProjectTriggers = () => [];
  vm.runInContext(['Code.gs', 'PortalBridge.gs', 'AzureBridge.gs'].map((f) => fs.readFileSync(path.join(GAS, f), 'utf8')).join('\n'), env.ctx, { filename: 'project.gs' });
  const fetchImpl: any = async (_u: string, init: { body: string }) => { const t = env.ctx.doPost({ postData: { contents: init.body } }).getContent(); return { ok: true, status: 200, text: async () => t, json: async () => JSON.parse(t) }; };
  const run = bridgeAppsScriptRunner('https://script.google.com/macros/s/T/exec', SECRET, fetchImpl);
  const g = await run('getKnowledgeBaseVideos', [], 'admin' + D);
  assert.ok('ok' in g, JSON.stringify(g));
  const { bridgeCall } = require('../src/live/liveSource');
  await assert.rejects(bridgeCall('https://script.google.com/macros/s/T/exec', SECRET, { action: 'call', v: 1, fn: 'getKnowledgeBaseVideos', args: [], email: 'admin' + D }, fetchImpl), /BAD_REQUEST/, 'not without shadow:true');
  assert.deepEqual(await run('getDashboardData', [], 'admin' + D), { err: 'BRIDGE BAD_REQUEST' }, 'not a shadow function');
  // same input on both sides
  const ctx: any = testContext({ cfg: testConfig() }); const reg = buildRegistry(); const store = new MemoryShadowStore();
  const sc = new ShadowComparer(reg, run, store, { samplePct: 100, dailyCap: 10, ignore: null }, Date.now, () => 0, async () => {}, () => {});
  const tok = (await signInWithClaims(ctx, { email: 'admin' + D, email_verified: true }) as any).token;
  const rec = await sc.compare(ctx, 'getKnowledgeBaseVideos', [tok], await reg.call(ctx, 'getKnowledgeBaseVideos', [tok]), 1);
  assert.equal(rec!.result, 'MATCH', JSON.stringify(rec));
});

test('SQL: table created once; parameterised; paths stored, never values', async () => {
  const qs: string[] = []; const req = () => { const r: any = { input: () => r, query: async (q: string) => { qs.push(q); return { recordset: [] }; } }; return r; };
  const s = new MssqlShadowStore(async () => ({ request: req }) as any, { NVarChar: () => 0, VarChar: () => 0, DateTime2: () => 0, Int: 0 } as any);
  const rec = { at: 1, fn: "x'); DROP TABLE y;--", email: 'a' + D, role: 'admin', result: 'MATCH' as const, azureMs: 1, gasMs: 2, diffs: 0, paths: [], note: '' };
  await s.add(rec); await s.add(rec);
  assert.equal(qs.filter((q) => /CREATE TABLE dbo\.shadow_compare/.test(q)).length, 1); assert.ok(qs.every((q) => !q.includes('DROP TABLE y')));
});

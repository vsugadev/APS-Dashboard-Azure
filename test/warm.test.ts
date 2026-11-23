/** v0.24.1 performance: people first at the Google gate, remembered screen needs survive restarts, one background warm-up. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiGate, inBackground, isBackground } from '../src/google/apiGate';
import { backgroundSource } from '../src/data/background';
import { buildRegistry } from '../src/server';
import { signInWithClaims } from '../src/app/context';
import { forgetLearned, learnedFor, learnedSnapshot, learnedVersion, loadLearned, learnedSheets, runStats } from '../src/gas/run';
import { LearnedPersistence, MemoryAppState, MssqlAppState, LEARNED_ROW, warmUp } from '../src/gas/learnedStore';
import { PerfMonitor } from '../src/api/perf';
import { testContext } from './helpers';

const D = '@avvaiyarpadasalai.org';
const tick = () => new Promise((r) => setImmediate(r));

test('gate: a person waiting is served before any waiting background job; background never holds more than 2 slots', async () => {
  const g = new ApiGate(1000, 4, 1, Date.now, async () => {}, () => {});
  const order: string[] = []; let bgRunning = 0, bgPeak = 0;
  const gates: (() => void)[] = [];
  const hold = (name: string, bg: boolean) => {
    const run = () => g.run(async () => { order.push(name); if (bg) { bgRunning++; bgPeak = Math.max(bgPeak, bgRunning); } await new Promise<void>((r) => gates.push(r)); if (bg) bgRunning--; });
    return bg ? inBackground(run) : run();
  };
  const all = [hold('bg1', true), hold('bg2', true), hold('bg3', true), hold('bg4', true)];
  await tick(); await tick();
  assert.deepEqual(order, ['bg1', 'bg2'], 'background takes at most 2 of the 4 slots');
  all.push(hold('p1', false), hold('p2', false), hold('p3', false));
  await tick(); await tick();
  assert.deepEqual(order.slice(2), ['p1', 'p2'], 'people use the free slots at once');
  gates.shift()!(); await tick(); await tick(); await tick();
  assert.equal(order[4], 'p3', 'a waiting person goes before the waiting background jobs');
  while (order.length < 7 || gates.length) { const r = gates.shift(); if (r) r(); await tick(); }
  await Promise.all(all);
  assert.ok(bgPeak <= 2);
});

test('gate: background leaves 15 calls of every minute for people', async () => {
  let now = 0; const slept: number[] = [];
  const g = new ApiGate(20, 4, 1, () => now, async (ms) => { slept.push(ms); now += ms; }, () => {});
  for (let i = 0; i < 5; i++) await inBackground(() => g.run(async () => 1));
  assert.equal(slept.length, 0);
  await inBackground(() => g.run(async () => 1));
  assert.ok(slept.some((s) => s >= 59_000), 'the 6th background call (20 − 15 = 5 a minute) waited');
  const before = slept.length; now += 1; for (let i = 0; i < 10; i++) await g.run(async () => 1);
  assert.equal(slept.length, before, 'people still had their calls');
  assert.match(g.takeStats(), /^Google Sheets calls: 10 for people \(waited 0\.0 s in total\), 6 background/);
});

test('backgroundSource: the same answers, every read marked as background (copies, reconciliation, warm-up)', async () => {
  const seen: boolean[] = [];
  const src: any = { readSheets: async () => { seen.push(isBackground()); return { timeZone: 'X', sheets: {}, titles: [] }; }, invalidate() { seen.push(isBackground()); return 'sync'; } };
  const bg = backgroundSource(src);
  assert.deepEqual(await bg.readSheets('main', []), { timeZone: 'X', sheets: {}, titles: [] });
  assert.equal((bg as any).invalidate(), 'sync', 'non-read methods unchanged');
  assert.deepEqual(seen, [true, false]); assert.equal(isBackground(), false);
});

test('copies and reconciliation read through the background lane (start.ts)', () => {
  const s = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', 'db', 'start.ts'), 'utf8');
  assert.equal((s.match(/new SheetSync\(backgroundSource\(db\.innerSource\(\)\)/g) || []).length, 2);
  assert.match(s, /new Reconciler\(backgroundSource\(db\.innerSource\(\)\)/);
  assert.doesNotMatch(s.replace(/backgroundSource\(db\.innerSource\(\)\)/g, ''), /db\.innerSource\(\)/);
});

test('remembered screen needs: saved only when changed, restored after a restart → the first run after a deploy needs no re-runs', async () => {
  forgetLearned();
  const ctx: any = testContext(); const reg = buildRegistry(); const st = new MemoryAppState(); const logs: string[] = [];
  const lp = new LearnedPersistence(st, (m) => logs.push(m));
  assert.equal(await lp.load(), 0);
  assert.equal(await lp.save(), false, 'nothing learned yet → nothing written');
  const tok = (await signInWithClaims(ctx, { email: 'admin' + D, email_verified: true }) as any).token;
  const first = runStats.attempts; const r1 = await reg.call(ctx, 'getSpecialClasses', [tok]); const coldRuns = runStats.attempts - first;
  assert.ok(coldRuns > 1, 'cold: re-runs to find its data'); assert.ok(learnedFor('getSpecialClasses'));
  assert.equal(await lp.save(), true); assert.equal(await lp.save(), false, 'unchanged → not written again');
  const saved = JSON.parse(st.rows.get(LEARNED_ROW)!); assert.ok(saved.getSpecialClasses);
  // "restart": memory empty, then restored from the store
  forgetLearned();
  const lp2 = new LearnedPersistence(st, (m) => logs.push(m)); assert.ok((await lp2.load()) >= 1);
  assert.match(logs.join('\n'), /restored from Azure SQL: \d+ screen/);
  const a = runStats.attempts; const r2 = await reg.call(ctx, 'getSpecialClasses', [tok]);
  assert.ok(runStats.attempts - a < coldRuns, 'after the restart: fewer runs than cold (' + coldRuns + ' → ' + (runStats.attempts - a) + ')');
  assert.deepEqual(JSON.parse(JSON.stringify(r2)), JSON.parse(JSON.stringify(r1)), 'same answer');
});

test('restore checks every entry: odd shapes skipped; a stored spreadsheet ID is opened only if the settings name it', () => {
  forgetLearned();
  const good = { sheets: { main: ['A', 'B'], attendance: ['W'] }, books: [], values: [{ book: 'attendance', req: { ranges: ["'W'!A1:B2"], valueRenderOption: 'UNFORMATTED_VALUE' } }] };
  const n = loadLearned({
    ok: good,
    badBook: { sheets: { 'http://x': ['A'] }, books: [], values: [] },
    badSheets: { sheets: { main: 'A' }, books: [], values: [] },
    badId: { sheets: {}, books: ['../../etc'], values: [] },
    tooMany: { sheets: { main: Array.from({ length: 61 }, (_v, i) => 'S' + i) }, books: [], values: [] },
    badValues: { sheets: {}, books: [], values: [{ book: 'main', req: { ranges: 'A1' } }] },
    notObj: 5,
  });
  assert.equal(n, 1); assert.deepEqual(learnedFor('ok'), good);
  assert.equal(loadLearned([1, 2]), 0); assert.equal(loadLearned(null), 0); assert.equal(loadLearned('x'), 0);
  assert.equal(loadLearned({ ok: { ...good, sheets: { main: ['Z'] } } }), 0, 'never replaces what this process learned');
  assert.deepEqual(learnedSheets('main'), ['A', 'B']);
  const s = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', 'gas', 'run.ts'), 'utf8');
  assert.match(s, /for \(const id of learned\.books\) if \(ALLOWED_BOOKS\.has\(id\)\) opened\.add\(id\)/);
  assert.match(s, /learned\.values\.filter\(\(v\) => bookAllowed\(String\(v\.book\)\)\)/);
  assert.ok(Object.keys(learnedSnapshot()).length === 1 && learnedVersion() === 0, 'a restore is not a change to save');
});

test('SQL: dbo.app_state created once; parameterised get / upsert', async () => {
  const qs: string[] = []; const inputs: any[] = [];
  const req = () => { const r: any = { input: (...a: any[]) => { inputs.push(a); return r; }, query: async (q: string) => { qs.push(q); return { recordset: q.startsWith('SELECT') ? [{ value: '{"a":1}' }] : [] }; } }; return r; };
  const st = new MssqlAppState(async () => ({ request: req }) as any, { NVarChar: () => 0, DateTime2: () => 0, MAX: -1 } as any);
  await st.put(LEARNED_ROW, "{'x'); DROP TABLE t;--}"); assert.equal(await st.get(LEARNED_ROW), '{"a":1}');
  assert.equal(qs.filter((q) => /CREATE TABLE dbo\.app_state/.test(q)).length, 1);
  assert.ok(qs.every((q) => !q.includes('DROP TABLE t')), 'values are parameters, never SQL');
  assert.match(qs.find((q) => q.startsWith('UPDATE'))!, /IF @@ROWCOUNT = 0 INSERT/);
});

test('warm-up: reads the usual + remembered sheets once, as background work, and says so; a failure only logs', async () => {
  forgetLearned(); loadLearned({ s1: { sheets: { main: ['X1'] }, books: [], values: [] } });
  const lanes: boolean[] = []; const asked: string[][] = []; const logs: string[] = [];
  const data: any = { readCourses: async () => { lanes.push(isBackground()); return []; }, readConfiguredUserRoles: async () => ({}), readAccessOverrides: async () => ({}),
    readSheets: async (b: string, names: string[]) => { lanes.push(isBackground()); asked.push([b].concat(names)); if (b === 'attendance') throw new Error('not shared'); return { timeZone: 'X', sheets: {}, titles: [] }; } };
  const ctx: any = { cfg: { attendanceSpreadsheetId: 'ATT' }, data };
  const n = await warmUp(ctx, { main: ['M1', 'X1'], attendance: ['A1'] }, (m) => logs.push(m));
  assert.equal(n, 2); assert.ok(lanes.every(Boolean), 'background lane');
  assert.deepEqual(asked.find((a) => a[0] === 'main'), ['main', 'M1', 'X1'], 'no duplicates');
  assert.match(logs.join('\n'), /warm-up of the attendance workbook skipped \(not shared\)/);
  assert.match(logs.join('\n'), /\[Perf\] warm-up: 2 sheet\(s\)/);
});

test('[Perf] hourly line carries the Google calls for people vs background', () => {
  const logs: string[] = []; const p = new PerfMonitor((m) => logs.push(m)); p.extra = () => 'Google Sheets calls: 3 for people (waited 0.0 s in total), 9 background';
  p.record('getDashboardData', 1200, true); p.report();
  assert.match(logs[0], /^\[Perf\] last hour: 1 calls; slowest \(p95\): getDashboardData .* \| Google Sheets calls: 3 for people/);
});

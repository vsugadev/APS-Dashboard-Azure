/** v0.24.2: reads stay on the Azure copy after other people's saves; copies rewrite only changed tabs; slow lines say why. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixtureDataSource } from '../src/data/sources';
import { MemorySheetStore, MssqlSheetStore } from '../src/db/sheetStore';
import { SheetSync } from '../src/db/sync';
import { DbBackedDataSource } from '../src/db/dbData';
import { REQUEST, newRequest, requestEmail } from '../src/app/requestContext';
import { PerfMonitor } from '../src/api/perf';
import { loadConfig } from '../src/config';
import { buildRegistry } from '../src/server';
import { signInWithClaims } from '../src/app/context';
import { testContext } from './helpers';
import type { WorkbookKey } from '../src/data/types';

const D = '@avvaiyarpadasalai.org';
const as = <T>(email: string | null, fn: () => Promise<T>) => REQUEST.run({ ...newRequest(), email }, fn);

function setup() {
  let now = 1_800_000_000_000;
  const data: any = { courses: [], userRoles: {}, accessOverrides: {}, sheets: { main: { A: [['a'], ['1']], B: [['b'], ['2'], ['3']] } } };
  const src = new FixtureDataSource(data); const store = new MemorySheetStore(() => now);
  const db = new DbBackedDataSource(src, store, 15 * 60_000, () => now, () => {});
  const sync = new SheetSync(src, store, 'main', [], () => {}, () => now, 'Spreadsheet "main"',
    { discover: true, onDone: (t, ok) => db.copyDone('main', t, ok), onStored: (b, n, v, tz, at) => db.cacheStored(b, n, v, tz, at) });
  db.addCopy('main', () => new Set(sync.names), true);
  let google = 0; const orig = src.readSheets.bind(src);
  (src as any).readSheets = async (b: any, n: string[]) => { if (n.length) google++; return orig(b, n); };
  return { data, store, db, sync, google: () => google, tick: (ms: number) => { now += ms; }, now: () => now };
}

test('after a save only the person who saved reads Google; everyone else keeps the fast copy; the saver is back on the copy once a newer copy finished', async () => {
  const t = setup(); await t.sync.runOnce();
  const g0 = t.google();
  await as('b' + D, () => t.db.readSheets('main' as WorkbookKey, ['A'])); assert.equal(t.google(), g0, 'from the copy');
  t.tick(1000); t.db.invalidate('a' + D);
  await as('b' + D, () => t.db.readSheets('main' as WorkbookKey, ['A'])); assert.equal(t.google(), g0, 'someone else saved → B still reads the copy');
  await as(null, () => t.db.readSheets('main' as WorkbookKey, ['A'])); assert.equal(t.google(), g0, 'background work reads the copy');
  await as('a' + D, () => t.db.readSheets('main' as WorkbookKey, ['A'])); assert.equal(t.google(), g0 + 1, 'A saved → A reads Google (sees the change at once)');
  t.db.copyDone('main', t.now() - 500, true);
  await as('a' + D, () => t.db.readSheets('main' as WorkbookKey, ['A'])); assert.equal(t.google(), g0 + 2, 'a copy that started before the save does not count');
  t.tick(10); await t.sync.runOnce();
  const g1 = t.google();
  await as('a' + D, () => t.db.readSheets('main' as WorkbookKey, ['A'])); assert.equal(t.google(), g1, 'newer copy → A back on the copy');
});

test('DB_READ_AFTER_SAVE=all keeps the previous behaviour (everyone reads Google after any save); a save without a name does too', async () => {
  for (const mode of ['all', 'noname'] as const) {
    const t = setup(); await t.sync.runOnce(); const g0 = t.google();
    if (mode === 'all') { t.db.afterSave = 'all'; t.tick(1000); t.db.invalidate('a' + D); } else { t.tick(1000); t.db.invalidate(); }
    await as('b' + D, () => t.db.readSheets('main' as WorkbookKey, ['A'])); assert.equal(t.google(), g0 + 1, mode + ': everyone → Google');
  }
  assert.equal(loadConfig({ DB_READ_AFTER_SAVE: 'all' } as any).dbReadAfterSave, 'all');
  assert.equal(loadConfig({} as any).dbReadAfterSave, 'session'); assert.equal(loadConfig({ DB_READ_AFTER_SAVE: 'x' } as any).dbReadAfterSave, 'session');
});

test('who a request is for comes from the server-side session (requireSession), never from the browser; saves pass the saver', async () => {
  const ctx: any = testContext(); const reg = buildRegistry(); let seen: string | null = 'unset';
  const tok = (await signInWithClaims(ctx, { email: 'priya_aps8001' + D, email_verified: true }) as any).token;
  (reg as any).handlers.set('getKnowledgeBaseVideos', async (c: any, a: any) => { const { requireSession } = require('../src/app/context'); await requireSession(c, a[0]); seen = requestEmail(); return 1; });
  await reg.call(ctx, 'getKnowledgeBaseVideos', [tok, { email: 'fake' + D }]); assert.equal(seen, 'priya_aps8001' + D);
  assert.equal(requestEmail(), null, 'nothing outside a request');
  const fs = require('fs'), path = require('path');
  assert.match(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'api', 'endpoints', 'writes.ts'), 'utf8'), /ctx\.data\.invalidate\?\.\(s\.email\)/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'db', 'scOwner.ts'), 'utf8'), /ctx\.data\.invalidate\?\.\(session\.email\)/);
});

test('copies rewrite only changed tabs: unchanged tabs are not rewritten or read back, their time is renewed, the day count still counts them; a reconciliation re-copy rewrites all', async () => {
  const t = setup();
  await t.sync.runOnce(); const p1 = t.store.puts; assert.equal(p1, 3, 'first copy: titles + 2 tabs');
  t.tick(300_000); let r = await t.sync.runOnce(); assert.equal(r.ok, true);
  assert.equal(t.store.puts - p1, 1, 'nothing changed: only the small titles row is written');
  const stored = await t.store.get('main', ['A']); assert.equal(stored.A!.syncedAt, t.now(), '"copied at" renewed');
  t.data.sheets.main.B.push(['4']); t.tick(300_000); const p2 = t.store.puts; r = await t.sync.runOnce();
  assert.equal(t.store.puts - p2, 2, 'titles + the one changed tab'); assert.equal(r.rows.B, 4);
  const rep = await t.store.syncReport('2000-01-01'); assert.deepEqual(rep.filter((x) => x.sheet === 'A').map((x) => x.copies), [3], 'every copy counted per day');
  t.tick(1); const p3 = t.store.puts; await t.sync.runOnce(true); assert.equal(t.store.puts - p3, 3, 'forced (reconciliation): every tab rewritten');
  t.tick(14 * 60_000); const g0 = t.google();
  await as('x' + D, () => t.db.readSheets('main' as WorkbookKey, ['A', 'B'])); assert.equal(t.google(), g0, 'unchanged tabs stay fresh in memory (no Google, no database)');
  assert.match(t.sync.takeStats(), /^main 4× avg [\d.]+ s, 5 of 8 tabs rewritten$/);
});

test('SQL: unchanged tabs renewed and the day counts written in ONE round trip each, all values as parameters', async () => {
  const qs: string[] = []; const inputs: string[] = [];
  const req = () => { const r: any = { input: (n: string) => { inputs.push(n); return r; }, query: async (q: string) => { qs.push(q); return { recordset: [] }; } }; return r; };
  const st = new MssqlSheetStore('srv', 'db', { NVarChar: () => 0, Int: 0, Date: 0 } as any);
  (st as any).connect = async () => ({ request: req }); (st as any).logReady = Promise.resolve();
  await st.touch('main', ["T'1", 'T2']); await st.logSyncMany('2026-11-23', 'main', [{ sheet: "x'); DROP TABLE t;--", rows: 1, ok: true }, { sheet: 'y', rows: 2, ok: false }]);
  const touch = qs.find((q) => q.startsWith('UPDATE dbo.sheet_snapshot'))!; assert.match(touch, /sheet IN \(@n0, @n1\)/);
  assert.equal(qs.filter((q) => /MERGE dbo\.sheet_sync_log/.test(q)).length, 1, 'one round trip'); assert.ok(qs.every((q) => !q.includes('DROP TABLE t')));
});

test('[Perf] slow line says where the time went (waiting for data, runs, answer size)', () => {
  const logs: string[] = []; const p = new PerfMonitor((m) => logs.push(m));
  p.record('getAttendanceRecordsForViewer', 12_300, true, false, () => 'waiting for data 0.4 s, 1 run(s), answer 850 KB');
  assert.equal(logs[0], '[Perf] slow: getAttendanceRecordsForViewer took 12.3 s (waiting for data 0.4 s, 1 run(s), answer 850 KB)');
  p.record('x', 6000, true, false, () => { throw new Error('boom'); }); assert.equal(logs[1], '[Perf] slow: x took 6.0 s', 'a detail error never breaks the line');
});

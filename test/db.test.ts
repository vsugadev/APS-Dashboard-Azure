/** Database pilot (v0.11.0): Azure SQL read copy of Special Classes — store, sync, DB-backed reads, SQL client. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemorySheetStore, MssqlSheetStore, encodeGrid, decodeGrid, describeDbError, TITLES_ROW } from '../src/db/sheetStore';
import { SheetSync } from '../src/db/sync';
import { DbBackedDataSource } from '../src/db/dbData';
import { FixtureDataSource } from '../src/data/sources';
import type { WorkbookKey } from '../src/data/types';

const BOOK = 'id:SCBOOK123';
const LIVE = 'APS_SPECIAL_CLASSES_LIVE', ENR = 'APS_SPECIAL_CLASSES_ENROLLMENTS';
function inner() {
  const src = new FixtureDataSource({ courses: [], userRoles: {}, accessOverrides: {}, sheets: { [BOOK]: { [LIVE]: [['Title', 'Start'], ['Camp', 'date:2026-12-01T05:00:00.000Z'], ['Grammar', 'x']], [ENR]: [['Enrollment_ID'], ['E1']] } } as any });
  let calls = 0; const orig = src.readSheets.bind(src);
  (src as any).readSheets = async (b: WorkbookKey, n: string[]) => { calls++; return orig(b, n); };
  return { src, calls: () => calls };
}

test('grid JSON: dates survive the round trip; other values unchanged', () => {
  const g = [['a', 1, true, null, new Date('2026-12-01T05:00:00Z')]];
  const back = decodeGrid(encodeGrid(g));
  assert.ok(back[0][4] instanceof Date && (back[0][4] as Date).toISOString() === '2026-12-01T05:00:00.000Z');
  assert.deepEqual(back[0].slice(0, 4), ['a', 1, true, null]);
});

test('sync copies the sheets + the sheet list, checks row counts, logs once; a missing sheet is skipped; a store failure keeps reads on Sheets', async () => {
  const I = inner(), store = new MemorySheetStore(), logs: string[] = [];
  const sync = new SheetSync(I.src, store, BOOK, [LIVE, ENR, 'APS_SPECIAL_CLASSES_MISSING'], (m) => logs.push(m));
  const r = await sync.runOnce();
  assert.equal(r.ok, true, r.error); assert.deepEqual(r.rows, { [LIVE]: 3, [ENR]: 2 });
  assert.match(logs[0], /Special Classes copied to Azure SQL — APS_SPECIAL_CLASSES_LIVE 3 rows, APS_SPECIAL_CLASSES_ENROLLMENTS 2 rows/);
  const got = await store.get(BOOK, [TITLES_ROW, LIVE]);
  assert.deepEqual(got[TITLES_ROW]!.values[0], [LIVE, ENR]);
  assert.ok(got[LIVE]!.values[1][1] instanceof Date, 'date cell stored as a date');
  await sync.runOnce(); assert.equal(logs.length, 1, 'a healthy copy is logged only when it (re)starts working');
  store.failNext = true; const bad = await sync.runOnce();
  assert.equal(bad.ok, false); assert.match(logs[1], /copy FAILED: .* reads stay on Google Sheets/);
});

test('DB-backed reads: fresh copy → from the database (Sheets not called); stale / failing / other sheets → Google Sheets; empty sheet list answered from the stored titles', async () => {
  let now = 1_800_000_000_000; const I = inner(), store = new MemorySheetStore(() => now), logs: string[] = [];
  const db = new DbBackedDataSource(I.src, store, 15 * 60_000, () => now, (m) => logs.push(m));
  db.book = BOOK; db.names = new Set([LIVE, ENR]);
  await new SheetSync(I.src, store, BOOK, [LIVE, ENR], () => {}, () => now).runOnce();
  const c0 = I.calls();
  const a = await db.readSheets(BOOK as WorkbookKey, [LIVE]);
  assert.equal(I.calls(), c0, 'served from the database'); assert.equal(a.sheets[LIVE]!.values.length, 3); assert.deepEqual(a.titles, [LIVE, ENR]);
  const t = await db.readSheets(BOOK as WorkbookKey, []); assert.deepEqual(t.titles, [LIVE, ENR]); assert.equal(I.calls(), c0, 'opening the book: titles from the database');
  await db.readSheets(BOOK as WorkbookKey, ['SOME_OTHER_SHEET']); assert.equal(I.calls(), c0 + 1, 'a sheet not copied → Sheets');
  await db.readSheets('main' as WorkbookKey, ['Courses']); assert.equal(I.calls(), c0 + 2, 'other spreadsheets → Sheets');
  now += 16 * 60_000; await db.readSheets(BOOK as WorkbookKey, [LIVE]); assert.equal(I.calls(), c0 + 3, 'older than 15 minutes → Sheets');
  assert.match(logs.join('\n'), /older than 15 minutes/);
  now += 120_000; store.failNext = true; const f = await db.readSheets(BOOK as WorkbookKey, [LIVE]);
  assert.equal(f.sheets[LIVE]!.values.length, 3, 'still answered (from Sheets)'); assert.equal(db.fallbacks, 2); assert.equal(db.served, 2);
});

test('Azure SQL client: managed-identity sign-in (no password), encrypted, parameterised queries only; create-table is idempotent', async () => {
  const seen: { cfg?: any; queries: string[]; inputs: [string, unknown][] } = { queries: [], inputs: [] };
  const rec = { recordset: [{ sheet: LIVE, time_zone: 'America/New_York', grid: encodeGrid([['h'], ['v']]), row_count: 2, synced_at: new Date('2026-11-17T10:00:00Z') }] };
  const req = () => { const r: any = { input: (n: string, _t: unknown, v: unknown) => { seen.inputs.push([n, v]); return r; }, query: async (q: string) => { seen.queries.push(q); return rec; } }; return r; };
  const fake: any = { ConnectionPool: class { constructor(cfg: any) { seen.cfg = cfg; } connect() { return Promise.resolve(this); } request() { return req(); } }, NVarChar: (n: number) => 'nvarchar(' + n + ')', MAX: -1, Int: 'int' };
  const s = new MssqlSheetStore('aps-sql.database.windows.net', 'aps-dashboard', fake);
  await s.ensureSchema();
  assert.equal(seen.cfg.authentication.type, 'azure-active-directory-default'); assert.equal(seen.cfg.options.encrypt, true);
  assert.ok(!('password' in seen.cfg) && !('user' in seen.cfg), 'no password or user name');
  assert.match(seen.queries[0], /IF OBJECT_ID\(N'dbo\.sheet_snapshot', N'U'\) IS NULL CREATE TABLE/);
  await s.put(BOOK, LIVE, { values: [["Robert'); DROP TABLE x;--"]], timeZone: 'America/New_York' });
  assert.match(seen.queries[1], /^MERGE dbo\.sheet_snapshot WITH \(HOLDLOCK\)/); assert.ok(!seen.queries[1].includes('DROP TABLE'), 'values never in the SQL text');
  assert.deepEqual(seen.inputs.map((x) => x[0]), ['book', 'sheet', 'tz', 'grid', 'n']);
  const g = await s.get(BOOK, [LIVE, ENR]);
  assert.deepEqual(g[LIVE]!.values, [['h'], ['v']]); assert.equal(g[ENR], null); assert.equal(g[LIVE]!.syncedAt, Date.parse('2026-11-17T10:00:00Z'));
});

test('database errors are explained with the fix, never with addresses or secrets', () => {
  assert.match(describeDbError(new Error("Login failed for user '<token-identified principal>'.")), /^LOGIN_FAILED — .*CREATE USER \[aps-dashboard-ap\] FROM EXTERNAL PROVIDER/);
  assert.match(describeDbError(new Error("Client with IP address '1.2.3.4' is not allowed")), /^FIREWALL/);
  assert.match(describeDbError(new Error('ManagedIdentityCredential authentication failed')), /^NO_IDENTITY/);
  assert.match(describeDbError(new Error('getaddrinfo ENOTFOUND x')), /^SERVER_NOT_FOUND/);
  assert.ok(!/someone@x\.org|abc123/.test(describeDbError(new Error('weird someone@x.org password=abc123'))));
});

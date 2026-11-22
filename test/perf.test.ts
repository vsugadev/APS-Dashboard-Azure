/** v0.23.2: reads from the Azure SQL copy are served from memory (no database round trip per request); only requested tabs are fetched. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DbBackedDataSource } from '../src/db/dbData';
import { MemorySheetStore, MssqlSheetStore } from '../src/db/sheetStore';
import { SheetSync } from '../src/db/sync';

test('after a copy, reads of the copied spreadsheet need NO database read; a save sends reads to Google until the next copy; stale memory is not used', async () => {
  const sheet: Record<string, unknown[][]> = { A: [['h'], [1]], B: [['h'], [2]] };
  let googleReads = 0;
  const google: any = { readSheets: async (_b: string, names: string[]) => { googleReads++; return { titles: Object.keys(sheet), timeZone: 'America/New_York', sheets: Object.fromEntries(names.filter((n) => sheet[n]).map((n) => [n, { values: sheet[n] }])) }; },
    readCourses: async () => [], readConfiguredUserRoles: async () => ({}), readAccessOverrides: async () => ({}), readValues: async () => [] };
  const store = new MemorySheetStore(); let dbGets = 0; const get = store.get.bind(store); (store as any).get = async (b: string, n: string[]) => { dbGets++; return get(b, n); };
  let now = 1_800_000_000_000;
  const db = new DbBackedDataSource(google, store, 15 * 60_000, () => now, () => {});
  const sync = new SheetSync(google, store, 'main', [], () => {}, () => now, 'x', { discover: true, onStored: (b, n, v, tz, at) => db.cacheStored(b, n, v, tz, at), onDone: (t, ok) => db.copyDone('main', t, ok) });
  db.addCopy('main', () => new Set(sync.names), true);
  await sync.runOnce(); const afterCopy = dbGets; googleReads = 0;
  for (let i = 0; i < 20; i++) { const r = await db.readSheets('main' as any, ['A', 'B']); assert.deepEqual(r.sheets.A!.values, [['h'], [1]]); }
  assert.equal(dbGets, afterCopy, '20 reads, 0 database reads'); assert.equal(googleReads, 0); assert.equal(db.memHits, 20);
  db.invalidate(); // a save
  await db.readSheets('main' as any, ['A']); assert.equal(googleReads, 1, 'after a save: Google until a fresh copy');
  now += 16 * 60_000; db.copyDone('main', now, true); (db as any).copies.get('main').dirtySince = 0;
  await db.readSheets('main' as any, ['A']); assert.ok(dbGets > afterCopy || googleReads > 1, 'memory older than 15 min is not used');
});

test('SQL: only the requested tabs are fetched (was: the whole spreadsheet per read)', async () => {
  const qs: string[] = []; const inputs: string[] = [];
  const req = () => { const r: any = { input: (k: string) => { inputs.push(k); return r; }, query: async (q: string) => { qs.push(q); return { recordset: [] }; } }; return r; };
  const s = new MssqlSheetStore('srv', 'db', { NVarChar: () => 0 } as any);
  (s as any).connect = async () => ({ request: req });
  await s.get('main', ['A', 'B', 'A']);
  assert.match(qs[qs.length - 1], /WHERE book = @book AND sheet IN \(@n0, @n1\)/); assert.ok(inputs.includes('n1') && !inputs.includes('n2'));
});

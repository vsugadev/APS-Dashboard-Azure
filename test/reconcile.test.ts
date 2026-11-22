/** v0.21.0: record-level reconciliation of the Azure SQL copies against the Google Sheets (source of truth). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTab, keyColumn, reconcileBook, Reconciler, summaryLine, tabClean, MssqlReconStore, type BookRecon } from '../src/db/reconcile';
import { MemorySheetStore } from '../src/db/sheetStore';
import { SheetSync } from '../src/db/sync';

const H = ['Request_ID', 'Student_Email', 'Status', 'Created_At'];
const d = new Date('2026-11-20T15:00:00Z');
const R = (id: string, st = 'OPEN') => [id, id.toLowerCase() + '@avvaiyarpadasalai.org', st, d];

test('identical, reordered and trailing empty cells → all MATCH; key column found', () => {
  const src = [H, R('A1'), R('A2'), R('A3')], tgt = [H, R('A3'), R('A1'), [...R('A2'), '', '']];
  const t = compareTab('main', 'T', src, tgt);
  assert.equal(t.key, 'Request_ID'); assert.ok(tabClean(t), JSON.stringify(t));
  assert.deepEqual([t.sourceCount, t.targetCount, t.match, t.missing, t.extra, t.different, t.dupSource, t.dupTarget, t.errors], [3, 3, 3, 0, 0, 0, 0, 0, 0]);
});

test('MISSING / EXTRA / DIFFERENT (by key) / DUPLICATES / header change / not copied = ERROR; samples are row numbers only', () => {
  const src = [H, R('A1'), R('A2', 'CLOSED'), R('A3'), R('A4')], tgt = [H, R('A1'), R('A2', 'OPEN'), R('A4'), R('A4'), R('Z9')];
  const t = compareTab('main', 'T', src, tgt);
  assert.deepEqual([t.sourceCount, t.targetCount, t.match, t.missing, t.extra, t.different, t.dupSource, t.dupTarget], [4, 5, 2, 1, 2, 1, 0, 1]);
  assert.deepEqual(t.samples.different, [3]); assert.deepEqual(t.samples.missing, [4]);
  assert.ok(!JSON.stringify(t.samples).includes('@'), 'no cell values');
  const hdr = compareTab('main', 'T', [H, R('A1')], [['Request_ID', 'Email', 'Status', 'Created_At'], R('A1')]); assert.equal(hdr.different, 1);
  const none = compareTab('main', 'T', [H, R('A1')], null); assert.equal(none.errors, 1); assert.equal(none.missing, 1);
  assert.equal(keyColumn(['Name', 'Grade'], [['a', 1]]), -1, 'no identifier column → whole-row comparison only');
  const dupSrc = compareTab('main', 'T', [['Name', 'Email'], ['a', 'x@y'], ['b', 'x@y']], [['Name', 'Email'], ['a', 'x@y'], ['b', 'x@y']]);
  assert.equal(dupSrc.key, '', 'a non-unique column is not used as the key'); assert.ok(tabClean(dupSrc));
});

test('reconcileBook: real copy → IDENTICAL; an edit after the copy is caught; the second pass after a fresh copy confirms it clean', async () => {
  const sheet: Record<string, unknown[][]> = { Tickets: [H, R('A1'), R('A2')], Audit: [['When', 'What'], [d, 'x']] };
  const source: any = { readSheets: async (_b: string, names: string[]) => ({ titles: Object.keys(sheet), timeZone: 'America/New_York', sheets: Object.fromEntries(names.filter((n) => sheet[n]).map((n) => [n, { values: JSON.parse(JSON.stringify(sheet[n]), (_k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v)) }])) }) };
  const store = new MemorySheetStore(); const sync = new SheetSync(source, store, 'main', [], () => {}, Date.now, 'x', { discover: true });
  await sync.runOnce();
  const r1 = await reconcileBook(source, store, 'main', sync.names); assert.ok(r1.tabs.every(tabClean), JSON.stringify(r1.tabs)); assert.match(summaryLine(r1), /SOURCE 3 · TARGET 3 · MATCH 3 · MISSING 0 · EXTRA 0 · DIFFERENT 0 .* IDENTICAL/);
  sheet.Tickets.push(R('A3')); // someone adds a row after the copy
  const logs: string[] = []; const saved: BookRecon[] = [];
  const rec = new Reconciler(source, store, [{ book: 'main', tabs: () => sync.names.slice(), copyAgain: () => sync.runOnce() }], { save: async (r) => { saved.push(r); } }, (m) => logs.push(m));
  const [r2] = await rec.runOnce();
  assert.equal(r2.confirmed, true); assert.ok(r2.tabs.every(tabClean), 'the next copy includes the new row → not a migration difference');
  assert.match(logs[0], /\(confirmed after a fresh copy\).* IDENTICAL/); assert.equal(saved.length, 1);
  // a copy that keeps differing (store corrupted) is reported with the tab and row numbers
  const bad = new MemorySheetStore(); await bad.put('main', 'Tickets', { values: [H, R('A1')], timeZone: 'America/New_York' }); await bad.put('main', 'Audit', { values: sheet.Audit, timeZone: 'America/New_York' });
  const rec2 = new Reconciler(source, bad, [{ book: 'main', tabs: () => ['Tickets', 'Audit'], copyAgain: async () => undefined }], null, (m) => logs.push(m));
  const [r3] = await rec2.runOnce();
  assert.equal(r3.tabs.find((t) => t.tab === 'Tickets')!.missing, 2); assert.match(logs[logs.length - 1], /MISSING 2 .* differs: Tickets \(rows 3,4\)/);
});

test('SQL: table created once; one parameterised row per tab; never cell values', async () => {
  const qs: string[] = []; const req = () => { const r: any = { input: () => r, query: async (q: string) => { qs.push(q); return { recordset: [] }; } }; return r; };
  const s = new MssqlReconStore(async () => ({ request: req }) as any, { NVarChar: () => 0, DateTime2: () => 0, Int: 0, Bit: 0 } as any);
  const t = compareTab('main', "T'); DROP TABLE x;--", [H, R('A1')], [H]);
  await s.save({ book: 'main', at: 1, tabs: [t, t], error: '', confirmed: false }); await s.save({ book: 'main', at: 2, tabs: [t], error: '', confirmed: true });
  assert.equal(qs.filter((q) => /CREATE TABLE dbo\.reconcile_run/.test(q)).length, 1); assert.equal(qs.filter((q) => /INSERT INTO dbo\.reconcile_run/.test(q)).length, 3);
  assert.ok(qs.every((q) => !q.includes('DROP TABLE x')));
});

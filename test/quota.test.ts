/** v0.23.3: Sheets API budget — batched tab reads, one gate per process, 429 pauses everything; errors named correctly. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiGate } from '../src/google/apiGate';
import { SheetsDataSource, GRID_BATCH } from '../src/data/sources';
import { describeDbError } from '../src/db/sheetStore';
import { testConfig } from './helpers';

test('gate: never more than perMinute calls in 60 s or more than `concurrent` at once; callers wait instead of failing', async () => {
  let now = 0; const slept: number[] = [];
  const g = new ApiGate(3, 2, 30_000, () => now, async (ms) => { slept.push(ms); now += ms; }, () => {});
  let running = 0, peak = 0;
  const job = () => g.run(async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setImmediate(r)); running--; return 1; });
  const out = await Promise.all([job(), job(), job(), job(), job()]);
  assert.deepEqual(out, [1, 1, 1, 1, 1]); assert.ok(peak <= 2); assert.ok(slept.some((s) => s >= 59_000), 'the 4th call waited for the minute');
});

test('gate: a 429 pauses ALL calls for the cool-down and the call is tried once more; other errors pass straight through', async () => {
  let now = 0; const logs: string[] = [];
  const g = new ApiGate(45, 4, 30_000, () => now, async (ms) => { now += ms; }, (m) => logs.push(m));
  let n = 0; const v = await g.run(async () => { if (++n === 1) throw new Error('GOOGLE_API_429 RESOURCE_EXHAUSTED'); return 'ok'; });
  assert.equal(v, 'ok'); assert.equal(n, 2); assert.ok(now >= 30_000); assert.match(logs[0], /rate limit reached — all Sheets reads wait 30 s/);
  await assert.rejects(g.run(async () => { throw new Error('GOOGLE_API_403 PERMISSION_DENIED'); }), /403/);
  let m = 0; await assert.rejects(g.run(async () => { m++; throw new Error('GOOGLE_API_429'); }), /429/); assert.equal(m, 2, 'tried once more only');
});

test('a whole-spreadsheet copy reads its tabs in batches (71 tabs = 4 grid calls, was 71); cached tabs are not fetched again', async () => {
  const titles = Array.from({ length: 71 }, (_v, i) => 'T' + i); const urls: string[] = [];
  const orig = globalThis.fetch;
  (globalThis as any).fetch = async (url: string) => {
    urls.push(url);
    const body = url.includes('fields=properties.timeZone') ? { properties: { timeZone: 'America/New_York' }, sheets: titles.map((t) => ({ properties: { title: t } })) }
      : { sheets: decodeURIComponent(url).match(/ranges='([^']+)'/g)!.map((r) => ({ properties: { title: r.slice(8, -1) }, data: [{ rowData: [{ values: [{ effectiveValue: { stringValue: r.slice(8, -1) } }] }] }] })) };
    return { ok: true, status: 200, json: async () => body } as any;
  };
  try {
    const src = new SheetsDataSource(testConfig({ targetSpreadsheetId: 'S' }), async () => 'tok', new ApiGate(1000, 4, 1, Date.now, async () => {}, () => {}));
    const snap = await src.readSheets('main', titles);
    assert.equal(snap.sheets.T70!.values[0][0], 'T70'); assert.equal(snap.sheets.T0!.values[0][0], 'T0');
    const grid = urls.filter((u) => u.includes('includeGridData')); assert.equal(grid.length, Math.ceil(71 / GRID_BATCH));
    await src.readSheets('main', ['T5', 'T6']); assert.equal(urls.filter((u) => u.includes('includeGridData')).length, grid.length, 'cached');
  } finally { (globalThis as any).fetch = orig; }
});

test('errors are named for what failed: a Sheets 429 is never "FREE_LIMIT_REACHED"', () => {
  assert.match(describeDbError(new Error('GOOGLE_API_429 RESOURCE_EXHAUSTED RATE_LIMIT_EXCEEDED')), /^GOOGLE — reading the Google Sheet failed: GOOGLE_API_429 RESOURCE_EXHAUSTED RATE_LIMIT_EXCEEDED \(Sheets API rate limit/);
  assert.doesNotMatch(describeDbError(new Error('GOOGLE_API_429 RESOURCE_EXHAUSTED')), /FREE_LIMIT/);
  assert.match(describeDbError(new Error('The free amount for this database has been used up')), /FREE_LIMIT_REACHED/);
});

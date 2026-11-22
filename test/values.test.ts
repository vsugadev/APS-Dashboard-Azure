/** v0.23.4: attendance batchGet answered from the verified copy = what the Sheets API answers (UNFORMATTED_VALUE + SERIAL_NUMBER). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseA1, sliceUnformatted, valuesFromCopyOk, DbBackedDataSource } from '../src/db/dbData';
import { gridToValues } from '../src/data/sources';
import { MemorySheetStore } from '../src/db/sheetStore';

const TZ = 'America/New_York';
test('A1 ranges as Code.gs writes them', () => {
  assert.deepEqual(parseA1("'AWK 11ATT'!A2:X"), { raw: "'AWK 11ATT'!A2:X", sheet: 'AWK 11ATT', c1: 1, r1: 2, c2: 24, r2: null });
  assert.deepEqual(parseA1("'It''s'!B5:C10"), { raw: "'It''s'!B5:C10", sheet: "It's", c1: 2, r1: 5, c2: 3, r2: 10 });
  assert.deepEqual(parseA1('Summary!C3'), { raw: 'Summary!C3', sheet: 'Summary', c1: 3, r1: 3, c2: 3, r2: 3 });
  assert.equal(parseA1('Summary')!.r2, null); assert.equal(parseA1('bad!!'), null);
  assert.equal(valuesFromCopyOk({ ranges: [], valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER', majorDimension: 'ROWS' }), true);
  assert.equal(valuesFromCopyOk({ ranges: [], valueRenderOption: 'FORMATTED_VALUE' }), false);
});

test('same values the Sheets API returns: dates as the original serial numbers, numbers, booleans, text; trailing empties dropped', () => {
  // the grid exactly as the copy stores it (gridToValues of the Sheets grid data)
  const rowData = [
    { values: [{ effectiveValue: { stringValue: 'Date' } }, { effectiveValue: { stringValue: 'Email' } }, { effectiveValue: { stringValue: 'Minutes' } }, { effectiveValue: { stringValue: 'OK' } }] },
    { values: [{ effectiveValue: { numberValue: 46345.791666666664 }, effectiveFormat: { numberFormat: { type: 'DATE_TIME' } } }, { effectiveValue: { stringValue: 'a@x.org' } }, { effectiveValue: { numberValue: 85 } }, { effectiveValue: { boolValue: true } }, {}, {}] },
    { values: [{}, {}] },
    { values: [{ effectiveValue: { numberValue: 46346 }, effectiveFormat: { numberFormat: { type: 'DATE' } } }, {}, { effectiveValue: { numberValue: 0 } }] },
    { values: [{}] }, { values: [] },
  ];
  const grid = gridToValues(rowData as any, TZ);
  const out = sliceUnformatted(grid, parseA1("'W'!A2:D")!, TZ);
  assert.equal(out.length, 3, 'trailing empty rows dropped, the empty row in the middle kept');
  assert.ok(Math.abs((out[0][0] as number) - 46345.791666666664) < 1e-6); assert.deepEqual(out[0].slice(1), ['a@x.org', 85, true]);
  assert.deepEqual(out[1], []); assert.equal(out[2][0], 46346); assert.deepEqual(out[2].slice(1), ['', 0]);
});

test('reads come from the copy only when it is on and clean; otherwise Google', async () => {
  let google = 0;
  const inner: any = { readValues: async () => { google++; return { valueRanges: [{ range: 'x', values: [['g']] }] }; }, readSheets: async () => ({ titles: [], timeZone: TZ, sheets: {} }) };
  const store = new MemorySheetStore(); const now = 1_800_000_000_000;
  const db = new DbBackedDataSource(inner, store, 15 * 60_000, () => now, () => {});
  db.cacheStored('attendance', '__titles__', [['W']], TZ, now); db.cacheStored('attendance', 'W', [['h'], [1, 'a']], TZ, now);
  db.addCopy('attendance', () => new Set(['W']), true);
  const req = { ranges: ["'W'!A2:B"], valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER', majorDimension: 'ROWS' };
  const r = await db.readValues('attendance' as any, req);
  assert.deepEqual(r.valueRanges[0].values, [[1, 'a']]); assert.equal(google, 0); assert.equal(db.valuesFromCopy, 1);
  await db.readValues('attendance' as any, { ...req, valueRenderOption: 'FORMATTED_VALUE' }); assert.equal(google, 1, 'other options → Google');
  await db.readValues('attendance' as any, { ...req, ranges: ["'Other'!A1:B"] }); assert.equal(google, 2, 'a tab not copied → Google');
  db.invalidate(); await db.readValues('attendance' as any, req); assert.equal(google, 3, 'after a save → Google');
});

test('Exam Question Paper: the LIVE / TEST spreadsheet IDs are read from the app settings (report #4)', async () => {
  const { loadConfig, configWarnings } = await import('../src/config');
  const cfg = loadConfig({ NODE_ENV: 'development', APS_DATA_MODE: 'sheets', LIVE_QUESTION_PAPER_SPREADSHEET_ID: 'QP123', TEST_QUESTION_PAPER_SPREADSHEET_ID: 'QPT', SOME_SECRET_KEY: 'x' } as any);
  assert.equal(cfg.scriptSettings.LIVE_QUESTION_PAPER_SPREADSHEET_ID, 'QP123'); assert.equal(cfg.scriptSettings.TEST_QUESTION_PAPER_SPREADSHEET_ID, 'QPT');
  assert.equal(cfg.scriptSettings.SOME_SECRET_KEY, undefined);
  const w = configWarnings(loadConfig({ NODE_ENV: 'development', APS_DATA_MODE: 'sheets' } as any));
  assert.ok(w.some((x) => /LIVE_QUESTION_PAPER_SPREADSHEET_ID is not set/.test(x)));
});

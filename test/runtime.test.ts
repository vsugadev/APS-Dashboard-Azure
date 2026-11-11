import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SnapWorkbook, makeRuntime, serialToDate, READ_ONLY_MSG } from '../src/gas/runtime';
import { gridToValues } from '../src/data/sources';
import { scriptSettingsFrom } from '../src/config';

test('read-only runtime: existing sheets can never be changed; a missing sheet is "created" in memory only', () => {
  const wb = new SnapWorkbook('id', { Live: { values: [['H1', 'H2'], ['a', 1]] }, Gone: null });
  const sh = wb.getSheetByName('Live')!;
  assert.deepEqual(sh.getRange(2, 1, 1, 3).getValues(), [['a', 1, '']]); assert.equal(sh.getLastRow(), 2); assert.equal(sh.getLastColumn(), 2);
  for (const f of [() => sh.getRange(1, 1).setValue('x'), () => sh.getRange(1, 1, 1, 2).setValues([['x', 'y']]), () => sh.appendRow(['x']), () => sh.setFrozenRows(), () => sh.getRange(1, 1).setFontWeight()])
    assert.throws(f, { message: READ_ONLY_MSG });
  assert.equal(wb.getSheetByName('Gone'), null);
  const n = wb.insertSheet('Gone'); n.getRange(1, 1, 1, 2).setValues([['h', 'i']]).setFontWeight(); n.setFrozenRows();
  assert.equal(n.getLastRow(), 1, 'new sheet works in memory (Code.gs "create it" path) — nothing is sent to Google');
  assert.throws(() => sh.getRange('A1'), /A1 ranges are not supported/);
});

test('runtime services: settings readable, never writable; no cache; workbooks are the snapshots', () => {
  const main = new SnapWorkbook('m', {});
  const rt: any = makeRuntime({ main, attendance: null, settings: { APS_X: '1' }, isRosterHiddenStaffEmail_: () => false, apsTabAllowed_: () => true, isOnCallCoordinatorEmail_: () => false });
  const p = rt.PropertiesService.getScriptProperties();
  assert.equal(p.getProperty('APS_X'), '1'); assert.equal(p.getProperty('MISSING'), null);
  assert.throws(() => p.setProperty('APS_X', '2'), { message: READ_ONLY_MSG }); assert.throws(() => p.deleteProperty('APS_X'), { message: READ_ONLY_MSG });
  const c = rt.CacheService.getScriptCache(); c.put('k', 'v'); assert.equal(c.get('k'), null);
  assert.equal(rt.getWorkbook_(), main); assert.throws(() => rt.getAttendanceWorkbook_(), /Attendance data/);
  assert.throws(() => rt.SpreadsheetApp.openById('x'));
});

test('Sheets API cells → Apps Script getValues types (dates in the spreadsheet time zone, DST-aware)', () => {
  assert.equal(serialToDate(46337.75, 'America/New_York').toISOString(), '2026-11-11T23:00:00.000Z', 'EST: 6 PM = 23:00 UTC');
  assert.equal(serialToDate(46207.5, 'America/New_York').toISOString(), '2026-07-04T16:00:00.000Z', 'EDT: noon = 16:00 UTC');
  assert.equal(serialToDate(46337, 'Asia/Kolkata').toISOString(), '2026-11-10T18:30:00.000Z');
  const v = gridToValues([{ values: [
    { effectiveValue: { numberValue: 46337 }, effectiveFormat: { numberFormat: { type: 'DATE' } } }, { effectiveValue: { numberValue: 771101 } },
    { effectiveValue: { stringValue: 'x' } }, { effectiveValue: { boolValue: true } }, {}, { effectiveValue: { errorValue: { type: 'N_A' } } }] }, {}], 'America/New_York');
  assert.ok(v[0][0] instanceof Date); assert.equal((v[0][0] as Date).toISOString(), '2026-11-11T05:00:00.000Z');
  assert.deepEqual(v[0].slice(1), [771101, 'x', true, '', '#ERROR!']); assert.deepEqual(v[1], []);
});

test('Code.gs settings for the runtime: plain APS_/TCC_/TTM_… values only — never anything that could be a secret', () => {
  const s = scriptSettingsFrom({ APS_SCHOOL_LEAVE_ENABLED: 'true', TCC_CLEANUP_GRACE_MINUTES: '30', APS_ZOHO_CLIENT_SECRET: 's', APS_API_KEY: 'k', ATTENDANCE_TOKEN: 't', GOOGLE_OAUTH_CLIENT_SECRET: 'x', PATH: '/bin', APS_SA_JSON: '{}' } as NodeJS.ProcessEnv);
  assert.deepEqual(s, { APS_SCHOOL_LEAVE_ENABLED: 'true', TCC_CLEANUP_GRACE_MINUTES: '30' });
});

test('Utilities.formatDate shim: every Java pattern the copied Code.gs uses, Eastern time, DST', async () => {
  const { Utilities } = await import('../src/gas/utilities');
  const d = new Date('2026-11-11T23:05:09Z'), s = new Date('2026-07-04T16:00:00Z'), tz = 'America/New_York';
  const cases: [Date, string, string][] = [[d, 'yyyy-MM-dd', '2026-11-11'], [d, 'MM/dd HH:mm', '11/11 18:05'], [d, 'MM/dd/yyyy hh:mm a', '11/11/2026 06:05 PM'],
    [d, 'MM/dd/yyyy', '11/11/2026'], [d, 'MMM d', 'Nov 11'], [d, 'XXX', '-05:00'], [s, 'XXX', '-04:00'], [d, 'u', '3'], [d, 'yyyy-MM-dd HH:mm:ss', '2026-11-11 18:05:09'],
    [d, 'yyyyMMdd-HHmmss', '20261111-180509'], [s, 'EEEE, MMMM d', 'Saturday, July 4'], [new Date('2026-11-11T05:00:00Z'), 'h:mm a', '12:00 AM'], [d, "'Week of' MMM d", 'Week of Nov 11']];
  for (const [dt, pat, want] of cases) assert.equal(Utilities.formatDate(dt, tz, pat), want, pat);
  assert.throws(() => Utilities.formatDate(d, tz, 'yyyy-ww'), /unsupported pattern/);
});

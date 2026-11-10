import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SheetsDataSource, parseAccessRows, parseUserRoleRows } from '../src/data/sources';
import { testConfig, D } from './helpers';

test('Sheets reader: one batchGet per sheet range per cache window; same parsing as Code.gs; read-only scope', async () => {
  const calls: string[] = []; const scopes: string[][] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push(String(url));
    assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer tkn');
    const u = decodeURIComponent(String(url));
    const values = u.includes('Courses!R2:R') ? [[JSON.stringify({ id: '101', name: 'C', students: [{ email: 'meena_aps5555' + D }] })], [''], ['{bad json']]
      : u.includes('Dashboard_User_Roles') ? [['Hm2' + D, 'Headmaster', 'TRUE'], ['x' + D, 'teacher', 'FALSE'], ['y' + D, 'wizard', 'TRUE']]
      : [['student', 'kb', 'KB', 'FALSE', '2026-11-01T10:00:00Z', 'admin' + D], ['nobody', 'kb', '', 'FALSE'], ['teacher', 'nokey', '', 'FALSE']];
    return new Response(JSON.stringify({ valueRanges: [{ values }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const ds = new SheetsDataSource(testConfig({ targetSpreadsheetId: 'SHEET123' }), async (s) => { scopes.push(s); return 'tkn'; });
    const c1 = await ds.readCourses(); const c2 = await ds.readCourses();
    assert.equal(c1.length, 1, 'blank and broken rows skipped'); c1[0].name = 'changed'; assert.equal(c2[0].name, 'C', 'callers get fresh objects');
    assert.deepEqual(await ds.readConfiguredUserRoles(), { ['hm2' + D]: 'headmaster' });
    const ov = await ds.readAccessOverrides();
    assert.deepEqual(ov.student, { kb: false }); assert.equal(ov.__meta!.by, 'admin' + D); assert.equal(ov.teacher, undefined);
    assert.equal(calls.length, 3, 'one call per range; the second readCourses came from the cache');
    assert.ok(calls.every((u) => u.startsWith('https://sheets.googleapis.com/v4/spreadsheets/SHEET123/values:batchGet?')));
    assert.ok(scopes.every((s) => s.length === 1 && s[0] === 'https://www.googleapis.com/auth/spreadsheets.readonly'));
  } finally { globalThis.fetch = realFetch; }
});

test('row parsers ignore unknown roles / keys and inactive rows', () => {
  assert.deepEqual(parseUserRoleRows([['A' + D, 'student', 'true'], ['b' + D, 'student', '1'], ['', 'admin', 'TRUE']]), { ['a' + D]: 'student', ['b' + D]: 'student' });
  assert.deepEqual(parseAccessRows([]), { __meta: { at: '', by: '' } });
});

test('Google service account not configured → a clear error, never a crash or a key in the message', async () => {
  const { serviceAccountTokenProvider } = await import('../src/google/serviceAccount');
  await assert.rejects(serviceAccountTokenProvider(testConfig())(['x']), /GOOGLE_NOT_CONFIGURED/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { loadConfig } from '../src/config';
import { explainGoogleError, describeGoogleError } from '../src/google/diagnose';
import { googleFetchJson } from '../src/google/serviceAccount';
import { azureWording, AZURE_DEPLOYMENT_HELP, DashboardPage } from '../src/web/render';
import { checkGoogleAccess } from '../src/server';
import { testContext } from './helpers';
import type { DataSource } from '../src/data/types';

test('config: App Service APPSETTING_ copies are ignored (no duplicate warnings, never read as values)', () => {
  const warn = console.warn; const seen: string[] = []; console.warn = (m: string) => { seen.push(m); };
  try {
    const cfg = loadConfig({ ADMIN_EMAILS: '@Microsoft.KeyVault(SecretUri=https://v/secrets/admin-emails/)', APPSETTING_ADMIN_EMAILS: '@Microsoft.KeyVault(SecretUri=https://v/secrets/admin-emails/)', APPSETTING_SUPERADMIN_EMAILS: '["x@avvaiyarpadasalai.org"]' } as NodeJS.ProcessEnv);
    assert.deepEqual(cfg.adminEmails, []); assert.deepEqual(cfg.superadminEmails, [], 'APPSETTING_ name is not a setting');
    assert.equal(seen.length, 1); assert.match(seen[0], /^\[Config\] ADMIN_EMAILS:/);
  } finally { console.warn = warn; }
});

test('Google errors are explained with the fix, and the log line carries no personal data or keys', () => {
  const cases: [string, string][] = [
    ['GOOGLE_NOT_CONFIGURED: the Google service account is not set up yet (Phase 0).', 'service_account_missing'],
    ['unauthorized_client: Client is unauthorized to retrieve access tokens using this method', 'delegation_not_active'],
    ['invalid_grant: Invalid email or User ID', 'impersonated_user_invalid'],
    ['GOOGLE_API_403 PERMISSION_DENIED SERVICE_DISABLED', 'sheets_api_disabled'],
    ['GOOGLE_API_403 PERMISSION_DENIED', 'sheet_not_shared'],
    ['GOOGLE_API_404 NOT_FOUND', 'sheet_not_found'],
    ['GOOGLE_API_503', 'google_busy'],
    ['TARGET_SPREADSHEET_ID is not set.', 'spreadsheet_id_missing'],
    ['fetch failed', 'network'],
    ['something else', 'unknown'],
  ];
  for (const [msg, code] of cases) assert.equal(explainGoogleError(new Error(msg)).code, code, msg);
  const line = describeGoogleError(new Error('invalid_grant: Invalid email or User ID person@avvaiyarpadasalai.org'));
  assert.match(line, /^invalid_grant \[impersonated_user_invalid\] — /);
  assert.ok(!/person@/.test(line), 'free text from Google is not logged');
  assert.match(describeGoogleError(new Error('unauthorized_client')), /numeric Unique ID.*spreadsheets\.readonly.*24 hours/);
});

test("Google API errors keep only Google's status/reason codes, never its free text", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'Google Sheets API has not been used in project 123 by user a@b.org', details: [{ reason: 'SERVICE_DISABLED' }, { reason: 'bad reason with spaces' }] } }), { status: 403 })) as typeof fetch;
  try {
    await assert.rejects(googleFetchJson('https://x', 't'), (e: Error) => e.message === 'GOOGLE_API_403 PERMISSION_DENIED SERVICE_DISABLED');
    globalThis.fetch = (async () => new Response('not json', { status: 404 })) as typeof fetch;
    await assert.rejects(googleFetchJson('https://x', 't'), (e: Error) => e.message === 'GOOGLE_API_404');
  } finally { globalThis.fetch = realFetch; }
});

test('start-up Google check logs OK with the class count, or the exact fix — and never throws', async () => {
  const lines: string[] = [];
  const ok = testContext(); ok.cfg = { ...ok.cfg, dataMode: 'sheets' };
  assert.equal(await checkGoogleAccess(ok, (m) => lines.push(m)), true);
  assert.match(lines[0], /^\[Google\] Sheet check OK — \d+ classes readable\.$/);
  const bad = testContext(); bad.cfg = { ...bad.cfg, dataMode: 'sheets' };
  bad.data = { ...bad.data, readCourses: async () => { throw new Error('unauthorized_client'); } } as DataSource;
  assert.equal(await checkGoogleAccess(bad, (m) => lines.push(m)), false);
  assert.match(lines[1], /^\[Google\] Sheet check FAILED: unauthorized_client \[delegation_not_active\] — Google Admin console/);
  const fixture = testContext(); lines.length = 0;
  assert.equal(await checkGoogleAccess(fixture, (m) => lines.push(m)), true); assert.equal(lines.length, 0, 'no check in fixture mode');
});

test('sign-in help box: Azure wording instead of the Apps Script instructions; rest of the page unchanged', () => {
  const html = '<div><span>Required Web App setting</span><b id="apsDeploymentHintValue">OAuth Client ID</b></div><p class="aps-gate-text" id="apsDeploymentHelp" style="display:none;text-align:left;">If you manage the APS Dashboard deployment: confirm Code.gs\'s <b>OAUTH_CLIENT_ID</b> … then redeploy.</p><p>other</p>';
  const out = azureWording(html);
  assert.ok(out.includes('id="apsDeploymentHelp" style="display:none;text-align:left;">' + AZURE_DEPLOYMENT_HELP + '</p><p>other</p>'));
  assert.ok(!/Code\.gs|redeploy/.test(out)); assert.ok(out.includes('<span>Setting to check: </span>'));
  assert.equal(azureWording('<p>no help box</p>'), '<p>no help box</p>', 'unchanged when the box is not there');
  // the real page: wording replaced, template checks still pass
  const page = new DashboardPage(path.join(__dirname, '..', '..', 'public', 'Dashboard.html'));
  const r = page.render({ authUrl: '#', token: null, user: null, error: null });
  assert.ok(r.includes(AZURE_DEPLOYMENT_HELP)); assert.ok(!r.includes("confirm Code.gs's"));
});

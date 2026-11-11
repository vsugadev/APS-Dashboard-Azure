import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { testContext, D } from './helpers';
import { createApp, buildRegistry } from '../src/server';
import { Registry, safeErrorMessage } from '../src/api/registry';
import { DashboardPage, checkTemplate, jsonForScript } from '../src/web/render';
import type { AppContext } from '../src/app/context';

const PAGE = `<!DOCTYPE html><html><head><base target="_top"></head><body><a href="<?= APS_OAUTH_AUTH_URL ?>">Sign in</a>
<script>var k = <?!= JSON.stringify(typeof APS_BOOT_TICKET === 'undefined' ? null : APS_BOOT_TICKET) ?>; var t = (<?!= JSON.stringify(APS_BOOT_SESSION_TOKEN) ?>); var u = <?!= JSON.stringify(APS_BOOT_USER) ?>; var e = (<?!= JSON.stringify(APS_BOOT_ERROR) ?>);</script></body></html>`;
function pageFile(html = PAGE): string { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aps-')), 'Dashboard.html'); fs.writeFileSync(f, html); return f; }

async function serve(ctx: AppContext, html?: string) {
  const app = createApp(ctx, new DashboardPage(pageFile(html)));
  const srv = app.listen(0); await new Promise((r) => srv.once('listening', r));
  const base = 'http://127.0.0.1:' + (srv.address() as AddressInfo).port;
  const run = async (fn: string, args: unknown[]) => (await fetch(base + '/api/run/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args }) })).json();
  return { base, run, close: () => new Promise((r) => srv.close(r)) };
}
function bootToken(html: string): string | null { const m = html.match(/var t = \(("[0-9a-f-]{36}"|null)\)/); return m && m[1] !== 'null' ? JSON.parse(m[1]) : null; }

test('Google callback: valid code + fresh state → page carries the session token and user; reused / missing state refused', async () => {
  const ctx = testContext({ claims: { good: { email: 'admin' + D, email_verified: true }, gmail: { email: 'x@gmail.com', email_verified: true } } });
  const s = await serve(ctx);
  try {
    const first = await (await fetch(s.base + '/')).text();
    const state = (first.match(/state=([A-Za-z0-9_.-]+)/) || [])[1];
    assert.ok(state, 'sign-in link with a state nonce'); assert.ok(first.includes('&amp;x=&lt;&amp;&gt;'), 'auth URL HTML-escaped like <?= ?>');
    assert.ok(first.includes('<script src="/aps-gas-shim.js"></script>'), 'shim injected');
    assert.ok(first.includes('var t = (null)'), 'no token on a plain visit');
    const ok = await (await fetch(s.base + '/?code=good&state=' + state)).text();
    const token = bootToken(ok); assert.ok(token);
    assert.match(ok, /"role":"admin"/); assert.match(ok, /var e = \(null\)/);
    const replay = await (await fetch(s.base + '/?code=good&state=' + state)).text();
    assert.equal(bootToken(replay), null); assert.match(replay, /"code":"invalid_token"/);
    const st2 = ((await (await fetch(s.base + '/')).text()).match(/state=([A-Za-z0-9_.-]+)/) || [])[1];
    const gm = await (await fetch(s.base + '/?code=gmail&state=' + st2)).text();
    assert.match(gm, /"code":"invalid_email"/);
    const tk = await (await fetch(s.base + '/?ticket=aps-20261109-0042')).text();
    assert.ok(tk.includes('var k = "APS-20261109-0042"'), 'ticket deep link kept');
    const tkState = (tk.match(/state=([A-Za-z0-9_.-]+)/) || [])[1];
    const tkBack = await (await fetch(s.base + '/?code=good&state=' + tkState)).text();
    assert.ok(tkBack.includes('var k = "APS-20261109-0042"') && bootToken(tkBack), 'the ticket survives the Google round trip');
    assert.ok((await (await fetch(s.base + '/?ticket=<script>')).text()).includes('var k = null'), 'bad ticket ignored');
    const cancel = await (await fetch(s.base + '/?error=access_denied')).text();
    assert.match(cancel, /"code":"cancelled"/);
    const r = await fetch(s.base + '/healthz'); assert.deepEqual(await r.json(), { ok: true, phase: 1 });
    assert.equal(r.headers.get('x-powered-by'), null); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  } finally { await s.close(); }
});

test('API: same names and arguments as google.script.run; checks on the server; unported names say so; sign-out ends the session', async () => {
  const ctx = testContext({ claims: {}, access: { admin: { 'adminControl.access': false } } });
  const s = await serve(ctx);
  try {
    const sign = async (email: string) => { const r = await (await import('../src/app/context')).signInWithClaims(ctx, { email, email_verified: true }); assert.ok(r.ok); return (r as { token: string }).token; };
    const sup = await sign('super' + D), adm = await sign('admin' + D), tea = await sign('priya_aps8001' + D);
    const me = await s.run('getCurrentUser', [tea]); assert.equal(me.ok.role, 'teacher'); assert.equal(me.ok.name, 'Priya');
    const ac = await s.run('getAccessControl', [sup]);
    assert.equal(ac.ok.rows.length, 44); assert.equal(ac.ok.roles.length, 7); assert.equal(ac.ok.canEdit, false, 'read-only in Phase 1');
    assert.deepEqual(await s.run('getAccessControl', [adm]), { err: 'ACCESS_OFF: This section has been turned off for your role by the APS administrator.' }, 'Super Admin switched it off for Admin');
    assert.deepEqual(await s.run('getAccessControl', [tea]), { err: 'Only Admin / Super Admin can use Admin Control.' });
    assert.deepEqual(await s.run('getAccessControl', ['forged-token']), { err: 'SESSION_EXPIRED: please sign in again.' });
    const dash = await s.run('getDashboardData', [tea]); // Phase 2: Classes view served from Azure
    assert.equal(dash.ok.role, 'teacher'); assert.deepEqual(dash.ok.courses.map((c: { id: string }) => c.id), ['101'], 'a teacher sees only own classes');
    assert.deepEqual(await s.run('getDashboardData', ['forged-token']), { err: 'SESSION_EXPIRED: please sign in again.' });
    assert.deepEqual(await s.run('getRealtimeStatusSnapshot', [tea]), { err: 'NOT_ON_AZURE_YET: getRealtimeStatusSnapshot' });
    assert.deepEqual(await s.run('requireValidSession_', [tea]), { err: 'Bad request.' }, 'private helpers are never callable');
    const b = await s.run('getStartupBundle', [tea, ['getCurrentUser', 'getMaintenanceStatus']]);
    assert.equal(b.ok.getCurrentUser.ok.role, 'teacher'); assert.deepEqual(b.ok.getMaintenanceStatus, { err: 'NOT_ON_AZURE_YET: getMaintenanceStatus' });
    assert.deepEqual(await s.run('endSession', [tea]), { ok: { ok: true } });
    assert.deepEqual(await s.run('getCurrentUser', [tea]), { err: 'SESSION_EXPIRED: please sign in again.' });
    const bad = await fetch(s.base + '/api/run/getCurrentUser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
    assert.deepEqual(await bad.json(), { err: 'Bad request.' });
    assert.deepEqual(await s.run('getCurrentUser', 'x' as never), { err: 'Bad request.' });
  } finally { await s.close(); }
});

test('errors never reach the browser with tokens, keys or stack traces', async () => {
  const reg = new Registry().register('boom', () => { throw new Error('failed: Bearer ya29.abc access_token=zzz\n    at secret.ts:1'); });
  const r = await reg.call(testContext(), 'boom', []);
  assert.deepEqual(r, { err: 'failed: Bearer [hidden] access_token=[hidden]' });
  assert.equal(safeErrorMessage('-----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY----- x'), '[hidden] x');
  const { READS2 } = require('../src/api/endpoints/reads');
  const { ATTENDANCE_READS } = require('../src/api/endpoints/classes');
  assert.deepEqual(buildRegistry().names(), ['endSession', 'getAccessControl', 'getClassTeacherAvailabilityView', 'getCurrentUser', 'getDashboardData', 'getDirectoryIndex', 'getMyCountryPreference', 'getStartupBundle']
    .concat(ATTENDANCE_READS, Object.values(READS2).flat() as string[]).sort());
});

test('page renderer: fills exactly the five Code.gs template values, script-safe; refuses an unknown template value', () => {
  assert.deepEqual(checkTemplate(PAGE), []);
  assert.deepEqual(checkTemplate(PAGE + '<?= SOMETHING_NEW ?>'), ['<?= SOMETHING_NEW ?>']);
  assert.throws(() => new DashboardPage(pageFile(PAGE + '<?!= x ?>')), /does not fill yet/);
  assert.equal(jsonForScript({ a: '</script><b>' }), '{"a":"\\u003c/script\\u003e\\u003cb\\u003e"}');
  const html = new DashboardPage(pageFile()).render({ authUrl: 'https://x/?a=1&b="2"', token: 't-1', user: { name: '</script>' }, error: null });
  assert.ok(html.includes('href="https://x/?a=1&amp;b=&quot;2&quot;"')); assert.ok(html.includes('var t = ("t-1")')); assert.ok(!html.includes('</script>"'));
});

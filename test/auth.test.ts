import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testContext, testConfig, D } from './helpers';
import { signInWithClaims, requireSession, requireTab } from '../src/app/context';
import { MemorySessionStore } from '../src/auth/sessions';
import { StateNonces } from '../src/auth/google';
import { configProblems, loadConfig, parseList } from '../src/config';

test('sign-in: every role resolves in the Code.gs order; personal Gmail refused; unverified email refused', async () => {
  const ctx = testContext({ userRoles: { ['config_aps1' + D]: 'headmaster' } });
  const cases: [string, string][] = [
    ['super' + D, 'superadmin'], ['bod@amchats.org', 'vcfo_amchsts_bod'], ['ADMIN' + D, 'admin'], ['admin2@amchats.org', 'admin'],
    ['hm' + D, 'headmaster'], ['tcs_coord_aps8112' + D, 'vcfo_amchsts_bod'], ['config_aps1' + D, 'headmaster'],
    ['priya_aps8001' + D, 'teacher'], ['tts_hidden_aps9001' + D, 'teacher'], ['vp_aps7001' + D, 'teacher'], ['pt_aps7003' + D, 'teacher'],
    ['meena_aps5555' + D, 'student'], ['someone@namaps.org', 'authorized'], ['notmember_aps7002' + D, 'authorized'],
  ];
  for (const [email, role] of cases) {
    const r = await signInWithClaims(ctx, { email, email_verified: true });
    assert.ok(r.ok, email); if (!r.ok) continue;
    assert.equal(r.user.role, role, email);
    assert.equal((await requireSession(ctx, r.token)).role, role);
  }
  assert.deepEqual(await signInWithClaims(ctx, { email: 'kid@gmail.com', email_verified: true }), { ok: false, code: 'invalid_email' });
  const u = await signInWithClaims(ctx, { email: 'meena_aps5555' + D, email_verified: false });
  assert.equal(u.ok, false); assert.equal((u as { code: string }).code, 'invalid_token');
});

test('user payload: name, APSID, permissions, tab access from saved Access Control; Phase 2 fields safe', async () => {
  const ctx = testContext({ access: { student: { kb: false }, teacher: { tickets: false } } });
  const s = await signInWithClaims(ctx, { email: 'meena_aps5555' + D, email_verified: true });
  assert.ok(s.ok); if (!s.ok) return;
  assert.equal(s.user.name, 'Meena'); assert.equal(s.user.apsId, 'APS5555');
  assert.deepEqual(s.user.permissions, { readOnly: false, buttons: true, filters: false, tabs: true });
  assert.deepEqual(s.user.tabAccess, { kb: false, assignMon: false }, 'saved switch + the N (off-by-default) cell');
  const t = await signInWithClaims(ctx, { email: 'priya_aps8001' + D, email_verified: true });
  assert.ok(t.ok); if (!t.ok) return;
  assert.equal(t.user.tabAccess['tickets'], false); assert.equal(t.user.tabAccess['tickets.self'], false, 'child tab follows its parent');
  const a = await signInWithClaims(ctx, { email: 'admin' + D, email_verified: true });
  assert.ok(a.ok); if (!a.ok) return;
  assert.equal(a.user.name, 'Admin · admin'); assert.equal(a.user.canViewMonitoringFilters, true);
  assert.equal(a.user.coverageAccess, false); assert.equal(a.user.azurePhase, 1);
  const c = await signInWithClaims(ctx, { email: 'tcs_coord_aps8112' + D, email_verified: true });
  assert.ok(c.ok); if (c.ok) assert.equal(c.user.roleLabel, 'On-Call Coordinator');
});

test('sessions expire after the TTL; tokens are random; requireTab enforces Access Control server-side', async () => {
  let now = 1_000_000;
  const ctx = testContext({ now: () => now, access: { teacher: { attendance: false } } });
  const r = await signInWithClaims(ctx, { email: 'priya_aps8001' + D, email_verified: true });
  assert.ok(r.ok); if (!r.ok) return;
  assert.match(r.token, /^[0-9a-f-]{36}$/);
  await assert.rejects(requireTab(ctx, r.token, 'attendance'), /ACCESS_OFF/);
  assert.equal((await requireTab(ctx, r.token, 'kb')).email, 'priya_aps8001' + D);
  now += 21600 * 1000 + 1;
  await assert.rejects(requireSession(ctx, r.token), /^Error: SESSION_EXPIRED/);
  await assert.rejects(requireSession(ctx, 'forged'), /SESSION_EXPIRED/);
  await assert.rejects(requireSession(ctx, { role: 'admin' }), /SESSION_EXPIRED/, 'a client-sent role object is never a session');
  const store = new MemorySessionStore(10);
  const t1 = await store.create({ email: 'a', role: 'b' }), t2 = await store.create({ email: 'a', role: 'b' });
  assert.notEqual(t1, t2);
});

test('Google Sheet unreachable (no service account yet): listed staff still sign in; others get a clear message, never a wrong role', async () => {
  const ctx = testContext();
  const broken = { readCourses: async () => { throw new Error('GOOGLE_NOT_CONFIGURED'); }, readConfiguredUserRoles: async () => { throw new Error('GOOGLE_NOT_CONFIGURED'); }, readAccessOverrides: async () => ({}) };
  ctx.data = broken as never;
  const a = await signInWithClaims(ctx, { email: 'admin' + D, email_verified: true });
  assert.ok(a.ok); if (a.ok) assert.equal(a.user.role, 'admin');
  const b = await signInWithClaims(ctx, { email: 'bod@amchats.org', email_verified: true });
  assert.ok(b.ok); if (b.ok) assert.equal(b.user.role, 'vcfo_amchsts_bod');
  const t = await signInWithClaims(ctx, { email: 'priya_aps8001' + D, email_verified: true });
  assert.deepEqual(t, { ok: false, code: 'invalid_token', message: 'The dashboard cannot read class data right now. Please try again in a few minutes.' });
});

test('an unresolved Key Vault reference counts as "not set", never as a value', () => {
  const c = loadConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: '@Microsoft.KeyVault(SecretUri=https://kv/secrets/x/)', ADMIN_EMAILS: '@Microsoft.KeyVault(SecretUri=https://kv/secrets/y/)', NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  assert.equal(c.serviceAccountJson, ''); assert.deepEqual(c.adminEmails, []);
});

test('sign-in state: signed, single-use, 10 minutes; survives an app restart; forged or altered states refused', () => {
  let now = 1_000_000; const key = StateNonces.keyFromSecret('client-secret-for-test');
  const n = new StateNonces(600_000, () => now, key);
  const s = n.issue(); assert.equal(n.consume(s), true); assert.equal(n.consume(s), false, 'single use');
  const s2 = n.issue(); now += 600_001; assert.equal(n.consume(s2), false, 'expired after 10 minutes');
  assert.equal(n.consume(undefined), false); assert.equal(n.consume('abc'), false); assert.equal(n.consume('a.b'), false);
  // restart: a new instance with the same key (same client secret) accepts a state issued before the restart
  const before = n.issue('APS-20261109-0042');
  const afterRestart = new StateNonces(600_000, () => now, StateNonces.keyFromSecret('client-secret-for-test'));
  assert.deepEqual(afterRestart.take(before), { ok: true, ticket: 'APS-20261109-0042' }, 'ticket rides inside the state');
  // a different key (another app) or any change to the state is refused
  const other = new StateNonces(600_000, () => now, StateNonces.keyFromSecret('another-secret'));
  assert.equal(other.consume(n.issue()), false);
  const t = n.issue(); const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ n: 'x', t: now, k: 'APS-20260101-0001' })).toString('base64url') + '.' + sig;
  assert.equal(n.consume(forged), false); assert.equal(n.consume(body + '.' + sig.slice(0, -2) + 'AA'), false);
  assert.equal(n.consume(t), true);
  // nothing secret or personal inside: only a random value, the time and an optional ticket number
  assert.deepEqual(Object.keys(JSON.parse(Buffer.from(n.issue().split('.')[0], 'base64url').toString())).sort(), ['n', 't']);
  // without a key (local dev) each instance makes its own random key
  const a = new StateNonces(); const b = new StateNonces(); assert.equal(b.consume(a.issue()), false);
});

test('config: names match Script Properties; DEV_LOGIN refused in Azure; missing secrets reported by name only', () => {
  assert.deepEqual(parseList('["a@x.org"]', 'X'), ['a@x.org']);
  assert.deepEqual(parseList('not json', 'X', ['f']), ['f']);
  assert.deepEqual(parseList(undefined, 'X'), []);
  const azure = loadConfig({ WEBSITE_SITE_NAME: 'aps-dashboard', DEV_LOGIN: '1', GOOGLE_OAUTH_CLIENT_SECRET: 'shh-secret' } as NodeJS.ProcessEnv);
  const p = configProblems(azure);
  assert.ok(p.some((x) => /DEV_LOGIN must never/.test(x)));
  assert.ok(p.some((x) => /PUBLIC_BASE_URL/.test(x))); assert.ok(p.some((x) => /GOOGLE_OAUTH_CLIENT_ID/.test(x)));
  assert.ok(!p.join(' ').includes('shh-secret'), 'secret values are never printed');
  assert.deepEqual(testConfig().allowedDomains, ['avvaiyarpadasalai.org', 'amchats.org', 'namaps.org', 'apsamerica.org']);
});

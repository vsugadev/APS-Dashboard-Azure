/**
 * Phase 3 — the Apps Script live-data bridge (AzureBridge.gs, routed by doPost in PortalBridge.gs) and the Azure side
 * (src/live). The real Apps Script files run in the Apps Script mock; Azure's AppsScriptLiveSource calls their doPost.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { AppsScriptLiveSource, FixtureLiveSource, LIVE_TTL_MS, LIVE_STALE_MAX_MS, type FetchLike } from '../src/live/liveSource';
import { LIVE_KEYS, LIVE_PREFIXES, AZURE_SETTING_KEYS, NEVER_KEYS, NEVER_RE, liveAllowed } from '../src/live/allowlist';
import { loadConfig, configWarnings } from '../src/config';
import { bridgeUsable } from '../src/server';

const ROOT = path.join(__dirname, '..', '..');
const GAS = path.resolve(process.env.APS_GAS_PROJECT || path.join(ROOT, 'gas-source'));
const have = fs.existsSync(path.join(GAS, 'AzureBridge.gs')) && fs.existsSync(path.join(GAS, 'test', 'gasmock.js'));
const SECRET = 'az-bridge-test-secret-0123456789-abcdef';
const URL = 'https://script.google.com/macros/s/AKfyTEST/exec';

/** Code.gs + PortalBridge.gs + AzureBridge.gs in the Apps Script mock, with live data and secrets in both stores. */
function appsScript(extra: Record<string, string> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { makeContext } = require(path.join(GAS, 'test', 'gasmock.js'));
  const env = makeContext({ props: { AZURE_BRIDGE_SECRET: SECRET, PORTAL_SHARED_SECRET: '', presenceMap: '{"a@x":{"lastSeen":"2026-11-11T10:00:00.000Z"}}', classStatusMap: '{"1":{"status":"cancelled"}}',
    onCallTeachers_v1: '[]', rosterHiddenStaffVisible_v1: 'true', 'GOOGLE_REVIEW_PROMPT_s@x': '1', EXAM_QP_DOWNLOAD_KEY_SECRET: 'never', TICKET_MAIL_SERVICE_ACCOUNT_JSON: '{"private_key":"never"}',
    ZOHO_REFRESH_TOKEN: 'never', aps_session_abc: '{"email":"never"}', ADMIN_EMAILS: '["never@x"]', dashboardRolePermissions_v1: '{"never":1}', SOME_UNLISTED_KEY: 'never', ...extra } });
  Object.assign(env.userProps, { lastLoginMap: '{"a@x":{"db":"2026-11-10T10:00:00.000Z"}}', onboardedStudents: '{}', ZOHO_ACCESS_TOKEN: 'never' });
  env.ctx.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ setMimeType: () => ({ getContent: () => t }), getContent: () => t }) };
  const log: string[] = []; env.ctx.console = { log() {}, info() {}, warn: (m: string) => log.push(String(m)), error: (m: string) => log.push(String(m)) };
  for (const f of ['Code.gs', 'PortalBridge.gs', 'AzureBridge.gs']) vm.runInContext(fs.readFileSync(path.join(GAS, f), 'utf8'), env.ctx, { filename: f });
  const doPost = (body: string) => JSON.parse(env.ctx.doPost({ postData: { contents: body } }).getContent());
  const fetchImpl: FetchLike & { calls: number } = Object.assign(async (_u: string, init: { body: string }) => { fetchImpl.calls++; const t = env.ctx.doPost({ postData: { contents: init.body } }).getContent(); return { ok: true, status: 200, text: async () => t }; }, { calls: 0 });
  return { env, doPost, fetchImpl, log };
}

test('the allow-lists in AzureBridge.gs (Apps Script) and src/live/allowlist.ts (Azure) are identical', { skip: !have && 'gas-source/AzureBridge.gs not found' }, () => {
  const c: any = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(GAS, 'AzureBridge.gs'), 'utf8'), c);
  assert.deepEqual(Array.from(c.AZURE_BRIDGE_LIVE_KEYS_), LIVE_KEYS);
  assert.deepEqual(Array.from(c.AZURE_BRIDGE_LIVE_PREFIXES_), LIVE_PREFIXES);
  assert.deepEqual(Array.from(c.AZURE_BRIDGE_AZURE_SETTING_KEYS_), AZURE_SETTING_KEYS);
  assert.deepEqual(Array.from(c.AZURE_BRIDGE_NEVER_KEYS_), NEVER_KEYS);
  assert.equal(String(c.AZURE_BRIDGE_NEVER_RE_), String(NEVER_RE));
  for (const k of LIVE_KEYS) assert.ok(!NEVER_RE.test(k), 'a live key must not look like a secret: ' + k);
  for (const k of ['AZURE_BRIDGE_SECRET', 'PORTAL_SHARED_SECRET', 'ATTENDANCE_REFRESH_TOKEN', 'ADMIN_EMAILS', 'aps_session_x', 'TICKET_MAIL_SERVICE_ACCOUNT_JSON']) assert.equal(liveAllowed(k), false, k);
});

test('bridge: a signed request gets ONLY the allow-listed Script + User Properties — never secrets, roles, sessions or unlisted keys', { skip: !have && 'Apps Script files not found' }, async () => {
  const A = appsScript();
  const src = new AppsScriptLiveSource(URL, SECRET, A.fetchImpl);
  const s = await src.get();
  assert.deepEqual(Object.keys(s.script).sort(), ['GOOGLE_REVIEW_PROMPT_s@x', 'classStatusMap', 'onCallTeachers_v1', 'presenceMap', 'rosterHiddenStaffVisible_v1']);
  assert.deepEqual(Object.keys(s.user).sort(), ['lastLoginMap', 'onboardedStudents']);
  assert.ok(!JSON.stringify(s).includes('never'), 'no secret / role / session value crossed');
  // Apps Script itself filtered (not only Azure): the raw answer has no secret either
  const p = JSON.stringify({ action: 'liveSnapshot', v: 1 }), ts = String(Date.now()), nonce = '11111111-2222-3333-4444-555555555555';
  const sig = require('crypto').createHmac('sha256', SECRET).update(ts + '.' + nonce + '.' + p).digest('hex');
  const raw = A.doPost(JSON.stringify({ azure: 1, p, ts, nonce, sig }));
  assert.equal(raw.ok, true); assert.ok(!JSON.stringify(raw).includes('never'));
  assert.equal(A.doPost(JSON.stringify({ azure: 1, p, ts, nonce, sig })).code, 'REPLAY', 'a nonce works once');
  assert.equal(A.env.wb.getSheetByName('Portal_Bridge_Log'), null, 'Azure calls are not written to the Portal log sheet');
  assert.equal(A.env.stats.mails.length, 0); assert.equal(A.env.props.presenceMap, '{"a@x":{"lastSeen":"2026-11-11T10:00:00.000Z"}}', 'nothing changed in Apps Script');
});

test('bridge: wrong secret, stale or malformed requests are refused; no secret → NOT_CONFIGURED; the Parent Portal path is unchanged', { skip: !have && 'Apps Script files not found' }, async () => {
  const A = appsScript();
  const sign = (secret: string, tsMs: number, p = JSON.stringify({ action: 'liveSnapshot' })) => { const ts = String(tsMs), nonce = require('crypto').randomUUID(); return JSON.stringify({ azure: 1, p, ts, nonce, sig: require('crypto').createHmac('sha256', secret).update(ts + '.' + nonce + '.' + p).digest('hex') }); };
  assert.equal(A.doPost(sign('wrong-secret-wrong-secret-wrong-secret', Date.now())).code, 'BAD_SIGNATURE');
  assert.equal(A.doPost(sign(SECRET, Date.now() - 10 * 60_000)).code, 'STALE');
  assert.equal(A.doPost(sign(SECRET, Date.now(), JSON.stringify({ action: 'sendEmail' }))).code, 'BAD_REQUEST', 'only liveSnapshot');
  assert.equal(A.doPost(JSON.stringify({ azure: 1, p: '{}', ts: 'x', nonce: 'y', sig: 'z' })).code, 'BAD_REQUEST');
  const wrong = new AppsScriptLiveSource(URL, 'wrong-secret-wrong-secret-wrong-secret', A.fetchImpl);
  const warn = console.warn; const seen: string[] = []; console.warn = (m: string) => seen.push(m);
  try { assert.deepEqual(await wrong.get(), { script: {}, user: {} }, 'refused → empty live data, page still works'); } finally { console.warn = warn; }
  assert.match(seen.join('\n'), /BAD_SIGNATURE/); assert.ok(!seen.join('\n').includes('wrong-secret'), 'the secret is never logged');
  assert.ok(A.log.every((l) => !l.includes(SECRET)), 'Apps Script log has no secret');
  A.env.props.AZURE_BRIDGE_SECRET = 'short';
  assert.equal(A.doPost(sign('short', Date.now())).code, 'NOT_CONFIGURED');
  const portal = A.doPost(JSON.stringify({ portal: 1, p: '{}', ts: '1', nonce: 'n', sig: 's' }));
  assert.equal(portal.code, 'NOT_CONFIGURED', 'Parent Portal request still goes through its own check');
  assert.equal(A.doPost('{}').code, 'BAD_REQUEST');
});

test('live source: one fetch for concurrent requests, kept 20 s, last good snapshot used up to 5 min after a failure, then empty', async () => {
  let now = 1_000_000, fail = false, calls = 0;
  const f: FetchLike = async () => { calls++; if (fail) return { ok: false, status: 500, text: async () => 'Google error page with details' }; return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: { script: { presenceMap: '{"n":' + calls + '}', ADMIN_EMAILS: '["x"]' }, user: {} } }) }; };
  const src = new AppsScriptLiveSource(URL, SECRET, f, () => now);
  const [a, b] = await Promise.all([src.get(), src.get()]);
  assert.equal(calls, 1, 'one fetch shared'); assert.deepEqual(a, b); assert.deepEqual(Object.keys(a.script), ['presenceMap'], 'Azure filters again');
  now += LIVE_TTL_MS - 1; await src.get(); assert.equal(calls, 1, 'cached');
  now += 2; await src.get(); assert.equal(calls, 2, 'refreshed after 20 s');
  fail = true; const warn = console.warn; const logs: string[] = []; console.warn = (m: string) => logs.push(m);
  try {
    now += LIVE_TTL_MS + 1; assert.equal((await src.get()).script.presenceMap, '{"n":2}', 'last good snapshot');
    now += LIVE_STALE_MAX_MS; assert.deepEqual(await src.get(), { script: {}, user: {} }, 'too old → empty');
  } finally { console.warn = warn; }
  assert.match(logs[0], /HTTP_500/); assert.ok(!logs.join(' ').includes('Google error page'), 'no response body in the log');
  assert.equal(src.status().ok, true); assert.match(src.status().error, /HTTP_500/);
});

test('bridge settings: used only with the real /exec address and a 32+ character secret; warnings name the problem, never the value', () => {
  const base = { PUBLIC_BASE_URL: 'https://x', NODE_ENV: 'production' } as NodeJS.ProcessEnv;
  assert.equal(bridgeUsable(loadConfig({ ...base, APPS_SCRIPT_BRIDGE_URL: URL, APPS_SCRIPT_BRIDGE_SECRET: SECRET })), true);
  assert.equal(bridgeUsable(loadConfig({ ...base, APPS_SCRIPT_BRIDGE_URL: 'https://evil.example/exec', APPS_SCRIPT_BRIDGE_SECRET: SECRET })), false);
  assert.equal(bridgeUsable(loadConfig({ ...base, APPS_SCRIPT_BRIDGE_URL: URL, APPS_SCRIPT_BRIDGE_SECRET: 'short' })), false);
  const w = configWarnings(loadConfig({ ...base, APPS_SCRIPT_BRIDGE_URL: URL, APPS_SCRIPT_BRIDGE_SECRET: 'short' })).join(' ');
  assert.match(w, /shorter than 32/); assert.ok(!w.includes('short '), 'value not printed');
  assert.match(configWarnings(loadConfig(base)).join(' '), /APPS_SCRIPT_BRIDGE_URL/);
  assert.deepEqual((new FixtureLiveSource({ script: { presenceMap: '{}', ATTENDANCE_REFRESH_TOKEN: 't' }, user: {} })).status().ok, true);
});

test('v0.8.3: BAD_SIGNATURE → Azure logs the length + fingerprint of its secret (same formula as Apps Script), never the value; a pasted space / line break is trimmed', async () => {
  const { secretFingerprint } = await import('../src/live/liveSource');
  const crypto = await import('crypto');
  const v = 'a'.repeat(64);
  assert.equal(secretFingerprint(v), crypto.createHash('sha256').update(v, 'utf8').digest('hex').slice(0, 8));
  const { loadConfig } = await import('../src/config');
  const cfg: any = loadConfig({ APPS_SCRIPT_BRIDGE_SECRET: v + ' \n', PUBLIC_BASE_URL: 'https://x.azurewebsites.net' } as any);
  assert.equal(cfg.appsScriptBridgeSecret, v, 'trimmed');
  const { checkLiveBridge } = await import('../src/server');
  const lines: string[] = [];
  const ctx: any = { cfg: { dataMode: 'sheets', appsScriptBridgeUrl: 'https://script.google.com/macros/s/ABC_def-1/exec', appsScriptBridgeSecret: v },
    live: { get: async () => ({ script: {}, user: {} }), status: () => ({ ok: false, at: 0, error: 'BAD_SIGNATURE' }) } };
  assert.equal(await checkLiveBridge(ctx, (m) => lines.push(m)), false);
  assert.ok(lines.some((l) => l.includes("Azure's secret: 64 characters, fingerprint " + secretFingerprint(v))), lines.join('\n'));
  assert.ok(!lines.join('\n').includes(v), 'never the value');
});
test('Phase 3 step 2 (AzureBridge.gs r131): a signed heartbeat batch records online + Last Login (DB) like a visit — APS e-mails only, nothing else written; unsigned refused', { skip: !have && 'Apps Script files not found' }, async () => {
  const { BridgeHeartbeat } = await import('../src/live/heartbeat');
  const A = appsScript(); const G: any = A.env.ctx;
  const others = () => JSON.stringify([A.env.props, A.env.userProps].map((o: any) => Object.keys(o).filter((x) => x !== 'presenceMap' && x !== 'lastLoginMap').sort().map((k) => [k, o[k]]))); // Code.gs may move these two between its stores (apsBigSetSafe_)
  const propsBefore = others();
  G.apsBigSetSafe_(G.PRESENCE_PROP_KEY, JSON.stringify({ 'a@x': { lastSeen: '2026-01-01T00:00:00.000Z' }, 'fresh_aps1@avvaiyarpadasalai.org': { lastSeen: new Date(Date.now() - 60000).toISOString(), loginAt: new Date(Date.now() - 120000).toISOString() } }), 'test');
  const hb = new BridgeHeartbeat(URL, SECRET, A.fetchImpl, Date.now, false, () => {});
  const t1 = 'priya_aps8001@avvaiyarpadasalai.org', t2 = 'meena_aps5555@avvaiyarpadasalai.org';
  hb.note(t1); hb.note(t2); hb.note('Priya_APS8001@avvaiyarpadasalai.org'); hb.note('someone@gmail.com'); hb.note('not an email');
  await hb.flush();
  assert.deepEqual(hb.status(), { sent: 3, failed: 0, error: '' }, 'priya (once), meena, gmail (Apps Script ignores it)');
  const pres = G.getPresenceMap_();
  assert.ok(pres[t1] && pres[t2] && !pres['someone@gmail.com'], 'online now: APS accounts only');
  assert.ok(Date.now() - Date.parse(pres[t1].lastSeen) < 60000 && pres[t1].loginAt === pres[t1].lastSeen, 'fresh login');
  assert.ok(pres['fresh_aps1@avvaiyarpadasalai.org'], 'other people online kept'); assert.ok(!pres['a@x'], 'entries older than 24 h dropped (same as recordHeartbeat_)');
  const ll = JSON.parse(G.apsBigGet_(G.LAST_LOGIN_PROP_KEY));
  assert.ok(ll[t1] && ll[t1].db && Date.now() - Date.parse(ll[t1].db) < 60000, 'Last Login DB slot');
  assert.ok(ll['a@x'], 'other last logins kept');
  // a second heartbeat within the online window keeps the login time, moves lastSeen; throttled on Azure unless forced (sign-off)
  const login1 = pres[t1].loginAt;
  hb.note(t1); await hb.flush(); assert.equal(hb.status().sent, 3, 'within 60 s: not sent again');
  hb.note(t1, true); await hb.flush(); assert.equal(hb.status().sent, 4, 'sign-off: always sent');
  assert.equal(G.getPresenceMap_()[t1].loginAt, login1, 'same online spell → login time kept');
  assert.equal(others(), propsBefore, 'only presence + Last Login written — no other property created or changed');
  // unsigned / wrong secret: refused, nothing written
  const p = JSON.stringify({ action: 'heartbeat', v: 1, emails: ['x_aps1@avvaiyarpadasalai.org'] }), ts = String(Date.now()), nonce = '21111111-2222-3333-4444-555555555555';
  const bad = A.doPost(JSON.stringify({ azure: 1, p, ts, nonce, sig: require('crypto').createHmac('sha256', 'wrong-secret-0123456789-0123456789').update(ts + '.' + nonce + '.' + p).digest('hex') }));
  assert.equal(bad.code, 'BAD_SIGNATURE'); assert.ok(!G.getPresenceMap_()['x_aps1@avvaiyarpadasalai.org']);
  // at most 200 per call
  const many = Array.from({ length: 250 }, (_v, i) => 'p' + i + '_aps' + (9000 + i) + '@avvaiyarpadasalai.org');
  const p2 = JSON.stringify({ action: 'heartbeat', v: 1, emails: many }), ts2 = String(Date.now()), n2 = '31111111-2222-3333-4444-555555555555';
  const r2 = A.doPost(JSON.stringify({ azure: 1, p: p2, ts: ts2, nonce: n2, sig: require('crypto').createHmac('sha256', SECRET).update(ts2 + '.' + n2 + '.' + p2).digest('hex') }));
  assert.equal(r2.ok, true, JSON.stringify(r2)); assert.equal(r2.result.recorded, 200);
});

test('Phase 3 step 2: heartbeat sender — failures kept and retried, old Apps Script (Unknown action) pauses 10 min, log never has e-mails or the secret', async () => {
  const { BridgeHeartbeat, NoopHeartbeat } = await import('../src/live/heartbeat');
  let now = 1_800_000_000_000; let mode = 'down'; const bodies: string[] = []; const logs: string[] = [];
  const f: FetchLike = async (_u, init) => { bodies.push(init.body);
    if (mode === 'down') return { ok: false, status: 503, text: async () => '' };
    if (mode === 'old') return { ok: true, status: 200, text: async () => JSON.stringify({ ok: false, code: 'BAD_REQUEST', message: 'Unknown action.' }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: { recorded: 1 } }) }; };
  const hb = new BridgeHeartbeat(URL, SECRET, f, () => now, false, (m) => logs.push(m));
  hb.note('kavi_aps8002@avvaiyarpadasalai.org'); await hb.flush();
  assert.equal(hb.status().error, 'HTTP_503'); assert.equal(hb.status().sent, 0);
  mode = 'ok'; now += 15000; await hb.flush(); assert.equal(hb.status().sent, 1, 'kept and sent with the next batch');
  const sent = JSON.parse(JSON.parse(bodies[bodies.length - 1]).p); assert.deepEqual(sent, { action: 'heartbeat', v: 1, emails: ['kavi_aps8002@avvaiyarpadasalai.org'] });
  mode = 'old'; now += 70000; hb.note('devi_aps5557@avvaiyarpadasalai.org'); await hb.flush();
  assert.match(logs.join('\n'), /deploy AzureBridge\.gs r131/);
  const calls = bodies.length; now += 60000; await hb.flush(); assert.equal(bodies.length, calls, 'paused');
  mode = 'ok'; now += 10 * 60000; await hb.flush(); assert.equal(hb.status().error, '', 'resumes after the pause');
  assert.ok(!/aps8002|aps5557|az-bridge-test-secret/.test(logs.join('\n')), 'no e-mail or secret in the log');
  const n = new NoopHeartbeat(); n.note(); await n.flush(); assert.equal(n.status().sent, 0);
});

test('write phase step 1 (AzureBridge.gs r132): the call list is identical on both sides', { skip: !have && 'gas-source/AzureBridge.gs not found' }, async () => {
  const { WRITE_THROUGH } = await import('../src/api/endpoints/writes');
  const c: any = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(GAS, 'AzureBridge.gs'), 'utf8'), c);
  assert.deepEqual(Array.from(c.AZURE_BRIDGE_CALLS_), WRITE_THROUGH);
  for (const n of WRITE_THROUGH) assert.ok(/^(save|set)[A-Z]/.test(n), n + ' is a settings save');
});

test('write phase step 1: a Save on Azure runs the REAL Code.gs function in Apps Script for the signed-in person — Apps Script decides the role; refusals, unlisted functions and non-APS accounts stopped; temporary session removed; Azure caches refreshed', { skip: !have && 'Apps Script files not found' }, async () => {
  const ADMIN = 'admin_aps9100@avvaiyarpadasalai.org', TEACHER = 'teach_aps9101@avvaiyarpadasalai.org';
  const A = appsScript({ ADMIN_EMAILS: JSON.stringify([ADMIN]), rosterHiddenStaffVisible_v1: 'true' });
  const { testContext, testConfig } = await import('./helpers');
  const { buildRegistry } = await import('../src/server');
  const cfg = testConfig({ dataMode: 'sheets', appsScriptBridgeUrl: URL, appsScriptBridgeSecret: SECRET, writeThroughEnabled: true });
  const ctx: any = testContext({ cfg }); let inv = 0; ctx.live = { get: async () => ({ script: {}, user: {} }), status: () => ({ ok: true, at: 0, error: '' }), invalidate: () => { inv++; } };
  const reg = buildRegistry(A.fetchImpl);
  const admin = await ctx.sessions.create({ email: ADMIN, role: 'admin' });
  const r: any = await reg.call(ctx, 'setRosterHiddenStaffVisible', [admin, false]);
  assert.deepEqual(r, { ok: { visible: false } }, JSON.stringify(r));
  assert.equal(A.env.props.rosterHiddenStaffVisible_v1, 'false', 'written in Apps Script by the real function');
  assert.equal(inv, 1, 'Azure live snapshot refreshed after the save');
  // Azure says "admin" for a teacher (outdated / forged role) — Apps Script works out the role itself and refuses
  const forged = await ctx.sessions.create({ email: TEACHER, role: 'admin' });
  const f: any = await reg.call(ctx, 'setRosterHiddenStaffVisible', [forged, true]);
  assert.match(String(f.err), /Only Admin users can hide or show/); assert.equal(A.env.props.rosterHiddenStaffVisible_v1, 'false', 'unchanged');
  // the function's own validation message reaches the page unchanged
  const v: any = await reg.call(ctx, 'saveAccessControl', [admin, []]);
  assert.match(String(v.err), /No changes to save/);
  // straight to the bridge: an unlisted function, a non-APS account → refused
  const crypto = require('crypto');
  const raw = (pl: unknown) => { const p = JSON.stringify(pl), ts = String(Date.now()), nonce = crypto.randomUUID(); return A.doPost(JSON.stringify({ azure: 1, p, ts, nonce, sig: crypto.createHmac('sha256', SECRET).update(ts + '.' + nonce + '.' + p).digest('hex') })); };
  assert.equal(raw({ action: 'call', v: 1, fn: 'saveDashboardUserRole', args: ['x@avvaiyarpadasalai.org', 'admin', true], email: ADMIN }).code, 'BAD_REQUEST');
  assert.equal(raw({ action: 'call', v: 1, fn: 'endSession', args: [], email: ADMIN }).code, 'BAD_REQUEST');
  assert.equal(raw({ action: 'call', v: 1, fn: 'setRosterHiddenStaffVisible', args: [true], email: 'someone@gmail.com' }).code, 'BAD_REQUEST');
  assert.equal(A.env.props.rosterHiddenStaffVisible_v1, 'false');
  // no temporary session left behind in Apps Script
  assert.deepEqual(Object.keys(A.env.cache || {}).filter((k) => /^aps_sess_az_/.test(k)), [], 'temporary sessions removed');
  // switched off on Azure → the old answer
  const ctxOff: any = testContext({ cfg: { ...cfg, writeThroughEnabled: false } });
  const off = await ctxOff.sessions.create({ email: ADMIN, role: 'admin' });
  assert.match(String(((await reg.call(ctxOff, 'setRosterHiddenStaffVisible', [off, true])) as any).err), /NOT_ON_AZURE_YET/);
  // no session → refused before anything is sent
  const calls = A.fetchImpl.calls;
  assert.match(String(((await reg.call(ctx, 'setRosterHiddenStaffVisible', ['bogus', true])) as any).err), /SESSION_EXPIRED/);
  assert.equal(A.fetchImpl.calls, calls, 'nothing sent without a session');
});

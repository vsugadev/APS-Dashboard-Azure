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
function appsScript() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { makeContext } = require(path.join(GAS, 'test', 'gasmock.js'));
  const env = makeContext({ props: { AZURE_BRIDGE_SECRET: SECRET, PORTAL_SHARED_SECRET: '', presenceMap: '{"a@x":{"lastSeen":"2026-11-11T10:00:00.000Z"}}', classStatusMap: '{"1":{"status":"cancelled"}}',
    onCallTeachers_v1: '[]', rosterHiddenStaffVisible_v1: 'true', 'GOOGLE_REVIEW_PROMPT_s@x': '1', EXAM_QP_DOWNLOAD_KEY_SECRET: 'never', TICKET_MAIL_SERVICE_ACCOUNT_JSON: '{"private_key":"never"}',
    ZOHO_REFRESH_TOKEN: 'never', aps_session_abc: '{"email":"never"}', ADMIN_EMAILS: '["never@x"]', dashboardRolePermissions_v1: '{"never":1}', SOME_UNLISTED_KEY: 'never' } });
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

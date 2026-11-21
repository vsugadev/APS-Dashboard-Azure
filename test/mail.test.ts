/** Phase 4 step 3 (v0.19.0): email From donotreply@ sent by Azure — MIME parity with Code.gs apsGmailSend_, TEST guard, checks. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path'; import vm from 'vm';
import { GmailSender, buildMime, b64url, describeMailError, testGuardSettings, createMailSender, checkMail, type MailFetch } from '../src/mail/gmailSender';
import { testConfig } from './helpers';

const LIVE = { testing: false, mode: 'REDIRECT' as const, redirectTo: 'info@avvaiyarpadasalai.org', dailyCap: 30 };
const msg = { to: ['t1@avvaiyarpadasalai.org', 't2@avvaiyarpadasalai.org'], cc: ['admin@avvaiyarpadasalai.org'], bcc: ['b@avvaiyarpadasalai.org'], subject: 'Report — வணக்கம்', html: '<p>Hi</p>', text: 'Hi' };
const decodeRaw = (raw: string) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

/** Runs the REAL Code.gs apsGmailSend_ (service-account mode) with Google stubs and returns the MIME it sent. */
function codeGsMime(m: typeof msg): string {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'gas-source', 'Code.gs'), 'utf8');
  const grab = (name: string) => { const re = new RegExp('(?:^|\\n)(function ' + name + '\\([\\s\\S]*?\\n\\})', 'm'); const x = src.match(re); if (!x) throw new Error('not found ' + name); return x[1]; };
  const profiles = (src.match(/var APS_MAIL_PROFILES_ = \{[\s\S]*?\n\};/) || [''])[0];
  let sent = '';
  const ctx: any = {
    console: { log() {}, error() {}, warn() {} },
    Utilities: {
      newBlob: (s: string) => ({ getBytes: () => Buffer.from(s, 'utf8') }),
      base64Encode: (b: any) => Buffer.from(b).toString('base64'),
      base64EncodeWebSafe: (b: any) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      getUuid: () => '11111111-2222-3333-4444-555555555555',
      computeRsaSha256Signature: () => [1, 2, 3],
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => (k === 'TICKET_MAIL_SERVICE_ACCOUNT_JSON' ? JSON.stringify({ client_email: 'sa@x', private_key: 'k' }) : null) }) },
    UrlFetchApp: { fetch: (url: string, o: any) => {
      if (/oauth2/.test(url)) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: 'tok', expires_in: 3600 }) };
      sent = decodeRaw(JSON.parse(o.payload).raw); return { getResponseCode: () => 200, getContentText: () => '{}' };
    } },
    rosterProp_: (_k: string, d: string) => d,
    apsTestMailGuard_: (x: any) => ({ send: true, m: x, mode: 'LIVE' }),
  };
  vm.createContext(ctx);
  vm.runInContext([profiles, 'var APS_MAIL_TOKEN_MEMO_ = {};', grab('apsMailProfile_'), grab('apsMailFrom_'), grab('apsMailMode_'), grab('tkB64url_'), grab('apsMailAccessToken_'), grab('tkEncodeHeader_'), grab('apsGmailSend_'),
    // one-line helpers above can pull in neighbours; the TEST guard is pinned to LIVE here (tested separately)
    'apsTestMailGuard_ = function (x) { return { send: true, m: x, mode: "LIVE" }; }; rosterProp_ = function (k, d) { return d; };'].join('\n'), ctx);
  const r = ctx.apsGmailSend_('TICKETS', JSON.parse(JSON.stringify(m)));
  assert.equal(r.ok, true);
  return sent;
}

test('MIME: byte-for-byte the same message as Code.gs apsGmailSend_ (From, To, Cc, Bcc, Reply-To, UTF-8 subject, text + html)', () => {
  const ours = buildMime('donotreply@avvaiyarpadasalai.org', 'APS Dashboard Tickets', msg, 'aps_11111111222233334444555555555555');
  assert.equal(ours, codeGsMime(msg));
  assert.match(ours, /^From: APS Dashboard Tickets <donotreply@avvaiyarpadasalai\.org>\r\n/);
});

test('MIME: line breaks in a subject or address can never add a header', () => {
  const m = buildMime('donotreply@avvaiyarpadasalai.org', 'APS', { to: ['a@x.org\r\nBcc: evil@x.org'], subject: 'Hi\r\nBcc: evil@x.org', html: '', text: '' }, 'b');
  assert.ok(!/\r\nBcc:/.test(m));
});

test('send: LIVE goes to the real recipients through users/me/messages/send with the mailbox token', async () => {
  const calls: { url: string; init: any }[] = [];
  const f: MailFetch = async (url, init) => { calls.push({ url, init }); return { status: 200 }; };
  const s = new GmailSender('donotreply@avvaiyarpadasalai.org', 'APS Dashboard Tickets', async () => 'tok', LIVE, f, () => new Date(), () => {});
  const r = await s.send(msg);
  assert.deepEqual(r, { ok: true, mode: 'LIVE' });
  assert.equal(calls[0].url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  const raw = decodeRaw(JSON.parse(calls[0].init.body).raw);
  assert.match(raw, /\r\nTo: t1@avvaiyarpadasalai\.org, t2@avvaiyarpadasalai\.org\r\nCc: admin@avvaiyarpadasalai\.org\r\nBcc: b@avvaiyarpadasalai\.org\r\n/);
  assert.equal(b64url('a?>'), Buffer.from('a?>').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
});

test('send: TESTING → only the redirect address, "[TEST ENVIRONMENT]" subject, banner lists LIVE recipients (BCC as a count); OFF and the daily cap send nothing', async () => {
  const bodies: string[] = []; const f: MailFetch = async (_u, init) => { bodies.push(decodeRaw(JSON.parse(init.body).raw)); return { status: 200 }; };
  const s = new GmailSender('donotreply@avvaiyarpadasalai.org', 'APS', async () => 'tok', { testing: true, mode: 'REDIRECT', redirectTo: 'info@avvaiyarpadasalai.org', dailyCap: 1 }, f, () => new Date('2026-11-21T12:00:00Z'), () => {});
  assert.equal((await s.send(msg)).mode, 'TEST_REDIRECT');
  assert.match(bodies[0], /\r\nTo: info@avvaiyarpadasalai\.org\r\n/); assert.ok(!/\r\nCc:|\r\nBcc:/.test(bodies[0]));
  assert.match(bodies[0], /Subject: =\?UTF-8\?B\?/);
  const html = Buffer.from(bodies[0].split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n')[0], 'base64').toString('utf8');
  assert.match(html, /TEST ENVIRONMENT/); assert.match(html, /t1@avvaiyarpadasalai\.org/); assert.match(html, /1 hidden recipient/); assert.ok(!/b@avvaiyarpadasalai/.test(html));
  assert.deepEqual(await s.send(msg), { ok: true, mode: 'TEST_CAP' }); assert.equal(bodies.length, 1, 'cap reached → not sent');
  const off = new GmailSender('d@x', 'APS', async () => 'tok', { testing: true, mode: 'OFF', redirectTo: 'i@x', dailyCap: 30 }, f, () => new Date(), () => {});
  assert.deepEqual(await off.send(msg), { ok: true, mode: 'TEST_OFF' }); assert.equal(bodies.length, 1);
});

test('send never throws: sign-in failure → auth:true with the fix; Gmail 403 → auth:true; nothing secret in the error', async () => {
  const s = new GmailSender('donotreply@avvaiyarpadasalai.org', 'APS', async () => { throw new Error('unauthorized_client: Client is unauthorized to retrieve access tokens'); }, LIVE, async () => ({ status: 200 }), () => new Date(), () => {});
  const r = await s.send(msg); assert.equal(r.ok, false); assert.equal(r.auth, true); assert.match(String(r.error), /gmail\.send/);
  const s2 = new GmailSender('d@x', 'APS', async () => 'ya29.secret', LIVE, async () => ({ status: 403 }), () => new Date(), () => {});
  const r2 = await s2.send(msg); assert.deepEqual(r2, { ok: false, mode: 'LIVE', auth: true, error: 'Gmail API HTTP 403' });
  assert.match(describeMailError(new Error('invalid_grant'), 'donotreply@x'), /active Workspace mailbox/);
  assert.ok(!/ya29/.test(JSON.stringify(r2)));
});

test('config: off by default; MAIL_FROM outside the domains → off; TEST settings read; start-up check sends a test email only to an APS address', async () => {
  assert.equal(createMailSender(testConfig()), null);
  assert.equal(createMailSender(testConfig({ mailEnabled: true, mailFrom: 'x@gmail.com' })), null);
  assert.ok(createMailSender(testConfig({ mailEnabled: true })));
  assert.equal(testConfig().mailFrom, 'donotreply@avvaiyarpadasalai.org');
  const g = testGuardSettings(testConfig({ dashboardEnvironment: 'TESTING', testEmail: { mode: 'off', redirectTo: 'bad', dailyCap: '' } }));
  assert.deepEqual(g, { testing: true, mode: 'OFF', redirectTo: 'info@avvaiyarpadasalai.org', dailyCap: 30 });

  const sent: string[] = []; const logs: string[] = [];
  const s = new GmailSender('donotreply@avvaiyarpadasalai.org', 'APS', async () => 'tok', LIVE, async (_u, init) => { sent.push(decodeRaw(JSON.parse(init.body).raw)); return { status: 200 }; }, () => new Date(), () => {});
  assert.equal(await checkMail(s, testConfig({ mailTestTo: 'someone@gmail.com' }), '0.19.0', (m) => logs.push(m)), true);
  assert.equal(sent.length, 0); assert.match(logs.join('\n'), /MAIL_TEST_TO must be one APS address/);
  await checkMail(s, testConfig({ mailTestTo: 'info@avvaiyarpadasalai.org' }), '0.19.0', (m) => logs.push(m));
  assert.equal(sent.length, 1); assert.match(sent[0], /\r\nTo: info@avvaiyarpadasalai\.org\r\n/); assert.match(logs.join('\n'), /test email sent to info@/);
  const bad = new GmailSender('donotreply@avvaiyarpadasalai.org', 'APS', async () => { throw new Error('invalid_grant'); }, LIVE, async () => ({ status: 200 }), () => new Date(), () => {});
  logs.length = 0; assert.equal(await checkMail(bad, testConfig({ mailTestTo: 'info@avvaiyarpadasalai.org' }), '0.19.0', (m) => logs.push(m)), false);
  assert.match(logs[0], /cannot send as donotreply@/); assert.equal(sent.length, 1, 'no test email when sign-in fails');
});

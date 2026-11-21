/**
 * Phase 4 step 3 (v0.19.0) — email sent BY AZURE, From donotreply@, through the Gmail API.
 *
 * Same transport as Code.gs apsGmailSend_('TICKETS') with a service account:
 *   - the service account (GOOGLE_SERVICE_ACCOUNT_JSON, project "APS Dashboard Azure") signs in AS the From mailbox
 *     (domain-wide delegation, scope https://www.googleapis.com/auth/gmail.send ONLY);
 *   - the same MIME (multipart/alternative text + html, From "APS Dashboard Tickets" <donotreply@…>, Reply-To, Cc, Bcc);
 *   - the same TEST guard (APS_ENVIRONMENT=TESTING → everything goes to TEST_EMAIL_REDIRECT_TO only, subject
 *     "[TEST ENVIRONMENT]", red banner listing the LIVE recipients; TEST_EMAIL_MODE=OFF → nothing sent; daily cap).
 *
 * Switch: app setting AZURE_MAIL=on (default off → nothing here runs, nothing is sent). No job sends through this yet;
 * this step only proves the mailbox works (start-up sign-in check + one optional test email, MAIL_TEST_TO).
 * Never logs tokens, keys or message bodies; recipients appear in the log only for the test email.
 */
import { JWT } from 'google-auth-library';
import { randomUUID } from 'crypto';
import type { AppConfig } from '../config';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const MAIL_FROM_DEFAULT = 'donotreply@avvaiyarpadasalai.org';
export const MAIL_DISPLAY_NAME_DEFAULT = 'APS Dashboard Tickets';
export const TEST_EMAIL_DEFAULT_TO = 'info@avvaiyarpadasalai.org';

export interface MailMessage { to: string[]; cc?: string[]; bcc?: string[]; replyTo?: string; subject: string; html: string; text: string }
export interface SendResult { ok: boolean; mode: 'LIVE' | 'TEST_REDIRECT' | 'TEST_OFF' | 'TEST_CAP' | 'NOT_CONFIGURED'; auth?: boolean; error?: string }

/** Signs in as the From mailbox; returns an access token for gmail.send. */
export type MailTokenProvider = () => Promise<string>;
export type MailFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number }>;

export function mailTokenProvider(serviceAccountJson: string, from: string): MailTokenProvider {
  let key: { client_email: string; private_key: string } | null = null;
  try { key = serviceAccountJson ? JSON.parse(serviceAccountJson) : null; } catch { key = null; }
  if (!key || !key.client_email || !key.private_key) return async () => { throw new Error('GOOGLE_NOT_CONFIGURED'); };
  const c = new JWT({ email: key.client_email, key: key.private_key, scopes: [GMAIL_SEND_SCOPE], subject: from });
  return async () => {
    const { token } = await c.getAccessToken(); // cached and refreshed by the library
    if (!token) throw new Error('GOOGLE_AUTH_FAILED');
    return token;
  };
}

/** A sign-in error → short cause + fix (no personal data, no token text). */
export function describeMailError(err: unknown, from: string): string {
  const m = String((err && (err as Error).message) || err || '');
  if (/GOOGLE_NOT_CONFIGURED/.test(m)) return 'service account key missing or not valid (GOOGLE_SERVICE_ACCOUNT_JSON).';
  if (/unauthorized_client/.test(m)) return 'unauthorized_client — Google Admin console → Security → API controls → Domain Wide Delegation: the entry for the service account\'s Client ID (project "APS Dashboard Azure") must include https://www.googleapis.com/auth/gmail.send. A new or changed entry can take up to 24 hours.';
  if (/invalid_grant/.test(m)) return 'invalid_grant — ' + from + ' must be an active Workspace mailbox (not a group or alias) and the service-account key must not be deleted.';
  if (/invalid_client|invalid_signature/i.test(m)) return 'invalid_client — the service-account key in Key Vault is not valid; create a new key and replace the secret.';
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed/i.test(m)) return 'network — Google could not be reached (usually temporary).';
  return (m.match(/^[A-Za-z_]{3,40}/) || ['error'])[0] + ' — see docs/MAIL.md.';
}

/* ---- TEST guard (Code.gs apsTestMailGuard_) ---- */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const shown = (l: string[]) => (l.length ? l.slice(0, 15).join(', ') + (l.length > 15 ? ' … +' + (l.length - 15) + ' more' : '') : 'none');

export interface TestGuardSettings { testing: boolean; mode: 'REDIRECT' | 'OFF'; redirectTo: string; dailyCap: number }
export function testGuardSettings(cfg: AppConfig): TestGuardSettings {
  const s = cfg.testEmail || { mode: '', redirectTo: '', dailyCap: '' };
  const capRaw = s.dailyCap, cap = capRaw === '' ? 30 : Math.floor(Number(capRaw));
  const dest = String(s.redirectTo || TEST_EMAIL_DEFAULT_TO).trim().toLowerCase();
  return {
    testing: String(cfg.dashboardEnvironment || '').trim().toUpperCase() === 'TESTING',
    mode: String(s.mode || 'REDIRECT').trim().toUpperCase() === 'OFF' ? 'OFF' : 'REDIRECT',
    redirectTo: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dest) ? dest : TEST_EMAIL_DEFAULT_TO,
    dailyCap: cap >= 0 ? cap : 30,
  };
}

export class GmailSender {
  private testDay = ''; private testUsed = 0;
  constructor(readonly from: string, readonly displayName: string, private token: MailTokenProvider, private guard: TestGuardSettings,
    private fetchImpl: MailFetch = fetch as unknown as MailFetch, private now: () => Date = () => new Date(),
    private log: (m: string) => void = console.log) {}

  /** Start-up check: signs in as the mailbox WITHOUT sending anything. */
  async check(): Promise<{ ok: boolean; error?: string }> {
    try { await this.token(); return { ok: true }; } catch (e) { return { ok: false, error: describeMailError(e, this.from) }; }
  }

  private applyGuard(m: MailMessage): { send: boolean; m: MailMessage; mode: SendResult['mode'] } {
    if (!this.guard.testing) return { send: true, m, mode: 'LIVE' };
    const day = this.now().toISOString().slice(0, 10);
    if (day !== this.testDay) { this.testDay = day; this.testUsed = 0; }
    const to = m.to || [], cc = m.cc || [], bcc = m.bcc || [];
    const summary = m.subject.slice(0, 120) + ' (to ' + to.length + ', cc ' + cc.length + ', bcc ' + bcc.length + ')';
    if (this.guard.mode === 'OFF' || this.testUsed >= this.guard.dailyCap) {
      this.log('[Mail] TEST environment — SUPPRESSED (' + (this.guard.mode === 'OFF' ? 'TEST_EMAIL_MODE=OFF' : 'daily cap ' + this.guard.dailyCap + ' reached') + '): ' + summary);
      return { send: false, m, mode: this.guard.mode === 'OFF' ? 'TEST_OFF' : 'TEST_CAP' };
    }
    this.testUsed++;
    this.log('[Mail] TEST environment — REDIRECTED to ' + this.guard.redirectTo + ': ' + summary);
    const banner = '<div style="font-family:Arial,sans-serif;background:#fce8e6;border:2px solid #c5221f;border-radius:8px;padding:12px 14px;margin:0 0 16px;color:#202124;">' +
      '<div style="font-size:16px;font-weight:700;color:#c5221f;">&#9888; THIS EMAIL WAS SENT FROM THE TEST ENVIRONMENT</div>' +
      '<div style="font-size:13px;margin-top:4px;">It was <b>not</b> delivered to the real recipients. In LIVE it would have gone to:</div>' +
      '<table style="font-size:12px;margin-top:6px;border-collapse:collapse;">' +
      '<tr><td style="padding:2px 8px 2px 0;color:#5f6368;vertical-align:top;">To (' + to.length + ')</td><td style="word-break:break-word;">' + esc(shown(to)) + '</td></tr>' +
      '<tr><td style="padding:2px 8px 2px 0;color:#5f6368;vertical-align:top;">CC (' + cc.length + ')</td><td style="word-break:break-word;">' + esc(shown(cc)) + '</td></tr>' +
      '<tr><td style="padding:2px 8px 2px 0;color:#5f6368;">BCC</td><td>' + (bcc.length ? bcc.length + ' hidden recipient' + (bcc.length === 1 ? '' : 's') : 'none') + '</td></tr>' +
      '<tr><td style="padding:2px 8px 2px 0;color:#5f6368;">Sent</td><td>' + esc(this.now().toISOString()) + ' · TEST Azure</td></tr></table></div>';
    const textBanner = '*** THIS EMAIL WAS SENT FROM THE TEST ENVIRONMENT ***\nIt was NOT delivered to the real recipients. In LIVE it would have gone to:\n' +
      'To (' + to.length + '): ' + shown(to) + '\nCC (' + cc.length + '): ' + shown(cc) + '\nBCC: ' + (bcc.length ? bcc.length + ' hidden' : 'none') + '\n' + '-'.repeat(40) + '\n\n';
    return { send: true, mode: 'TEST_REDIRECT', m: { ...m, to: [this.guard.redirectTo], cc: [], bcc: [],
      subject: /^\[TEST ENVIRONMENT\]/.test(m.subject) ? m.subject : '[TEST ENVIRONMENT] ' + m.subject, html: banner + m.html, text: textBanner + m.text } };
  }

  /** Sends one email. Never throws; auth:true = the mailbox could not sign in (a job should pause sending). */
  async send(input: MailMessage): Promise<SendResult> {
    const g = this.applyGuard(input);
    if (!g.send) return { ok: true, mode: g.mode };
    const m = g.m;
    if (!m.to || !m.to.length) return { ok: false, mode: g.mode, error: 'no recipient' };
    let token: string;
    try { token = await this.token(); } catch (e) { return { ok: false, mode: g.mode, auth: true, error: describeMailError(e, this.from) }; }
    try {
      const res = await this.fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: b64url(buildMime(this.from, this.displayName, m)) }),
      });
      if (res.status >= 200 && res.status < 300) return { ok: true, mode: g.mode };
      return { ok: false, mode: g.mode, auth: res.status === 401 || res.status === 403, error: 'Gmail API HTTP ' + res.status };
    } catch (e) {
      return { ok: false, mode: g.mode, error: describeMailError(e, this.from) };
    }
  }
}

/* ---- MIME, as Code.gs apsGmailSend_ (no attachments yet) ---- */
export function encodeHeader(s: string): string { return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?='; }
const noCrlf = (s: string) => String(s).replace(/[\r\n]+/g, ' ');
export function buildMime(from: string, displayName: string, m: MailMessage, boundary = 'aps_' + randomUUID().replace(/-/g, '')): string {
  const cc = m.cc || [], bcc = m.bcc || [], replyTo = String(m.replyTo || from);
  return ['From: ' + encodeHeader(noCrlf(displayName)) + ' <' + from + '>', 'To: ' + m.to.map(noCrlf).join(', ')]
    .concat(cc.length ? ['Cc: ' + cc.map(noCrlf).join(', ')] : [])
    .concat(bcc.length ? ['Bcc: ' + bcc.map(noCrlf).join(', ')] : [])
    .concat(['Reply-To: ' + noCrlf(replyTo).split(/\s*,\s*/).join(', '), 'Subject: ' + encodeHeader(noCrlf(m.subject)), 'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="' + boundary + '"', '',
      '--' + boundary, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(m.text, 'utf8').toString('base64'),
      '--' + boundary, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(m.html, 'utf8').toString('base64'),
      '--' + boundary + '--'])
    .join('\r\n');
}
export function b64url(s: string): string { return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

/** The one test email (MAIL_TEST_TO). */
export function testEmail(to: string, version: string, when: Date): MailMessage {
  const stamp = when.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  return {
    to: [to], subject: 'APS Dashboard (Azure) — test email',
    text: 'This is a test email sent by the APS Dashboard on Azure (v' + version + ') at ' + stamp + '.\n\nIt was sent From the donotreply@ mailbox through the Gmail API, signed in by the Azure service account. Nothing else is needed — you can delete this email.\n\nRemove the app setting MAIL_TEST_TO so it is not sent again on the next restart.',
    html: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#202124;"><p>This is a <b>test email</b> sent by the APS Dashboard on Azure (v' + esc(version) + ') at ' + esc(stamp) + '.</p>' +
      '<p>It was sent From the donotreply@ mailbox through the Gmail API, signed in by the Azure service account. Nothing else is needed — you can delete this email.</p>' +
      '<p style="color:#5f6368;font-size:12px;">Remove the app setting MAIL_TEST_TO so it is not sent again on the next restart.</p></div>',
  };
}

/** Start-up: sign-in check, then the optional test email. Never blocks start-up. */
export async function checkMail(sender: GmailSender, cfg: AppConfig, version: string, log: (m: string) => void = console.log): Promise<boolean> {
  const c = await sender.check();
  if (!c.ok) { log('[Mail] Azure cannot send as ' + sender.from + ': ' + c.error); return false; }
  log('[Mail] Azure can send as ' + sender.from + ' (Gmail API, domain-wide delegation) — no job sends from Azure yet.');
  const to = cfg.mailTestTo;
  if (to) {
    const dom = to.split('@')[1] || '';
    if (!/^[^@\s]+@[^@\s]+$/.test(to) || cfg.allowedDomains.indexOf(dom) < 0) { log('[Mail] MAIL_TEST_TO must be one APS address (a domain in APS_ALLOWED_DOMAINS) — no test email sent.'); return true; }
    const r = await sender.send(testEmail(to, version, new Date()));
    log(r.ok ? '[Mail] test email sent to ' + to + (r.mode === 'LIVE' ? '' : ' (' + r.mode + ')') + ' — remove MAIL_TEST_TO now.' : '[Mail] test email to ' + to + ' FAILED: ' + r.error);
  }
  return true;
}

/** null when AZURE_MAIL is not on or MAIL_FROM is outside the Workspace domains. */
export function createMailSender(cfg: AppConfig): GmailSender | null {
  if (!cfg.mailEnabled || !cfg.allowedDomains.includes(cfg.mailFrom.split('@')[1] || '')) return null;
  return new GmailSender(cfg.mailFrom, cfg.mailDisplayName || MAIL_DISPLAY_NAME_DEFAULT, mailTokenProvider(cfg.serviceAccountJson, cfg.mailFrom), testGuardSettings(cfg));
}

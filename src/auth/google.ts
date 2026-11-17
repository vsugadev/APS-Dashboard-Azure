/**
 * Google sign-in — same flow as Code.gs doGet / buildGoogleAuthUrl_ / exchangeCodeForTokens_ / verifyGoogleIdToken_:
 * authorization-code flow (scope "openid email", prompt=select_account), a signed single-use state (10 min), the code
 * exchanged server-side with the client secret, and the ID token verified (signature, audience, expiry) by
 * google-auth-library — stronger than the tokeninfo call Apps Script uses.
 */
import { randomBytes, createHmac, timingSafeEqual, hkdfSync } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import type { AppConfig } from '../config';

export interface VerifiedClaims { email: string; email_verified: boolean; hd?: string; name?: string }

/**
 * Sign-in state (Code.gs: OAUTH_STATE_CACHE_PREFIX_ + aps_tk_link_, 10 min, single use).
 * The state is SIGNED (HMAC-SHA256) instead of kept only in memory, so a link handed out just before an app restart or
 * deploy still works afterwards — Code.gs "fails open" when its cache entry is gone; this keeps the check but survives
 * restarts. Forged, altered or older-than-10-minute states are refused; each state is accepted once per running app.
 * The optional ticket (?ticket=APS-…) rides inside the signed state. Nothing secret is put in the state.
 */
export class StateNonces {
  private used = new Map<string, number>();
  private key: Buffer;
  constructor(private ttlMs = 600_000, private now: () => number = Date.now, key?: Buffer) {
    this.key = key && key.length ? key : randomBytes(32);
  }
  /** Stable key for the app (same on every instance and after a restart), derived from the OAuth client secret. */
  static keyFromSecret(secret: string): Buffer | undefined {
    return secret ? Buffer.from(hkdfSync('sha256', secret, 'aps-dashboard', 'oauth-state-v1', 32)) : undefined;
  }
  private sign(body: string): string { return createHmac('sha256', this.key).update(body).digest('base64url'); }
  issue(ticket: string | null = null): string {
    const body = Buffer.from(JSON.stringify({ n: randomBytes(12).toString('hex'), t: this.now(), ...(ticket ? { k: ticket } : {}) })).toString('base64url');
    return body + '.' + this.sign(body);
  }
  take(s: string | undefined): { ok: boolean; ticket: string | null } {
    const bad = { ok: false, ticket: null };
    if (!s || s.length > 512) return bad;
    const dot = s.indexOf('.');
    if (dot < 1) return bad;
    const body = s.slice(0, dot);
    const a = Buffer.from(s.slice(dot + 1)); const b = Buffer.from(this.sign(body));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return bad;
    let p: { n?: unknown; t?: unknown; k?: unknown };
    try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return bad; }
    const now = this.now();
    if (typeof p.n !== 'string' || typeof p.t !== 'number' || p.t > now + 60_000 || now - p.t > this.ttlMs) return bad;
    for (const [n, exp] of this.used) if (exp <= now) this.used.delete(n);
    if (this.used.has(p.n)) return bad; // single use
    this.used.set(p.n, p.t + this.ttlMs);
    const ticket = typeof p.k === 'string' && /^APS-\d{8}-\d{4,6}$/.test(p.k) ? p.k : null;
    return { ok: true, ticket };
  }
  /** true once for a fresh state, then never again (single use). */
  consume(s: string | undefined): boolean { return this.take(s).ok; }
}

export interface GoogleAuth {
  authUrl(state: string): string;
  exchangeAndVerify(code: string): Promise<VerifiedClaims>;
}

export function googleAuth(cfg: AppConfig): GoogleAuth {
  const redirectUri = cfg.publicBaseUrl + '/';
  const client = new OAuth2Client({ clientId: cfg.oauthClientId, clientSecret: cfg.oauthClientSecret, redirectUri });
  return {
    authUrl(state: string): string {
      if (!cfg.oauthClientId) throw new Error('Sign-in is not configured yet: GOOGLE_OAUTH_CLIENT_ID is missing.');
      return client.generateAuthUrl({ scope: ['openid', 'email'], state, prompt: 'select_account', response_type: 'code' } as never);
    },
    async exchangeAndVerify(code: string): Promise<VerifiedClaims> {
      let idToken: string | null | undefined;
      try { idToken = (await client.getToken(code)).tokens.id_token; }
      catch (e) {
        // v0.8.2: log WHY Google refused the code exchange (its OAuth error code only — never the code, secret or token).
        console.warn('[SignIn] Google token exchange failed: ' + describeOAuthExchangeError(e, redirectUri));
        throw new Error('INVALID_TOKEN: Google could not complete the sign-in (the code may have expired or already been used — this happens if the page was reloaded). Please try signing in again.');
      }
      if (!idToken) throw new Error('INVALID_TOKEN: Google did not return an identity token for this sign-in.');
      const ticket = await client.verifyIdToken({ idToken, audience: cfg.oauthClientId }).catch(() => null);
      const p = ticket && ticket.getPayload();
      if (!p || !p.email) throw new Error('INVALID_TOKEN: Google could not verify this sign-in. Please try signing in again.');
      return { email: p.email, email_verified: p.email_verified === true, hd: p.hd, name: p.name };
    },
  };
}

/**
 * v0.8.2 — one log-safe line for a failed sign-in code exchange: Google's OAuth error code (invalid_grant,
 * redirect_uri_mismatch, invalid_client, unauthorized_client …) and the fix. Never contains the code, secret or tokens.
 */
export function describeOAuthExchangeError(err: unknown, redirectUri: string): string {
  const e = err as { response?: { data?: { error?: unknown } }; message?: unknown; code?: unknown };
  const fromBody = e && e.response && e.response.data && typeof e.response.data.error === 'string' ? e.response.data.error : '';
  const msg = String((e && e.message) || err || '');
  const code = (fromBody || (msg.match(/redirect_uri_mismatch|invalid_grant|invalid_client|unauthorized_client|invalid_request|ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed/i) || ['unknown'])[0]).replace(/[^A-Za-z_ ]/g, '').slice(0, 40);
  const fix: Record<string, string> = {
    invalid_grant: 'the sign-in code was already used or expired (page reloaded / Back / double click), or the server clock is off — sign in again from a fresh page. If it happens EVERY time, check that GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are the same OAuth client.',
    redirect_uri_mismatch: 'Google Cloud → APIs & Services → Credentials → this OAuth client → Authorized redirect URIs must contain exactly ' + redirectUri + ' (PUBLIC_BASE_URL + "/").',
    invalid_client: 'Key Vault google-oauth-client-id / google-oauth-client-secret do not match (wrong, deleted or rotated client secret) — copy the current secret of the SAME OAuth client into Key Vault (New Version), refresh the app settings and restart.',
    unauthorized_client: 'the OAuth client is not a "Web application" client or is not allowed this flow — use a Web application client.',
    invalid_request: 'the request to Google was incomplete — check GOOGLE_OAUTH_CLIENT_ID / PUBLIC_BASE_URL.',
  };
  const k = code.toLowerCase();
  return code + ' — ' + (fix[k] || (/ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed/i.test(code) ? 'the app could not reach Google — usually temporary, try again.' : 'see Google Cloud → OAuth client settings; redirect URI ' + redirectUri));
}
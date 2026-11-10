/**
 * Google sign-in — same flow as Code.gs doGet / buildGoogleAuthUrl_ / exchangeCodeForTokens_ / verifyGoogleIdToken_:
 * authorization-code flow (scope "openid email", prompt=select_account), a single-use state nonce (10 min), the code
 * exchanged server-side with the client secret, and the ID token verified (signature, audience, expiry) by
 * google-auth-library — stronger than the tokeninfo call Apps Script uses.
 */
import { randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import type { AppConfig } from '../config';

export interface VerifiedClaims { email: string; email_verified: boolean; hd?: string; name?: string }

export class StateNonces {
  private map = new Map<string, { exp: number; ticket: string | null }>();
  constructor(private ttlMs = 600_000, private now: () => number = Date.now) {}
  /** A fresh single-use nonce; a ticket link (?ticket=APS-…) rides with it through Google sign-in, as aps_tk_link_ in Code.gs. */
  issue(ticket: string | null = null): string { const s = randomBytes(24).toString('hex'); this.map.set(s, { exp: this.now() + this.ttlMs, ticket }); return s; }
  take(s: string | undefined): { ok: boolean; ticket: string | null } {
    if (!s) return { ok: false, ticket: null };
    const v = this.map.get(s);
    this.map.delete(s);
    return v && v.exp > this.now() ? { ok: true, ticket: v.ticket } : { ok: false, ticket: null };
  }
  /** true once for a fresh nonce, then never again (single use). */
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
      catch { throw new Error('INVALID_TOKEN: Google could not complete the sign-in (the code may have expired or already been used — this happens if the page was reloaded). Please try signing in again.'); }
      if (!idToken) throw new Error('INVALID_TOKEN: Google did not return an identity token for this sign-in.');
      const ticket = await client.verifyIdToken({ idToken, audience: cfg.oauthClientId }).catch(() => null);
      const p = ticket && ticket.getPayload();
      if (!p || !p.email) throw new Error('INVALID_TOKEN: Google could not verify this sign-in. Please try signing in again.');
      return { email: p.email, email_verified: p.email_verified === true, hd: p.hd, name: p.name };
    },
  };
}

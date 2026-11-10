/**
 * Google Workspace access from Azure: ONE service account with domain-wide delegation, impersonating the
 * Workspace account the Apps Script project runs as today (GOOGLE_IMPERSONATE_USER). Scopes = only what
 * Code.gs already uses. The key JSON comes from Key Vault (App setting reference) and is never logged.
 */
import { JWT } from 'google-auth-library';
import type { AppConfig } from '../config';

export const GOOGLE_SCOPES = {
  sheetsRead: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  // Later phases (listed so the Workspace admin approves everything once in Phase 0):
  classroom: [
    'https://www.googleapis.com/auth/classroom.courses',
    'https://www.googleapis.com/auth/classroom.rosters',
    'https://www.googleapis.com/auth/classroom.coursework.students',
    'https://www.googleapis.com/auth/classroom.announcements',
    'https://www.googleapis.com/auth/classroom.topics',
    'https://www.googleapis.com/auth/classroom.profile.emails',
  ],
  reports: 'https://www.googleapis.com/auth/admin.reports.audit.readonly',
  directory: 'https://www.googleapis.com/auth/admin.directory.user.readonly',
  gmailSend: 'https://www.googleapis.com/auth/gmail.send',
  drive: 'https://www.googleapis.com/auth/drive',
  sheets: 'https://www.googleapis.com/auth/spreadsheets',
};

export type AccessTokenProvider = (scopes: string[]) => Promise<string>;

export function serviceAccountTokenProvider(cfg: AppConfig): AccessTokenProvider {
  if (!cfg.serviceAccountJson) {
    return async () => { throw new Error('GOOGLE_NOT_CONFIGURED: the Google service account is not set up yet (Phase 0).'); };
  }
  let key: { client_email: string; private_key: string };
  try { key = JSON.parse(cfg.serviceAccountJson); } catch {
    console.error('[Config] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON — Google access disabled.');
    return async () => { throw new Error('GOOGLE_NOT_CONFIGURED: the Google service account key is not valid.'); };
  }
  const clients = new Map<string, JWT>();
  return async (scopes: string[]) => {
    const k = scopes.slice().sort().join(' ');
    let c = clients.get(k);
    if (!c) {
      c = new JWT({ email: key.client_email, key: key.private_key, scopes, subject: cfg.impersonateUser });
      clients.set(k, c);
    }
    const { token } = await c.getAccessToken(); // cached and refreshed by the library
    if (!token) throw new Error('GOOGLE_AUTH_FAILED: no access token.');
    return token;
  };
}

/** Bounded retry for transient Google errors (429 / 5xx), as in the Apps Script retry helpers. */
export async function googleFetchJson<T>(url: string, token: string, init: RequestInit = {}, attempts = 3): Promise<T> {
  let last: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    if (res.ok) return (await res.json()) as T;
    const transient = res.status === 429 || res.status >= 500;
    // Keep Google's machine-readable status/reason (e.g. PERMISSION_DENIED SERVICE_DISABLED) — never its free text,
    // which can contain emails or IDs.
    let why = '';
    try {
      const j = (await res.json()) as { error?: { status?: string; details?: { reason?: string }[] } };
      const parts = [j.error && j.error.status, ...((j.error && j.error.details) || []).map((d) => d && d.reason)];
      why = parts.filter((x): x is string => typeof x === 'string' && /^[A-Z_]{3,60}$/.test(x)).map((x) => ' ' + x).join('');
    } catch { why = ''; }
    last = new Error(`GOOGLE_API_${res.status}${why}`);
    if (!transient) break;
    await new Promise((r) => setTimeout(r, 400 * Math.pow(2, i) + Math.floor(Math.random() * 200)));
  }
  throw last || new Error('GOOGLE_API_ERROR');
}

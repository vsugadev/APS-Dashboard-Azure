/**
 * Turns a Google access error into a short cause + fix for the app log (and the admin set-up checklist).
 * Input is our own error text (GOOGLE_API_<status> <STATUS> <REASON>, GOOGLE_NOT_CONFIGURED, or the token library's
 * OAuth error code such as unauthorized_client). Output never contains keys, tokens or personal data.
 */
export interface GoogleProblem { code: string; fix: string }

const RULES: [RegExp, string, string][] = [
  [/GOOGLE_NOT_CONFIGURED/, 'service_account_missing', 'Add the Key Vault secret google-service-account-json (the whole key file), then restart the app.'],
  [/TARGET_SPREADSHEET_ID/, 'spreadsheet_id_missing', 'Set the app setting TARGET_SPREADSHEET_ID to the main Google Sheet ID.'],
  [/unauthorized_client/, 'delegation_not_active', 'Google Admin console → Security → API controls → Domain Wide Delegation: Client ID = the service account\'s numeric Unique ID, scope https://www.googleapis.com/auth/spreadsheets.readonly. A new entry can take up to 24 hours.'],
  [/invalid_grant/, 'impersonated_user_invalid', 'GOOGLE_IMPERSONATE_USER must be an active account in your Workspace domain, and the service-account key must not be deleted.'],
  [/SERVICE_DISABLED|ACCESS_TOKEN_SCOPE_INSUFFICIENT/, 'sheets_api_disabled', 'Google Cloud console → APIs & Services → enable "Google Sheets API" in the service account\'s project.'],
  [/GOOGLE_API_403/, 'sheet_not_shared', 'The account in GOOGLE_IMPERSONATE_USER cannot open the Sheet — share the main Sheet with it (Viewer is enough).'],
  [/GOOGLE_API_404/, 'sheet_not_found', 'Check TARGET_SPREADSHEET_ID — no Sheet with that ID was found.'],
  [/GOOGLE_API_401|invalid_client|invalid_signature/i, 'key_invalid', 'The service-account key in Key Vault is not valid — create a new JSON key and replace google-service-account-json.'],
  [/GOOGLE_API_429|GOOGLE_API_5\d\d/, 'google_busy', 'Google is busy or rate-limiting; it usually clears by itself within minutes.'],
  [/ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed/i, 'network', 'The app could not reach Google — usually temporary.'],
];

export function explainGoogleError(err: unknown): GoogleProblem {
  const msg = String((err && (err as Error).message) || err || '');
  for (const [re, code, fix] of RULES) if (re.test(msg)) return { code, fix };
  return { code: 'unknown', fix: 'See the error above; if it repeats, check the service account set-up (docs/PHASE0_STATUS.md).' };
}

/** One-line, log-safe description: the error kind (no details that could carry personal data) plus the fix. */
export function describeGoogleError(err: unknown): string {
  const msg = String((err && (err as Error).message) || err || '');
  const kind = (msg.match(/GOOGLE_API_\d{3}(?: [A-Z_]+)*|GOOGLE_NOT_CONFIGURED|unauthorized_client|invalid_grant|invalid_client|ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed/i) || ['error'])[0];
  const p = explainGoogleError(err);
  return `${kind} [${p.code}] — ${p.fix}`;
}

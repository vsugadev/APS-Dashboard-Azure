/**
 * Configuration — read once from environment variables (Azure App Service "App settings").
 *
 * Secrets (OAuth client secret, Google service-account key) are NEVER stored in code or in plain App settings:
 * in Azure they are Key Vault references, e.g.
 *   GOOGLE_OAUTH_CLIENT_SECRET = @Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/google-oauth-client-secret/)
 * App Service resolves them with the app's managed identity, so this code only ever sees process.env.
 *
 * Setting names match the current Apps Script Script Properties where one exists (SUPERADMIN_EMAILS, ADMIN_EMAILS,
 * HEADMASTER_EMAILS, VCFO_AMCHATS_BOD_EMAILS, ON_CALL_COORDINATOR_EMAILS, TARGET_SPREADSHEET_ID), so values can be
 * copied across one-to-one. Lists are JSON array text, exactly as in Script Properties.
 */
export interface AppConfig {
  env: 'production' | 'development' | 'test';
  port: number;
  publicBaseUrl: string;               // e.g. https://aps-dashboard.azurewebsites.net (no trailing slash) — the OAuth redirect URI
  oauthClientId: string;
  oauthClientSecret: string;           // Key Vault reference in Azure
  allowedDomains: string[];
  superadminEmails: string[];
  adminEmails: string[];
  headmasterEmails: string[];
  bodEmails: string[];
  onCallCoordinatorEmails: string[];
  sessionTtlSeconds: number;
  dataMode: 'sheets' | 'fixture';      // sheets = read the live Google Sheet through the Sheets API; fixture = local JSON (dev/tests)
  fixturePath: string;
  targetSpreadsheetId: string;
  serviceAccountJson: string;          // Key Vault reference in Azure (whole key JSON); empty until Phase 0 is done
  impersonateUser: string;             // Workspace account the service account acts as (domain-wide delegation)
  dashboardHtmlPath: string;           // Dashboard.html copied at deploy time
  rolePermissionsJson: string;         // optional copy of the Script Property dashboardRolePermissions_v1
  devLogin: boolean;                   // LOCAL ONLY — refused when running in Azure
  runningInAzure: boolean;
}

const DEFAULT_ALLOWED_DOMAINS = ['avvaiyarpadasalai.org', 'amchats.org', 'namaps.org', 'apsamerica.org'];

export function parseList(raw: string | undefined, name: string, fallback: string[] = []): string[] {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback.slice();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('not a JSON array');
    return parsed.map((x) => String(x));
  } catch (e) {
    // Same behaviour as getConfigList_: warn (without printing the value) and use the fallback.
    console.error(`[Config] "${name}" is not valid JSON array text (${(e as Error).message}) — using fallback.`);
    return fallback.slice();
  }
}

/** A Key Vault reference App Service could not resolve stays as the literal "@Microsoft.KeyVault(...)" text —
 *  treat it as not set (and say which setting), never as a value. */
function resolved(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const v = env[name];
  if (v && /^@Microsoft\.KeyVault\(/i.test(v.trim())) { console.warn(`[Config] ${name}: Key Vault reference not resolved yet — treated as not set.`); return undefined; }
  return v;
}

export function loadConfig(envIn: NodeJS.ProcessEnv = process.env): AppConfig {
  const env: NodeJS.ProcessEnv = {};
  // App Service also exposes every setting a second time as APPSETTING_<name>; only the real names are read.
  for (const k of Object.keys(envIn)) if (!k.startsWith('APPSETTING_')) env[k] = resolved(envIn, k);
  const runningInAzure = !!envIn.WEBSITE_SITE_NAME; // set by Azure App Service on every app
  const nodeEnv = (env.NODE_ENV === 'production' || env.NODE_ENV === 'test') ? env.NODE_ENV : 'development';
  const cfg: AppConfig = {
    env: runningInAzure ? 'production' : nodeEnv,
    port: Number(env.PORT || 8080),
    publicBaseUrl: String(env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
    oauthClientId: String(env.GOOGLE_OAUTH_CLIENT_ID || ''),
    oauthClientSecret: String(env.GOOGLE_OAUTH_CLIENT_SECRET || ''),
    allowedDomains: parseList(env.APS_ALLOWED_DOMAINS, 'APS_ALLOWED_DOMAINS', DEFAULT_ALLOWED_DOMAINS).map((d) => d.trim().toLowerCase()),
    superadminEmails: parseList(env.SUPERADMIN_EMAILS, 'SUPERADMIN_EMAILS'),
    adminEmails: parseList(env.ADMIN_EMAILS, 'ADMIN_EMAILS'),
    headmasterEmails: parseList(env.HEADMASTER_EMAILS, 'HEADMASTER_EMAILS'),
    bodEmails: parseList(env.VCFO_AMCHATS_BOD_EMAILS, 'VCFO_AMCHATS_BOD_EMAILS'),
    onCallCoordinatorEmails: parseList(env.ON_CALL_COORDINATOR_EMAILS, 'ON_CALL_COORDINATOR_EMAILS'),
    sessionTtlSeconds: Number(env.SESSION_TTL_SECONDS || 21600), // 6 hours, as SESSION_TTL_SECONDS in Code.gs
    dataMode: env.APS_DATA_MODE === 'fixture' ? 'fixture' : 'sheets',
    fixturePath: String(env.APS_FIXTURE_PATH || 'local-data/fixture.json'),
    targetSpreadsheetId: String(env.TARGET_SPREADSHEET_ID || ''),
    serviceAccountJson: String(env.GOOGLE_SERVICE_ACCOUNT_JSON || ''),
    impersonateUser: String(env.GOOGLE_IMPERSONATE_USER || ''),
    dashboardHtmlPath: String(env.DASHBOARD_HTML_PATH || 'public/Dashboard.html'),
    rolePermissionsJson: String(env.ROLE_PERMISSIONS_JSON || ''),
    devLogin: env.DEV_LOGIN === '1',
    runningInAzure,
  };
  return cfg;
}

/** Problems that must stop the app from starting. Secrets are named, never printed. */
export function configProblems(cfg: AppConfig): string[] {
  const p: string[] = [];
  if (cfg.devLogin && (cfg.runningInAzure || cfg.env === 'production')) p.push('DEV_LOGIN must never be enabled in Azure / production.');
  if (cfg.env === 'production') {
    if (!cfg.publicBaseUrl.startsWith('https://')) p.push('PUBLIC_BASE_URL must be the https:// address of the app.');
    if (!cfg.oauthClientId) p.push('GOOGLE_OAUTH_CLIENT_ID is not set.');
    if (!cfg.oauthClientSecret) p.push('GOOGLE_OAUTH_CLIENT_SECRET is not set (Key Vault reference).');
    if (cfg.dataMode === 'fixture') p.push('APS_DATA_MODE=fixture is for local development only.');
  }
  return p;
}

/** Not fatal: the app starts, Admin / Super Admin / HM / BOD (named in the role lists) can sign in, and anything that
 *  needs the Google Sheet answers with a clear message until Phase 0 (service account) is finished. */
export function configWarnings(cfg: AppConfig): string[] {
  const w: string[] = [];
  if (cfg.dataMode === 'sheets' && cfg.env !== 'test') {
    if (!cfg.targetSpreadsheetId) w.push('TARGET_SPREADSHEET_ID is not set.');
    if (!cfg.serviceAccountJson) w.push('GOOGLE_SERVICE_ACCOUNT_JSON is not set — Google Sheet data is unavailable until the service account exists (Phase 0).');
    if (!cfg.impersonateUser) w.push('GOOGLE_IMPERSONATE_USER is not set.');
  }
  return w;
}

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
  // Classes view (Phase 2) — same names as the Script Properties; all optional
  rosterHiddenStaffAdditionalEmails: string[]; // ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS
  gradingTeamEmails: string[];         // APS_GRADING_TEAM_EMAILS (grading@ is always included)
  classesAlwaysShowEmailsRaw: string | null; // APS_CLASSES_ALWAYS_SHOW_EMAILS (JSON array or list; unset = Code.gs default)
  dashboardEnvironment: string;        // APS_ENVIRONMENT (TESTING / LIVE)
  countryFeatureOn: boolean;
  attendanceSpreadsheetId: string;     // ATTENDANCE_SPREADSHEET_ID (Meet link map sheets) — Script Property of the same name
  scriptSettings: Record<string, string>; // other Code.gs settings the copied readers read (APS_*, TCC_*, TTM_*, CTA_*, ROSTER_*, ATTENDANCE_*, SPECIAL_CLASSES_*, ZOHO_SYNC_SPREADSHEET_ID) — never secrets           // APS_COUNTRY_FEATURE (default on, as Code.gs r120)
  appsScriptBridgeUrl: string;         // APPS_SCRIPT_BRIDGE_URL — the live Apps Script web app /exec address (Phase 3)
  appsScriptBridgeSecret: string;      // APPS_SCRIPT_BRIDGE_SECRET — Key Vault reference; same value as Script Property AZURE_BRIDGE_SECRET
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

/** Plain Code.gs settings (same names as the Script Properties) for the read-only runtime. Anything that could be a
 *  secret is never included, whatever its prefix. */
export function scriptSettingsFrom(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined || !(/^(APS_|TCC_|TTM_|CTA_|ROSTER_|ATTENDANCE_|SPECIAL_CLASSES_)/.test(k) || k === 'ZOHO_SYNC_SPREADSHEET_ID') || /SECRET|TOKEN|PASSWORD|KEY|JSON|CREDENTIAL/i.test(k)) continue;
    out[k] = String(v);
  }
  return out;
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
    rosterHiddenStaffAdditionalEmails: parseList(env.ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS, 'ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS'),
    gradingTeamEmails: parseList(env.APS_GRADING_TEAM_EMAILS, 'APS_GRADING_TEAM_EMAILS'),
    classesAlwaysShowEmailsRaw: env.APS_CLASSES_ALWAYS_SHOW_EMAILS === undefined ? null : String(env.APS_CLASSES_ALWAYS_SHOW_EMAILS),
    dashboardEnvironment: String(env.APS_ENVIRONMENT || ''),
    countryFeatureOn: String(env.APS_COUNTRY_FEATURE || 'on').trim().toLowerCase() !== 'off',
    attendanceSpreadsheetId: String(env.ATTENDANCE_SPREADSHEET_ID || ''),
    scriptSettings: scriptSettingsFrom(env),
    appsScriptBridgeUrl: String(env.APPS_SCRIPT_BRIDGE_URL || '').trim(),
    appsScriptBridgeSecret: String(env.APPS_SCRIPT_BRIDGE_SECRET || ''),
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
    if (!cfg.appsScriptBridgeUrl || !cfg.appsScriptBridgeSecret) w.push('APPS_SCRIPT_BRIDGE_URL / APPS_SCRIPT_BRIDGE_SECRET not set — live data (online now, last login, class status, on-call banner) stays empty (Phase 3).');
    else if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(cfg.appsScriptBridgeUrl)) w.push('APPS_SCRIPT_BRIDGE_URL must be the Apps Script web app address (https://script.google.com/macros/s/…/exec).');
    else if (cfg.appsScriptBridgeSecret.length < 32) w.push('APPS_SCRIPT_BRIDGE_SECRET is shorter than 32 characters — the bridge is not used.');
  }
  return w;
}

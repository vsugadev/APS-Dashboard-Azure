/**
 * Serves the SAME Dashboard.html the Apps Script web app serves. Code.gs doGet fills four template values with
 * HtmlService scriptlets; this renderer fills exactly those four (and nothing else), so the page is unchanged:
 *   <?= APS_OAUTH_AUTH_URL ?>                       → the Google sign-in link (HTML-escaped, as <?= does)
 *   <?!= JSON.stringify(APS_BOOT_SESSION_TOKEN) ?>  → token after a successful Google callback, else null
 *   <?!= JSON.stringify(APS_BOOT_USER) ?>           → user payload after a successful callback, else null
 *   <?!= JSON.stringify(APS_BOOT_ERROR) ?>          → { code, message? } after a failed callback, else null
 *   <?!= JSON.stringify(typeof APS_BOOT_TICKET …) ?> → a ticket deep link (?ticket=APS-yyyyMMdd-NNNN), else null
 * It also adds the google.script.run shim (/aps-gas-shim.js) at the top of <head>, before the page's own scripts.
 * Any OTHER scriptlet in the file stops start-up, so a new template value cannot slip through unnoticed.
 */
import * as fs from 'fs';

export interface BootValues { authUrl: string; token: string | null; user: unknown; error: unknown; ticket?: string | null; parallel?: { officialUrl: string } | null }
const KNOWN = new Set([
  '<?= APS_OAUTH_AUTH_URL ?>',
  '<?!= JSON.stringify(APS_BOOT_SESSION_TOKEN) ?>',
  '<?!= JSON.stringify(APS_BOOT_USER) ?>',
  '<?!= JSON.stringify(APS_BOOT_ERROR) ?>',
  "<?!= JSON.stringify(typeof APS_BOOT_TICKET === 'undefined' ? null : APS_BOOT_TICKET) ?>",
]);
export const PAGE_TITLE = 'Avvaiyar Padasalai Tamil Virtual School - Classroom Dashboard';

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/** JSON safe inside a <script> block (no "</script>" or U+2028 breaks). */
export function jsonForScript(v: unknown): string {
  return JSON.stringify(v === undefined ? null : v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function checkTemplate(html: string): string[] {
  const found = html.match(/<\?[\s\S]*?\?>/g) || [];
  return found.filter((s) => !KNOWN.has(s));
}

/** The sign-in help box in Dashboard.html explains the Apps Script set-up (Code.gs, redeploy). On Azure the same box
 *  explains the Azure set-up instead. Only that static help text changes; the page file itself stays identical to the
 *  Apps Script copy, and if the text is not found the page is served unchanged. */
export const AZURE_DEPLOYMENT_HELP =
  'If you manage the APS Dashboard on Azure: for a sign-in problem, the Key Vault secrets <b>google-oauth-client-id</b> and ' +
  '<b>google-oauth-client-secret</b> must belong to a Google OAuth client of type "Web application" whose <b>Authorized redirect URIs</b> ' +
  'include this site\'s address followed by "/". If the message says the dashboard cannot read class data, the Google service account ' +
  'needs domain-wide delegation and access to the main Sheet. The app log (<b>[SignIn]</b> and <b>[Google]</b> lines) names the exact fix.';
export function azureWording(html: string): string {
  return html
    .replace(/(<p class="aps-gate-text" id="apsDeploymentHelp"[^>]*>)[\s\S]*?(<\/p>)/, (_m, a: string, b: string) => a + AZURE_DEPLOYMENT_HELP + b)
    .replace('<span>Required Web App setting</span>', '<span>Setting to check: </span>');
}

/** v0.25.0 APS theme: the page's own hard-coded brand blues (inside <style> blocks only — scripts and markup untouched)
 *  point at the theme tokens, so ONE value in public/aps-theme.css sets the brand colour everywhere. Each keeps its old
 *  colour as the fallback, so the page looks exactly as before if the theme file is missing. */
export const THEME_COLOR_MAP: Record<string, string> = {
  '#1a73e8': 'var(--aps-primary, #1a73e8)',
  '#1967d2': 'var(--aps-primary-hover, #1967d2)',
  '#174ea6': 'var(--aps-primary-hover, #174ea6)',
  '#1a56c4': 'var(--aps-primary-hover, #1a56c4)',
  '#e8f0fe': 'var(--aps-primary-light, #e8f0fe)',
  '#d2e3fc': 'var(--aps-primary-border, #d2e3fc)',
};
export function themeStyles(html: string): string {
  const re = new RegExp('(' + Object.keys(THEME_COLOR_MAP).join('|') + ')(?![0-9a-f])', 'gi');
  // only <style> blocks OUTSIDE <script> blocks (a script may build HTML that contains "<style" text)
  return html.split(/(<script\b[\s\S]*?<\/script>)/i).map((part, i) => (i % 2 === 1 ? part
    : part.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, css: string, close: string) =>
      open + css.replace(re, (hex: string) => THEME_COLOR_MAP[hex.toLowerCase()]) + close))).join('');
}
export const THEME_LINK = '<link rel="stylesheet" href="/aps-theme.css">';

export class DashboardPage {
  private html: string;
  constructor(path: string, opts: { theme?: boolean } = {}) {
    if (!fs.existsSync(path)) throw new Error(`Dashboard.html not found at ${path} (set DASHBOARD_HTML_PATH).`);
    this.html = fs.readFileSync(path, 'utf8');
    this.html = azureWording(this.html);
    if (opts.theme !== false) { // v0.25.0: APS theme (AZURE_THEME=off serves the page exactly as Apps Script does)
      this.html = themeStyles(this.html);
      this.html = /<\/head>/i.test(this.html) ? this.html.replace(/<\/head>/i, THEME_LINK + '</head>') : this.html;
    }
    const unknown = checkTemplate(this.html);
    if (unknown.length) throw new Error('Dashboard.html has template values Azure does not fill yet: ' + unknown.slice(0, 3).join(' | '));
  }
  render(v: BootValues): string {
    let out = this.html
      .split('<?= APS_OAUTH_AUTH_URL ?>').join(escHtml(v.authUrl))
      .split('<?!= JSON.stringify(APS_BOOT_SESSION_TOKEN) ?>').join(jsonForScript(v.token))
      .split('<?!= JSON.stringify(APS_BOOT_USER) ?>').join(jsonForScript(v.user))
      .split('<?!= JSON.stringify(APS_BOOT_ERROR) ?>').join(jsonForScript(v.error))
      .split("<?!= JSON.stringify(typeof APS_BOOT_TICKET === 'undefined' ? null : APS_BOOT_TICKET) ?>").join(jsonForScript(v.ticket || null));
    const pr = v.parallel ? '<script src="/aps-parallel.js" defer data-official="' + escHtml(/^https:\/\//.test(v.parallel.officialUrl) ? v.parallel.officialUrl : '') + '"></script>' : ''; // v0.21.0 test-run bar
    const head = '<meta name="viewport" content="width=device-width, initial-scale=1"><script src="/aps-gas-shim.js"></script>' + pr;
    out = out.replace(/<head>/i, '<head>' + head + (/<title>/i.test(out) ? '' : `<title>${PAGE_TITLE}</title>`));
    return out;
  }
}

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

export interface BootValues { authUrl: string; token: string | null; user: unknown; error: unknown; ticket?: string | null }
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

export class DashboardPage {
  private html: string;
  constructor(path: string) {
    if (!fs.existsSync(path)) throw new Error(`Dashboard.html not found at ${path} (set DASHBOARD_HTML_PATH).`);
    this.html = fs.readFileSync(path, 'utf8');
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
    const head = '<meta name="viewport" content="width=device-width, initial-scale=1"><script src="/aps-gas-shim.js"></script>';
    out = out.replace(/<head>/i, '<head>' + head + (/<title>/i.test(out) ? '' : `<title>${PAGE_TITLE}</title>`));
    return out;
  }
}

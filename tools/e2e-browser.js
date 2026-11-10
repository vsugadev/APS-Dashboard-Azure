// Browser check (Playwright): the real Dashboard.html served by the Azure server, with the google.script.run shim.
// Run: npm run build && node tools/e2e-browser.js   (uses APS_DATA_MODE=fixture + DEV_LOGIN, local only)
const assert = require('assert');
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
process.env.NODE_ENV = 'development'; process.env.APS_DATA_MODE = 'fixture'; process.env.DEV_LOGIN = '1';
process.env.APS_FIXTURE_PATH = path.join(__dirname, '..', 'local-data', 'fixture.json');
process.env.PUBLIC_BASE_URL = 'http://127.0.0.1:0'; process.env.GOOGLE_OAUTH_CLIENT_ID = 'local-test.apps.googleusercontent.com';
process.env.ADMIN_EMAILS = JSON.stringify(['admin@avvaiyarpadasalai.org']);
const fs = require('fs');
if (!fs.existsSync(process.env.APS_FIXTURE_PATH)) { // small sample school (same as the unit-test fixture)
  fs.mkdirSync(path.dirname(process.env.APS_FIXTURE_PATH), { recursive: true });
  fs.writeFileSync(process.env.APS_FIXTURE_PATH, JSON.stringify({ courses: require('../dist/test/helpers').testCourses(), userRoles: {}, accessOverrides: {} }, null, 1));
}
const { loadConfig } = require('../dist/src/config');
const { createApp, createContext } = require('../dist/src/server');
const { DashboardPage } = require('../dist/src/web/render');
(async () => {
  const cfg = loadConfig();
  const app = createApp(createContext(cfg), new DashboardPage(path.join(__dirname, '..', 'public', 'Dashboard.html')));
  const srv = app.listen(0); await new Promise((r) => srv.once('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch(); const page = await browser.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const calls = []; page.on('request', (r) => { if (r.url().includes('/api/run/')) calls.push(r.url().split('/api/run/')[1]); });
  let ok = 0; const t = async (n, fn) => { await fn(); ok++; console.log('PASS', n); };
  try {
    await t('plain visit: the real Dashboard.html loads, shows the sign-in screen, Google link carries a state nonce', async () => {
      await page.goto(base + '/');
      await page.waitForTimeout(500);
      assert.strictEqual(await page.evaluate(() => typeof google.script.run.withSuccessHandler), 'function');
      const href = await page.evaluate(() => { const a = Array.from(document.querySelectorAll('a')).find((x) => /accounts\.google\.com/.test(x.href)); return a ? a.href : ''; });
      assert.ok(/state=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(href) && /client_id=local-test/.test(href) && /scope=openid(%20|\+)email/.test(href), href);
      assert.strictEqual(await page.evaluate(() => document.getElementById('apsScreenLogin') && getComputedStyle(document.getElementById('apsScreenLogin')).display !== 'none'), true);
    });
    await t('signed in (local dev login): the page accepts the Azure session and calls the API through the shim', async () => {
      await page.goto(base + '/dev/login?email=admin@avvaiyarpadasalai.org');
      await page.waitForTimeout(1500);
      const tok = await page.evaluate(() => typeof apsSessionToken === 'string' ? apsSessionToken : null);
      assert.ok(tok && /^[0-9a-f-]{36}$/.test(tok), 'session token held by the page');
      const me = await page.evaluate((tk) => new Promise((res, rej) => google.script.run.withSuccessHandler(res).withFailureHandler((e) => rej(e.message)).getCurrentUser(tk)), tok);
      assert.strictEqual(me.role, 'admin'); assert.strictEqual(me.email, 'admin@avvaiyarpadasalai.org');
      const err = await page.evaluate(() => new Promise((res) => google.script.run.withSuccessHandler(() => res('no error')).withFailureHandler((e, u) => res(e.message + '|' + u)).withUserObject('ctx').getDashboardData('x')));
      assert.strictEqual(err, 'NOT_ON_AZURE_YET: getDashboardData|ctx', 'errors + user object reach the failure handler as in Apps Script');
      console.log('   calls made by the page: ' + Array.from(new Set(calls)).join(', '));
    });
    await t('sign-out: endSession sent and the session is gone on the server', async () => {
      const tok = await page.evaluate(() => apsSessionToken);
      await page.evaluate(() => document.getElementById('apsSignOutBtn').click());
      await page.waitForTimeout(500);
      assert.ok(calls.includes('endSession'));
      const r = await (await fetch(base + '/api/run/getCurrentUser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [tok] }) })).json();
      assert.deepStrictEqual(r, { err: 'SESSION_EXPIRED: please sign in again.' });
    });
    await t('after the Google callback the one-time code/state leave the address bar; a ticket link stays; the Azure help text shows', async () => {
      await page.goto(base + '/?code=used-code&state=abc.def&scope=email&ticket=APS-20261109-0042');
      await page.waitForTimeout(800);
      assert.strictEqual(await page.evaluate(() => window.location.search), '?ticket=APS-20261109-0042');
      const help = await page.evaluate(() => document.getElementById('apsDeploymentHelp').textContent);
      assert.ok(/on Azure/.test(help) && !/Code\.gs/.test(help), help);
    });
    await page.screenshot({ path: path.join(__dirname, 'e2e-signin.png') });
    const real = errors.filter((e) => !/NOT_ON_AZURE_YET/.test(e));
    console.log('   page errors (other than not-yet-moved calls): ' + (real.length ? real.join(' | ') : 'none'));
    console.log(`\nALL ${ok} BROWSER CHECKS PASSED`);
  } finally { await browser.close(); srv.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

// r83: performance changes keep behaviour — grouped start-up calls, revisit reuse, hidden-tab refresh skip (node test/ui_perf.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { setup, D } = require('./coveragefixture');
const F = setup(); const { J, G } = F;
(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  async function boot(email, role, opts) {
    opts = opts || {};
    const token = F.tok(email, role); const calls = [];
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 1000 } }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => { if (!/localStorage/.test(e.message)) errors.push(e.message); });
    await page.exposeFunction('__gas', async (fn, args) => {
      calls.push(fn === 'getStartupBundle' ? fn + ':' + args[1].join(',') : fn);
      if (opts.failBundle && fn === 'getStartupBundle') return JSON.stringify({ err: 'Service unavailable' });
      if (opts.expireBundle && fn === 'getStartupBundle') return JSON.stringify({ err: 'SESSION_EXPIRED: please sign in again.' });
      try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); }
    });
    await page.addInitScript(({ email, token }) => {
      try { localStorage.setItem('apsDashboardSession_v2', JSON.stringify({ email, token, issuedAt: Date.now(), expiresAt: Date.now() + 864e5, lastActive: Date.now() })); } catch (e) {}
      function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
        return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } };
    }, { email, token });
    await page.route('**/*', r => /^https:\/\/aps\.test\//.test(r.request().url()) ? r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }) : r.abort());
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    return { page, ctx, calls, errors };
  }
  await t('sign-in: the small start-up calls travel as ONE grouped call and every handler still gets its own result', async () => {
    F.env.ctx.PropertiesService.getScriptProperties().setProperty(G.LAST_SYNC_ERROR_KEY, 'Classroom quota exceeded');
    const B = await boot('admin@aps.org', 'admin'); const p = B.page;
    await p.waitForFunction(() => /Data last synced|No sync has run yet/.test(document.getElementById('syncInfo').textContent), null, { timeout: 15000 });
    await p.waitForTimeout(800);
    const bundles = B.calls.filter(c => c.startsWith('getStartupBundle:'));
    assert.ok(bundles.length >= 1 && bundles[0].split(',').length >= 4, B.calls.join(' | '));
    ['getCourseNameSuffix', 'getShowContactPhone', 'getLastSyncInfo', 'getLastSyncError'].forEach(n => assert.ok(!B.calls.includes(n), n + ' sent alone'));
    assert.ok(!B.calls.some(c => /getCacheSheetUrl/.test(c)), 'sheet link is not on the page → not requested');
    assert.ok(/Last sync failed: Classroom quota exceeded/.test(await p.textContent('#errorBanner')), 'error-banner handler ran');
    assert.strictEqual(await p.evaluate(() => courseNameSuffix), 'AY26-27', 'suffix handler ran');
    assert.deepStrictEqual(B.errors, []); await B.ctx.close();
    F.env.ctx.PropertiesService.getScriptProperties().deleteProperty(G.LAST_SYNC_ERROR_KEY);
  });
  await t('a failed grouped call falls back to the normal one-by-one calls (same UI)', async () => {
    const B = await boot('admin@aps.org', 'admin', { failBundle: true }); const p = B.page;
    await p.waitForFunction(() => /Data last synced|No sync has run yet/.test(document.getElementById('syncInfo').textContent), null, { timeout: 15000 });
    ['getCourseNameSuffix', 'getLastSyncInfo', 'getLastSyncError'].forEach(n => assert.ok(B.calls.includes(n), n + ' fallback'));
    assert.deepStrictEqual(B.errors, []); await B.ctx.close();
  });
  await t('an expired session inside the grouped call returns to the sign-in screen, as before', async () => {
    const B = await boot('admin@aps.org', 'admin', { expireBundle: true }); const p = B.page;
    await p.waitForFunction(() => document.getElementById('apsGateOverlay').style.display !== 'none' && /sign in|Sign in/i.test(document.getElementById('apsGateOverlay').textContent), null, { timeout: 15000 });
    await B.ctx.close();
  });
  await t('tab revisit within 2 minutes reuses the Attendance view, reloads after the window; Classes search stays local', async () => {
    const B = await boot('admin@aps.org', 'admin'); const p = B.page;
    await p.waitForFunction(() => apsAccessGranted && allCourses.length > 0, null, { timeout: 15000 });
    await p.evaluate(() => switchView('attendance')); await p.waitForTimeout(700);
    const n1 = B.calls.length;
    await p.evaluate(() => switchView('classes')); await p.evaluate(() => switchView('attendance')); await p.waitForTimeout(500);
    assert.strictEqual(B.calls.length, n1, 'no reload on a quick revisit');
    await p.evaluate(() => { apsTabLoadedAt_ = {}; }); await p.evaluate(() => switchView('classes')); await p.evaluate(() => switchView('attendance')); await p.waitForTimeout(500);
    assert.ok(B.calls.length > n1, 'reloads once the window has passed');
    await p.evaluate(() => switchView('classes')); const n2 = B.calls.length;
    await p.focus('#search'); await p.keyboard.type('nilai'); await p.waitForTimeout(700);
    assert.strictEqual(B.calls.length, n2, 'search filters the loaded classes locally');
    assert.deepStrictEqual(B.errors, []); await B.ctx.close();
  });
  await t('the 5-minute background refresh is skipped while the browser tab is hidden and runs once when it is shown again', async () => {
    const B = await boot('admin@aps.org', 'admin'); const p = B.page;
    await p.waitForFunction(() => apsAccessGranted && allCourses.length > 0, null, { timeout: 15000 });
    const count = () => B.calls.filter(c => c === 'getDashboardData').length;
    const c0 = count();
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); quietRefreshDashboard(); });
    await p.waitForTimeout(300); assert.strictEqual(count(), c0, 'hidden → no refresh');
    await p.evaluate(() => { quietRefreshLastAt = Date.now() - DASHBOARD_POLL_MS; Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await p.waitForTimeout(500); assert.strictEqual(count(), c0 + 1, 'shown again → one catch-up refresh');
    assert.deepStrictEqual(B.errors, []); await B.ctx.close();
  });
  await t('server: getStartupBundle runs only whitelisted endpoints with their own checks', async () => {
    const r = J(G.getStartupBundle(F.tok2.student, ['getCourseNameSuffix', 'getCacheSheetUrl', 'getZohoSyncStatus', 'deleteDashboardUserRole', 'eval']));
    assert.strictEqual(r.getCourseNameSuffix.ok, 'AY26-27');
    assert.ok(/Only Admin/.test(r.getCacheSheetUrl.err), 'role check of the original function still applies');
    assert.ok(r.getZohoSyncStatus.err);
    assert.ok(!('deleteDashboardUserRole' in r) && !('eval' in r), 'nothing outside the whitelist runs');
    assert.throws(() => G.getStartupBundle('bad-token', ['getCourseNameSuffix']), /SESSION_EXPIRED/);
  });
  await browser.close();
  console.log('\nALL ' + passed + ' PERFORMANCE UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

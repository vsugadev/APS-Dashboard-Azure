// r69: approved removals + "DONOTUSE($$)" Force Sync kept for Admin / Super Admin only (node test/r69.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const J = x => JSON.parse(JSON.stringify(x));
const { setup, D } = require('./coveragefixture');
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const code = fs.readFileSync(__dirname + '/../Code.gs', 'utf8');
const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8');
(async () => {
  await t('removed: getSyncIntervalMinutes, getAttendanceConfig, getAttendanceRecordsForAdmin — gone from the server and never called by the page', () => {
    const F = setup();
    ['getSyncIntervalMinutes', 'getAttendanceConfig', 'getAttendanceRecordsForAdmin'].forEach(f => {
      assert.strictEqual(typeof F.G[f], 'undefined', f);
      assert.ok(!new RegExp('function ' + f + '\\(').test(code), f + ' definition');
      assert.ok(!new RegExp('\\.' + f + '\\(').test(html), f + ' client call');
    });
  });
  await t('removed: leftover on-call card styling (.oncall-roster-*, .oncall-extra-count); the [TCS] badge style stays', () => {
    assert.ok(!/oncall-roster|oncall-extra-count/.test(html));
    assert.ok(/\.person-tcs-badge \{/.test(html));
  });
  await t('the attendance read every role uses (Admin / HM included) still works', () => {
    const F = setup();
    for (const [e, r] of [['admin@aps.org', 'admin'], ['hm@aps.org', 'headmaster']]) {
      const out = J(F.G.getAttendanceRecordsForViewer(F.tok(e, r), {}));
      assert.ok(out && typeof out === 'object', r + ' gets a result');
    }
  });
  await t('Force Sync: server still refuses everyone except Admin / Super Admin', () => {
    const F = setup();
    for (const [e, r] of [['hm@aps.org', 'headmaster'], ['bod@aps.org', 'vcfo_amchsts_bod'], ['ayana_aps8123' + D, 'teacher'], ['sa0_aps6650' + D, 'student']]) {
      assert.throws(() => F.G.forceSyncClassroomData(F.tok(e, r)), /Only an Admin/, r);
    }
    assert.doesNotThrow(() => F.G.forceSyncClassroomData(F.tok('admin@aps.org', 'admin')));
    assert.doesNotThrow(() => F.G.forceSyncClassroomData(F.tok('super@aps.org', 'superadmin')));
  });

  const F = setup(); const { G, tok } = F;
  const page0 = html.replace(/<\?!?=.*?\?>/gs, 'null');
  const browser = await chromium.launch();
  async function open(email, role) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const token = tok(email, role);
    await page.exposeFunction('__gas', async (fn, args) => { try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: page0 }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses; apsAccessGranted = true;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); apsApplyTabAccess_(); updateFilterButtons(); updateForceSyncVisibility(); }, { data, token });
    await page.waitForTimeout(400);
    return { page, ctx, errors };
  }
  for (const [e, r, want] of [['admin@aps.org', 'admin', true], ['super@aps.org', 'superadmin', true], ['hm@aps.org', 'headmaster', false], ['bod@aps.org', 'vcfo_amchsts_bod', false], ['ayana_aps8123' + D, 'teacher', false], ['sa0_aps6650' + D, 'student', false]]) {
    await t('"DONOTUSE($$)" Force Sync button ' + (want ? 'visible' : 'hidden') + ' for ' + r, async () => {
      const R = await open(e, r);
      assert.strictEqual(await R.page.isVisible('#forceSync'), want);
      if (want) {
        assert.strictEqual((await R.page.textContent('#forceSync')).trim(), 'DONOTUSE($$)');
        if (r === 'admin') await R.page.screenshot({ path: __dirname + '/r69_admin_forcesync.png', clip: { x: 0, y: 380, width: 1366, height: 220 } });
      }
      assert.deepStrictEqual(R.errors, []); await R.ctx.close();
    });
  }
  await browser.close();
  console.log(process.exitCode ? 'SOME R69 TESTS FAILED' : 'ALL ' + pass + ' R69 TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

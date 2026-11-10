// Browser test: r96 — server calls per open tab (fake clock, 1 hour) + chat refreshed through the realtime poll (node test/ui_concurrency.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { prep, J } = require('./ttfixture');
const F = prep(); const { G } = F;
(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  async function open(token) {
    const calls = []; const ctx = await browser.newContext(); const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.clock.install();
    await page.route(/^https:\/\/(?!aps\.test\/).*/, r => r.abort());
    await page.exposeFunction('__gas', async (fn, args) => { calls.push(fn); try { const o = G[fn].apply(null, args); return JSON.stringify({ ok: o === undefined ? null : J(o) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses; apsAccessGranted = true;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); apsApplyTabAccess_(); }, { data, token });
    return { page, ctx, calls, errors };
  }
  await t('an open student tab makes far fewer server calls (was ~171 / hour): no chat polling, jittered realtime + 5-min refresh', async () => {
    const S = await open(F.tk.student);
    await S.page.clock.runFor(3600000);
    const by = {}; S.calls.forEach(c => by[c] = (by[c] || 0) + 1);
    console.log('   calls in 1 hour:', S.calls.length, JSON.stringify(by));
    assert.ok(S.calls.length <= 75, 'at most 75 calls / hour when no class is live, got ' + S.calls.length);
    assert.ok(!by.getChatMessages, 'closed chat is not polled while nothing changed');
    assert.ok(by.getDashboardData >= 10 && by.getDashboardData <= 14, 'the 5-minute refresh still runs (jittered)');
    assert.ok(by.getRealtimeStatusSnapshot >= 25, 'realtime poll still runs (≈40 at 90 s ±15 %; a poll whose reply is still in flight is skipped under the fake clock)');
    // a new chat message → the next realtime poll sees the new version → exactly one chat reload
    S.calls.length = 0;
    G.postChatMessage(F.tk.admin, 'Class starts in 10 minutes');
    for (let i = 0; i < 12; i++) { await S.page.clock.runFor(10000); await S.page.waitForTimeout(30); } // let each async server reply land before time moves on
    await S.page.waitForFunction(() => chatMessages.some(m => /Class starts in 10 minutes/.test(m.message)), null, { timeout: 5000 });
    assert.strictEqual(S.calls.filter(c => c === 'getChatMessages').length, 1, 'one reload after the change');
    await S.page.clock.runFor(600000);
    assert.strictEqual(S.calls.filter(c => c === 'getChatMessages').length, 1, 'no further chat calls while unchanged');
    assert.deepStrictEqual(S.errors, []); await S.ctx.close();
  });
  await t('while a class is live the server asks for 45-s polls; hidden tabs stay silent', async () => {
    const real = G.apsClassLiveBoxesForViewer_; G.apsClassLiveBoxesForViewer_ = () => ({ x: { live: true, line1: '', line2: '' } });
    const S = await open(F.tk.student);
    await S.page.clock.runFor(600000);
    const n = S.calls.filter(c => c === 'getRealtimeStatusSnapshot').length;
    assert.ok(n >= 11 && n <= 16, '45-s cadence ×(0.85–1.15) over 10 min, got ' + n);
    G.apsClassLiveBoxesForViewer_ = real;
    await S.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); });
    S.calls.length = 0; await S.page.clock.runFor(900000);
    assert.strictEqual(S.calls.length, 0, 'a hidden tab makes no calls');
    await S.ctx.close();
  });
  await browser.close();
  console.log('ALL ' + passed + ' CONCURRENCY UI TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

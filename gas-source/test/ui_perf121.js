// r121 browser test: the realtime poll updates online dots without a class-status change; default photo still shown (node test/ui_perf121.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { setup } = require('./coveragefixture');
const F = setup(); const { G, env } = F; const J = x => JSON.parse(JSON.stringify(x));
(async () => {
  const browser = await chromium.launch(); let passed = 0; const t = async (n, fn) => { await fn(); passed++; console.log('PASS', n); };
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  async function open(tokKey) {
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 1000 } })).newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); const calls = [];
    await page.exposeFunction('__gas', async (fn, args) => { calls.push(fn); try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const token = F.tok2[tokKey]; const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses; apsAccessGranted = true;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); }, { data, token });
    await page.waitForTimeout(200); return { page, errors, calls };
  }
  await t('admin: a student coming online shows a green dot on the next poll even though no class status changed; default photos still render', async () => {
    const A = await open('admin'); const p = A.page; const stu = 'sa0_aps6650@avvaiyarpadasalai.org';
    const imgs = await p.$$eval('.avatar-wrap img', a => a.map(i => i.getAttribute('src')));
    assert.ok(imgs.length && imgs.every(s => s && s.startsWith('http')), 'every avatar has a src (placeholder when the server sent "")');
    await p.evaluate(() => pollRealtimeOperationalStatus()); await p.waitForTimeout(300);
    const dotsBefore = await p.$$eval('.online-dot', d => d.length);
    G.CacheService.getScriptCache().remove('aps_hb_' + stu); G.recordHeartbeat_(stu); G.CacheService.getScriptCache().remove('aps_rt_recent_v1');
    await p.evaluate(() => pollRealtimeOperationalStatus()); await p.waitForTimeout(400);
    const dotsAfter = await p.$$eval('.online-dot', d => d.length);
    assert.ok(dotsAfter > dotsBefore, 'online dot added by the poll: ' + dotsBefore + ' → ' + dotsAfter);
    assert.deepStrictEqual(A.errors, []); await p.close();
  });
  await t('student: the poll reply has only their class and people; the page still works', async () => {
    const S = await open('student'); const p = S.page;
    const reply = J(G.getRealtimeStatusSnapshot(F.tok2.student)); const mine = J(G.getDashboardData(F.tok2.student)).courses.map(c => String(c.id));
    Object.keys(reply.live).concat(Object.keys(reply.teacherNotInClass)).forEach(id => assert.ok(mine.includes(id)));
    await p.evaluate(() => pollRealtimeOperationalStatus()); await p.waitForTimeout(300);
    assert.deepStrictEqual(S.errors, []); await p.close();
  });
  await browser.close(); console.log(`\nALL ${passed} r121 UI TESTS PASSED`);
})().catch(e => { console.error(e); process.exit(1); });

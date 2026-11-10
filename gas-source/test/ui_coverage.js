// Browser test: r58 Classes → Temporary Class Coverage (node test/ui_coverage.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { setup, ID, FRI } = require('./coveragefixture');
const F = setup(); const { env, tok, J, G } = F;
(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  async function open(email, role, o) {
    o = o || {};
    const ctx = await browser.newContext({ viewport: o.vp || { width: 1366, height: 1000 }, permissions: o.noClipboard ? [] : ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const token = tok(email, role);
    await page.exposeFunction('__gas', async (fn, args) => { try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript((noClip) => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } };
      if (noClip) { Object.defineProperty(navigator, 'clipboard', { value: undefined }); document.execCommand = () => false; } }, !!o.noClipboard);
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); }, { data, token });
    await page.waitForTimeout(200);
    return { page, errors, data };
  }

  const clean = p => p.evaluate(() => { document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'); document.activeElement && document.activeElement.blur(); });
  await t('HM: Classes → Temporary Class Coverage — pick class, date, coverage class; summary, recipients, preview; confirm & apply; history', async () => {
    const H = await open('hm@aps.org', 'headmaster'); const p = H.page;
    assert.strictEqual(await p.isVisible('#subTabCoverage'), true);
    await p.click('#subTabCoverage');
    assert.deepStrictEqual(await p.$$eval('.view-tab.active', b => b.map(x => x.id)), ['tabClasses']);
    await p.waitForFunction(() => document.querySelectorAll('#tccOrig option').length > 5);
    await p.selectOption('#tccOrig', ID.EA);
    await p.waitForFunction(() => document.querySelectorAll('#tccDestList input[name=tccDest]').length === 3);
    assert.ok(/Ayana Nivedida Parthiban/.test(await p.textContent('#tccOrigInfo')));
    const chip = await p.$eval('#tccDates [aria-pressed=true]', b => b.getAttribute('data-tcc-date')); assert.strictEqual(new Date(chip + 'T12:00:00Z').getUTCDay(), 5, 'first upcoming Friday pre-selected');
    assert.ok(/Eastern Time \((EDT|EST)\)/.test(await p.textContent('#tccDateInfo')));
    assert.strictEqual(await p.$eval(`#tccDestList input[value="${ID.EC}"]`, i => i.disabled), true, 'no Meet → not selectable');
    assert.strictEqual(await p.isVisible('#tccSummaryCard'), false);
    await p.check(`#tccDestList input[value="${ID.ED}"]`);
    await p.waitForFunction(() => document.getElementById('tccSummaryCard').style.display === '');
    const sum = await p.textContent('#tccSummary');
    ['MUNMAZHALAI - EA', 'Ayana Nivedida Parthiban — unavailable', 'MUNMAZHALAI - ED', 'Kavitha Raman', 'https://meet.google.com/abc-defg-hij', '14 from the original class'].forEach(x => assert.ok(sum.includes(x), x));
    const rec = await p.textContent('#tccRecip'); assert.ok(/14 students .* BCC/.test(rec) && /admin@avvaiyarpadasalai.org/.test(rec), rec);
    assert.ok((await p.textContent('#tccAnn')).startsWith('📢🔀 Class Merge Notice 🔀📢 –  '));
    assert.strictEqual(await p.$eval('#tccApply', b => b.disabled), true, 'needs the tick');
    await p.click('#tccPreviewStudent'); assert.strictEqual(await p.isVisible('#tccFrame'), true);
    assert.ok((await p.$eval('#tccFrame', f => f.srcdoc)).includes('Join Merged Class – Google Meet'));
    await clean(p); await p.setViewportSize({ width: 1366, height: 3000 });
    await p.screenshot({ path: __dirname + '/coverage_hm.png', clip: await p.$eval('#coverageView', e => { const r = e.getBoundingClientRect(); return { x: 0, y: r.y + scrollY - 60, width: 1366, height: Math.min(r.height + 60, 2900) }; }) });
    await p.check('#tccConfirm');
    assert.strictEqual(await p.$eval('#tccApply', b => b.disabled), false);
    await p.click('#tccApply');
    await p.waitForFunction(() => document.getElementById('tccResult').style.display === '' && /Coverage applied|already|could not/.test(document.getElementById('tccResult').textContent));
    assert.ok(/Coverage applied/.test(await p.textContent('#tccResult')), await p.textContent('#tccResult'));
    assert.strictEqual(F.ann.created, 1);
    await p.waitForFunction(() => /MUNMAZHALAI - EA/.test(document.getElementById('tccHistory').textContent));
    const hist = await p.textContent('#tccHistory'); assert.ok(/POSTED/.test(hist) && /SENT/.test(hist) && /PENDING/.test(hist), hist);
    // the same class + date can no longer be applied (server), and the form says so
    await p.waitForFunction(() => /already arranged/.test(document.getElementById('tccErrors').textContent));
    assert.deepStrictEqual(H.errors, []);
    await p.close();
  });
  await t('class VP: sees only the classes they support; a plain teacher, student and BOD never see the sub-tab', async () => {
    const V = await open(F.vpEmail, 'teacher'); const p = V.page;
    assert.strictEqual(await p.isVisible('#subTabCoverage'), true);
    await p.click('#subTabCoverage');
    await p.waitForFunction(() => document.querySelectorAll('#tccOrig option').length > 1);
    assert.deepStrictEqual(await p.$$eval('#tccOrig option', o => o.map(x => x.value).filter(Boolean)), [ID.EA]);
    await p.close();
    for (const [e, r] of [['kavitha_aps8130@avvaiyarpadasalai.org', 'teacher'], ['sa0_aps6650@avvaiyarpadasalai.org', 'student'], ['bod@aps.org', 'vcfo_amchsts_bod']]) {
      const X = await open(e, r);
      assert.strictEqual(await X.page.isVisible('#subTabCoverage'), false, r);
      await X.page.evaluate(() => switchView('coverage'));
      assert.strictEqual(await X.page.evaluate(() => currentView), 'classes', r + ': forced open falls back');
      await X.page.close();
    }
  });
  await t('phone + tablet: no page-wide horizontal scroll; history becomes stacked cards', async () => {
    for (const vp of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
      const A = await open('admin@aps.org', 'admin', { vp }); const p = A.page;
      await p.evaluate(() => switchView('coverage'));
      await p.waitForFunction(() => document.querySelectorAll('#tccOrig option').length > 5);
      await p.selectOption('#tccOrig', ID.EB);
      await p.waitForFunction(() => document.querySelectorAll('#tccDestList input[name=tccDest]').length >= 1);
      await p.check(`#tccDestList input[value="${ID.ED}"]`);
      await p.waitForFunction(() => document.getElementById('tccSummaryCard').style.display === '');
      const wide = await p.evaluate(() => { const W = innerWidth, out = []; document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (r.right > W + 1 && r.width > 0 && getComputedStyle(e).position !== 'fixed') out.push(e.tagName + '#' + e.id + '.' + String(e.className).slice(0,40) + ' ' + Math.round(r.right)); }); return out.slice(0, 8); });
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no page scroll at ' + vp.width + ' ' + JSON.stringify(wide));
      if (vp.width < 500) { await clean(p); await p.screenshot({ path: __dirname + '/coverage_phone.png', fullPage: true }); }
      await p.close();
    }
  });
  await browser.close();
  console.log('\nALL ' + passed + ' TEMPORARY CLASS COVERAGE UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

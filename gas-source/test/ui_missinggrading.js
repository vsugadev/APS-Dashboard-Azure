// Browser test: r116 — Assignment Monitoring → ⚙️ Admin → 🧑‍🏫 Grading Help Team report card (node test/ui_missinggrading.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const F = require('./missinggrading'); const { G, tok, mails, J, ADMIN } = F;
(async () => {
  const browser = await chromium.launch();
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } }); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
  await page.route(/^https:\/\/(?!aps\.test\/).*/, r => r.abort());
  await page.exposeFunction('__gas', async (fn, args) => { try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
  await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
    return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
    window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
  await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto('https://aps.test/', { waitUntil: 'load' });
  const data = J(G.getDashboardData(ADMIN));
  await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses; document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); apsApplyTabAccess_(); }, { data, token: ADMIN });
  await page.evaluate(() => { switchView('assignMon'); });
  await page.click('[data-am-tab="admin"]');
  await page.waitForSelector('#mhgCard #mhgSave');
  assert.ok(/Every Tuesday morning \(~8–9 AM EST\)/.test(await page.textContent('#mhgCard')));
  assert.strictEqual(await page.inputValue('#mhgTo'), 'grading@avvaiyarpadasalai.org');
  assert.strictEqual(await page.$$eval('#mhgCard .mhgCat:checked', x => x.length), 3);
  // preview (nothing sent)
  const n0 = mails.length;
  await page.click('#mhgPreview'); await page.waitForSelector('#examQpModalOverlay.open');
  const pv = await page.textContent('#examQpModalBody');
  assert.ok(/7 submission\(s\) · 3 class\(es\)/.test(pv) && /Open Google Classroom/.test(pv) && /Preview only/.test(pv), pv.slice(0, 300));
  await page.screenshot({ path: __dirname + '/r116_grading_report_preview.png' });
  await page.click('#examQpModalButtons .gtr-btn'); assert.strictEqual(mails.length, n0);
  // homework only → save → preview shows homework only
  await page.uncheck('#mhgCard .mhgCat[value="QUZ"]'); await page.uncheck('#mhgCard .mhgCat[value="TRMST"]');
  await page.click('#mhgSave'); await page.waitForFunction(() => /saved/.test(document.getElementById('mhgMsg').textContent));
  assert.deepStrictEqual(J(G.mhgConfig_().categories), ['HW']);
  // send now
  await page.click('#mhgSend'); await page.waitForSelector('#examQpModalOverlay.open'); await page.click('#examQpModalButtons .gtr-btn.primary');
  await page.waitForFunction(() => /Sent:|already sent/.test(document.getElementById('mhgMsg').textContent));
  assert.strictEqual(mails.length, n0 + 1); assert.ok(mails[mails.length - 1].m.html.includes('HW_LSN_2') && !mails[mails.length - 1].m.html.includes('QUZ_LSN_3'));
  await page.waitForFunction(() => document.querySelectorAll('#mhgCard table tr').length >= 2);
  await (await page.$('#mhgCard')).screenshot({ path: __dirname + '/r116_grading_report_admin.png' });
  // the card survives an Admin-tab re-render
  await page.evaluate(() => { amEl_('amBody').innerHTML = amAdminHtml_(am.adminData); mhgMount_(amEl_('amBody')); });
  assert.ok(await page.isVisible('#mhgSave'));
  // a teacher cannot call the endpoints
  const T = tok('anbu_aps801@avvaiyarpadasalai.org', 'teacher'); assert.throws(() => G.sendMissingGradingNow(T, {}), /permission/);
  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('PASS Grading Help Team card: settings, preview (nothing sent), homework-only save, Send now (one email), recent reports, re-render, teacher refused');
  console.log('1/1 passed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

// Browser test: r90 — Class Teacher Availability button labels (text only) on Classes → Google Classroom cards (node test/ui_availlabels.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { prep, ID, J, AYANA } = require('./ttfixture');
const F = prep(); const { G } = F;
(async () => {
  const browser = await chromium.launch();
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  const calls = [];
  async function open(token, vp) {
    const ctx = await browser.newContext({ viewport: vp || { width: 1366, height: 1000 } }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route(/^https:\/\/(?!aps\.test\/).*/, r => r.abort());
    await page.exposeFunction('__gas', async (fn, args) => { calls.push([fn, args]); try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); updateClassChangeTabVisibility(); apsApplyTabAccess_(); updateMeetPreviewTabVisibility(); loadWeeklyPanel(); }, { data, token });
    await page.waitForTimeout(600); return { page, errors, ctx };
  }
  const A = await open(F.tok(AYANA, 'teacher')); const p = A.page; const card = '[data-course-id="' + ID.EA + '"]';
  await p.waitForSelector(card + ' [data-avail-yes]');
  const yes = await p.textContent(card + ' [data-avail-yes]'), no = await p.textContent(card + ' [data-avail-no]');
  assert.strictEqual(yes, '🟢 Click to Confirm – I’m Available' + 'கிளிக் செய்து உறுதிப்படுத்தவும்');
  assert.strictEqual(await p.$eval(card + ' [data-avail-yes] .avail-btn-sub', e => getComputedStyle(e).fontSize), '10.5px');
  assert.strictEqual(no, '🔴 Click to Confirm – I’m Not Available');
  assert.ok((await p.$eval(card + ' [data-avail-yes]', e => e.outerHTML)).includes('Mark this class as confirmed: I can teach this week.'), 'tooltip unchanged');
  await p.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), card + ' [data-avail-yes]');
  await p.screenshot({ path: __dirname + '/r90_avail_buttons.png' });
  // same action as before: clicking (even on the Tamil line) still calls setTeacherAvailabilityStatus with 'confirmed'
  const n0 = calls.length; await p.click(card + ' [data-avail-yes] .avail-btn-sub'); await p.waitForTimeout(400);
  const c = calls.slice(n0).find(x => /Availability/.test(x[0])); assert.ok(c && JSON.stringify(c[1]).includes('confirmed'), JSON.stringify(calls.slice(n0)));
  G.setTeacherAvailabilityStatus(F.tok(AYANA, 'teacher'), ID.EA, 'pending', ''); // r102: after a response a teacher sees only Reset — start the phone check from No Response
  const B = await open(F.tok(AYANA, 'teacher'), { width: 390, height: 860 }); await B.page.waitForSelector(card + ' [data-avail-no]');
  assert.ok(await B.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no side scroll on phone');
  await B.page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), card + ' [data-avail-no]');
  await B.page.screenshot({ path: __dirname + '/r90_avail_buttons_phone.png' });
  assert.deepStrictEqual(A.errors.concat(B.errors), []);
  await browser.close(); console.log('ALL 1 AVAILABILITY LABEL UI TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

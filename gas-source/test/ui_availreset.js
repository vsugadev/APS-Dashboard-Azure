// Browser test: r102 — Teacher Weekly Availability: polite "Not Available" popup, Reset-only after a response, local card update (node test/ui_availreset.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { prep, ID, J, AYANA } = require('./ttfixture');
const F = prep(); const { G } = F;
let failNext = false;
const tests = []; const t = (n, fn) => tests.push([n, fn]);
(async () => {
  const browser = await chromium.launch();
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  const calls = [];
  async function open(token, vp) {
    const ctx = await browser.newContext({ viewport: vp || { width: 1366, height: 1000 } }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
    await page.route(/^https:\/\/(?!aps\.test\/).*/, r => r.abort());
    await page.exposeFunction('__gas', async (fn, args) => {
      calls.push([fn, args]);
      if (failNext && fn === 'setTeacherAvailabilityStatus') { failNext = false; return JSON.stringify({ err: 'Could not save — please try again.' }); }
      try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); }
    });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); updateClassChangeTabVisibility(); apsApplyTabAccess_(); updateMeetPreviewTabVisibility(); loadWeeklyPanel(); }, { data, token });
    await page.waitForTimeout(600); return { page, errors, ctx, data };
  }
  const card = '[data-course-id="' + ID.EA + '"] .weekly-inline';
  const btns = p => p.$$eval(card + ' .avail-actions button', b => b.map(x => x.textContent.trim()));
  const after = n => calls.slice(n).map(c => c[0]).filter(f => !/Realtime|LiveBox|Chat|Notice|Startup/.test(f));
  const TK = F.tok(AYANA, 'teacher');
  G.setTeacherAvailabilityStatus(TK, ID.EA, 'pending', '');
  let A, p, studentCount;

  t('no response yet: Available + Not Available, no Reset', async () => {
    A = await open(TK); p = A.page; await p.waitForSelector(card + ' [data-avail-no]');
    assert.deepStrictEqual(await btns(p), ['🟢 Click to Confirm – I’m Availableகிளிக் செய்து உறுதிப்படுத்தவும்', '🔴 Click to Confirm – I’m Not Available']);
    studentCount = A.data.courses.find(c => String(c.id) === String(ID.EA)).studentCount;
    assert.ok(studentCount > 0);
  });
  t('AC1/AC2: Not Available opens the polite popup with the class student count — no server call, nothing saved', async () => {
    const n = calls.length; await p.click(card + ' [data-avail-no]');
    await p.waitForSelector('#availNaOverlay.open');
    const txt = await p.textContent('#availNaOverlay');
    ['Before you confirm your unavailability', 'You have ' + studentCount + ' students in your class this week.', 'Parent Teacher', 'WhatsApp', 'VP and HM', 'Thank you for helping us make the class coverage process easier.']
      .forEach(x => assert.ok(txt.includes(x), x));
    assert.deepStrictEqual(await p.$$eval('#availNaOverlay button', b => b.map(x => x.textContent.trim())), ['Go Back', 'Confirm – I’m Not Available']);
    assert.deepStrictEqual(after(n), [], 'no API call to open the popup');
    await p.screenshot({ path: __dirname + '/r102_avail_popup.png' });
  });
  t('AC3: Go Back closes the popup and saves nothing (also Esc)', async () => {
    const n = calls.length; await p.click('#availNaBack');
    assert.ok(!(await p.$('#availNaOverlay.open')));
    assert.strictEqual(await p.$(card + ' [data-avail-alt]'), null, 'arrangements not opened');
    await p.click(card + ' [data-avail-no]'); await p.waitForSelector('#availNaOverlay.open'); await p.keyboard.press('Escape');
    assert.ok(!(await p.$('#availNaOverlay.open')));
    assert.deepStrictEqual(after(n), []);
    assert.strictEqual(G.getWeeklyPanelData(TK).availability.find(r => String(r.courseId) === String(ID.EA)).status, 'pending');
  });
  t('AC8: a failed save keeps both buttons, no Reset', async () => {
    await p.click(card + ' [data-avail-no]'); await p.click('#availNaConfirm');
    await p.waitForSelector(card + ' [data-avail-alt]');
    failNext = true; await p.click(card + ' [data-avail-alt][data-alt-key="parent_teacher_arranged"]'); await p.waitForTimeout(400);
    const b = await btns(p);
    assert.ok(b.includes('🔴 Click to Confirm – I’m Not Available') && b.some(x => /I’m Available/.test(x)) && !b.includes('Reset the Availability'), JSON.stringify(b));
  });
  t('AC4: Confirm → existing arrangement choices → saved → only "Reset the Availability"; card updated locally (no reload call)', async () => {
    await p.click(card + ' [data-avail-alt][data-alt-key="parent_teacher_arranged"]');
    const n = calls.length; await p.waitForTimeout(500);
    const saved = calls.filter(c => c[0] === 'setTeacherAvailabilityStatus').pop();
    assert.strictEqual(saved[1][2], 'not_available'); assert.strictEqual(saved[1][3], 'parent_teacher_arranged');
    assert.deepStrictEqual(await btns(p), ['Reset the Availability']);
    assert.ok((await p.textContent(card)).includes('Parent-Teacher Arranged'));
    assert.ok(!calls.slice(n - 1).some(c => c[0] === 'getWeeklyPanelData' || c[0] === 'getDashboardData'), 'no reload after save');
    await p.screenshot({ path: __dirname + '/r102_avail_reset_only.png' });
  });
  t('AC7: refresh / reopen shows the saved state (Reset only)', async () => {
    const R = await open(TK); await R.page.waitForSelector(card + ' [data-avail-reset]');
    assert.deepStrictEqual(await btns(R.page), ['Reset the Availability']); await R.ctx.close();
  });
  t('AC8: a failed Reset keeps the Reset-only state', async () => {
    failNext = true; await p.click(card + ' [data-avail-reset]'); await p.waitForTimeout(400);
    assert.deepStrictEqual(await btns(p), ['Reset the Availability']);
  });
  t('AC6: Reset → both response buttons back, Reset hidden', async () => {
    await p.click(card + ' [data-avail-reset]'); await p.waitForTimeout(400);
    const b = await btns(p); assert.strictEqual(b.length, 2); assert.ok(!b.includes('Reset the Availability'));
    assert.strictEqual(G.getWeeklyPanelData(TK).availability.find(r => String(r.courseId) === String(ID.EA)).status, 'pending');
  });
  t('AC5: Available → only "Reset the Availability" (no popup for Available)', async () => {
    await p.click(card + ' [data-avail-yes]'); await p.waitForTimeout(400);
    assert.ok(!(await p.$('#availNaOverlay.open')));
    assert.deepStrictEqual(await btns(p), ['Reset the Availability']);
    const R = await open(TK); assert.deepStrictEqual(await btns(R.page), ['Reset the Availability']); await R.ctx.close();
  });
  t('an older realtime poll entry cannot undo the newer saved response', async () => {
    const res = await p.evaluate(id => { applyRealtimeWeeklyAvailability(id, { status: 'pending', alternative: '', updatedAt: '2000-01-01T00:00:00.000Z', updatedByName: 'old' });
      return Array.from(document.querySelectorAll('[data-course-id="' + id + '"] .weekly-inline .avail-actions button')).map(b => b.textContent.trim()); }, String(ID.EA));
    assert.deepStrictEqual(res, ['Reset the Availability']);
  });
  t('phone: popup fits, no side scroll', async () => {
    G.setTeacherAvailabilityStatus(TK, ID.EA, 'pending', '');
    const B = await open(TK, { width: 390, height: 760 }); await B.page.click(card + ' [data-avail-no]'); await B.page.waitForSelector('#availNaOverlay.open');
    const box = await B.page.$eval('#availNaOverlay .modal', e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom }; });
    assert.ok(box.l >= 0 && box.r <= 390 && box.b <= 760, JSON.stringify(box));
    assert.ok(await B.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await B.page.screenshot({ path: __dirname + '/r102_avail_popup_phone.png' });
    assert.deepStrictEqual(B.errors, []); await B.ctx.close();
  });
  t('Admin / HM unchanged: no popup, direct switching, Reset renamed + hidden with no response', async () => {
    G.setTeacherAvailabilityStatus(TK, ID.EA, 'pending', '');
    const H = await open(F.tk.hm); const q = H.page; await q.waitForSelector(card + ' [data-avail-no]');
    assert.ok(!(await btns(q)).includes('Reset the Availability'));
    await q.click(card + ' [data-avail-no]'); assert.ok(!(await q.$('#availNaOverlay.open')), 'no popup for HM');
    await q.waitForSelector(card + ' [data-avail-alt]');
    await q.click(card + ' [data-avail-yes]'); await q.waitForTimeout(400);
    const b = await btns(q); assert.ok(b.includes('🔴 Click to Confirm – I’m Not Available') && b.includes('Reset the Availability') && !b.some(x => /I’m Available/.test(x)), JSON.stringify(b));
    assert.deepStrictEqual(H.errors, []); await H.ctx.close();
  });
  t('no JavaScript errors in the teacher session', async () => { assert.deepStrictEqual(A.errors, []); });

  let fails = 0;
  for (const [n, fn] of tests) { try { await fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 4).join('\n   ')); } }
  await browser.close(); console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });

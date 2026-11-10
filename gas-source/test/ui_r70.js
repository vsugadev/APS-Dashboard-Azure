// r70 browser tests: Classes → Class Coverage Tracking + 🔄 Zoho CRM Sync (node test/ui_r70.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { setup, ID, D } = require('./coveragefixture');
const { install } = require('./zohomock');
const J = x => JSON.parse(JSON.stringify(x));
const F = setup(); const { G, tok } = F; const Z = install(F.env);
J(G.loadZohoSyncStudents(F.tok2.admin)).rows.filter(r => !r.multiple).forEach((r, i) => Z.records.push({ id: 'Z' + i, Student_APS_Email_Address: r.email, Grade: i % 3 ? r.grade : 'Nilai 1', Google_Classroom_Full_Name: i % 3 ? r.classroom : '', Teacher_Name: r.teacherName, Teacher_Email_Address: r.teacherEmail }));
Z.records.splice(4, 1); // one student not in Zoho
G.setTeacherAvailabilityStatus(F.tok2.admin, ID.EB, 'not_available', 'need_hm_support');
const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
(async () => {
  const browser = await chromium.launch();
  async function open(token, vp) {
    const ctx = await browser.newContext({ viewport: vp || { width: 1366, height: 1000 } }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('__gas', async (fn, args) => { try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses; apsAccessGranted = true;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); apsApplyTabAccess_();
      updateForceSyncVisibility(); updateClassChangeTabVisibility(); updateAttendanceTabVisibility(); updateExaminationTabVisibility(); updateTeacherAvailTabVisibility(); updateMeetPreviewTabVisibility(); }, { data, token });
    await page.waitForTimeout(400);
    return { page, ctx, errors };
  }
  const vis = (p, sel) => p.isVisible(sel);
  for (const [k, cct, zoho] of [['teacher', false, false], ['student', false, false], ['bod', false, false], ['hm', true, false], ['vp', true, false], ['admin', true, true]]) {
    await t(k + ': Class Coverage Tracking sub-tab ' + (cct ? 'shown' : 'hidden') + ', Zoho CRM Sync tab ' + (zoho ? 'shown' : 'hidden'), async () => {
      const R = await open(F.tok2[k]);
      assert.strictEqual(await vis(R.page, '#subTabCoverageTracking'), cct);
      assert.strictEqual(await vis(R.page, '#tabZohoSync'), zoho);
      if (!cct) { await R.page.evaluate(() => switchView('coverageTracking')); assert.strictEqual(await R.page.evaluate(() => currentView), 'classes', 'direct switch falls back'); }
      if (!zoho) { await R.page.evaluate(() => switchView('zohoSync')); assert.strictEqual(await vis(R.page, '#zohoView'), false); }
      assert.deepStrictEqual(R.errors, []); await R.ctx.close();
    });
  }
  await t('Super Admin also sees the Zoho CRM Sync tab', async () => {
    const R = await open(tok('super@aps.org', 'superadmin')); assert.strictEqual(await vis(R.page, '#tabZohoSync'), true); await R.ctx.close();
  });
  await t('Admin: coverage list (issues by default), add a record with an example action, status badge, history, filter + search', async () => {
    const R = await open(F.tok2.admin); const p = R.page;
    await p.click('#subTabCoverageTracking'); await p.waitForTimeout(500);
    assert.strictEqual(await vis(p, '#cctView'), true); assert.strictEqual(await vis(p, '#classesView'), false);
    assert.strictEqual(await p.getAttribute('#subTabCoverageTracking', 'aria-selected'), 'true');
    let rows = await p.$$eval('#cctBody tr', r => r.map(x => x.innerText));
    assert.strictEqual(rows.length, 1); assert.ok(/MUNMAZHALAI - EB/.test(rows[0]) && /Not Available/.test(rows[0]) && /Not recorded/.test(rows[0]), rows[0]);
    await p.click('[data-cct-edit="' + ID.EB + '"]'); await p.waitForTimeout(200);
    assert.strictEqual(await p.inputValue('#cctStatus'), 'PENDING_COVERAGE', 'Not Available defaults to Pending Coverage');
    await p.selectOption('#cctStatus', 'SUBSTITUTE_ASSIGNED');
    await p.click('#cctSave'); await p.waitForTimeout(150);
    assert.ok(/Describe the action/.test(await p.textContent('#cctErr')), 'action required');
    await p.click('[data-cct-ex="HM arranged an on-call substitute."]');
    assert.strictEqual(await p.inputValue('#cctAction'), 'HM arranged an on-call substitute.');
    await p.screenshot({ path: __dirname + '/r70_cct_modal.png', clip: { x: 0, y: 0, width: 1366, height: 760 } });
    await p.click('#cctSave'); await p.click('#cctSave').catch(() => {}); await p.waitForTimeout(800);
    assert.strictEqual(await vis(p, '#cctModal'), false);
    rows = await p.$$eval('#cctBody tr', r => r.map(x => x.innerText));
    assert.ok(/Substitute Assigned/.test(rows[0]) && /HM arranged an on-call substitute/.test(rows[0]) && /History \(1\)/.test(rows[0]), rows[0]);
    assert.strictEqual(J(G.getClassCoverageHistory(F.tok2.admin, { weekId: await p.evaluate(() => cct.data.weekId), courseId: ID.EB })).length, 1, 'double click saved once');
    await p.selectOption('#cctFilter', 'all'); await p.waitForTimeout(150);
    assert.ok((await p.$$('#cctBody tr')).length > 5);
    await p.click('[data-cct-edit="' + ID.EC + '"]'); await p.selectOption('#cctStatus', 'CLASS_RESCHEDULED'); await p.fill('#cctAction', 'Class was rescheduled and parents were notified.'); await p.click('#cctSave'); await p.waitForTimeout(700);
    await p.click('.cct-sum [data-cct-f="g:rescheduled"]'); await p.waitForTimeout(150);
    rows = await p.$$eval('#cctBody tr', r => r.map(x => x.innerText)); assert.strictEqual(rows.length, 1); assert.ok(/MUNMAZHALAI - EC/.test(rows[0]));
    assert.strictEqual(await p.inputValue('#cctFilter'), 'g:rescheduled', 'chip and dropdown agree');
    await p.selectOption('#cctFilter', 's:SUBSTITUTE_ASSIGNED'); await p.waitForTimeout(150);
    assert.strictEqual((await p.$$('#cctBody tr')).length, 1);
    await p.selectOption('#cctFilter', 'all'); await p.fill('#cctSearch', 'on-call substitute'); await p.waitForTimeout(400);
    assert.strictEqual((await p.$$('#cctBody tr')).length, 1);
    await p.fill('#cctSearch', ''); await p.selectOption('#cctFilter', 'issues'); await p.waitForTimeout(400);
    await p.screenshot({ path: __dirname + '/r70_cct_admin.png', clip: { x: 0, y: 0, width: 1366, height: 820 } });
    await p.click('[data-cct-hist="' + ID.EB + '"]'); await p.waitForTimeout(500);
    const h = await p.$$eval('#cctHist tr', r => r.map(x => x.innerText));
    assert.strictEqual(h.length, 1); assert.ok(/admin@aps\.org/.test(h[0]) && /\(none\)\s*→\s*Substitute Assigned/.test(h[0]), h[0]);
    assert.strictEqual(await p.isDisabled('#cctSave'), true, 'history view is read-only');
    await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
  });
  await t('VP: only the supported class; phone layout has no sideways scroll', async () => {
    const R = await open(F.tok2.vp, { width: 390, height: 844 }); const p = R.page;
    await p.evaluate(() => switchView('coverageTracking')); await p.waitForTimeout(500);
    await p.selectOption('#cctFilter', 'all'); await p.waitForTimeout(150);
    const rows = await p.$$eval('#cctBody tr', r => r.map(x => x.innerText)); assert.strictEqual(rows.length, 1); assert.ok(/MUNMAZHALAI - EA/.test(rows[0]));
    assert.ok(/classes you support/.test(await p.textContent('#cctScope')));
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll');
    await p.screenshot({ path: __dirname + '/r70_cct_vp_phone.png', fullPage: false });
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
  });
  await t('Admin Zoho: connection chips (no secret shown) → Check → Load (no Zoho call) → Preview (no write) → Sync Selected with confirmation → summary → history', async () => {
    const R = await open(F.tok2.admin); const p = R.page;
    await p.click('#tabZohoSync'); await p.waitForTimeout(500);
    assert.strictEqual(await vis(p, '#zohoView'), true);
    assert.ok(/Zoho CRM – Student Contact Sync/.test(await p.textContent('#zohoView h2')) && /Update Current Google Classroom & Grade/.test(await p.textContent('.zh-subhead')));
    const conn = await p.textContent('#zhConn'); assert.ok(/Client ID/.test(conn) && !/SECRET/.test(conn));
    assert.strictEqual(await p.isDisabled('#zhPreview'), true); assert.strictEqual(await p.isDisabled('#zhSyncAll'), true);
    await p.click('#zhCheck'); await p.waitForTimeout(500);
    assert.ok(/Student_Contacts/.test(await p.textContent('#zhConn')) && /Google_Classroom_Full_Name/.test(await p.textContent('#zhConn')));
    const nReq = Z.requests.length;
    await p.click('#zhLoad'); await p.waitForTimeout(600);
    assert.strictEqual(Z.requests.length, nReq, 'Load does not call Zoho');
    assert.ok((await p.$$('#zhBody tr')).length > 10); assert.strictEqual(await p.isDisabled('#zhPreview'), false);
    const puts0 = Z.calls.put;
    await p.click('#zhPreview'); await p.waitForTimeout(900);
    assert.strictEqual(Z.calls.put, puts0, 'Preview writes nothing');
    const chips = await p.textContent('#zhSummary'); assert.ok(/Total Students/.test(chips) && /Ready to Update/.test(chips) && /Not Found/.test(chips), chips);
    await p.selectOption('#zhFilter', 'READY TO UPDATE'); await p.waitForTimeout(150);
    const boxes = await p.$$('#zhBody [data-zh-sel]'); assert.ok(boxes.length >= 2);
    await boxes[0].check(); await boxes[1].check();
    assert.ok(/Sync Selected \(2\)/.test(await p.textContent('#zhSyncSel')));
    await p.screenshot({ path: __dirname + '/r70_zoho_preview.png', clip: { x: 0, y: 0, width: 1366, height: 900 } });
    await p.click('#zhSyncSel'); await p.waitForTimeout(150);
    assert.strictEqual(await vis(p, '#zhModal'), true); assert.ok(/Update\s+2\s+existing Zoho Student Contact records/.test(await p.textContent('#zhModalBody')));
    await p.screenshot({ path: __dirname + '/r70_zoho_confirm.png', clip: { x: 0, y: 0, width: 1366, height: 760 } });
    await p.click('#zhModalCancel'); assert.strictEqual(Z.calls.put, puts0, 'cancel sends nothing');
    await p.click('#zhSyncSel'); await p.click('#zhModalGo'); await p.waitForTimeout(1200);
    assert.strictEqual(Z.calls.put, puts0 + 1); assert.strictEqual(Z.puts[Z.puts.length - 1].data.length, 2);
    assert.ok(/Sync finished — Updated 2/.test(await p.textContent('#zhMsg')));
    await p.selectOption('#zhFilter', 'UPDATED'); await p.waitForTimeout(150);
    assert.strictEqual((await p.$$('#zhBody tr')).length, 2);
    await p.click('#zhHistory'); await p.waitForTimeout(600);
    assert.ok(/SYNC_SELECTED/.test(await p.textContent('#zhHistBody')));
    await p.screenshot({ path: __dirname + '/r70_zoho_after.png', fullPage: false });
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
  });
  await t('Zoho page on a phone: no sideways page scroll', async () => {
    const R = await open(F.tok2.admin, { width: 390, height: 844 }); const p = R.page;
    await p.evaluate(() => switchView('zohoSync')); await p.waitForTimeout(400); await p.click('#zhLoad'); await p.waitForTimeout(600);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
  });
  await browser.close();
  console.log('ALL ' + passed + ' R70 UI TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

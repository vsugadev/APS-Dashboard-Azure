// Browser test: r61 — "Class Change Requests" + "Reference Letter Approvals" moved under Assign Classroom as sub-tabs
// (no behaviour change: each sub-tab shows only for the people who could open it before). node test/ui_asgmove.js
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { build } = require('./gradingfixture');
const APPROVER = 'teachera_aps101@avvaiyarpadasalai.org';
const F = build({ props: { GRADE_CHANGE_APPROVER_EMAILS: JSON.stringify([APPROVER]), REFERENCE_LETTER_APPROVER_EMAILS: JSON.stringify([APPROVER]) } }); const { env, tok, J, G } = F;
{ const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0); P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p; }
G.syncClassroomData();
(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  async function open(email, role, o) {
    o = o || {};
    const ctx = await browser.newContext({ viewport: o.vp || { width: 1366, height: 1000 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const token = tok(email, role);
    await page.exposeFunction('__gas', async (fn, args) => { try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses; apsAccessGranted = true;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); apsApplyTabAccess_();
      updateClassChangeTabVisibility(); updateReferenceLetterTabVisibility(); loadClassChangeApproverInfo(); loadReferenceLetterAccessInfo(); }, { data, token });
    await page.waitForTimeout(500);
    return { page, errors, ctx };
  }
  const subs = p => p.$$eval('#asgSubTabs [role=tab]', b => b.filter(x => x.offsetWidth).map(x => x.id));
  const visTop = p => p.$$eval('.view-tabs .view-tab', els => els.filter(e => e.offsetWidth).map(e => e.id));
  const CASES = [
    ['admin@aps.org', 'admin', ['subTabRemap', 'subTabRemove', 'subTabRlApprovals'], 'assignClassroom'],
    ['super@aps.org', 'superadmin', ['subTabRemap', 'subTabRemove'], 'assignClassroom'],
    ['bod@aps.org', 'vcfo_amchsts_bod', ['subTabRemap', 'subTabRemove', 'subTabClassChange'], 'assignClassroom'],
    ['joshua_aps3407@avvaiyarpadasalai.org', 'student', ['subTabClassChange'], 'classChange'],
    [APPROVER, 'teacher', ['subTabClassChange', 'subTabRlApprovals'], 'classChange'],
    ['teacherb_aps102@avvaiyarpadasalai.org', 'teacher', [], null]
  ];
  for (const [email, role, expect, first] of CASES) {
    await t(role + ' ' + email.split('@')[0] + ': old top tabs gone; Assign Classroom shows exactly the sub-tabs this user could open before', async () => {
      const R = await open(email, role); const p = R.page;
      const top = await visTop(p);
      assert.ok(!top.includes('tabClassChange') && !top.includes('rl-approvals-tab'), 'moved tabs are no longer in the top bar');
      assert.strictEqual(top.includes('tabAssignClassroom'), expect.length > 0, 'Assign Classroom shown only when it has something to show');
      if (!expect.length) { assert.deepStrictEqual(R.errors, []); await R.ctx.close(); return; }
      await p.click('#tabAssignClassroom'); await p.waitForTimeout(300);
      assert.strictEqual(await p.evaluate(() => currentView), first, 'opens the first available sub-tab');
      assert.deepStrictEqual(await subs(p), expect);
      assert.deepStrictEqual(await p.$$eval('.view-tab.active', b => b.filter(x => x.offsetWidth).map(x => x.id)), ['tabAssignClassroom']);
      if (expect.includes('subTabClassChange')) {
        await p.click('#subTabClassChange'); await p.waitForTimeout(300);
        assert.strictEqual(await p.isVisible('#classChangeView'), true); assert.strictEqual(await p.isVisible('#assignClassroomView'), false);
        assert.strictEqual(await p.getAttribute('#subTabClassChange', 'aria-selected'), 'true');
        assert.deepStrictEqual(await subs(p), expect, 'sub-tab row stays on the moved page');
        assert.deepStrictEqual(await p.$$eval('.view-tab.active', b => b.filter(x => x.offsetWidth).map(x => x.id)), ['tabAssignClassroom']);
        if (role === 'student') { assert.strictEqual(await p.isVisible('#classChangeStudentSection'), true); await p.screenshot({ path: __dirname + '/r61_student_classchange.png', clip: { x: 0, y: 0, width: 1366, height: 520 } }); }
        if (role === 'vcfo_amchsts_bod') assert.strictEqual(await p.isVisible('#classChangeReadOnlyBanner'), true);
      }
      if (expect.includes('subTabRlApprovals')) {
        await p.click('#subTabRlApprovals'); await p.waitForTimeout(300);
        assert.strictEqual(await p.isVisible('#rl-approvals-view'), true); assert.strictEqual(await p.isVisible('#classChangeView'), false);
        assert.strictEqual(await p.getAttribute('#subTabRlApprovals', 'aria-selected'), 'true');
        if (role === 'admin') await p.screenshot({ path: __dirname + '/r61_admin_rlapprovals.png', clip: { x: 0, y: 0, width: 1366, height: 520 } });
      }
      if (expect.includes('subTabRemap')) {
        await p.click('#subTabRemap'); await p.waitForTimeout(300);
        assert.strictEqual(await p.isVisible('#asgRemapPane'), true); assert.strictEqual(await p.isVisible('#rl-approvals-view'), false);
        await p.click('#subTabRemove'); await p.waitForTimeout(300); assert.strictEqual(await p.isVisible('#asgRemovePane'), true);
      }
      await p.click('#tabClasses'); await p.waitForTimeout(200);
      assert.strictEqual(await p.isVisible('#asgSubTabs'), false, 'row hidden on other tabs');
      assert.deepStrictEqual(R.errors, []); await R.ctx.close();
    });
  }
  await t('Access Control still applies: Class Change Requests off for students hides it (and the now-empty Assign Classroom tab); phone layout', async () => {
    const M = await open('joshua_aps3407@avvaiyarpadasalai.org', 'student', { vp: { width: 390, height: 844 } }); const m = M.page;
    await m.click('#tabAssignClassroom'); await m.waitForTimeout(300);
    assert.strictEqual(await m.isVisible('#subTabClassChange'), true);
    assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll');
    await m.screenshot({ path: __dirname + '/r61_student_phone.png', clip: { x: 0, y: 0, width: 390, height: 900 } });
    await M.ctx.close();
    G.saveAccessControl(tok('admin@aps.org', 'admin'), [{ role: 'student', key: 'classChange', visible: false }]);
    const R = await open('joshua_aps3407@avvaiyarpadasalai.org', 'student'); const p = R.page;
    assert.ok(!(await visTop(p)).includes('tabAssignClassroom'));
    assert.throws(() => G.getMyClassChangeRequests(tok('joshua_aps3407@avvaiyarpadasalai.org', 'student')), /ACCESS_OFF|turned off/i, 'server still refuses');
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
    G.saveAccessControl(tok('admin@aps.org', 'admin'), [{ role: 'student', key: 'classChange', visible: true }]);
  });
  await browser.close();
  console.log('ALL ' + passed + ' ASSIGN CLASSROOM SUB-TAB UI TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

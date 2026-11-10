// Browser test: r56 Admin Control → Access Control (node test/ui_access.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { build } = require('./gradingfixture');
const F = build(); const { env, cls, ids, tok, J, G } = F;
const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0);
P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p;
cls.courses.find(c => c.id === ids.N3EF).description = 'Join: https://meet.google.com/abc-defg-hij';
cls.courses.find(c => c.id === ids.N3EA).description = 'meet.google.com/xyz-wxyz-abc';
G.syncClassroomData();
G.classMeetDetectedSave_({ [ids.N4AB]: { code: 'DETECTEDXX', source: 'MEET_AUDIT_TEACHER_CODE', date: '2026-09-26', courseName: 'N4AB' } });
cls.courses.forEach(c => { c.alternateLink = 'https://classroom.google.com/c/' + c.id; });
G.syncClassroomData();
G.getWhatsAppLinksMap_(); // creates the sheet
{ const wa = env.wb.getSheetByName('WhatsApp_Group_Links'); const n = cls.courses.find(c => c.id === ids.N3EF).name; wa.getRange(2, 1, 1, 3).setValues([[n, '', 'https://chat.whatsapp.com/ExampleGroup']]); }
env.ctx.CacheService.getScriptCache().remove('aps_whatsapp_map_v1'); // r49: direct sheet edit — the 10-min WhatsApp cache is cleared by Force Sync in production

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

  const TEACH = 'teach_aps1@avvaiyarpadasalai.org';
  await t('admin: Admin Control → Access Control table, toggle, confirm, save, history', async () => {
    const A = await open('admin@aps.org', 'admin'); const p = A.page;
    assert.strictEqual(await p.isVisible('#tabAdminControl'), true);
    await p.click('#tabAdminControl');
    await p.waitForFunction(() => document.querySelectorAll('#acTable tbody tr').length === 44);
    assert.deepStrictEqual(await p.$$eval('#acSubTabs [role=tab]', b => b.filter(x => x.offsetParent).map(x => x.id)), ['subTabAccess', 'subTabBackup', 'subTabSchoolLeave'], 'User Roles is Super Admin only; r110: + School Leave Management');
    assert.deepStrictEqual(await p.$$eval('#acTable thead th', b => b.map(x => x.textContent)), ['Tab / Sub-tab', 'Super Admin', 'Admin', 'Headmaster', 'Teacher', 'Student', 'BOD / On-Call Coordinator', 'Authorized']);
    // r91: no 🔒 anywhere; every cell of the five roles is a working switch; former locked cells are dashed and OFF
    assert.ok(!(await p.textContent('#acTable')).includes('🔒'), 'no lock icon');
    for (const role of ['headmaster', 'teacher', 'student', 'vcfo_amchsts_bod', 'authorized']) assert.strictEqual(await p.$$eval('#acTable .ac-sw[data-role="' + role + '"]', b => b.length), 44, role + ': every cell switchable');
    assert.ok((await p.$$('#acTable .ac-sw.ac-opt[aria-checked="false"]')).length > 40, 'optional (former locked) cells start OFF');
    assert.ok(/not built for Student yet/.test(await p.getAttribute('#acTable .ac-sw[data-role="student"][data-key="zohoSync"]', 'data-tooltip') || await p.$eval('#acTable .ac-sw[data-role="student"][data-key="zohoSync"]', b => b.outerHTML)));
    assert.strictEqual(await p.$$eval('#acTable .ac-sw[disabled]', b => b.filter(x => / – Admin$/.test(x.getAttribute('aria-label'))).length) > 0, true, 'Admin column keeps its fixed cells (as pale switches)');
    await p.evaluate(() => document.querySelector('#acTable .ac-sw[data-role="student"][data-key="zohoSync"]').scrollIntoView({ block: 'center' }));
    await p.mouse.move(0, 0); await p.evaluate(() => { document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'); });
    await p.screenshot({ path: __dirname + '/r91_access_control.png' });
    assert.strictEqual(await p.$eval('#acSaveBtn', b => b.disabled), true);
    // hide Knowledge Base for Teacher
    await p.click('#acTable .ac-sw[data-role="teacher"][data-key="kb"]');
    assert.strictEqual(await p.textContent('#acPending'), '1 unsaved change');
    assert.strictEqual(await p.$eval('#acTable .ac-sw[data-role="teacher"][data-key="kb"]', b => b.closest('td').classList.contains('ac-chg')), true);
    // turning a tab off shows its sub-tabs as dimmed
    await p.click('#acTable .ac-sw[data-role="teacher"][data-key="exam"]');
    assert.strictEqual(await p.$eval('#acTable .ac-sw[data-role="teacher"][data-key="exam.grading"]', b => b.classList.contains('ac-parentoff')), true);
    await p.click('#acUndoBtn');
    assert.strictEqual(await p.isVisible('#acPending'), false);
    await p.click('#acTable .ac-sw[data-role="teacher"][data-key="kb"]');
    await p.click('#acTable .ac-sw[data-role="student"][data-key="exam.grading"]');
    await p.click('#acSaveBtn');
    const conf = await p.textContent('#acConfirm');
    assert.ok(/Save 2 changes/.test(conf) && /Teacher: 🎬 Knowledge Base – Videos → hidden/.test(conf), conf);
    assert.strictEqual(J(G.acEffectiveForRole_('teacher')).kb, undefined, 'nothing saved before confirm');
    await p.click('#acConfirmOk');
    await p.waitForFunction(() => /Last saved/.test(document.getElementById('acMsg').textContent));
    assert.strictEqual(J(G.acEffectiveForRole_('teacher')).kb, false);
    assert.strictEqual(J(G.acEffectiveForRole_('student'))['exam.grading'], false);
    await p.fill('#acSearch', 'ticket');
    assert.strictEqual((await p.$$('#acTable tbody tr')).length, 5, 'Tickets + 4 sub-tabs');
    await p.fill('#acSearch', '');
    await p.selectOption('#acRoleFilter', 'student');
    assert.strictEqual((await p.$$('#acTable thead th')).length, 2);
    await p.click('#acHistory summary');
    await p.waitForFunction(() => /HIDDEN/.test(document.getElementById('acHistoryBody').textContent));
    await p.selectOption('#acRoleFilter', '');
    await p.evaluate(() => { document.getElementById('acHistory').open = false; document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'); document.activeElement && document.activeElement.blur(); });
    await p.setViewportSize({ width: 1366, height: 1500 });
    await p.screenshot({ path: __dirname + '/access_control_admin.png', clip: await p.$eval('#acCard', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: Math.min(r.height, 1400) }; }) });
    assert.deepStrictEqual(A.errors, []);
    await p.close();
  });
  await t('teacher: hidden tab disappears, a forced open falls back to Classes, the server refuses', async () => {
    const T = await open(TEACH, 'teacher'); const p = T.page;
    assert.strictEqual(await p.isVisible('#tabKb'), false, 'Knowledge Base hidden');
    assert.strictEqual(await p.isVisible('#tabAdminControl'), false);
    await p.evaluate(() => switchView('kb'));
    assert.strictEqual(await p.evaluate(() => currentView), 'classes');
    assert.throws(() => G.getKnowledgeBaseVideos(tok(TEACH, 'teacher')), /ACCESS_OFF/);
    assert.deepStrictEqual(T.errors, []);
    await p.close();
  });
  await t('phone: the table scrolls inside its card (no page-wide horizontal scroll)', async () => {
    const A = await open('admin@aps.org', 'admin', { vp: { width: 390, height: 840 } }); const p = A.page;
    await p.evaluate(() => switchView('accessControl'));
    await p.waitForFunction(() => document.querySelectorAll('#acTable tbody tr').length === 44);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no page scroll');
    assert.ok(await p.$eval('.ac-scroll', e => e.scrollWidth > e.clientWidth), 'table scrolls inside');
    await p.screenshot({ path: __dirname + '/access_control_phone.png', fullPage: false });
    await p.close();
  });
  await t('Super Admin also gets User Roles & Permissions under Admin Control; other roles never see Admin Control', async () => {
    const S = await open('super@aps.org', 'superadmin'); const p = S.page;
    await p.click('#tabAdminControl');
    assert.strictEqual(await p.isVisible('#subTabUserRoles'), true);
    await p.click('#subTabUserRoles');
    assert.strictEqual(await p.isVisible('#userRolesView'), true);
    await p.close();
    for (const [e, r] of [['hm@aps.org', 'headmaster'], ['joshua_aps3407@avvaiyarpadasalai.org', 'student'], ['bod@aps.org', 'vcfo_amchsts_bod']]) {
      const X = await open(e, r);
      assert.strictEqual(await X.page.isVisible('#tabAdminControl'), false, r);
      await X.page.evaluate(() => switchView('accessControl'));
      assert.strictEqual(await X.page.evaluate(() => currentView), 'classes', r + ' forced open falls back');
      await X.page.close();
    }
  });
  await t('r75 Super Admin: "always on" cells become switches (own Access Control stays locked); Admin still sees them fixed', async () => {
    const S = await open('super@aps.org', 'superadmin'); const p = S.page;
    await p.click('#tabAdminControl');
    await p.waitForFunction(() => document.querySelectorAll('#acTable tbody tr').length === 44);
    assert.strictEqual(await p.isVisible('#acSuperNote'), true);
    assert.ok(await p.$('#acTable .ac-sw.ac-sa[data-role="admin"][data-key="classes"]'), 'Classes (always on) switchable for Admin by Super Admin');
    assert.ok(await p.$('#acTable .ac-sw[data-role="teacher"][data-key="classes"]:not(.ac-sa)'), 'r91: Teacher Classes is a normal switch');
    assert.ok(await p.$('#acTable .ac-sw[data-role="superadmin"][data-key="kb"]'), 'Super Admin column switchable');
    assert.strictEqual(await p.$eval('#acTable tr:has(td.ac-name:text-is("↳ 🔐 Access Control")) td:nth-child(2) .ac-sw', b => b.disabled), true, 'own Access Control locked');
    await p.click('#acTable .ac-sw[data-role="student"][data-key="classes"]');
    await p.click('#acTable .ac-sw[data-role="teacher"][data-key="classes.list"]');
    await p.click('#acTable .ac-sw[data-role="superadmin"][data-key="meetPreview"]');
    assert.strictEqual(await p.$eval('#acTable .ac-sw[data-role="student"][data-key="classes.list"]', b => b.disabled), false);
    assert.strictEqual(await p.textContent('#acPending'), '3 unsaved changes');
    await p.click('#acSaveBtn'); await p.click('#acConfirmOk');
    await p.waitForFunction(() => /Last saved .* by super@aps.org/.test(document.getElementById('acMsg').textContent));
    assert.strictEqual(J(G.acEffectiveForRole_('student')).classes, false); assert.strictEqual(J(G.acEffectiveForRole_('teacher'))['classes.list'], false);
    assert.strictEqual(G.apsTabAllowed_('superadmin', 'meetPreview'), false);
    await p.evaluate(() => { document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'); document.activeElement && document.activeElement.blur(); });
    await p.setViewportSize({ width: 1366, height: 1500 });
    await p.screenshot({ path: __dirname + '/r75_access_superadmin.png', clip: await p.$eval('#acCard', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: Math.min(r.height, 1400) }; }) });
    assert.deepStrictEqual(S.errors, []); await p.close();
    const A = await open('admin@aps.org', 'admin'); const q = A.page;
    await q.click('#tabAdminControl'); await q.waitForFunction(() => document.querySelectorAll('#acTable tbody tr').length === 44);
    assert.strictEqual(await q.isVisible('#acSuperNote'), false);
    assert.ok(await q.$('#acTable .ac-sw[data-role="student"][data-key="classes"]'), 'r91: Admin can switch the five roles\' always-on cells');
    assert.strictEqual(await q.$('#acTable .ac-sw[data-role="admin"][data-key="classes"]'), null, 'Admin still cannot switch its own always-on cells');
    assert.strictEqual(await q.$eval('#acTable tr.ac-tab:has(td.ac-name:text-is("🏫 Classes")) td:nth-child(6) .ac-sw', b => b.getAttribute('aria-checked')), 'false', 'Admin sees Super Admin\'s setting');
    assert.deepStrictEqual(A.errors, []); await q.close();
  });
  await t('r75 roles after Super Admin switched Classes off: student sees a friendly notice, teacher opens a Classes sub-tab instead', async () => {
    const X = await open('joshua_aps3407@avvaiyarpadasalai.org', 'student'); const p = X.page;
    await p.evaluate(() => { apsApplyTabAccess_(); switchView('classes'); });
    assert.strictEqual(await p.isVisible('#tabClasses'), false);
    assert.strictEqual(await p.isVisible('#apsClassesOff'), true); assert.ok(/turned off for your role/.test(await p.textContent('#apsClassesOff')));
    assert.strictEqual(await p.isVisible('#search'), false, 'class list hidden');
    await p.screenshot({ path: __dirname + '/r75_classes_off_student.png', clip: { x: 0, y: 0, width: 1366, height: 600 } });
    assert.deepStrictEqual(X.errors, []); await p.close();
    const T = await open(TEACH, 'teacher'); const q = T.page;
    await q.evaluate(() => { apsApplyTabAccess_(); switchView('classes'); });
    assert.strictEqual(await q.isVisible('#tabClasses'), true); assert.strictEqual(await q.isVisible('#subTabClasses'), false);
    const v = await q.evaluate(() => currentView);
    assert.ok(v === 'teacherAvail' || (v === 'classes' && await q.isVisible('#apsClassesOff')), v);
    assert.deepStrictEqual(T.errors, []); await q.close();
    const S = await open('super@aps.org', 'superadmin'); const r = S.page;
    assert.strictEqual(await r.isVisible('#tabMeetPreview'), false, 'Super Admin turned GCM Preview off for Super Admin');
    await r.close();
  });
  await browser.close();
  console.log('\nALL ' + passed + ' ACCESS CONTROL UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

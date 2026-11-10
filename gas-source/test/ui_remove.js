// Browser test: r60 — Classes search (name / email / APSID, auto-filter, one row), "Google Classroom" sub-tab,
// Assign Classroom → Re-Map Student | Remove Student (node test/ui_remove.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { setup, STU, ID, D } = require('./removalfixture');
const F = setup(); const { env, tok, J, G } = F;
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
    await page.exposeFunction('__gas', async (fn, args) => { if (o.delay) await new Promise(r => setTimeout(r, o.delay)); try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); updateClassChangeTabVisibility(); apsApplyTabAccess_(); }, { data, token });
    await page.waitForTimeout(200);
    return { page, errors, data, ctx };
  }
  const clean = p => p.evaluate(() => { document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'); document.activeElement && document.activeElement.blur(); });
  const cards = p => p.$$eval('#grid .card .course-name, #grid [data-course-id] .course-name', els => els.map(e => e.textContent.trim()));
  const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  await t('Classes: sub-tab renamed to "Google Classroom"; both searches on one row with the new placeholders', async () => {
    const A = await open('hm@aps.org', 'headmaster'); const p = A.page;
    assert.strictEqual((await p.textContent('#subTabClasses')).trim(), 'Google Classroom');
    assert.strictEqual(await p.isVisible('#subTabClasses'), true);
    assert.strictEqual(await p.getAttribute('#search', 'placeholder'), 'Search class or teacher by name, email, or APSID');
    assert.strictEqual(await p.getAttribute('#studentSearch', 'placeholder'), 'Find student by name, email, or APSID');
    const [a, b] = [await p.$eval('#search', e => e.getBoundingClientRect().toJSON()), await p.$eval('#studentSearch', e => e.getBoundingClientRect().toJSON())];
    assert.ok(Math.abs(a.top - b.top) < 2 && b.left > a.right, 'same line on desktop');
    assert.strictEqual(await p.isVisible('#studentSearchBtn'), false, 'no Find Student button needed');
    await clean(p); await p.screenshot({ path: __dirname + '/r60_search_desktop.png', clip: { x: 0, y: await p.$eval('#clsSearchRow', e => e.getBoundingClientRect().top + scrollY - 70), width: 1366, height: 160 } });
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
    const M = await open('hm@aps.org', 'headmaster', { vp: { width: 390, height: 844 } }); const m = M.page;
    const [c, d] = [await m.$eval('#search', e => e.getBoundingClientRect().toJSON()), await m.$eval('#studentSearch', e => e.getBoundingClientRect().toJSON())];
    assert.ok(d.top >= c.bottom, 'stacked on mobile'); assert.ok(c.width > 300 && d.width > 300, 'full width on mobile');
    assert.ok(await noHScroll(m), 'no horizontal scroll');
    await clean(m); await m.screenshot({ path: __dirname + '/r60_search_mobile.png', clip: { x: 0, y: await m.$eval('#clsSearchRow', e => e.getBoundingClientRect().top + scrollY - 10), width: 390, height: 190 } });
    assert.deepStrictEqual(M.errors, []); await M.ctx.close();
  });

  await t('Student search auto-filters as you type — name, APS email, APSID (any case, spaces); empty state when nothing matches', async () => {
    const A = await open('admin@aps.org', 'admin'); const p = A.page;
    const total = (await cards(p)).length; assert.ok(total > 20);
    for (const q of ['APS6650', 'aps6650', ' aps 6650 ', 'sa0_aps6650@avvaiyarpadasalai.org', 'Stu A0', 'stu a0']) {
      await p.fill('#studentSearch', q);
      await p.waitForFunction(() => /student matching/.test(document.getElementById('studentSearchStatus').textContent));
      const names = await cards(p);
      assert.deepStrictEqual(names.map(n => n.split(' |')[0]).sort(), ['MUNMAZHALAI - EA', 'MUNMAZHALAI - EB'], q + ' → ' + names.join(','));
    }
    assert.ok(/2 classes with a student matching/.test(await p.textContent('#studentSearchStatus')));
    await p.fill('#studentSearch', 'zzz-nobody-999');
    await p.waitForFunction(() => /No student found/.test(document.getElementById('studentSearchStatus').textContent));
    assert.ok(/No student found matching/.test(await p.textContent('#grid')));
    assert.strictEqual(await p.isVisible('#clearStudentSearch'), true);
    await p.click('#clearStudentSearch'); await p.waitForTimeout(100);
    assert.strictEqual((await cards(p)).length, total, 'clear restores every class');
    await p.fill('#studentSearch', 'APS6650'); await p.press('#studentSearch', 'Enter');
    assert.strictEqual((await cards(p)).length, 2, 'Enter still works');
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await t('Class / teacher search also matches teacher APS email and APSID (class name + teacher name unchanged)', async () => {
    const A = await open('admin@aps.org', 'admin'); const p = A.page;
    const run = async q => { await p.fill('#search', q); await p.waitForTimeout(450); return (await cards(p)).map(n => n.split(' |')[0]); };
    assert.deepStrictEqual(await run('kavitha_aps8130@avvaiyarpadasalai.org'), ['MUNMAZHALAI - ED']);
    assert.deepStrictEqual(await run('APS8123'), ['MUNMAZHALAI - EA']);
    assert.deepStrictEqual(await run('Kavitha'), ['MUNMAZHALAI - ED']);
    assert.ok((await run('MUNMAZHALAI - E')).length >= 5, 'class name search unchanged');
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await t('Assign Classroom → Re-Map Student: sub-tabs; Assign Classroom + audit log side by side, equal width + height; APSID search; Super Admin loads (fix)', async () => {
    for (const [email, role] of [['admin@aps.org', 'admin'], ['super@aps.org', 'superadmin']]) {
      const A = await open(email, role); const p = A.page;
      await p.click('#tabAssignClassroom');
      assert.strictEqual(await p.isVisible('#subTabRemap'), true); assert.strictEqual(await p.isVisible('#subTabRemove'), true);
      assert.strictEqual(await p.getAttribute('#subTabRemap', 'aria-selected'), 'true');
      await p.waitForFunction(() => document.querySelectorAll('#assignmentStudentList .assignment-student-row').length > 10, null, { timeout: 5000 });
      assert.strictEqual(await p.getAttribute('#assignmentStudentSearch', 'placeholder'), 'Search student by name, email, or APSID');
      const L = await p.$eval('#asgRemapPane .assignment-admin-panel', e => e.getBoundingClientRect().toJSON()), R = await p.$eval('#asgRemapPane .assignment-audit-panel', e => e.getBoundingClientRect().toJSON());
      assert.ok(Math.abs(L.top - R.top) < 2 && R.left > L.right, 'side by side');
      assert.ok(Math.abs(L.width - R.width) <= 2, 'equal widths ' + L.width + '/' + R.width);
      assert.ok(Math.abs(L.height - R.height) <= 2, 'aligned heights ' + L.height + '/' + R.height);
      await p.fill('#assignmentStudentSearch', 'aps6650');
      const rows = await p.$$eval('#assignmentStudentList .assignment-student-row', r => r.map(x => x.textContent));
      assert.strictEqual(rows.length, 1); assert.ok(/APS6650/.test(rows[0]) && /MUNMAZHALAI - EA/.test(rows[0]) && /MUNMAZHALAI - EB/.test(rows[0]));
      if (role === 'admin') { await clean(p); await p.screenshot({ path: __dirname + '/r60_remap_desktop.png', fullPage: false }); }
      assert.deepStrictEqual(A.errors, []); await A.ctx.close();
    }
    const M = await open('admin@aps.org', 'admin', { vp: { width: 390, height: 844 } }); const m = M.page;
    await m.click('#tabAssignClassroom'); await m.waitForTimeout(300);
    const L = await m.$eval('#asgRemapPane .assignment-admin-panel', e => e.getBoundingClientRect().toJSON()), R = await m.$eval('#asgRemapPane .assignment-audit-panel', e => e.getBoundingClientRect().toJSON());
    assert.ok(R.top >= L.bottom, 'stacked on mobile'); assert.ok(await noHScroll(m));
    assert.deepStrictEqual(M.errors, []); await M.ctx.close();
  });

  await t('Remove Student (Admin): search → classroom choice → reason counter → summary + warning → Confirm & Remove (double-click safe) → audit log + email', async () => {
    const A = await open('admin@aps.org', 'admin', { delay: 250 }); const p = A.page;
    await p.click('#tabAssignClassroom'); await p.click('#subTabRemove'); await p.click('#adsModeRemove'); // r84: Add/Remove Student → Remove
    assert.strictEqual(await p.isVisible('#asgRemovePane'), true); assert.strictEqual(await p.isVisible('#asgRemapPane'), false);
    await p.waitForFunction(() => document.getElementById('srmForm').style.display === '');
    assert.strictEqual(await p.getAttribute('#srmSearch', 'placeholder'), 'Search student by name, email, or APSID');
    await p.fill('#srmSearch', 'zzz-nobody'); await p.waitForSelector('.srm-empty');
    await p.fill('#srmSearch', 'APS6650'); await p.waitForFunction(() => document.querySelectorAll('#srmResults .srm-row').length === 1);
    await p.click('#srmResults .srm-row');
    await p.waitForFunction(() => document.querySelectorAll('#srmClassList input[name=srmCourse]').length === 2);
    assert.ok(/in 2 classes/.test(await p.textContent('#srmClassLabel')));
    assert.strictEqual(await p.isVisible('#srmReasonBlock'), false, 'reason after the classroom is picked');
    await p.check(`#srmClassList input[value="${ID.EA}"]`);
    assert.strictEqual(await p.getAttribute('#srmReason', 'placeholder'), 'Enter the reason for removing this student from the selected Google Classroom.');
    await p.fill('#srmReason', 'only four words here');
    assert.strictEqual((await p.textContent('#srmWordCount')).trim(), '4 / 200 words');
    assert.strictEqual(await p.$eval('#srmConfirmBtn', b => b.disabled), true, '4 words → disabled');
    assert.ok(/at least 5 words/.test(await p.textContent('#srmReasonHint')));
    await p.fill('#srmReason', Array.from({ length: 201 }, (_, i) => 'w' + i).join(' '));
    assert.strictEqual((await p.textContent('#srmWordCount')).trim(), '201 / 200 words'); assert.strictEqual(await p.$eval('#srmConfirmBtn', b => b.disabled), true, '201 → disabled');
    await p.fill('#srmReason', 'Parent requested withdrawal from this class for the term.');
    assert.strictEqual((await p.textContent('#srmWordCount')).trim(), '9 / 200 words');
    const sum = await p.textContent('#srmSummary');
    ['Stu A0', 'APS6650', STU, 'MUNMAZHALAI - EA', 'Ayana Nivedida Parthiban', 'will lose access to this Google Classroom', 'Confirm Remove', 'Remove Student from Google Classroom?'].forEach(x => assert.ok(sum.includes(x), x));
    await clean(p); await p.setViewportSize({ width: 1366, height: 2000 });
    await p.screenshot({ path: __dirname + '/r60_remove_confirm.png', clip: await p.$eval('#asgRemovePane', e => { const r = e.getBoundingClientRect(); return { x: 0, y: r.y + scrollY - 60, width: 1366, height: Math.min(r.height + 70, 1900) }; }) });
    const before = F.rm.removed;
    await p.$eval('#srmConfirmBtn', b => { b.click(); b.click(); b.click(); }); // rapid triple click
    await p.waitForFunction(() => document.getElementById('srmResultMsg').style.display === '' && /removed|NOT|already/.test(document.getElementById('srmResultMsg').textContent), null, { timeout: 8000 });
    assert.strictEqual(F.rm.removed - before, 1, 'one removal');
    assert.ok(/was removed from MUNMAZHALAI - EA .*\(verified\)/.test(await p.textContent('#srmResultMsg')));
    assert.ok(!F.find(ID.EA, STU) && F.find(ID.EB, STU));
    await p.waitForFunction(() => /Stu A0/.test(document.getElementById('srmAuditBody').textContent));
    const aud = await p.textContent('#srmAuditBody'); ['REMOVED', 'VERIFIED', 'EMAIL SENT', 'Parent requested withdrawal', 'admin@aps.org'].forEach(x => assert.ok(aud.includes(x), x));
    assert.strictEqual(env.stats.mails.filter(m => /Student Removed from Google Classroom – Stu A0/.test(m.subject)).length, 1);
    // the search now only offers EB for this student
    await p.fill('#srmSearch', 'APS6650'); await p.waitForFunction(() => document.querySelectorAll('#srmResults .srm-row').length === 1);
    assert.ok(!/MUNMAZHALAI - EA/.test(await p.textContent('#srmResults')));
    assert.strictEqual(await p.isVisible('#srmSummary'), false, 'form reset after success');
    await clean(p); await p.screenshot({ path: __dirname + '/r60_remove_done.png', clip: await p.$eval('#asgRemovePane', e => { const r = e.getBoundingClientRect(); return { x: 0, y: r.y + scrollY - 60, width: 1366, height: Math.min(r.height + 70, 1900) }; }) });
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await t('Remove Student: email failure shows "Retry email"; retry sends without removing again', async () => {
    env.ctx.MailApp.sendEmail = () => {}; const tokSave = env.props.ATTENDANCE_REFRESH_TOKEN; env.props.ATTENDANCE_REFRESH_TOKEN = '';
    const A = await open('admin@aps.org', 'admin'); const p = A.page;
    await p.click('#tabAssignClassroom'); await p.click('#subTabRemove'); await p.click('#adsModeRemove');
    await p.waitForFunction(() => document.getElementById('srmForm').style.display === '');
    await p.fill('#srmSearch', 'sb0_aps'); await p.waitForFunction(() => document.querySelectorAll('#srmResults .srm-row').length >= 1);
    await p.click('#srmResults .srm-row');
    await p.waitForFunction(() => document.querySelectorAll('#srmClassList input[name=srmCourse]').length >= 1);
    await p.fill('#srmReason', 'Student moved to another school this month.');
    const before = F.rm.removed;
    await p.click('#srmConfirmBtn');
    await p.waitForFunction(() => /notification email was not sent/.test(document.getElementById('srmResultMsg').textContent), null, { timeout: 8000 });
    await p.waitForSelector('[data-srm-retry]');
    env.props.ATTENDANCE_REFRESH_TOKEN = tokSave || 'att-refresh';
    await p.click('[data-srm-retry]');
    await p.waitForFunction(() => !document.querySelector('[data-srm-retry]'), null, { timeout: 8000 });
    assert.strictEqual(F.rm.removed - before, 1, 'removed once only');
    assert.ok((await p.textContent('#srmAuditBody')).includes('EMAIL SENT'));
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await t('Remove Student: mobile layout (no horizontal scroll); BOD read-only (audit only, no form, no retry); teacher / HM have no tab', async () => {
    const M = await open('admin@aps.org', 'admin', { vp: { width: 390, height: 844 } }); const m = M.page;
    await m.click('#tabAssignClassroom'); await m.click('#subTabRemove'); await m.click('#adsModeRemove');
    await m.waitForFunction(() => document.getElementById('srmForm').style.display === '');
    await m.fill('#srmSearch', 'APS6650'); await m.waitForFunction(() => document.querySelectorAll('#srmResults .srm-row').length === 1);
    await m.click('#srmResults .srm-row'); await m.waitForFunction(() => document.querySelectorAll('#srmClassList input[name=srmCourse]').length >= 1);
    await m.check('#srmClassList input[name=srmCourse]');
    await m.fill('#srmReason', 'Testing the mobile layout of the removal form.');
    assert.ok(await noHScroll(m), 'no horizontal scroll on mobile');
    const btn = await m.$eval('#srmConfirmBtn', e => e.getBoundingClientRect().toJSON()); assert.ok(btn.right <= 390 && btn.height >= 30);
    await clean(m); await m.screenshot({ path: __dirname + '/r60_remove_mobile.png', fullPage: true });
    assert.deepStrictEqual(M.errors, []); await M.ctx.close();

    const B = await open('bod@aps.org', 'vcfo_amchsts_bod'); const b = B.page;
    await b.click('#tabAssignClassroom'); await b.click('#subTabRemove'); await b.click('#adsModeRemove');
    await b.waitForFunction(() => document.getElementById('srmReadOnlyBanner').style.display === '');
    assert.strictEqual(await b.isVisible('#srmForm'), false); assert.strictEqual(await b.isVisible('#srmSearch'), false);
    await b.waitForFunction(() => /REMOVED/.test(document.getElementById('srmAuditBody').textContent));
    assert.strictEqual(await b.$$eval('[data-srm-retry]', x => x.length), 0);
    assert.deepStrictEqual(B.errors, []); await B.ctx.close();

    for (const [email, role] of [['kavitha_aps8130' + D, 'teacher'], ['hm@aps.org', 'headmaster']]) {
      const T = await open(email, role); assert.strictEqual(await T.page.isVisible('#tabAssignClassroom'), false, role);
      assert.deepStrictEqual(T.errors, []); await T.ctx.close();
    }
  });

  await browser.close();
  console.log(passed + ' passed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

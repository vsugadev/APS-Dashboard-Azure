// Browser test: r85 — 📚 Assignment Monitoring tab, home card, filters, class student list, Admin Control (node test/ui_assignmon.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { setup, J, D } = require('./amfixture');
const F = setup(); const { env, G } = F;
(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  const calls = [];
  async function open(token, o) {
    o = o || {};
    const ctx = await browser.newContext({ viewport: o.vp || { width: 1366, height: 1000 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route(/^https:\/\/(?!aps\.test\/).*/, r => r.abort());
    await page.exposeFunction('__gas', async (fn, args) => { calls.push(fn); try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); updateClassChangeTabVisibility(); apsApplyTabAccess_(); updateMeetPreviewTabVisibility(); }, { data, token });
    await page.waitForTimeout(250);
    return { page, errors, ctx };
  }
  const clean = p => p.evaluate(() => { document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'); document.activeElement && document.activeElement.blur(); });
  const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  await t('Admin: home card → tab; Overview KPIs + escalation; Student Issues keep Missing and Submitted-not-graded apart; filters + search are local (no server call)', async () => {
    const A = await open(F.admin); const p = A.page;
    await p.waitForFunction(() => document.getElementById('amHomeCard').style.display === '');
    const card = await p.textContent('#amHomeCard'); ['Assignment Health', 'Completed', 'Awaiting Grading', 'Missing', 'Require Attention', 'Submission Rate', 'Grading Completion'].forEach(x => assert.ok(card.includes(x), x));
    assert.strictEqual(await p.isVisible('#tabAssignMon'), true);
    await p.click('#amHomeOpen');
    await p.waitForFunction(() => /Classes On Track/.test(document.getElementById('amBody').textContent));
    const ov = await p.textContent('#amBody'); ['Classes Need Attention', 'Classes Require Action', 'Student submission rate', 'Teacher grading completion', 'Level 4 – Admin', 'NILAI 3 - EF'].forEach(x => assert.ok(ov.includes(x), x));
    assert.strictEqual(await p.isVisible('[data-am-tab="admin"]'), true);
    await clean(p); await p.screenshot({ path: __dirname + '/r85_overview.png', fullPage: false });
    await p.click('[data-am-tab="students"]');
    const rows = await p.$$eval('#amBody tbody tr, #amBody table tr', trs => trs.map(r => r.textContent));
    assert.ok(rows.some(r => /Raja/.test(r) && /QUZ_LSN_1/.test(r) && /Missing/.test(r) && /L4 Admin/.test(r)));
    assert.ok(rows.some(r => /Joshua Kumar/.test(r) && /HW_LSN_2/.test(r) && /Submitted, not graded/.test(r) && !/Missing/.test(r)), 'ungraded is never shown as missing');
    const before = calls.length;
    await p.selectOption('#amfStatus', 'MISSING'); await p.waitForTimeout(80);
    assert.ok(!/Submitted, not graded/.test(await p.textContent('#amBody table')));
    await p.selectOption('#amfStatus', ''); await p.fill('#amfQ', 'APS1234'); await p.waitForTimeout(400);
    const txt = await p.textContent('#amBody table'); assert.ok(/Raja/.test(txt) && !/Joshua/.test(txt), 'search by APSID');
    await p.selectOption('#amfType', 'QUIZ'); await p.waitForTimeout(80); assert.ok(/QUZ_LSN_1/.test(await p.textContent('#amBody table')) && !/HW_LSN_2/.test(await p.textContent('#amBody table')));
    assert.strictEqual(calls.length, before, 'filters and search make no server call');
    await clean(p); await p.screenshot({ path: __dirname + '/r85_student_issues.png' });
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await t('Class Monitoring: cards with 🟢/🟡/🔴 per assignment; clicking one opens the student list (ATT / HW / QUIZ × students, Overall); How to Grade shows the steps', async () => {
    const A = await open(F.admin); const p = A.page;
    await p.click('#tabAssignMon'); await p.waitForFunction(() => /Classes On Track/.test(document.getElementById('amBody').textContent));
    await p.click('[data-am-tab="classes"]');
    await p.selectOption('#amfClass', F.ids.N3EF);
    const c = await p.textContent('#amBody'); assert.ok(/🔴 Requires action/.test(c) && /🟢 ATT_LSN_1 — Complete/.test(c) && /HW_LSN_2 — 1 Missing \/ 1 Ungraded/.test(c), c.slice(0, 400));
    await clean(p); await p.screenshot({ path: __dirname + '/r85_classes.png' });
    await p.click('[data-am-work="W4"]');
    await p.waitForFunction(() => document.getElementById('amModal').classList.contains('open') && /Overall/.test(document.getElementById('amModalBody').textContent));
    const m = await p.textContent('#amModalBody'); ['HW_LSN_2', 'Raja', 'Missing', 'Submitted, not graded', 'Action Required', 'Exclude'].forEach(x => assert.ok(m.includes(x), x));
    await p.click('#amModalBody [data-am-class]');
    await p.waitForFunction(() => /ATT_LSN_1/.test(document.getElementById('amModalBody').textContent) && /QUZ_LSN_1/.test(document.getElementById('amModalBody').textContent));
    await clean(p); await p.screenshot({ path: __dirname + '/r85_student_list.png' });
    await p.keyboard.press('Escape'); assert.strictEqual(await p.evaluate(() => document.getElementById('amModal').classList.contains('open')), false);
    await p.click('#amGradeHelpBtn');
    const steps = await p.$$eval('#amModalBody .am-steps li', l => l.map(x => x.textContent));
    assert.strictEqual(steps.length, 8); assert.ok(/Return/.test(steps[7]));
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await t('Admin Control: ON/OFF + email switches (confirmation), exclude a student with a reason from Student Issues, audit log; phone layout', async () => {
    const A = await open(F.admin); const p = A.page;
    await p.click('#tabAssignMon'); await p.waitForFunction(() => /Classes On Track/.test(document.getElementById('amBody').textContent));
    await p.click('[data-am-tab="admin"]'); await p.waitForSelector('#amCfgEnabled');
    assert.strictEqual(await p.isChecked('#amCfgEnabled'), true); assert.strictEqual(await p.isChecked('#amCfgStudent'), false, 'emails start OFF');
    assert.ok(/Reading Log/.test(await p.textContent('#amBody')), 'unclassified coursework listed');
    await clean(p); await p.screenshot({ path: __dirname + '/r85_admin_control.png', fullPage: true });
    await p.check('#amCfgStudent'); await p.click('[data-am-act="saveCfg"]');
    await p.waitForFunction(() => document.getElementById('screenConfirmOverlay').classList.contains('open'));
    assert.ok(/Turn on emails/.test(await p.textContent('#screenConfirmTitle')));
    await p.click('#screenConfirmOkBtn');
    await p.waitForTimeout(500);
    assert.strictEqual(J(G.getAssignmentMonitoringAdmin(F.admin)).config.studentEmails, true);
    assert.strictEqual(G.ScriptApp.getProjectTriggers().filter(x => x.getHandlerFunction() === 'amScheduler').length, 1);
    await p.click('[data-am-tab="students"]'); await p.fill('#amfQ', 'APS1234'); await p.waitForTimeout(350);
    await p.click('#amBody [data-am-act="exStudent"]');
    await p.waitForSelector('#amAskText'); await p.fill('#amAskText', 'Approved absence'); await p.click('#amAskOk');
    await p.waitForFunction(() => /excluded/i.test(document.getElementById('toast').textContent));
    assert.ok(F.sheet('AM_Audit_Log').slice(1).some(r => r[3] === 'EXCLUDE_STUDENT' && r[10] === 'Approved absence'));
    await p.click('[data-am-tab="admin"]'); await p.waitForFunction(() => /EXCLUDE_STUDENT/.test(document.getElementById('amBody').textContent));
    // turn OFF → confirmation
    await p.uncheck('#amCfgEnabled'); assert.strictEqual((await p.textContent('#amCfgEnabledTxt')).trim(), 'OFF');
    await p.click('[data-am-act="saveCfg"]'); await p.waitForFunction(() => /Turn monitoring off/.test(document.getElementById('screenConfirmTitle').textContent));
    await p.click('#screenConfirmCancelBtn');
    assert.strictEqual(J(G.getAssignmentMonitoringAdmin(F.admin)).config.enabled, true, 'cancel keeps it ON');
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
    const M = await open(F.admin, { vp: { width: 390, height: 844 } }); const m = M.page;
    await m.click('#tabAssignMon'); await m.waitForFunction(() => /Classes On Track/.test(document.getElementById('amBody').textContent));
    assert.ok(await noHScroll(m), 'overview: no horizontal page scroll');
    await m.click('[data-am-tab="classes"]'); assert.ok(await noHScroll(m), 'classes: no horizontal page scroll');
    await clean(m); await m.screenshot({ path: __dirname + '/r85_mobile.png', fullPage: false });
    assert.deepStrictEqual(M.errors, []); await M.ctx.close();
  });

  await t('Roles: class VP sees only their class (no Admin Control); HM sees all; Teacher and Student hidden by default (no tab, no home card)', async () => {
    const V = await open(F.vp); const v = V.page;
    assert.strictEqual(await v.isVisible('#tabAssignMon'), true);
    await v.click('#tabAssignMon'); await v.waitForFunction(() => /Classes On Track/.test(document.getElementById('amBody').textContent));
    assert.strictEqual(await v.isVisible('[data-am-tab="admin"]'), false);
    await v.click('[data-am-tab="classes"]'); const cards = await v.$$eval('#amBody .am-card h4', h => h.map(x => x.textContent));
    assert.deepStrictEqual(cards, ['NILAI 3 - EF']);
    assert.deepStrictEqual(V.errors, []); await V.ctx.close();
    for (const tk of [F.teacherB, F.student]) {
      const X = await open(tk); assert.strictEqual(await X.page.isVisible('#tabAssignMon'), false); assert.strictEqual(await X.page.isVisible('#amHomeCard'), false);
      assert.deepStrictEqual(X.errors, []); await X.ctx.close();
    }
    const H = await open(F.hm); assert.strictEqual(await H.page.isVisible('#tabAssignMon'), true); await H.ctx.close();
  });

  await t('r88: Admin Control → sliding ON / OFF switch "Send weekly reminder to teachers for ATT_ and QUZ_ assignments" (confirm, saves at once, schedule on / off)', async () => {
    const A = await open(F.admin); const p = A.page;
    await p.click('#tabAssignMon'); await p.waitForFunction(() => /Classes On Track/.test(document.getElementById('amBody').textContent));
    await p.click('[data-am-tab="admin"]'); await p.waitForSelector('#mcToggle', { state: 'attached' });
    assert.ok(/Send weekly reminder to teachers for ATT_ and QUZ_ assignments/.test(await p.textContent('#amMcCard')));
    assert.strictEqual(await p.isChecked('#mcToggle'), false); assert.strictEqual((await p.textContent('#mcToggleState')).trim(), 'OFF');
    assert.strictEqual(await p.getAttribute('#mcToggle', 'role'), 'switch'); assert.strictEqual(await p.inputValue('#mcDays'), '7');
    await p.click('#amMcCard .am-toggle');
    await p.waitForFunction(() => document.getElementById('screenConfirmOverlay').classList.contains('open'));
    assert.ok(/Turn reminder on/.test(await p.textContent('#screenConfirmTitle')));
    await p.click('#screenConfirmCancelBtn'); assert.strictEqual(await p.isChecked('#mcToggle'), false, 'cancel keeps it OFF');
    await p.click('#amMcCard .am-toggle'); await p.waitForFunction(() => document.getElementById('screenConfirmOverlay').classList.contains('open')); await p.click('#screenConfirmOkBtn');
    await p.waitForFunction(() => /ON/.test(document.getElementById('mcToggleState').textContent) && /Schedule: ON/.test(document.getElementById('mcStatusLine').textContent));
    assert.strictEqual(G.mcConfig_().enabled, true); assert.strictEqual(G.ScriptApp.getProjectTriggers().filter(x => x.getHandlerFunction() === 'apsAttQuzMarkCompleteDaily').length, 1);
    await clean(p); await (await p.$('#amMcCard')).screenshot({ path: __dirname + '/r88_toggle.png' });
    await p.click('#amMcCard .am-toggle'); await p.waitForFunction(() => /Turn reminder off/.test(document.getElementById('screenConfirmTitle').textContent)); await p.click('#screenConfirmOkBtn');
    await p.waitForFunction(() => /OFF/.test(document.getElementById('mcToggleState').textContent));
    assert.strictEqual(G.mcConfig_().enabled, false); assert.strictEqual(G.ScriptApp.getProjectTriggers().filter(x => x.getHandlerFunction() === 'apsAttQuzMarkCompleteDaily').length, 0);
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await browser.close();
  console.log('ALL ' + passed + ' ASSIGNMENT MONITORING UI TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

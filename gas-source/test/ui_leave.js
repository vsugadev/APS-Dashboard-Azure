// Browser test: r94 — 📨 Apply Leave tab (node test/ui_leave.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { prep, ID, J } = require('./ttfixture');
const F = prep(); const { G } = F;
const AY = 'ayana_aps8123@avvaiyarpadasalai.org';
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


  await t('Student: tab visible; defaults (today); reason required; end follows start; submit → success + history (Excused – 70%)', async () => {
    const S = await open(F.tk.student); const p = S.page;
    assert.strictEqual(await p.isVisible('#tabApplyLeave'), true);
    await p.click('#tabApplyLeave'); await p.waitForFunction(() => lv.data);
    const today = await p.evaluate(() => lv.data.today);
    assert.strictEqual(await p.inputValue('#lvStart'), today); assert.strictEqual(await p.inputValue('#lvEnd'), today);
    assert.ok(/Excused – 70%/.test(await p.textContent('#lvNote')));
    assert.ok((await p.textContent('label[for="lvReason"]')).includes('required'));
    const n0 = calls.length;
    await p.click('#lvSubmit'); assert.strictEqual(await p.textContent('#lvErr'), 'Please enter a reason for your leave request.');
    assert.strictEqual(calls.length, n0, 'blank reason never reaches the server');
    const later = await p.evaluate(t => { const d = new Date(t + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 3); return d.toISOString().slice(0, 10); }, today);
    await p.fill('#lvStart', later); await p.dispatchEvent('#lvStart', 'change');
    assert.strictEqual(await p.inputValue('#lvEnd'), later, 'end date follows a later start');
    await p.fill('#lvReason', '  Family vacation to India  ');
    await p.screenshot({ path: __dirname + '/r94_leave_form_student.png' });
    await p.click('#lvSubmit'); await p.waitForFunction(() => /submitted successfully/.test(document.getElementById('lvMsg').textContent));
    await p.waitForFunction(() => /Family vacation to India/.test(document.getElementById('lvMine').textContent));
    const hist = await p.textContent('#lvMine'); ['Family vacation to India', 'Approved', 'Excused – 70%'].forEach(x => assert.ok(hist.includes(x), x));
    assert.strictEqual(await p.inputValue('#lvReason'), '', 'form cleared');
    assert.strictEqual(await p.isVisible('#lvAdminCard'), false);
    await p.screenshot({ path: __dirname + '/r94_leave_history_student.png' });
    assert.deepStrictEqual(S.errors, []); await S.ctx.close();
  });
  await t('Teacher: coverage reminder + affected classes; overlap refused with the friendly message', async () => {
    const T = await open(F.tok(AY, 'teacher')); const p = T.page;
    await p.click('#tabApplyLeave'); await p.waitForFunction(() => lv.data);
    const note = await p.textContent('#lvNote'); assert.ok(/arrange class coverage in advance/.test(note) && /MUNMAZHALAI - EA/.test(note), note);
    await p.fill('#lvReason', 'Personal family function out of state');
    await p.click('#lvSubmit'); await p.waitForFunction(() => /submitted successfully/.test(document.getElementById('lvMsg').textContent));
    await p.fill('#lvReason', 'Second request on the same day');
    await p.click('#lvSubmit'); await p.waitForFunction(() => document.getElementById('lvErr').style.display !== 'none');
    assert.ok((await p.textContent('#lvErr')).startsWith('A leave request already exists for this date range.'));
    assert.strictEqual(await p.textContent('#lvMine tr:first-child td:last-child'), 'Not applicable (staff leave)');
    assert.deepStrictEqual(T.errors, []); await T.ctx.close();
  });
  await t('Admin: All Leave Requests with notification + attendance override status, filters (no server call), Resend email for a failed one', async () => {
    const real = G.apsGmailSend_; G.apsGmailSend_ = () => ({ ok: false, error: 'quota' });
    G.submitLeaveRequest(F.tk.sen, { startDate: G.ttmToday_(new Date()), endDate: G.ttmToday_(new Date()), reason: 'Doctor visit in the evening', requestId: 'UIFAIL01' });
    G.apsGmailSend_ = real;
    const A = await open(F.tk.admin); const p = A.page;
    await p.click('#tabApplyLeave'); await p.waitForFunction(() => lv.data && lv.data.isAdmin);
    assert.strictEqual(await p.isVisible('#lvAdminCard'), true);
    const all = await p.textContent('#lvAll'); ['Stu A0', 'AUTO_AT_CAPTURE', 'SENT', 'FAILED', 'Doctor visit'].forEach(x => assert.ok(all.includes(x), x));
    const n0 = calls.length;
    await p.selectOption('#lvANotif', 'FAILED'); assert.ok(!(await p.textContent('#lvAll')).includes('Stu A0'));
    await p.selectOption('#lvANotif', ''); await p.selectOption('#lvARole', 'student'); assert.ok(!(await p.textContent('#lvAll')).includes('Doctor visit'));
    await p.selectOption('#lvARole', ''); assert.strictEqual(calls.length, n0, 'filters are local');
    await p.screenshot({ path: __dirname + '/r94_leave_admin.png', fullPage: true });
    await p.click('[data-lv-retry]'); await p.waitForFunction(() => !document.querySelector('[data-lv-retry]'));
    assert.strictEqual(G.lvRows_().find(l => l.Request_ID === 'UIFAIL01').Notification_Status, 'SENT');
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });
  await t('Phone width: form fits, no side scroll; Access Control off hides the tab', async () => {
    const S = await open(F.tk.student, { vp: { width: 390, height: 860 } }); const p = S.page;
    await p.click('#tabApplyLeave'); await p.waitForFunction(() => lv.data);
    assert.strictEqual(await noHScroll(p), true); await p.screenshot({ path: __dirname + '/r94_leave_phone.png' }); await S.ctx.close();
    G.saveAccessControl(F.tok('admin@aps.org', 'admin'), [{ role: 'student', key: 'applyLeave', visible: false }]);
    const X = await open(F.tk.student); assert.strictEqual(await X.page.isVisible('#tabApplyLeave'), false); await X.ctx.close();
    G.saveAccessControl(F.tok('admin@aps.org', 'admin'), [{ role: 'student', key: 'applyLeave', visible: true }]);
  });

  await browser.close();
  console.log('ALL ' + passed + ' APPLY LEAVE UI TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

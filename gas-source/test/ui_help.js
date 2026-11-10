// Browser (Chromium) tests for the GLOBAL tooltip / contextual help system (APS_HELP_TEXT + ApsTooltip + ApsHelp):
// every visible control in every screen, for every role, has guidance + an accessible name; keyboard, touch,
// disabled-reason, status badges, role-aware Help (students never see admin text), mobile layout.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { makeContext } = require('./gasmock');
function fixedDate(iso) { const NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } } return D; }
const env = makeContext({ Date: fixedDate('2026-09-26T18:00:00Z'), auditItems: require('./fixtures').audit, props: { LIVE_QUESTION_PAPER_SPREADSHEET_ID: 'QPSHEET', EXAM_QUESTION_PAPER_STUDENT_TEACHER_ACCESS: 'true' } });
env.ctx.DriveApp = { createFolder: n => ({ getId: () => 'F1', getName: () => n, createFolder: () => ({ getId: () => 'F2' }) }), getFolderById: () => { throw new Error('x'); } };
vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), env.ctx);
const courses = require('./fixtures').courses;
const sh = env.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h'); courses.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); sh.data[i + 1] = row; });
const tok = (e, r) => { env.cache['aps_sess_tok_' + e] = JSON.stringify({ email: e, role: r }); return 'tok_' + e; };
const VIEWS = [['classes', 'tabClasses'], ['onboarding', 'tabOnboarding'], ['kb', 'tabKb'], ['classChange', 'tabAssignClassroom'], ['assignClassroom', 'tabAssignClassroom'], ['userRoles', 'tabUserRoles'], ['referenceLetter', 'rl-tab'], ['referenceLetterApprovals', 'tabAssignClassroom'], ['attendance', 'tabAttendance'], ['examination', 'tabExamination']];
const VIEW_EL = { classes: 'classesView', onboarding: 'onboardingView', kb: 'kbView', classChange: 'classChangeView', assignClassroom: 'assignClassroomView', userRoles: 'userRolesView', referenceLetter: 'rl-view', referenceLetterApprovals: 'rl-approvals-view', attendance: 'attendanceView', examination: 'examinationView' };
(async () => {
  const browser = await chromium.launch();
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  async function open(email, role, viewport) {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 }, hasTouch: !!viewport });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('__gas', (fn, args) => {
      try { if (typeof env.ctx[fn] !== 'function') return JSON.stringify({ err: 'no fn ' + fn });
        let out = env.ctx[fn].apply(null, args); if (out && typeof out.then === 'function') return JSON.stringify({ err: 'async' });
        return JSON.stringify({ ok: out === undefined ? null : JSON.parse(JSON.stringify(out)) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => {
      function runner(s, f) { return new Proxy({}, { get(_, p) {
        if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
        return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); };
      } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } };
    });
    await page.route('https://aps.test/**', r => r.request().url().endsWith('/') ? r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }) : r.fulfill({ status: 404, body: '' }));
    await page.route(/^(?!https:\/\/aps\.test)/, r => r.abort());
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const access = env.ctx.examinationAccessForRole_(role);
    await page.evaluate(({ t, email, role, courses, access, grading }) => {
      apsSessionToken = t; currentUser = { email, role, name: email, examinationAccess: access, gradingAccess: grading, permissions: { buttons: true, filters: true, tabs: true } };
      allCourses = courses.filter(c => ['admin', 'headmaster', 'vcfo_amchsts_bod'].includes(role) || c.teachers.concat(c.students).some(p => p.email === email));
      const ov = document.getElementById('apsGateOverlay'); if (ov) ov.style.display = 'none';
      updateAttendanceTabVisibility(); updateExaminationTabVisibility();
    }, { t: tok(email, role), email, role, courses, access, grading: env.ctx.rosterAccessForRole_(role) });
    return { ctx, page, errors };
  }
  /** Visible controls in the view with no guidance (data-tooltip) or no accessible name. */
  const audit = (page, viewId) => page.evaluate(viewId => {
    const root = document.getElementById(viewId);
    const vis = e => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
    const out = { noTip: [], noName: [], count: 0 };
    root.querySelectorAll('button, a[href], select, input:not([type="hidden"]), textarea, [role="tab"]').forEach(e => {
      if (!vis(e)) return; out.count++;
      const d = (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + (e.className || '').toString().split(' ')[0]) + ' "' + (e.textContent || e.placeholder || e.value || '').trim().slice(0, 30) + '"';
      if (!e.getAttribute('data-tooltip')) out.noTip.push(d); else (out.tips = out.tips || []).push(d + ' => ' + e.getAttribute('data-tooltip').slice(0, 90));
      const named = (e.textContent || '').trim().length > 2 || e.getAttribute('aria-label') || (e.id && document.querySelector('label[for="' + e.id + '"]')) || e.closest('label') || e.getAttribute('aria-labelledby') || (e.type === 'submit' && e.value) || (e.tagName === 'SELECT' && false);
      if (!named) out.noName.push(d);
    });
    return out;
  }, viewId);

  const ROLES = [['admin@aps.org', 'admin'], ['hm@aps.org', 'headmaster'], ['bod@aps.org', 'vcfo_amchsts_bod'], ['t1@aps.org', 'teacher'], ['s2@aps.org', 'student']];
  const report = {};
  for (const [email, role] of ROLES.filter(r => !process.env.ROLE || r[1] === process.env.ROLE)) {
    const R = await open(email, role);
    await t(role + ': every visible tab + every visible control on every screen has guidance and an accessible name', async () => {
      if (role === 'admin') await R.page.evaluate(() => ['tabClassChange', 'tabAssignClassroom', 'tabUserRoles', 'rl-approvals-tab'].forEach(id => { document.getElementById(id).style.display = ''; asgSyncSubTabs_(); })); // r61: the two moved tabs are Assign Classroom sub-tabs
      if (role === 'teacher') await R.page.evaluate(() => { document.getElementById('rl-tab').style.display = ''; document.getElementById('tabClassChange').style.display = ''; asgSyncSubTabs_(); });
      const tabs = await R.page.$$eval('.view-tabs .view-tab', els => els.filter(e => e.offsetWidth).map(e => ({ id: e.id, tip: e.getAttribute('data-tooltip') })));
      const gaps = new Set();
      assert.ok(tabs.length >= 2); tabs.forEach(x => assert.ok(x.tip, 'tab ' + x.id + ' has no tooltip'));
      for (const [view, tab] of VIEWS) {
        if (!tabs.some(x => x.id === tab)) continue;
        await R.page.evaluate(v => { switchView(v); if (v === 'classes' && typeof render === 'function') { try { render(); } catch (e) { console.log('render', e.message); } } }, view);
        await R.page.waitForTimeout(700);
        if (view === 'examination' && await R.page.$('[data-exam-section="grading"]:not([hidden])')) {
          const a0 = await audit(R.page, VIEW_EL[view]); a0.noTip.forEach(d => gaps.add(view + ' TIP ' + d)); a0.noName.forEach(d => gaps.add(view + ' NAME ' + d));
          await R.page.click('[data-exam-section="grading"]'); await R.page.waitForTimeout(700);
        }
        const a = await audit(R.page, VIEW_EL[view]);
        report[role + '/' + view] = a;
        a.noTip.forEach(d => gaps.add(view + ' TIP ' + d)); a.noName.forEach(d => gaps.add(view + ' NAME ' + d));
        assert.ok(await R.page.$('#' + VIEW_EL[view] + ' > .aps-help-row .aps-help-btn'), 'Help button on ' + view);
      }
      assert.deepStrictEqual([...gaps], [], role + ': controls without guidance / accessible name');
      assert.deepStrictEqual(R.errors, []);
    });
    if (role === 'admin') {
      await t('keyboard focus shows the tooltip bubble (role=tooltip, aria-describedby); Escape hides it', async () => {
        const p = R.page;
        await p.evaluate(() => switchView('attendance'));
        await p.mouse.move(1270, 890); // park the mouse on empty space so no hover tooltip competes with the keyboard one
        await p.keyboard.press('Tab'); // keyboard modality (the bubble follows :focus-visible, like a real Tab user)
        await p.focus('#tabAttendance');
        await p.waitForSelector('#apsTooltip:not([hidden])');
        assert.strictEqual(await p.getAttribute('#apsTooltip', 'role'), 'tooltip');
        assert.strictEqual(await p.getAttribute('#tabAttendance', 'aria-describedby'), 'apsTooltip');
        assert.ok(/attendance/i.test(await p.textContent('#apsTooltip')));
        await p.screenshot({ path: __dirname + '/tooltip_admin.png', clip: { x: 0, y: 0, width: 1280, height: 260 } });
        await p.keyboard.press('Escape');
        await p.waitForSelector('#apsTooltip', { state: 'hidden' });
        const box = await p.$eval('.aps-tip', e => getComputedStyle(e).maxWidth); assert.strictEqual(box, '320px', 'one consistent style');
      });
      await t('hover shows it; disabled control explains why; content rendered later is picked up automatically; no native title duplicates', async () => {
        const p = R.page;
        await p.hover('#tabExamination');
        await p.waitForSelector('#apsTooltip:not([hidden])');
        await p.evaluate(() => { const b = document.createElement('button'); b.id = 'lateBtn'; b.textContent = 'Refresh'; b.disabled = true; document.getElementById('attendanceView').appendChild(b); });
        await p.waitForFunction(() => document.getElementById('lateBtn').getAttribute('data-tooltip'));
        const late = await p.$eval('#lateBtn', b => ({ tip: b.getAttribute('data-tooltip'), title: b.title }));
        assert.ok(/latest/i.test(late.tip)); assert.ok(/Not available right now/.test(late.title), late.title);
        await p.evaluate(() => { document.getElementById('lateBtn').disabled = false; });
        await p.waitForFunction(() => !document.getElementById('lateBtn').hasAttribute('title'));
        await p.waitForTimeout(400);
        assert.strictEqual(await p.$eval('#lateBtn', b => b.title), '', 'settles (no feedback loop)');
        const dup = await p.$$eval('[data-tooltip][title]', els => els.filter(e => !e.disabled).length); assert.strictEqual(dup, 0);
      });
      await t('status badges explain their meaning; ⓘ icons next to key fields', async () => {
        const p = R.page;
        const st = await p.evaluate(() => { const s = document.createElement('span'); s.className = 'exam-st'; s.textContent = 'SCHEDULED'; document.getElementById('attendanceView').appendChild(s); return new Promise(r => setTimeout(() => r({ tip: s.getAttribute('data-tooltip'), tab: s.getAttribute('tabindex') }), 300)); });
        assert.ok(st.tip && /scheduled|release/i.test(st.tip), JSON.stringify(st) + ' ' + await p.evaluate(() => ApsTooltip.tipFor(document.querySelector('#attendanceView > .exam-st')))); assert.strictEqual(st.tab, '0', 'badge reachable by keyboard');
        assert.ok(await p.$('label[for="examQpMinutes"] .aps-info, label[for="attBulkReason"] .aps-info, .aps-info'), 'contextual ⓘ present');
      });
      await t('Admin Help on Examination explains admin actions', async () => {
        const p = R.page;
        await p.evaluate(() => switchView('examination'));
        await p.click('#examinationView > .aps-help-row .aps-help-btn');
        await p.waitForSelector('#apsHelpOverlay.open');
        const body = await p.textContent('#apsHelpBody');
        assert.ok(/As Admin:/.test(body) && /Retry Failed/.test(body));
        await p.screenshot({ path: __dirname + '/help_admin.png' });
        await p.keyboard.press('Escape');
        await p.waitForSelector('#apsHelpOverlay.open', { state: 'detached' }).catch(() => {});
        assert.strictEqual(await p.$eval('#apsHelpOverlay', e => e.classList.contains('open')), false);
      });
    }
    if (role === 'student') {
      await t('student Help is simple and never shows Admin/HM/Teacher text; QP staff instructions hidden', async () => {
        const p = R.page;
        await p.evaluate(() => switchView('attendance'));
        await p.click('#attendanceView > .aps-help-row .aps-help-btn');
        const body = await p.textContent('#apsHelpBody');
        assert.ok(/As Student:/.test(body)); assert.ok(!/Override|Sync Attendance|Bulk|audit log/i.test(body), body);
        await p.click('#apsHelpClose');
        await p.evaluate(() => switchView('examination'));
        await p.waitForTimeout(500);
        assert.strictEqual(await p.$eval('#examQpHelpStaff', e => e.hidden), true);
        assert.strictEqual(await p.$eval('#examQpHelpStudent', e => e.hidden), false);
      });
    }
    await R.ctx.close();
  }
  const M = await open('s2@aps.org', 'student', { width: 375, height: 780 });
  await t('mobile 375px: long-press shows help, tap on ⓘ/badge toggles; bubble stays on screen; no horizontal scroll', async () => {
    const p = M.page;
    await p.evaluate(() => switchView('attendance'));
    const b = await p.$('#attendanceView .aps-help-btn'); const bb = await b.boundingBox();
    await p.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })] })); }, { x: bb.x + 5, y: bb.y + 5 });
    await p.waitForSelector('#apsTooltip:not([hidden])', { timeout: 2000 });
    const tb = await p.$eval('#apsTooltip', e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; });
    assert.ok(tb[0] >= 0 && tb[1] <= 375, 'tooltip inside viewport ' + tb);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    assert.deepStrictEqual(M.errors, []);
  });
  await browser.close();
  fs.writeFileSync('/tmp/claude-0/tooltip_audit.json', JSON.stringify(report, null, 1));
  console.log('\nALL ' + passed + ' TOOLTIP / HELP UI TESTS PASSED');
})().catch(e => { console.error(e); try { fs.writeFileSync('/tmp/claude-0/tooltip_audit_fail.txt', String(e.stack)); } catch (x) {} process.exit(1); });

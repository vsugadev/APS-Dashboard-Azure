// Browser test: r109 — "APS VIRTUAL SCHOOL IS ON LEAVE" banner (node test/ui_schoolleave.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch();
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  async function open(vp, leave, role) {
    const page = await browser.newPage({ viewport: vp }); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route(/^https:\/\/(?!aps\.test\/).*/, r => r.abort());
    await page.addInitScript(() => { const run = new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler' || p === 'withFailureHandler' || p === 'withUserObject') return () => run; return () => {}; } }); window.google = { script: { run, history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    await page.evaluate(({ leave, role }) => { currentUser = { role, email: 'x@aps.org', name: 'Viewer', courses: [], schoolLeave: leave }; document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); }, { leave, role });
    return { page, errors };
  }
  const L = { isSchoolLeave: true, leaveTitle: 'APS Virtual School Holiday', startDate: '2026-11-06', endDate: '2026-11-08', periodEndDate: '2026-11-08', reason: 'APS Virtual School Holiday <b>x</b>', leaveType: 'School Holiday' };
  for (const role of ['admin', 'teacher', 'student']) {
    const { page, errors } = await open({ width: 1366, height: 800 }, L, role);
    const txt = await page.textContent('#apsSchoolLeaveBanner');
    ['APS VIRTUAL SCHOOL IS ON LEAVE', 'Leave Period: Fri, November 6, 2026 – Sun, November 8, 2026', 'Reason: APS Virtual School Holiday <b>x</b>', 'Regular weekly activities are temporarily suspended.'].forEach(x => assert.ok(txt.includes(x), role + ': ' + x + ' | ' + txt));
    assert.strictEqual(await page.$('#apsSchoolLeaveBanner b b'), null, 'reason is escaped (no HTML injection)');
    assert.ok(await page.isVisible('#apsSchoolLeaveBanner'));
    if (role === 'admin') await page.screenshot({ path: __dirname + '/r109_school_leave_banner.png', clip: { x: 0, y: 0, width: 1366, height: 260 } });
    assert.deepStrictEqual(errors, []); await page.close();
  }
  const off = await open({ width: 1366, height: 800 }, { isSchoolLeave: false }, 'admin'); assert.ok(!(await off.page.isVisible('#apsSchoolLeaveBanner')), 'no leave → hidden'); await off.page.close();
  const ph = await open({ width: 390, height: 800 }, L, 'student');
  assert.ok(await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone: no side scroll');
  const box = await ph.page.$eval('#apsSchoolLeaveBanner', e => e.getBoundingClientRect().right); assert.ok(box <= 390, 'banner fits the phone');
  await ph.page.close();
  console.log('PASS banner shows for Admin / Teacher / Student with period + reason (escaped); hidden when no leave; fits a phone; no JS errors');
  await browser.close(); console.log('1/1 passed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

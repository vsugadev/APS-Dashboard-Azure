// Browser test: r110 — Admin Control → 🏖️ School Leave Management end to end against the real server code (node test/ui_schoolleave_admin.js)
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { makeContext, Sheet } = require('./gasmock'); const { courses } = require('./fixtures');
Sheet.prototype.getMaxRows = function () { return 5000; };
function clock(iso) { let NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } static set(i) { NOW = new Date(i).getTime(); } } return D; }
const D = clock('2026-11-04T15:00:00Z');
const env = makeContext({ Date: D, props: { APS_ENVIRONMENT: 'LIVE' } }); vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), env.ctx, { filename: 'Code.gs' });
const G = env.ctx, J = x => JSON.parse(JSON.stringify(x));
const cs = env.wb.insertSheet('Courses'); cs.data[0] = new Array(18).fill('h'); courses.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); cs.data[i + 1] = row; });
const tok = (email, role) => { const k = 'tok_' + role; env.cache['aps_sess_' + k] = JSON.stringify({ email, role }); return k; };
const mails = []; G.apsGmailSend_ = (p, m) => { mails.push({ p, m: J(m) }); return { ok: true }; };
(async () => {
  const browser = await chromium.launch();
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  async function open(token, vp) {
    const page = await browser.newPage({ viewport: vp || { width: 1366, height: 1000 } }); const errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
    await page.route(/^https:\/\/(?!aps\.test\/).*/, r => r.abort());
    await page.exposeFunction('__gas', async (fn, args) => { try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses; document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); apsApplyTabAccess_(); }, { data, token });
    return { page, errors };
  }
  const A = tok('info@avvaiyarpadasalai.org', 'admin');
  const { page: p, errors } = await open(A);
  await p.evaluate(() => switchView('schoolLeave'));
  await p.waitForSelector('#slBody'); await p.waitForFunction(() => /No school leave recorded yet/.test(document.getElementById('slBody').textContent));
  assert.ok(await p.isVisible('#subTabSchoolLeave'), 'Admin sees the sub-tab');
  // Add as Draft
  await p.click('#slAddBtn'); await p.fill('#slTitle', 'APS Virtual School Holiday'); await p.fill('#slStart', '2026-11-06'); await p.fill('#slEnd', '2026-11-08');
  await p.dispatchEvent('#slEnd', 'change'); assert.ok(/3 days/.test(await p.textContent('#slDaysNote')));
  await p.fill('#slReason', 'APS Virtual School Holiday'); await p.click('#slSaveBtn');
  await p.waitForFunction(() => /DRAFT/.test(document.getElementById('slBody').textContent));
  assert.strictEqual(G.isAPSSchoolHoliday('2026-11-07'), false);
  // Approve + send
  await p.click('[data-sl-act="approve"]'); await p.waitForSelector('#slApproveSend'); await p.check('#slApproveSend'); await p.click('#slConfirmYes');
  await p.waitForFunction(() => /UPCOMING/.test(document.getElementById('slBody').textContent));
  assert.ok(/Approved/.test(await p.textContent('#slMsg')) && /4 sent/.test(await p.textContent('#slMsg')), await p.textContent('#slMsg'));
  assert.strictEqual(mails.length, 4); assert.strictEqual(G.isAPSSchoolHoliday('2026-11-07'), true);
  await p.screenshot({ path: __dirname + '/r110_school_leave_admin.png', fullPage: false });
  // Edit approved dates → confirmation, nothing saved until Confirm
  await p.click('[data-sl-act="edit"]'); await p.fill('#slEnd', '2026-11-09'); await p.click('#slSaveBtn');
  await p.waitForSelector('#slConfirm #slConfirmYes'); assert.ok(/changed end/.test(await p.textContent('#slConfirm')));
  assert.strictEqual(G.isAPSSchoolHoliday('2026-11-09'), false, 'not saved before Confirm');
  await p.click('#slConfirmYes'); await p.waitForFunction(() => /Saved/.test(document.getElementById('slMsg').textContent));
  assert.strictEqual(G.isAPSSchoolHoliday('2026-11-09'), true);
  assert.ok(/UPDATE_PENDING/.test(await p.textContent('#slBody')), 'notification status shows an update is pending');
  // History
  await p.click('[data-sl-act="view"]'); await p.waitForFunction(() => /Notification history/.test(document.getElementById('slHistory').textContent));
  const hist = await p.textContent('#slHistory'); assert.ok(/allparents2026_2027@avvaiyarpadasalai.org/.test(hist) && /APPROVED/.test(hist) && /EDITED/.test(hist));
  assert.deepStrictEqual(errors, []); await p.close();
  // Banner on an active leave day + phone width
  D.set('2026-11-07T15:00:00Z'); G.SL_MEMO_.list = null;
  const ph = await open(A, { width: 390, height: 800 }); await ph.page.evaluate(() => switchView('schoolLeave'));
  await ph.page.waitForFunction(() => /ACTIVE/.test(document.getElementById('slBody').textContent));
  assert.ok(await ph.page.isVisible('#apsSchoolLeaveBanner'));
  assert.ok(await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone: no side scroll');
  assert.deepStrictEqual(ph.errors, []); await ph.page.close();
  // Teacher: no sub-tab, server refuses, holiday-week availability shows the notice instead of the buttons
  D.set('2026-11-04T15:00:00Z'); G.SL_MEMO_.list = null;
  const T = tok((courses[0].teachers[0] || {}).email, 'teacher');
  const tp = await open(T); 
  assert.ok(!(await tp.page.isVisible('#subTabSchoolLeave')), 'teacher: sub-tab hidden');
  assert.throws(() => G.getSchoolLeaveAdminData(T), /Only an Admin|ACCESS_OFF/);
  await tp.page.evaluate(() => { loadWeeklyPanel(); }); await tp.page.waitForTimeout(500);
  const note = await tp.page.$('[data-avail-leave]');
  assert.ok(note, 'holiday-week notice replaces the availability buttons'); assert.ok(/School holiday this week/.test(await note.textContent()));
  assert.strictEqual(await tp.page.$('[data-course-id="' + courses[0].id + '"] [data-avail-yes]'), null, 'no response buttons for the holiday class');
  assert.deepStrictEqual(tp.errors, []); await tp.page.close();
  console.log('PASS Admin: add Draft → Approve + send (4 lists) → edit dates needs Confirm → history; banner on leave day; phone fits; Teacher: no access; no JS errors');
  await browser.close(); console.log('1/1 passed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

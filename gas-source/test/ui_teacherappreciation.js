// Browser test: r114 / r115 — 👩‍🏫 Volunteer/Teacher Management → Weekly Teacher Appreciation against the real server code (node test/ui_teacherappreciation.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const F = require('./teacherappreciation'); const { G, env, tok, J, WK, tA, tB } = F;
const mails = []; G.apsGmailSend_ = (p, m) => { mails.push({ p, m: J(m) }); return { ok: true }; };
const R115 = typeof G.taDeliver_ === 'function';
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
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses; document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); apsApplyTabAccess_(); updateMeetPreviewTabVisibility && updateMeetPreviewTabVisibility(); }, { data, token });
    return { page, errors };
  }
  const A = tok('info@avvaiyarpadasalai.org', 'admin');
  const { page: p, errors } = await open(A);
  assert.ok(await p.isVisible('#tabTeacherMgmt'), 'Admin sees 👩‍🏫 Volunteer/Teacher Management');
  await p.click('#tabTeacherMgmt');
  await p.waitForFunction(() => /not been scored yet|Exceptional/.test(document.getElementById('taOverview').textContent));
  // Preview (in memory) → then Run now (saves)
  await p.click('#taPreviewBtn');
  await p.waitForFunction(() => /PREVIEW|Preview of/.test(document.getElementById('taMsg').textContent) && document.querySelectorAll('#taRank tbody tr').length === 7);
  assert.strictEqual((await p.textContent('#taRank tbody tr:first-child')).includes('Anbu Teacher'), true, 'highest score first');
  await p.click('#taRunBtn'); await p.waitForSelector('#examQpModalOverlay.open');
  await p.click('#examQpModalButtons .gtr-btn.primary');
  await p.waitForFunction(() => /teachers scored/.test(document.getElementById('taMsg').textContent));
  await p.waitForFunction(() => document.querySelectorAll('#taReports tbody tr').length >= 1 && document.querySelectorAll('#taRank tbody tr').length === 7);
  const ov = await p.textContent('#taOverview');
  assert.ok(/Exceptional/.test(ov) && /Support check-in suggested/.test(ov) && /Insufficient data/.test(ov), ov.slice(0, 300));
  assert.ok(/graded before the student turned in/.test(ov), 'graded-before-turn-in flag shown');
  // filters auto-refresh (no server call)
  await p.selectOption('#tafBand', 'INSUFFICIENT_DATA');
  assert.strictEqual(await p.$$eval('#taRank tbody tr', r => r.length), 5);
  await p.selectOption('#tafBand', '');
  await p.fill('#tafSearch', 'bala'); await p.waitForFunction(() => document.querySelectorAll('#taRank tbody tr').length === 1);
  await p.fill('#tafSearch', '');
  await p.waitForFunction(() => document.querySelectorAll('#taRank tbody tr').length === 7);
  // drill-down: history + calculation
  await p.click('[data-ta-teacher="' + tB.email + '"]'); await p.waitForSelector('#examQpModalOverlay.open');
  const det = await p.textContent('#examQpModalBody');
  assert.ok(/How the score/.test(det) && /\+8 min/.test(det) && /weights|Score|70/.test(det), det.slice(0, 400));
  await p.screenshot({ path: __dirname + '/r114_teacher_history.png' });
  await p.click('#examQpModalButtons .gtr-btn');
  // outstanding card
  assert.ok(/Anbu Teacher/.test(await p.textContent('#taTop')) && /Started every class on time/.test(await p.textContent('#taTop')));
  // settings: weights must add to 100; preview with draft settings changes the score; save
  await p.click('#taSecConfig summary');
  await p.fill('#tac_w_completion', '30'); await p.dispatchEvent('#tac_w_completion', 'input');
  assert.ok(/total 105/.test(await p.textContent('#taWsum')));
  await p.click('#taCfgPreviewBtn'); await p.waitForFunction(() => /add up to 100/.test(document.getElementById('taMsg').textContent));
  await p.fill('#tac_w_completion', '25'); await p.fill('#tac_appreciateMin', '80');
  await p.click('#taCfgSaveBtn'); await p.waitForFunction(() => /Version <b>1|Version 1/.test(document.getElementById('taConfig').innerHTML) || /Version\s*1/.test(document.getElementById('taConfig').textContent));
  assert.strictEqual(G.taConfig_().appreciateMin, 80);
  G.saveTeacherAppreciationConfig(A, J(G.TA_DEFAULTS_));
  await p.click('#taRefreshBtn'); await p.waitForFunction(() => /Version\s*2/.test(document.getElementById('taConfig').textContent));
  await p.evaluate(() => { document.getElementById('taSecConfig').open = false; window.scrollTo(0, 0); });
  await p.screenshot({ path: __dirname + '/r114_teacher_appreciation.png', fullPage: true });
  if (R115) {
    // emails OFF (default): preview mode — the admin got the [PREVIEW] report, no teacher email
    assert.ok(mails.some(m => /^\[PREVIEW\] APS – Weekly Teacher Appreciation Report/.test(m.m.subject)), 'admin preview report');
    assert.ok(!mails.some(m => m.m.to.includes(tA.email)), 'no teacher email while OFF');
    // the email preview
    await p.click('[data-ta-email="' + tA.email + '"]'); await p.waitForSelector('#examQpModalOverlay.open');
    const mail = await p.textContent('#examQpModalBody');
    assert.ok(/அன்புள்ள/.test(mail) && /இந்த வாரத்தின் சிறப்புகள்/.test(mail) && !/100|Exceptional|rank/i.test(mail), mail.slice(0, 300));
    await p.screenshot({ path: __dirname + '/r115_tamil_email_preview.png' });
    await p.click('#examQpModalButtons .gtr-btn');
    // switch ON (confirmation) → Run now → teacher email sent once
    await p.click('#taEmailsSwitch'); await p.waitForSelector('#examQpModalOverlay.open'); await p.click('#examQpModalButtons .gtr-btn.primary');
    await p.waitForFunction(() => /are ON/.test(document.getElementById('taStatus').textContent));
    await p.click('#taRunBtn'); await p.waitForSelector('#examQpModalOverlay.open'); await p.click('#examQpModalButtons .gtr-btn.primary');
    await p.waitForFunction(() => /email\(s\) sent/.test(document.getElementById('taMsg').textContent));
    assert.strictEqual(mails.filter(m => m.m.to.includes(tA.email)).length, 1, 'one email to the eligible teacher');
    await p.click('#taSecEmails summary');
    await p.waitForFunction(() => /SENT/.test(document.getElementById('taEmails').textContent));
    await p.click('#taSecReports summary'); await p.click('[data-ta-report="' + WK + '"] >> nth=0'); await p.waitForSelector('#examQpModalOverlay.open');
    assert.ok(/Weekly Teacher Appreciation/.test(await p.textContent('#examQpModalBody')));
    await p.screenshot({ path: __dirname + '/r115_admin_report.png' });
    await p.click('#examQpModalButtons .gtr-btn');
    G.setTeacherAppreciationEmails(A, false);
  } else {
    assert.ok(!(await p.isVisible('#taEmailsSwitch')), 'r114: no email switch yet');
  }
  assert.deepStrictEqual(errors, []);
  await p.close();
  // BOD: read-only (no Run / Preview / Save)
  const B = tok('bod_aps1@avvaiyarpadasalai.org', 'vcfo_amchsts_bod');
  const b = await open(B);
  assert.ok(await b.page.isVisible('#tabTeacherMgmt'));
  await b.page.click('#tabTeacherMgmt'); await b.page.waitForFunction(() => document.querySelectorAll('#taRank tbody tr').length === 7);
  assert.ok(!(await b.page.isVisible('#taRunBtn')) && !(await b.page.isVisible('#taPreviewBtn')));
  await b.page.click('#taSecConfig summary'); assert.ok(!(await b.page.$('#taCfgSaveBtn')) && /Read-only/.test(await b.page.textContent('#taConfig')));
  assert.deepStrictEqual(b.errors, []); await b.page.close();
  // Teacher: no tab
  const T = tok(tA.email, 'teacher'); const te = await open(T);
  assert.ok(!(await te.page.isVisible('#tabTeacherMgmt')), 'teacher: hidden');
  await te.page.evaluate(() => switchView('teacherMgmt')); assert.strictEqual(await te.page.evaluate(() => currentView), 'classes');
  await te.page.close();
  // phone width
  const ph = await open(A, { width: 390, height: 800 });
  await ph.page.click('#tabTeacherMgmt'); await ph.page.waitForFunction(() => document.querySelectorAll('#taRank tbody tr').length === 7);
  const overflow = await ph.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 2, 'no horizontal page scroll on a phone: ' + overflow);
  await ph.page.screenshot({ path: __dirname + '/r114_teacher_appreciation_phone.png' });
  assert.deepStrictEqual(ph.errors, []); await ph.page.close();
  await browser.close();
  console.log('PASS Volunteer/Teacher Management: preview, run, overview, filters, drill-down, settings' + (R115 ? ', Tamil email preview, emails ON → one email, admin report' : '') + ', BOD read-only, teacher hidden, phone');
  console.log('1/1 passed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

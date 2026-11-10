// Browser test: r84 — Assign Classroom → Add/Remove Student → Add Student; Google Review popup + header button (node test/ui_addstudent.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { setup, NEW, STU, ID, D } = require('./addfixture');
const F = setup({ props: { SPECIAL_CLASS_COURSE_IDS: ID.EF_SAT } }); const { env, tok, G } = F;
const J = x => JSON.parse(JSON.stringify(x));
(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  async function open(email, role, o) {
    o = o || {};
    const ctx = await browser.newContext({ viewport: o.vp || { width: 1366, height: 1000 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route(/^https:\/\/(?!aps\.test\/).*/, r => r.abort());
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
  const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const shot = (p, file) => p.screenshot({ path: __dirname + '/' + file, clip: undefined, fullPage: false });
  const openAdd = async p => { await p.click('#tabAssignClassroom'); await p.click('#subTabRemove'); await p.waitForFunction(() => document.getElementById('adsForm').style.display === ''); };

  await t('sub-tab renamed "Add/Remove Student"; Add Student is the default; Remove Student still one click away', async () => {
    const A = await open('admin@aps.org', 'admin'); const p = A.page;
    assert.ok(/Add\/Remove Student/.test(await p.textContent('#subTabRemove')));
    await openAdd(p);
    assert.strictEqual(await p.isVisible('#adsWrap'), true); assert.strictEqual(await p.isVisible('#srmWrap'), false);
    await p.click('#adsModeRemove'); assert.strictEqual(await p.isVisible('#srmWrap'), true); assert.strictEqual(await p.isVisible('#adsWrap'), false);
    await p.click('#adsModeAdd'); assert.strictEqual(await p.isVisible('#adsWrap'), true);
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await t('validation + not found messages; look-up lists memberships with types; same classroom → "Student Already Enrolled" and no button', async () => {
    const A = await open('admin@aps.org', 'admin'); const p = A.page; await openAdd(p);
    await p.fill('#adsEmail', 'kid@gmail.com'); await p.click('#adsLookupBtn');
    await p.waitForFunction(() => /valid APS email/.test(document.getElementById('adsLookupMsg').textContent));
    await p.fill('#adsEmail', 'ghost_aps9999' + D); await p.press('#adsEmail', 'Enter');
    await p.waitForFunction(() => /Student not found\. Please verify the APS email address\./.test(document.getElementById('adsLookupMsg').textContent));
    await p.fill('#adsEmail', '  SA0_APS6650' + D.toUpperCase() + ' '); await p.click('#adsLookupBtn');
    await p.waitForFunction(() => document.getElementById('adsStudentBlock').style.display === '');
    const mem = await p.textContent('#adsMemberships');
    ['Stu A0', 'APS6650', 'MUNMAZHALAI - EA', 'MUNMAZHALAI - EB', 'Regular Academic'].forEach(x => assert.ok(mem.includes(x), x));
    await p.check(`#adsClassList input[value="${ID.EA}"]`);
    await p.waitForFunction(() => /Student Already Enrolled/.test(document.getElementById('adsRule').textContent));
    assert.ok(/No changes were made\./.test(await p.textContent('#adsRule')));
    assert.strictEqual(await p.isVisible('#adsReviewBtn'), false);
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await t('Regular + Regular: strong warning + acknowledgement → "Override & Add" (double-click safe) → one add, audit, email; nothing removed', async () => {
    const A = await open('admin@aps.org', 'admin', { delay: 250 }); const p = A.page; await openAdd(p);
    await p.fill('#adsEmail', STU); await p.click('#adsLookupBtn');
    await p.waitForFunction(() => document.getElementById('adsStudentBlock').style.display === '');
    await p.fill('#adsClassFilter', ID.EC); await p.waitForFunction(id => document.querySelectorAll('#adsClassList input[name=adsCourse]').length === 1, ID.EC);
    await p.check(`#adsClassList input[value="${ID.EC}"]`);
    await p.waitForSelector('.ads-warn-strong');
    assert.ok(/more than one Regular Academic Classroom/.test(await p.textContent('.ads-warn-strong')));
    assert.strictEqual(await p.$eval('#adsReviewBtn', b => b.disabled), true, 'blocked until the tick');
    await p.check('#adsAck'); assert.strictEqual(await p.$eval('#adsReviewBtn', b => b.disabled), false);
    await p.click('#adsReviewBtn');
    const sum = await p.textContent('#adsSummary');
    ['Add Student to Google Classroom?', 'Existing Google Classrooms', 'MUNMAZHALAI - EA', 'MUNMAZHALAI - EB', 'New Google Classroom', 'MUNMAZHALAI - EC', 'will be in 3 Google Classrooms', 'No classroom will be removed', 'Admin override', 'Override & Add', 'Cancel'].forEach(x => assert.ok(sum.includes(x), x));
    await clean(p); await p.setViewportSize({ width: 1366, height: 2200 });
    await p.screenshot({ path: __dirname + '/r84_add_confirm.png', clip: await p.$eval('#asgRemovePane', e => { const r = e.getBoundingClientRect(); return { x: 0, y: r.y + scrollY - 60, width: 1366, height: Math.min(r.height + 70, 2100) }; }) });
    const before = F.ad.created;
    await p.$eval('#adsConfirmBtn', b => { b.click(); b.click(); b.click(); });
    await p.waitForFunction(() => /Adding student\.\.\./.test(document.getElementById('adsSummary').textContent));
    await p.waitForFunction(() => /was added to MUNMAZHALAI - EC/.test(document.getElementById('adsResultMsg').textContent), null, { timeout: 8000 });
    assert.strictEqual(F.ad.created - before, 1, 'one add'); assert.strictEqual(F.rm.removed, 0, 'nothing removed');
    assert.ok(F.find(ID.EA, STU) && F.find(ID.EB, STU) && F.find(ID.EC, STU));
    await p.waitForFunction(() => /ADMIN_OVERRIDE/.test(document.getElementById('adsAuditBody').textContent));
    const aud = await p.textContent('#adsAuditBody'); ['ADD STUDENT TO MULTIPLE CLASSROOMS', 'SUCCESS', 'EMAIL SENT', 'Stu A0'].forEach(x => assert.ok(aud.includes(x), x));
    assert.strictEqual(env.stats.mails.filter(m => m.subject === 'APS Dashboard – Student Added to Google Classroom – Stu A0').length, 1);
    // audit filters
    await p.selectOption('#adsAuditStatus', 'CANCELLED'); assert.ok(/No audit rows match/.test(await p.textContent('#adsAuditBody')));
    await p.selectOption('#adsAuditStatus', ''); await p.selectOption('#adsAuditAction', 'ADD_STUDENT_TO_MULTIPLE_CLASSROOMS'); assert.ok(/Stu A0/.test(await p.textContent('#adsAuditBody')));
    await clean(p); await p.screenshot({ path: __dirname + '/r84_add_done.png', clip: await p.$eval('#asgRemovePane', e => { const r = e.getBoundingClientRect(); return { x: 0, y: r.y + scrollY - 60, width: 1366, height: Math.min(r.height + 70, 2100) }; }) });
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await t('new student + Special Class: no tick needed; Cancel records CANCELLED; mobile layout has no horizontal scroll; BOD read-only', async () => {
    const M = await open('admin@aps.org', 'admin', { vp: { width: 390, height: 844 } }); const m = M.page; await openAdd(m);
    await m.fill('#adsEmail', NEW); await m.click('#adsLookupBtn');
    await m.waitForFunction(() => document.getElementById('adsStudentBlock').style.display === '');
    assert.ok(/not in any active Google Classroom yet/.test(await m.textContent('#adsMemberships')));
    await m.check(`#adsClassList input[value="${ID.EF_SAT}"]`);
    assert.ok(/will be added to MUNMAZHALAI - EF/.test(await m.textContent('#adsRule')));
    await m.click('#adsReviewBtn'); assert.ok((await m.textContent('#adsConfirmBtn')).trim() === 'Add Student');
    assert.ok(await noHScroll(m), 'no horizontal scroll on mobile');
    await clean(m); await m.screenshot({ path: __dirname + '/r84_add_mobile.png', fullPage: true });
    await m.click('#adsCancelBtn');
    await m.waitForFunction(() => /Cancelled — no changes were made/.test(document.getElementById('adsResultMsg').textContent));
    await m.waitForFunction(() => /CANCELLED/.test(document.getElementById('adsAuditBody').textContent));
    assert.strictEqual(F.find(ID.EF_SAT, NEW), undefined);
    await m.click('#adsReviewBtn'); await m.click('#adsConfirmBtn');
    await m.waitForFunction(() => /New Kid was added/.test(document.getElementById('adsResultMsg').textContent), null, { timeout: 8000 });
    assert.ok(F.find(ID.EF_SAT, NEW));
    assert.deepStrictEqual(M.errors, []); await M.ctx.close();
    const B = await open('bod@aps.org', 'vcfo_amchsts_bod'); const b = B.page;
    await b.click('#tabAssignClassroom'); await b.click('#subTabRemove');
    await b.waitForFunction(() => document.getElementById('adsReadOnlyBanner').style.display === '');
    assert.strictEqual(await b.isVisible('#adsForm'), false); assert.ok(/New Kid/.test(await b.textContent('#adsAuditBody')));
    assert.deepStrictEqual(B.errors, []); await B.ctx.close();
  });

  await t('Google Review (student): popup after sign-in, once per month; Write opens the review link in a new tab; Maybe Later / ✕ / Esc close it; header button always there; non-students see neither', async () => {
    const S = await open(STU, 'student'); const p = S.page;
    await p.evaluate(() => checkStudentLoginNotices());
    // the two login notices come first (until 2026-11-15); accept them if shown
    for (let i = 0; i < 2; i++) {
      const notice = await p.evaluate(() => document.getElementById('studentNoticeOverlay').style.display === 'flex');
      if (!notice) break;
      await p.check('#studentNoticeAcceptCheck'); await p.click('#studentNoticeAcceptBtn'); await p.waitForTimeout(150);
    }
    await p.waitForSelector('#grOverlay.open');
    assert.strictEqual(await p.textContent('#grMsg'), 'Avvaiyar Padasalai America would love your feedback. Post a review.');
    assert.strictEqual(await p.getAttribute('#grWrite', 'href'), 'https://g.page/r/CUwNOLbnb2InEAE/review');
    assert.strictEqual(await p.getAttribute('#grWrite', 'target'), '_blank'); assert.ok(/noopener/.test(await p.getAttribute('#grWrite', 'rel')));
    assert.strictEqual(await p.getAttribute('#grOverlay', 'role'), 'dialog'); assert.strictEqual(await p.getAttribute('#grClose', 'aria-label'), 'Close');
    assert.strictEqual(await p.evaluate(() => document.activeElement.id), 'grWrite', 'focus moves into the dialog');
    assert.strictEqual(await p.isVisible('#googleReviewBtn'), true); assert.strictEqual(await p.getAttribute('#googleReviewBtn', 'href'), 'https://g.page/r/CUwNOLbnb2InEAE/review');
    await clean(p); await p.screenshot({ path: __dirname + '/r84_review_popup.png' });
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.getElementById('grOverlay').classList.contains('open'));
    await p.waitForTimeout(200);
    const ev = () => env.wb.getSheetByName('Google_Review_Events').getDataRange().getValues().slice(1).map(r => r[5] + '/' + r[7]);
    assert.deepStrictEqual(ev(), ['GOOGLE_REVIEW_PROMPT_SHOWN/Monthly popup', 'GOOGLE_REVIEW_DISMISSED/Monthly popup']);
    // second check in the same month → no popup
    await p.evaluate(() => { grShownThisPage = false; checkStudentLoginNotices(); }); await p.waitForTimeout(300);
    assert.strictEqual(await p.evaluate(() => document.getElementById('grOverlay').classList.contains('open')), false);
    // header button click is tracked (navigation to the external page is aborted in this test)
    await p.$eval('#googleReviewBtn', a => a.click()); await p.waitForTimeout(200);
    assert.ok(ev().includes('GOOGLE_REVIEW_CLICKED/Header button'));
    assert.deepStrictEqual(S.errors, []); await S.ctx.close();
    // mobile + Write button + new month
    env.userProps['GOOGLE_REVIEW_PROMPT_' + STU] = '2000-01'; // r103: the monthly flag lives in the second store
    const M = await open(STU, 'student', { vp: { width: 360, height: 740 } }); const m = M.page;
    env.props['STUDENT_NOTICE_ACCEPTED_' + STU + '_about'] = 'accepted';
    await m.evaluate(() => { studentNoticeStatus = null; grMaybeShow_(); checkStudentLoginNotices(); });
    await m.waitForSelector('#grOverlay.open');
    assert.ok(await noHScroll(m)); const box = await m.$eval('.gr-modal', e => e.getBoundingClientRect().toJSON()); assert.ok(box.right <= 360 && box.left >= 0);
    await clean(m); await m.screenshot({ path: __dirname + '/r84_review_mobile.png' });
    await m.click('#grLater');
    assert.deepStrictEqual(M.errors, []); await M.ctx.close();
    const A = await open('admin@aps.org', 'admin'); const a = A.page;
    assert.strictEqual(await a.isVisible('#googleReviewBtn'), false); assert.strictEqual(await a.isVisible('#grOverlay'), false);
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await browser.close();
  console.log('ALL ' + passed + ' ADD STUDENT / GOOGLE REVIEW UI TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

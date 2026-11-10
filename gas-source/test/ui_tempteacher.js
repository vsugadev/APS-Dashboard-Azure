// Browser test: r89 — Classes → 👩‍🏫 Temp Teacher sub-tab + class-card "On-Call Teacher Assigned" note (node test/ui_tempteacher.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { prep, addDays, TODAY, ID, J, TCS } = require('./ttfixture');
const F = prep(); const { G } = F;
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

  await t('Admin: sub-tab → form (classroom + teacher search, dates, live word counter, effective period) → Assign → Active row, summary card, emails', async () => {
    const A = await open(F.tk.admin); const p = A.page;
    assert.strictEqual(await p.isVisible('#subTabTempTeacher'), true);
    await p.click('#subTabTempTeacher'); await p.waitForFunction(() => /No temporary teacher assignments yet/.test(document.getElementById('ttmBody').textContent));
    await p.click('#ttmNew'); await p.fill('#ttmClassQ', 'EA'); await p.waitForTimeout(250);
    await p.selectOption('#ttmClass', ID.EA);
    const ci = await p.textContent('#ttmClassInfo'); ['Course ID ' + ID.EA, 'Primary Teacher: Ayana Nivedida Parthiban', 'Students: 14'].forEach(x => assert.ok(ci.includes(x), x));
    // r97: TCS_ONCALL_TEACHER_LIST group on top (sheet order), then Primary Teachers; VP / HM not offered
    const groups = await p.$$eval('#ttmTeacher optgroup', g => g.map(x => [x.label, [...x.querySelectorAll('option')].map(o => o.value)]));
    assert.ok(/^TCS On-Call Teachers \(2\)$/.test(groups[0][0]) && /^Primary Teachers/.test(groups[1][0]), JSON.stringify(groups.map(g => g[0])));
    assert.deepStrictEqual(groups[0][1], [TCS, 'tcs_supritha_aps8093@avvaiyarpadasalai.org']);
    assert.ok(!groups[1][1].includes('priya_aps702@avvaiyarpadasalai.org') && !groups[1][1].includes('ayana_aps8123@avvaiyarpadasalai.org'), 'no VP; the selected class Primary Teacher is left out');
    await p.screenshot({ path: __dirname + '/r97_tt_teacher_list.png' });
    await p.fill('#ttmTeacherQ', 'APS9001'); await p.waitForTimeout(250);
    const opts = await p.$$eval('#ttmTeacher option', o => o.map(x => x.textContent)); assert.ok(opts.length === 1 && /tcs_aps9001/.test(opts[0]) && /On-Call/.test(opts[0]), opts.join('|'));
    await p.selectOption('#ttmTeacher', TCS);
    assert.ok(/APS9001/.test(await p.textContent('#ttmTeacherInfo')));
    await p.fill('#ttmRemoval', addDays(TODAY, 4)); await p.dispatchEvent('#ttmRemoval', 'change');
        assert.ok(/Effective period: .*\(5 days\).*removed automatically/.test(await p.textContent('#ttmPeriod')));
    await p.fill('#ttmReason', 'Teacher away'); assert.strictEqual(await p.textContent('#ttmWords'), '2'); assert.ok(await p.$eval('#ttmWords', e => e.classList.contains('bad')));
    await p.click('#ttmSubmit'); assert.strictEqual(await p.textContent('#ttmErr'), 'Please provide at least 5 words explaining why this class requires a temporary teacher.');
    await p.fill('#ttmReason', 'Primary teacher is travelling for a family event this week.');
    await clean(p); await p.screenshot({ path: __dirname + '/r89_tt_form.png' });
    await p.click('#ttmSubmit'); await p.waitForFunction(() => /was added to/.test(document.getElementById('ttmMsg').textContent));
    const row = await p.textContent('#ttmBody'); ['MUNMAZHALAI - EA', 'Ayana Nivedida Parthiban', 'Tamil Cover Sakthi', 'APS9001', 'Active', 'Remove Temp Teacher Now'].forEach(x => assert.ok(row.includes(x), x));
    assert.ok(/1\s*Active Temp Teachers/.test(await p.textContent('#ttmSummary')));
    assert.strictEqual(F.mails(/Temporary Teacher Added/).length, 1);
    await clean(p); await p.screenshot({ path: __dirname + '/r89_tt_list.png' });
    // detail modal + Remove Now confirmation wording
    await p.click('[data-ttm-view]'); await p.waitForSelector('#ttmModal.open');
    assert.ok(/Assignment ID.*TT-/.test(await p.textContent('#ttmModalBody')));
    await clean(p); await p.screenshot({ path: __dirname + '/r89_tt_detail.png' });
    await p.click('[data-ttm-m="remove"]'); await p.waitForSelector('#screenConfirmOverlay.open');
    assert.strictEqual(await p.textContent('#screenConfirmMessage'), 'Are you sure you want to remove this temporary teacher from the Google Classroom now?');
    await p.click('#screenConfirmCancelBtn'); assert.strictEqual(F.api.remove.length, 0, 'cancel = nothing removed');
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await t('Class cards: every role (student too) sees "On-Call Teacher Assigned" with name + APSID; upcoming shown in advance', async () => {
    F.mk(F.tk.admin, { courseId: ID.EB, startDate: addDays(TODAY, 2), removalDate: addDays(TODAY, 5) });
    const S = await open(F.tk.student); const p = S.page;
    const note = await p.textContent('.course-card[data-course-id="' + ID.EA + '"] .ttm-card-note, [data-course-id="' + ID.EA + '"] .ttm-card-note');
    assert.ok(/On-Call Teacher Assigned: Tamil Cover Sakthi \(APS9001\)/.test(note), note); assert.ok(!/@/.test(note));
    assert.strictEqual(await p.isVisible('#subTabTempTeacher'), false, 'students never see the sub-tab');
    await p.evaluate(id => document.querySelector('[data-course-id="' + id + '"]').scrollIntoView(), ID.EA);
    await clean(p); await p.screenshot({ path: __dirname + '/r89_card_student.png' });
    assert.deepStrictEqual(S.errors, []); await S.ctx.close();
    const A = await open(F.tk.admin); const n2 = await A.page.textContent('[data-course-id="' + ID.EB + '"] .ttm-card-note'); assert.ok(/Assigned \(upcoming\)/.test(n2)); await A.ctx.close();
  });

  await t('Class VP: sees only own classes in the form; filters (status / search) are local; phone width has no side scroll', async () => {
    const V = await open(F.tk.vp, { vp: { width: 390, height: 860 } }); const p = V.page;
    await p.click('#subTabTempTeacher'); await p.waitForFunction(() => /Tamil Cover Sakthi/.test(document.getElementById('ttmBody').textContent));
    await p.click('#ttmNew'); const cls = await p.$$eval('#ttmClass option', o => o.map(x => x.value)); assert.deepStrictEqual(cls, [ID.EA]);
    await p.click('#ttmCancelForm');
    const before = calls.length; await p.selectOption('#ttmFStatus', 'SCHEDULED'); await p.waitForTimeout(80);
    assert.ok(/No assignment matches/.test(await p.textContent('#ttmBody'))); await p.selectOption('#ttmFStatus', '');
    await p.fill('#ttmSearch', 'APS9001'); await p.waitForTimeout(350); assert.ok(/Tamil Cover Sakthi/.test(await p.textContent('#ttmBody')));
    assert.strictEqual(calls.length, before, 'no server call for filters');
    assert.strictEqual(await noHScroll(p), true);
    await clean(p); await p.screenshot({ path: __dirname + '/r89_tt_phone.png', fullPage: false });
    assert.deepStrictEqual(V.errors, []); await V.ctx.close();
  });

  await t('Access Control: switching Temp Teacher off for teachers hides the sub-tab', async () => {
    G.saveAccessControl(F.tok('admin@aps.org', 'admin'), [{ role: 'teacher', key: 'classes.tempTeacher', visible: false }]);
    const V = await open(F.tk.vp); assert.strictEqual(await V.page.isVisible('#subTabTempTeacher'), false); await V.ctx.close();
    G.saveAccessControl(F.tok('admin@aps.org', 'admin'), [{ role: 'teacher', key: 'classes.tempTeacher', visible: true }]);
  });

  await t('r98: Admin types any APS email → "Entered email" option selected + info; non-APS email disabled; Assign works; plain Teacher keeps list only; On-Call Coordinator sees the sub-tab, other BOD does not', async () => {
    const NEW = 'typedcover_aps8300@avvaiyarpadasalai.org';
    const A = await open(F.tk.admin); const p = A.page;
    await p.click('#subTabTempTeacher'); await p.waitForFunction(() => document.getElementById('ttmBody').textContent.length > 0);
    await p.click('#ttmNew'); await p.selectOption('#ttmClass', ID.ED);
    assert.strictEqual(await p.getAttribute('#ttmTeacherQ', 'placeholder'), 'Search name / APSID, or type any APS email');
    await p.fill('#ttmTeacherQ', 'someone@gmail.com'); await p.waitForTimeout(250);
    assert.ok(await p.$eval('#ttmTeacher option', o => o.disabled && /not an APS email/.test(o.textContent)));
    await p.fill('#ttmTeacherQ', NEW.toUpperCase()); await p.waitForTimeout(250);
    const g = await p.$$eval('#ttmTeacher optgroup', x => x.map(y => y.label)); assert.deepStrictEqual(g, ['Entered email']);
    assert.strictEqual(await p.$eval('#ttmTeacher', s => s.value), NEW);
    assert.ok(/not in the teacher list/.test(await p.textContent('#ttmTeacherInfo')));
    await p.fill('#ttmRemoval', addDays(TODAY, 2)); await p.dispatchEvent('#ttmRemoval', 'change');
    await p.fill('#ttmReason', 'Primary teacher is unwell and needs cover this week.');
    await clean(p); await p.screenshot({ path: __dirname + '/r98_tt_typed_email.png' });
    await p.click('#ttmSubmit'); await p.waitForFunction(() => /was added to/.test(document.getElementById('ttmMsg').textContent));
    assert.ok(F.rows().some(r => r.Temp_Teacher_Email === NEW && r.Classroom_ID === ID.ED && r.Status === 'ACTIVE'));
    // clearing the typed email clears the selection
    await p.click('#ttmNew'); await p.fill('#ttmTeacherQ', 'other_aps8301@avvaiyarpadasalai.org'); await p.waitForTimeout(250); await p.fill('#ttmTeacherQ', ''); await p.waitForTimeout(250);
    assert.strictEqual(await p.evaluate(() => ttm.tch), '');
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
    const T = await open(F.tok('senthil_aps8131@avvaiyarpadasalai.org', 'teacher'));
    await T.page.click('#subTabTempTeacher'); await T.page.waitForFunction(() => !!(ttm.data)); await T.page.click('#ttmNew');
    await T.page.fill('#ttmTeacherQ', 'typed2_aps8302@avvaiyarpadasalai.org'); await T.page.waitForTimeout(250);
    assert.ok(/No matching teacher/.test(await T.page.textContent('#ttmTeacher')), 'plain Teacher: list only');
    await T.ctx.close();
    const C = await open(F.tok('tcs_asvika_aps8112@avvaiyarpadasalai.org', 'vcfo_amchsts_bod')); assert.strictEqual(await C.page.isVisible('#subTabTempTeacher'), true);
    await C.page.click('#subTabTempTeacher'); await C.page.waitForFunction(() => /On-Call Coordinator/.test(document.getElementById('ttmScope').textContent));
    assert.deepStrictEqual(C.errors, []); await C.ctx.close();
    const B = await open(F.tk.bod); assert.strictEqual(await B.page.isVisible('#subTabTempTeacher'), false); await B.ctx.close();
  });

  await browser.close();
  console.log('ALL ' + passed + ' TEMP TEACHER UI TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

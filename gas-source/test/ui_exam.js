// Browser (Chromium) end-to-end test of the Examination tab against the real Code.gs + mocked Classroom.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { makeContext } = require('./gasmock');
const { makeClassroom } = require('./classroommock');
const { Sheet } = require('./gasmock');
const RangeProto = Object.getPrototypeOf(new Sheet('x').getRange(1, 1, 1, 1));
RangeProto.getDisplayValues = function () { return this.getValues().map(r => r.map(v => String(v))); };
Sheet.prototype.getMaxRows = function () { return 1000; };
function fixedDate(iso) { const NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } } return D; }
const env = makeContext({ Date: fixedDate('2026-09-28T16:00:00Z') });
const f0 = env.ctx.Utilities.formatDate;
env.ctx.Utilities.formatDate = (d, tz, p) => p.includes('hh') ? f0(d, tz, p.replace('hh', '§')).replace('§', f0(d, tz, 'h').padStart(2, '0')) : f0(d, tz, p);
env.ctx.Utilities.base64EncodeWebSafe = s => Buffer.from(String(s)).toString('base64url');
const { Classroom, st } = makeClassroom();
env.ctx.Classroom = Classroom;
vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), env.ctx);
const G = ['MUN MAZHALAI', 'MAZHALAI', 'NILAI 1', 'NILAI 2', 'NILAI 3'];
for (let i = 0; i < 17; i++) st.courses.push({ id: 'C' + i, name: G[i % 5] + ' - S' + i + ' | SAT 12:00 - 1:30 PM EST | ' + (i >= 14 ? 'AY25-26' : 'AY26-27'), courseState: 'ACTIVE' });
const calls = []; let hangFn = null;
(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  async function open(role, email, viewport) {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 1000 } }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    env.cache['aps_sess_tok_' + role] = JSON.stringify({ email, role });
    await page.exposeFunction('__gas', (fn, args) => { calls.push(fn); if (hangFn === fn) { hangFn = null; return new Promise(() => {}); } try { const out = env.ctx[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : out }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => {
      function runner(s, f) { return new Proxy({}, { get(_, p) {
        if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
        return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); };
      } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } };
    });
    const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    await page.evaluate(({ role, email }) => {
      apsSessionToken = 'tok_' + role; currentUser = { email, role, name: email, permissions: { buttons: true, filters: true, tabs: true } }; allCourses = [];
      const ov = document.getElementById('apsGateOverlay'); if (ov) ov.style.display = 'none';
      updateAttendanceTabVisibility(); updateExaminationTabVisibility();
    }, { role, email });
    return { ctx, page, errors };
  }
  const visible = (page, sel) => page.$eval(sel, e => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  async function openTab(page) {
    await page.click('#tabExamination');
    await page.waitForFunction(() => /classrooms · loaded/.test(document.getElementById('examCourseCount').textContent));
  }
  const waitDone = (page) => page.waitForFunction(() => !document.getElementById('examResultsClose').disabled && !document.getElementById('examResultsCard').hidden, null, { timeout: 8000 }).catch(async e => { console.log('STATE', await page.evaluate(() => [document.getElementById('examResultsCard').hidden, document.getElementById('examResultsTitle').textContent, document.getElementById('examProgressText').textContent, document.getElementById('examResultsBody').textContent.slice(0,300)])); console.log('ERRORS', errors, calls.slice(-6)); throw e; });

  for (const [role, exp] of [['admin', true], ['superadmin', true], ['vcfo_amchsts_bod', true], ['headmaster', false], ['teacher', false], ['student', false]]) {
    await t('Examination tab visible for ' + role + ': ' + exp, async () => { const { ctx, page } = await open(role, role + '@aps.org'); assert.strictEqual(await visible(page, '#tabExamination'), exp); await ctx.close(); });
  }

  const { ctx, page, errors } = await open('admin', 'raja_aps1234@avvaiyarpadasalai.org');
  let annId;
  await t('opens with AY26-27 classrooms only; All = 14 selected; switching tabs keeps other views hidden', async () => {
    await openTab(page);
    assert.ok((await page.textContent('#examCourseCount')).startsWith('14 classrooms'));
    assert.strictEqual(await page.$eval('#examAnnPicker .exam-count', e => e.textContent), '14');
    assert.strictEqual(await visible(page, '#classesView'), false); assert.strictEqual(await visible(page, '#attendanceView'), false);
  });
  await t('Select Grade/Class: grade checkbox, Select All / Clear All, live count; empty selection blocked with no server call', async () => {
    await page.check('input[name="exam-ann-mode"][value="SELECT"]');
    assert.strictEqual(await page.$eval('#examAnnPicker .exam-count', e => e.textContent), '0');
    await page.check('#examAnnPicker [data-exam-grade="NILAI 1"]');
    assert.strictEqual(await page.$eval('#examAnnPicker .exam-count', e => e.textContent), '3');
    await page.click('#examAnnPicker [data-exam-pick="none"]');
    assert.strictEqual(await page.$eval('#examAnnPicker .exam-count', e => e.textContent), '0');
    const n = calls.length;
    await page.fill('#examAnnText', 'Test');
    await page.click('#examAnnPreviewBtn');
    assert.ok((await page.textContent('#examAnnPostErrors')).includes('Please select at least one classroom.'));
    assert.ok(!calls.slice(n).includes('previewExaminationAnnouncement'));
    await page.click('#examAnnPicker [data-exam-pick="all"]');
    assert.strictEqual(await page.$eval('#examAnnPicker .exam-count', e => e.textContent), '14');
    await page.fill('#examAnnPicker [data-exam-pick-filter]', 'S1 ');
    await page.waitForFunction(() => document.querySelectorAll('#examAnnPicker [data-exam-course]').length === 1);
    await page.click('#examAnnPicker [data-exam-pick="none"]'); // clears only the filtered class? -> Clear All clears everything
    assert.strictEqual(await page.$eval('#examAnnPicker .exam-count', e => e.textContent), '0');
    await page.fill('#examAnnPicker [data-exam-pick-filter]', '');
    await page.waitForFunction(() => document.querySelectorAll('#examAnnPicker [data-exam-course]').length === 14);
    await page.check('#examAnnPicker [data-exam-course="C0"]'); await page.check('#examAnnPicker [data-exam-course="C1"]');
    assert.strictEqual(await page.$eval('#examAnnPicker .exam-count', e => e.textContent), '2');
  });
  await t('Post: preview -> confirm -> results; ID at the end; history auto-refreshes', async () => {
    await page.fill('#examAnnText', 'Model Examination 1 will be conducted on October 15, 2026.\n\nPlease make sure all students are prepared.');
    await page.click('#examAnnPreviewBtn');
    await page.waitForSelector('#examAnnPreviewBox:not([hidden])');
    const pv = await page.textContent('#examAnnPrevText');
    assert.ok(pv.startsWith('*** 📢 APS ADMIN Team - ANNOUNCEMENT 📢 ***')); assert.ok(/Director of Technology and Public Relations\n\nANNOUNCEMENT_ID: ANN20260928_####$/.test(pv));
    assert.strictEqual(await page.textContent('#examAnnPrevCount'), '2');
    await page.click('#examAnnPostBtn');
    await waitDone(page);
    assert.ok((await page.textContent('#examResultsChips')).includes('Success: 2'));
    annId = await page.$eval('#examAnnIdInput', e => e.value);
    assert.strictEqual(annId, 'ANN20260928_0001');
    assert.ok(st.anns.C0[0].text.endsWith('\n\nANNOUNCEMENT_ID: ANN20260928_0001'));
    await page.waitForFunction(() => /ANNOUNCEMENT_POST/.test(document.getElementById('examHistBody').textContent));
    assert.strictEqual(await page.$eval('#examAnnText', e => e.value), '', 'text cleared after posting');
  });
  await t('editing text after a preview invalidates it (nothing posted from a stale preview)', async () => {
    await page.fill('#examAnnText', 'Another');
    await page.click('#examAnnPreviewBtn'); await page.waitForSelector('#examAnnPreviewBox:not([hidden])');
    await page.type('#examAnnText', ' more');
    assert.strictEqual(await visible(page, '#examAnnPreviewBox'), false);
  });
  await t('Modify: search ID -> Found 2, text prefilled without the ID -> preview keeps same ID -> update', async () => {
    await page.click('[data-exam-ann-action="modify"]');
    await page.click('#examAnnSearchBtn');
    await page.waitForSelector('#examAnnSearchSummary:not([hidden])');
    assert.ok((await page.textContent('#examAnnSearchSummary')).includes('Found: 2 classrooms'));
    assert.ok((await page.textContent('#examAnnSearchSummary')).includes('Missing: 0'));
    const pre = await page.$eval('#examAnnModText', e => e.value);
    assert.ok(pre.startsWith('*** 📢') && !pre.includes('ANNOUNCEMENT_ID'));
    await page.fill('#examAnnModText', 'Updated announcement text');
    await page.click('#examAnnModPreviewBtn');
    assert.strictEqual(await page.textContent('#examAnnModPrevText'), 'Updated announcement text\n\nThanks\nAPS Tech Team - Admin\nSugadev Velayutham\nDirector of Technology and Public Relations\n\nANNOUNCEMENT_ID: ' + annId);
    await page.click('#examAnnModConfirm'); await waitDone(page);
    assert.strictEqual(st.anns.C0[0].text, 'Updated announcement text\n\nThanks\nAPS Tech Team - Admin\nSugadev Velayutham\nDirector of Technology and Public Relations\n\nANNOUNCEMENT_ID: ' + annId);
    assert.strictEqual(st.anns.C1[0].text, 'Updated announcement text\n\nThanks\nAPS Tech Team - Admin\nSugadev Velayutham\nDirector of Technology and Public Relations\n\nANNOUNCEMENT_ID: ' + annId);
  });
  await t('Delete: partial ID refused; confirmation shows classroom count; exact announcement removed', async () => {
    await page.click('[data-exam-ann-action="delete"]');
    await page.fill('#examAnnIdInput', 'ANN20260928');
    await page.click('#examAnnSearchBtn');
    assert.ok((await page.textContent('#examAnnSearchMsg')).includes('full Announcement ID'));
    await page.fill('#examAnnIdInput', annId.toLowerCase());
    await page.press('#examAnnIdInput', 'Enter');
    await page.waitForSelector('#examAnnDeleteBox:not([hidden])');
    assert.strictEqual(await page.textContent('#examAnnDeleteBtn'), 'Delete Announcement (2 classrooms)');
    await page.click('#examAnnDeleteBtn');
    await page.waitForSelector('#examConfirmOverlay.open');
    const msg = await page.textContent('#examConfirmMessage');
    assert.ok(msg.includes('You are about to delete this announcement from 2 classrooms.') && msg.includes(annId) && msg.includes('cannot be automatically undone'));
    assert.strictEqual(await page.textContent('#examConfirmOk'), 'Delete');
    await page.click('#examConfirmOk'); await waitDone(page);
    assert.strictEqual(st.anns.C0.length, 0); assert.strictEqual(st.anns.C1.length, 0);
  });
  await t('Classwork: topic drives valid names + preset; type drives fields', async () => {
    await page.click('[data-exam-section="classwork"]');
    assert.strictEqual(await visible(page, '#examAnnSection'), false);
    await page.selectOption('#examCwTopic', 'EXAMINATION');
    const names = await page.$$eval('#examCwName option', os => os.map(o => o.value).filter(Boolean));
    assert.deepStrictEqual(names, ['MODEL_EXAM_1', 'EXAM_TRIMESTER_1', 'MODEL_EXAM_2', 'EXAM_TRIMESTER_2', 'MODEL_EXAM_3', 'EXAM_FINAL_TRIMESTER_3']);
    assert.strictEqual(await page.$eval('#examCwType', e => e.value), 'ASSIGNMENT');
    await page.selectOption('#examCwTopic', 'ATTENDANCE');
    assert.strictEqual(await page.$eval('#examCwType', e => e.value), 'MULTIPLE_CHOICE_QUESTION');
    assert.strictEqual(await visible(page, '#examCwChoicesField'), true);
    assert.ok((await page.$eval('#examCwInstructions', e => e.value)).startsWith('{TITLE} - வருகைப்பதிவு'));
    await page.selectOption('#examCwTopic', 'QUIZ');
    assert.strictEqual(await page.$eval('input[name="examCwGrading"]:checked', e => e.value), 'UNGRADED');
    assert.strictEqual(await visible(page, '#examCwPointsField'), false); assert.strictEqual(await visible(page, '#examCwQuizNote'), true);
    await page.selectOption('#examCwType', 'MATERIAL');
    assert.strictEqual(await page.$eval('input[name="examCwGrading"][value="GRADED"]', e => e.disabled), true);
    assert.strictEqual(await visible(page, '#examCwDueRow'), false);
    // user-edited instructions are not overwritten by switching topic
    await page.fill('#examCwInstructions', 'My own text');
    await page.selectOption('#examCwTopic', 'HOMEWORK');
    assert.strictEqual(await page.$eval('#examCwInstructions', e => e.value), 'My own text');
    await page.click('#examCwResetInstr');
    assert.ok((await page.$eval('#examCwInstructions', e => e.value)).includes('HOMEWORK: Please complete the exercises'));
  });
  await t('Classwork validation: missing fields and past schedule are shown; no publish', async () => {
    await page.selectOption('#examCwTopic', 'EXAMINATION');
    const n = calls.length;
    await page.click('#examCwPreviewBtn');
    const errs = await page.textContent('#examCwErrors');
    assert.ok(errs.includes('Please select an assignment name.') && errs.includes('Please select a schedule date.') && errs.includes('Please select a schedule time.'));
    assert.ok(!calls.slice(n).includes('previewExaminationClasswork'));
    await page.selectOption('#examCwName', 'MODEL_EXAM_1');
    await page.fill('#examCwDate', '2026-09-28'); await page.fill('#examCwTime', '10:00');
    await page.click('#examCwPreviewBtn');
    await page.waitForFunction(() => /Scheduled time must be in the future/.test(document.getElementById('examCwErrors').textContent));
    assert.strictEqual(await visible(page, '#examCwPreviewBox'), false);
  });
  await t('Test 1 via UI: preview matches spec, Confirm & Schedule, one failure + Retry Failed (no duplicates)', async () => {
    await page.fill('#examCwDate', '2026-10-15'); await page.fill('#examCwTime', '19:00');
    await page.fill('#examCwPoints', '100');
    st.fail.C3 = { op: 'create', msg: 'Scheduled time must be in the future' };
    await page.click('#examCwPreviewBtn');
    await page.waitForSelector('#examCwPreviewBox:not([hidden])');
    const kv = await page.textContent('#examCwPrevKv');
    ['TypeAssignment', 'TopicEXAMINATION', 'Assignment NameMODEL_EXAM_1', 'GradingGRADED', 'Points100', 'Schedule10/15/2026 07:00 PM EST', 'TargetAll AY26-27 Classrooms', 'Selected Classrooms14']
      .forEach(x => assert.ok(kv.includes(x), x + ' in ' + kv));
    await page.dblclick('#examCwConfirmBtn'); // double click must not double-publish
    await waitDone(page);
    const chips = await page.textContent('#examResultsChips');
    assert.ok(chips.includes('Total: 14') && chips.includes('Success: 13') && chips.includes('Failed: 1'), chips);
    assert.ok((await page.textContent('#examResultsBody')).includes('Reason: The scheduled time must be in the future.'));
    assert.strictEqual(await visible(page, '#examRetryBtn'), true);
    delete st.fail.C3;
    const before = st.calls.cwCreate;
    await page.click('#examRetryBtn'); await waitDone(page);
    assert.strictEqual(st.calls.cwCreate, before + 1, 'only the failed classroom was created');
    assert.ok((await page.textContent('#examResultsChips')).includes('Success: 14'));
    assert.strictEqual(await visible(page, '#examRetryBtn'), false);
    for (let i = 0; i < 14; i++) assert.strictEqual(st.work['C' + i].filter(w => w.title === 'MODEL_EXAM_1').length, 1);
    await (await page.$('#examinationView')).screenshot({ path: __dirname + '/exam_classwork.png' });
  });
  await t('publishing the same item again reports ALREADY EXISTS', async () => {
    await page.click('#examCwPreviewBtn'); await page.waitForSelector('#examCwPreviewBox:not([hidden])');
    await page.click('#examCwConfirmBtn'); await waitDone(page);
    assert.ok((await page.textContent('#examResultsChips')).includes('Already Exists: 14'));
  });
  await t('a batch whose server call never answers (expired session) is closed out, not stuck', async () => {
    await page.selectOption('#examCwName', 'MODEL_EXAM_2');
    await page.click('#examCwPreviewBtn'); await page.waitForSelector('#examCwPreviewBox:not([hidden])');
    hangFn = 'publishExaminationToCourses';
    await page.click('#examCwConfirmBtn');
    await page.waitForFunction(() => examState.running);
    await page.evaluate(() => { examState.lastActivity = Date.now() - 180000; });
    await page.click('[data-exam-section="announcements"]'); await page.click('#tabExamination');
    await waitDone(page);
    assert.ok((await page.textContent('#examResultsBody')).includes('Not confirmed'));
    assert.strictEqual(await visible(page, '#examRetryBtn'), true);
    await page.click('#examRetryBtn'); await waitDone(page);
    assert.ok((await page.textContent('#examResultsChips')).includes('Success: 14'), await page.textContent('#examResultsChips'));
    for (let i = 0; i < 14; i++) assert.strictEqual(st.work['C' + i].filter(w => w.title === 'MODEL_EXAM_2').length, 1);
    await page.click('[data-exam-section="classwork"]');
  });
  await t('History: dropdown change auto-refreshes; search debounced', async () => {
    const n = calls.filter(c => c === 'getExaminationHistory').length;
    await page.selectOption('#examHistStatus', 'FAILED');
    await page.waitForFunction(() => /1 entries/.test(document.getElementById('examHistMeta').textContent));
    assert.strictEqual(calls.filter(c => c === 'getExaminationHistory').length, n + 1);
    await page.selectOption('#examHistStatus', '');
    await page.type('#examHistSearch', 'MODEL_EXAM_1', { delay: 20 });
    await page.waitForFunction(() => /MODEL_EXAM_1/.test(document.getElementById('examHistBody').textContent) && !/ANNOUNCEMENT/.test(document.getElementById('examHistBody').textContent));
    const hc = calls.filter(c => c === 'getExaminationHistory').length - n;
    assert.ok(hc <= 4, 'debounced: ' + hc + ' calls');
    assert.ok((await page.textContent('#examHistBody')).includes('APS1234'), 'user APSID shown');
    assert.deepStrictEqual(errors, []);
  });
  await ctx.close();

  await t('BOD (read-only): tab visible, read-only note, publish buttons disabled, search still works', async () => {
    const b = await open('vcfo_amchsts_bod', 'bod@amchats.org');
    await b.page.click('#tabExamination');
    await b.page.waitForFunction(() => /classrooms · loaded/.test(document.getElementById('examCourseCount').textContent));
    assert.strictEqual(await visible(b.page, '#examReadOnlyNote'), true);
    for (const id of ['#examAnnPreviewBtn', '#examCwPreviewBtn', '#examAnnDeleteBtn', '#examAnnModConfirm']) assert.strictEqual(await b.page.$eval(id, e => e.disabled), true, id);
    await b.page.click('[data-exam-ann-action="search"]');
    await b.page.fill('#examAnnIdInput', 'ANN20260928_0001');
    await b.page.click('#examAnnSearchBtn');
    await b.page.waitForFunction(() => !document.getElementById('examAnnSearchBtn').disabled && document.getElementById('examAnnSearchMsg').textContent.indexOf('Searching') === -1);
    assert.deepStrictEqual(b.errors, []);
    await b.ctx.close();
  });

  await t('mobile (375px): no horizontal page scroll, controls stack', async () => {
    const m = await open('superadmin', 'sa@aps.org', { width: 375, height: 800 });
    await openTab(m.page);
    await m.page.click('[data-exam-section="classwork"]');
    const over = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 1, 'overflow ' + over);
    await m.page.screenshot({ path: __dirname + '/exam_mobile.png', fullPage: false });
    assert.deepStrictEqual(m.errors, []);
    await m.ctx.close();
  });
  await browser.close();
  console.log('\nALL ' + passed + ' EXAMINATION UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

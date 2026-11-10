// Browser (Chromium) end-to-end test: Examination > Grading (Google Classroom Grades) for Admin, HM, BOD, Teacher, Student.
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { build } = require('./gradingfixture');
const { env, ids, tok, J, G } = build();
const adminTok = tok('admin@aps.org', 'admin');
assert.strictEqual(G.syncGrading(adminTok, { refreshRoster: true }).result, 'COMPLETED');

(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  async function open(role, email, viewport) {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1366, height: 1000 }, acceptDownloads: true }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    env.cache['aps_sess_tok_' + role] = JSON.stringify({ email, role });
    await page.exposeFunction('__gas', async (fn, args) => {
      try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); }
    });
    await page.addInitScript(() => {
      function runner(s, f) { return new Proxy({}, { get(_, p) {
        if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
        return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); };
      } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } };
    });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const p = J(G.buildAuthenticatedUserPayload_({ email, role }, []));
    await page.evaluate(({ role, email, p }) => {
      apsSessionToken = 'tok_' + role; currentUser = { email, role, name: email, permissions: p.permissions, examinationAccess: p.examinationAccess, gradingAccess: p.gradingAccess }; allCourses = [];
      const ov = document.getElementById('apsGateOverlay'); if (ov) ov.style.display = 'none';
      updateAttendanceTabVisibility(); updateExaminationTabVisibility();
    }, { role, email, p });
    return { ctx, page, errors };
  }
  const visible = (p, sel) => p.$eval(sel, e => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length)).catch(() => false);
  const pane = p => p.textContent('#grdPane');
  const goGrading = async (p, click) => { await p.click('#tabExamination'); if (click) await p.click('[data-exam-section="grading"]'); await p.waitForFunction(() => /Showing|No Google Classroom is assigned|No grades match/.test(document.getElementById('grdCount').textContent + document.getElementById('grdPane').textContent)); };

  const A = await open('admin', 'admin@aps.org');
  await t('Admin: Grades matrix of ONLY assigned classrooms — Graded Mark + Graded Type per assignment, Overall, approved assignments newest-first, 4 frozen columns, no teacher details, note with next refresh', async () => {
    const p = A.page;
    await goGrading(p, true);
    for (const s of ['announcements', 'classwork', 'questionPaper', 'grading']) assert.strictEqual(await visible(p, '[data-exam-section="' + s + '"]'), true, s);
    const heads = await p.$$eval('#grdPane thead tr:first-child th', els => els.map(e => e.childNodes[0].textContent.trim()));
    assert.deepStrictEqual(heads, ['Student Name', 'Student Email Address', 'Google Classroom Name', 'Overall', 'HW_LSN_2', 'QUZ_LSN_2', 'HW_LSN_1', 'ATT_LSN_1', 'QUZ_LSN_1'], 'newest lesson first; HW, ATT, QUZ inside a lesson; Reading Log (unapproved) never shown');
    const cats = await p.$$eval('#grdPane thead tr:first-child th .grd-cat', els => els.map(e => e.textContent));
    assert.deepStrictEqual(cats, ['HOMEWORK', 'QUIZ', 'HOMEWORK', 'ATTENDANCE', 'QUIZ']);
    assert.ok((await p.textContent('#grdPane thead tr:nth-child(2)')).includes('Graded MarkGraded Type'));
    const tx = await pane(p);
    assert.ok(tx.includes('Joshua Kumar') && tx.includes('Raja') && !tx.includes('Vani') && !tx.includes('Meena'), 'only NILAI 3 - EF (assigned)');
    assert.ok(tx.includes('9 / 10') && tx.includes('GRADED') && tx.includes('UNGRADED') && tx.includes('COMPLETED') && tx.includes('Missing') && tx.includes('Turned in · Late'));
    assert.ok(!/draft|Returned|— \/ /.test(tx), 'no mark / draft for UNGRADED; RETURNED shown as COMPLETED');
    assert.ok(/ATT_LSN_1/.test(await pane(p)) && !/Reading Log/.test(await pane(p)), 'ATT_ captured, unapproved titles never shown');
    // Frozen identity columns: after scrolling right, the 4 left columns stay put
    const fz = await p.$$eval('#grdPane table.grd-matrix thead tr:first-child th.grd-fz', els => els.map(e => e.childNodes[0].textContent.trim()));
    assert.deepStrictEqual(fz, ['Student Name', 'Student Email Address', 'Google Classroom Name', 'Overall']);
    const pos = () => p.$$eval('#grdPane tbody tr:first-child td', tds => tds.slice(0, 5).map(td => Math.round(td.getBoundingClientRect().left)));
    const before = await pos();
    await p.$eval('#grdPane', el => { el.scrollLeft = 400; });
    const after = await pos();
    assert.deepStrictEqual(after.slice(0, 4), before.slice(0, 4), 'frozen columns do not move: ' + before + ' -> ' + after);
    assert.ok(after[4] < before[4], 'assignment columns scroll');
    const order = await p.evaluate(() => ['HW_LSN_1', 'HW_LSN_10', 'QUZ_LSN_2', 'ATT_LSN_2', 'HW_LSN_2', 'EXAM_TRIMESTER_1', 'MODEL_EXAM_1', 'TRMST01_PRO01', 'TRMST01_PRO02', 'ATT_LSN_10']
      .map(x => ({ t: x, lsn: (/LSN_(\d+)/.exec(x) || [])[1] || '' })).sort(grdColSortDesc_).map(x => x.t));
    assert.deepStrictEqual(order, ['HW_LSN_10', 'ATT_LSN_10', 'HW_LSN_2', 'ATT_LSN_2', 'QUZ_LSN_2', 'HW_LSN_1', 'TRMST01_PRO02', 'TRMST01_PRO01', 'MODEL_EXAM_1', 'EXAM_TRIMESTER_1'], 'numeric (LSN_10 > LSN_2), then HW, ATT, QUZ, TRMST, MODEL_EXAM, EXAM');
    await p.$eval('#grdPane', el => { el.scrollLeft = 260; });
    await p.screenshot({ path: __dirname + '/grades_frozen.png', clip: await (await p.$('#grdPane')).boundingBox() });
    await p.$eval('#grdPane', el => { el.scrollLeft = 0; });
    assert.ok(!/Teacher A|teachera_|APS Tech Support/.test(await p.textContent('#grdSection')), 'no teacher details');
    const note = await p.textContent('#grdNote');
    assert.ok(/contact your Class Teacher \/ Head Master to update it in Google Classroom/.test(note) && /next data refresh planned: \d\d\/\d\d\/\d{4} 05:00 PM EST \(automatic, every day at 5:00 PM EST\)/.test(note));
    assert.strictEqual(await visible(p, '#grdSyncBtn'), true); assert.strictEqual(await visible(p, '#grdExportBtn'), true);
    const tiles = await p.$$eval('#grdTiles .exam-qp-tile', els => els.map(e => e.querySelector('span').textContent + '=' + e.querySelector('b').textContent));
    assert.ok(tiles.includes('Students in view=2') && tiles.includes('Assignments=5'), tiles.join(','));
    assert.ok((await p.textContent('#grdPane thead tr:nth-child(2)')).includes('Graded MarkGraded TypeDates (MM/DD)'), 'dates sub-column per classwork');
    const sec = await p.$$eval('#grdPane .grd-sec', e => e.map(x => x.innerText));
    assert.ok(sec.length && sec[0].includes('Teacher: DIYA BALAMURUGAN 📞[630-973-6617]') && sec[0].includes('HM: Karunambikai [📞+919686457264]'), 'Google Classroom section per classroom');
    const dates = await p.$$eval('#grdPane .grd-dt', e => e.map(x => x.innerText.replace(/\s+/g, ' ')));
    assert.ok(dates.some(d => /^Assigned \d\d\/\d\d$/.test(d)) && dates.some(d => /^Due \d\d\/\d\d$/.test(d)) && dates.some(d => /^Turned in \d\d\/\d\d$/.test(d)) && dates.some(d => /^Graded \d\d\/\d\d$/.test(d)) && dates.some(d => d === 'Graded —'), dates.slice(0, 8).join(' | '));
    await p.screenshot({ path: __dirname + '/grades_admin.png' });
    assert.deepStrictEqual(A.errors, []);
  });
  await t('filters refresh automatically; Assignment Report shows dates, mark, graded type, status; export = filtered rows', async () => {
    const p = A.page;
    await p.selectOption('#grdStatus', 'MISSING');
    await p.waitForFunction(() => { const t = document.getElementById('grdPane').textContent; return t.includes('Raja') && !t.includes('Joshua'); });
    await p.selectOption('#grdStatus', '');
    await p.click('[data-grd-view="report"]');
    await p.waitForFunction(() => /Assigned Date/.test(document.getElementById('grdPane').textContent));
    const heads = await p.$$eval('#grdPane thead th', els => els.map(e => e.textContent));
    assert.deepStrictEqual(heads, ['Student Name', 'Student Email Address', 'Google Classroom Name', 'Assignment', 'Assigned Date', 'Due Date', 'Turned In Date', 'Graded Mark', 'Graded Type', 'Graded Date', 'Status']);
    await p.selectOption('#grdWork', 'HW_LSN_1');
    await p.waitForFunction(() => document.querySelectorAll('#grdPane tbody tr').length === 2);
    const dates = await p.$$eval('#grdPane tbody tr:first-child td', tds => [4, 5, 6].map(i => tds[i].textContent));
    assert.ok(dates.every(d => /^\d\d\/\d\d$/.test(d)), 'Assigned / Due / Turned In as MM/DD: ' + dates);
    const dlp = p.waitForEvent('download');
    await p.click('#grdExportBtn');
    const csv = fs.readFileSync(await (await dlp).path(), 'utf8').replace(/^\ufeff/, '').trim().split(/\r\n/);
    assert.strictEqual(csv.length, 3); assert.ok(csv.slice(1).every(l => l.includes('"HW_LSN_1"')));
    await p.screenshot({ path: __dirname + '/grades_report.png' });
    await p.click('#grdClearBtn');
  });
  await t('Sync Now: dialog explains the 2-calls-per-classroom sync and the optional roster refresh; statistics shown', async () => {
    const p = A.page;
    await p.click('#grdSyncBtn');
    await p.waitForSelector('#examQpModalOverlay.open');
    assert.ok(/2 Google API calls per classroom/.test(await p.textContent('#examQpModalBody')));
    await p.check('#grdSyncRoster');
    await p.click('#grdSyncGo');
    await p.waitForFunction(() => /Class rosters refreshedYes/.test(document.getElementById('grdSyncBody').textContent));
    assert.ok(/Google API calls/.test(await p.textContent('#grdSyncBody')));
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });
  await t('Sync Now is visible for Admin even when the grades cannot load (e.g. first run / server not updated yet), with a clear message', async () => {
    const orig = G.getGradingData;
    G.getGradingData = () => { throw new Error('getGradingData is not a function'); };
    const X = await open('admin', 'admin@aps.org');
    await X.page.click('#tabExamination'); await X.page.click('[data-exam-section="grading"]');
    await X.page.waitForFunction(() => /does not match this page yet/.test(document.getElementById('grdPane').textContent));
    assert.strictEqual(await visible(X.page, '#grdSyncBtn'), true, 'Sync Now visible before any data loaded');
    assert.strictEqual(await X.page.$eval('#grdSyncBtn', b => b.disabled), false);
    G.getGradingData = orig;
    await X.ctx.close();
  });
  const H = await open('headmaster', 'hm@aps.org');
  await t('HM: only the classroom they are assigned to; Examination shows only Grading; no Sync Now (Admin only)', async () => {
    const p = H.page;
    await goGrading(p, false);
    for (const s of ['announcements', 'classwork', 'questionPaper']) assert.strictEqual(await visible(p, '[data-exam-section="' + s + '"]'), false, s);
    const tx = await pane(p);
    assert.ok(tx.includes('Vani') && tx.includes('NILAI 4 - AB') && !tx.includes('Raja'));
    assert.ok(tx.includes('18 / 20'));
    assert.strictEqual(await visible(p, '#grdSyncBtn'), false, 'Sync Now (API quota) is Admin-only');
    assert.deepStrictEqual(H.errors, []); await H.ctx.close();
  });
  const B = await open('vcfo_amchsts_bod', 'bod@amchats.org');
  await t('BOD (not assigned to a classroom): clear empty state, no sync / export', async () => {
    const p = B.page;
    await goGrading(p, true);
    assert.ok(/No Google Classroom is assigned to your account/.test(await pane(p)));
    assert.strictEqual(await visible(p, '#grdSyncBtn'), false); assert.strictEqual(await visible(p, '#grdExportBtn'), false);
    assert.deepStrictEqual(B.errors, []); await B.ctx.close();
  });
  const T = await open('teacher', 'teachera_aps101@avvaiyarpadasalai.org');
  await t('Teacher: own classrooms with all their students; export own; no sync; another classroom refused by the server', async () => {
    const p = T.page;
    await goGrading(p, false);
    const opts = await p.$$eval('#grdClass option', o => o.map(x => x.value).filter(Boolean));
    assert.deepStrictEqual(opts.sort(), [ids.N3EF, ids.N3EA].sort());
    assert.strictEqual(await visible(p, '#grdSyncBtn'), false); assert.strictEqual(await visible(p, '#grdExportBtn'), true);
    const denied = await p.evaluate(id => new Promise(res => apsScriptRun.withSuccessHandler(() => res('ALLOWED')).withFailureHandler(e => res(e.message)).exportGrading({ courseId: id })), ids.N4AB);
    assert.ok(/Access denied/.test(denied), denied);
    await p.screenshot({ path: __dirname + '/grades_teacher.png' });
    assert.deepStrictEqual(T.errors, []); await T.ctx.close();
  });
  const S = await open('student', 'joshua_aps3407@avvaiyarpadasalai.org', { width: 375, height: 820 });
  await t('Student (mobile): My Grades / My Assignments with only their own marks; note shown; no sync / export; no other students; no horizontal scroll', async () => {
    const p = S.page;
    await goGrading(p, false);
    const views = await p.$$eval('#grdViews [data-grd-view]', els => els.map(e => e.textContent));
    assert.deepStrictEqual(views, ['My Grades', 'My Assignments']);
    const tx = await pane(p);
    assert.ok(tx.includes('NILAI 3 - EF') && tx.includes('NILAI 4 - AB') && tx.includes('9 / 10') && !/Raja|Vani|Meena/.test(tx));
    assert.ok(/Class Teacher \/ Head Master/.test(await p.textContent('#grdNote')));
    assert.strictEqual(await visible(p, '#grdSyncBtn'), false); assert.strictEqual(await visible(p, '#grdExportBtn'), false); assert.strictEqual(await visible(p, '#grdNilai'), false);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await p.click('[data-grd-view="report"]');
    await p.waitForFunction(() => /Turned In Date/.test(document.getElementById('grdPane').textContent));
    await p.screenshot({ path: __dirname + '/grades_student_mobile.png', fullPage: true });
    assert.deepStrictEqual(S.errors, []); await S.ctx.close();
  });
  await browser.close();
  console.log('\nALL ' + passed + ' GRADING UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

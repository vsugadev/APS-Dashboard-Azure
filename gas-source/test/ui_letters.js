// Browser test: Letters tab + APS Appreciation Certificate Generator (node test/ui_letters.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { build } = require('./gradingfixture');
const F = build(); const { env, cls, ids, tok, J, G } = F;
const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0);
P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p;
P.getMaxRows = P.getMaxRows || function () { return 1000; };
cls.courses.find(c => c.id === ids.N3EF).description = 'Join: https://meet.google.com/abc-defg-hij';
cls.courses.find(c => c.id === ids.N3EA).description = 'meet.google.com/xyz-wxyz-abc';
G.syncClassroomData();
G.classMeetDetectedSave_({ [ids.N4AB]: { code: 'DETECTEDXX', source: 'MEET_AUDIT_TEACHER_CODE', date: '2026-09-26', courseName: 'N4AB' } });
cls.courses.forEach(c => { c.alternateLink = 'https://classroom.google.com/c/' + c.id; });
G.syncClassroomData();
G.getWhatsAppLinksMap_(); // creates the sheet
{ const wa = env.wb.getSheetByName('WhatsApp_Group_Links'); const n = cls.courses.find(c => c.id === ids.N3EF).name; wa.getRange(2, 1, 1, 3).setValues([[n, '', 'https://chat.whatsapp.com/ExampleGroup']]); }
env.ctx.CacheService.getScriptCache().remove('aps_whatsapp_map_v1'); // r49: direct sheet edit — the 10-min WhatsApp cache is cleared by Force Sync in production

(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  const calls = [];
  async function open(email, role, o) {
    o = o || {};
    const ctx = await browser.newContext({ viewport: o.vp || { width: 1366, height: 1000 }, permissions: o.noClipboard ? [] : ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const token = tok(email, role);
    await page.exposeFunction('__gas', async (fn, args) => { calls.push([role, fn]); try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript((noClip) => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } };
      if (noClip) { Object.defineProperty(navigator, 'clipboard', { value: undefined }); document.execCommand = () => false; } }, !!o.noClipboard);
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); }, { data, token });
    await page.waitForTimeout(200);
    return { page, errors, data };
  }
  const TEMPLATE = '1-k45mRP1vb0m8mhurUpHxBjeRI7N4V-Iw_XzQm4GsiE';
  const mails = [], docs = {};
  G.MimeType = { PDF: 'application/pdf' };
  G.DriveApp = { getFileById(id) {
      if (id === TEMPLATE) return { makeCopy(n) { const cid = 'C' + Object.keys(docs).length; docs[cid] = { t: '{{STUDENT_FULLNAME}} {{TEACHER_MESSAGE}} {{ISSUE_DATE}}' }; return { getId: () => cid }; } };
      return { getAs() { return { setName(n) { this.name = n; return this; } }; }, setTrashed() {} }; }, getFolderById() { throw new Error('x'); } };
  const sec = d => ({ replaceText(p, r) { d.t = d.t.split(new RegExp(p, 'g')).join(r.replace(/\$\$/g, '$')); return this; }, getText: () => d.t });
  G.DocumentApp = { openById(id) { return { getBody: () => sec(docs[id]), getHeader: () => null, getFooter: () => null, saveAndClose() {} }; } };
  G.MailApp = { sendEmail(p) { mails.push(p); } };
  const TA = 'teachera_aps101@avvaiyarpadasalai.org';
  const A = await open(TA, 'teacher');
  const p = A.page; await p.evaluate(() => updateReferenceLetterTabVisibility());
  await t('teacher: tab is "📄 Letters"; Reference Letter shown by default, unchanged', async () => {
    assert.strictEqual((await p.textContent('#rl-tab')).trim(), '📄 Letters');
    await p.click('#rl-tab'); await p.waitForTimeout(300);
    assert.ok(await p.isVisible('#ltr-type-choice'));
    assert.ok(await p.isVisible('#rl-teacher-section')); assert.ok(!(await p.isVisible('#apc-section')));
    assert.deepStrictEqual(await p.$$eval('.ltr-type-btn', b => b.filter(x => x.offsetParent).map(x => x.getAttribute('data-ltr-type'))), ['reference', 'appreciation'], 'teacher does not see the Teacher Appreciation Letter');
    assert.deepStrictEqual(await p.$$eval('.ltr-type-btn b', b => b.map(x => x.textContent)), ['📄 Reference/Volunteer Letter', '🏅 Student Appreciation Letter', '🌟 Teacher Appreciation Letter']);
    await p.fill('#rl-teacher-name', 'Teacher A');
    await p.fill('#rl-reason', Array.from({ length: 20 }, (_, i) => 'word' + i).join(' '));
    assert.strictEqual(await p.isDisabled('#rl-submit'), false, 'Reference Letter form still works');
  });
  await t('Appreciation: students from own classes, local search, editable name, read-only email', async () => {
    const n0 = calls.length;
    await p.click('[data-ltr-type="appreciation"]'); await p.waitForTimeout(300);
    assert.ok(await p.isVisible('#apc-section')); assert.ok(!(await p.isVisible('#rl-teacher-section')));
    assert.strictEqual(await p.getAttribute('[data-ltr-type="appreciation"]', 'aria-selected'), 'true');
    const opts = await p.$$eval('#apc-student option', o => o.map(x => x.textContent));
    assert.deepStrictEqual(opts, ['Select Student (2)', 'Joshua Kumar — NILAI 3 - EA, NILAI 3 - EF', 'Raja — NILAI 3 - EF']);
    assert.strictEqual(await p.isDisabled('#apc-generate'), true);
    await p.fill('#apc-search', 'ra'); await p.fill('#apc-search', 'raj'); await p.waitForTimeout(100);
    assert.deepStrictEqual(calls.slice(n0).map(c => c[1]).filter(f => f !== 'getAppreciationLetterAudit'), ['getAppreciationCertificateStudents'], 'one list load; search is local');
    assert.strictEqual(await p.inputValue('#apc-name'), 'Raja');
    assert.strictEqual((await p.textContent('#apc-email')).trim(), 'raja_aps1234@avvaiyarpadasalai.org');
    assert.strictEqual(await p.$eval('#apc-email', e => e.tagName), 'DIV', 'email is display only');
    await p.fill('#apc-name', 'Raja Kumaran');
  });
  await t('word counter + button state: 4 ✗, 5 ✓, 16 ✗, 15 ✓', async () => {
    const W = n => Array.from({ length: n }, (_, i) => ['great', 'effort', 'and', 'kind', 'participation'][i % 5]).join(' ');
    for (const [n, ok] of [[4, false], [5, true], [16, false], [15, true]]) {
      await p.fill('#apc-message', W(n));
      assert.ok((await p.textContent('#apc-word-count')).startsWith(n + ' / 15 words'));
      assert.strictEqual(await p.isDisabled('#apc-generate'), !ok, n + ' words');
    }
    await p.fill('#apc-name', ''); assert.strictEqual(await p.isDisabled('#apc-generate'), true, 'empty name');
    await p.fill('#apc-name', 'Raja Kumaran');
  });
  await t('Generate: loading state, success message + toast, email to the roster address', async () => {
    await p.fill('#apc-message', 'Wonderful effort and kind participation every week');
    await p.click('#apc-generate');
    await p.waitForSelector('#apc-msg.success');
    assert.strictEqual((await p.textContent('#apc-msg')).trim(), 'APS Appreciation Certificate generated and emailed successfully to Raja Kumaran.');
    assert.ok(/emailed successfully/.test(await p.textContent('#toast')));
    assert.strictEqual(mails.length, 1); assert.strictEqual(mails[0].to, 'raja_aps1234@avvaiyarpadasalai.org');
    assert.strictEqual(mails[0].cc, TA + ',admin@avvaiyarpadasalai.org');
    assert.strictEqual(await p.inputValue('#apc-message'), '', 'message cleared');
    await p.fill('#apc-message', 'Wonderful effort and kind participation every week');
    await p.click('#apc-generate'); await p.waitForSelector('#apc-msg.error');
    assert.ok(/already being generated/.test(await p.textContent('#apc-msg')), 'server error shown');
    await p.$eval('#apc-section', e => e.scrollIntoView()); await (await p.$('#rl-view')).screenshot({ path: __dirname + '/letters_appreciation.png' });
    assert.deepStrictEqual(A.errors, []);
  });
  await t('teacher: student not in the list → type name + APS email; history shows who / when / entry', async () => {
    await p.check('#apc-manual');
    assert.ok(await p.isVisible('#apc-manual-email')); assert.ok(!(await p.isVisible('#apc-email'))); assert.strictEqual(await p.isDisabled('#apc-student'), true);
    assert.strictEqual(await p.inputValue('#apc-name'), '');
    await p.fill('#apc-name', 'Kavin Raj'); await p.fill('#apc-message', 'Excellent effort and wonderful participation this year');
    await p.fill('#apc-manual-email', 'not-an-email'); assert.strictEqual(await p.isDisabled('#apc-generate'), true);
    await p.fill('#apc-manual-email', 'outside@gmail.com'); await p.click('#apc-generate'); await p.waitForSelector('#apc-msg.error');
    assert.ok(/valid APS email address/.test(await p.textContent('#apc-msg')), 'server refuses a non-APS address');
    await p.fill('#apc-manual-email', 'kavin_aps4321@avvaiyarpadasalai.org'); await p.click('#apc-generate'); await p.waitForSelector('#apc-msg.success');
    assert.strictEqual(mails[mails.length - 1].to, 'kavin_aps4321@avvaiyarpadasalai.org');
    await p.waitForFunction(() => /Kavin Raj/.test(document.getElementById('ltr-history-body').textContent));
    const rows = await p.$$eval('#ltr-history-body tr', r => r.map(x => [...x.cells].map(c => c.textContent)));
    assert.ok(rows[0][2] === 'Kavin Raj' && rows[0][6] === 'Typed (manual)' && rows[0][7] === 'SENT' && /teachera_aps101/.test(rows[0][5]), JSON.stringify(rows[0]));
    assert.ok(rows.every(r => /teachera_aps101/.test(r[5])), 'teacher sees only their own letters');
    await p.uncheck('#apc-manual'); assert.strictEqual(await p.isDisabled('#apc-student'), false);
    await (await p.$('#rl-view')).screenshot({ path: __dirname + '/letters_manual_history.png' });
  });
  const M = await open(TA, 'teacher', { vp: { width: 390, height: 844 } });
  await t('mobile: Letters chooser + generator fit, no horizontal scroll', async () => {
    await M.page.evaluate(() => updateReferenceLetterTabVisibility());
    await M.page.click('#rl-tab'); await M.page.click('[data-ltr-type="appreciation"]'); await M.page.waitForTimeout(300);
    assert.ok(await M.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  });
  for (const [who, role] of [['admin@aps.org', 'admin'], ['hm@aps.org', 'headmaster']]) {
    const H = await open(who, role);
    await t(role + ': Letters tab = Student + Teacher Appreciation Letters; Nilai / Google Classroom filters; every class', async () => {
      const q = H.page; await q.evaluate(() => updateReferenceLetterTabVisibility());
      assert.ok(await q.isVisible('#rl-tab'));
      await q.click('#rl-tab'); await q.waitForTimeout(300);
      const btns = await q.$$eval('.ltr-type-btn', b => b.filter(x => x.offsetParent).map(x => x.getAttribute('data-ltr-type')));
      // r46: admin@ / hm@ are also Google Classroom co-teachers in the fixture, so they now count as Classroom teachers
      // (isClassroomTeacher) and get the Reference/Volunteer Letter card too.
      assert.deepStrictEqual(btns, ['reference', 'appreciation', 'teacherLetter']);
      await q.click('[data-ltr-type="teacherLetter"]'); await q.waitForTimeout(200);
      assert.ok(await q.isVisible('#tal-section')); assert.ok(!(await q.isVisible('#rl-teacher-section'))); assert.ok(!(await q.isVisible('#apc-section')));
      await q.waitForFunction(() => document.querySelectorAll('#tal-person option').length > 1);
      const opts = await q.$$eval('#tal-person option', o => o.map(x => x.textContent));
      assert.ok(opts.some(o => /^Teacher A — /.test(o)) && !opts.some(o => /Admin|Head Master|Tech Support/.test(o)), opts.slice(0, 5).join(' | '));
      // r42: Nilai filter
      const nil = await q.$$eval('#tal-filter option', o => o.map(x => x.textContent));
      assert.deepStrictEqual(nil.slice(0, 5), ['All Nilai', 'MUNMAZHALAI', 'MAZHALAI', 'NILAI 1', 'NILAI 2']);
      await q.selectOption('#tal-filter', 'MAZHALAI');
      const maz = await q.$$eval('#tal-person option', o => o.map(x => x.textContent));
      assert.deepStrictEqual(maz, ['Select Teacher (1)', 'Teacher B — MAZHALAI - CB, NILAI 4 - AB, NILAI 5 - AA, NILAI 8 - AB']);
      await q.selectOption('#tal-filter', '');
      await q.fill('#tal-search', 'Teacher A —'); await q.fill('#tal-search', 'teacher a');
      await q.selectOption('#tal-person', { label: opts.find(o => /^Teacher A — /.test(o)) });
      assert.strictEqual(await q.inputValue('#tal-name'), 'Teacher A');
      assert.strictEqual((await q.textContent('#tal-email')).trim(), TA);
      await q.fill('#tal-message', 'Thank you for' ); assert.strictEqual(await q.isDisabled('#tal-generate'), true);
      await q.fill('#tal-message', 'Thank you for your inspiring Tamil teaching ' + role);
      await q.click('#tal-generate'); await q.waitForSelector('#tal-msg.success');
      assert.strictEqual((await q.textContent('#tal-msg')).trim(), 'APS Teacher Appreciation Letter generated and emailed successfully to Teacher A.');
      const m = mails[mails.length - 1]; assert.strictEqual(m.to, TA); assert.strictEqual(m.cc, who + ',admin@avvaiyarpadasalai.org');
      if (role === 'admin') { await (await q.$('#rl-view')).screenshot({ path: __dirname + '/letters_teacher_letter.png' }); }
      // r42: Student Appreciation Letter for Admin / HM — every class, Google Classroom filter
      await q.click('[data-ltr-type="appreciation"]'); await q.waitForFunction(() => document.querySelectorAll('#apc-filter option').length > 100);
      assert.ok(await q.isVisible('#apc-section'));
      const all = await q.$$eval('#apc-student option', o => o.length - 1);
      assert.ok(all > 100, 'all students of all classes: ' + all);
      await q.selectOption('#apc-filter', ids.MAZ);
      assert.deepStrictEqual(await q.$$eval('#apc-student option', o => o.map(x => x.textContent)), ['Select Student (1)', 'Meena — MAZHALAI - CB']);
      await q.selectOption('#apc-student', { index: 1 });
      await q.fill('#apc-message', 'Wonderful effort and kind participation ' + role);
      await q.click('#apc-generate'); await q.waitForSelector('#apc-msg.success');
      const mm = mails[mails.length - 1]; assert.strictEqual(mm.to, 'meena_aps5555@avvaiyarpadasalai.org'); assert.strictEqual(mm.cc, who + ',admin@avvaiyarpadasalai.org');
      if (role === 'headmaster') await (await q.$('#rl-view')).screenshot({ path: __dirname + '/letters_hm_student.png' });
      await q.click('[data-ltr-type="teacherLetter"]');
      assert.deepStrictEqual(H.errors, []);
    });
  }
  const S = await open('joshua_aps3407@avvaiyarpadasalai.org', 'student');
  await t('student: no Letters tab', async () => { await S.page.evaluate(() => updateReferenceLetterTabVisibility()); assert.ok(!(await S.page.isVisible('#rl-tab'))); });
  await browser.close();
  console.log('ALL ' + passed + ' LETTERS UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

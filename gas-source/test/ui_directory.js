// Browser test: r51 Active Directory — Directory Search + Student Onboarding Status sub-tab (node test/ui_directory.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { build } = require('./gradingfixture');
const F = build(); const { env, cls, ids, tok, J, G } = F;
const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0);
P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p;
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
  async function open(email, role, o) {
    o = o || {};
    const ctx = await browser.newContext({ viewport: o.vp || { width: 1366, height: 1000 }, permissions: o.noClipboard ? [] : ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const token = tok(email, role);
    await page.exposeFunction('__gas', async (fn, args) => { try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
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


  const count = p => p.evaluate(() => { const o = window.__gas; window.__gasN = 0; window.__gas = (...a) => { window.__gasN++; return o(...a); }; });
  const search = async (p, q) => { await p.fill('#adSearch', q); await p.waitForTimeout(350); };
  const cards = p => p.$$eval('.ad-person', els => els.map(e => ({ kind: e.getAttribute('data-ad-kind'), email: e.getAttribute('data-ad-email'), text: e.textContent })));
  const A = await open('admin@aps.org', 'admin'); const p = A.page;

  await t('main tab is now "Active Directory" with two sub-tabs; opens on Directory Search; nobody listed by default', async () => {
    assert.strictEqual((await p.textContent('#tabOnboarding')).trim(), 'Active Directory');
    await p.click('#tabOnboarding');
    assert.strictEqual(await p.isVisible('#directoryView'), true);
    assert.strictEqual(await p.isVisible('#onboardingView'), false);
    assert.deepStrictEqual(await p.$$eval('#adSubTabs [role=tab]', b => b.map(x => [x.textContent.trim(), x.getAttribute('aria-selected')])), [['🔎 Directory Search', 'true'], ['🎓 Student Onboarding Status', 'false']]);
    assert.deepStrictEqual(await p.$$eval('.view-tab.active', b => b.map(x => x.id)), ['tabOnboarding']);
    assert.strictEqual((await cards(p)).length, 0, 'no default listing');
    assert.ok(/Type at least 2 characters/.test(await p.textContent('#adResults')));
    await p.waitForFunction(() => /in all 116 AY26-27 classes/.test(document.getElementById('adMeta').textContent));
  });
  await t('search by name / APSID (with or without APS) / email — only matches; Student vs Teacher clearly labelled; zero server calls', async () => {
    await count(p);
    await search(p, 'meena');
    let c = await cards(p);
    assert.ok(c.length >= 1 && c.every(x => /meena/i.test(x.text)), JSON.stringify(c.map(x => x.email)));
    const m = c.find(x => x.email === 'meena_aps5555@avvaiyarpadasalai.org');
    assert.ok(m && m.kind === 'student' && /🎒 STUDENT/.test(m.text) && /APSIDAPS5555/.test(m.text.replace(/\s+/g, '')) && /APS Email/.test(m.text) && /Google Classroom/.test(m.text), m && m.text);
    await search(p, 'APS5555'); c = await cards(p); assert.deepStrictEqual(c.map(x => x.email), ['meena_aps5555@avvaiyarpadasalai.org']);
    await search(p, '5555'); c = await cards(p); assert.strictEqual(c[0].email, 'meena_aps5555@avvaiyarpadasalai.org', 'digits only');
    await search(p, 'teacherb_aps102@avvaiyarpadasalai.org'); c = await cards(p);
    assert.strictEqual(c.length, 1); assert.strictEqual(c[0].kind, 'teacher'); assert.ok(/🧑‍🏫 TEACHER/.test(c[0].text));
    const classes = await p.$$eval('.ad-person .ad-class', e => e.map(x => x.textContent));
    assert.ok(classes.length >= 1 && classes.every(x => /AY26-27/.test(x)), 'current Google Classroom name(s): ' + classes.join(' | '));
    assert.ok(await p.$('mark.ad-hit'), 'match highlighted');
    assert.strictEqual(await p.evaluate(() => window.__gasN), 0, 'search is local — no server call');
  });
  await t('filters: Students / Teachers chips, grade; no-match message; Esc / Clear reset', async () => {
    await search(p, 'aps'); const m0 = await p.textContent('#adMeta');
    const mm = m0.match(/\((\d+) students?, (\d+) teachers?\)/); assert.ok(mm && +mm[1] > 0 && +mm[2] > 0, m0);
    await p.click('[data-ad-type="teacher"]'); let c = await cards(p); assert.ok(c.length && c.every(x => x.kind === 'teacher'));
    await p.click('[data-ad-type="student"]'); c = await cards(p); assert.ok(c.length && c.every(x => x.kind === 'student'));
    const g = await p.$$eval('#adGrade option', o => o.map(x => x.value).filter(Boolean)); assert.ok(g.length > 1, g.join(','));
    await p.selectOption('#adGrade', g[0]); await p.waitForTimeout(100);
    const shown = await cards(p); assert.ok(shown.length <= c.length);
    await search(p, 'zzzz-nobody'); assert.ok(/No student or teacher matches/.test(await p.textContent('#adResults')));
    await p.click('#adClear'); assert.strictEqual(await p.inputValue('#adSearch'), ''); assert.strictEqual((await cards(p)).length, 0);
    assert.strictEqual(await p.getAttribute('[data-ad-type="all"]', 'aria-pressed'), 'true');
    await search(p, 'meena'); await p.press('#adSearch', 'Escape'); assert.strictEqual((await cards(p)).length, 0);
  });
  await t('copy email button; large result sets are paged (first 60, "Show more")', async () => {
    await search(p, '@avvaiyarpadasalai.org');
    const n = (await cards(p)).length; const total = Number((await p.textContent('#adMeta')).match(/^(\d+) match/)[1]);
    assert.strictEqual(n, Math.min(60, total));
    if (total > 60) { await p.click('#adMore'); await p.waitForTimeout(100); assert.strictEqual((await cards(p)).length, Math.min(120, total)); }
    await p.click('.ad-copy'); await p.waitForTimeout(150);
    assert.ok(/Copied/.test(await p.textContent('#toast')));
  });
  await t('Student Onboarding Status sub-tab still works exactly as before', async () => {
    await p.click('#subTabOnboarding');
    assert.strictEqual(await p.isVisible('#onboardingView'), true); assert.strictEqual(await p.isVisible('#directoryView'), false);
    assert.deepStrictEqual(await p.$$eval('.view-tab.active', b => b.map(x => x.id)), ['tabOnboarding'], 'main tab stays active');
    await p.waitForFunction(() => document.querySelectorAll('#onboardingView tbody tr').length > 3);
    assert.ok(await p.isVisible('#onboardingGradeFilter') && await p.isVisible('#onboardingStudentSearch'));
    await p.click('#subTabDirectory'); assert.strictEqual(await p.isVisible('#directoryView'), true);
    await p.click('#tabClasses'); assert.strictEqual(await p.isVisible('#adSubTabs'), false, 'sub-tabs only under Active Directory');
    assert.deepStrictEqual(A.errors, []);
    await p.click('#tabOnboarding'); await search(p, 'teacher');
    await p.screenshot({ path: __dirname + '/directory_admin.png', fullPage: false });
  });
  await t('r57: a student finds students and teachers in EVERY class — name, grade, class, class teacher only; teachers keep their APS email', async () => {
    const STU = 'joshua_aps3407@avvaiyarpadasalai.org';
    const S = await open(STU, 'student'); const q = S.page;
    await q.click('#tabOnboarding');
    await q.waitForFunction(() => /in all 116 AY26-27 classes/.test(document.getElementById('adMeta').textContent));
    const mine = new Set(); S.data.courses.forEach(c => (c.teachers || []).concat(c.students || []).forEach(x => mine.add(String(x.email).toLowerCase())));
    assert.ok(!mine.has('meena_aps5555@avvaiyarpadasalai.org'), 'Meena is in another class');
    await search(q, 'meena'); const c = await cards(q);
    const m = c.find(x => /Meena/.test(x.text) && x.kind === 'student');
    assert.ok(m, 'student from another grade is found');
    const flat = m.text.replace(/\s+/g, ' ');
    assert.ok(/Grade \/ Nilai/.test(flat) && /ClassMAZHALAI/.test(flat) && /Class Teacher/.test(flat), flat);
    assert.ok(!/APS5555|meena_aps5555|APS Email|APSID|NOT ONBOARDED|Last login/.test(flat), 'no private student details: ' + flat);
    assert.strictEqual(await q.$$eval('.ad-person .ad-dot', e => e.length), 0, 'no online status');
    assert.strictEqual(await q.$$eval('.ad-person a.ad-class', e => e.length), 0, 'no Classroom link to someone else\'s class');
    await search(q, 'teacherb_aps102@avvaiyarpadasalai.org');
    const tc = await cards(q); assert.ok(tc.length === 1 && tc[0].kind === 'teacher' && /APS Email/.test(tc[0].text), 'teacher found by APS email, email shown');
    await search(q, 'joshua'); const self = (await cards(q))[0]; assert.ok(/APS Email/.test(self.text), 'own entry shows own email');
    // the server never sends other students' private fields to a student
    const raw = JSON.stringify(G.getDirectoryIndex(tok(STU, 'student')));
    assert.ok(!raw.includes('meena_aps5555') && !raw.includes('APS5555') && !/lastLoginDisplay|onboarded|"online"/.test(raw), 'payload is privacy-safe');
    assert.ok(raw.includes('teacherb_aps102@avvaiyarpadasalai.org'), 'teacher emails are included');
    await q.setViewportSize({ width: 390, height: 844 }); await search(q, 'teacher');
    assert.ok(await q.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), 'no horizontal scroll on phones');
    await q.screenshot({ path: __dirname + '/directory_student_phone.png', fullPage: false });
    assert.deepStrictEqual(S.errors, []);
  });
  await t('r57: a teacher sees full details (APSID, APS email, onboarding) for students in other classes too', async () => {
    const T = await open('teacherb_aps102@avvaiyarpadasalai.org', 'teacher'); const q = T.page;
    await q.click('#tabOnboarding');
    await q.waitForFunction(() => /in all 116 AY26-27 classes/.test(document.getElementById('adMeta').textContent));
    await search(q, 'joshua');
    const c = (await cards(q)).find(x => x.kind === 'student');
    assert.ok(c && /APSID/.test(c.text) && /APS Email/.test(c.text) && /Class Teacher/.test(c.text), c && c.text);
    assert.deepStrictEqual(T.errors, []);
  });
  await t('r57: Access Control can turn Directory Search off for students (server refuses too)', async () => {
    G.saveAccessControl(tok('admin@aps.org', 'admin'), [{ role: 'student', key: 'directory.search', visible: false }]);
    assert.throws(() => G.getDirectoryIndex(tok('joshua_aps3407@avvaiyarpadasalai.org', 'student')), /ACCESS_OFF/);
    G.saveAccessControl(tok('admin@aps.org', 'admin'), [{ role: 'student', key: 'directory.search', visible: true }]);
    assert.ok(G.getDirectoryIndex(tok('joshua_aps3407@avvaiyarpadasalai.org', 'student')).classes.length === 116);
  });
  await browser.close();
  console.log('\nALL ' + passed + ' ACTIVE DIRECTORY UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

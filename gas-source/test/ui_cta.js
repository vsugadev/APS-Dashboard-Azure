// Browser (Chromium) test: Teacher Availability tab — Teacher form, Admin/HM/BOD report, Student hidden, mobile.
const fs = require('fs'); const assert = require('assert'); const vm = require('vm');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { build } = require('./gradingfixture');
const { env, cls, tok, J, G } = build();
env.ctx.__courses = cls.courses.filter(c => /AY26-27$/.test(c.name)).map(c => ({ id: c.id, name: c.name, section: '',
  teachers: (cls.teachers[c.id] || []).filter(x => !/tech support/i.test(x.profile.name.fullName)).map(x => ({ name: x.profile.name.fullName, email: x.profile.emailAddress })), students: [] }));
vm.runInContext('readAllCoursesFromCache_ = function () { return JSON.parse(JSON.stringify(__courses)); };', env.ctx);
G.submitClassTeacherAvailability(tok('teacherb_aps102@avvaiyarpadasalai.org', 'teacher'), { status: 'confirmed', nilai: ['NILAI 4', 'MAZHALAI'], times: ['SUN 7:30 - 9:00 PM EST'] });

(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  async function open(role, email, viewport) {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1366, height: 1000 } }); const page = await ctx.newPage();
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
      updateAttendanceTabVisibility(); updateExaminationTabVisibility(); updateTeacherAvailTabVisibility();
    }, { role, email, p });
    return { ctx, page, errors };
  }
  const visible = (p, sel) => p.$eval(sel, e => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length)).catch(() => false);
  const go = async p => { await p.click('#tabTeacherAvail'); await p.waitForFunction(() => document.getElementById('ctaLoading').hidden); };

  const T = await open('teacher', 'teachera_aps101@avvaiyarpadasalai.org');
  await t('Teacher: own form (AY, name/APSID/email, classrooms, Nilai + time checkboxes from config), no report', async () => {
    const p = T.page;
    await go(p);
    assert.strictEqual(await visible(p, '#ctaFormCard'), true); assert.strictEqual(await visible(p, '#ctaReportCard'), false);
    assert.strictEqual(await p.textContent('#ctaAy'), 'AY26-27');
    assert.ok((await p.textContent('#ctaMe')).includes('Teacher A (APS101)'));
    assert.ok((await p.textContent('#ctaMyClasses')).includes('NILAI 3 - EF'));
    assert.strictEqual(await p.$$eval('#ctaNilai input', e => e.length), 11);
    assert.deepStrictEqual(await p.$$eval('#ctaTimes input', e => e.map(x => x.value)), ['FRI 6:30 - 8:00 PM EST', 'FRI 7:30 - 9:00 PM EST', 'FRI 9:00 - 10:30 PM EST', 'SAT 12:00 - 1:30 PM EST', 'SUN 7:30 - 9:00 PM EST']);
    assert.strictEqual(await p.textContent('#ctaFormMeta'), 'Not submitted yet for this week.');
    await p.check('#ctaStatus input[value="confirmed"]');
    await p.click('#ctaSubmitBtn');
    await p.waitForFunction(() => /Nilai and one available time/.test(document.getElementById('toast').textContent));
    await p.check('#ctaNilai input[value="NILAI 3"]'); await p.check('#ctaTimes input[value="FRI 6:30 - 8:00 PM EST"]');
    await p.click('#ctaSubmitBtn');
    await p.waitForFunction(() => /^Last updated \d\d\/\d\d\/\d{4}/.test(document.getElementById('ctaFormMeta').textContent));
    await p.check('#ctaStatus input[value="not_available"]');
    assert.strictEqual(await p.$eval('#ctaNilaiFs', e => e.disabled), true, 'Not Available greys out Nilai/time');
    assert.strictEqual(await visible(p, '#ctaTestBtn'), false);
    await p.screenshot({ path: __dirname + '/cta_teacher.png', fullPage: true });
    assert.deepStrictEqual(T.errors, []);
  });

  const A = await open('admin', 'admin@aps.org');
  await t('Admin: report tiles, complete list with Not Assigned / NOT SUBMITTED, filters auto-refresh, views, test email', async () => {
    const p = A.page;
    await go(p);
    assert.strictEqual(await visible(p, '#ctaFormCard'), false); assert.strictEqual(await visible(p, '#ctaReportCard'), true);
    assert.ok(/Tuesday – Friday at 6:00 PM EST to teachers@avvaiyarpadasalai\.org \(CC admin@avvaiyarpadasalai\.org\) from attendance@avvaiyarpadasalai\.org\./.test(await p.textContent('#ctaSchedNote')), await p.textContent('#ctaSchedNote')); // r53
    // Default view: upcoming-week grade-level status + follow-up tabs.
    assert.ok(/^Upcoming Week: Oct|Upcoming Week: \w{3} \d+ - \w{3} \d+, \d{4} · AY26-27/.test(await p.textContent('.cta-week')), await p.textContent('.cta-week'));
    const big = await p.$$eval('#ctaTiles .cta-big', els => els.map(e => e.querySelector('span').textContent + '=' + e.querySelector('b').textContent));
    assert.strictEqual(big.length, 4); assert.ok(big[0].startsWith('Total Classes=') && big[3].startsWith('Availability Not Set='), big.join());
    const sum = big.slice(1).reduce((n, x) => n + Number(x.split('=')[1]), 0);
    assert.strictEqual(sum, Number(big[0].split('=')[1]), 'Available + Not Available + Not Set = Total Classes');
    assert.deepStrictEqual(await p.$$eval('#ctaPane table:first-of-type thead th', e => e.map(x => x.textContent)), ['Nilai', 'Total Classes', 'Teacher Available to Take Class', 'Teacher Not Available to Take Class (this week)', 'Teacher Not Set']);
    assert.ok(/Not Available to Take Class \(\d+\)/.test(await p.textContent('#ctaPane .cta-fu')) && /Availability Not Set \(\d+\)/.test(await p.textContent('#ctaPane .cta-fu')));
    await p.click('#ctaPane [data-cta-fu="ns"]');
    assert.ok(/have not responded yet/.test(await p.textContent('#ctaPane')) && !/Not Available to Take Classes •/.test(await p.textContent('#ctaPane table:last-of-type')));
    await p.selectOption('#ctaNilaiFilter', 'NILAI 3');
    const fr = await p.$$eval('#ctaPane table:first-of-type tbody tr td:first-child', e => e.map(x => x.querySelector('b').textContent.trim())); assert.deepStrictEqual(fr, ['NILAI 3', 'Total'], 'Nilai filter auto-refreshes the grade view: ' + fr);
    await p.click('#ctaClearBtn');
    await p.click('.cta-big[data-cta-fu="na"]');
    assert.strictEqual(await p.$eval('#ctaPane [data-cta-fu="na"]', e => e.classList.contains('primary')), true, 'red card opens the Not Available list');
    await p.click('[data-cta-view="list"]');
    await p.click('.cta-more summary');
    const tiles = await p.$$eval('#ctaTiles .cta-tile', els => els.map(e => e.querySelector('span').textContent + '=' + e.querySelector('b').textContent));
    assert.ok(tiles.includes('Submitted=2') && tiles.includes('Available=2'), tiles.join());
    const heads = await p.$$eval('#ctaPane thead th', e => e.map(x => x.textContent));
    assert.deepStrictEqual(heads, ['#', 'Teacher Name', 'APS Email', 'Google Classroom – Class Teacher Availability (This Week)', 'Nilai', 'Available Time', 'Status']);
    assert.ok(/⚪ Not Set/.test(await p.textContent('#ctaPane')) && (await p.$$('#ctaPane .avail-status-badge')).length > 0, 'class-card badge per classroom');
    const tx = await p.textContent('#ctaPane');
    assert.ok(tx.includes('NOT SUBMITTED') && tx.includes('Not Selected') && tx.includes('AVAILABLE'));
    await p.selectOption('#ctaStatusFilter', 'AVAILABLE');
    assert.strictEqual(await p.$$eval('#ctaPane tbody tr', e => e.length), 2);
    assert.ok((await p.textContent('#ctaPane')).includes('Teacher B'));
    await p.click('#ctaClearBtn');
    await p.fill('#ctaSearch', 'teacher x10');
    assert.ok(/Showing \d+ of \d+ teachers/.test(await p.textContent('#ctaCount')));
    await p.click('#ctaClearBtn');
    await p.click('[data-cta-view="nilai"]');
    const nilaiTx = await p.textContent('#ctaPane');
    assert.ok(nilaiTx.includes('MAZHALAI') && nilaiTx.includes('Teacher B') && nilaiTx.includes('No teacher available'));
    await p.click('[data-cta-view="time"]');
    assert.ok((await p.textContent('#ctaPane')).includes('SUN 7:30 - 9:00 PM EST'));
    await p.click('[data-cta-view="list"]');
    await p.click('.cta-tile[data-cta-st="NOT SUBMITTED"]');
    assert.strictEqual(await p.$eval('#ctaStatusFilter', e => e.value), 'NOT SUBMITTED');
    assert.strictEqual(await visible(p, '#ctaTestBtn'), true);
    const before = env.stats.mails.length;
    await p.click('#ctaTestBtn');
    await p.waitForFunction(() => /Test email sent to admin@aps.org/.test(document.getElementById('toast').textContent));
    assert.strictEqual(env.stats.mails.length, before + 1);
    assert.ok(/^\[TEST\]/.test(env.stats.mails[before].subject));
    await p.click('.aps-help-btn >> visible=true');
    assert.ok(/Teacher Availability/.test(await p.textContent('#apsHelpTitle')));
    assert.ok(env.stats.mails[before].htmlBody.includes('Open APS Dashboard') && !env.stats.mails[before].htmlBody.includes('Time-wise'));
    await p.keyboard.press('Escape');
    await p.screenshot({ path: __dirname + '/cta_admin.png', fullPage: true });
    assert.deepStrictEqual(A.errors, []);
  });

  const H = await open('headmaster', 'hm@aps.org');
  await t('Teacher Availability Report is a sub-tab of Classes (no top-level tab)', async () => {
    const p = A.page;
    assert.strictEqual(await p.$('.view-tabs #tabTeacherAvail'), null, 'not in the main tab bar');
    assert.strictEqual((await p.textContent('#tabTeacherAvail')).trim(), '🧑‍🏫 Teacher Availability Report');
    assert.strictEqual(await p.$eval('#tabClasses', e => e.classList.contains('active')), true, 'Classes stays highlighted');
    assert.strictEqual(await p.$eval('#tabTeacherAvail', e => e.getAttribute('aria-selected')), 'true');
    await p.click('#subTabClasses');
    assert.strictEqual(await visible(p, '#classesView'), true); assert.strictEqual(await visible(p, '#ctaView'), false);
    await p.click('#tabAttendance');
    assert.strictEqual(await visible(p, '#classesSubTabs'), false, 'sub-tabs only on Classes');
    await p.click('#tabClasses');
    assert.strictEqual(await visible(p, '#classesSubTabs'), true);
    await p.click('#tabTeacherAvail'); await p.waitForFunction(() => document.getElementById('ctaLoading').hidden);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: __dirname + '/cta_subtab_admin.png' });
  });
  await t('HM: report, no test button', async () => {
    await go(H.page);
    assert.strictEqual(await visible(H.page, '#ctaReportCard'), true); assert.strictEqual(await visible(H.page, '#ctaTestBtn'), false);
  });
  const B = await open('vcfo_amchsts_bod', 'bod@aps.org');
  await t('BOD: read-only report, no form, no test button', async () => {
    await go(B.page);
    assert.strictEqual(await visible(B.page, '#ctaReportCard'), true); assert.strictEqual(await visible(B.page, '#ctaFormCard'), false); assert.strictEqual(await visible(B.page, '#ctaTestBtn'), false);
  });
  const S = await open('student', 'joshua_aps3407@avvaiyarpadasalai.org');
  await t('Student: sub-tab hidden', async () => { assert.strictEqual(await visible(S.page, '#classesSubTabs'), false); assert.strictEqual(await visible(S.page, '#tabTeacherAvail'), false); });
  const M = await open('teacher', 'teacherb_aps102@avvaiyarpadasalai.org', { width: 390, height: 844 });
  await t('Teacher mobile: saved answer pre-filled, no horizontal page scroll', async () => {
    const p = M.page;
    await go(p);
    assert.strictEqual(await p.$eval('#ctaStatus input[value="confirmed"]', e => e.checked), true);
    assert.deepStrictEqual(await p.$$eval('#ctaNilai input:checked', e => e.map(x => x.value)), ['MAZHALAI', 'NILAI 4']);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll');
    await p.screenshot({ path: __dirname + '/cta_teacher_mobile.png', fullPage: true });
  });
  const AM = await open('admin', 'admin@aps.org', { width: 390, height: 844 });
  await t('Admin mobile: summary cards + grade view, no horizontal page scroll', async () => {
    const p = AM.page;
    await go(p);
    assert.strictEqual((await p.$$('#ctaTiles .cta-big')).length, 4);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal page scroll');
    await p.screenshot({ path: __dirname + '/cta_admin_mobile.png', fullPage: true });
  });
  await browser.close();
  console.log(passed + ' passed');
})().catch(e => { console.error(e); process.exit(1); });

// Browser test: r79 🎓 சிறப்பு வகுப்புகள் (Special Classes) (node test/ui_special.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { setup, D } = require('./coveragefixture');
const F = setup(); const { tok, J, G } = F;
const day = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); };
const A = F.tok2.admin;
const base = o => Object.assign({ title: 'பண்ணிசை சிறப்பு வகுப்புகள்', description: 'தமிழர் இசை மரபின் தனிப்பெரும் அடையாளமான பண்ணிசையை நம் குழந்தைகளுக்குக் கற்றுக்கொடுப்போம்!. தொன்மையும் இனிமையும் நிறைந்த தமிழிசையைக் கற்க, கல்வியாண்டு 2026–27க்கான மாணவர் சேர்க்கை தொடங்கியுள்ளது.',
  audience: 'STUDENTS_ONLY', mode: 'GOOGLE_CLASSROOM_MEET', programStart: day(8), programEnd: day(60), enrollStart: day(-5), enrollEnd: day(5), fees: 'Free for APS Students', startTime: '10:00', endTime: '11:30', classDay: 'Saturday', link: 'https://forms.gle/abc123', status: 'ACTIVE' }, o || {});
const pann = G.saveSpecialClass(A, base()).savedId;
G.saveSpecialClass(A, base({ title: 'ஆசிரியர் பயிற்சி — தமிழ் இலக்கணமும் எழுத்துப்பிழையும்', audience: 'TEACHERS_ONLY', mode: 'ZOOM', link: 'https://zoom.us/j/1', description: 'Teacher training' }));
G.saveSpecialClass(A, base({ title: 'Kolam workshop', enrollStart: day(4), enrollEnd: day(9), description: 'Opens soon', link: 'https://x.example/k' }));
const past = G.saveSpecialClass(A, base({ title: 'Summer Thirukkural camp', programStart: day(-60), programEnd: day(-3), enrollStart: day(-90), enrollEnd: day(-61), description: 'Done', classLink: 'https://zoom.us/j/22' })).savedId;
G.addSpecialClassEnrollments(A, pann, { people: 'sa0_aps6650' + D, status: 'ENROLLED', payment: 'PAID' });
G.addSpecialClassEnrollments(A, past, { people: 'sa0_aps6650' + D });
(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  async function open(email, role, vp) {
    const ctx = await browser.newContext({ viewport: vp || { width: 1366, height: 1000 } }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const token = tok(email, role);
    await page.exposeFunction('__gas', async (fn, args) => { try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; window.confirm = () => true; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses; apsAccessGranted = true;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); apsApplyTabAccess_(); updateMeetPreviewTabVisibility(); }, { data, token });
    await page.waitForTimeout(250);
    return { page, errors, ctx };
  }
  const clean = p => p.evaluate(() => { document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'); document.activeElement && document.activeElement.blur(); });
  await t('student: 🎓 tab; ⭐ My Special Classes (upcoming + past); student programs only; states; Register Now opens in a new tab; details modal; no admin controls', async () => {
    const S = await open('sa0_aps6650' + D, 'student'); const p = S.page;
    assert.ok(/🎓 சிறப்பு வகுப்புகள்/.test(await p.textContent('#tabSpecialClasses')));
    await p.click('#tabSpecialClasses'); await p.waitForFunction(() => document.querySelectorAll('#scList .sc-card').length >= 2);
    assert.strictEqual(await p.isVisible('#scSubTabs'), false, 'no Manage for students'); assert.strictEqual(await p.isVisible('#scAdd'), false);
    const mine = await p.textContent('#scMine'); assert.ok(/My Special Classes/.test(mine) && /Upcoming \(1\)/.test(mine) && /Past \(1\)/.test(mine) && /Summer Thirukkural camp/.test(mine) && /✅ Enrolled/.test(mine), mine);
    const titles = await p.$$eval('#scList .sc-card h3', h => h.map(x => x.textContent));
    assert.deepStrictEqual(titles, ['பண்ணிசை சிறப்பு வகுப்புகள்', 'Kolam workshop'], 'teacher training hidden; completed hidden; Open first');
    const card = await p.$eval('#scList .sc-card', c => c.textContent);
    ['🟢 Registration Open', 'Students Only', 'Google Classroom - Google Meet', 'Saturday 10:00 AM – 11:30 AM ET', 'Free for APS Students', 'Register Now'].forEach(x => assert.ok(card.includes(x), x));
    const a = await p.$eval('#scList .sc-card a.sc-reg', a => ({ href: a.href, target: a.target, rel: a.rel })); assert.deepStrictEqual(a, { href: 'https://forms.gle/abc123', target: '_blank', rel: 'noopener noreferrer' });
    const k = await p.$$eval('#scList .sc-card', c => c[1].textContent); assert.ok(/🕐 Registration Opens/.test(k) && !/Register Now/.test(k));
    assert.ok(!/undefined|null/.test(await p.textContent('#scView')));
    await clean(p); await p.setViewportSize({ width: 1366, height: 1500 }); await p.screenshot({ path: __dirname + '/r79_special_student.png', fullPage: false });
    await p.click('#scList [data-sc-detail]'); await p.waitForSelector('#scDetailModal.open');
    assert.ok(/தொன்மையும் இனிமையும்/.test(await p.textContent('#scDetailBody')));
    await p.screenshot({ path: __dirname + '/r79_special_detail.png' });
    await p.click('#scDetailClose');
    assert.deepStrictEqual(S.errors, []); await S.ctx.close();
  });
  await t('teacher: no tab while Access Control is off (and switching to the view falls back); after Admin switches it on — teacher programs only', async () => {
    let T = await open('kavitha_aps8130' + D, 'teacher');
    assert.strictEqual(await T.page.isVisible('#tabSpecialClasses'), false);
    await T.page.evaluate(() => switchView('specialClasses')); assert.strictEqual(await T.page.evaluate(() => currentView), 'classes'); await T.ctx.close();
    G.saveAccessControl(A, [{ role: 'teacher', key: 'specialClasses', visible: true }]);
    T = await open('kavitha_aps8130' + D, 'teacher'); const p = T.page;
    await p.click('#tabSpecialClasses'); await p.waitForFunction(() => document.querySelectorAll('#scList .sc-card').length >= 1);
    assert.deepStrictEqual(await p.$$eval('#scList .sc-card h3', h => h.map(x => x.textContent)), ['ஆசிரியர் பயிற்சி — தமிழ் இலக்கணமும் எழுத்துப்பிழையும்']);
    assert.ok(/Zoom Meeting/.test(await p.textContent('#scList')));
    assert.deepStrictEqual(T.errors, []); await T.ctx.close();
    G.saveAccessControl(A, [{ role: 'teacher', key: 'specialClasses', visible: false }]);
  });
  await t('admin: Manage — table, filters, ＋ Add (validation then save), Edit, Preview, Deactivate, Enrollments, settings', async () => {
    const H = await open('admin@aps.org', 'admin'); const p = H.page;
    await p.click('#tabSpecialClasses'); await p.waitForFunction(() => document.querySelectorAll('#scList .sc-card').length >= 3);
    assert.strictEqual(await p.isVisible('#scSubTabs'), true);
    await p.click('#scTabManage'); await p.waitForFunction(() => document.querySelectorAll('#scMTable tbody tr').length === 4);
    await p.click('[data-scf="COMPLETED"]'); assert.strictEqual((await p.$$('#scMTable tbody tr')).length, 1); await p.click('[data-scf=""]');
    await p.click('#scAdd'); await p.waitForSelector('#scFormModal.open');
    await p.click('#scfSave'); assert.ok(/Title is required/.test(await p.textContent('#scFormErr')));
    await p.fill('#scfTitle', 'Bharatanatyam basics'); await p.fill('#scfDesc', 'Line one\nLine two');
    await p.selectOption('#scfAudience', 'ALL'); await p.selectOption('#scfMode', 'OTHER'); assert.strictEqual(await p.isVisible('#scfModeDetails'), true);
    await p.fill('#scfModeDetails', 'In-person / Community Center'); await p.fill('#scfLink', 'javascript:alert(1)');
    await p.fill('#scfEStart', day(-1)); await p.fill('#scfEEnd', day(6)); await p.fill('#scfPStart', day(10)); await p.fill('#scfPEnd', day(40));
    await p.click('#scfSave'); await p.waitForFunction(() => /Registration Link must be/.test(document.getElementById('scFormErr').textContent));
    await p.fill('#scfLink', 'https://example.org/register');
    await p.click('#scfMore summary'); await p.fill('#scfIcon', '💃'); await p.fill('#scfSeats', '25'); await p.click('#scfAddOpt'); await p.fill('#scfOptions [data-o=label]', 'Sunday batch');
    await clean(p); await p.screenshot({ path: __dirname + '/r79_special_form.png' });
    await p.click('#scfSave'); await p.waitForFunction(() => !document.getElementById('scFormModal').classList.contains('open'));
    await p.waitForFunction(() => document.querySelectorAll('#scMTable tbody tr').length === 5);
    assert.ok(/Bharatanatyam basics/.test(await p.textContent('#scMTable')));
    const row = await p.$$eval('#scMTable tbody tr', r => r.map(x => x.textContent).find(x => /Bharatanatyam/.test(x))); assert.ok(/All/.test(row) && /Others/.test(row) && /0 \/ 25/.test(row), row);
    // edit
    const newId = J(G.getSpecialClassesAdmin(A)).rows.find(r => r.title === 'Bharatanatyam basics').id;
    await p.click(`[data-sc-act="edit"][data-id="${newId}"]`); await p.waitForSelector('#scFormModal.open');
    assert.strictEqual(await p.inputValue('#scfModeDetails'), 'In-person / Community Center'); assert.strictEqual(await p.inputValue('#scfOptions [data-o=label]'), 'Sunday batch');
    await p.fill('#scfFees', '$25'); await p.click('#scfSave'); await p.waitForFunction(() => !document.getElementById('scFormModal').classList.contains('open'));
    assert.strictEqual(J(G.getSpecialClassesAdmin(A)).rows.find(r => r.id === newId).fees, '$25');
    // preview + enrollments
    await p.click(`[data-sc-act="preview"][data-id="${newId}"]`); await p.waitForSelector('#scDetailModal.open'); assert.ok(/Preview/.test(await p.textContent('#scDetailBody')) && /💃/.test(await p.textContent('#scDetailBody'))); await p.click('#scDetailClose');
    await p.click(`[data-sc-act="enr"][data-id="${newId}"]`); await p.waitForSelector('#scEnrModal.open');
    await p.fill('#scEnrPeople', 'APS6651\nsb0_aps6660' + D); await p.selectOption('#scEnrOption', 'Sunday batch'); await p.click('#scEnrAdd');
    await p.waitForFunction(() => document.querySelectorAll('#scEnrTable tbody select[data-f=status]').length >= 1);
    assert.ok(/APS6651/.test(await p.textContent('#scEnrTable')));
    await clean(p); await p.screenshot({ path: __dirname + '/r79_special_enrollments.png' });
    await p.selectOption('#scEnrTable tbody select[data-f=payment]', 'PAID'); await p.waitForTimeout(400);
    assert.ok(J(G.getSpecialClassEnrollments(A, newId)).rows.some(r => r.payment === 'PAID'));
    await p.click('#scEnrClose');
    // deactivate
    await p.click(`[data-sc-act="toggle"][data-id="${newId}"]`); await p.waitForTimeout(400);
    assert.strictEqual(J(G.getSpecialClassesAdmin(A)).rows.find(r => r.id === newId).status, 'INACTIVE');
    // settings
    await p.click('#scSettings summary'); await p.fill('#scSetIntro', 'APS special programs for 2026–27'); await p.click('#scSetSave'); await p.waitForTimeout(400);
    assert.strictEqual(await p.textContent('#scIntro'), 'APS special programs for 2026–27');
    await clean(p); await p.setViewportSize({ width: 1366, height: 1600 }); await p.screenshot({ path: __dirname + '/r79_special_manage.png', fullPage: false });
    assert.deepStrictEqual(H.errors, []); await H.ctx.close();
  });
  await t('phone + tablet: cards wrap, Tamil not cut, no sideways scroll; unavailable sheet → friendly message', async () => {
    for (const vp of [{ width: 390, height: 844 }, { width: 820, height: 1100 }]) {
      const S = await open('sa0_aps6650' + D, 'student', vp); const p = S.page;
      await p.click('#tabSpecialClasses'); await p.waitForFunction(() => document.querySelectorAll('#scList .sc-card').length >= 1);
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), JSON.stringify(vp));
      if (vp.width === 390) { await clean(p); await p.screenshot({ path: __dirname + '/r79_special_phone.png', fullPage: false }); }
      await S.ctx.close();
    }
    const real = F.env.ctx.SpreadsheetApp.openById; F.env.ctx.CacheService.getScriptCache().remove('aps_special_classes_v1');
    F.env.ctx.SpreadsheetApp.openById = id => { if (id === '1itBHvjvjPwQc4BUJMenFdDoqKcSKutjk10v5F_NlpcE') throw new Error('denied'); return real(id); };
    const S = await open('sa0_aps6650' + D, 'student'); const p = S.page;
    await p.click('#tabSpecialClasses'); await p.waitForFunction(() => /temporarily unavailable/.test(document.getElementById('scList').textContent));
    await p.click('#tabClasses'); assert.strictEqual(await p.evaluate(() => currentView), 'classes', 'other tabs keep working');
    assert.deepStrictEqual(S.errors, []); await S.ctx.close(); F.env.ctx.SpreadsheetApp.openById = real;
  });
  await browser.close();
  console.log('\nALL ' + passed + ' SPECIAL CLASSES UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

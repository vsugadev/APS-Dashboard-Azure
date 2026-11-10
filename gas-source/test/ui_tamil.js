// r74 browser tests: 👣 தமிழ்த் தடம் (Tamil Thadam) — student-only tab (node test/ui_tamil.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { setup, ID, D } = require('./coveragefixture');
const J = x => JSON.parse(JSON.stringify(x));
const F = setup(); const { G, tok } = F;
const STU = 'sa0_aps6650' + D, NEW = 'sa1_aps6651' + D;
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const att = (date, score) => ({ role: 'STUDENT', email: STU, courseId: ID.EA, className: 'MUNMAZHALAI - EA | FRI 6:30 - 8:00 PM EST | AY26-27', date, weekOf: 'WK-' + date, score });
G.attReadRecordsForFilters_ = () => ['2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02', today].map((d, i) => att(d, i === 1 ? 70 : 100));
G.rosterEnabled_ = () => true;
G.rosterDataset_ = () => ({ classrooms: [], teachers: [], students: [{ c: ID.EA, e: STU }] });
G.gradesForCourses_ = ids => { const o = {}; ids.forEach(id => { o[id] = { w: [{ id: 'h1', t: 'HW_1 எழுத்துகள்', max: '10', ad: '2026-09-01', due: '2026-09-20 23:00:00' }, { id: 'q1', t: 'QUZ_1', max: '10', ad: '2026-09-01', due: '2026-09-27 23:00:00' }],
  s: [{ w: 'h1', e: STU, st: 'TURNED_IN', late: false, g: '', ti: '2026-09-19 10:00:00', gd: '', rd: '' }, { w: 'q1', e: STU, st: 'RETURNED', late: false, g: '9', ti: '2026-09-26 10:00:00', gd: '2026-09-28 10:00:00', rd: '' }] }; }); return o; };
const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
(async () => {
  const browser = await chromium.launch();
  async function open(token, vp) {
    const ctx = await browser.newContext({ viewport: vp || { width: 1366, height: 1000 } }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('__gas', async (fn, args) => { try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses; apsAccessGranted = true;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); apsApplyTabAccess_(); updateMeetPreviewTabVisibility(); }, { data, token });
    await page.waitForTimeout(300);
    return { page, ctx, errors };
  }
  for (const [e, r] of [['hm@aps.org', 'headmaster'], ['ayana_aps8123' + D, 'teacher'], [F.vpEmail, 'teacher'], ['bod@aps.org', 'vcfo_amchsts_bod']]) {
    await t(r + ' ' + e.split('@')[0] + ': no Tamil Thadam tab, and a direct switch falls back to Classes', async () => {
      const R = await open(tok(e, r));
      assert.strictEqual(await R.page.isVisible('#tabTamilThadam'), false);
      await R.page.evaluate(() => switchView('tamilThadam')); await R.page.waitForTimeout(200);
      assert.strictEqual(await R.page.evaluate(() => currentView), 'classes'); assert.strictEqual(await R.page.isVisible('#tdView'), false);
      assert.deepStrictEqual(R.errors, []); await R.ctx.close();
    });
  }
  await t('student: tab shown; the Tamil note pops up on opening; journey with points, level bar, achievements, progress, this week, journey; certificate', async () => {
    F.env.ctx.PropertiesService.getScriptProperties().setProperty('TAMIL_THADAM_CERTIFICATE_YEARS', '2026-2027');
    const R = await open(F.tok2.student); const p = R.page;
    assert.ok(/👣 தமிழ்த் தடம்/.test(await p.textContent('#tabTamilThadam')));
    await p.click('#tabTamilThadam'); await p.waitForTimeout(300);
    assert.strictEqual(await p.isVisible('#tdNoteModal'), true);
    const note = await p.textContent('#tdNoteModal');
    assert.ok(/முக்கிய குறிப்பு/.test(note) && /மாணவருக்காகவே/.test(note) && /யாராலும் \(Admin உட்பட\)/.test(note) && /தடம் பதிப்போம்/.test(note));
    await p.screenshot({ path: __dirname + '/r74_tamil_note.png', clip: { x: 0, y: 0, width: 1366, height: 1000 } });
    await p.click('#tdNoteOk'); await p.waitForTimeout(900);
    assert.strictEqual(await p.isVisible('#tdNoteModal'), false);
    const body = await p.textContent('#tdBody');
    assert.ok(/என் தமிழ்ப் பயணம்/.test(body) && /வணக்கம்/.test(body) && /APS6650/.test(body) && /Learning Points/.test(body) && /Week Learning Streak/.test(body), body.slice(0, 400));
    assert.ok(/My Achievements/.test(body) && /Tamil Explorer/.test(body) && /Coming Soon/.test(body) && /This Week/.test(body) && /My Tamil Journey/.test(body));
    assert.ok(/\+10/.test(await p.textContent('#tdBody .td-card:nth-of-type(1)')) || /This Week: \+\d+ points/.test(body));
    assert.ok(await p.$eval('#tdBody .td-bar > span', s => parseFloat(s.style.width) > 0));
    assert.ok(!/Rank|Behind|Failed|Low |Absent|Missing/.test(body), 'positive wording only');
    await p.screenshot({ path: __dirname + '/r74_tamil_desktop.png', fullPage: true });
    await p.click('#tdCertBtn'); await p.waitForTimeout(200);
    const cert = await p.textContent('#tdCertBody');
    assert.ok(/AVVAIYAR PADASALAI/.test(cert) && /Tamil Thadam Achievement/.test(cert) && /Academic Year 2026–2027/.test(cert) && /TT-2627-APS6650-/.test(cert));
    await p.screenshot({ path: __dirname + '/r74_tamil_certificate.png', clip: { x: 0, y: 0, width: 1366, height: 1000 } });
    await p.click('#tdCertClose');
    await p.evaluate(() => switchView('classes')); await p.click('#tabTamilThadam'); await p.waitForTimeout(400);
    assert.strictEqual(await p.isVisible('#tdNoteModal'), false, 'the note shows once per visit to the page');
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
    F.env.ctx.PropertiesService.getScriptProperties().deleteProperty('TAMIL_THADAM_CERTIFICATE_YEARS');
  });
  for (const [e, r] of [['admin@aps.org', 'admin'], ['super@aps.org', 'superadmin']]) {
    await t('r75 ' + r + ': tab shown; search a student → read-only journey with banner; the note says Admin can only view', async () => {
      const R = await open(tok(e, r)); const p = R.page;
      assert.strictEqual(await p.isVisible('#tabTamilThadam'), true);
      await p.click('#tabTamilThadam'); await p.waitForTimeout(300);
      assert.ok(/Admin \/ Super Admin மட்டும் பார்க்க மட்டுமே/.test(await p.textContent('#tdNoteModal')));
      await p.click('#tdNoteOk'); await p.waitForTimeout(200);
      assert.ok(/Choose a student above/.test(await p.textContent('#tdBody')));
      await p.fill('#tdSearch', 'APS6650'); await p.waitForTimeout(700);
      await p.click('#tdResults [data-td-st]'); await p.waitForTimeout(900);
      const body = await p.textContent('#tdBody');
      assert.ok(/Read-only view of/.test(body) && /Nothing can be changed here/.test(body) && /APS6650/.test(body) && /Learning Points/.test(body), body.slice(0, 300));
      assert.strictEqual(await p.$$eval('#tdBody input, #tdBody textarea', x => x.length), 0, 'nothing editable');
      if (r === 'admin') await p.screenshot({ path: __dirname + '/r75_tamil_admin_view.png', clip: { x: 0, y: 0, width: 1366, height: 900 }, fullPage: true });
      assert.deepStrictEqual(R.errors, []); await R.ctx.close();
    });
  }
  await t('a new student: positive empty state ("Your Tamil Thadam Journey Starts Today!"), no numbers invented', async () => {
    G.rosterDataset_ = () => ({ classrooms: [], teachers: [], students: [] });
    const R = await open(tok(NEW, 'student')); const p = R.page;
    await p.click('#tabTamilThadam'); await p.click('#tdNoteOk'); await p.waitForTimeout(700);
    const body = await p.textContent('#tdBody');
    assert.ok(/Your Tamil Thadam Journey Starts Today!/.test(body) && /first achievement is waiting/.test(body)); assert.ok(!/Learning Points/.test(body), 'no zero-point tiles');
    await p.screenshot({ path: __dirname + '/r74_tamil_empty.png', clip: { x: 0, y: 0, width: 1366, height: 900 } });
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
  });
  await t('student on a phone: readable, no sideways scroll', async () => {
    G.rosterDataset_ = () => ({ classrooms: [], teachers: [], students: [{ c: ID.EA, e: STU }] });
    const R = await open(F.tok2.student, { width: 390, height: 844 }); const p = R.page;
    await p.click('#tabTamilThadam'); await p.click('#tdNoteOk'); await p.waitForTimeout(800);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.screenshot({ path: __dirname + '/r74_tamil_phone.png', fullPage: false });
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
  });
  await browser.close();
  console.log('ALL ' + passed + ' TAMIL THADAM UI TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

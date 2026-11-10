// Browser test: r77 Temporary Class Coverage decision support + Class Teacher Availability colours (node test/ui_tcc77.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { setup, ID, FRI } = require('./coveragefixture');
const F = setup(); const { tok, J, G } = F;
const CUR = G.getCurrentWeekId_(), WK = 'WK-' + FRI;
const tw = G.getOrCreateTeacherAvailabilitySheet_();
[[WK, ID.ED, 'confirmed', ''], [CUR, ID.EA, 'not_available', 'need_hm_support'], [CUR, ID.EE_7, 'not_available', 'sub_teacher_arranged'], [CUR, ID.N2, 'not_available', 'parent_teacher_arranged'], [CUR, ID.EF_SAT, 'not_available', 'on_call_assigned']]
  .forEach(r => tw.appendRow([r[0], 't@x', 'T', r[1], 'n', '', r[2], r[3], new Date().toISOString(), 'hm@aps.org', 'HM Karuna']));
G.applyCoverage(F.tok2.admin, { originalId: ID.EB, destinationId: ID.ED, date: FRI, confirmed: true, confirmStreamLink: true, requestId: 'pre1' });
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
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); }, { data, token });
    await page.waitForTimeout(300);
    return { page, errors, ctx };
  }
  const clean = p => p.evaluate(() => { document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'); document.activeElement && document.activeElement.blur(); });
  await t('HM: destination list shows APSID, this-week availability, APS teacher, existing coverage; warning + extra tick before Confirm & Apply', async () => {
    const H = await open('hm@aps.org', 'headmaster'); const p = H.page;
    await p.click('#subTabCoverage');
    await p.waitForFunction(() => document.querySelectorAll('#tccOrig option').length > 5);
    await p.selectOption('#tccOrig', ID.EA);
    await p.waitForFunction(() => document.querySelectorAll('#tccDestList input[name=tccDest]').length === 3);
    const ed = await p.$eval(`#tccDestList input[value="${'${ID}'}"]`.replace('${ID}', ID.ED), i => i.closest('label').textContent);
    ['Kavitha Raman', 'APS8130', '7', 'Combined', 'Teacher Availability', 'Friday 6:30–8:00 PM — Available', '🟢 Teacher Available', '👩‍🏫 APS Teacher', '⭐ Recommended', 'Recommended APS Teacher — Available this week and the only eligible available teacher', '⚠️ 1 Existing Coverage', 'MUNMAZHALAI - EB'].forEach(x => assert.ok(ed.includes(x), x + ' in: ' + ed));
    const first = await p.$eval('#tccDestList input[name=tccDest]', i => i.value); assert.strictEqual(first, ID.ED, 'best match listed first');
    const ec = await p.$eval(`#tccDestList input[value="${ID.EC}"]`, i => i.closest('label').textContent); assert.ok(/No availability submitted for this week/.test(ec) && /🟡 Availability Not Submitted/.test(ec), ec);
    assert.ok(!/undefined|null/.test(await p.textContent('#tccDestList')));
    await p.evaluate(() => { const o = window.__gas; window.__gasOrig = o; window.__gas = (fn, a) => fn === 'getCoveragePlan' ? new Promise(r => setTimeout(r, 700)).then(() => o(fn, a)) : o(fn, a); }); // slow server
    await p.click(`#tccDestList input[value="${ID.ED}"]`);
    await p.waitForTimeout(80);
    assert.strictEqual(await p.isVisible('#tccDestStatus'), true, 'immediate loading line while the summary loads');
    assert.ok(/Loading the coverage summary/.test(await p.textContent('#tccDestStatus')));
    assert.strictEqual(await p.$eval(`#tccDestList input[value="${ID.ED}"]`, i => i.closest('label').classList.contains('on')), true, 'selection shown at once');
    await p.waitForFunction(() => document.getElementById('tccSummaryCard').style.display === '');
    await p.evaluate(() => { window.__gas = window.__gasOrig; });
    assert.strictEqual(await p.isVisible('#tccDestStatus'), false);
    assert.ok(/Kavitha Raman APS8130/.test(await p.textContent('#tccSummary')));
    assert.strictEqual(await p.isVisible('#tccMultiBox'), true);
    const w = await p.textContent('#tccMultiMsg'); assert.ok(/Destination Class Already Has Temporary Coverage/.test(w) && /Source Class: MUNMAZHALAI - EB/.test(w) && /Kavitha Raman \(APS8130\)/.test(w), w);
    await p.check('#tccConfirm'); assert.strictEqual(await p.$eval('#tccApply', b => b.disabled), true, 'needs the "I understand" tick too');
    await p.check('#tccMultiOk'); assert.strictEqual(await p.$eval('#tccApply', b => b.disabled), false);
    await clean(p); await p.setViewportSize({ width: 1366, height: 2600 });
    await p.screenshot({ path: __dirname + '/r77_tcc_destinations.png', clip: await p.$eval('#coverageView', e => { const r = e.getBoundingClientRect(); return { x: 0, y: r.y + scrollY - 40, width: 1366, height: Math.min(r.height + 40, 2500) }; }) });
    await p.click('#tccApply');
    await p.waitForFunction(() => document.getElementById('tccResult').style.display === '');
    assert.ok(/Coverage applied/.test(await p.textContent('#tccResult')), await p.textContent('#tccResult'));
    assert.deepStrictEqual(H.errors, []); await H.ctx.close();
  });
  await t('tablet width: destination cards wrap, no sideways scroll', async () => {
    const H = await open('hm@aps.org', 'headmaster', { width: 820, height: 1100 }); const p = H.page;
    await p.click('#subTabCoverage'); await p.waitForFunction(() => document.querySelectorAll('#tccOrig option').length > 5);
    await p.selectOption('#tccOrig', ID.EC); await p.waitForFunction(() => document.querySelectorAll('#tccDestList input[name=tccDest]').length >= 2);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await clean(p); await p.screenshot({ path: __dirname + '/r77_tcc_tablet.png', fullPage: false });
    assert.deepStrictEqual(H.errors, []); await H.ctx.close();
  });
  await t('Google Classroom: each arrangement has its own colour + chip, wording unchanged; quick filter "Need Action"', async () => {
    const A = await open('admin@aps.org', 'admin'); const p = A.page;
    await p.evaluate(() => loadWeeklyPanel());
    await p.waitForFunction(() => document.querySelectorAll('.avail-status-badge').length >= 4, null, { timeout: 8000 });
    const badges = await p.$$eval('.avail-status-badge', b => b.map(x => ({ cls: x.className, text: x.textContent })));
    const find = re => badges.find(b => re.test(b.text));
    const need = find(/Need HM Support · Action Required/), sub = find(/Sub-Teacher Arranged · Covered/), par = find(/Parent-Teacher Arranged · Covered by Parent\/Teacher/), onc = find(/On-Call Assigned · Alternative Coverage/);
    assert.ok(need && /availability-status-danger/.test(need.cls) && /🔴/.test(need.text), JSON.stringify(badges));
    assert.ok(sub && /availability-status-success/.test(sub.cls) && /🟢/.test(sub.text));
    assert.ok(par && /availability-status-info/.test(par.cls) && /🔵/.test(par.text));
    assert.ok(onc && /availability-status-oncall/.test(onc.cls) && /🟣/.test(onc.text));
    [need, sub, par, onc].forEach(b => assert.ok(/Not Available to Take Classes/.test(b.text), 'existing wording kept'));
    assert.ok(/Need HM Support$|Need HM Support/.test(need.text.split('Action Required')[1]), 'stored arrangement text still shown');
    const map = await p.evaluate(() => ['Need HM Support', 'Sub-Teacher Arranged', 'Parent-Teacher Arranged', 'Alternative: On-Call Assigned', 'Temporary Class Coverage', 'need_hm_support', 'nonsense'].map(x => (getTeacherAvailabilityStatusStyle(x) || {}).key || null));
    assert.deepStrictEqual(map, ['NEED_HM_SUPPORT', 'SUB_TEACHER_ARRANGED', 'PARENT_TEACHER_ARRANGED', 'ON_CALL_ASSIGNED', 'TEMPORARY_CLASS_COVERAGE', 'NEED_HM_SUPPORT', null]);
    await clean(p);
    await p.screenshot({ path: __dirname + '/r77_availability_colours.png', fullPage: false });
    await p.selectOption('#teacherAvailabilityFilter', 'alt:need'); await p.waitForTimeout(300);
    const shown = await p.evaluate(() => allCourses.filter(c => apsAvailFilterMatch_(c, 'alt:need')).map(c => String(c.id)));
    assert.deepStrictEqual(shown, [ID.EA]);
    assert.strictEqual(await p.evaluate(() => allCourses.filter(c => apsAvailFilterMatch_(c, 'Not Available to Take Classes')).length), 4, 'existing filter values unchanged');
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });
  await t('r78 screenshot case in the browser: exactly one ⭐ Recommended (APS8051); no "Existing APS Teacher" line on the others', async () => {
    const SAT = require('./coveragefixture').nextDow(6, 1), D = '@avvaiyarpadasalai.org';
    const fri = new Date(SAT + 'T12:00:00Z'); fri.setUTCDate(fri.getUTCDate() - 1); const WKS = 'WK-' + fri.toISOString().slice(0, 10);
    const ppl = [['LC', 'suganya_aps8056', 'Suganya Ganesh', 'confirmed', ''], ['LD', 'dhanasri_aps8051', 'Dhanasri Manikandan', 'confirmed', ''], ['LE', 'jerrome_aps8081', 'Jerrome Arulraj', 'not_available', 'need_hm_support'], ['LA', 'kalaivani_aps884', 'Kalaivani Ganapathi', 'not_available', 'parent_teacher_arranged']];
    const mk = (id, email, name) => ({ id, name: 'NILAI 1 - ' + id + ' | SAT 12:00 - 1:30 PM EST | AY26-27', courseState: 'ACTIVE', meetLinkInClassroom: 'https://meet.google.com/' + id.toLowerCase() + 'x-abcd-efg',
      teachers: [{ email: email + D, name }], classSupport: [{ email: email + D, roles: ['PRIMARY_TEACHER'], member: true }], students: Array.from({ length: 5 }, (_, i) => ({ email: 's' + id + i + '_aps' + (7100 + i) + D })) });
    const list = [mk('LB', 'shobana_aps961', 'Shobana Devi')].concat(ppl.map(x => mk(x[0], x[1], x[2])));
    const real = G.readAllCoursesFromCache_; G.readAllCoursesFromCache_ = () => JSON.parse(JSON.stringify(list));
    ppl.forEach(x => tw.appendRow([WKS, x[1] + D, x[2], x[0], 'n', '', x[3], x[4], new Date().toISOString(), 'x', 'X']));
    const H = await open('hm@aps.org', 'headmaster'); const p = H.page;
    await p.click('#subTabCoverage'); await p.waitForFunction(() => document.querySelectorAll('#tccOrig option').length >= 2);
    await p.selectOption('#tccOrig', 'LB'); await p.waitForFunction(() => document.querySelectorAll('#tccDestList input[name=tccDest]').length === 4);
    await p.click(`[data-tcc-date="${SAT}"]`); await p.waitForFunction(() => /⭐ Recommended/.test(document.getElementById('tccDestList').textContent));
    const cards = await p.$$eval('#tccDestList .tcc-dest', l => l.map(x => x.textContent));
    assert.strictEqual(cards.filter(c => /⭐ Recommended/.test(c)).length, 1);
    const recCard = cards.find(c => /⭐ Recommended/.test(c)); assert.ok(/APS8051/.test(recCard) && /Recommended APS Teacher — Available this week and has the lowest eligible APSID among the available teachers/.test(recCard), recCard);
    assert.ok(cards.every(c => !/Existing APS Teacher —/.test(c)), 'old line no longer shown for every APS teacher');
    assert.ok(cards.filter(c => /👩‍🏫 APS Teacher/.test(c)).length === 4, 'APS Teacher badge (detection) kept');
    await clean(p); await p.setViewportSize({ width: 1366, height: 1200 });
    await p.screenshot({ path: __dirname + '/r78_recommended.png', clip: await p.$eval('#tccDestList', e => { const r = e.getBoundingClientRect(); return { x: 0, y: r.y + scrollY - 40, width: 1366, height: Math.min(r.height + 50, 1100) }; }) });
    assert.deepStrictEqual(H.errors, []); await H.ctx.close(); G.readAllCoursesFromCache_ = real;
  });
  await browser.close();
  console.log('\nALL ' + passed + ' R77 UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

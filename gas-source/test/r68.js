// r68: performance + polish — server + browser tests (node test/r68.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const J = x => JSON.parse(JSON.stringify(x));
const { setup, ID, D } = require('./coveragefixture');
let pass = 0; const t = async (n, f) => { try { await f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const STATE = { [ID.EA]: 'started', [ID.EB]: 'yet_to_start', [ID.EC]: 'yet_to_start', [ID.N2]: 'started' };
function prep() {
  const F = setup(); const G = F.G;
  const orig = G.applyClassStatus_;
  G.applyClassStatus_ = function (courses) { orig(courses); courses.forEach(c => { const s = STATE[String(c.id)]; c.classStatus = s || 'scheduled'; c.classStatusLabel = s ? 'X' : 'Scheduled'; c.classMeetDetail = null; }); return courses; };
  G.CacheService.getScriptCache().remove('aps_cls_live_box_v1');
  F.reads = 0; const ra = G.readAllCoursesFromCache_; G.readAllCoursesFromCache_ = function () { F.reads++; return ra(); };
  return F;
}
// the pre-r68 algorithm, used as the reference result
function expected(F, email, role) {
  const all = J(F.G.apsClassLiveBoxesForViewer_({ email: 'admin@aps.org', role: 'admin' }));
  const ids = (F.G.getViewerContext_(F.G.readAllCoursesFromCache_(), { email, role }).courses || []).map(c => String(c.id));
  const out = {}; ids.forEach(id => { if (all[id]) out[id] = all[id]; }); return out;
}
(async () => {
  await t('45 s poll: Admin / Super Admin / HM / BOD get every class box WITHOUT re-reading the course list', () => {
    const F = prep(); const G = F.G;
    G.apsClassLiveBoxesForViewer_({ email: 'admin@aps.org', role: 'admin' }); // builds the shared 30 s box cache
    for (const [e, r] of [['admin@aps.org', 'admin'], ['super@aps.org', 'superadmin'], ['hm@aps.org', 'headmaster'], ['bod@aps.org', 'vcfo_amchsts_bod']]) {
      const exp = expected(F, e, r); F.reads = 0;
      const got = J(G.apsClassLiveBoxesForViewer_({ email: e, role: r }));
      assert.strictEqual(F.reads, 0, r + ': no course-list read on a warm poll');
      assert.deepStrictEqual(got, exp, r + ': same boxes as before');
      assert.deepStrictEqual(Object.keys(got).sort(), [ID.EA, ID.EB, ID.EC, ID.N2].sort());
    }
  });
  await t('teacher / VP / student: same boxes as before; the visible-class list is cached per person (one read, then none)', () => {
    const F = prep(); const G = F.G;
    G.apsClassLiveBoxesForViewer_({ email: 'admin@aps.org', role: 'admin' });
    for (const [e, r] of [['ayana_aps8123' + D, 'teacher'], [F.vpEmail, 'teacher'], ['other_aps8140' + D, 'teacher'], ['sa0_aps6650' + D, 'student'], ['nobody' + D, 'student']]) {
      const exp = expected(F, e, r); F.reads = 0;
      assert.deepStrictEqual(J(G.apsClassLiveBoxesForViewer_({ email: e, role: r })), exp, e + ' first poll');
      const first = F.reads;
      assert.deepStrictEqual(J(G.apsClassLiveBoxesForViewer_({ email: e, role: r })), exp, e + ' second poll');
      assert.ok(first <= 1 && F.reads === first, e + ': second poll reads nothing (reads ' + first + ' → ' + F.reads + ')');
    }
    assert.deepStrictEqual(Object.keys(J(G.apsClassLiveBoxesForViewer_({ email: 'sa0_aps6650' + D, role: 'student' }))), [ID.EA], 'a student sees only their own class');
    assert.deepStrictEqual(J(G.apsClassLiveBoxesForViewer_({ email: 'nobody' + D, role: 'student' })), {}, 'no class → nothing');
  });
  await t('a roster change (student moved out) is honoured on the very next poll — the cached list follows the course-list generation', () => {
    const F = prep(); const G = F.G; const who = 'sa0_aps6650' + D;
    assert.ok(J(G.apsClassLiveBoxesForViewer_({ email: who, role: 'student' }))[ID.EA]);
    F.cls.students[ID.EA] = F.cls.students[ID.EA].filter(s => s.profile.emailAddress !== who); // removed in Google Classroom
    G.syncClassroomData(); // rewrites the Courses sheet → memo invalidated → new generation
    G.CacheService.getScriptCache().remove('aps_cls_live_box_v1');
    assert.deepStrictEqual(J(G.apsClassLiveBoxesForViewer_({ email: who, role: 'student' })), {}, 'no box for a class they left');
    assert.deepStrictEqual(J(G.getRealtimeStatusSnapshot(F.tok(who, 'student'))).liveStatus, {});
  });
  await t('getDashboardData no longer attaches the unused per-class on-call pick; the top-of-page banner fields are unchanged', () => {
    const F = setup(); const d = J(F.G.getDashboardData(F.tok('admin@aps.org', 'admin')));
    assert.ok(d.courses.length > 0);
    d.courses.forEach(c => { assert.ok(!('onCallTeacher' in c) && !('onCallOtherNames' in c) && !('onCallTeacherCount' in c), 'no per-class on-call fields'); });
    assert.ok('onCallTeacherCount' in d && 'onCallTeacher' in d, 'banner fields still returned');
  });
  await t('the three unused server functions listed in r68 were removed in r69 after approval', () => {
    const F = setup(); ['getSyncIntervalMinutes', 'getAttendanceConfig', 'getAttendanceRecordsForAdmin'].forEach(f => assert.strictEqual(typeof F.G[f], 'undefined', f));
  });

  // ---------------- browser ----------------
  const F = setup(); const { G, tok } = F;
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  await t('dead client renderers are gone (the pages below load and work with no script errors)', () => {
    ['function dayMatches(', 'function computeGroupStatus(', 'function renderWhatsAppLink(', 'function renderMeetLink_(', 'function renderOnCallRoster(', 'function renderOnCallRosterSection('].forEach(s => assert.ok(!html.includes(s), s));
  });
  const browser = await chromium.launch();
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
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses; apsAccessGranted = true;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); apsApplyTabAccess_(); }, { data, token });
    await page.waitForTimeout(400);
    return { page, ctx, errors };
  }
  await t('"Restore Automatic Status" (the one Class Status button left on cards) is still wired to the right class after the one-pass lookup', async () => {
    G.setClassStatusManual(tok('admin@aps.org', 'admin'), ID.EB, 'cancel');
    const calls = []; const orig = G.setClassStatusManual; G.setClassStatusManual = function (tk, id, action) { calls.push([String(id), action]); return orig.apply(this, arguments); };
    const R = await open('admin@aps.org', 'admin'); const p = R.page;
    const btns = await p.$$eval('.class-status-btn', b => b.map(x => x.getAttribute('data-course-id')));
    assert.deepStrictEqual(btns, [ID.EB]);
    await p.click('.class-status-btn.restore[data-course-id="' + ID.EB + '"]'); await p.waitForTimeout(400);
    assert.deepStrictEqual(calls, [[ID.EB, 'restore']]);
    G.setClassStatusManual = orig;
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
  });
  await t('cards keep the same look; off-screen cards skip layout (content-visibility) yet are still found by search', async () => {
    const R = await open('admin@aps.org', 'admin'); const p = R.page;
    const cs = await p.$eval('#grid > .card', e => { const s = getComputedStyle(e); return [s.contentVisibility, s.borderRadius, s.backgroundColor]; });
    assert.deepStrictEqual(cs, ['auto', '14px', 'rgb(255, 255, 255)']);
    await p.fill('#search', 'EE'); await p.waitForTimeout(500);
    assert.deepStrictEqual(await p.$$eval('#grid > .card .course-name', e => e.map(x => x.textContent).filter(x => /EE/.test(x)).length), 1);
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
  });
  await t('phone: header buttons / filters / quick filters two per row, nothing clipped, no sideways scroll; student has no empty filter gap', async () => {
    const R = await open('admin@aps.org', 'admin', { width: 390, height: 844 }); const p = R.page;
    const g = await p.evaluate(() => ['.header-actions', '.cls-filter-toolbar', '#classesStatusToolbar'].map(s => getComputedStyle(document.querySelector(s)).gridTemplateColumns.split(' ').length));
    assert.deepStrictEqual(g, [2, 2, 2]);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll');
    const clipped = await p.$$eval('.header-actions > *, #classesStatusToolbar > button', els => els.filter(e => e.offsetWidth && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
    assert.deepStrictEqual(clipped, [], 'no clipped labels');
    await p.screenshot({ path: __dirname + '/r68_admin_phone.png', clip: { x: 0, y: 0, width: 390, height: 1300 }, fullPage: true });
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
    const S = await open('sa0_aps6650' + D, 'student', { width: 390, height: 844 }); const q = S.page;
    assert.strictEqual(await q.$eval('.cls-filter-toolbar', e => getComputedStyle(e).display), 'none', 'all-hidden filter row takes no space');
    await q.screenshot({ path: __dirname + '/r68_student_phone.png', clip: { x: 0, y: 0, width: 390, height: 1100 }, fullPage: true });
    assert.deepStrictEqual(S.errors, []); await S.ctx.close();
  });
  await t('desktop: the two search boxes sit 18 px above the filters (no empty status line); keyboard focus ring visible', async () => {
    const R = await open('admin@aps.org', 'admin'); const p = R.page;
    const gap = await p.evaluate(() => document.querySelector('.cls-filter-toolbar').getBoundingClientRect().top - document.getElementById('clsSearchRow').getBoundingClientRect().bottom);
    assert.ok(Math.abs(gap - 18) <= 1, 'gap ' + gap);
    await p.fill('#studentSearch', 'zzzz-nobody'); await p.waitForTimeout(600);
    assert.ok(await p.isVisible('#studentSearchStatus'), 'status line still shows when it has text');
    await p.fill('#studentSearch', ''); await p.waitForTimeout(400);
    await p.focus('#search'); await p.keyboard.press('Tab');
    const ring = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    assert.strictEqual(ring, 'solid');
    await p.screenshot({ path: __dirname + '/r68_admin_desktop.png', clip: { x: 0, y: 0, width: 1366, height: 800 } });
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
  });
  await browser.close();
  console.log(process.exitCode ? 'SOME R68 TESTS FAILED' : 'ALL ' + pass + ' R68 TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

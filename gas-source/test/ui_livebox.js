// Browser test: r64 — class-card "Status" box in Classes → Google Classroom (node test/ui_livebox.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { setup, ID, D } = require('./coveragefixture');
const F = setup(); const { tok, J, G } = F;
const TEACH = 'ayana_aps8123' + D;
let STATE = {};
const orig = G.applyClassStatus_;
G.applyClassStatus_ = function (courses) {
  orig(courses);
  courses.forEach(c => {
    const s = STATE[String(c.id)]; if (!s) { c.classStatus = 'scheduled'; c.classStatusLabel = 'Scheduled'; c.classMeetDetail = null; return; }
    c.classStatus = s.code; c.classStatusLabel = { started: 'Class Started', yet_to_start: 'Yet to Start', completed: 'Class Ended' }[s.code];
    c.classMeetDetail = s.detail ? { text: s.detail, statusUnknown: !!s.unknown } : null;
    (c.teachers || []).forEach(x => { x.inMeet = !!s.teacher && x.email === s.teacher; });
    (c.students || []).forEach((x, i) => { x.inMeet = i < (s.students || 0); });
  });
  return courses;
};
const reset = st => { STATE = st; G.CacheService.getScriptCache().remove('aps_cls_live_box_v1'); };
(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  async function open(email, role, o) {
    o = o || {};
    const ctx = await browser.newContext({ viewport: o.vp || { width: 1366, height: 1000 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const token = tok(email, role);
    await page.exposeFunction('__gas', async (fn, args) => { try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses; apsAccessGranted = true; clsLiveUpdatedAt = new Date().toISOString();
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); document.getElementById('search').value = 'MUNMAZHALAI - E'; render(); }, { data, token });
    await page.waitForTimeout(450);
    return { page, errors, ctx };
  }
  const box = (p, id) => p.$eval(`#grid [data-course-id="${id}"] .cls-live-host`, h => { const b = h.querySelector('.cls-live-status'); return b ? { tone: b.getAttribute('data-live-tone'), text: b.innerText, red: getComputedStyle(b.querySelector('.ls-line1')).color } : null; });
  const poll = async p => { await p.evaluate(() => { realtimeStatusPollInProgress = false; pollRealtimeOperationalStatus(); }); await p.waitForTimeout(450); };

  await t('Admin: green box when the teacher is in the Meet, red when not / Meet not started, none outside class time; GCM wording', async () => {
    reset({ [ID.EA]: { code: 'started', teacher: TEACH, students: 5, detail: 'Teacher joined 12:00 PM · 5 students joined' },
      [ID.EB]: { code: 'yet_to_start', students: 5, detail: '5 students in Meet — waiting for the teacher' },
      [ID.EC]: { code: 'yet_to_start', students: 0, detail: 'Google Meet not started yet' }, [ID.ED]: { code: 'completed', detail: 'Class ended around 8:00 PM' } });
    const A = await open('admin@aps.org', 'admin'); const p = A.page;
    const a = await box(p, ID.EA), b = await box(p, ID.EB), c = await box(p, ID.EC);
    assert.strictEqual(a.tone, 'ok'); ['STATUS · LIVE NOW', '🟢 LIVE in Google Meet', '👩‍🏫 Teacher in Meet · 👥 5 of 14 students', 'Class Started — Teacher joined 12:00 PM · 5 students joined', 'Status refreshes every 45 seconds · updated'].forEach(x => assert.ok(a.text.includes(x), x + ' in ' + a.text));
    assert.strictEqual(b.tone, 'alert'); assert.ok(b.text.includes('🔴 Teacher not in Meet') && b.text.includes('Yet to Start — 5 students in Meet — waiting for the teacher') && b.text.includes('STATUS · CLASS TIME STARTED'));
    assert.strictEqual(c.tone, 'alert'); assert.ok(c.text.includes('🔴 Meet not started') && c.text.includes('Yet to Start — Google Meet not started yet') && c.text.includes('0 of 9 students'));
    assert.strictEqual(b.red, 'rgb(165, 14, 14)', 'red text'); assert.notStrictEqual(a.red, b.red);
    assert.strictEqual(await box(p, ID.ED), null, 'ended class: no box');
    const ab = await p.$eval(`#grid [data-course-id="${ID.EA}"]`, card => { const top = card.querySelector('.card-top').getBoundingClientRect(), bx = card.querySelector('.cls-live-status').getBoundingClientRect(), tr = card.querySelector('.teacher-roster-label').getBoundingClientRect(); return bx.top >= top.bottom - 1 && bx.bottom <= tr.top; });
    assert.ok(ab, 'its own section, between the card header and the teacher list');
    assert.strictEqual(await p.evaluate(() => REALTIME_STATUS_POLL_MS), 45000);
    await p.evaluate(() => document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'));
    const y = await p.$eval('#grid', e => e.getBoundingClientRect().top + scrollY - 10);
    await p.screenshot({ path: __dirname + '/r64_livebox_desktop.png', clip: { x: 0, y, width: 1366, height: 620 } });
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await t('45-second refresh: Meet status changes are applied by the poll without reloading (appear, turn red, turn green, disappear)', async () => {
    reset({ [ID.EB]: { code: 'yet_to_start', students: 0, detail: 'Google Meet not started yet' } });
    const A = await open('admin@aps.org', 'admin'); const p = A.page;
    assert.strictEqual(await box(p, ID.EA), null);
    reset({ [ID.EA]: { code: 'yet_to_start', students: 3, detail: '3 students in Meet — waiting for the teacher' }, [ID.EB]: { code: 'yet_to_start', students: 0, detail: 'Google Meet not started yet' } });
    await poll(p);
    assert.strictEqual((await box(p, ID.EA)).tone, 'alert', 'appeared, red');
    reset({ [ID.EA]: { code: 'started', teacher: TEACH, students: 6, detail: 'Teacher joined 6:31 PM · 6 students joined' }, [ID.EB]: { code: 'yet_to_start', students: 0, detail: 'Google Meet not started yet' } });
    await poll(p);
    const g = await box(p, ID.EA); assert.strictEqual(g.tone, 'ok'); assert.ok(g.text.includes('Teacher joined 6:31 PM · 6 students joined'));
    reset({ [ID.EB]: { code: 'yet_to_start', students: 0, detail: 'Google Meet not started yet' } });
    await poll(p);
    assert.strictEqual(await box(p, ID.EA), null, 'class ended → box gone'); assert.strictEqual((await box(p, ID.EB)).tone, 'alert');
    assert.ok(/updated \d{1,2}:\d{2}:\d{2} [AP]M EST/.test((await box(p, ID.EB)).text));
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await t('r65: live presence not visible → grey "Live status not available" box, never red; GCM - Preview shows the same', async () => {
    reset({ [ID.EA]: { code: 'yet_to_start', students: 0, unknown: true, detail: 'Live Google Meet status not available for this class' } });
    const A = await open('admin@aps.org', 'admin'); const p = A.page;
    const b = await box(p, ID.EA);
    assert.strictEqual(b.tone, 'unknown'); ['⚪ Live status not available', 'Teacher: not known', 'Students: not known (14 on roster)', 'Yet to Start — Live Google Meet status not available for this class'].forEach(x => assert.ok(b.text.includes(x), x));
    assert.notStrictEqual(b.red, 'rgb(165, 14, 14)', 'not red');
    await p.evaluate(() => document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'));
    const y = await p.$eval(`#grid [data-course-id="${ID.EA}"]`, e => e.getBoundingClientRect().top + scrollY - 10);
    await p.screenshot({ path: __dirname + '/r65_livebox_unknown.png', clip: { x: 0, y, width: 540, height: 260 } });
    // GCM - Preview card renderer: same "not known" presence line (and unchanged when presence is known)
    const g = await p.evaluate(() => {
      const base = { id: '1', name: 'X', grade: 'NILAI 1', section: 'AA', status: 'LIVE', meetState: 'OK', meetLink: 'https://meet.google.com/abc-defg-hij', studentCount: 6, studentsInMeet: 0, teacherInMeet: false, classStatusLabel: 'Yet to Start', meetDetail: 'Live Google Meet status not available for this class', vp: [], hm: [] };
      const d = document.createElement('div'); d.innerHTML = gcmCard_(Object.assign({ meetUnknown: true }, base)) + gcmCard_(Object.assign({}, base, { meetUnknown: false, studentsInMeet: 5, meetDetail: '5 students in Meet — waiting for the teacher' }));
      return [...d.querySelectorAll('.gcm-presence')].map(e => e.textContent);
    });
    assert.strictEqual(g[0], '👩‍🏫 Teacher: not known · 👥 Students: not known (6 on roster)');
    assert.strictEqual(g[2], '👩‍🏫 Teacher not in Meet · 👥 5 of 6 students', 'known presence unchanged');
    assert.deepStrictEqual(A.errors, []); await A.ctx.close();
  });

  await t('student sees the box for their own class only; phone layout has no horizontal scroll', async () => {
    reset({ [ID.EA]: { code: 'yet_to_start', students: 2, detail: '2 students in Meet — waiting for the teacher' }, [ID.EB]: { code: 'started', teacher: 'senthil_aps8131' + D, students: 4, detail: 'Teacher joined 6:30 PM · 4 students joined' } });
    const S = await open('sa0_aps6650' + D, 'student', { vp: { width: 390, height: 844 } }); const p = S.page;
    const ids = await p.$$eval('#grid [data-course-id]', c => c.map(x => x.getAttribute('data-course-id')));
    assert.deepStrictEqual(ids, [ID.EA]); assert.strictEqual((await box(p, ID.EA)).tone, 'alert');
    await poll(p);
    assert.strictEqual(await p.$$eval('.cls-live-status', b => b.length), 1);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll');
    await p.evaluate(() => document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'));
    const y = await p.$eval('#grid', e => e.getBoundingClientRect().top + scrollY - 10);
    await p.screenshot({ path: __dirname + '/r64_livebox_phone.png', clip: { x: 0, y, width: 390, height: 420 } });
    assert.deepStrictEqual(S.errors, []); await S.ctx.close();
  });

  await browser.close();
  console.log('ALL ' + passed + ' LIVE STATUS BOX UI TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

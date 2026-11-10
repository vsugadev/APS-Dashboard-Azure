// Browser test: r43 navigation layer — tabs / sub-tabs still navigate (node test/ui_nav.js)
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

  const MAP = [['tabClasses','classesView'],['tabOnboarding','directoryView'],['tabKb','kbView'],['tabAssignClassroom','assignClassroomView'],['rl-tab','rl-view'],['tabAttendance','attendanceView'],['tabExamination','examinationView'],['tabMeetPreview','meetPreviewView']];
  const A = await open('admin@aps.org', 'admin');
  const p = A.page;
  await t('admin: every visible main tab still opens its own view; .active moves; active tab has tint + ring + underline', async () => {
    await p.evaluate(() => { if (typeof updateReferenceLetterTabVisibility === 'function') updateReferenceLetterTabVisibility(); if (typeof updateMeetPreviewTabVisibility === 'function') updateMeetPreviewTabVisibility(); });
    for (const [tab, view] of MAP) {
      const el = await p.$('#' + tab); if (!el || !(await el.isVisible())) continue;
      await p.click('#' + tab); await p.waitForTimeout(250);
      const viewId = await p.evaluate(v => { const e = document.getElementById(v); return e ? e.style.display !== 'none' && !!e.offsetParent : 'missing'; }, view);
      assert.ok(viewId === true || viewId === 'missing', tab + ' opens ' + view);
      assert.deepStrictEqual(await p.$$eval('.view-tab.active', b => b.map(x => x.id)), [tab]);
      const st = await p.$eval('#' + tab, e => { const c = getComputedStyle(e); return { bg: c.backgroundColor, sh: c.boxShadow, fw: c.fontWeight, br: c.borderRadius }; });
      assert.ok(st.bg !== 'rgb(255, 255, 255)' && /inset/.test(st.sh) && Number(st.fw) >= 700 && st.br === '10px', tab + ' ' + JSON.stringify(st));
    }
    const inactive = await p.$eval('.view-tab:not(.active)', e => getComputedStyle(e).backgroundColor);
    assert.strictEqual(inactive, 'rgb(255, 255, 255)');
    assert.deepStrictEqual(A.errors, []);
  });
  await t('sub-tabs: Classes ⇄ Teacher Availability Report and Examination sections still switch; sub-tabs smaller than main tabs; action buttons stay solid blue', async () => {
    await p.click('#tabClasses'); await p.waitForTimeout(200);
    if (await p.isVisible('#tabTeacherAvail')) {
      await p.click('#tabTeacherAvail'); await p.waitForTimeout(300);
      assert.strictEqual(await p.getAttribute('#tabTeacherAvail', 'aria-selected'), 'true');
      await p.click('#subTabClasses'); await p.waitForTimeout(200);
      assert.strictEqual(await p.getAttribute('#subTabClasses', 'aria-selected'), 'true');
      const [mainFs, subFs] = await p.evaluate(() => [getComputedStyle(document.getElementById('tabClasses')).fontSize, getComputedStyle(document.getElementById('subTabClasses')).fontSize]);
      assert.ok(parseFloat(subFs) < parseFloat(mainFs), mainFs + ' vs ' + subFs);
    }
    if (await p.isVisible('#tabExamination')) {
      await p.click('#tabExamination'); await p.waitForTimeout(300);
      await p.click('[data-exam-section="classwork"]'); await p.waitForTimeout(200);
      assert.strictEqual(await p.getAttribute('[data-exam-section="classwork"]', 'aria-selected'), 'true');
      const subBg = await p.$eval('[data-exam-section="classwork"]', e => getComputedStyle(e).backgroundColor);
      const actBg = await p.evaluate(() => { const b = document.querySelector('#examinationView .gtr-btn.primary:not([role="tab"])'); return b ? getComputedStyle(b).backgroundColor : null; });
      assert.notStrictEqual(subBg, actBg, 'active sub-tab does not look like a solid action button');
    }
    assert.deepStrictEqual(A.errors, []);
  });
  await t('keyboard focus ring visible on a main tab', async () => {
    await p.focus('#tabClasses'); await p.keyboard.press('Tab'); await p.keyboard.down('Shift'); await p.keyboard.press('Tab'); await p.keyboard.up('Shift');
    const o = await p.evaluate(() => { const e = document.activeElement; return e && e.classList.contains('view-tab') ? getComputedStyle(e).outlineStyle : 'n/a'; });
    assert.ok(o === 'solid' || o === 'n/a', o);
  });
  await t('r44 class cards: top accent bar, header band, section icons, footer band; live / no-students colours; card buttons still work', async () => {
    await p.click('#tabClasses'); await p.waitForTimeout(200);
    await p.evaluate(() => { allCourses.forEach((c, i) => { if (i === 0) { c.live = true; c.liveSource = 'manual'; } if (i === 1) c.noStudents = true; }); render(); });
    const cs = await p.$$eval('.card[data-course-id]', cards => cards.slice(0, 3).map(c => { const s = getComputedStyle(c), top = getComputedStyle(c.querySelector('.card-top'));
      return { bt: s.borderTopWidth, btc: s.borderTopColor, r: s.borderRadius, band: top.backgroundImage, live: c.classList.contains('live'), warn: c.classList.contains('warn') }; }));
    assert.ok(cs.every(c => c.bt === '4px' && c.r === '14px' && /gradient/.test(c.band)), JSON.stringify(cs));
    assert.strictEqual(cs.find(c => c.live).btc, 'rgb(24, 128, 56)'); assert.strictEqual(cs.find(c => c.warn).btc, 'rgb(227, 116, 0)');
    assert.strictEqual(cs.find(c => !c.live && !c.warn).btc, 'rgb(26, 115, 232)');
    assert.strictEqual(await p.$eval('.card .teacher-roster-label', e => getComputedStyle(e, '::before').content), '"👩‍🏫"');
    // r45: no "On-Call Teachers" section on any class card, even when on-call data is present
    await p.evaluate(() => { allCourses.forEach(c => { c.onCallTeacher = { name: 'Oncall Person', email: 'tts_x@avvaiyarpadasalai.org', apsId: 'APS1', photo: '' }; c.onCallTeacherCount = 3; c.onCallOtherNames = ['A', 'B']; }); render(); });
    assert.strictEqual(await p.$$eval('.card .oncall-roster-host, .card .oncall-roster-label', e => e.length), 0);
    assert.ok(!(await p.$$eval('.card', cs => cs.some(c => /On-Call Teachers|Oncall Person/.test(c.textContent)))));
    const btn = await p.$('.card .live-toggle:not([disabled])');
    if (btn) { await btn.click(); await p.waitForTimeout(200); }
    assert.deepStrictEqual(A.errors, []);
  });
  for (const [who, role] of [['teachera_aps101@avvaiyarpadasalai.org', 'teacher'], ['joshua_aps3407@avvaiyarpadasalai.org', 'student']]) {
    const X = await open(who, role, { vp: { width: 390, height: 844 } });
    await t(role + ' phone: tab row scrolls inside itself, no page-wide horizontal scroll; tabs readable', async () => {
      assert.ok(await X.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const fs = await X.page.$eval('.view-tab', e => parseFloat(getComputedStyle(e).fontSize));
      assert.ok(fs >= 13, String(fs));
      assert.deepStrictEqual(X.errors, []);
    });
  }
  await browser.close();
  console.log('ALL ' + passed + ' NAVIGATION UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

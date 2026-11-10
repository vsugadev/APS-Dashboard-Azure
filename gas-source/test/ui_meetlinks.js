// Browser test: Google Meet link + Copy on every class card, all roles (node test/ui_meetlinks.js)
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
  for (const [email, role] of [['admin@aps.org', 'admin'], ['hm@aps.org', 'headmaster'], ['teachera_aps101@avvaiyarpadasalai.org', 'teacher'], ['joshua_aps3407@avvaiyarpadasalai.org', 'student']]) {
    const A = await open(email, role);
    await t(role + ': Google Meet link + Copy link next to WhatsApp / Classroom icon; copy puts the link on the clipboard', async () => {
      const p = A.page;
      const card = '[data-course-id="' + ids.N3EF + '"]';
      assert.strictEqual(await p.getAttribute(card + ' a.meet-link', 'href'), 'https://meet.google.com/abc-defg-hij');
      assert.strictEqual((await p.textContent(card + ' a.meet-link')).trim(), 'Join to Google Meet');
      await p.$eval(card, e => e.scrollIntoView()); // r68: cards far off-screen are not rendered until scrolled to (content-visibility), so innerText is read once it is on screen — as a user sees it
      // r38: one authoritative Resources section — WhatsApp, Google Meet (+Copy), Google Classroom (+Copy)
      const rows = await p.$$eval(card + ' .class-resources .res-row', e => e.map(x => [x.className.replace('res-row ', ''), x.querySelector('.res-name').textContent, [...x.querySelectorAll('.res-actions, .res-copy-slot')].map(e => e.innerText).join(' ').replace(/\s+/g, ' ').trim()]));
      assert.deepStrictEqual(rows.map(r => [r[0], r[1]]), [['res-wa', 'WhatsApp'], ['res-meet', 'Google Meet'], ['res-gc', 'Google Classroom']]);
      assert.strictEqual(rows[0][2], 'Join to WhatsApp'); assert.strictEqual(rows[1][2], 'Join to Google Meet Copy'); assert.strictEqual(rows[2][2], 'Join to Google Classroom Copy');
      assert.strictEqual(await p.getAttribute(card + ' .res-gc a', 'href'), 'https://classroom.google.com/c/' + ids.N3EF);
      for (const s of ['a.meet-link', '.whatsapp-link', 'a.classroom-link', '.meet-copy-btn']) assert.strictEqual((await p.$$(card + ' ' + s)).length, s === '.meet-copy-btn' ? 2 : 1, 'no duplicate ' + s);
      assert.strictEqual((await p.$$(card + ' .card-footer-links')).length, 0, 'old footer links removed');
      assert.strictEqual((await p.$$(card + ' .class-status-btn.cancel, ' + card + ' .class-status-btn.reschedule')).length, 0, 'no Cancel / Reschedule');
      await p.click(card + ' .res-meet .meet-copy-btn');
      await p.waitForTimeout(150);
      assert.strictEqual(await p.evaluate(() => navigator.clipboard.readText()), 'https://meet.google.com/abc-defg-hij');
      assert.strictEqual((await p.textContent(card + ' .res-meet .meet-copy-btn')).trim(), 'Copied ✓');
      assert.ok(/Google Meet link copied/.test(await p.textContent('#toast')));
      await p.click(card + ' .res-gc .meet-copy-btn'); await p.waitForTimeout(150);
      assert.strictEqual(await p.evaluate(() => navigator.clipboard.readText()), 'https://classroom.google.com/c/' + ids.N3EF);
      assert.ok(/Google Classroom link copied/.test(await p.textContent('#toast')));
      await p.waitForTimeout(2100);
      assert.strictEqual((await p.textContent(card + ' .res-meet .meet-copy-btn')).trim(), 'Copy');
      await p.waitForFunction(sel => ['.course-name', '.whatsapp-link', '.meet-copy-btn', 'a.meet-link'].every(s => { const e = document.querySelector(sel + ' ' + s); return e && (e.getAttribute('data-tooltip') || '').length > 10; }), card, { timeout: 5000 });
      if (role === 'admin') { await p.mouse.move(5, 5); await p.waitForTimeout(2300); }
      if (role === 'admin') await p.screenshot({ path: __dirname + '/meetlink_admin.png', clip: await (await p.$(card)).boundingBox() });
      assert.deepStrictEqual(A.errors, []);
    });
  }
  const T = await open('teacherb_aps102@avvaiyarpadasalai.org', 'teacher');
  await t('auto-detected link shown; class without any known Meet shows no link', async () => {
    assert.strictEqual(await T.page.getAttribute('[data-course-id="' + ids.N4AB + '"] a.meet-link', 'href'), 'https://meet.google.com/det-ecte-dxx');
    assert.strictEqual((await T.page.$$('[data-course-id="' + ids.MAZ + '"] a.meet-link')).length, 0);
  });
  const B = await open('joshua_aps3407@avvaiyarpadasalai.org', 'student', { noClipboard: true, vp: { width: 390, height: 844 } });
  await t('clipboard blocked (Apps Script iframe): selected text box to copy by hand; mobile has no horizontal scroll', async () => {
    const p = B.page; const card = '[data-course-id="' + ids.N3EF + '"]';
    await p.click(card + ' .meet-copy-btn');
    assert.strictEqual(await p.inputValue(card + ' .meet-copy-fallback'), 'https://meet.google.com/abc-defg-hij');
    assert.ok(await p.evaluate(sel => { const i = document.querySelector(sel + ' .meet-copy-fallback'); return document.activeElement === i && i.selectionEnd - i.selectionStart === i.value.length; }, card));
    const w = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert.ok(w[0] <= w[1] + 1, JSON.stringify(w));
  });
  await browser.close();
  console.log(passed + ' passed');
})().catch(e => { console.error(e); process.exit(1); });

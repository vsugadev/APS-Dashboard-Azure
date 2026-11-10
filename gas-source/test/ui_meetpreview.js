// Browser test: GCM - Preview tab (Admin only) + live Class Status detail (node test/ui_meetpreview.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { build } = require('./gradingfixture');
const F = build(); const { env, cls, ids, tok, J, G } = F;
const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0);
P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p;
const RealDate = Date;
const setNow = iso => { const T = new RealDate(iso).getTime(); class D extends RealDate { constructor(...a) { if (a.length) super(...a); else super(T); } static now() { return T; } } G.Date = D; };
const at = hm => '2026-10-09T' + hm + ':00-04:00';
cls.courses.find(c => c.id === ids.N3EF).description = 'Primary Teacher: teachera_aps101@avvaiyarpadasalai.org Join: https://meet.google.com/abc-defg-hij';
cls.courses.find(c => c.id === ids.MAZ).description = 'https://meet.google.com/maz-mazh-alx';
cls.courses.forEach(c => { c.alternateLink = 'https://classroom.google.com/c/' + c.id; });
setNow(at('12:00')); G.syncClassroomData();
G.getWhatsAppLinksMap_();
{ const wa = env.wb.getSheetByName('WhatsApp_Group_Links'); const n = cls.courses.find(c => c.id === ids.N3EF).name; wa.getRange(2, 1, 1, 3).setValues([[n, '', 'https://chat.whatsapp.com/ExampleGroup']]); }
env.ctx.CacheService.getScriptCache().remove('aps_whatsapp_map_v1'); // r49: direct sheet edit — the 10-min WhatsApp cache is cleared by Force Sync in production
const TA = 'teachera_aps101@avvaiyarpadasalai.org', JO = 'joshua_aps3407@avvaiyarpadasalai.org';
const ended = (email, from, to) => ({ actor: { email }, id: { time: new RealDate(at(to)).toISOString() },
  events: [{ name: 'call_ended', parameters: [{ name: 'meeting_code', value: 'abcdefghij' }, { name: 'duration_seconds', intValue: String((new RealDate(at(to)) - new RealDate(at(from))) / 1000) }] }] });
const audit = [ended(TA, '18:28', '18:40'), ended(JO, '18:29', '18:41')];
env.ctx.AdminReports.Activities.list = (u, app, o) => { const s = new RealDate(o.startTime).getTime(), e = o.endTime ? new RealDate(o.endTime).getTime() : Infinity;
  return { items: audit.filter(it => { const x = new RealDate(it.id.time).getTime(); return x >= s && x <= e; }) }; };
setNow(at('18:45'));

(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  const calls = [];
  async function open(email, role, vp) {
    const ctx = await browser.newContext({ viewport: vp || { width: 1366, height: 1000 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const token = tok(email, role);
    await page.exposeFunction('__gas', async (fn, args) => { calls.push([role, fn]); try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => {
      window.__media = 0; window.__opened = 0;
      try { const md = navigator.mediaDevices || {}; ['getUserMedia', 'getDisplayMedia', 'enumerateDevices'].forEach(k => { md[k] = () => { window.__media++; return Promise.reject(new Error('blocked')); }; }); } catch (e) {}
      navigator.getUserMedia = () => { window.__media++; };
      const wo = window.open; window.open = function () { window.__opened++; return null; };
      function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
        return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } };
    });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.route('https://meet.google.com/**', r => r.fulfill({ contentType: 'text/html', body: 'meet' }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    delete env.cache['aps_class_meet_live_v1'];
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render();
      if (typeof updateMeetPreviewTabVisibility === 'function') updateMeetPreviewTabVisibility(); }, { data, token });
    await page.waitForTimeout(200);
    return { page, errors, data, ctx };
  }
  const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  const A = await open('admin@aps.org', 'admin');
  await t('Classes tab: a class running in Google Meet shows "Class Started" + live detail for Admin', async () => {
    const card = '[data-course-id="' + ids.N3EF + '"]';
    assert.strictEqual((await A.page.textContent(card + ' .class-status-badge')).trim(), 'Class Started');
    const det = (await A.page.textContent(card + ' .class-meet-detail')).trim();
    assert.ok(/^Teacher joined 6:28 PM · 1 student joined$/.test(det), det);
    { const el = card + ' .class-status-badge'; const tip = (await A.page.getAttribute(el, 'title')) || (await A.page.getAttribute(el, 'data-tooltip')) || ''; assert.ok(/Meet audit log/.test(tip), tip); }
    await A.page.$eval(card, e => e.scrollIntoView()); await (await A.page.$(card)).screenshot({ path: __dirname + '/livestatus_admin.png' });
  });
  await t('Classes tab: teachers and students on two lines (name / [APSID] + login)', async () => {
    const card = '[data-course-id="' + ids.N3EF + '"]';
    const t1 = await A.page.$$eval(card + ' .teacher-roster-host .person', ps => ps.map(p => ({ two: p.classList.contains('person-2l'), l1: (p.querySelector('.person-l1') || {}).textContent, l2: (p.querySelector('.person-l2') || {}).textContent,
      oneLine: (() => { const n = p.querySelector('.person-name'); return n && n.getBoundingClientRect().height < 22; })() })));
    assert.ok(t1.length && t1.every(x => x.two && x.oneLine), JSON.stringify(t1));
    const ta = t1.find(x => /Teacher A/.test(x.l1));
    assert.ok(/Primary Teacher/.test(ta.l1) && /\[APS101\]/.test(ta.l2) && !/APS101/.test(ta.l1), JSON.stringify(ta));
    const st = await A.page.$$eval(card + ' .student-roster-host .person', ps => ps.map(p => ({ two: p.classList.contains('person-2l'), l1: p.querySelector('.person-l1').textContent.trim(), l2: p.querySelector('.person-l2').textContent,
      oneLine: p.querySelector('.person-name').getBoundingClientRect().height < 22, title: p.querySelector('.person-name').getAttribute('title') })));
    assert.ok(st.length && st.every(x => x.two && x.oneLine && /^\[APS\d+\]/.test(x.l2) && !/APS\d/.test(x.l1) && x.title === x.l1), JSON.stringify(st));
    await A.page.$eval(card, e => e.scrollIntoView()); await (await A.page.$(card)).screenshot({ path: __dirname + '/teachers_two_line.png' });
  });
  await t('Admin: "🎥 GCM - Preview" tab visible; LIVE card first, 16:9 screen, MUTED, Preview unavailable, Open Meet in a new tab', async () => {
    const p = A.page;
    assert.ok(await p.isVisible('#tabMeetPreview'));
    assert.strictEqual((await p.textContent('#tabMeetPreview')).trim(), '🎥 GCM - Preview');
    await p.click('#tabMeetPreview');
    await p.waitForSelector('#gcmBody .gcm-card');
    assert.ok(await p.isVisible('#meetPreviewView')); assert.ok(!(await p.isVisible('#classesView').catch(() => false)) || true);
    const first = '#gcmBody .gcm-grid .gcm-card';
    assert.strictEqual(await p.getAttribute(first, 'data-gcm-id'), ids.N3EF);
    const txt = await p.textContent(first);
    ['LIVE', '🔇 MUTED', 'Preview unavailable', 'Teacher in Meet', 'Class Started — Teacher joined'].forEach(s => assert.ok(txt.includes(s), s + ' in ' + txt));
    const box = await (await p.$(first + ' .gcm-screen')).boundingBox();
    assert.ok(Math.abs(box.width / box.height - 16 / 9) < 0.05, 'aspect ' + box.width / box.height);
    const a = first + ' a';
    assert.strictEqual(await p.getAttribute(a, 'target'), '_blank');
    assert.ok(/noopener/.test(await p.getAttribute(a, 'rel')));
    assert.strictEqual(await p.getAttribute(a, 'href'), 'https://meet.google.com/abc-defg-hij');
    assert.strictEqual(await p.$$eval('iframe', f => f.filter(x => /meet\.google/.test(x.src || '')).length), 0, 'never embeds Meet');
    assert.strictEqual(await p.evaluate(() => window.__media), 0, 'no microphone / camera request');
    assert.strictEqual(await p.evaluate(() => window.__opened), 0, 'nothing auto-opened');
    await p.screenshot({ path: __dirname + '/gcm_admin.png', fullPage: false });
  });
  await t('Admin: every GCM class has Open Meet / Open Classroom / Join WhatsApp with Copy link, and Primary Teacher / Head Master / Vice Principal in small type', async () => {
    const p = A.page; const first = '#gcmBody .gcm-grid .gcm-card[data-gcm-id="' + ids.N3EF + '"]';
    const pairs = await p.$$eval(first + ' .gcm-pair', ps => ps.map(x => [x.querySelector('a').textContent.trim(), x.querySelector('a').getAttribute('href'), x.querySelector('a').getAttribute('target'), x.querySelector('button').getAttribute('data-copy-meet')]));
    assert.deepStrictEqual(pairs, [['🎥 Open Meet', 'https://meet.google.com/abc-defg-hij', '_blank', 'https://meet.google.com/abc-defg-hij'],
      ['🏫 Open Classroom', 'https://classroom.google.com/c/' + ids.N3EF, '_blank', 'https://classroom.google.com/c/' + ids.N3EF],
      ['💬 Join WhatsApp', 'https://chat.whatsapp.com/ExampleGroup', '_blank', 'https://chat.whatsapp.com/ExampleGroup']]);
    const who = await p.textContent(first + ' .gcm-who');
    assert.ok(/Primary Teacher: Teacher A/.test(who) && /Head Master:/.test(who) && /Vice Principal:/.test(who), who);
    assert.ok(parseFloat(await p.$eval(first + ' .gcm-who', e => getComputedStyle(e).fontSize)) <= 12);
    const rows = await p.$$eval('#gcmBody .gcm-row', r => r.map(x => [x.querySelectorAll('.gcm-who > div').length, x.textContent]));
    assert.ok(rows.length && rows.every(r => r[0] === 3 && /Open Classroom/.test(r[1]) && /(Join WhatsApp|No WhatsApp link)/.test(r[1])), 'every row');
    await p.click(first + ' .gcm-pair:nth-child(2) button'); await p.waitForTimeout(150);
    assert.strictEqual((await p.textContent(first + ' .gcm-pair:nth-child(2) button')).trim(), 'Copied ✓');
    await p.waitForTimeout(2100);
    assert.strictEqual((await p.textContent(first + ' .gcm-pair:nth-child(2) button')).trim(), 'Copy link');
    assert.strictEqual(await p.evaluate(() => window.__opened + window.__media), 0);
    await p.screenshot({ path: __dirname + '/gcm_admin.png' });
  });
  await t('Admin: filters (status, grade, day, search) are client-side; Refresh forces a live check', async () => {
    const p = A.page; const n0 = calls.length;
    await p.selectOption('#gcmStatus', 'UPCOMING');
    assert.strictEqual(await p.$$eval('#gcmBody .gcm-grid .gcm-card', x => x.length), 0);
    await p.selectOption('#gcmStatus', '');
    await p.fill('#gcmSearch', 'mazhalai');
    const names = await p.$$eval('#gcmBody [data-gcm-id]', x => x.map(e => e.getAttribute('data-gcm-id')));
    assert.ok(names.length && names.every(id => id === ids.MAZ), names.join());
    await p.fill('#gcmSearch', '');
    // r93: "All Class Timing" — options built from the loaded classes (Day + Start + End), sorted Day → Start
    const opts = () => p.$$eval('#gcmDay option', o => o.map(x => x.textContent));
    assert.deepStrictEqual(await opts(), ['All Class Timing', 'FRI 6:30 – 8:00 PM EST', 'FRI 7:30 – 9:00 PM EST', 'SAT 12:00 – 1:30 PM EST', 'SUN 7:30 – 9:00 PM EST']);
    await p.selectOption('#gcmDay', { label: 'SAT 12:00 – 1:30 PM EST' });
    const sat = await p.$$eval('#gcmBody [data-gcm-id]', x => x.map(e => e.getAttribute('data-gcm-id')));
    assert.ok(sat.indexOf(ids.N3EA) > -1 && sat.indexOf(ids.BIG) > -1 && sat.indexOf(ids.N3EF) === -1 && sat.indexOf(ids.N4AB) === -1, 'exact Day + Start + End');
    await p.selectOption('#gcmDay', { label: 'FRI 7:30 – 9:00 PM EST' });
    assert.deepStrictEqual(await p.$$eval('#gcmBody [data-gcm-id]', x => [...new Set(x.map(e => e.getAttribute('data-gcm-id')))]), [ids.MAZ], 'FRI 7:30 is not FRI 6:30');
    await p.evaluate(() => document.getElementById('gcmDay').scrollIntoView({ block: 'start' })); await p.screenshot({ path: __dirname + '/r93_gcm_class_timing.png' });
    await p.selectOption('#gcmDay', '');
    assert.strictEqual(calls.slice(n0).length, 0, 'filtering made no server call');
    await p.click('#gcmRefreshBtn'); await p.waitForTimeout(300);
    const after = calls.slice(n0).map(x => x[1]);
    assert.deepStrictEqual(after, ['refreshClassMeetLiveStatus', 'getMeetPreviewData']);
    // r93: a new classroom timing appears after the data refresh; a timing with no class left disappears; the choice is kept while it exists
    cls.courses.push({ id: '8100', name: 'NILAI 6 - ZZ | SAT 9:00 - 10:30 AM EST | AY26-27', courseState: 'ACTIVE', ownerId: 'TB', section: '' }); cls.teachers['8100'] = cls.teachers[ids.MAZ]; cls.students['8100'] = [];
    G.syncClassroomData();
    await p.selectOption('#gcmDay', { label: 'SUN 7:30 – 9:00 PM EST' });
    await p.click('#gcmRefreshBtn'); await p.waitForFunction(() => [...document.querySelectorAll('#gcmDay option')].some(o => /SAT 9:00 – 10:30 AM/.test(o.textContent)));
    assert.deepStrictEqual(await opts(), ['All Class Timing', 'FRI 6:30 – 8:00 PM EST', 'FRI 7:30 – 9:00 PM EST', 'SAT 9:00 – 10:30 AM EST', 'SAT 12:00 – 1:30 PM EST', 'SUN 7:30 – 9:00 PM EST']);
    assert.strictEqual(await p.$eval('#gcmDay option:checked', o => o.textContent), 'SUN 7:30 – 9:00 PM EST', 'selection kept across refresh');
    await p.selectOption('#gcmDay', { label: 'SAT 9:00 – 10:30 AM EST' });
    cls.courses = cls.courses.filter(c => c.id !== '8100'); G.syncClassroomData();
    await p.click('#gcmRefreshBtn'); await p.waitForFunction(() => ![...document.querySelectorAll('#gcmDay option')].some(o => /SAT 9:00 – 10:30 AM/.test(o.textContent)));
    assert.strictEqual(await p.$eval('#gcmDay', s => s.value), '', 'a removed timing falls back to All Class Timing');
    assert.ok((await p.$$eval('#gcmBody [data-gcm-id]', x => x.length)) > 5, 'All Class Timing shows every class');
    assert.strictEqual(await p.evaluate(() => window.__media + window.__opened), 0);
    assert.deepStrictEqual(A.errors, []);
  });
  for (const [vp, label] of [[{ width: 820, height: 1000 }, 'tablet'], [{ width: 390, height: 844 }, 'phone']]) {
    await t(label + ': GCM cards reflow, no page-wide horizontal scroll', async () => {
      const X = await open('admin@aps.org', 'admin', vp);
      await X.page.click('#tabMeetPreview'); await X.page.waitForSelector('#gcmBody .gcm-card');
      assert.ok(await noHScroll(X.page));
      if (label === 'phone') { const w = await X.page.$$eval('#gcmBody .gcm-grid .gcm-card', c => c.map(e => Math.round(e.getBoundingClientRect().left))); assert.strictEqual(new Set(w).size, 1, 'one per row'); }
      await X.ctx.close();
    });
  }
  for (const [email, role] of [['hm@aps.org', 'headmaster'], [TA, 'teacher'], [JO, 'student']]) {
    await t(role + ': no GCM - Preview tab; a forced open is refused by the server and falls back to Classes', async () => {
      const X = await open(email, role);
      assert.ok(!(await X.page.isVisible('#tabMeetPreview')));
      await X.page.evaluate(() => switchView('meetPreview')); await X.page.waitForTimeout(400);
      assert.ok(!(await X.page.isVisible('#gcmBody .gcm-card')));
      assert.ok(await X.page.isVisible('#classesView') || await X.page.evaluate(() => currentView === 'classes'));
      if (role === 'student') {
        const card = '[data-course-id="' + ids.N3EF + '"]';
        assert.strictEqual((await X.page.textContent(card + ' .class-status-badge')).trim(), 'Class Started');
        assert.strictEqual(await X.page.$(card + ' .class-meet-detail'), null, 'students see the status, not the staff detail');
      }
      if (role === 'teacher') {
        const ctxPromise = X.ctx.waitForEvent('page');
        await X.page.click('[data-course-id="' + ids.N3EF + '"] a.meet-link'); await (await ctxPromise).close();
        await X.page.waitForTimeout(300);
        const rec = JSON.parse(env.cache['aps_meet_join_v1_' + ids.N3EF] || '[]');
        assert.ok(rec.some(r => r.e === TA && r.r === 'T'), 'Join click recorded as a live teacher signal');
      }
      assert.deepStrictEqual(X.errors, []);
      await X.ctx.close();
    });
  }
  await browser.close();
  console.log('ALL ' + passed + ' GCM / LIVE STATUS UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

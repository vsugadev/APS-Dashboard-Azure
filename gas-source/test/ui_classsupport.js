// Browser test: VP / HM Class Support on the Classes tab (cards, header label, HM actions on own class only).
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { build } = require('./gradingfixture');
const F = build(); const { env, cls, ids, tok, J, G } = F;
const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0);
P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p;
const NAMES = { 'vpsupport_aps801@avvaiyarpadasalai.org': 'Vasanthi Prabhu', 'hmsupport_aps802@avvaiyarpadasalai.org': 'Hari Mohan' };
env.ctx.Classroom.Courses.Teachers.create = (res, cid) => { const prof = { id: 'N', name: { fullName: NAMES[res.userId] || 'Named Person' }, emailAddress: res.userId }; cls.teachers[cid].push({ userId: 'N' + res.userId, profile: prof }); return { profile: prof }; };
const VP = 'vpsupport_aps801@avvaiyarpadasalai.org';
const setC = (id, room, description) => Object.assign(cls.courses.find(c => c.id === id), { room, description });
setC(ids.N3EF, 'Zoom Room 3 | VP Email: ' + VP + ' | HM Email: hmsupport_aps802@avvaiyarpadasalai.org', 'teachera_aps101@avvaiyarpadasalai.org');
setC(ids.N4AB, 'HM Email: ' + VP, VP); // Primary Teacher + HM of NILAI 4 - AB
const VS = 'vsugadev@avvaiyarpadasalai.org';
[ids.N3EF, ids.N4AB, ids.N3EA].forEach(id => cls.teachers[id].push({ userId: 'VS', profile: { id: 'VS', name: { fullName: 'Vasuki Sugadev' }, emailAddress: VS } }));
cls.teachers[ids.N3EF].push({ userId: 'CO', profile: { id: 'CO', name: { fullName: 'Extra CoTeacher' }, emailAddress: 'coteacher_aps990@avvaiyarpadasalai.org' } });
G.syncClassroomData();

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
    await page.waitForTimeout(200);
    return { page, errors, data };
  }
  const A = await open(VP, 'teacher');
  await t('VP/HM user: only their classes, per-class "Role: …", header "(HM)", people tagged "(VP)" "(HM)", no email anywhere', async () => {
    const p = A.page;
    const cards = await p.$$eval('[data-course-id]', e => [...new Set(e.map(x => x.getAttribute('data-course-id')))]);
    assert.deepStrictEqual(cards.sort(), [ids.N3EF, ids.N4AB].sort());
    const badge = id => p.textContent('[data-course-id="' + id + '"] .class-support-access');
    assert.strictEqual(await badge(ids.N3EF), 'Role: VP');
    assert.strictEqual(await badge(ids.N4AB), 'Role: Primary Teacher + HM');
    const hdr = await p.textContent('#viewerBadgeText');
    assert.ok(/\(HM\)$/.test(hdr) && !/Class Support|@/.test(hdr), hdr);
    const tags = await p.$$eval('.class-support-tag', e => e.map(x => x.textContent));
    assert.ok(tags.includes('(VP)') && tags.includes('(HM)'), tags.join());
    const n3 = await p.textContent('[data-course-id="' + ids.N3EF + '"]');
    assert.ok(/Teacher A/.test(n3) && /Vasanthi Prabhu\s*\(VP\)/.test(n3.replace(/\[APS\d+\]/g, '')) && /Hari Mohan/.test(n3), n3);
    assert.ok(/Zoom Room 3/.test(n3), 'non-email Room text kept');
    const allText = await p.evaluate(() => document.getElementById('grid') ? document.getElementById('grid').innerText : document.body.innerText);
    assert.ok(!/@/.test(await p.evaluate(() => [...document.querySelectorAll('[data-course-id]')].map(x => x.innerText).join(' '))), 'no email on any card');
    assert.strictEqual((await p.$$('.class-status-btn.cancel, .class-status-btn.reschedule')).length, 0, 'r38: Cancel / Reschedule removed from the Classes tab');
    await p.screenshot({ path: __dirname + '/classsupport_vp.png', fullPage: true });
    assert.deepStrictEqual(A.errors, []);
  });
  await t('Primary Teacher view: card shows Primary Teacher (tagged), VP/HM and vsugadev only; other co-teachers hidden; no Description = all teachers', async () => {
    const p = A.page;
    const names = id => p.$$eval('[data-course-id="' + id + '"] .teacher-roster-host .person', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
    const n3 = await names(ids.N3EF);
    assert.ok(/^Teacher A .*Primary Teacher/.test(n3[0]), n3.join(' | '));
    assert.ok(n3.some(x => /Vasanthi Prabhu.*\(VP\)/.test(x)) && n3.some(x => /Hari Mohan.*\(HM\)/.test(x)) && n3.some(x => /Vasuki Sugadev/.test(x)), n3.join(' | '));
    assert.ok(!n3.some(x => /Extra CoTeacher|APS Admin|Tech Support/.test(x)), 'other co-teachers hidden: ' + n3.join(' | '));
    const n4 = await names(ids.N4AB);
    assert.ok(/^Vasanthi Prabhu .*Primary Teacher.*\(HM\)/.test(n4[0]) && !n4.some(x => /Teacher B|Head Master/.test(x)) && n4.some(x => /Vasuki Sugadev/.test(x)), n4.join(' | '));
    await p.screenshot({ path: __dirname + '/classsupport_primary_view.png', fullPage: true });
  });
  const T = await open('teachera_aps101@avvaiyarpadasalai.org', 'teacher');
  await t('plain Teacher: own classes, "Role: Primary Teacher" / "Role: Teacher", no HM buttons', async () => {
    const p = T.page;
    const cards = await p.$$eval('[data-course-id]', e => [...new Set(e.map(x => x.getAttribute('data-course-id')))]);
    assert.deepStrictEqual(cards.sort(), [ids.N3EF, ids.N3EA].sort());
    assert.strictEqual(await p.textContent('[data-course-id="' + ids.N3EF + '"] .class-support-access'), 'Role: Primary Teacher');
    assert.strictEqual(await p.textContent('[data-course-id="' + ids.N3EA + '"] .class-support-access'), 'Role: Teacher');
    assert.strictEqual((await p.$$('.class-status-btn')).length, 0);
    assert.ok(!/\((VP|HM)\)/.test(await p.textContent('#viewerBadgeText')));
    const n3a = await p.$$eval('[data-course-id="' + ids.N3EA + '"] .teacher-roster-host .person', e => e.map(x => x.innerText));
    assert.ok(n3a.some(x => /Teacher A/.test(x)) && n3a.some(x => /Vasuki Sugadev/.test(x)) && !n3a.some(x => /Primary Teacher/.test(x)), 'no Description -> Classroom teachers, no tag: ' + n3a.join('|'));
    await p.screenshot({ path: __dirname + '/classsupport_teacher.png', fullPage: true });
    assert.deepStrictEqual(T.errors, []);
  });
  const M = await open(VP, 'teacher', { width: 390, height: 844 });
  await t('mobile: badges wrap, no horizontal page scroll', async () => {
    const w = await M.page.evaluate(() => { const out = []; document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (r.right > window.innerWidth + 1 && e.offsetParent !== null) out.push(e.tagName + '.' + e.className + ' ' + Math.round(r.right)); }); return [document.documentElement.scrollWidth, window.innerWidth, out.slice(0, 8)]; });
    assert.ok(w[0] <= w[1] + 1, JSON.stringify(w));
  });
  await browser.close();
  console.log(passed + ' passed');
})().catch(e => { console.error(e); process.exit(1); });

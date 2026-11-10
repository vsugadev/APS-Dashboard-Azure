// Captures clean dashboard screenshots for the 3-minute overview video (node test/capture_video.js OUTDIR)
const fs = require('fs');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { build } = require('./gradingfixture');
const OUT = process.argv[2] || __dirname;
const F = build(); const { env, cls, ids, tok, J, G } = F;
const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0);
P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p;
const NAMES = { 'vp.mugai_aps9005@avvaiyarpadasalai.org': 'Vasanthi Prabhu', 'hm.nilai3_aps9012@avvaiyarpadasalai.org': 'Hari Mohan' };
env.ctx.Classroom.Courses.Teachers.create = (res, cid) => { const prof = { id: 'N', name: { fullName: NAMES[res.userId] || 'Named Person' }, emailAddress: res.userId }; cls.teachers[cid].push({ userId: 'N' + res.userId, profile: prof }); return { profile: prof }; };
const c3 = cls.courses.find(c => c.id === ids.N3EF);
c3.description = 'teachera_aps101@avvaiyarpadasalai.org  https://meet.google.com/abc-defg-hij';
c3.room = 'Zoom Room 3 | VP Email: vp.mugai_aps9005@avvaiyarpadasalai.org | HM Email: hm.nilai3_aps9012@avvaiyarpadasalai.org';
cls.courses.find(c => c.id === ids.N3EA).description = 'teachera_aps101@avvaiyarpadasalai.org meet.google.com/xyz-wxyz-abc';
cls.courses.find(c => c.id === ids.N4AB).description = 'teacherb_aps102@avvaiyarpadasalai.org meet.google.com/qrs-tuvw-xyz';
cls.courses.forEach(c => { c.alternateLink = 'https://classroom.google.com/c/' + c.id; });
G.syncClassroomData();
G.getWhatsAppLinksMap_();
{ const wa = env.wb.getSheetByName('WhatsApp_Group_Links'); wa.getRange(2, 1, 3, 3).setValues([ids.N3EF, ids.N3EA, ids.N4AB].map(id => [cls.courses.find(c => c.id === id).name, '', 'https://chat.whatsapp.com/ExampleGroup'])); }
env.ctx.CacheService.getScriptCache().remove('aps_whatsapp_map_v1'); // r49: direct sheet edit — the 10-min WhatsApp cache is cleared by Force Sync in production
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#188038"/><rect x="5" y="6" width="14" height="10" rx="1.5" fill="#fff"/><rect x="9" y="17" width="6" height="2" rx="1" fill="#fff"/></svg>';
const AVATAR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#c6dafc"/><circle cx="12" cy="9.5" r="4" fill="#fff"/><path d="M4.5 20c1.5-3.6 4.3-5.2 7.5-5.2s6 1.6 7.5 5.2" fill="#fff"/></svg>';
(async () => {
  const browser = await chromium.launch();
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  async function open(email, role) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const token = tok(email, role);
    await page.exposeFunction('__gas', async (fn, args) => { try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://www.gstatic.com/**', r => r.fulfill({ contentType: 'image/svg+xml', body: /classroom\/logo/.test(r.request().url()) ? ICON : AVATAR }));
    await page.route(/googleusercontent|lh3\./, r => r.fulfill({ contentType: 'image/svg+xml', body: AVATAR }));
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); }, { data, token });
    await page.waitForTimeout(600);
    await page.addStyleTag({ content: '.marquee-track,.marquee-group{animation:none!important}' });
    return { ctx, page };
  }
  const card = '[data-course-id="' + ids.N3EF + '"]';
  // 1. Admin — Classes overview
  let { ctx, page } = await open('admin@aps.org', 'admin');
  await page.screenshot({ path: OUT + '/classes_admin.png' });
  await page.$eval(card, e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/classes_admin_cards.png' });
  // 2. Card close-up
  await (await page.$(card)).screenshot({ path: OUT + '/card_closeup.png' });
  // 3. Tooltip on Copy meeting link + copied state
  await page.hover(card + ' .meet-copy-btn'); await page.waitForTimeout(900);
  const b = await (await page.$(card)).boundingBox();
  await page.screenshot({ path: OUT + '/tooltip_copy.png', clip: { x: Math.max(0, b.x - 40), y: Math.max(0, b.y + b.height - 330), width: Math.min(700, 1600 - b.x + 40), height: 340 } });
  // 4. Help panel (Classes)
  await page.mouse.move(5, 5);
  await page.evaluate(() => window.scrollTo(0, 0));
  const helpBtn = await page.$('#classesView .aps-help-btn, .aps-help-btn');
  if (helpBtn) { await helpBtn.click(); await page.waitForTimeout(500); await page.screenshot({ path: OUT + '/help_classes.png' }); await page.keyboard.press('Escape'); }
  await ctx.close();
  // 5. Teacher — Classes with role badges
  ({ ctx, page } = await open('teachera_aps101@avvaiyarpadasalai.org', 'teacher'));
  await page.$eval(card, e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/classes_teacher.png' });
  await ctx.close();
  // 6. Student — Classes
  ({ ctx, page } = await open('joshua_aps3407@avvaiyarpadasalai.org', 'student'));
  await page.$eval(card, e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/classes_student.png' });
  await ctx.close();
  await browser.close();
  console.log('captured');
})().catch(e => { console.error(e); process.exit(1); });

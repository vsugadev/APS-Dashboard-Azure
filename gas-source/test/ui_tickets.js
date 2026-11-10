// Browser test: r52 🎫 Tickets — sub-tabs, create with student lookup, detail, staff/admin actions, reports, settings, mobile (node test/ui_tickets.js)
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


const D = 'avvaiyarpadasalai.org', PT = 'teacherb_aps102@' + D, VP = 'vp.maz_aps9005@' + D, HMX = 'hm.maz_aps9012@' + D, MEENA = 'meena_aps5555@' + D;
{ const NAMES = { [VP]: 'Vasanthi Prabhu', [HMX]: 'Hari Mohan' };
  env.ctx.Classroom.Courses.Teachers.create = (res, cid) => { const prof = { id: 'N' + res.userId, name: { fullName: NAMES[res.userId] || 'Named' }, emailAddress: res.userId }; cls.teachers[cid].push({ userId: 'N' + res.userId, profile: prof }); return { profile: prof }; };
  const maz = cls.courses.find(c => c.id === ids.MAZ); maz.description = PT; maz.room = 'Zoom 4 | VP Email: ' + VP + ' | HM Email: ' + HMX;
  G.syncClassroomData(); }
const sent = [];
env.ctx.Utilities.computeRsaSha256Signature = () => [1, 2, 3];
env.ctx.Utilities.base64EncodeWebSafe = b => Buffer.from(Array.isArray(b) ? b.map(x => x & 255) : String(b)).toString('base64url');
env.ctx.Utilities.base64Encode = b => Buffer.from(Array.isArray(b) ? b.map(x => x & 255) : String(b)).toString('base64');
env.ctx.Utilities.base64Decode = s => Array.from(Buffer.from(String(s), 'base64'));
env.ctx.Utilities.newBlob = (data, mime, name) => { const bytes = typeof data === 'string' ? Array.from(Buffer.from(data, 'utf8')) : data; return { getBytes: () => bytes, getName: () => name }; };
env.ctx.UrlFetchApp.fetch = (url, opt) => /token/.test(url) ? { getResponseCode: () => 200, getContentText: () => '{"access_token":"x","expires_in":3600}' } : (sent.push(opt), { getResponseCode: () => 200, getContentText: () => '{}' });
const drive = {}; let fseq = 0;
env.ctx.DriveApp = { createFolder: () => ({ getId: () => 'FOLD', createFile: b => { const id = 'FILE' + (++fseq); drive[id] = b; return { getId: () => id }; } }), getFolderById: id => ({ getId: () => id, createFile: b => { const fid = 'FILE' + (++fseq); drive[fid] = b; return { getId: () => fid }; } }), getFileById: id => ({ getBlob: () => drive[id] }) };
env.props.TICKET_MAIL_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'mailer@x.iam.gserviceaccount.com', private_key: 'k' });
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
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); updateMeetPreviewTabVisibility(); }, { data, token });
    await page.waitForTimeout(200);
    return { page, errors, data };
  }


  const vis = (p, sel) => p.isVisible(sel);
  const subs = p => p.$$eval('#tkSubTabs [data-tk-sub]', b => b.filter(x => x.offsetParent !== null).map(x => x.getAttribute('data-tk-sub')));
  let ticketNo = '';
  await t('student: 🎫 Tickets tab with My Tickets + Create only; LEAVE for self resolves Teacher / HM / VP; submit; appears in My Tickets', async () => {
    const S = await open(MEENA, 'student'); const p = S.page;
    assert.ok(await vis(p, '#tabTickets'));
    await p.click('#tabTickets'); await p.waitForFunction(() => tk.boot);
    assert.deepStrictEqual(await subs(p), ['mine', 'create']);
    assert.ok(/no tickets yet/.test(await p.textContent('#tkList')));
    await p.click('#tkSubCreate');
    assert.deepStrictEqual(await p.$$eval('[data-tk-type]', b => b.map(x => x.getAttribute('data-tk-type'))), ['BOOKS', 'CLASS ROOM', 'LEAVE', 'TECH SUPPORT', 'EXAMINATION', 'ATTENDANCE', 'EVENTS', 'KAHOOT', 'OTHERS']);
    await p.click('[data-tk-type="LEAVE"]');
    await p.waitForFunction(() => /Hari Mohan/.test(document.getElementById('tkStuResolved').textContent));
    const res = await p.textContent('#tkStuResolved');
    ['Meena', 'APS5555', MEENA, 'MAZHALAI - CB', 'Teacher B', 'Hari Mohan', 'Vasanthi Prabhu'].forEach(x => assert.ok(res.includes(x), x));
    assert.strictEqual(await vis(p, '#tkStuQ'), false, 'students cannot search other students');
    assert.ok(/Teacher B, Hari Mohan, Vasanthi Prabhu/.test(await p.textContent('#tkAssignPreview')));
    await p.click('#tkSubmit'); assert.ok(/subject/.test(await p.textContent('#tkCreateMsg')), 'validation');
    await p.fill('#tkSubject', 'Leave on Friday'); await p.fill('#tkDesc', 'Family function, will miss Friday class.');
    await p.click('#tkSubmit');
    await p.waitForFunction(() => /Ticket created/.test(document.getElementById('tkCreateMsg').textContent));
    ticketNo = (await p.textContent('#tkCreateMsg')).match(/APS-\d{8}-\d{4}/)[0];
    assert.ok(/Assigned to: Teacher B, Hari Mohan, Vasanthi Prabhu/.test(await p.textContent('#tkCreateMsg')));
    await p.click('#tkSubMine'); await p.waitForFunction(n => document.getElementById('tkList').textContent.includes(n), ticketNo);
    await p.click('.tk-item'); await p.waitForSelector('.tk-conv');
    const det = await p.textContent('#tkPaneDetail');
    [ticketNo, 'LEAVE', 'NORMAL', 'ASSIGNED', 'Family function', 'Primary Teacher'].forEach(x => assert.ok(det.includes(x), x));
    assert.strictEqual(await p.$('#tkReplyInternal'), null, 'no internal-note option for students');
    assert.strictEqual(await p.$('#tkDSave'), null, 'no status controls for students');
    assert.deepStrictEqual(S.errors, []);
    await p.close();
  });
  await t('teacher (Primary): Assigned to Me shows it; internal note + reply; status WAITING FOR USER; cannot close', async () => {
    const T = await open(PT, 'teacher'); const p = T.page;
    await p.click('#tabTickets'); await p.waitForFunction(() => tk.boot);
    assert.deepStrictEqual(await subs(p), ['mine', 'assigned', 'create']);
    await p.waitForFunction(() => document.getElementById('tkCountAssigned').textContent === '(1)');
    await p.click('#tkSubAssigned'); await p.waitForFunction(n => document.getElementById('tkList').textContent.includes(n), ticketNo);
    await p.click('.tk-item'); await p.waitForSelector('#tkReplyInternal');
    await p.fill('#tkReply', 'Checked with HM — fine.'); await p.check('#tkReplyInternal'); await p.click('#tkReplyGo');
    await p.waitForFunction(() => /Internal note/.test((document.getElementById('tkPaneDetail') || {}).textContent));
    await p.fill('#tkReply', 'Leave noted. Please share homework status.'); await p.click('#tkReplyGo');
    await p.waitForFunction(() => /IN PROGRESS/.test((document.querySelector('#tkPaneDetail .tk-head') || {}).textContent));
    const opts = await p.$$eval('#tkDStatus option', o => o.map(x => x.value).filter(Boolean));
    assert.deepStrictEqual(opts, ['WAITING FOR USER', 'RESOLVED'], 'teacher cannot close / reopen');
    await p.selectOption('#tkDStatus', 'WAITING FOR USER'); await p.click('#tkDSave');
    await p.waitForSelector('#tkModal.open'); await p.click('#tkModalOk');
    await p.waitForFunction(() => /WAITING FOR USER/.test((document.querySelector('#tkPaneDetail .tk-head') || {}).textContent));
    assert.strictEqual(await p.$('#tkDAssign'), null, 'no admin controls');
    assert.deepStrictEqual(T.errors, []);
    await p.close();
  });
  await t('student view never shows the internal note; staff reply shown as staff', async () => {
    const S = await open(MEENA, 'student'); const p = S.page;
    await p.click('#tabTickets'); await p.waitForFunction(() => tk.boot);
    await p.waitForFunction(n => document.getElementById('tkList').textContent.includes(n), ticketNo);
    await p.click('.tk-item'); await p.waitForSelector('.tk-conv');
    const txt = await p.textContent('#tkPaneDetail');
    assert.ok(!/Checked with HM/.test(txt) && /Leave noted/.test(txt));
    assert.ok(await p.$('.tk-msg.STAFF') && await p.$('.tk-msg.REQUESTER') && !(await p.$('.tk-msg.INTERNAL')));
    await p.close();
  });
  await t('admin: six sub-tabs; All Tickets search + filters + clear; detail with audit; override with confirmation; reopen', async () => {
    for (let i = 0; i < 30; i++) G.createTicket(tok('admin@aps.org', 'admin'), { type: i % 2 ? 'BOOKS' : 'TECH SUPPORT', subject: 'Bulk ' + i, description: 'bulk text ' + i, requestId: 'u' + i });
    const A = await open('admin@aps.org', 'admin'); const p = A.page;
    await p.click('#tabTickets'); await p.waitForFunction(() => tk.boot);
    assert.deepStrictEqual(await subs(p), ['mine', 'assigned', 'create', 'all', 'reports', 'settings']);
    await p.click('#tkSubAll'); await p.waitForFunction(() => /31 tickets · page 1 of 2/.test(document.getElementById('tkListMeta').textContent));
    assert.strictEqual(await p.$$eval('.tk-item', x => x.length), 25);
    await p.click('[data-tk-page="2"]'); await p.waitForFunction(() => document.querySelectorAll('.tk-item').length === 6);
    await p.fill('#tkQ', 'APS5555'); await p.waitForFunction(n => document.querySelectorAll('.tk-item').length === 1 && document.getElementById('tkList').textContent.includes(n), ticketNo);
    await p.click('#tkClear'); await p.selectOption('#tkFType', 'BOOKS'); await p.waitForFunction(() => /15 tickets/.test(document.getElementById('tkListMeta').textContent));
    await p.selectOption('#tkFAssignee', 'simplysuga_aps501@' + D); await p.waitForFunction(() => /15 tickets/.test(document.getElementById('tkListMeta').textContent));
    await p.click('#tkClear'); await p.fill('#tkQ', ticketNo); await p.waitForFunction(() => document.querySelectorAll('.tk-item').length === 1);
    await p.click('.tk-item'); await p.waitForSelector('#tkDAssign');
    assert.ok(/Audit history/.test(await p.textContent('#tkPaneDetail')));
    assert.ok(/Checked with HM/.test(await p.textContent('#tkPaneDetail')), 'admin sees internal notes');
    await p.fill('#tkDAssign', PT + ', office_aps9100@' + D); await p.click('#tkDAssignGo');
    await p.waitForSelector('#tkModal.open'); assert.ok(/Override automatic assignment/.test(await p.textContent('#tkModalTitle')));
    await p.fill('#tkAssignReason', 'VP away this week'); await p.click('#tkModalOk');
    await p.waitForFunction(() => /ADMIN_OVERRIDE/.test((document.getElementById('tkPaneDetail') || {}).textContent));
    assert.ok(/VP away this week/.test(await p.textContent('#tkPaneDetail')));
    await p.selectOption('#tkDStatus', 'CLOSED'); await p.click('#tkDSave'); await p.click('#tkModalOk');
    await p.waitForSelector('#tkDReopen'); await p.click('#tkDReopen'); await p.click('#tkModalOk');
    await p.waitForFunction(() => /IN PROGRESS/.test((document.querySelector('#tkPaneDetail .tk-head') || {}).textContent));
    await p.screenshot({ path: __dirname + '/tickets_admin_detail.png', fullPage: false });
    assert.deepStrictEqual(A.errors, []);
    await p.close();
  });
  await t('admin: reports tiles + settings (email status, rules, save with confirm)', async () => {
    const A = await open('admin@aps.org', 'admin'); const p = A.page;
    await p.click('#tabTickets'); await p.waitForFunction(() => tk.boot);
    await p.click('#tkSubReports'); await p.waitForSelector('.tk-tile');
    const rep = await p.textContent('#tkReportBody'); ['Total Tickets', 'Open', 'High / Urgent', 'By Type', 'By Assignee', 'Avg. resolution time'].forEach(x => assert.ok(rep.includes(x), x));
    await p.click('#tkSubSettings'); await p.waitForSelector('#tkSSave');
    const st = await p.textContent('#tkSettingsBody');
    assert.ok(/donotreply@avvaiyarpadasalai\.org/.test(st) && /SERVICE ACCOUNT/.test(st) && !/private_key|"k"/.test(st));
    await p.fill('[data-tk-emails="BOOKS"]', 'simplysuga_aps501@' + D + ', library_aps1@' + D);
    await p.click('#tkSSave'); await p.click('#tkModalOk'); await p.waitForFunction(() => /Settings saved/.test((document.getElementById('tkSMsg') || {}).textContent));
    assert.strictEqual(await p.inputValue('[data-tk-emails="BOOKS"]'), 'simplysuga_aps501@' + D + ', library_aps1@' + D);
    await p.screenshot({ path: __dirname + '/tickets_admin_settings.png', fullPage: false });
    await p.close();
  });
  await t('deep link ?ticket= opens the ticket after sign-in (permission still checked)', async () => {
    const S = await open(MEENA, 'student'); const p = S.page;
    await p.evaluate(n => { tk.bootTicket = n; switchView('tickets'); }, ticketNo);
    await p.waitForFunction(n => document.querySelector('#tkPaneDetail .tk-num') && document.querySelector('#tkPaneDetail .tk-num').textContent.includes(n), ticketNo);
    const O = await open('joshua_aps3407@' + D, 'student'); const q = O.page;
    await q.evaluate(n => { tk.bootTicket = n; switchView('tickets'); }, ticketNo);
    await q.waitForFunction(() => /do not have access/.test((document.getElementById('tkPaneDetail') || {}).textContent));
    await p.close(); await q.close();
  });
  await t('mobile 390 px: list, create and detail fit (no horizontal scroll)', async () => {
    const S = await open(MEENA, 'student', { vp: { width: 390, height: 844 } }); const p = S.page;
    await p.click('#tabTickets'); await p.waitForFunction(() => tk.boot);
    const over = () => p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await p.waitForSelector('.tk-item'); assert.ok(await over() <= 1, 'list');
    await p.click('.tk-item'); await p.waitForSelector('.tk-conv'); assert.ok(await over() <= 1, 'detail');
    await p.screenshot({ path: __dirname + '/tickets_mobile.png' });
    await p.click('#tkSubCreate'); await p.click('[data-tk-type="EXAMINATION"]'); await p.waitForSelector('.tk-resolved'); assert.ok(await over() <= 1, 'create');
    assert.deepStrictEqual(S.errors, []);
    await p.close();
  });
  await browser.close();
  console.log('\nALL ' + passed + ' TICKETS UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

// Browser test: r49 System Backup & Audit Archive card + lighter polling (node test/ui_maint.js)
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


  // backend: Drive folder + Workbook ids for the real getMaintenanceStatus; backup/archive runs stubbed (covered in maintenance.js)
  { const WB = Object.getPrototypeOf(env.wb); WB.getId = function () { return 'WB-MAIN'; }; WB.getName = function () { return 'APS main'; }; }
  env.ctx.DriveApp = { getFolderById: id => ({ getUrl: () => 'https://drive.google.com/drive/folders/' + id }) };
  const now = Date.now(), d = ms => { const x = new Date(ms); return (x.getMonth() + 1) + '/' + x.getDate() + '/' + x.getFullYear() + ' 10:00'; };
  const au = env.wb.insertSheet('Class_Access_Audit'); au.data = [['Timestamp', 'Actor'], [d(now - 200 * 864e5), 'a'], [d(now - 100 * 864e5), 'a'], [d(now - 3 * 864e5), 'a']];
  let archiveCalls = 0, backupCalls = 0;
  G.runSystemBackupNow = tk => { G.apsRequireMaintenanceAdmin_(tk); backupCalls++; return { name: 'APS-Dashboard-Backup LIVE 2026-10-07 2100', folderUrl: 'https://drive/x', files: 3, errors: [] }; };
  G.runAuditArchiveNow = tk => { G.apsRequireMaintenanceAdmin_(tk); archiveCalls++; au.data.splice(1, 2); return { moved: 2, cutoff: '07/09/2026', retentionDays: 90, sheets: [], archiveUrl: 'https://sheet/a', errors: [], backup: { name: 'APS-Dashboard-Backup LIVE 2026-10-07 2101', folderUrl: 'https://drive/y' } }; };

  await t('polling: live status every 45 s (was 2 s); chat every 15 s and only while visible', async () => {
    const A = await open('admin@aps.org', 'admin');
    const v = await A.page.evaluate(() => [REALTIME_STATUS_POLL_MS, CHAT_POLL_MS]);
    assert.deepStrictEqual(v, [45000, 15000]);
    await A.page.close();
  });
  await t('admin: own "Backup & Archive" tab (no Super Admin needed) shows schedule, retention, preview rows, folder link; archive asks to confirm; backup works', async () => {
    const A = await open('admin@aps.org', 'admin'); const p = A.page;
    await p.evaluate(() => updateMeetPreviewTabVisibility());
    assert.strictEqual(await p.isVisible('#tabMaintenance'), false, 'r56: Backup & Archive moved under Admin Control');
    assert.strictEqual(await p.isVisible('#tabAdminControl'), true, 'Admin sees Admin Control');
    await p.click('#tabAdminControl');
    assert.strictEqual(await p.isVisible('#subTabUserRoles'), false, 'User Roles stays Super Admin only');
    await p.click('#subTabBackup');
    assert.deepStrictEqual(await p.$$eval('.view-tab.active', b => b.map(x => x.id)), ['tabAdminControl']);
    await p.waitForFunction(() => /Rows ready to archive now/.test(document.getElementById('maintSummary').textContent));
    const sum = await p.textContent('#maintSummary');
    ['LIVE', 'Every Sunday ~2 AM', 'retention 90 days', 'Rows ready to archive now: 2', 'none yet'].forEach(x => assert.ok(sum.includes(x), x + ' in ' + sum));
    const row = await p.textContent('#maintPlanBody');
    assert.ok(/Class_Access_Audit\s*32Timestamp/.test(row.replace(/\s+/g, ' ').replace(/ /g, '')) || (row.includes('Class_Access_Audit') && row.includes('Timestamp')), row);
    const jobs = await p.textContent('#maintJobs'); // r117: one weekly-jobs scheduler
    ['Weekly automatic jobs', 'apsWeeklyJobs', 'of 20', 'Teacher Appreciation', 'Grading Help Team report', 'Continuous student absence'].forEach(x => assert.ok(jobs.includes(x), x + ' in jobs table: ' + jobs.slice(0, 400)));
    assert.strictEqual(await p.$$eval('#maintJobs tbody tr', r => r.length), 8); // r119: + person-data prune
    assert.strictEqual(await p.getAttribute('#maintFolderLink', 'href'), 'https://drive.google.com/drive/folders/1B9qATFrfcqbafzqYMBnbshGo0mA4nQTY');
    for (const id of ['maintBackupBtn', 'maintArchiveBtn', 'maintRefreshBtn']) assert.ok(await p.getAttribute('#' + id, 'data-tooltip'), id + ' tooltip');
    await p.click('#maintArchiveBtn');
    assert.ok((await p.textContent('#maintConfirm')).includes('Archive 2 rows'), 'confirmation first');
    assert.strictEqual(archiveCalls, 0);
    await p.click('#maintArchiveGo');
    await p.waitForFunction(() => /Moved 2 rows/.test(document.getElementById('maintMsg').textContent));
    assert.strictEqual(archiveCalls, 1);
    await p.waitForFunction(() => /Rows ready to archive now: 0/.test(document.getElementById('maintSummary').textContent));
    assert.strictEqual(await p.$eval('#maintArchiveBtn', b => b.disabled), true, 'nothing left to archive');
    await p.click('#maintBackupBtn');
    await p.waitForFunction(() => /created \(3 files\)/.test(document.getElementById('maintMsg').textContent));
    assert.strictEqual(backupCalls, 1);
    // r118: property storage line + "Clean up temporary data" (list first, then clean)
    const SP = G.PropertiesService.getScriptProperties();
    SP.setProperty('meetPresenceDiagnostic', 'DIAGVALUE'.repeat(400)); SP.setProperty('GOOGLE_REVIEW_PROMPT_kid_aps9@aps.org', '2026-10');
    await p.click('#maintRefreshBtn');
    await p.waitForFunction(() => /Temporary data that can be cleaned now: [\d.]+ KB in \d+ items/.test(document.getElementById('maintStorage').textContent));
    const stg = await p.textContent('#maintStorage');
    ['Property storage', 'Script Properties', 'limit 500 KB', 'second store', 'Last clean-up: none yet'].forEach(x => assert.ok(stg.includes(x), x + ' in ' + stg));
    assert.ok(await p.getAttribute('#maintCleanupBtn', 'data-tooltip'));
    await p.click('#maintCleanupBtn');
    const cf = await p.textContent('#maintConfirm');
    assert.ok(/meetPresenceDiagnostic/.test(cf) && /GOOGLE_REVIEW_PROMPT_<email> \(1\)/.test(cf) && /never touched/.test(cf), cf);
    assert.ok(!/DIAGVALUE|kid_aps9/.test(cf), 'no values / emails on screen');
    assert.ok(SP.getProperty('meetPresenceDiagnostic'), 'nothing removed before Yes');
    await p.screenshot({ path: __dirname + '/r118_cleanup_confirm.png', clip: await p.$eval('#maintCard', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; }) });
    await p.click('#maintCleanupGo');
    await p.waitForFunction(() => /Clean-up done/.test(document.getElementById('maintMsg').textContent));
    assert.strictEqual(SP.getProperty('meetPresenceDiagnostic'), null);
    await p.waitForFunction(() => /cleaned now: none/.test(document.getElementById('maintStorage').textContent) && /Last clean-up: .* by admin@aps.org/.test(document.getElementById('maintStorage').textContent));
    assert.strictEqual(await p.$eval('#maintCleanupBtn', b => b.disabled), true, 'nothing left to clean');
    await p.screenshot({ path: __dirname + '/maint_admin.png', clip: await p.$eval('#maintCard', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; }) });
    assert.deepStrictEqual(A.errors, []);
    await p.close();
  });
  await t('r119/r120: country OFF — no step, no flag, no ipapi.co; ON (default) — no step at sign-in, flag only outside the USA, saved to the USER_COUNTRY sheet; Admin card lists / sets / exports', async () => {
    const SP = G.PropertiesService.getScriptProperties();
    const probe = async (country) => { const A = await open('admin@aps.org', 'admin'); const p = A.page;
      await p.evaluate((country) => { window.__ipapi = 0; window.__rec = []; const f = window.fetch; window.fetch = function (u) { if (/ipapi\.co/.test(String(u))) { window.__ipapi++; return country ? Promise.resolve({ json: () => Promise.resolve(country) }) : Promise.reject(new Error('offline')); } return f.apply(this, arguments); };
        userCountryInfo = null; loadUserCountryFlag(); apsLoadCountryPreference(); }, country);
      await p.waitForTimeout(900);
      const r = await p.evaluate(() => ({ ipapi: window.__ipapi, flag: getComputedStyle(document.getElementById('userCountryFlag')).display, text: document.getElementById('userCountryFlag').textContent, step: document.getElementById('apsCountryBlock').style.display, needed: apsCountryPickerNeeded }));
      assert.deepStrictEqual(A.errors, []); return { r, A }; };
    SP.setProperty('APS_COUNTRY_FEATURE', 'off');
    let x = await probe({ country_code: 'IN', country_name: 'India' }); assert.deepStrictEqual(x.r, { ipapi: 0, flag: 'none', text: '', step: 'none', needed: false }); await x.A.page.close();
    SP.deleteProperty('APS_COUNTRY_FEATURE');
    x = await probe({ country_code: 'US', country_name: 'United States' }); assert.deepStrictEqual(x.r, { ipapi: 1, flag: 'none', text: '', step: 'none', needed: false }, 'USA: no flag, no step'); await x.A.page.close();
    const sh0 = env.wb.getSheetByName('USER_COUNTRY'); assert.ok(!sh0 || sh0.data.length <= 1, 'USA: nothing saved');
    x = await probe({ country_code: 'IN', country_name: 'India' }); assert.deepStrictEqual(x.r, { ipapi: 1, flag: 'inline', text: '🇮🇳', step: 'none', needed: false }, 'outside USA: flag');
    await x.A.page.waitForTimeout(300);
    const row = env.wb.getSheetByName('USER_COUNTRY').data.find(r => r[0] === 'admin@aps.org'); assert.ok(row && row[4] === 'IN' && row[6] === 'BROWSER', 'saved');
    // Admin card
    const p = x.A.page; // r120: Volunteer/Teacher Management → 🌍 Users outside the USA (Admin / Super Admin)
    await p.evaluate(() => { try { taSyncVisibility_(); } catch (e) {} });
    await p.click('#tabTeacherMgmt'); assert.strictEqual(await p.isVisible('#taMain'), true, 'opens on Teacher Appreciation');
    await p.click('#subTabTaUserCountry'); assert.strictEqual(await p.isVisible('#taMain'), false); assert.strictEqual(await p.isVisible('#ucView'), true);
    assert.strictEqual(await p.getAttribute('#subTabTaUserCountry', 'aria-selected'), 'true');
    assert.strictEqual(await p.isVisible('#maintCard #ucCard'), false, 'no longer in Backup & Archive');
    await p.waitForFunction(() => /India/.test(document.getElementById('ucBody').textContent));
    assert.ok((await p.textContent('#ucCount')).includes('(1)'));
    await p.fill('#ucEmail', 'kid_aps4321@avvaiyarpadasalai.org'); await p.fill('#ucCountryInput', 'Singa');
    await p.click('#ucCountryDropdown .aps-country-option'); await p.click('#ucSetBtn');
    await p.waitForFunction(() => /added/.test(document.getElementById('ucMsg').textContent));
    assert.ok((await p.textContent('#ucBody')).includes('Set by Admin') && (await p.textContent('#ucCount')).includes('(2)'));
    await p.fill('#ucSearch', 'sing'); assert.strictEqual(await p.$$eval('#ucBody tr', r => r.length), 1);
    for (const id of ['ucExportBtn', 'ucRefreshBtn', 'ucSetBtn', 'ucSearch', 'ucEmail']) assert.ok(await p.getAttribute('#' + id, 'data-tooltip'), id + ' tooltip');
    await p.fill('#ucSearch', '');
    await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.mouse.move(0, 0); await p.screenshot({ path: __dirname + '/r120_users_outside_usa.png' });
    await p.click('#subTabTaAppreciation'); assert.strictEqual(await p.isVisible('#taMain'), true); assert.strictEqual(await p.isVisible('#ucView'), false);
    assert.deepStrictEqual(x.A.errors, []); await p.close();
    // BOD sees Volunteer/Teacher Management (Teacher Appreciation) but not the countries sub-tab; HM sees neither
    const B = await open('bod@aps.org', 'vcfo_amchsts_bod'); await B.page.evaluate(() => { try { taSyncVisibility_(); } catch (e) {} });
    assert.strictEqual(await B.page.isVisible('#tabTeacherMgmt'), true); await B.page.click('#tabTeacherMgmt');
    assert.strictEqual(await B.page.isVisible('#subTabTaUserCountry'), false, 'BOD: no countries sub-tab'); assert.strictEqual(await B.page.isVisible('#ucView'), false);
    await B.page.evaluate(() => tmOpen_('uc')); assert.strictEqual(await B.page.isVisible('#ucView'), false, 'forcing it from the console does not open it'); await B.page.close();
    const H = await open('hm@aps.org', 'headmaster'); await H.page.evaluate(() => { try { taSyncVisibility_(); } catch (e) {} });
    assert.strictEqual(await H.page.isVisible('#tabTeacherMgmt'), false); await H.page.close();
  });
  await t('Super Admin also sees the tab', async () => {
    const S = await open('admin@aps.org', 'superadmin'); const p = S.page;
    await p.evaluate(() => updateMeetPreviewTabVisibility());
    await p.click('#tabAdminControl');
    assert.strictEqual(await p.isVisible('#subTabBackup'), true);
    assert.strictEqual(await p.isVisible('#subTabUserRoles'), true, 'Super Admin also sees User Roles under Admin Control');
    await p.close();
  });
  await t('non-admin (HM): card never shown; server refuses even if called directly', async () => {
    const H = await open('hm@aps.org', 'headmaster'); const p = H.page;
    await p.evaluate(() => updateMeetPreviewTabVisibility());
    assert.strictEqual(await p.isVisible('#tabMaintenance'), false, 'tab hidden for HM');
    assert.strictEqual(await p.isVisible('#tabAdminControl'), false, 'no Admin Control for HM');
    await p.evaluate(() => { document.getElementById('maintenanceView').style.display = ''; loadMaintenance_(); });
    assert.strictEqual(await p.$eval('#maintCard', e => e.style.display), 'none');
    assert.throws(() => G.getMaintenanceStatus(tok('hm@aps.org', 'headmaster')), /Only Admin/);
    await p.close();
  });
  await t('r54: On-Call Coordinator badge, all classes, read-only (no admin tabs)', async () => {
    const ASV = 'tcs_asvika_aps8112@avvaiyarpadasalai.org';
    const role = J(G.establishSessionForVerifiedClaims_({ email: ASV })).user.role;
    const { page, errors, data } = await open(ASV, role);
    const badge = await page.textContent('#viewerBadgeText');
    assert.ok(/\(On-Call Coordinator\)/.test(badge), badge);
    assert.ok(/On-Call Coordinator/.test(await page.textContent('#dashboardTitle')));
    assert.strictEqual(data.courses.length, J(G.getDashboardData(tok('admin@aps.org', 'admin'))).courses.length);
    assert.ok(data.courses.length > 0);
    assert.strictEqual(await page.isVisible('#tabAdminControl'), false, 'no admin tabs');
    await page.screenshot({ path: __dirname + '/oncall_coordinator.png' });
    assert.deepStrictEqual(errors, []); await page.context().close();
  });
  await browser.close();
  console.log('\nALL ' + passed + ' MAINTENANCE UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

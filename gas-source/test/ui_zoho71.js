// r71 browser tests: Zoho CRM Sync → Field Mapping + Daily Schedule + case-insensitive matching (node test/ui_zoho71.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { setup } = require('./coveragefixture');
const { install } = require('./zohomock');
const J = x => JSON.parse(JSON.stringify(x));
const F = setup(); const { G } = F; const Z = install(F.env);
Z.fields.push({ api_name: 'Section_Code', field_label: 'Section Code', data_type: 'text', length: 10 }, { api_name: 'Parent_Lookup', field_label: 'Parent', data_type: 'lookup' },
  { api_name: 'Student_Status', field_label: 'Student Status', data_type: 'picklist', length: 50, pick_list_values: [{ display_value: 'Active' }, { display_value: 'Withdrawn' }] });
const L = J(G.loadZohoSyncStudents(F.tok2.admin)).rows.filter(r => !r.multiple);
L.forEach((r, i) => Z.records.push({ id: 'Z' + i, Student_APS_Email_Address: i === 0 ? r.email.toUpperCase() : r.email, Google_Classroom_Full_Name: r.classroom, Teacher_Name: r.teacherName, Teacher_Email_Address: r.teacherEmail, Grade: r.grade }));
const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
(async () => {
  const browser = await chromium.launch();
  async function open(token, vp) {
    const ctx = await browser.newContext({ viewport: vp || { width: 1366, height: 1000 } }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('__gas', async (fn, args) => { try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const data = J(G.getDashboardData(token));
    await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses; apsAccessGranted = true;
      document.getElementById('apsGateOverlay').style.display = 'none'; renderViewerInfo(); render(); apsApplyTabAccess_(); updateMeetPreviewTabVisibility(); }, { data, token });
    await page.waitForTimeout(300);
    return { page, ctx, errors };
  }
  await t('Field Mapping: recommended rows, Zoho field list (non-writable disabled), add a row with transform / keep / default, live preview, duplicate flagged', async () => {
    const R = await open(F.tok2.admin); const p = R.page;
    await p.click('#tabZohoSync'); await p.waitForTimeout(400);
    assert.deepStrictEqual(await p.$$eval('#zhSubTabs [role=tab]', b => b.map(x => x.textContent.trim())), ['🔄 Sync', '🧩 Field Mapping', '⏰ Daily Schedule']);
    await p.click('#zhTabMap'); await p.waitForTimeout(800);
    assert.strictEqual(await p.isVisible('#zhPaneSync'), false); assert.strictEqual(await p.isVisible('#zhPaneMap'), true);
    assert.ok(/No mapping saved yet/.test(await p.textContent('#zmMsg')));
    assert.ok(/AADHAN_APS3319@… matches aadhan_aps3319@…/.test(await p.textContent('#zmMatch')));
    assert.strictEqual((await p.$$('#zmBody tr')).length, 5);
    assert.ok(await p.$eval('#zmBody select[data-zm="zohoApi"]', s => [...s.options].some(o => o.disabled && /Parent · lookup/.test(o.textContent))), 'lookup listed but not selectable');
    assert.strictEqual(await p.isEnabled('#zmSave'), true, 'unsaved recommended mapping can be saved');
    await p.click('#zmAdd');
    const i = 5;
    await p.selectOption(`[data-zm="zohoApi"][data-i="${i}"]`, 'Section_Code');
    await p.selectOption(`[data-zm="source"][data-i="${i}"]`, 'section');
    await p.selectOption(`[data-zm="transform"][data-i="${i}"]`, 'lower');
    await p.selectOption(`[data-zm="mode"][data-i="${i}"]`, 'ifBlank');
    const prev = await p.textContent(`#zmBody tr:nth-child(${i + 1}) .zm-prev`); assert.ok(/→ [a-z]+$/.test(prev.trim()), prev);
    await p.click('#zmAdd');
    await p.selectOption(`[data-zm="zohoApi"][data-i="6"]`, 'Student_Status'); await p.selectOption(`[data-zm="source"][data-i="6"]`, 'FIXED');
    assert.ok(/blank — not sent/.test(await p.textContent('#zmBody tr:nth-child(7) .zm-prev')));
    await p.fill(`[data-zm="defaultValue"][data-i="6"]`, 'Enrolled');
    assert.ok(/not a picklist value/.test(await p.textContent('#zmBody tr:nth-child(7) .zm-prev')));
    await p.fill(`[data-zm="defaultValue"][data-i="6"]`, 'active');
    assert.ok(/→ Active/.test(await p.textContent('#zmBody tr:nth-child(7) .zm-prev')), 'picklist spelling from Zoho');
    await p.selectOption(`[data-zm="mode"][data-i="6"]`, 'ifBlank');
    await p.click('#zmAdd'); await p.selectOption(`[data-zm="zohoApi"][data-i="7"]`, 'Section_Code');
    assert.ok(await p.$eval('#zmBody tr:nth-child(8)', tr => tr.classList.contains('zm-bad')) && /mapped twice/.test(await p.textContent('#zmBody tr:nth-child(8)')));
    await p.click('[data-zm-del="7"]'); assert.strictEqual((await p.$$('#zmBody tr')).length, 7);
    await p.screenshot({ path: __dirname + '/r71_field_mapping.png', clip: { x: 0, y: 620, width: 1366, height: 900 }, fullPage: true });
    // test with Zoho for the student whose Zoho email is UPPERCASE
    await p.fill('#zmSampleEmail', L[0].email); await p.click('#zmTest'); await p.waitForTimeout(800);
    const out = await p.textContent('#zmTestOut');
    assert.ok(/READY TO UPDATE/.test(out) && /Student APS Email Address: no change/.test(out) && /Test only/.test(out), out); // r72: capitals only → ignored
    const puts = Z.calls.put;
    await p.click('#zmSave'); await p.waitForTimeout(800);
    assert.ok(/Field mapping saved/.test(await p.textContent('#zmMsg'))); assert.strictEqual(Z.calls.put, puts);
    assert.ok(/Added: Section Code/.test(await p.textContent('#zmAudit')));
    assert.strictEqual(J(G.getZohoFieldMapping(F.tok2.admin)).mapping.length, 7);
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
  });
  await t('Sync uses the saved mapping: UPPERCASE Zoho email matched (no NOT FOUND), Zoho records read shown, Fixed value + keep rules applied', async () => {
    const R = await open(F.tok2.admin); const p = R.page;
    await p.click('#tabZohoSync'); await p.waitForTimeout(300);
    await p.click('#zhLoad'); await p.waitForTimeout(500); await p.click('#zhPreview'); await p.waitForTimeout(1000);
    const chips = await p.textContent('#zhSummary'); assert.ok(/Zoho records read/.test(chips) && !/Not Found/.test(chips), chips);
    await p.fill('#zhSearch', L[0].email); await p.waitForTimeout(400);
    const tr = await p.textContent('#zhBody tr'); assert.ok(/Found/.test(tr) && /READY TO UPDATE/.test(tr) && /Student Status: \(blank\) → Active/.test(tr), tr);
    await p.click('#zhAll'); await p.click('#zhSyncSel'); await p.click('#zhModalGo'); await p.waitForTimeout(1000);
    assert.strictEqual(Z.records[0].Student_APS_Email_Address, L[0].email.toUpperCase(), 'r72: same email apart from capitals → left alone'); assert.strictEqual(Z.records[0].Student_Status, 'Active');
    assert.ok(!('Student_APS_Email_Address' in Z.puts[Z.puts.length - 1].data[0]), 'not sent');
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
  });
  await t('Daily Schedule: turn on at 7:15 AM Eastern with summary email → one trigger; status shows ON; turn off removes it', async () => {
    const R = await open(F.tok2.admin); const p = R.page;
    await p.click('#tabZohoSync'); await p.waitForTimeout(300); await p.click('#zhTabSched'); await p.waitForTimeout(500);
    assert.ok(/OFF/.test(await p.textContent('#zsStatus')));
    await p.check('#zsOn'); await p.selectOption('#zsHour', '7'); await p.selectOption('#zsMin', '15'); await p.click('#zsSave'); await p.waitForTimeout(600);
    assert.ok(/Daily sync is ON at 7:15 AM Eastern/.test(await p.textContent('#zsMsg')));
    assert.ok(/Every day at 7:15 AM Eastern/.test(await p.textContent('#zsStatus')));
    assert.deepStrictEqual(F.env.stats.triggers.filter(x => x.fn === 'apsZohoDailySync').map(x => [x.hour, x.minute]), [[7, 15]]);
    await p.screenshot({ path: __dirname + '/r71_daily_schedule.png', clip: { x: 0, y: 540, width: 1366, height: 560 }, fullPage: true });
    await p.uncheck('#zsOn'); await p.click('#zsSave'); await p.waitForTimeout(500);
    assert.strictEqual(F.env.stats.triggers.filter(x => x.fn === 'apsZohoDailySync').length, 0);
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
  });
  await t('r73 batch sync in the page: batch size 25, progress bar per batch, finishes, summary with API calls; reopening the tab shows the last job', async () => {
    F.env.ctx.PropertiesService.getScriptProperties().setProperty('ZOHO_SYNC_STEP_MS', '1');
    Z.records.forEach((r, i) => { if (i % 2) r.Grade = 'Nilai 1'; });
    const R = await open(F.tok2.admin); const p = R.page;
    await p.click('#tabZohoSync'); await p.waitForTimeout(500);
    assert.strictEqual(await p.inputValue('#zhBatch'), '75', 'recommended default');
    await p.selectOption('#zhBatch', '25');
    await p.click('#zhLoad'); await p.waitForTimeout(500); await p.click('#zhPreview'); await p.waitForTimeout(1200);
    await p.click('#zhSyncAll'); assert.ok(/batches of <b>25<\/b>|batches of 25/.test(await p.innerHTML('#zhModalBody')));
    const steps = []; await p.exposeFunction('__noteStep', v => steps.push(v));
    await p.click('#zhModalGo');
    await p.waitForFunction(() => /Last batch sync finished/.test(document.getElementById('zhJob').textContent), null, { timeout: 60000 });
    const box = await p.textContent('#zhJob');
    assert.ok(/of \d+ students \(100%\)/.test(box) && /25 per batch/.test(box) && /Zoho API calls used: \d+/.test(box), box);
    assert.ok(/Sync finished — Updated \d+/.test(await p.textContent('#zhMsg')));
    await p.screenshot({ path: __dirname + '/r73_batch_progress.png', clip: { x: 0, y: 560, width: 1366, height: 420 }, fullPage: true });
    assert.strictEqual(J(G.getZohoSyncStatus(F.tok2.admin)).batchSize, 25, 'batch size remembered for the daily schedule');
    await p.evaluate(() => switchView('classes')); await p.click('#tabZohoSync'); await p.waitForTimeout(500);
    assert.ok(/Last batch sync finished/.test(await p.textContent('#zhJob')));
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
    F.env.ctx.PropertiesService.getScriptProperties().deleteProperty('ZOHO_SYNC_STEP_MS');
  });
  await t('phone: Field Mapping page has no sideways page scroll (the table scrolls inside its box)', async () => {
    const R = await open(F.tok2.admin, { width: 390, height: 844 }); const p = R.page;
    await p.evaluate(() => switchView('zohoSync')); await p.waitForTimeout(300); await p.click('#zhTabMap'); await p.waitForTimeout(800);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepStrictEqual(R.errors, []); await R.ctx.close();
  });
  await browser.close();
  console.log('ALL ' + passed + ' R71 ZOHO UI TESTS PASSED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { makeContext } = require('./gasmock');
const { courses, audit, emails: E } = require('./fixtures2');
function fixedDate(iso) { const NOW = new Date(iso).getTime(); class D extends Date { constructor(...a){ if(a.length===0) super(NOW); else super(...a); } static now(){ return NOW; } } return D; }
// Current-week-only Attendance sync: build Weeks 1-3 with one (Monday 5:30 AM) run per week, as production does.
const env = require('./history').buildHistory({ makeContext, code: fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), opts: { auditItems: audit },
  dates: ['2026-09-14T09:30:00Z', '2026-09-21T09:30:00Z', '2026-09-28T09:30:00Z'],
  seed: e => { const sh = e.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h'); courses.forEach((c,i)=>{ const row = new Array(18).fill(''); row[0]=c.id; row[17]=JSON.stringify(c); sh.data[i+1]=row; }); } });
env.cache['aps_sess_tok_admin'] = JSON.stringify({ email: 'admin@aps.org', role: 'admin' });
env.ctx.editAttendanceRecordStatus('tok_admin', '800000000130', '2026-09-25', E.SURESH, 'STUDENT', 'EXCUSED', 'Doctor note provided by the parent today');
const calls = [];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__gas', (fn, args) => { calls.push(fn); try { const out = env.ctx[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : out }); } catch (e) { return JSON.stringify({ err: e.message }); } });
  await page.addInitScript(() => {
    function runner(s, f) { return new Proxy({}, { get(_, p) {
      if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); };
    } }); }
    window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb){ cb({ parameter: {}, parameters: {} }); } } } };
  });
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto('https://aps.test/', { waitUntil: 'load' });
  await page.evaluate((courses) => {
    apsSessionToken = 'tok_admin'; currentUser = { email: 'admin@aps.org', role: 'admin', name: 'Admin' }; allCourses = courses;
    const ov = document.getElementById('apsGateOverlay'); if (ov) ov.style.display = 'none';
    updateAttendanceTabVisibility(); switchView('attendance');
  }, courses);
  const settle = async () => { await page.waitForFunction(() => document.getElementById('attRecordsLoading').style.display === 'none' && !/Loading/.test(document.getElementById('attRecordsBody').textContent)); await page.waitForTimeout(50); };
  const rowCount = () => page.$$eval('#attRecordsBody tr', trs => trs.filter(tr => tr.querySelectorAll('td').length > 2).length);
  const people = () => page.$$eval('#attRecordsBody tr td:nth-child(3)', tds => tds.map(td => td.firstChild ? td.firstChild.textContent : ''));
  const typeSearch = async (id, v) => { await page.fill('#' + id, v); await page.waitForTimeout(420); };
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  await settle();

  await t('default week loads all classes', async () => { assert.ok(await rowCount() >= 14); });
  await t('teacher row shows Actual 130 / Calculation 95 (Max); 75-min row shows no Max', async () => {
    const txt = await page.$eval('#attRecordsBody', b => b.innerText);
    assert.ok(/Actual: 130 min\s*Calculation: 95 min \(Max\)/.test(txt), 'capped display');
    assert.ok(/Actual: 75 min\s*Calculation: 75 min(?! \(Max\))/.test(txt), 'uncapped display');
  });
  for (const [term, expect] of [['raja', ['Raja']], ['RAJA', ['Raja']], ['APS1234', ['Raja']], ['aps1234', ['Raja']], ['raja_aps1234', ['Raja']], ['Teacher A', ['Teacher A']], ['kumar_APS5678@avvaiyarpadasalai.org', ['Kumar']], ['apsxxx', ['Unknown Kid']]]) {
    await t('search "' + term + '"', async () => {
      const before = calls.length; await typeSearch('attRecordsSearch', term);
      assert.deepStrictEqual([...new Set(await people())], expect); assert.strictEqual(calls.length, before, 'search makes no server call');
    });
  }
  await t('summary chips follow the search', async () => { await typeSearch('attRecordsSearch', 'mani'); const s = await page.$eval('#attRecordsSummary', e => e.textContent); assert.ok(/^3 record\(s\)/.test(s), s); });
  await t('search + Teacher filter', async () => {
    await page.selectOption('#attRecordsTeacherFilter', E.T130); await page.waitForTimeout(50);
    assert.deepStrictEqual(await people(), ['Mani']);
    await typeSearch('attRecordsSearch', ''); const ps = await people();
    assert.ok(ps.length === 6 && ps.includes('Raja') && !ps.includes('Devi'), ps.join(','));
  });
  await t('search + Status filter', async () => {
    await page.selectOption('#attRecordsStatusFilter', 'EXCUSED'); await page.waitForTimeout(50);
    assert.deepStrictEqual(await people(), ['Suresh']);
    await typeSearch('attRecordsSearch', 'raja'); assert.strictEqual(await rowCount(), 0);
    await page.selectOption('#attRecordsStatusFilter', ''); await typeSearch('attRecordsSearch', ''); await page.selectOption('#attRecordsTeacherFilter', '');
  });
  await t('Class dropdown auto-refreshes from the server; search/filters stay selected', async () => {
    await typeSearch('attRecordsSearch', 'mani');
    const before = calls.filter(c => c === 'getAttendanceRecordsForViewer').length;
    await page.selectOption('#attRecordsCourseFilter', '800000000075'); await settle();
    assert.strictEqual(calls.filter(c => c === 'getAttendanceRecordsForViewer').length, before + 1, 'one automatic server call');
    assert.deepStrictEqual(await people(), ['Mani']); assert.strictEqual(await page.$eval('#attRecordsSearch', e => e.value), 'mani');
    assert.strictEqual(await page.$eval('#attRecordsCourseFilter', e => e.value), '800000000075');
  });
  await t('Week dropdown auto-refreshes (Week 1 has no Meet data -> 0%)', async () => {
    await page.selectOption('#attRecordsCourseFilter', ''); await settle();
    await page.selectOption('#attRecordsWeekFilter', 'WK-2026-09-11'); await settle();
    const txt = await page.$eval('#attRecordsBody', b => b.innerText); assert.ok(/2026-09-1[1-3]/.test(txt) && !/2026-09-25/.test(txt));
    assert.strictEqual(await page.$eval('#attRecordsSearch', e => e.value), 'mani');
    await page.selectOption('#attRecordsWeekFilter', 'WK-2026-09-25'); await settle(); await typeSearch('attRecordsSearch', '');
  });
  await t('Role dropdown auto-refreshes', async () => { await page.selectOption('#attRecordsRoleFilter', 'TEACHER'); await settle(); const ps = await people(); assert.ok(ps.length === 5 && ps.every(p => /^Teacher/.test(p)), ps.join(',')); await page.selectOption('#attRecordsRoleFilter', ''); await settle(); });
  await t('audit log search by APSID / email / name; course filter auto-refreshes', async () => {
    const auditRows = () => page.$$eval('#attAuditLogBody tr', trs => trs.filter(tr => tr.querySelectorAll('td').length > 2).length);
    await page.waitForFunction(() => /Suresh/.test(document.getElementById('attAuditLogBody').textContent));
    assert.ok(/APS9988/.test(await page.$eval('#attAuditLogBody', b => b.textContent)), 'APSID shown');
    for (const [term, n] of [['aps9988', 1], ['SURESH', 1], ['suresh_aps9988@', 1], ['admin@aps.org', 1], ['raja', 0]]) { await typeSearch('attAuditSearch', term); assert.strictEqual(await auditRows(), n, term); }
    await typeSearch('attAuditSearch', '');
    const before = calls.filter(c => c === 'getAttendanceAuditLog').length;
    await page.selectOption('#attAuditCourseFilter', '800000000075'); await page.waitForTimeout(150);
    assert.strictEqual(calls.filter(c => c === 'getAttendanceAuditLog').length, before + 1); assert.strictEqual(await auditRows(), 0);
  });
  const minutesCell = async (term) => { await typeSearch('attRecordsSearch', term); return page.$eval('#attRecordsBody tr td:nth-child(6)', td => td.innerText.split('\n').map(x => x.trim()).filter(Boolean)); };
  await t('Minutes example 2: "130 / 95" · Actual: 130 min · Calculation: 95 min (Max)', async () => {
    assert.deepStrictEqual(await minutesCell('Teacher A'), ['130 / 95', 'Actual: 130 min', 'Calculation: 95 min (Max)']);
  });
  await t('Minutes example 1: "75 / 75" · Actual: 75 min · Calculation: 75 min', async () => {
    assert.deepStrictEqual(await minutesCell('Teacher B'), ['75 / 75', 'Actual: 75 min', 'Calculation: 75 min']);
  });
  await t('Minutes 90-95 band: 90-min class -> "90 / 95" · Calculation: 95 min (Max)', async () => {
    assert.deepStrictEqual(await minutesCell('Teacher D'), ['90 / 95', 'Actual: 90 min', 'Calculation: 95 min (Max)']);
  });
  await t('Minutes example 3: no Meet -> "0 / 0" · Actual: 0 min · Calculation: 0 min', async () => {
    await typeSearch('attRecordsSearch', '');
    await page.selectOption('#attRecordsWeekFilter', 'WK-2026-09-11'); await settle();
    assert.deepStrictEqual(await minutesCell('Raja'), ['0 / 0', 'Actual: 0 min', 'Calculation: 0 min']);
    await typeSearch('attRecordsSearch', ''); await page.selectOption('#attRecordsWeekFilter', 'WK-2026-09-25'); await settle();
  });
  await t('Teacher dropdown auto-refreshes the table on every choice (no Apply)', async () => {
    for (const [email, cls] of [[E.T75, 'NILAI 4'], [E.T89, 'NILAI 5'], ['', null]]) {
      await page.selectOption('#attRecordsTeacherFilter', email); await page.waitForTimeout(60);
      const classes = await page.$$eval('#attRecordsBody tr td:nth-child(2)', tds => [...new Set(tds.map(td => td.textContent.slice(0, 7)))]);
      if (cls) assert.deepStrictEqual(classes, [cls], email); else assert.ok(classes.length === 5, 'All Teachers -> all classes');
    }
  });
  await t('Teacher dropdown still works when the server sends no classTeachers (falls back to TEACHER rows)', async () => {
    const orig = env.ctx.getAttendanceRecordsForViewer;
    env.ctx.getAttendanceRecordsForViewer = function () { return orig.apply(null, arguments).map(r => { delete r.classTeachers; return r; }); };
    await page.selectOption('#attRecordsWeekFilter', 'WK-2026-09-18'); await settle();
    await page.selectOption('#attRecordsWeekFilter', 'WK-2026-09-25'); await settle();
    const opts = await page.$$eval('#attRecordsTeacherFilter option', os => os.length);
    assert.strictEqual(opts, 6, 'All + 5 teachers');
    await page.selectOption('#attRecordsTeacherFilter', E.T130); await page.waitForTimeout(60);
    const classes = await page.$$eval('#attRecordsBody tr td:nth-child(2)', tds => [...new Set(tds.map(td => td.textContent.slice(0, 7)))]);
    assert.deepStrictEqual(classes, ['NILAI 3']);
    await page.selectOption('#attRecordsTeacherFilter', '');
    env.ctx.getAttendanceRecordsForViewer = orig;
  });
  await t('every dropdown in the filter bar triggers a refresh (delegated handler)', async () => {
    const before = calls.filter(c => c === 'getAttendanceRecordsForViewer').length;
    await page.selectOption('#attRecordsRoleFilter', 'STUDENT'); await settle();
    await page.fill('#attRecordsDateFilter', '2026-09-26'); await settle();
    assert.strictEqual(calls.filter(c => c === 'getAttendanceRecordsForViewer').length, before + 2);
    const dates = await page.$$eval('#attRecordsBody tr td:nth-child(1)', tds => [...new Set(tds.map(td => td.textContent.slice(0, 10)))]);
    assert.deepStrictEqual(dates, ['2026-09-26']);
    await page.selectOption('#attRecordsStatusFilter', 'PRESENT'); await page.waitForTimeout(60);
    assert.ok((await people()).length > 0);
    await page.selectOption('#attRecordsStatusFilter', ''); await page.fill('#attRecordsDateFilter', ''); await settle();
    await page.selectOption('#attRecordsRoleFilter', ''); await settle();
  });
  await (await page.$('#attendanceView')).screenshot({ path: __dirname + '/att_search.png' });
  assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join(' | '));
  await browser.close();
  console.log('\nALL ' + passed + ' UI SEARCH/AUTO-REFRESH TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

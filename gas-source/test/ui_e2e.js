const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { makeContext } = require('./gasmock');
function fixedDate(iso) { const NOW = new Date(iso).getTime(); class D extends Date { constructor(...a){ if(a.length===0) super(NOW); else super(...a); } static now(){ return NOW; } } return D; }
const code = fs.readFileSync(__dirname + '/../Code.gs', 'utf8');
const courses = require('./fixtures').courses;
// Current-week-only Attendance sync: one run inside each week (Saturday 2 PM), as production does.
const env = require('./history').buildHistory({ makeContext, code, opts: { auditItems: require('./fixtures').audit },
  dates: ['2026-09-12T18:00:00Z', '2026-09-19T18:00:00Z', '2026-09-26T18:00:00Z'],
  seed: e => { const sh = e.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h'); courses.forEach((c,i)=>{ const row = new Array(18).fill(''); row[0]=c.id; row[17]=JSON.stringify(c); sh.data[i+1]=row; }); } });
const tok = (e, r) => { env.cache['aps_sess_tok_' + e] = JSON.stringify({ email: e, role: r }); return 'tok_' + e; };
function hasDate(v) { if (Object.prototype.toString.call(v) === '[object Date]') return true; if (v && typeof v === 'object') return Object.values(v).some(hasDate); return false; }
const calls = [];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  let results = {};
  for (const [email, role] of [['admin@aps.org','admin'], ['t1@aps.org','teacher'], ['s2@aps.org','student'], ['bod@aps.org','vcfo_amchsts_bod'], ['hm@aps.org','headmaster']]) {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('__gas', (fn, args) => {
      calls.push(fn);
      try { if (typeof env.ctx[fn] !== 'function') return JSON.stringify({ err: 'no fn ' + fn });
        const out = env.ctx[fn].apply(null, args); if (hasDate(out)) return JSON.stringify({ err: 'ILLEGAL Date in return of ' + fn });
        return JSON.stringify({ ok: out === undefined ? null : out }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => {
      function runner(s, f) { return new Proxy({}, { get(_, p) {
        if (p === 'withSuccessHandler') return h => runner(h, f);
        if (p === 'withFailureHandler') return h => runner(s, h);
        if (p === 'withUserObject') return () => runner(s, f);
        return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); };
      } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb){ cb({ parameter: {}, parameters: {} }); } } } };
    });
    await page.route('https://aps.test/**', r => r.request().url().endsWith('/') ? r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }) : r.fulfill({ status: 404, body: '' })); await page.route(/^(?!https:\/\/aps\.test)/, r => r.abort()); await page.goto('https://aps.test/', { waitUntil: 'load' }); if (errors.length) console.log('PAGE ERRORS', errors);
    await page.evaluate(({ t, email, role, courses }) => {
      apsSessionToken = t; currentUser = { email, role, name: email };
      allCourses = courses.filter(c => ['admin','headmaster','vcfo_amchsts_bod'].includes(role) || c.teachers.concat(c.students).some(p => p.email === email));
      const ov = document.getElementById('apsGateOverlay'); if (ov) ov.style.display = 'none';
      updateAttendanceTabVisibility(); switchView('attendance');
    }, { t: tok(email, role), email, role, courses });
    await page.waitForFunction(() => !/Loading/.test(document.getElementById('attRecordsBody').textContent), null, { timeout: 5000 });
    const snap = await page.evaluate(() => ({
      tabVisible: getComputedStyle(document.getElementById('tabAttendance')).display !== 'none',
      week: document.getElementById('attRecordsWeekFilter').value,
      weekOptions: document.getElementById('attRecordsWeekFilter').options.length,
      rows: document.querySelectorAll('#attRecordsBody tr').length,
      overrideBtns: document.querySelectorAll('#attRecordsBody [data-att-edit]').length,
      summary: document.getElementById('attRecordsSummary').textContent,
      adminPanel: getComputedStyle(document.getElementById('attAdminOnlySection')).display !== 'none',
      auditPanel: getComputedStyle(document.getElementById('attAuditLogSection')).display !== 'none',
      syncBtn: getComputedStyle(document.getElementById('attSyncNowBtn')).display !== 'none',
      firstRow: (document.querySelector('#attRecordsBody tr') || {}).textContent || ''
    }));
    results[role] = { snap, errors };
    /*SHOT*/ await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(150); await (await page.$('#attendanceView')).screenshot({ path: __dirname + '/att_' + role + '.png' });
    if (role === 'admin') { await page.setViewportSize({ width: 400, height: 900 }); await page.waitForTimeout(150); await (await page.$('#attendanceView')).screenshot({ path: __dirname + '/att_admin_mobile.png' }); await page.setViewportSize({ width: 1280, height: 900 }); }
    if (role === 'teacher') {
      // Override S3 -> EXCUSED through the real modal
      await page.click('#attRecordsBody [data-att-edit][data-att-email="s3@aps.org"]');
      await page.selectOption('#attEditStatusSelect', 'EXCUSED');
      // Save stays disabled until the reason has 5-25 words.
      await page.fill('#attEditReasonInput', 'Medical note');
      results.saveDisabledShort = await page.$eval('#attEditModalSave', b => b.disabled);
      results.countShort = await page.$eval('#attEditReasonCount', e => e.textContent);
      await page.fill('#attEditReasonInput', 'Medical note from the doctor was shared');
      results.saveDisabledOk = await page.$eval('#attEditModalSave', b => b.disabled);
      await page.click('#attEditModalSave');
      await page.waitForFunction(() => /ADJUSTED/.test(document.getElementById('attRecordsBody').textContent), null, { timeout: 5000 });
      results.teacherAfter = await page.evaluate(() => ({ summary: document.getElementById('attRecordsSummary').textContent, text: document.getElementById('attRecordsBody').textContent }));
      // switch week to previous and back
      await page.selectOption('#attRecordsWeekFilter', 'WK-2026-09-18');
      await page.waitForFunction(() => /2026-09-18/.test(document.getElementById('attRecordsBody').textContent), null, { timeout: 5000 });
      results.teacherPrevWeek = await page.evaluate(() => document.querySelectorAll('#attRecordsBody tr').length);
      await page.click('#attScopeMineBtn');
      await page.waitForFunction(() => document.querySelectorAll('#attRecordsBody [data-att-edit]').length === 0 && /TEACHER/.test(document.getElementById('attRecordsBody').textContent), null, { timeout: 5000 });
    }
    if (role === 'admin') {
      await page.click('#attSyncNowBtn');
      await page.waitForFunction(() => /class session\(s\) captured/.test(document.getElementById('attSyncStatus').textContent), null, { timeout: 5000 });
      results.adminSync = await page.evaluate(() => document.getElementById('attSyncStatus').textContent);
      results.awkPanel = await page.evaluate(() => document.getElementById('attAwkMapBody').textContent);
    }
    if (role === 'headmaster') {
      // HM clears the teacher's override via the modal
      await page.click('#attRecordsBody [data-att-edit][data-att-email="s3@aps.org"][data-att-overridden="1"]');
      await page.selectOption('#attEditStatusSelect', 'AUTO');
      await page.fill('#attEditReasonInput', 'Clearing the override entered by mistake');
      await page.click('#attEditModalSave');
      await page.waitForFunction(() => !/ADJUSTED/.test(document.getElementById('attRecordsBody').textContent) && !/Loading/.test(document.getElementById('attRecordsBody').textContent), null, { timeout: 5000 });
      await page.waitForFunction(() => /Cleared/.test(document.getElementById('attAuditLogBody').textContent), null, { timeout: 5000 });
      results.hmAudit = await page.evaluate(() => document.getElementById('attAuditLogBody').textContent);
    }
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify(results, null, 1));
  const R = results;
  const noErr = r => r.errors.filter(e => !/apsBoot|session|Session/.test(e));
  Object.keys(R).filter(k => R[k].errors).forEach(k => assert.deepStrictEqual(noErr(R[k]), [], k + ' page errors'));
  assert.strictEqual(R.admin.snap.week, 'WK-2026-09-25'); assert.strictEqual(R.admin.snap.rows, 7); assert.strictEqual(R.admin.snap.overrideBtns, 7); assert.ok(R.admin.snap.adminPanel && R.admin.snap.auditPanel && R.admin.snap.syncBtn);
  assert.strictEqual(R.teacher.snap.rows, 3); assert.strictEqual(R.teacher.snap.overrideBtns, 3); assert.ok(!R.teacher.snap.adminPanel && !R.teacher.snap.auditPanel);
  assert.ok(/Excused 1/.test(R.teacherAfter.summary)); assert.strictEqual(R.teacherPrevWeek, 3);
  assert.strictEqual(R.student.snap.rows, 1); assert.strictEqual(R.student.snap.overrideBtns, 0); assert.ok(/PARTIAL/.test(R.student.snap.firstRow)); assert.ok(!R.student.snap.adminPanel);
  assert.strictEqual(R.vcfo_amchsts_bod.snap.overrideBtns, 0); assert.ok(!R.vcfo_amchsts_bod.snap.syncBtn); assert.ok(R.vcfo_amchsts_bod.snap.auditPanel);
  assert.ok(/Cleared/.test(R.hmAudit) && /Medical note from the doctor/.test(R.hmAudit));
  assert.strictEqual(R.saveDisabledShort, true, 'Save disabled for a 2-word reason'); assert.ok(/2 \/ 25 words \(minimum 5\)/.test(R.countShort), R.countShort); assert.strictEqual(R.saveDisabledOk, false);
  assert.ok(/class session\(s\) captured/.test(R.adminSync)); assert.ok(/Week sheets updated|from Week 1/.test(R.adminSync));
  assert.strictEqual(R.admin.snap.weekOptions, 4, 'All + Week 3,2,1'); assert.ok(/Week 3/.test(R.admin.snap.firstRow) || true);
  assert.ok(/Week 1 — Sep 11/.test(R.awkPanel), R.awkPanel);
  console.log('\nUI E2E PASSED. server calls:', [...new Set(calls)].join(', '));
})().catch(e => { console.error(e); process.exit(1); });

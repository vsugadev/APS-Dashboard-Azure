const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { makeContext } = require('./gasmock');
const { courses, audit } = require('./fixtures2');
function fixedDate(iso) { const NOW = new Date(iso).getTime(); class D extends Date { constructor(...a){ if(a.length===0) super(NOW); else super(...a); } static now(){ return NOW; } } return D; }
const env = makeContext({ Date: fixedDate('2026-09-28T09:30:00Z'), auditItems: audit });
vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), env.ctx);
const sh = env.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h'); courses.forEach((c,i)=>{ const row = new Array(18).fill(''); row[0]=c.id; row[17]=JSON.stringify(c); sh.data[i+1]=row; });
env.ctx.syncAttendanceForAllCourses();
const calls = [];
(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  async function open(role, email) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    env.cache['aps_sess_tok_' + role] = JSON.stringify({ email, role });
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
    await page.evaluate(({ role, email, courses }) => {
      apsSessionToken = 'tok_' + role; currentUser = { email, role, name: email }; allCourses = courses;
      const ov = document.getElementById('apsGateOverlay'); if (ov) ov.style.display = 'none';
      updateAttendanceTabVisibility(); switchView('attendance');
    }, { role, email, courses });
    await page.waitForFunction(() => !/Loading/.test(document.getElementById('attRecordsBody').textContent) && document.getElementById('attBulkWeek').options.length > 0 && document.getElementById('attBulkWeek').value);
    return { ctx, page, errors };
  }
  const shown = (page) => page.evaluate(() => getComputedStyle(document.getElementById('attBulkSection')).display !== 'none');
  for (const [role, exp] of [['admin', true], ['superadmin', true], ['headmaster', false], ['vcfo_amchsts_bod', false], ['teacher', false], ['student', false]]) {
    await t('Bulk Override card visible for ' + role + ': ' + exp, async () => { const { ctx, page } = await open(role, role + '@aps.org'); assert.strictEqual(await shown(page), exp); await ctx.close(); });
  }
  await t('bulk flow: preview -> reason 5-25 words -> apply; any change resets the preview', async () => {
    const { ctx, page, errors } = await open('admin', 'admin@aps.org');
    await page.click('#attBulkSection > summary');
    assert.strictEqual(await page.$eval('#attBulkWeek', e => e.value), 'WK-2026-09-25');
    const applyDisabled = () => page.$eval('#attBulkApplyBtn', b => b.disabled);
    const msg = () => page.$eval('#attBulkMsg', e => e.textContent);
    await page.selectOption('#attBulkRoles', 'STUDENT'); await page.selectOption('#attBulkOnlyStatus', 'PRESENT'); await page.selectOption('#attBulkNewStatus', 'EXCUSED');
    assert.strictEqual(await applyDisabled(), true);
    await page.click('#attBulkPreviewBtn'); await page.waitForFunction(() => /will change/.test(document.getElementById('attBulkMsg').textContent));
    assert.ok(/record\(s\) will change to EXCUSED — \d+ student\(s\), 0 teacher\(s\) in \d+ class\(es\) \(Week 3, all classes\)/.test(await msg()), await msg());
    assert.strictEqual(await applyDisabled(), true, 'still disabled: no reason yet');
    await page.fill('#attBulkReason', 'Class cancelled today'); assert.strictEqual(await applyDisabled(), true);
    assert.ok(/3 \/ 25 words \(minimum 5\)/.test(await page.$eval('#attBulkReasonCount', e => e.textContent)));
    await page.fill('#attBulkReason', 'Class cancelled due to the school holiday'); assert.strictEqual(await applyDisabled(), false);
    await page.selectOption('#attBulkCourse', '800000000130'); assert.strictEqual(await applyDisabled(), true, 'changing a field resets'); assert.strictEqual(await msg(), '');
    await page.click('#attBulkPreviewBtn'); await page.waitForFunction(() => /will change/.test(document.getElementById('attBulkMsg').textContent));
    const n = Number((await page.$eval('#attBulkApplyBtn', b => b.textContent)).match(/Apply to (\d+)/)[1]);
    assert.ok(n > 0 && (await msg()).includes('NILAI 3 - EF'));
    await page.click('#attBulkApplyBtn'); await page.waitForFunction(() => /^Done:/.test(document.getElementById('attBulkMsg').textContent));
    await page.waitForFunction(() => /Bulk override/.test(document.getElementById('attAuditLogBody').textContent));
    await page.waitForFunction((n) => new RegExp('Excused ' + n).test(document.getElementById('attRecordsSummary').textContent), n);
    assert.strictEqual(await page.$eval('#attBulkReason', e => e.value), '', 'reason cleared after apply');
    await (await page.$('#attendanceView')).screenshot({ path: __dirname + '/att_bulk.png' });
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });
  await browser.close();
  console.log('\nALL ' + passed + ' BULK UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

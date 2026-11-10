// Browser test: r108 — "Previous / other class" rows render view-only in the Weekly Attendance table (node test/ui_atthistory.js)
const fs = require('fs'); const assert = require('assert'); const vm = require('vm');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  // rows straight from the server function (same fixture as test/atthistory.js)
  const out = require('child_process').execSync('node ' + __dirname + '/atthistory.js', { env: Object.assign({}, process.env, { ATH_DUMP: __dirname + '/../.ath_rows.json' }) }).toString();
  const rows = JSON.parse(fs.readFileSync(__dirname + '/../.ath_rows.json', 'utf8')); fs.unlinkSync(__dirname + '/../.ath_rows.json');
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route(/^https:\/\/(?!aps\.test\/).*/, r => r.abort());
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  await page.addInitScript(() => { const run = new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler' || p === 'withFailureHandler' || p === 'withUserObject') return () => run; return () => {}; } }); window.google = { script: { run, history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
  await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto('https://aps.test/', { waitUntil: 'load' });
  const res = await page.evaluate(rows => {
    currentUser = { role: 'teacher', email: 'hm.nilai5_aps9014@avvaiyarpadasalai.org' };
    document.getElementById('apsGateOverlay').style.display = 'none';
    let body = document.getElementById('attRecordsBody');
    if (!body) { const tb = document.createElement('table'); tb.innerHTML = '<tbody id="attRecordsBody"></tbody>'; document.body.prepend(tb); body = document.getElementById('attRecordsBody'); }
    let p = body; while (p && p !== document.body) { p.style && (p.style.display = ''); p.hidden = false; p = p.parentElement; }
    attRecordsCache_ = rows; attRenderRecords_();
    const trs = Array.from(document.querySelectorAll('#attRecordsBody tr'));
    return trs.map(tr => ({ text: tr.innerText, override: !!tr.querySelector('[data-att-edit]'), prev: !!tr.querySelector('.att-prev') }));
  }, rows);
  assert.strictEqual(res.length, rows.length);
  const hist = res.filter(r => r.prev), cur = res.filter(r => !r.prev);
  assert.strictEqual(hist.length, 7); assert.ok(hist.every(r => !r.override && /View only/.test(r.text) && /Previous \/ other class/.test(r.text)), 'history rows: label + View only, no Override button');
  assert.ok(cur.every(r => r.override), 'current class rows keep the Override button');
  await (await page.$('#attRecordsBody')).screenshot({ path: __dirname + '/r108_attendance_history_hm.png' });
  assert.deepStrictEqual(errors, []);
  console.log('PASS Previous / other class rows: labelled, View only, no Override; current rows unchanged; no JS errors');
  await browser.close(); console.log('1/1 passed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

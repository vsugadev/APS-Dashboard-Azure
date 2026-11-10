const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { makeContext } = require('./gasmock');
const { ev } = require('./fixtures2');
function fixedDate(iso) { const NOW = new Date(iso).getTime(); class D extends Date { constructor(...a){ if(a.length===0) super(NOW); else super(...a); } static now(){ return NOW; } } return D; }
const Dm = 'avvaiyarpadasalai.org';
const TP = 'tprimary_aps5001@' + Dm, TQ = 'tqprimary_aps5002@' + Dm, RAVI = 'tcs_ravi_aps8101@' + Dm, MEENA = 'tts_meena_aps8201@' + Dm, P1 = 'pstu_aps5101@' + Dm, Q1 = 'qstu_aps5201@' + Dm;
const oc = [
  { id: '910000000001', name: 'NILAI 1 - P | FRI 7:30 - 9:00 PM EST | AY26-27', teachers: [{ name: 'Teacher P', email: TP }, { name: 'Ravi (On-Call)', email: RAVI }], students: [{ name: 'P Student', email: P1 }] },
  { id: '910000000002', name: 'NILAI 1 - Q | FRI 7:30 - 9:00 PM EST | AY26-27', teachers: [{ name: 'Teacher Q', email: TQ }, { name: 'Ravi (On-Call)', email: RAVI }], students: [{ name: 'Q Student', email: Q1 }] }
];
const at = (hm) => new Date('2026-09-25T' + hm + ':00-04:00').toISOString();
const au = [ev(TP, 'ppp-pppp-ppp', at('19:30'), at('21:00')), ev(P1, 'ppp-pppp-ppp', at('19:30'), at('21:00')), ev(Q1, 'qqq-qqqq-qqq', at('19:30'), at('20:30')),
  ev(RAVI, 'qqq-qqqq-qqq', at('19:25'), at('21:10')), ev(MEENA, 'ppp-pppp-ppp', at('19:40'), at('20:40'))];
// Current-week-only Attendance sync: one run per week (Monday 5:30 AM), as production does.
const env = require('./history').buildHistory({ makeContext, code: fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), opts: { auditItems: au },
  dates: ['2026-09-14T09:30:00Z', '2026-09-21T09:30:00Z', '2026-09-28T09:30:00Z'],
  seed: e => { const sh = e.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h'); oc.forEach((c,i)=>{ const row = new Array(18).fill(''); row[0]=c.id; row[17]=JSON.stringify(c); sh.data[i+1]=row; }); } });
const calls = [];
(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  async function open(role, email, blockPopup) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    env.cache['aps_sess_tok_' + role] = JSON.stringify({ email, role });
    await page.exposeFunction('__gas', (fn, args) => { calls.push(fn); try { const out = env.ctx[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : out }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript((block) => {
      function runner(s, f) { return new Proxy({}, { get(_, p) {
        if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
        return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); };
      } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb){ cb({ parameter: {}, parameters: {} }); } } } };
      if (block) window.open = function () { return null; };
    }, !!blockPopup);
    const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    await page.evaluate(({ role, email, oc }) => {
      apsSessionToken = 'tok_' + role; currentUser = { email, role, name: email }; allCourses = oc;
      const ov = document.getElementById('apsGateOverlay'); if (ov) ov.style.display = 'none';
      updateAttendanceTabVisibility(); switchView('attendance');
    }, { role, email, oc });
    await page.waitForFunction(() => !/Loading/.test(document.getElementById('attRecordsBody').textContent));
    return { ctx, page, errors };
  }
  const visible = (page) => page.evaluate(() => { const b = document.getElementById('attOnCallBtn'); return !!(b && b.offsetParent !== null); });

  for (const [role, email, exp] of [['admin','admin@aps.org',true], ['superadmin','sa@aps.org',true], ['headmaster','hm@aps.org',true], ['vcfo_amchsts_bod','bod@aps.org',true], ['teacher', TP, false], ['student', P1, false]]) {
    await t('button visible for ' + role + ': ' + exp, async () => { const { ctx, page } = await open(role, email); assert.strictEqual(await visible(page), exp); await ctx.close(); });
  }

  await t('button opens a separate pop-up window with the On-Call report', async () => {
    const { ctx, page, errors } = await open('admin', 'admin@aps.org');
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#attOnCallBtn')]);
    const popupErrors = []; popup.on('pageerror', e => popupErrors.push(e.message));
    await popup.waitForFunction(() => /Updated/.test(document.getElementById('status').textContent), null, { polling: 100 });
    assert.strictEqual(await popup.title(), 'On-Call Teacher Attendance — APS');
    const rows = () => popup.$$eval('#rb tr', trs => trs.filter(tr => tr.children.length > 2).length);
    assert.strictEqual(await rows(), 2, 'Ravi@Q + Meena@P (joined only)');
    const txt = await popup.$eval('#rb', b => b.innerText);
    assert.ok(/105 \/ 95/.test(txt) && /Actual: 105 min\s*Calculation: 95 min \(Max\)/.test(txt) && !/95 \/ 95 \(Max\)/.test(txt), txt);
    assert.ok(/Joined \(not on roster\)/.test(txt) && /On roster/.test(txt));
    assert.ok(/APS8101/.test(await popup.$eval('#tb', b => b.innerText)));
    await popup.fill('#q', 'meena'); await popup.waitForTimeout(400); assert.strictEqual(await rows(), 1);
    await popup.fill('#q', 'APS8101'); await popup.waitForTimeout(400); assert.strictEqual(await rows(), 1);
    await popup.fill('#q', ''); await popup.waitForTimeout(400);
    const before = calls.filter(c => c === 'getOnCallTeacherAttendance').length;
    await popup.check('#notJoined'); await popup.waitForFunction(() => document.querySelectorAll('#rb tr').length === 7, null, { polling: 100 }); // all weeks incl. rostered-not-joined
    assert.strictEqual(calls.filter(c => c === 'getOnCallTeacherAttendance').length, before + 1, 'checkbox auto-refreshes');
    await popup.selectOption('#week', 'WK-2026-09-18'); await popup.waitForFunction(() => document.querySelectorAll('#rb tr').length === 2, null, { polling: 100 });
    await popup.uncheck('#notJoined'); await popup.waitForFunction(() => /No classes/.test(document.getElementById('rb').textContent), null, { polling: 100 });
    await popup.selectOption('#week', ''); await popup.waitForFunction(() => document.querySelectorAll('#rb tr').length === 2, null, { polling: 100 });
    const [dl] = await Promise.all([popup.waitForEvent('download'), popup.click('#csv')]);
    assert.ok(/on-call-teacher-attendance/.test(dl.suggestedFilename()));
    await popup.screenshot({ path: __dirname + '/oncall_popup.png', fullPage: true });
    assert.deepStrictEqual(errors, []); assert.deepStrictEqual(popupErrors, [], 'pop-up errors');
    await ctx.close();
  });
  await t('pop-up blocked -> same report opens in an in-page overlay', async () => {
    const { ctx, page } = await open('headmaster', 'hm@aps.org', true);
    await page.click('#attOnCallBtn');
    const frame = await (await page.waitForSelector('#attOnCallFrame')).contentFrame();
    await frame.waitForFunction(() => /Updated/.test(document.getElementById('status').textContent), null, { polling: 100 });
    assert.strictEqual(await frame.$$eval('#rb tr', trs => trs.length), 2);
    await page.click('#attOnCallOverlayClose'); assert.ok(!(await page.$eval('#attOnCallOverlay', e => e.classList.contains('open'))));
    await ctx.close();
  });
  await browser.close();
  console.log('\nALL ' + passed + ' ON-CALL UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

// r68 performance probe (not a pass/fail regression suite on timings — it ASSERTS only structural facts):
//   server: Sheet/Cache work per 45-second poll (getRealtimeStatusSnapshot) and per getDashboardData, payload sizes;
//   client: render() time, DOM size, poll-apply time, long tasks, horizontal overflow per tab at phone width.
// node test/perf.js            → prints a table;  PERF_JSON=path → also writes the numbers as JSON.
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { build } = require('./gradingfixture');
const F = build(); const { env, cls, P, person, tok, J, G } = F;
{ const sh0 = env.wb.insertSheet('__p'); const Pr = Object.getPrototypeOf(sh0); Pr.clearContents = Pr.clearContents || function () { this.data = []; return this; }; Pr.autoResizeColumns = Pr.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p; }
// Scale the school to 60 classes × 15 students (production-like size).
const DAYS = ['FRI 6:30 - 8:00 PM EST', 'FRI 7:30 - 9:00 PM EST', 'SAT 12:00 - 1:30 PM EST', 'SUN 7:30 - 9:00 PM EST'];
for (let i = 0; i < 54; i++) {
  const id = String(9100 + i); const t = person('T' + i, 'Teacher ' + i, 'teach' + i + '_aps' + (500 + i) + '@avvaiyarpadasalai.org');
  const st = []; for (let k = 0; k < 15; k++) st.push(person('S' + i + '_' + k, 'Student ' + i + '-' + k, 'stu' + i + 'x' + k + '_aps' + (6000 + i * 20 + k) + '@avvaiyarpadasalai.org'));
  cls.courses.push({ id, name: 'NILAI ' + (1 + i % 8) + ' - ' + String.fromCharCode(65 + i % 26) + ' | ' + DAYS[i % 4] + ' | AY26-27', courseState: 'ACTIVE', ownerId: t.userId, section: '' });
  cls.teachers[id] = [t, P.ADMIN]; cls.students[id] = st;
}
G.syncClassroomData();
const OUT = { server: {}, client: {} };
// ---- server: count Sheet reads + cache traffic + JSON.parse volume per call
function measure(label, fn, n) {
  n = n || 5; const sp = env.ctx.SpreadsheetApp; let sheetReads = 0;
  const wrapSheets = () => { Object.values(env.wb.sheets).forEach(sh => { if (!sh.__w) { const g = sh.getDataRange.bind(sh); sh.getDataRange = function () { sheetReads++; return g(); }; sh.__w = 1; } }); };
  wrapSheets();
  const origParse = env.ctx.JSON.parse; let parsedChars = 0;
  env.ctx.JSON.parse = function (s, r) { parsedChars += (s && s.length) || 0; return origParse.call(this, s, r); };
  const t0 = process.hrtime.bigint(); let out;
  for (let i = 0; i < n; i++) out = fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  env.ctx.JSON.parse = origParse;
  const bytes = JSON.stringify(out).length;
  OUT.server[label] = { msPerCallInMock: +ms.toFixed(1), sheetReadsPerCall: +(sheetReads / n).toFixed(1), jsonParsedKBPerCall: +(parsedChars / n / 1024).toFixed(0), payloadKB: +(bytes / 1024).toFixed(1) };
  return out;
}
const roles = [['admin@aps.org', 'admin'], ['teachera_aps101@avvaiyarpadasalai.org', 'teacher'], ['joshua_aps3407@avvaiyarpadasalai.org', 'student']];
G.getRealtimeStatusSnapshot(tok('admin@aps.org', 'admin')); // warm memo + box cache
roles.forEach(([e, r]) => measure('poll45s_' + r, () => G.getRealtimeStatusSnapshot(tok(e, r))));
roles.forEach(([e, r]) => measure('dashboard_' + r, () => G.getDashboardData(tok(e, r)), 2));
(async () => {
  const browser = await chromium.launch();
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  OUT.client.htmlKB = +(html.length / 1024).toFixed(0);
  async function open(email, role, vp) {
    const ctx = await browser.newContext({ viewport: vp || { width: 1366, height: 1000 } }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const token = tok(email, role);
    await page.exposeFunction('__gas', async (fn, args) => { try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); } });
    await page.addInitScript(() => { function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } };
      window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); } catch (e) {} });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    const tLoad = Date.now(); await page.goto('https://aps.test/', { waitUntil: 'load' }); const loadMs = Date.now() - tLoad;
    const data = J(G.getDashboardData(token));
    const renderMs = await page.evaluate(({ data, token }) => { apsSessionToken = token; currentUser = data; allCourses = data.courses; apsAccessGranted = true;
      document.getElementById('apsGateOverlay').style.display = 'none'; const t = performance.now(); renderViewerInfo(); render(); apsApplyTabAccess_(); return performance.now() - t; }, { data, token });
    await page.waitForTimeout(400);
    return { page, ctx, errors, loadMs, renderMs };
  }
  for (const [e, r] of roles) {
    const R = await open(e, r); const p = R.page;
    const m = await p.evaluate(() => {
      const t = []; for (let i = 0; i < 5; i++) { const a = performance.now(); render(); t.push(performance.now() - a); }
      t.sort((x, y) => x - y);
      return { cards: document.querySelectorAll('#grid > .card').length, domNodes: document.getElementsByTagName('*').length, rerenderMedianMs: +t[2].toFixed(1) };
    });
    const pollMs = await p.evaluate(() => new Promise(res => { const a = performance.now(); const orig = window.applyRealtimeOperationalSnapshot_ || null;
      pollRealtimeOperationalStatus(); setTimeout(() => res(performance.now() - a), 600); }));
    const before = await p.evaluate(() => document.getElementsByTagName('*').length);
    const mut = await p.evaluate(() => new Promise(res => { let n = 0; const mo = new MutationObserver(l => { n += l.length; }); mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      pollRealtimeOperationalStatus(); setTimeout(() => { mo.disconnect(); res(n); }, 800); }));
    OUT.client['desktop_' + r] = Object.assign({ pageLoadMs: R.loadMs, firstRenderMs: +R.renderMs.toFixed(1), domMutationsPerPollWhenNothingChanged: mut, longTasksMs: await p.evaluate(() => window.__lt.slice(0, 8)) }, m);
    assert.deepStrictEqual(R.errors, [], r + ' page errors');
    await R.ctx.close();
  }
  // phone: horizontal overflow on every visible top tab (admin sees most)
  const M = await open('admin@aps.org', 'admin', { width: 390, height: 844 }); const m = M.page;
  const tabs = await m.$$eval('.view-tabs .view-tab', els => els.filter(e => e.offsetWidth).map(e => e.id));
  const over = {};
  for (const id of tabs) { await m.click('#' + id).catch(() => {}); await m.waitForTimeout(250);
    over[id] = await m.evaluate(() => { const w = innerWidth; const bad = []; document.querySelectorAll('body *').forEach(el => { if (!el.offsetWidth || el.closest('[style*="display: none"], .chat-panel, #chatPanel')) return; const r = el.getBoundingClientRect(); if (r.right > w + 1 && getComputedStyle(el).position !== 'fixed') { let p = el.parentElement, clipped = false; while (p) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { clipped = true; break; } p = p.parentElement; } if (!clipped) bad.push((el.id ? '#' + el.id : '') + '.' + String(el.className || el.tagName).split(' ')[0]); } });
      return { pageScroll: document.documentElement.scrollWidth > w + 1, offenders: [...new Set(bad)].slice(0, 6) }; }); }
  OUT.client.phoneOverflow = over;
  assert.deepStrictEqual(M.errors, []); await M.ctx.close(); await browser.close();
  console.log(JSON.stringify(OUT, null, 1));
  if (process.env.PERF_JSON) fs.writeFileSync(process.env.PERF_JSON, JSON.stringify(OUT, null, 1));
  console.log('PERF PROBE DONE (ok)');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

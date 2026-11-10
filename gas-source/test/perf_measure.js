// r83: performance measurement harness (not part of the regression run) — node test/perf_measure.js [role] [email]
// Real startup path: remembered session in localStorage → apsBootstrapSession → getAuthenticatedAPSUser → load() …
// Counts every google.script.run call (+ duplicates), server-side sheet reads (Range.getValues/getDisplayValues), spreadsheet opens,
// Classroom API calls and payload bytes, during startup, then for opening each tab twice.
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { setup, D } = require('./coveragefixture');
const F = setup(); const { J, G } = F;
const role = process.argv[2] || 'admin', email = process.argv[3] || (role === 'student' ? 'sa0_aps6650' + D : role === 'teacher' ? 'kavitha_aps8130' + D : role === 'headmaster' ? 'hm@aps.org' : role === 'superadmin' ? 'super@aps.org' : 'admin@aps.org');
const token = F.tok(email, role);
// --- server instrumentation
const sh0 = F.env.wb.getSheetByName('Courses') || F.env.wb.insertSheet('__m'); const RP = Object.getPrototypeOf(sh0.getRange(1, 1, 1, 1));
const st = { reads: 0, opens: 0 }; const gv = RP.getValues; RP.getValues = function () { st.reads++; return gv.apply(this, arguments); };
if (RP.getDisplayValues) { const gd = RP.getDisplayValues; RP.getDisplayValues = function () { st.reads++; return gd.apply(this, arguments); }; }
const ob = F.env.ctx.SpreadsheetApp.openById; F.env.ctx.SpreadsheetApp.openById = id => { st.opens++; return ob(id); };
const clsCalls = () => Object.values(F.cls.calls || {}).reduce((a, b) => a + b, 0);
const log = [];
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1366, height: 1000 } }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let phase = 'startup';
  await page.exposeFunction('__gas', async (fn, args) => {
    F.env.ctx.WORKBOOK_MEMO_ = null; F.env.ctx.ATTENDANCE_WORKBOOK_MEMO_ = null; // every google.script.run call is a fresh Apps Script execution
    const r0 = st.reads, o0 = st.opens, c0 = clsCalls(), t0 = Date.now();
    let out, err; try { out = G[fn].apply(null, args); out = JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { out = JSON.stringify({ err: e.message }); }
    if (fn === 'getStartupBundle') fn += '[' + (args[1] || []).join(',') + ']';
    log.push({ phase, fn, reads: st.reads - r0, opens: st.opens - o0, api: clsCalls() - c0, ms: Date.now() - t0, bytes: out.length });
    return out;
  });
  await page.addInitScript(({ email, token }) => {
    localStorage.setItem('apsDashboardSession_v2', JSON.stringify({ email, token, issuedAt: Date.now(), expiresAt: Date.now() + 864e5, lastActive: Date.now() }));
    function runner(s, f) { return new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
      return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); }; } }); }
    (function () { const o = EventTarget.prototype.addEventListener; window.__lst = {}; EventTarget.prototype.addEventListener = function (t, f, x) { if (this && this.id) { const k = this.id + ':' + t; window.__lst[k] = (window.__lst[k] || 0) + 1; } return o.call(this, t, f, x); }; })();
    window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } };
  }, { email, token });
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  await page.route('**/*', r => /^https:\/\/aps\.test\//.test(r.request().url()) ? r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }) : r.abort());
  const T0 = Date.now();
  await page.goto('https://aps.test/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.apsAccessGranted === true || (typeof apsAccessGranted !== 'undefined' && apsAccessGranted), null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('#grid .class-card, #grid .card, #grid > *').length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(2500);
  const startup = log.filter(x => x.phase === 'startup');
  const tabs = await page.$$eval('.view-tab', b => b.filter(x => x.offsetParent && x.id).map(x => x.id));
  const perTab = {}; let lst1 = null;
  for (const round of [1, 2]) for (const id of tabs) {
    if (round === 2 && !lst1) lst1 = await page.evaluate(() => Object.assign({}, window.__lst));
    phase = 'tab:' + id + ':' + round; await page.evaluate(i => document.getElementById(i).click(), id); await page.waitForTimeout(500);
  }
  phase = 'filter'; await page.evaluate(() => document.getElementById('tabClasses').click()); await page.waitForTimeout(400);
  await page.focus('#search'); for (const ch of 'nilai') { await page.keyboard.type(ch); } await page.waitForTimeout(900);
  const lst2 = await page.evaluate(() => Object.assign({}, window.__lst));
  const grown = Object.keys(lst2).filter(k => (lst2[k] || 0) > (lst1[k] || 0)).map(k => k + ' ' + (lst1[k] || 0) + '→' + lst2[k]);
  const sum = a => a.reduce((s, x) => ({ calls: s.calls + 1, reads: s.reads + x.reads, opens: s.opens + x.opens, api: s.api + x.api, bytes: s.bytes + x.bytes }), { calls: 0, reads: 0, opens: 0, api: 0, bytes: 0 });
  const dup = a => { const c = {}; a.forEach(x => c[x.fn] = (c[x.fn] || 0) + 1); return Object.entries(c).filter(e => e[1] > 1).map(e => e[0] + '×' + e[1]); };
  const out = { role, startup: Object.assign(sum(startup), { fns: startup.map(x => x.fn + '(' + x.opens + 'open/' + x.reads + 'r/' + Math.round(x.bytes / 1024) + 'KB)'), duplicates: dup(startup) }), tabs: {}, filter: sum(log.filter(x => x.phase === 'filter')), listenersAddedOnRevisit: grown, errors };
  tabs.forEach(id => { [1, 2].forEach(r => { const l = log.filter(x => x.phase === 'tab:' + id + ':' + r); out.tabs[id + ' #' + r] = l.length ? sum(l).calls + ' calls / ' + sum(l).opens + ' opens / ' + sum(l).reads + ' reads: ' + l.map(x => x.fn).join(', ') : '0 calls'; }); });
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(process.env.PERF_OUT || '/dev/null', JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

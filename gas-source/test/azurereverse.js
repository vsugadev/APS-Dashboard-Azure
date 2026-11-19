// r134 — Reverse bridge: Special Classes OWNED by Azure SQL (SPECIAL_CLASSES_OWNER=azure). node test/azurereverse.js
// Real Code.gs + PortalBridge.gs + AzureBridge.gs in the Apps Script mock; UrlFetchApp = a fake Azure that checks the
// signature exactly as Azure does ('gas.' + ts + '.' + nonce + '.' + p, HMAC-SHA256, hex).
const assert = require('assert'); const fs = require('fs'); const vm = require('vm'); const crypto = require('crypto');
const { setup } = require('./coveragefixture');
const J = x => JSON.parse(JSON.stringify(x));
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const SECRET = 'a1'.repeat(32), URL = 'https://aps-dashboard-ap.azurewebsites.net';
const base = (o) => Object.assign({ title: 'Kolam workshop', description: 'Saturday art', audience: 'ALL', mode: 'ZOOM', status: 'ACTIVE', link: 'https://ok.example/k', order: '3' }, o || {});
const AZ_HEADER = ['Special Class ID', 'Title', 'Description', 'Audience', 'Mode', 'Registration Link', 'Status', 'Program Start Date'];

function prep(owner) {
  const F = setup(); const G = F.G;
  for (const f of ['PortalBridge.gs', 'AzureBridge.gs']) vm.runInContext(fs.readFileSync(__dirname + '/../' + f, 'utf8'), F.env.ctx, { filename: f });
  F.env.props.AZURE_BRIDGE_SECRET = SECRET; F.env.props.AZURE_DASHBOARD_URL = URL;
  if (owner) F.env.props.SPECIAL_CLASSES_OWNER = owner;
  F.A = F.tok2.admin; F.S = F.tok2.student; F.B = F.tok2.bod;
  // the Google Sheet holds an OLD program — while Azure owns them, it must never be shown or written
  const sh = F.env.wb.insertSheet('APS_SPECIAL_CLASSES_LIVE');
  sh.getRange(1, 1, 1, 6).setValues([['Special Class ID', 'Title', 'Audience', 'Mode', 'Registration Link', 'Status']]);
  sh.getRange(2, 1, 1, 6).setValues([['SC-2025-900', 'OLD sheet program', 'All', 'Zoom Meeting', 'https://ok.example/old', 'Active']]);
  F.sheetBefore = JSON.stringify(sh.getDataRange().getValues());
  F.sheet = () => JSON.stringify(F.env.wb.getSheetByName('APS_SPECIAL_CLASSES_LIVE').getDataRange().getValues());
  F.az = { calls: [], grid: [AZ_HEADER, ['SC-2026-001', 'Azure program', 'From the database', 'All', 'Zoom Meeting', 'https://ok.example/az', 'Active', { $d: '2026-12-05T05:00:00.000Z' }]], down: false, answer: null };
  F.env.ctx.UrlFetchApp = { fetch: (url, opt) => {
    const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
    if (F.az.down) throw new Error('Address unavailable: ' + url);
    assert.strictEqual(url, URL + '/api/bridge'); assert.strictEqual(opt.method, 'post'); assert.strictEqual(opt.followRedirects, false);
    const b = JSON.parse(opt.payload);
    const want = crypto.createHmac('sha256', SECRET).update('gas.' + b.ts + '.' + b.nonce + '.' + b.p).digest('hex');
    if (b.gas !== 1 || b.sig !== want) return resp(401, { ok: false, code: 'BAD_SIGNATURE' });
    if (Math.abs(Date.now() - Number(b.ts)) > 300000) return resp(401, { ok: false, code: 'EXPIRED' });
    const p = JSON.parse(b.p); F.az.calls.push(p);
    if (p.action === 'scGrid') return resp(200, { ok: true, result: { grid: JSON.stringify(F.az.grid), timeZone: 'America/New_York', version: 7 } });
    if (p.action === 'call') return resp(200, { ok: true, result: F.az.answer || { value: { savedId: 'SC-2026-002', action: 'CREATE_SPECIAL_CLASS', rows: [] } } });
    return resp(400, { ok: false, code: 'BAD_REQUEST' });
  } };
  const logs = []; F.logs = logs; const keep = F.env.ctx.console;
  F.env.ctx.console = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')), info() {} };
  F.restoreConsole = () => { F.env.ctx.console = keep; };
  return F;
}

t('owner NOT set: Special Classes work exactly as before — the Sheet is read and written, Azure never called', () => {
  const F = prep(''); const G = F.G;
  const d = J(G.getSpecialClasses(F.S)); assert.deepStrictEqual(d.programs.map(p => p.title), ['OLD sheet program']);
  const r = J(G.saveSpecialClass(F.A, base())); assert.ok(/^SC-\d{4}-001$/.test(r.savedId));
  assert.ok(F.sheet().includes('Kolam workshop'), 'written to the Sheet'); assert.strictEqual(F.az.calls.length, 0);
});
t('owner = azure: students and Admins see Azure\'s programs (dates parsed, same card fields); the Sheet is not used', () => {
  const F = prep('azure'); const G = F.G;
  const d = J(G.getSpecialClasses(F.S));
  assert.deepStrictEqual(d.programs.map(p => p.title), ['Azure program']);
  const a = J(G.getSpecialClassesAdmin(F.A)); const row = a.rows.find(x => x.id === 'SC-2026-001');
  assert.ok(row && row.raw.programStart === '2026-12-05', 'date cell from Azure parsed like a Sheet date: ' + JSON.stringify(row && row.raw.programStart));
  assert.strictEqual(F.az.calls.filter(c => c.action === 'scGrid').length, 1, 'one read, then the 60-second cache');
});
t('owner = azure: + Add / Edit / Activate are saved by Azure for the signed-in Admin (e-mail only, never a role); the Sheet is not written', () => {
  const F = prep('azure'); const G = F.G;
  const r = J(G.saveSpecialClass(F.A, base()));
  assert.strictEqual(r.savedId, 'SC-2026-002');
  const c = F.az.calls.find(x => x.action === 'call');
  assert.deepStrictEqual(Object.keys(c).sort(), ['action', 'args', 'email', 'fn', 'v']); assert.strictEqual(c.fn, 'saveSpecialClass');
  assert.strictEqual(c.email, 'admin@aps.org'); assert.deepStrictEqual(c.args, [base()]);
  J(G.setSpecialClassActive(F.A, 'SC-2026-001', false));
  assert.deepStrictEqual(F.az.calls.filter(x => x.action === 'call').pop().args, ['SC-2026-001', false]);
  assert.strictEqual(F.sheet(), F.sheetBefore, 'Google Sheet unchanged');
  // a save clears the cache: the next read asks Azure again
  G.getSpecialClasses(F.S); G.saveSpecialClass(F.A, base()); G.getSpecialClasses(F.S);
  assert.strictEqual(F.az.calls.filter(x => x.action === 'scGrid').length, 2);
});
t('owner = azure: Azure\'s refusal message (validation, permission) reaches the Admin unchanged', () => {
  const F = prep('azure'); const G = F.G; F.az.answer = { error: 'Title is required.' };
  assert.throws(() => G.saveSpecialClass(F.A, base({ title: 'x' })), /^Error: Title is required\.$/);
});
t('owner = azure: students / read-only roles are still refused HERE first — Azure is not even called', () => {
  const F = prep('azure'); const G = F.G;
  [F.S, F.B].forEach(tk => assert.throws(() => G.saveSpecialClass(tk, base()), /Only Admin|ACCESS_OFF|read-only|view only/i));
  assert.strictEqual(F.az.calls.length, 0);
});
t('loop guard: a save that came FROM Azure (session via azure) is never sent back — refused, nothing written', () => {
  const F = prep('azure'); const G = F.G;
  const tok = 'az_test1'; F.env.ctx.CacheService.getScriptCache().put(G.SESSION_CACHE_PREFIX_ + tok, JSON.stringify({ email: 'admin@aps.org', role: 'admin', issuedAt: Date.now(), via: 'azure' }), 120);
  assert.throws(() => G.saveSpecialClass(tok, base()), /owner settings disagree/);
  assert.strictEqual(F.az.calls.length, 0); assert.strictEqual(F.sheet(), F.sheetBefore);
});
t('Azure not reachable / not configured / bad signature → the usual "Special Classes are not available" message; the secret is never logged', () => {
  const F = prep('azure'); const G = F.G;
  F.az.down = true; assert.throws(() => G.getSpecialClasses(F.S), (e) => e.message === G.SC_UNAVAILABLE_MSG_ || /not available/i.test(e.message));
  F.az.down = false; F.env.props.AZURE_BRIDGE_SECRET = 'b2'.repeat(32);
  assert.throws(() => G.saveSpecialClass(F.A, base()), new RegExp(G.SC_UNAVAILABLE_MSG_.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  delete F.env.props.AZURE_DASHBOARD_URL; assert.throws(() => G.saveSpecialClass(F.A, base()), (e) => e.message === G.SC_UNAVAILABLE_MSG_);
  assert.ok(!F.logs.join('\n').includes(SECRET) && !F.logs.join('\n').includes('b2b2b2'), 'secret never in the log');
  assert.strictEqual(F.sheet(), F.sheetBefore);
});
t('ONE_TIME_scCopyAzureToSheet (roll-back helper): owner only; writes Azure\'s programs into the Sheet', () => {
  const F = prep('azure'); const G = F.G;
  F.env.stats.activeUser = 'someone_aps1@avvaiyarpadasalai.org'; assert.throws(() => G.ONE_TIME_scCopyAzureToSheet(), /Access denied/); delete F.env.stats.activeUser;
  const r = J(G.ONE_TIME_scCopyAzureToSheet()); assert.deepStrictEqual(r, { ok: true, rows: 1, version: 7 });
  assert.ok(F.sheet().includes('Azure program') && !F.sheet().includes('OLD sheet program'));
  delete F.env.props.SPECIAL_CLASSES_OWNER; F.env.ctx.CacheService.getScriptCache().removeAll(['aps_special_classes_v1']);
  assert.deepStrictEqual(J(G.getSpecialClasses(F.S)).programs.map(p => p.title), ['Azure program'], 'after switching back, the Sheet has Azure\'s records');
});
console.log('\nALL ' + pass + ' REVERSE BRIDGE TESTS ' + (process.exitCode ? 'DID NOT ALL PASS' : 'PASSED'));

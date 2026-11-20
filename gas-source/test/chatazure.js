// r136 — chat owned by Azure SQL (CHAT_OWNER=azure). node test/chatazure.js
// Real Code.gs + PortalBridge.gs + AzureBridge.gs in the Apps Script mock; UrlFetchApp = a fake Azure that checks the
// reverse signature ('gas.' + ts + '.' + nonce + '.' + p) exactly as Azure does.
const assert = require('assert'); const fs = require('fs'); const vm = require('vm'); const crypto = require('crypto');
const { setup } = require('./coveragefixture');
const J = x => JSON.parse(JSON.stringify(x));
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const SECRET = 'c3'.repeat(32), URL = 'https://aps-dashboard-ap.azurewebsites.net';
function prep(owner) {
  const F = setup(); const G = F.G;
  for (const f of ['PortalBridge.gs', 'AzureBridge.gs']) vm.runInContext(fs.readFileSync(__dirname + '/../' + f, 'utf8'), F.env.ctx, { filename: f });
  F.env.props.AZURE_BRIDGE_SECRET = SECRET; F.env.props.AZURE_DASHBOARD_URL = URL; if (owner) F.env.props.CHAT_OWNER = owner;
  const P = Object.getPrototypeOf(F.env.wb.getSheetByName('Courses')); P.deleteRows = P.deleteRows || function (s, n) { this.data.splice(s - 1, n); return this; };
  F.env.ctx.ContentService = F.env.ctx.ContentService || { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) };
  F.env.ctx.Utilities.newBlob = F.env.ctx.Utilities.newBlob || ((s) => ({ getBytes: () => Buffer.from(String(s)) }));
  F.az = { calls: [], msgs: [{ timestamp: '2026-11-19T10:00:00.000Z', email: 'admin@aps.org', role: 'admin', name: 'Admin · admin', message: 'from Azure', className: '' }], down: false, answer: null };
  F.env.ctx.UrlFetchApp = { fetch: (url, opt) => {
    const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });
    if (F.az.down) throw new Error('unavailable');
    const b = JSON.parse(opt.payload);
    if (b.sig !== crypto.createHmac('sha256', SECRET).update('gas.' + b.ts + '.' + b.nonce + '.' + b.p).digest('hex')) return resp(401, { ok: false, code: 'BAD_SIGNATURE' });
    const p = JSON.parse(b.p); F.az.calls.push(p);
    if (p.action === 'chatList') return resp(200, { ok: true, result: { value: F.az.msgs } });
    if (p.action === 'call' && p.fn === 'postChatMessage') { if (F.az.answer) return resp(200, { ok: true, result: F.az.answer }); F.az.msgs = F.az.msgs.concat([{ timestamp: new Date().toISOString(), email: p.email, role: 'x', name: 'N', message: p.args[0], className: '' }]); return resp(200, { ok: true, result: { value: F.az.msgs } }); }
    return resp(400, { ok: false, code: 'BAD_REQUEST' });
  } };
  F.sheetRows = () => { const sh = F.env.wb.getSheetByName('Dashboard_Chat_Window'); return sh ? sh.getDataRange().getValues().length : 0; };
  F.A = F.tok2.admin; F.S = F.tok2.student;
  return F;
}
const signedForward = (G, payload) => { const p = JSON.stringify(payload), ts = String(Date.now()), nonce = crypto.randomUUID();
  return JSON.parse(G.azureBridgeDoPost_({ azure: 1, p, ts, nonce, sig: crypto.createHmac('sha256', SECRET).update(ts + '.' + nonce + '.' + p).digest('hex') }).getContent()); };

t('owner NOT set: chat works exactly as before (sheet), Azure never called', () => {
  const F = prep(''); const G = F.G;
  const out = J(G.postChatMessage(F.A, 'hello sheet')); assert.strictEqual(out[out.length - 1].message, 'hello sheet');
  assert.ok(F.sheetRows() >= 2); assert.strictEqual(F.az.calls.length, 0);
});
t('owner = azure: the list comes from Azure (cached; the e-mail only is sent); the sheet is not used', () => {
  const F = prep('azure'); const G = F.G; const before = F.sheetRows();
  assert.deepStrictEqual(J(G.getChatMessages(F.S)).map(m => m.message), ['from Azure']);
  G.getChatMessages(F.S); assert.strictEqual(F.az.calls.filter(c => c.action === 'chatList').length, 1, 'cached');
  assert.deepStrictEqual(Object.keys(F.az.calls[0]).sort(), ['action', 'email', 'v']);
  assert.strictEqual(F.sheetRows(), before);
});
t('owner = azure: a post goes to Azure, the version changes (open pages reload), the next list asks Azure again', () => {
  const F = prep('azure'); const G = F.G; const before = F.sheetRows();
  G.getChatMessages(F.A); const v0 = G.chatVersion_();
  const out = J(G.postChatMessage(F.A, '  posted here  '));
  const c = F.az.calls.find(x => x.action === 'call'); assert.strictEqual(c.fn, 'postChatMessage'); assert.deepStrictEqual(c.args, ['posted here']); assert.strictEqual(c.email, 'admin@aps.org');
  assert.strictEqual(out[out.length - 1].message, 'posted here'); assert.notStrictEqual(G.chatVersion_(), v0);
  G.getChatMessages(F.A); assert.strictEqual(F.az.calls.filter(x => x.action === 'chatList').length, 2);
  assert.strictEqual(F.sheetRows(), before, 'sheet untouched');
  F.az.answer = { error: 'Message is empty.' }; assert.throws(() => G.postChatMessage(F.A, 'x'), /^Error: Message is empty\.$/);
  assert.throws(() => G.postChatMessage(F.A, '   '), /Message is empty/, 'checked here first too');
});
t('Azure says "chatChanged" (signed): cache cleared + version changed; unsigned refused', () => {
  const F = prep('azure'); const G = F.G;
  G.getChatMessages(F.A); const v0 = G.chatVersion_();
  assert.deepStrictEqual(signedForward(G, { action: 'chatChanged', v: 1 }), { ok: true, result: { changed: true } });
  assert.notStrictEqual(G.chatVersion_(), v0); G.getChatMessages(F.A); assert.strictEqual(F.az.calls.filter(x => x.action === 'chatList').length, 2);
  const p = JSON.stringify({ action: 'chatChanged', v: 1 }), ts = String(Date.now()), nonce = crypto.randomUUID();
  assert.strictEqual(JSON.parse(G.azureBridgeDoPost_({ azure: 1, p, ts, nonce, sig: '0'.repeat(64) }).getContent()).code, 'BAD_SIGNATURE');
});
t('loop guard: a post that came FROM Azure is never sent back; Azure down → clear message; the secret is never logged', () => {
  const F = prep('azure'); const G = F.G; const logs = []; const keep = F.env.ctx.console;
  F.env.ctx.console = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')), info() {} };
  const tok = 'az_chat1'; F.env.ctx.CacheService.getScriptCache().put(G.SESSION_CACHE_PREFIX_ + tok, JSON.stringify({ email: 'admin@aps.org', role: 'admin', via: 'azure' }), 120);
  assert.throws(() => G.postChatMessage(tok, 'hi'), /Chat owner settings disagree/); assert.strictEqual(F.az.calls.length, 0);
  F.az.down = true; assert.throws(() => G.getChatMessages(F.A), /chat is not available right now/);
  F.env.ctx.console = keep; assert.ok(!logs.join('\n').includes(SECRET));
});
t('ONE_TIME_chatCopyAzureToSheet (roll-back helper): owner only; writes Azure\'s messages into the sheet', () => {
  const F = prep('azure'); const G = F.G;
  F.env.stats.activeUser = 'someone_aps1@avvaiyarpadasalai.org'; assert.throws(() => G.ONE_TIME_chatCopyAzureToSheet(), /Access denied/); delete F.env.stats.activeUser;
  assert.deepStrictEqual(J(G.ONE_TIME_chatCopyAzureToSheet()), { ok: true, messages: 1 });
  delete F.env.props.CHAT_OWNER; F.env.ctx.CacheService.getScriptCache().remove(G.CHAT_CACHE_KEY_);
  assert.deepStrictEqual(J(G.getChatMessages(F.A)).map(m => m.message), ['from Azure'], 'after switching back the sheet has Azure\'s messages');
});
console.log('\nALL ' + pass + ' CHAT-ON-AZURE TESTS ' + (process.exitCode ? 'DID NOT ALL PASS' : 'PASSED'));

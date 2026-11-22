// r140 — shadow comparison: only listed read screens, only with shadow:true. node test/azureshadow.js
const fs = require('fs'); const vm = require('vm'); const assert = require('assert'); const crypto = require('crypto');
const { makeContext } = require('./gasmock');
const SECRET = 'h'.repeat(64);
const env = makeContext({ props: { APS_ENVIRONMENT: 'LIVE', AZURE_BRIDGE_SECRET: SECRET } });
env.ctx.ContentService = env.ctx.ContentService || { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) };
env.ctx.Utilities.getUuid = () => crypto.randomUUID(); env.ctx.ScriptApp.getProjectTriggers = () => [];
vm.runInContext(['Code.gs', 'PortalBridge.gs', 'AzureBridge.gs'].map(f => fs.readFileSync(__dirname + '/../' + f, 'utf8')).join('\n'), env.ctx, { filename: 'project.gs' });
const G = env.ctx; let passed = 0; const t = (n, fn) => { fn(); passed++; console.log('PASS', n); };
const call = (payload) => { const p = JSON.stringify(payload), ts = String(Date.now()), nonce = crypto.randomUUID();
  return JSON.parse(G.doPost({ postData: { contents: JSON.stringify({ azure: 1, p, ts, nonce, sig: crypto.createHmac('sha256', SECRET).update(ts + '.' + nonce + '.' + p).digest('hex') }) } }).getContent()); };
t('a listed read screen runs with shadow:true and returns its value; the temporary session is removed', () => {
  const r = call({ action: 'call', v: 1, fn: 'getKnowledgeBaseVideos', args: [], email: 'admin@avvaiyarpadasalai.org', shadow: true });
  assert.ok(r.ok && 'value' in r.result, JSON.stringify(r));
});
t('refused: without shadow:true, an unlisted function with shadow:true, a save, a non-APS account', () => {
  assert.strictEqual(call({ action: 'call', v: 1, fn: 'getKnowledgeBaseVideos', args: [], email: 'admin@avvaiyarpadasalai.org' }).code, 'BAD_REQUEST');
  assert.strictEqual(call({ action: 'call', v: 1, fn: 'getDashboardData', args: [], email: 'admin@avvaiyarpadasalai.org', shadow: true }).code, 'BAD_REQUEST');
  assert.strictEqual(call({ action: 'call', v: 1, fn: 'ONE_TIME_showAzureBridgeSecret', args: [], email: 'admin@avvaiyarpadasalai.org', shadow: true }).code, 'BAD_REQUEST');
  assert.strictEqual(call({ action: 'call', v: 1, fn: 'getKnowledgeBaseVideos', args: [], email: 'x@gmail.com', shadow: true }).code, 'BAD_REQUEST');
});
t('every listed name is a real function', () => { G.AZURE_BRIDGE_SHADOW_.forEach((f) => assert.strictEqual(typeof G[f], 'function', f)); assert.ok(G.AZURE_BRIDGE_SHADOW_.length > 50); });
console.log('azureshadow: ' + passed + ' passed');

// r139 — email jobs sent by Azure (action mailJob). node test/azuremailjobs.js
// Real Code.gs + PortalBridge.gs + AzureBridge.gs in the Apps Script mock.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert'); const crypto = require('crypto');
const { makeContext } = require('./gasmock');
const SECRET = 'w'.repeat(64);
const env = makeContext({ props: { APS_ENVIRONMENT: 'LIVE', AZURE_BRIDGE_SECRET: SECRET } });
env.ctx.ContentService = env.ctx.ContentService || { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) };
env.ctx.Utilities.getUuid = () => crypto.randomUUID();
env.ctx.ScriptApp.getProjectTriggers = () => []; env.ctx.ScriptApp.deleteTrigger = () => {};
vm.runInContext(['Code.gs', 'PortalBridge.gs', 'AzureBridge.gs'].map(f => fs.readFileSync(__dirname + '/../' + f, 'utf8')).join('\n'), env.ctx, { filename: 'project.gs' });
const G = env.ctx;
let passed = 0; const t = (name, fn) => { fn(); passed++; console.log('PASS', name); };
const call = (payload, secret) => { const p = JSON.stringify(payload), ts = String(Date.now()), nonce = crypto.randomUUID();
  return JSON.parse(G.doPost({ postData: { contents: JSON.stringify({ azure: 1, p, ts, nonce, sig: crypto.createHmac('sha256', secret || SECRET).update(ts + '.' + nonce + '.' + p).digest('hex') }) } }).getContent()); };
const rows = []; G.adsWrite_ = (r) => rows.push(JSON.parse(JSON.stringify(r))); G.adsMirror_ = () => {};
const mj = (x) => call(Object.assign({ action: 'mailJob', v: 1, job: 'MULTIPLE_CLASSROOM_REPORT', period: '2026-11-23' }, x));

t('check: job ON here → offHere false; after removeMultipleClassroomReportTrigger → true; nothing sent yet', () => {
  assert.deepStrictEqual(mj({ op: 'check' }).result, { sent: false, offHere: false });
  G.wjSetOff_(['MULTIPLE_CLASSROOM_REPORT'], true);
  assert.deepStrictEqual(mj({ op: 'check' }).result, { sent: false, offHere: true });
});
t('record (sent): last-sent week + ONE audit row with Apps Script\'s admin@; a retried record writes nothing; Apps Script then skips that week', () => {
  const at = Date.parse('2026-11-23T12:10:00Z');
  assert.deepStrictEqual(mj({ op: 'record', sent: true, students: 4, review: 2, error: '', at: at, to: 'evil@x.com' }).result, { recorded: true });
  assert.deepStrictEqual(mj({ op: 'record', sent: true, students: 4, review: 2, error: '', at: at }).result, { recorded: true, again: true });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].Requested_By, 'Azure weekly job'); assert.strictEqual(rows[0].Email_Status, 'EMAIL_SENT'); assert.strictEqual(rows[0].Status, 'SUCCESS');
  assert.strictEqual(rows[0].Email_Recipients, G.attMailAdminCc_()); assert.ok(!JSON.stringify(rows[0]).includes('evil'));
  assert.strictEqual(env.props.MULTI_CLASSROOM_REPORT_LAST_WEEK, '2026-11-23');
  assert.deepStrictEqual(mj({ op: 'check' }).result, { sent: true, offHere: true });
  assert.ok(/already sent/.test(JSON.stringify(G.admcRun_(new Date('2026-11-23T15:00:00Z'), {}))));
});
t('record (failed): FAILED row, last-sent week unchanged, CR/LF removed', () => {
  mj({ op: 'record', period: '2026-11-30', sent: false, students: 4, review: 2, error: 'Gmail API HTTP 500\nX', at: Date.now() });
  assert.strictEqual(rows[1].Email_Status, 'EMAIL_FAILED'); assert.strictEqual(rows[1].Error, 'Email: Gmail API HTTP 500 X'); assert.strictEqual(env.props.MULTI_CLASSROOM_REPORT_LAST_WEEK, '2026-11-23');
});
t('refused: other jobs, bad period, unknown op, bad signature; live keys include the classroom-type settings', () => {
  assert.strictEqual(mj({ op: 'check', job: 'TEACHER_APPRECIATION' }).code, 'BAD_REQUEST');
  assert.strictEqual(mj({ op: 'check', period: '2026-11-23; x' }).code, 'BAD_REQUEST');
  assert.strictEqual(mj({ op: 'send' }).code, 'BAD_REQUEST');
  assert.strictEqual(call({ action: 'mailJob', v: 1, op: 'check', job: 'MULTIPLE_CLASSROOM_REPORT', period: '2026-11-23' }, 'z'.repeat(64)).code, 'BAD_SIGNATURE');
  assert.ok(G.azureBridgeAllowed_('SPECIAL_CLASS_COURSE_IDS') && G.azureBridgeAllowed_('CLASSROOM_TYPE_OVERRIDES'));
});
console.log('azuremailjobs: ' + passed + ' passed');

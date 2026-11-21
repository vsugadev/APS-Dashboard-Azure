/** Phase 4 step 4 (v0.20.0): the first email job sent by Azure — timing, one owner, never twice, preview, Apps Script r139 records. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import crypto from 'crypto';
import { MailJobRunner, MemoryMailJobStore, MssqlMailJobStore, slotOf, nyParts, parseMailJobList, liveMailJobDeps, MAIL_JOB_CATALOG, PREVIEW_PREFIX, type MailJobDeps, type BuiltEmail } from '../src/mail/mailJobs';
import { GmailSender, type MailMessage } from '../src/mail/gmailSender';
import { gasRun } from '../src/api/endpoints/classes';
import { testContext, testConfig } from './helpers';

const JOB = MAIL_JOB_CATALOG[0];
const LIVE = { testing: false, mode: 'REDIRECT' as const, redirectTo: 'info@avvaiyarpadasalai.org', dailyCap: 30 };
const at = (iso: string) => new Date(iso);

test('timing = Code.gs wjSlot_: Monday 07:00 New York, across both DST changes; AZURE_MAIL_JOBS parsing', () => {
  assert.deepEqual(slotOf(JOB, at('2026-11-23T11:59:00Z')), { date: '2026-11-16', sinceMin: 7 * 1440 - 1 }, 'Mon 06:59 EST → still last week');
  assert.deepEqual(slotOf(JOB, at('2026-11-23T12:00:00Z')), { date: '2026-11-23', sinceMin: 0 }, 'Mon 07:00 EST');
  assert.deepEqual(slotOf(JOB, at('2026-11-02T12:30:00Z')), { date: '2026-11-02', sinceMin: 30 }, 'first Monday after DST ends');
  assert.deepEqual(slotOf(JOB, at('2026-03-09T11:00:00Z')), { date: '2026-03-09', sinceMin: 0 }, 'first Monday after DST starts (07:00 EDT)');
  assert.equal(slotOf(JOB, at('2026-11-21T18:00:00Z')).date, '2026-11-16', 'Saturday → that week\'s Monday');
  assert.equal(nyParts(at('2026-11-21T04:30:00Z')).text, '2026-11-20 23:30');
  assert.deepEqual(parseMailJobList(' multiple_classroom_report, x '), { on: ['MULTIPLE_CLASSROOM_REPORT'], unknown: ['X'] });
});

function harness(o: { offHere?: boolean; sentHere?: boolean; leave?: boolean; sendStatus?: number[]; recordFails?: number; buildFails?: boolean } = {}) {
  const sent: MailMessage[] = [], records: any[] = [], checks: string[] = []; let status = (o.sendStatus || []).slice(), recordFails = o.recordFails || 0;
  const sender = new GmailSender('donotreply@avvaiyarpadasalai.org', 'APS Dashboard Tickets', async () => 'tok', LIVE,
    async (_u, init) => { const st = status.length ? status.shift()! : 200; if (st === 200) sent.push(JSON.parse(init.body)); return { status: st }; }, () => new Date(), () => {});
  const built: BuiltEmail = { leaveSkip: !!o.leave, students: 3, review: 1, message: { to: ['admin@avvaiyarpadasalai.org'], cc: [], replyTo: 'admin@avvaiyarpadasalai.org', subject: 'APS Dashboard – Weekly Report – Students Assigned to Multiple Google Classrooms', html: '<p>r</p>', text: 'r' } };
  const deps: MailJobDeps = {
    build: async () => { if (o.buildFails) throw new Error('sheet unavailable'); return built; },
    check: async (_j, p) => { checks.push(p); return { sent: !!o.sentHere, offHere: o.offHere !== false }; },
    record: async (_j, p, x) => { if (recordFails-- > 0) throw new Error('TIMEOUT'); records.push({ period: p, ...x }); },
  };
  return { sent, records, checks, sender, deps, raw: (i: number) => Buffer.from(sent[i] && (sent[i] as any).raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') };
}

test('OWNER: sends once per week to admin@ and records it in Apps Script; a second instance and later passes never send again', async () => {
  let now = at('2026-11-23T12:10:00Z'); const store = new MemoryMailJobStore(); const h = harness(); const logs: string[] = [];
  const a = new MailJobRunner(['MULTIPLE_CLASSROOM_REPORT'], store, h.sender, h.deps, '', () => now, (m) => logs.push(m));
  const b = new MailJobRunner(['MULTIPLE_CLASSROOM_REPORT'], store, h.sender, h.deps, '', () => now, () => {});
  assert.deepEqual(await a.tick(), { MULTIPLE_CLASSROOM_REPORT: 'SENT' });
  assert.deepEqual(await b.tick(), { MULTIPLE_CLASSROOM_REPORT: 'DONE' });
  now = at('2026-11-24T10:00:00Z'); assert.deepEqual(await a.tick(), { MULTIPLE_CLASSROOM_REPORT: 'DONE' });
  assert.equal(h.sent.length, 1); assert.match(h.raw(0), /\r\nTo: admin@avvaiyarpadasalai\.org\r\n/);
  assert.deepEqual(h.records, [{ period: '2026-11-23', sent: true, students: 3, review: 1, error: '', at: at('2026-11-23T12:10:00Z').getTime() }]);
  assert.match(logs.join('\n'), /email sent by Azure to admin@ \(3 students, 1 require review\)/);
  now = at('2026-11-30T12:05:00Z'); assert.deepEqual(await a.tick(), { MULTIPLE_CLASSROOM_REPORT: 'SENT' }, 'next week sends again'); assert.equal(h.sent.length, 2);
});

test('OWNER: one owner — nothing is sent while the job is ON in Apps Script, or when Apps Script already sent this week', async () => {
  const now = at('2026-11-23T12:10:00Z');
  const h1 = harness({ offHere: false }); const logs: string[] = [];
  const r1 = new MailJobRunner(['MULTIPLE_CLASSROOM_REPORT'], new MemoryMailJobStore(), h1.sender, h1.deps, '', () => now, (m) => logs.push(m));
  assert.deepEqual(await r1.tick(), { MULTIPLE_CLASSROOM_REPORT: 'APPS_SCRIPT_OWNS' }); await r1.tick();
  assert.equal(h1.sent.length, 0); assert.equal(logs.filter((l) => /removeMultipleClassroomReportTrigger/.test(l)).length, 1, 'said once, not every pass');
  const h2 = harness({ sentHere: true }); const s2 = new MemoryMailJobStore();
  assert.deepEqual(await new MailJobRunner(['MULTIPLE_CLASSROOM_REPORT'], s2, h2.sender, h2.deps, '', () => now, () => {}).tick(), { MULTIPLE_CLASSROOM_REPORT: 'ALREADY_SENT' });
  assert.equal(h2.sent.length, 0); assert.equal((await s2.get('MULTIPLE_CLASSROOM_REPORT', '2026-11-23'))!.status, 'SKIPPED');
});

test('OWNER: before 07:00 waits; after the 24-hour window a late start sends nothing; school leave skips like Apps Script', async () => {
  const h = harness();
  assert.deepEqual(await new MailJobRunner(['MULTIPLE_CLASSROOM_REPORT'], new MemoryMailJobStore(), h.sender, h.deps, '', () => at('2026-11-21T18:00:00Z'), () => {}).tick(), { MULTIPLE_CLASSROOM_REPORT: 'MISSED_WINDOW' }, 'deployed Saturday: last Monday is not sent late');
  assert.equal(h.checks.length, 0);
  const h2 = harness({ leave: true }); const s = new MemoryMailJobStore();
  assert.deepEqual(await new MailJobRunner(['MULTIPLE_CLASSROOM_REPORT'], s, h2.sender, h2.deps, '', () => at('2026-11-23T12:10:00Z'), () => {}).tick(), { MULTIPLE_CLASSROOM_REPORT: 'SKIPPED_SCHOOL_LEAVE' });
  assert.equal(h2.sent.length, 0); assert.equal((await s.get('MULTIPLE_CLASSROOM_REPORT', '2026-11-23'))!.summary, 'SKIPPED_SCHOOL_LEAVE');
});

test('OWNER: a failed send is retried (3 tries, each recorded); a crash half-way is NOT re-sent; a failed record is retried without re-sending', async () => {
  let now = at('2026-11-23T12:10:00Z'); const store = new MemoryMailJobStore(); const h = harness({ sendStatus: [500, 500, 500, 500, 500, 500, 500, 500, 500] });
  const r = new MailJobRunner(['MULTIPLE_CLASSROOM_REPORT'], store, h.sender, h.deps, '', () => now, () => {});
  assert.deepEqual(await r.tick(), { MULTIPLE_CLASSROOM_REPORT: 'FAILED' }); now = new Date(now.getTime() + 600_000);
  assert.deepEqual(await r.tick(), { MULTIPLE_CLASSROOM_REPORT: 'FAILED' }); now = new Date(now.getTime() + 600_000);
  assert.deepEqual(await r.tick(), { MULTIPLE_CLASSROOM_REPORT: 'FAILED' }); now = new Date(now.getTime() + 600_000);
  assert.deepEqual(await r.tick(), { MULTIPLE_CLASSROOM_REPORT: 'DONE' }, 'no 4th try');
  assert.equal(h.records.length, 3); assert.ok(h.records.every((x) => x.sent === false && /Gmail API HTTP 500/.test(x.error)));

  const s2 = new MemoryMailJobStore(); await s2.claim('MULTIPLE_CLASSROOM_REPORT', '2026-11-23', at('2026-11-23T12:00:00Z').getTime(), 3); // crashed while sending
  const h2 = harness(); const logs: string[] = [];
  const r2 = new MailJobRunner(['MULTIPLE_CLASSROOM_REPORT'], s2, h2.sender, h2.deps, '', () => at('2026-11-23T12:10:00Z'), (m) => logs.push(m));
  assert.deepEqual(await r2.tick(), { MULTIPLE_CLASSROOM_REPORT: 'BUSY' }, 'another instance may still be sending');
  const r3 = new MailJobRunner(['MULTIPLE_CLASSROOM_REPORT'], s2, h2.sender, h2.deps, '', () => at('2026-11-23T12:30:00Z'), (m) => logs.push(m));
  assert.deepEqual(await r3.tick(), { MULTIPLE_CLASSROOM_REPORT: 'UNKNOWN' }); assert.equal(h2.sent.length, 0); assert.match(logs.join('\n'), /NOT sent again/);

  now = at('2026-11-23T12:10:00Z'); const h3 = harness({ recordFails: 2 }); const s3 = new MemoryMailJobStore();
  const r4 = new MailJobRunner(['MULTIPLE_CLASSROOM_REPORT'], s3, h3.sender, h3.deps, '', () => now, () => {});
  assert.deepEqual(await r4.tick(), { MULTIPLE_CLASSROOM_REPORT: 'SENT' }); assert.equal(h3.records.length, 0);
  assert.deepEqual(await r4.tick(), { MULTIPLE_CLASSROOM_REPORT: 'RECORD_PENDING' });
  assert.deepEqual(await r4.tick(), { MULTIPLE_CLASSROOM_REPORT: 'DONE' });
  assert.equal(h3.sent.length, 1, 'never re-sent'); assert.equal(h3.records.length, 1);
});

test('PREVIEW: Apps Script keeps the job; Azure sends one "[AZURE PREVIEW]" copy per week to the preview address only; nothing recorded', async () => {
  let now = at('2026-11-21T18:00:00Z'); const store = new MemoryMailJobStore(); const h = harness({ offHere: false }); const logs: string[] = [];
  const r = new MailJobRunner(['MULTIPLE_CLASSROOM_REPORT'], store, h.sender, h.deps, 'info@avvaiyarpadasalai.org', () => now, (m) => logs.push(m));
  assert.equal(r.mode(), 'PREVIEW');
  assert.deepEqual(await r.tick(), { MULTIPLE_CLASSROOM_REPORT: 'PREVIEW_SENT' }, 'a preview of this week is sent at once, even after the window');
  assert.deepEqual(await r.tick(), { MULTIPLE_CLASSROOM_REPORT: 'DONE' });
  assert.equal(h.sent.length, 1); assert.match(h.raw(0), /\r\nTo: info@avvaiyarpadasalai\.org\r\n/); assert.ok(!/admin@/.test(h.raw(0).split('\r\n\r\n')[0]), 'admin@ not in the headers');
  const subj = /\r\nSubject: =\?UTF-8\?B\?([^?]+)\?=/.exec(h.raw(0))!; // the en dash makes the subject UTF-8 encoded (as in Code.gs)
  assert.equal(Buffer.from(subj[1], 'base64').toString('utf8'), '[AZURE PREVIEW] APS Dashboard – Weekly Report – Students Assigned to Multiple Google Classrooms');
  assert.equal(h.records.length, 0); assert.equal(h.checks.length, 0, 'Apps Script not asked — preview never owns the job');
  now = at('2026-11-23T12:01:00Z'); assert.deepEqual(await r.tick(), { MULTIPLE_CLASSROOM_REPORT: 'PREVIEW_SENT' }, 'next week\'s preview'); assert.equal(h.sent.length, 2);
  assert.equal(PREVIEW_PREFIX, '[AZURE PREVIEW] ');
});

test('SQL: table created once; the claim is one batch and a duplicate insert by another instance means "not mine"; parameterised only', async () => {
  const qs: string[] = []; let dup = false;
  const req = () => { const r: any = { input: () => r, query: async (q: string) => { qs.push(q); if (/DECLARE @won/.test(q) && dup) { const e: any = new Error('PK'); e.number = 2627; throw e; } return { recordset: [{ won: 1 }] }; } }; return r; };
  const s = new MssqlMailJobStore(async () => ({ request: req }) as any, { NVarChar: () => 0, Char: () => 0, DateTime2: () => 0, Bit: 0, Int: 0, VarChar: () => 0 } as any);
  assert.equal(await s.claim('MULTIPLE_CLASSROOM_REPORT', '2026-11-23', 1, 3), true);
  dup = true; assert.equal(await s.claim('MULTIPLE_CLASSROOM_REPORT', '2026-11-23', 1, 3), false);
  await s.finish('MULTIPLE_CLASSROOM_REPORT', '2026-11-23', 'FAILED', "x'); DROP TABLE y;--", 2);
  assert.equal(qs.filter((q) => /CREATE TABLE dbo\.mail_job/.test(q)).length, 1); assert.ok(qs.every((q) => !q.includes('DROP TABLE y')));
});

const GAS = path.resolve(__dirname, '..', '..', 'gas-source'); const have = fs.existsSync(path.join(GAS, 'AzureBridge.gs'));
const SECRET = 'm'.repeat(64), URL = 'https://script.google.com/macros/s/TEST/exec';
function appsScript(props: Record<string, string> = {}) {
  const { makeContext } = require(path.join(GAS, 'test', 'gasmock'));
  const env = makeContext({ props: { APS_ENVIRONMENT: 'LIVE', AZURE_BRIDGE_SECRET: SECRET, ...props } });
  env.ctx.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t: string) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) };
  env.ctx.Utilities.getUuid = () => crypto.randomUUID();
  env.ctx.ScriptApp.getProjectTriggers = () => []; env.ctx.ScriptApp.deleteTrigger = () => {};
  vm.runInContext(['Code.gs', 'PortalBridge.gs', 'AzureBridge.gs'].map((f) => fs.readFileSync(path.join(GAS, f), 'utf8')).join('\n'), env.ctx, { filename: 'project.gs' });
  const fetchImpl: any = async (_u: string, init: { body: string }) => { const t = env.ctx.doPost({ postData: { contents: init.body } }).getContent(); return { ok: true, status: 200, text: async () => t, json: async () => JSON.parse(t) }; };
  return { env, G: env.ctx as any, fetchImpl };
}

test('Apps Script r139 (real code): check says who owns the job; record writes the "last sent" week + ONE audit row (admin@ from Apps Script, never from the request); then Apps Script would not send that week again', { skip: !have && 'gas-source not found' }, async () => {
  const A = appsScript(); const G = A.G; const rows: any[] = [];
  G.adsWrite_ = (rec: any) => rows.push(JSON.parse(JSON.stringify(rec))); G.adsMirror_ = () => {};
  const ctx: any = testContext({ cfg: testConfig({ appsScriptBridgeUrl: URL, appsScriptBridgeSecret: SECRET }) });
  const deps = liveMailJobDeps(ctx, A.fetchImpl);
  assert.deepEqual(await deps.check(JOB, '2026-11-23'), { sent: false, offHere: false });
  G.wjSetOff_(['MULTIPLE_CLASSROOM_REPORT'], true); // = removeMultipleClassroomReportTrigger
  assert.deepEqual(await deps.check(JOB, '2026-11-23'), { sent: false, offHere: true });
  const t = Date.parse('2026-11-23T12:10:00Z');
  await deps.record(JOB, '2026-11-23', { sent: true, students: 3, review: 1, error: '', at: t });
  await deps.record(JOB, '2026-11-23', { sent: true, students: 3, review: 1, error: '', at: t }); // a retry after a timeout
  assert.equal(rows.length, 1, 'one audit row');
  assert.equal(rows[0].Requested_By, 'Azure weekly job'); assert.equal(rows[0].Action, 'WEEKLY_MULTIPLE_CLASSROOM_REPORT'); assert.equal(rows[0].Email_Status, 'EMAIL_SENT');
  assert.equal(rows[0].Email_Recipients, G.attMailAdminCc_()); assert.equal(rows[0].Status, 'SUCCESS'); assert.match(rows[0].Result_Message, /3 student\(s\).*1 require review.*by Azure/);
  assert.equal(A.env.props.MULTI_CLASSROOM_REPORT_LAST_WEEK, '2026-11-23');
  assert.deepEqual(await deps.check(JOB, '2026-11-23'), { sent: true, offHere: true });
  assert.match(String(JSON.stringify(G.admcRun_(new Date('2026-11-23T15:00:00Z'), {}))), /already sent for the week of 2026-11-23/, 'Apps Script itself would not send it again');
  // a failure is recorded as FAILED, and the "last sent" week is unchanged
  await deps.record(JOB, '2026-11-30', { sent: false, students: 3, review: 1, error: 'Gmail API HTTP 500\r\nX: y', at: t + 7 * 86400000 });
  assert.equal(rows[1].Email_Status, 'EMAIL_FAILED'); assert.equal(rows[1].Error, 'Email: Gmail API HTTP 500 X: y'); assert.equal(A.env.props.MULTI_CLASSROOM_REPORT_LAST_WEEK, '2026-11-23');
  // only this job, only a date period
  await assert.rejects(deps.check({ ...JOB, id: 'TEACHER_APPRECIATION' }, '2026-11-23'), /BAD_REQUEST/);
  await assert.rejects(deps.check(JOB, 'next week'), /BAD_REQUEST/);
});

test('build on Azure = the copied Code.gs: same email as Apps Script\'s admcEmail_ for the same report; recipient = admin@ setting', { skip: !have && 'gas-source not found' }, async () => {
  const ctx: any = testContext({ cfg: testConfig({ appsScriptBridgeUrl: 'https://aps.test/exec' }) }); // = the Apps Script web app's own /exec address (gasmock)
  const deps = liveMailJobDeps(ctx);
  const now = at('2026-11-23T12:10:00Z');
  const b = await deps.build(JOB, now);
  assert.equal(b.leaveSkip, false);
  assert.deepEqual(b.message.to, ['admin@avvaiyarpadasalai.org']); assert.equal(b.message.replyTo, 'admin@avvaiyarpadasalai.org');
  assert.equal(b.message.subject, 'APS Dashboard – Weekly Report – Students Assigned to Multiple Google Classrooms');
  const azure = await gasRun(ctx, null, (S) => { const rep = S.admcBuild_(); return { rep: JSON.parse(JSON.stringify(rep)), when: S.srmFmt_(now.toISOString()) }; });
  assert.equal(b.students, azure.rep.students.length);
  const A = appsScript(); const m = A.G.admcEmail_(azure.rep, azure.when);
  assert.equal(b.message.subject, m.subject); assert.equal(b.message.text, m.text); assert.equal(b.message.html, m.html);
});

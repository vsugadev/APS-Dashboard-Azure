// r94: 📨 Apply Leave — server tests (node test/leave.js)
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { makeContext } = require('./gasmock');
const { courses, audit, ev } = require('./fixtures');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const J = x => JSON.parse(JSON.stringify(x));
const code = fs.readFileSync(__dirname + '/../Code.gs', 'utf8');
function fixedDate(iso) { const NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } } return D; }
const PROPS = { TICKET_MAIL_OAUTH_CLIENT_ID: 'cid', TICKET_MAIL_OAUTH_CLIENT_SECRET: 'cs', TICKET_MAIL_REFRESH_TOKEN: 'rt' };
function boot(nowIso, prev, auditItems) {
  const env = makeContext({ Date: fixedDate(nowIso), auditItems: auditItems || audit, props: prev ? prev.props : PROPS });
  vm.runInContext(code, env.ctx, { filename: 'Code.gs' });
  if (prev) { env.wb.sheets = prev.wb.sheets; Object.values(env.wb.sheets).forEach(s => s.wb = env.wb); Object.assign(env.cache, prev.cache); }
  else { const sh = env.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h'); courses.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); sh.data[i + 1] = row; }); }
  return env;
}
const tok = (env, email, role) => { const k = 'tok_' + email; env.cache['aps_sess_' + k] = JSON.stringify({ email, role }); return k; };
const H = ['Course ID', 'Email', 'Attendance Date', 'Attendance Status', 'Override Status', 'Override By', 'Override Reason', 'Score'];
const rowsOf = (env, email) => {
  const hdr = vm.runInContext('ATTENDANCE_HEADER_ROW', env.ctx), c = n => hdr.indexOf(n);
  return Object.values(env.wb.sheets).filter(s => /^AWK\d+ATT$/.test(s.name)).flatMap(s => s.data.slice(1).filter(r => r && r[c('Email')] === email)
    .map(r => ({ date: r[c('Attendance Date')], status: r[c('Attendance Status')], ov: r[c('Override Status')], by: r[c('Override By')], why: r[c('Override Reason')], score: r[c('Score')] })));
};
const leaves = env => { const s = env.wb.sheets.APS_LEAVE_REQUESTS; return s ? s.data.slice(1).filter(r => r && r[0]) : []; };
const req = (o) => Object.assign({ startDate: '2026-09-25', endDate: '2026-09-25', reason: 'Family vacation out of town', requestId: 'R' + Math.random().toString(36).slice(2, 10) }, o || {});

// ---------- attendance (fixtures: MAZHALAI FRI 7:30 class 700000000001, students s1..s3, teacher t1) ----------
let env = boot('2026-09-26T18:00:00Z'); env.ctx.syncAttendanceForAllCourses();
t('A1: student leave on a captured class date → that row becomes Override EXCUSED (70) with the leave comment; other students untouched', () => {
  const before2 = J(rowsOf(env, 's2@aps.org'));
  const r = J(env.ctx.submitLeaveRequest(tok(env, 's1@aps.org', 'student'), req()));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.message, 'Your leave request has been submitted successfully.');
  const row = rowsOf(env, 's1@aps.org').find(x => x.date === '2026-09-25');
  assert.deepStrictEqual([row.status, row.ov, row.score], ['EXCUSED', 'EXCUSED', '70']);
  assert.ok(/^APS Leave LV-/.test(row.by)); assert.ok(row.why.startsWith('Excused – Student leave: Family vacation out of town from 09/25/2026 to 09/25/2026'), row.why);
  assert.deepStrictEqual(J(rowsOf(env, 's2@aps.org')), before2, 'other student unchanged');
  const lv = leaves(env)[0]; const hdr = vm.runInContext('LV_HEADER_', env.ctx), c = n => lv[hdr.indexOf(n)];
  assert.deepStrictEqual([c('Status'), c('APSID'), c('Role'), c('Attendance_Override_Status')], ['APPROVED', 'APSXXX', 'student', 'APPLIED 1']);
  const log = env.wb.sheets.Attendance_Audit_Log || Object.values(env.wb.sheets).find(s => /Audit/.test(s.name) && s.data.some(x => x && x.includes('LEAVE_EXCUSED')));
  assert.ok(log && log.data.some(x => x && x.includes('LEAVE_EXCUSED') && x.includes('s1@aps.org')), 'attendance audit row');
  const v = J(env.ctx.getAttendanceRecordsForViewer(tok(env, 'admin@aps.org', 'admin'), {})).find(x => x.email === 's1@aps.org' && x.date === '2026-09-25');
  assert.strictEqual(v.status, 'EXCUSED');
});
t('A2: a manual attendance correction is never overwritten by a leave', () => {
  env.ctx.editAttendanceRecordStatus(tok(env, 'admin@aps.org', 'admin'), '700000000001', '2026-09-25', 's2@aps.org', 'STUDENT', 'PRESENT', 'Teacher confirmed she attended class');
  env.ctx.submitLeaveRequest(tok(env, 's2@aps.org', 'student'), req());
  const row = rowsOf(env, 's2@aps.org').find(x => x.date === '2026-09-25');
  assert.deepStrictEqual([row.status, row.ov], ['PRESENT', 'PRESENT']);
  const hdr = vm.runInContext('LV_HEADER_', env.ctx); const lv = leaves(env).find(r => r[hdr.indexOf('User_Email')] === 's2@aps.org');
  assert.strictEqual(lv[hdr.indexOf('Attendance_Override_Status')], 'MANUAL_KEPT 1');
});
t('A3: future leave → the class date captured later is EXCUSED at capture; dates outside the leave are not; a later sync keeps it', () => {
  env.ctx.submitLeaveRequest(tok(env, 's3@aps.org', 'student'), req({ startDate: '2026-10-02', endDate: '2026-10-03', reason: 'Medical appointment and recovery days' }));
  const hdr = vm.runInContext('LV_HEADER_', env.ctx); assert.strictEqual(leaves(env).find(r => r[hdr.indexOf('User_Email')] === 's3@aps.org')[hdr.indexOf('Attendance_Override_Status')], 'AUTO_AT_CAPTURE');
  const items = audit.concat([ev('t1@aps.org', 'abc-defg-hij', '2026-10-02T23:25:00Z', '2026-10-03T01:05:00Z'), ev('s1@aps.org', 'abc-defg-hij', '2026-10-02T23:30:00Z', '2026-10-03T01:00:00Z'), ev('s3@aps.org', 'abc-defg-hij', '2026-10-02T23:30:00Z', '2026-10-03T01:00:00Z')]);
  env = boot('2026-10-03T18:00:00Z', env, items); env.ctx.syncAttendanceForAllCourses();
  const r3 = rowsOf(env, 's3@aps.org').find(x => x.date === '2026-10-02');
  assert.deepStrictEqual([r3.status, r3.ov, r3.score], ['EXCUSED', 'EXCUSED', '70'], 'excused even though the student joined (approved leave)');
  assert.ok(/Medical appointment/.test(r3.why));
  assert.strictEqual(rowsOf(env, 's1@aps.org').find(x => x.date === '2026-10-02').ov, '', 's1 leave was only 09/25');
  assert.strictEqual(rowsOf(env, 's3@aps.org').find(x => x.date === '2026-09-25').ov, '', 'outside the leave range');
  env.ctx.syncAttendanceForAllCourses();
  assert.strictEqual(rowsOf(env, 's3@aps.org').find(x => x.date === '2026-10-02').ov, 'EXCUSED', 'kept by the next sync');
});
t('A4: teacher leave never changes attendance (recorded, NOT_APPLICABLE)', () => {
  const before = J(rowsOf(env, 't1@aps.org'));
  const r = J(env.ctx.submitLeaveRequest(tok(env, 't1@aps.org', 'teacher'), req({ startDate: '2026-10-02', endDate: '2026-10-04' })));
  assert.strictEqual(r.ok, true); assert.deepStrictEqual(J(rowsOf(env, 't1@aps.org')), before);
  const hdr = vm.runInContext('LV_HEADER_', env.ctx); assert.strictEqual(leaves(env).find(r => r[hdr.indexOf('User_Email')] === 't1@aps.org')[hdr.indexOf('Attendance_Override_Status')], 'NOT_APPLICABLE');
});
t('V1: validation — exact messages, past limit, span limit, overlap, idempotent request id, session identity only', () => {
  const s = tok(env, 's1@aps.org', 'student');
  assert.throws(() => env.ctx.submitLeaveRequest(s, req({ startDate: '2026-10-10', endDate: '2026-10-10', reason: '   ' })), /^Error: Please enter a reason for your leave request\.$/);
  assert.throws(() => env.ctx.submitLeaveRequest(s, req({ startDate: '2026-10-10', endDate: '2026-10-09' })), /^Error: Leave end date cannot be earlier than the leave start date\.$/);
  assert.throws(() => env.ctx.submitLeaveRequest(s, req({ startDate: '', endDate: '2026-10-09' })), /valid leave start date/);
  assert.throws(() => env.ctx.submitLeaveRequest(s, req({ startDate: '2026-09-01', endDate: '2026-09-01' })), /at most 14 days in the past/);
  assert.throws(() => env.ctx.submitLeaveRequest(s, req({ startDate: '2026-10-10', endDate: '2027-03-01' })), /at most 90 days/);
  assert.throws(() => env.ctx.submitLeaveRequest(s, req({ startDate: '2026-09-24', endDate: '2026-09-26' })), /^Error: A leave request already exists for this date range\. \(09\/25\/2026 – 09\/25\/2026, LV-/);
  const n0 = leaves(env).length, mails0 = env.stats.mails.length;
  const a = J(env.ctx.submitLeaveRequest(s, req({ startDate: '2026-10-10', endDate: '2026-10-10', requestId: 'SAMEREQ1', email: 'victim@aps.org', role: 'admin' })));
  const b = J(env.ctx.submitLeaveRequest(s, req({ startDate: '2026-10-10', endDate: '2026-10-10', requestId: 'SAMEREQ1' })));
  assert.strictEqual(b.duplicate, true); assert.strictEqual(leaves(env).length, n0 + 1, 'double click = one leave'); assert.strictEqual(env.stats.mails.length, mails0 + 1, 'one email');
  const hdr = vm.runInContext('LV_HEADER_', env.ctx), last = leaves(env)[leaves(env).length - 1];
  assert.deepStrictEqual([last[hdr.indexOf('User_Email')], last[hdr.indexOf('Role')], last[hdr.indexOf('Reason')]], ['s1@aps.org', 'student', 'Family vacation out of town'], 'client email / role ignored; reason trimmed');
  assert.ok(a.leave.id.startsWith('LV-'));
});
t('H1: history — own leaves only; Admin / Super Admin see every leave with notification + override status', () => {
  const s = J(env.ctx.getApplyLeaveData(tok(env, 's1@aps.org', 'student')));
  assert.ok(s.mine.length >= 2 && s.mine.every(l => !('email' in l)) && s.all === undefined && s.isStudent === true);
  assert.strictEqual(s.mine.find(l => l.start === '2026-09-25').attendance, 'Excused – 70%');
  assert.strictEqual(s.today, '2026-10-03');
  const tt = J(env.ctx.getApplyLeaveData(tok(env, 't1@aps.org', 'teacher'))); assert.strictEqual(tt.mine[0].attendance, 'Not applicable (staff leave)'); assert.strictEqual(tt.all, undefined);
  const ad = J(env.ctx.getApplyLeaveData(tok(env, 'super@aps.org', 'superadmin')));
  assert.ok(ad.isAdmin && ad.all.length === leaves(env).length && ad.all.some(l => l.email === 's2@aps.org' && l.override === 'MANUAL_KEPT 1' && l.notification));
});
t('S1: Access Control — row applyLeave on for every role; switched off → refused on every endpoint', () => {
  const row = env.ctx.AC_CATALOG_.find(x => x.key === 'applyLeave'); assert.strictEqual(row.cells, 'AYYYYYY');
  env.ctx.saveAccessControl(tok(env, 'admin@aps.org', 'admin'), [{ role: 'student', key: 'applyLeave', visible: false }]);
  assert.throws(() => env.ctx.getApplyLeaveData(tok(env, 's1@aps.org', 'student')), /ACCESS_OFF|turned off/);
  assert.throws(() => env.ctx.submitLeaveRequest(tok(env, 's1@aps.org', 'student'), req({ startDate: '2026-10-20', endDate: '2026-10-20' })), /ACCESS_OFF|turned off/);
  assert.doesNotThrow(() => env.ctx.getApplyLeaveData(tok(env, 't1@aps.org', 'teacher')));
  env.ctx.saveAccessControl(tok(env, 'admin@aps.org', 'admin'), [{ role: 'student', key: 'applyLeave', visible: true }]);
  assert.throws(() => env.ctx.retryLeaveNotification(tok(env, 't1@aps.org', 'teacher'), { leaveId: 'x' }), /Only an Admin/);
});

// ---------- emails (coverage fixture: EA has Primary Ayana, VP Priya, HM Karuna; EB Senthil has no HM / VP) ----------
const { setup, ID, D } = require('./coveragefixture');
const F = setup({ props: PROPS }); const G = F.G;
const mails = re => F.env.stats.mails.filter(m => re.test(m.subject));
const AY = 'ayana_aps8123' + D, VP = 'priya_aps702' + D, HM = 'karuna_aps774' + D, SEN = 'senthil_aps8131' + D, ADMIN = 'admin@avvaiyarpadasalai.org', STU = 'sa0_aps6650' + D;
const NOW = G.ttmToday_(new Date()), plus = n => G.lvAddDays_(NOW, n);
t('E1: student leave → ONE email From donotreply@ To the class teacher, CC HM, VP, the student and admin@; wording per the APS template', () => {
  const r = J(G.submitLeaveRequest(F.tok2.student, req({ startDate: plus(2), endDate: plus(4), reason: 'Family vacation to India' })));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.mailOk, true);
  const m = mails(/^APS Leave Notification – /); assert.strictEqual(m.length, 1);
  assert.ok(/donotreply@avvaiyarpadasalai\.org/.test(m[0].from)); assert.strictEqual(m[0].to, AY);
  [HM, VP, STU, ADMIN].forEach(e => assert.ok(m[0].cc.includes(e), e));
  assert.ok(m[0].subject.startsWith('APS Leave Notification – Stu A0 – ') && m[0].subject.includes(' to '));
  ['Vanakkam Ayana Nivedida Parthiban', 'has applied for leave from', 'Family vacation to India', 'Excused – 70%', 'Teacher action', 'Dear Parents,', 'MUNMAZHALAI - EA'].forEach(x => assert.ok(m[0].htmlBody.includes(x), x));
  assert.strictEqual(G.lvRows_().find(l => l.User_Email === STU).Notification_Status, 'SENT');
});
t('E2: teacher leave → ONE consolidated notice To HM, CC VP + admin@ (listing every affected class) + a confirmation to the teacher with the coverage steps', () => {
  F.env.stats.mails.length = 0;
  const r = J(G.submitLeaveRequest(F.tok(AY, 'teacher'), req({ startDate: plus(1), endDate: plus(1), reason: 'Personal family function out of state' })));
  assert.strictEqual(r.ok, true);
  const n = mails(/^APS Teacher Leave Notification – /), c = mails(/^APS Leave Request Submitted – /);
  assert.strictEqual(n.length, 1); assert.strictEqual(c.length, 1);
  assert.strictEqual(n[0].to, HM); assert.ok(n[0].cc.includes(VP) && n[0].cc.includes(ADMIN) && !n[0].cc.includes(AY));
  ['Vanakkam Karuna', 'Affected Classes', 'MUNMAZHALAI - EA – ', 'Parent Teacher / Class Coverage', 'Update the weekly teacher availability', 'Inform the respective HM in advance'].forEach(x => assert.ok(n[0].htmlBody.includes(x), x));
  assert.strictEqual(c[0].to, AY); ['Your leave request has been submitted successfully.', 'plan class coverage in advance', 'update your weekly teacher availability'].forEach(x => assert.ok(c[0].htmlBody.includes(x), x));
  assert.ok(/donotreply@/.test(n[0].from) && /donotreply@/.test(c[0].from));
});
t('E3: VP (teacher account supporting EA) → HM notified, the VP is never To / CC of their own notice; teacher without HM / VP → admin@', () => {
  F.env.stats.mails.length = 0;
  G.submitLeaveRequest(F.tok2.vp, req({ startDate: plus(5), endDate: plus(6) }));
  const n = mails(/^APS Teacher Leave Notification/)[0]; assert.strictEqual(n.to, HM); assert.ok(!n.cc.includes(VP));
  F.env.stats.mails.length = 0;
  G.submitLeaveRequest(F.tok(SEN, 'teacher'), req({ startDate: plus(5), endDate: plus(6) }));
  const s = mails(/^APS Teacher Leave Notification/)[0]; assert.strictEqual(s.to, ADMIN); assert.ok(s.htmlBody.includes('MUNMAZHALAI - EB'));
  F.env.stats.mails.length = 0;
  G.submitLeaveRequest(F.tok2.hm, req({ startDate: plus(5), endDate: plus(6) }));
  assert.strictEqual(mails(/^APS Teacher Leave Notification/)[0].to, ADMIN, 'HM role named in no class → admin@');
});
t('E4: email failure never loses the leave; status FAILED + friendly message; Admin "Resend email" sends only what failed (no duplicates)', () => {
  const real = G.apsGmailSend_; let n = 0;
  G.apsGmailSend_ = (p, m) => { n++; if (/^APS Teacher Leave Notification/.test(m.subject)) return { ok: false, error: 'quota' }; return real(p, m); };
  F.env.stats.mails.length = 0;
  const r = J(G.submitLeaveRequest(F.tok(AY, 'teacher'), req({ startDate: plus(10), endDate: plus(10) })));
  assert.strictEqual(r.ok, true); assert.strictEqual(r.mailOk, false);
  assert.strictEqual(r.message, 'Your leave request was saved successfully, but notification could not be sent. The APS Admin team has been notified.');
  const rec = G.lvRows_().find(l => l.Leave_ID === r.leave.id); assert.strictEqual(rec.Notification_Status, 'PARTIAL'); assert.ok(/NOTICE=FAILED quota/.test(rec.Notification_Detail) && /CONFIRM=SENT/.test(rec.Notification_Detail));
  assert.strictEqual(mails(/Leave Request Submitted/).length, 1);
  G.apsGmailSend_ = real;
  const rr = J(G.retryLeaveNotification(F.tok2.admin, { leaveId: r.leave.id }));
  assert.strictEqual(rr.ok, true); assert.strictEqual(mails(/^APS Teacher Leave Notification/).length, 1); assert.strictEqual(mails(/Leave Request Submitted/).length, 1, 'confirmation not re-sent');
  assert.strictEqual(G.lvRows_().find(l => l.Leave_ID === r.leave.id).Notification_Status, 'SENT');
  assert.strictEqual(J(G.retryLeaveNotification(F.tok2.admin, { leaveId: r.leave.id })).message, 'All notifications were already sent.');
  const aud = F.env.wb.sheets.APS_LEAVE_AUDIT.data.slice(1).map(x => x[2]);
  ['LEAVE_SUBMITTED', 'EMAIL_SENT', 'EMAIL_FAILED'].forEach(e => assert.ok(aud.includes(e), e));
});
t('E6 (r100): two Resend clicks at the same time send once; a PENDING older than 10 minutes can be resent', () => {
  const real = G.apsGmailSend_;
  G.apsGmailSend_ = (p, m) => (/^APS Teacher Leave Notification/.test(m.subject) ? { ok: false, error: 'quota' } : real(p, m));
  const r = J(G.submitLeaveRequest(F.tok(AY, 'teacher'), req({ startDate: plus(20), endDate: plus(20) })));
  G.apsGmailSend_ = real; F.env.stats.mails.length = 0;
  // the second click arrives while the first is still sending
  const origNotify = G.lvNotify_; let inner = null;
  G.lvNotify_ = function (rec, v) { if (!inner) { try { G.retryLeaveNotification(F.tok2.admin, { leaveId: r.leave.id }); } catch (e) { inner = e.message; } } return origNotify(rec, v); };
  J(G.retryLeaveNotification(F.tok2.admin, { leaveId: r.leave.id }));
  G.lvNotify_ = origNotify;
  assert.ok(/already being resent/.test(inner || ''), inner); assert.strictEqual(mails(/^APS Teacher Leave Notification/).length, 1, 'sent once');
  // stale PENDING (an interrupted run): Resend is offered after 10 minutes, not before
  const rec = G.lvRows_().find(l => l.Leave_ID === r.leave.id); rec.Notification_Status = 'PENDING';
  rec.Submitted_DateTime = G.rosterTs_(new Date()); assert.strictEqual(G.lvPublic_(rec, true).canResend, false);
  rec.Submitted_DateTime = G.rosterTs_(new Date(Date.now() - 11 * 60000)); assert.strictEqual(G.lvPublic_(rec, true).canResend, true);
});
t('E5: no Classroom API call for any leave (course cache only)', () => {
  const calls = F.cls.calls ? JSON.stringify(F.cls.calls) : '';
  G.submitLeaveRequest(F.tok2.teacher, req({ startDate: plus(20), endDate: plus(20) }));
  assert.strictEqual(F.cls.calls ? JSON.stringify(F.cls.calls) : '', calls);
});
console.log(pass + ' passed');

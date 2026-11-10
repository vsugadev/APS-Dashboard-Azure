// r110 — School Leave Management (Admin screen API), announcement emails, notification history, remaining guards. (node test/schoolleave_admin.js)
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { makeContext, Sheet } = require('./gasmock');
const { courses } = require('./fixtures');
Sheet.prototype.getMaxRows = function () { return 5000; };
const code = fs.readFileSync(__dirname + '/../Code.gs', 'utf8');
function clock(iso) { let NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } static set(i) { NOW = new Date(i).getTime(); } } return D; }
const D = clock('2026-11-04T15:00:00Z'); // Wed Nov 4, 10 AM EST
const env = makeContext({ Date: D, props: { APS_ENVIRONMENT: 'LIVE' } }); vm.runInContext(code, env.ctx, { filename: 'Code.gs' });
const G = env.ctx, J = x => JSON.parse(JSON.stringify(x));
const cs = env.wb.insertSheet('Courses'); cs.data[0] = new Array(18).fill('h'); courses.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); cs.data[i + 1] = row; });
const tok = (email, role) => { const k = 'tok_' + role + '_' + email; env.cache['aps_sess_' + k] = JSON.stringify({ email, role }); return k; };
const ADMIN = tok('info@avvaiyarpadasalai.org', 'admin'), SUPER = tok('owner@aps.org', 'superadmin');
const mails = []; let failOn = null;
G.apsGmailSend_ = (profile, m) => { if (failOn && failOn(m)) return { ok: false, error: 'Service invoked too many times for one day: email. (quota) Bearer ya29.secret' }; mails.push({ profile, m: J(m) }); return { ok: true }; };
const form = (o) => Object.assign({ title: 'APS Virtual School Holiday', startDate: '2026-11-06', endDate: '2026-11-08', reason: 'APS Virtual School Holiday', leaveType: 'School Holiday', status: 'DRAFT', notify: 'save' }, o || {});
const log = name => { const s = env.wb.sheets[name]; if (!s) return []; const h = s.data[0]; return s.data.slice(1).filter(r => r && r.some(Boolean)).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const tests = []; const t = (n, fn) => tests.push([n, fn]);
let ID;

t('Test F: Teacher, class HM, Headmaster, Student, BOD — every School Leave endpoint is refused on the server', () => {
  const others = [tok('t1@aps.org', 'teacher'), tok('hm@aps.org', 'headmaster'), tok('s1@aps.org', 'student'), tok('bod@aps.org', G.VCFO_AMCHSTS_BOD_ROLE)];
  const calls = [k => G.getSchoolLeaveAdminData(k), k => G.saveSchoolLeave(k, form()), k => G.approveSchoolLeave(k, 'x'), k => G.cancelSchoolLeave(k, 'x'),
    k => G.deleteSchoolLeaveDraft(k, 'x'), k => G.sendSchoolLeaveNotification(k, 'x'), k => G.getSchoolLeaveHistory(k, 'x')];
  others.forEach(k => calls.forEach(c => assert.throws(() => c(k), /Only an Admin or Super Admin|ACCESS_OFF|not authorized|Access/i)));
  assert.strictEqual(log('APS_SCHOOL_LEAVES').length, 0, 'nothing written');
  assert.throws(() => G.getSchoolLeaveAdminData('forged-token'), /session|sign in|expired/i);
});
t('Admin: add Draft (no effect yet), validation, duplicate prevention, Super Admin has the same access', () => {
  assert.throws(() => G.saveSchoolLeave(ADMIN, form({ startDate: '2026-11-09' })), /not be later/);
  assert.throws(() => G.saveSchoolLeave(ADMIN, form({ reason: '  ' })), /Reason/);
  const r = J(G.saveSchoolLeave(ADMIN, form())); ID = r.leave.leaveId;
  assert.deepStrictEqual([r.leave.status, r.leave.days, r.leave.createdBy, r.notification], ['DRAFT', 3, 'info@avvaiyarpadasalai.org', null]);
  assert.strictEqual(G.isAPSSchoolHoliday('2026-11-07'), false, 'a draft never suspends anything');
  assert.throws(() => G.saveSchoolLeave(SUPER, form()), /already exists/);
  const d = J(G.getSchoolLeaveAdminData(SUPER)); assert.strictEqual(d.leaves.length, 1); assert.deepStrictEqual(d.lists, ['students@avvaiyarpadasalai.org', 'teachers@avvaiyarpadasalai.org', 'admin@avvaiyarpadasalai.org', 'allparents2026_2027@avvaiyarpadasalai.org']);
  assert.strictEqual(d.sender, 'attendance@avvaiyarpadasalai.org', 'standing rule: attendance@ unless another sender is approved');
});
t('Test G + K: approve with "send" → takes effect at once (cache cleared); 4 messages, one per list, exact subject & wording; never sent twice', () => {
  mails.length = 0;
  const r = J(G.approveSchoolLeave(ADMIN, ID, { notify: 'send' }));
  assert.strictEqual(G.isAPSSchoolHoliday('2026-11-07'), true, 'approved → on leave immediately');
  assert.strictEqual(r.notification.status, 'SENT'); assert.strictEqual(mails.length, 4);
  assert.deepStrictEqual(mails.map(x => x.m.to[0]), ['students@avvaiyarpadasalai.org', 'teachers@avvaiyarpadasalai.org', 'admin@avvaiyarpadasalai.org', 'allparents2026_2027@avvaiyarpadasalai.org']);
  assert.ok(mails.every(x => x.profile === 'ATTENDANCE' && x.m.to.length === 1 && x.m.cc.length === 0));
  const m = mails[0].m; assert.strictEqual(m.subject, 'APS Virtual School – Holiday Announcement – November 6–8, 2026');
  ['Dear APS Students, Parents, and Teachers,', 'Vanakkam!', 'Avvaiyar Padasalai Virtual School will remain closed during the following period.', 'Leave Start Date: Friday, November 6, 2026',
   'Leave End Date: Sunday, November 8, 2026', 'Reason: APS Virtual School Holiday', 'regular weekly school activities, including teacher availability collection, attendance, grading, and related weekly activities, will remain suspended.',
   'Regular school activities will resume after the approved leave period.', 'APS Administration Team', 'www.avvaiyarpadasalai.org'].forEach(x => assert.ok(m.text.includes(x), x));
  assert.ok(m.html.includes('School Leave Details:'));
  mails.length = 0; const again = J(G.sendSchoolLeaveNotification(ADMIN, ID, {}));
  assert.strictEqual(mails.length, 0, 'pending mode: nothing re-sent'); assert.strictEqual(again.alreadySent, 4);
  const lg = log('APS_SCHOOL_LEAVE_EMAIL_LOG'); assert.strictEqual(lg.filter(x => x.Status === 'SENT').length, 4); assert.ok(lg.every(x => x.Triggered_By === 'info@avvaiyarpadasalai.org' && x.Version === '1'));
});
t('editing an APPROVED leave: changed dates / reason need explicit confirmation → UPDATED announcement; overlap needs confirmation', () => {
  const nc = J(G.saveSchoolLeave(ADMIN, form({ leaveId: ID, endDate: '2026-11-09', status: 'APPROVED' })));
  assert.deepStrictEqual(nc.needsConfirm.changes, ['end']); assert.strictEqual(G.isAPSSchoolHoliday('2026-11-09'), false, 'nothing saved before confirmation');
  mails.length = 0;
  const r = J(G.saveSchoolLeave(ADMIN, form({ leaveId: ID, endDate: '2026-11-09', status: 'APPROVED', notify: 'send', confirmChange: true })));
  assert.strictEqual(r.leave.version, 2); assert.strictEqual(G.isAPSSchoolHoliday('2026-11-09'), true);
  assert.strictEqual(mails.length, 4); assert.strictEqual(mails[0].m.subject, 'UPDATED: APS Virtual School – Holiday Announcement – November 6–9, 2026');
  assert.ok(mails[0].m.text.includes('UPDATED ANNOUNCEMENT'));
  const ov = J(G.saveSchoolLeave(ADMIN, form({ title: 'Overlap', startDate: '2026-11-08', endDate: '2026-11-10', status: 'APPROVED' })));
  assert.strictEqual(ov.needsConfirm.overlaps.length, 1, 'overlap warning');
  const ok = J(G.saveSchoolLeave(ADMIN, form({ title: 'Overlap', startDate: '2026-11-08', endDate: '2026-11-10', status: 'APPROVED', confirmOverlap: true })));
  assert.strictEqual(ok.leave.status, 'APPROVED');
  G.cancelSchoolLeave(ADMIN, ok.leave.leaveId, {});
  assert.strictEqual(G.isAPSSchoolHoliday('2026-11-10'), false, 'cancelled overlap no longer counts'); assert.strictEqual(G.isAPSSchoolHoliday('2026-11-09'), true, 'the other leave still does');
});
t('Test H: quota error → failed lists logged (never marked sent, token masked), the rest skipped; retry sends only the failed lists', () => {
  const r0 = J(G.saveSchoolLeave(ADMIN, form({ title: 'Diwali', startDate: '2026-11-13', endDate: '2026-11-13', reason: 'Diwali holiday', leaveType: 'Festival Holiday', status: 'APPROVED' })));
  mails.length = 0; let n = 0; failOn = () => ++n === 2; // the 2nd list hits the quota
  const r = J(G.sendSchoolLeaveNotification(ADMIN, r0.leave.leaveId, {}));
  failOn = null;
  assert.deepStrictEqual([r.status, r.sent, r.failed], ['PARTIAL', 1, 3]);
  const lg = log('APS_SCHOOL_LEAVE_EMAIL_LOG').filter(x => x.Leave_ID === r0.leave.leaveId);
  assert.deepStrictEqual(lg.map(x => x.Status), ['SENT', 'FAILED', 'FAILED', 'FAILED']);
  assert.ok(/quota/.test(lg[1].Error_Message) && !/ya29\.secret/.test(lg[1].Error_Message)); assert.ok(/quota reached earlier/.test(lg[2].Error_Message));
  mails.length = 0; const r2 = J(G.sendSchoolLeaveNotification(ADMIN, r0.leave.leaveId, {}));
  assert.deepStrictEqual([r2.status, r2.sent, mails.length], ['SENT', 3, 3]); assert.ok(!mails.some(x => x.m.to[0] === 'students@avvaiyarpadasalai.org'), 'the delivered list is not re-sent');
  assert.strictEqual(mails[0].m.subject, 'APS Virtual School – Holiday Announcement – November 13, 2026');
  mails.length = 0; G.sendSchoolLeaveNotification(ADMIN, r0.leave.leaveId, { mode: 'all' }); assert.strictEqual(mails.length, 4, 'explicit Resend to all');
});
t('Test J: cancel (with notice) → dates resume; delete only drafts; history + audit for every action', () => {
  mails.length = 0;
  const r = J(G.cancelSchoolLeave(ADMIN, ID, { notify: 'send' }));
  assert.strictEqual(r.leave.status, 'CANCELLED'); assert.strictEqual(G.isAPSSchoolHoliday('2026-11-07'), false);
  assert.strictEqual(mails.length, 4); assert.strictEqual(mails[0].m.subject, 'APS Virtual School – Holiday Cancelled – November 6–9, 2026');
  assert.throws(() => G.saveSchoolLeave(ADMIN, form({ leaveId: ID })), /cancelled leave cannot be edited/);
  const dr = J(G.saveSchoolLeave(ADMIN, form({ title: 'Maybe', startDate: '2026-12-24', endDate: '2026-12-26' })));
  assert.throws(() => G.deleteSchoolLeaveDraft(ADMIN, ID), /Only a Draft/);
  G.deleteSchoolLeaveDraft(ADMIN, dr.leave.leaveId);
  assert.ok(!J(G.getSchoolLeaveAdminData(ADMIN)).leaves.some(l => l.leaveId === dr.leave.leaveId), 'deleted draft hidden (kept in the sheet for the audit trail)');
  const h = J(G.getSchoolLeaveHistory(ADMIN, ID));
  assert.ok(h.emails.length >= 12); assert.deepStrictEqual(Array.from(new Set(h.audit.map(a => a.Action))).sort(), ['APPROVED', 'CANCELLED', 'CREATED_DRAFT', 'EDITED', 'NOTIFICATION_SENT'].sort());
});
t('remaining guards (trigger runs on a leave day skip; normal days run; editor runs never blocked): Assignment Monitoring, Mark Complete, Class Consolidation, Multiple-classroom, Student Absence', () => {
  G.saveSchoolLeave(ADMIN, form({ title: 'Holiday 2', startDate: '2026-11-20', endDate: '2026-11-22', status: 'APPROVED' }));
  const ran = []; ['amSchedulerRun_', 'mcRun_', 'admcRun_', 'saRun_', 'ccwRunAnalysis_', 'ccwRunEmail_'].forEach(f => { G[f] = () => { ran.push(f); return { ran: f }; }; });
  const gp = G.ScriptApp.getProjectTriggers; const H = ['amScheduler', 'apsAttQuzMarkCompleteDaily', 'apsWeeklyMultipleClassroomReport', 'apsStudentAbsenceWeekly', 'apsClassConsolidationAnalysis', 'apsClassConsolidationEmail'];
  G.ScriptApp.getProjectTriggers = () => H.map(h => ({ getHandlerFunction: () => h, getUniqueId: () => 'uid-' + h }));
  try {
    D.set('2026-11-21T15:00:00Z'); // Sat Nov 21 — leave
    H.forEach(h => assert.deepStrictEqual(J(G[h]({ triggerUid: 'uid-' + h })), { skipped: 'SKIPPED_SCHOOL_LEAVE' }, h));
    assert.strictEqual(ran.length, 0);
    D.set('2026-11-24T15:00:00Z'); // Tue Nov 24 — normal
    H.forEach(h => G[h]({ triggerUid: 'uid-' + h }));
    assert.strictEqual(ran.length, 6, 'every job runs on a normal day: ' + ran.join(','));
  } finally { G.ScriptApp.getProjectTriggers = gp; }
  const skips = log('APS_SCHOOL_LEAVE_AUDIT_LOG').filter(a => a.Action === 'SKIPPED_SCHOOL_LEAVE').map(a => a.Old_Value);
  ['ASSIGNMENT_MONITORING', 'MARK_COMPLETE_REMINDER', 'MULTIPLE_CLASSROOM_REPORT', 'STUDENT_ABSENCE', 'CLASS_CONSOLIDATION'].forEach(a => assert.ok(skips.includes(a), a));
});
t('availability card: holiday-week classes flagged; a teacher cannot answer for them (Admin can); normal week unchanged', () => {
  D.set('2026-11-17T15:00:00Z'); // Tue Nov 17 → week WK-2026-11-20 (holiday Fri 20 – Sun 22)
  const c = courses[0], teacherEmail = (c.teachers[0] || {}).email;
  const tk = tok(teacherEmail, 'teacher');
  const rows = J(G.getWeeklyPanelData(ADMIN)).availability;
  const fri = rows.find(r => String(r.courseId) === String(c.id)); assert.ok(fri && fri.schoolLeave === true && fri.schoolLeaveTitle === 'Holiday 2', JSON.stringify(fri));
  assert.throws(() => G.setTeacherAvailabilityStatus(tk, c.id, 'confirmed', ''), /school leave/);
  assert.strictEqual(J(G.setTeacherAvailabilityStatus(ADMIN, c.id, 'confirmed', '')).status, 'confirmed', 'Admin can still record it');
  D.set('2026-11-24T15:00:00Z'); // week WK-2026-11-27 — normal
  assert.ok(!J(G.getWeeklyPanelData(ADMIN)).availability.some(r => r.schoolLeave));
});

let fails = 0;
for (const [n, fn] of tests) { try { fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 6).join('\n   ')); } }
console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);

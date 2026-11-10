// r60: Assign Classroom → Remove Student — server tests (node test/removal.js)
const assert = require('assert');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const J = x => JSON.parse(JSON.stringify(x));
const { setup, STU, W, REASON, ID, D } = require('./removalfixture');

t('1–3: reason is mandatory, 5–200 words (4 / 201 / blank / whitespace refused), whitespace-only never counts; nothing changes in Classroom', () => {
  const F = setup();
  [['', /Enter the reason/], ['   \n\t ', /Enter the reason/], ['one two three four', /at least 5 words \(now 4\)/], [W(201), /at most 200 words \(now 201\)/]]
    .forEach(([r, re]) => assert.throws(() => F.remove(F.tok2.admin, { reason: r }), re, JSON.stringify(r).slice(0, 30)));
  assert.strictEqual(F.rm.removed, 0); assert.strictEqual(F.G.srmRows_().length, 0, 'no audit row for a refused reason');
  assert.strictEqual(F.G.srmWordCount_('  a   b\n\nc\td  e  '), 5);
  assert.throws(() => F.remove(F.tok2.admin, { reason: 'x'.repeat(3001) + ' a b c d' }), /too long/);
  assert.strictEqual(F.remove(F.tok2.admin, { reason: 'one  two\nthree four   five' }).record.removal, 'REMOVED', 'exactly 5 words accepted');
  const F2 = setup(); assert.strictEqual(F2.remove(F2.tok2.admin, { reason: W(200) }).record.removal, 'REMOVED', 'exactly 200 words accepted');
});

t('4–6: authorization — Admin + Super Admin remove; HM / teacher / student refused; BOD reads the audit log only', () => {
  const F = setup(); const G = F.G;
  [F.tok2.teacher, F.tok2.hm, F.tok2.student, F.tok2.vp].forEach(tk => {
    assert.throws(() => G.getRemovalContext(tk), /Only Admin|ACCESS_OFF/);
    assert.throws(() => F.remove(tk), /Only Admin|ACCESS_OFF/);
    assert.throws(() => G.retryRemovalEmail(tk, 'X'), /Only Admin|ACCESS_OFF/);
  });
  const bod = J(G.getRemovalContext(F.tok2.bod));
  assert.strictEqual(bod.canRemove, false); assert.deepStrictEqual(bod.students, [], 'BOD gets no student list'); assert.ok(Array.isArray(bod.audit));
  assert.throws(() => F.remove(F.tok2.bod), /Read-only/); assert.throws(() => G.retryRemovalEmail(F.tok2.bod, 'X'), /Read-only/);
  assert.strictEqual(F.rm.removed, 0);
  const ctx = J(G.getRemovalContext(F.SA)); assert.strictEqual(ctx.canRemove, true);
  const s = ctx.students.find(x => x.email === STU);
  assert.ok(s && s.apsId === 'APS6650'); assert.deepStrictEqual(s.classrooms.map(c => c.courseId).sort(), [ID.EA, ID.EB].sort(), 'both classrooms listed');
  assert.strictEqual(s.classrooms.find(c => c.courseId === ID.EA).teacher, 'Ayana Nivedida Parthiban');
  const r = F.remove(F.SA); assert.strictEqual(r.record.removal, 'REMOVED'); assert.strictEqual(r.record.role, 'Super Admin');
  // forged client values are ignored: the role comes from the server session only
  assert.throws(() => G.removeStudentFromClassroom(F.tok2.teacher, { studentEmail: STU, courseId: ID.EB, reason: REASON, confirmed: true, requestId: 'F1', role: 'admin' }), /Only Admin/);
  // Access Control: Remove Student off for Admin → refused on the server; Re-Map unaffected
  G.saveAccessControl(F.tok('admin@aps.org', 'admin'), [{ role: 'admin', key: 'assignClassroom.remove', visible: false }]);
  assert.throws(() => G.getRemovalContext(F.tok2.admin), /ACCESS_OFF|turned off/i);
  assert.ok(G.getAdminClassroomAssignments(F.tok2.admin).students.length);
});

t('7–10: verified removal from ONE classroom; other membership kept; audit + email From attendance@ to Primary / HM / VP, admin@ CC', () => {
  const F = setup(); const G = F.G; const mails = F.env.stats.mails; mails.length = 0;
  const r = F.remove(F.tok2.admin, { reason: REASON + ' <script>alert(1)</script>' });
  assert.strictEqual(r.ok, true); assert.ok(/removed from MUNMAZHALAI - EA/.test(r.message) && /notified/.test(r.message));
  assert.strictEqual(r.record.removal, 'REMOVED'); assert.strictEqual(r.record.verification, 'VERIFIED'); assert.strictEqual(r.record.email, 'EMAIL_SENT');
  assert.ok(!F.find(ID.EA, STU), 'gone from EA'); assert.ok(F.find(ID.EB, STU), 'still in EB'); assert.strictEqual(F.rm.removed, 1);
  assert.strictEqual(mails.length, 1); const m = mails[0];
  assert.ok(/<attendance@avvaiyarpadasalai\.org>$/.test(m.from), m.from);
  const to = m.to.split(',');
  ['ayana_aps8123' + D, 'priya_aps702' + D, 'karuna_aps774' + D].forEach(e => assert.ok(to.includes(e), e));
  assert.strictEqual(new Set(to).size, to.length, 'no duplicate recipients'); assert.ok(!to.includes(STU) && !to.includes('kavitha_aps8130' + D), 'no student / unrelated teacher');
  assert.strictEqual(m.cc, 'admin@avvaiyarpadasalai.org');
  assert.strictEqual(m.subject, 'APS Dashboard – Student Removed from Google Classroom – Stu A0'); // r84 subject
  ['Vanakkam,', 'has been successfully removed from the specified Google Classroom', 'Student Details', 'APS6650', STU, 'Ayana Nivedida Parthiban', 'Reason for Removal', 'APS Tech Support Team', 'Avvaiyar Padasalai']
    .forEach(x => assert.ok(m.htmlBody.includes(x), x));
  assert.ok(!m.htmlBody.includes('<script>alert') && m.htmlBody.includes('&lt;script&gt;'), 'reason is escaped');
  const rows = G.srmRows_(); assert.strictEqual(rows.length, 1);
  const a = rows[0];
  assert.strictEqual(a.Requested_By, 'admin@aps.org'); assert.strictEqual(a.Student_APSID, 'APS6650'); assert.strictEqual(a.Course_ID, ID.EA); assert.ok(a.Removed_At && a.Completed_At);
  assert.ok(/ayana_aps8123/.test(a.Email_Recipients) && /CC admin@avvaiyarpadasalai\.org/.test(a.Email_Recipients));
  // the removed pair disappears from the search until the next sync; EB stays
  const s = J(G.getRemovalContext(F.tok2.admin)).students.find(x => x.email === STU);
  assert.deepStrictEqual(s.classrooms.map(c => c.courseId), [ID.EB]);
  G.syncClassroomData();
  assert.deepStrictEqual(J(G.getRemovalContext(F.tok2.admin)).students.find(x => x.email === STU).classrooms.map(c => c.courseId), [ID.EB], 'after sync: from the real roster');
  const aud = J(G.getRemovalContext(F.tok2.bod)).audit; assert.strictEqual(aud.length, 1); assert.strictEqual(aud[0].studentName, 'Stu A0'); assert.ok(/ET|EST|EDT/.test(aud[0].requestedAt));
});

t('11–13: confirmation + request id required; duplicate request id and a concurrent in-progress removal are refused', () => {
  const F = setup(); const G = F.G;
  assert.throws(() => F.remove(F.tok2.admin, { confirmed: false }), /confirm/);
  assert.throws(() => F.remove(F.tok2.admin, { confirmed: 'true' }), /confirm/);
  assert.throws(() => F.remove(F.tok2.admin, { requestId: '' }), /request id/);
  const r1 = F.remove(F.tok2.admin, { requestId: 'SAME-1' }); assert.strictEqual(r1.record.removal, 'REMOVED');
  const r2 = F.remove(F.tok2.admin, { requestId: 'SAME-1' }); assert.strictEqual(r2.duplicate, true);
  assert.strictEqual(F.rm.removed, 1, 'double click = one removal'); assert.strictEqual(F.env.stats.mails.filter(m => /Student Removed from Google Classroom/.test(m.subject)).length, 1, 'one email');
  const sh = G.srmSheet_(); const row = G.SRM_HEADER_.map(h => h === 'Removal_Status' ? 'REMOVAL_IN_PROGRESS' : h === 'Student_Email' ? STU : h === 'Course_ID' ? ID.EB : h === 'Request_ID' ? 'BUSY-1' : h === 'Requested_At' ? new Date().toISOString() : '');
  sh.appendRow(row);
  assert.throws(() => F.remove(F.tok2.admin, { courseId: ID.EB }), /already in progress \(BUSY-1\)/);
  assert.ok(F.find(ID.EB, STU));
});

t('14–16: not on the live roster → ALREADY_ABSENT (no email); Classroom error → REMOVAL_FAILED; still on roster → REQUIRES_REVIEW', () => {
  let F = setup(); F.env.stats.mails.length = 0;
  F.cls.students[ID.EA] = F.cls.students[ID.EA].filter(s => s.profile.emailAddress !== STU); // removed in Classroom, dashboard not yet synced
  let r = F.remove(F.tok2.admin);
  assert.strictEqual(r.record.removal, 'ALREADY_ABSENT'); assert.strictEqual(r.record.email, 'NOT_SENT'); assert.strictEqual(r.ok, false);
  assert.strictEqual(F.rm.removed, 0); assert.strictEqual(F.env.stats.mails.length, 0); assert.ok(/nothing was removed/.test(r.message));

  F = setup(); F.env.stats.mails.length = 0; F.rm.failRemove = 'The caller does not have permission';
  r = F.remove(F.tok2.admin);
  assert.strictEqual(r.record.removal, 'REMOVAL_FAILED'); assert.ok(/does not have permission/.test(r.record.error)); assert.ok(/NOT removed/.test(r.message));
  assert.ok(F.find(ID.EA, STU)); assert.strictEqual(F.env.stats.mails.length, 0); assert.strictEqual(r.record.canRetryEmail, false);
  F.rm.failRemove = null; // a fresh request (new id) can be tried after fixing the problem
  assert.strictEqual(F.remove(F.tok2.admin).record.removal, 'REMOVED');

  F = setup(); F.env.stats.mails.length = 0; F.rm.noop = true;
  r = F.remove(F.tok2.admin);
  assert.strictEqual(r.record.removal, 'REQUIRES_REVIEW'); assert.strictEqual(r.record.verification, 'STILL_ON_ROSTER'); assert.strictEqual(F.env.stats.mails.length, 0);

  F = setup(); F.rm.failGet = 'Backend Error';
  r = F.remove(F.tok2.admin); assert.strictEqual(r.record.removal, 'REMOVAL_FAILED'); assert.strictEqual(F.rm.removed, 0, 'no removal when the roster cannot be checked');
});

t('17: wrong / inactive / non-member class refused before anything is written', () => {
  const F = setup(); const G = F.G;
  assert.throws(() => F.remove(F.tok2.admin, { courseId: '424242' }), /not an active AY26-27 class/);
  assert.throws(() => F.remove(F.tok2.admin, { courseId: ID.ED }), /not on the dashboard roster/);
  assert.throws(() => F.remove(F.tok2.admin, { studentEmail: 'not-an-email' }), /valid student/);
  F.cls.courses.find(c => c.id === ID.EA).courseState = 'ARCHIVED';
  assert.throws(() => F.remove(F.tok2.admin), /not an active Google Classroom/);
  assert.strictEqual(G.srmRows_().length, 0); assert.strictEqual(F.rm.removed, 0);
});

t('18–19: email failure → EMAIL_FAILED + Retry email; retry sends once and NEVER removes again; request fields are immutable', () => {
  const F = setup({ props: { ATTENDANCE_REFRESH_TOKEN: '' } }); const G = F.G;
  F.env.ctx.MailApp.sendEmail = () => {}; F.env.stats.mails.length = 0;
  const r = F.remove(F.tok2.admin);
  assert.strictEqual(r.record.removal, 'REMOVED'); assert.strictEqual(r.record.email, 'EMAIL_FAILED'); assert.strictEqual(r.record.canRetryEmail, true);
  assert.ok(/Retry email/.test(r.message) && /will not be removed again/.test(r.message));
  const before = G.srmSheet_().data[1].slice(0, 11);
  F.env.props.ATTENDANCE_REFRESH_TOKEN = 'att-refresh';
  const r2 = J(G.retryRemovalEmail(F.tok2.admin, r.record.requestId));
  assert.strictEqual(r2.record.email, 'EMAIL_SENT'); assert.ok(r2.record.lastRetry); assert.strictEqual(F.rm.removed, 1, 'not removed again');
  assert.strictEqual(F.env.stats.mails.filter(m => /Student Removed from Google Classroom/.test(m.subject)).length, 1);
  const r3 = J(G.retryRemovalEmail(F.tok2.admin, r.record.requestId)); assert.strictEqual(r3.record.email, 'EMAIL_SENT');
  assert.strictEqual(F.env.stats.mails.filter(m => /Student Removed from Google Classroom/.test(m.subject)).length, 1, 'already sent → no second email');
  assert.deepStrictEqual(G.srmSheet_().data[1].slice(0, 11), before, 'Request_ID … Reason never rewritten');
  assert.throws(() => G.retryRemovalEmail(F.tok2.admin, 'NOPE'), /not found/);
  const F2 = setup(); F2.rm.noop = true; const rv = F2.remove(F2.tok2.admin);
  assert.throws(() => F2.G.retryRemovalEmail(F2.tok2.admin, rv.record.requestId), /Only a verified removal/);
});

t('20: no new OAuth scopes; Re-Map endpoints follow the new Re-Map Student switch; catalogue rows present', () => {
  const F = setup(); const G = F.G;
  const scopes = JSON.parse(require('fs').readFileSync(__dirname + '/../appsscript.json', 'utf8')).oauthScopes;
  assert.ok(scopes.includes('https://www.googleapis.com/auth/classroom.rosters'));
  const keys = G.AC_CATALOG_.map(r => r.key); assert.ok(keys.includes('assignClassroom.remap') && keys.includes('assignClassroom.remove'));
  G.saveAccessControl(F.tok('admin@aps.org', 'admin'), [{ role: 'admin', key: 'assignClassroom.remap', visible: false }]);
  assert.throws(() => G.getAdminClassroomAssignments(F.tok2.admin), /ACCESS_OFF|turned off/i);
  assert.ok(G.getAdminAssignmentAuditLog(F.tok2.admin) !== undefined, 'the Class / Grade Change audit stays');
  assert.strictEqual(J(G.getRemovalContext(F.tok2.admin)).canRemove, true, 'Remove Student unaffected');
});

console.log(pass + ' passed');

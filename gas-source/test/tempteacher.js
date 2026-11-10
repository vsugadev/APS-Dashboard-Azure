// r89: Classes → Temp Teacher (Temporary Teacher Assignment – TCS/TTS) — server tests (node test/tempteacher.js)
const assert = require('assert');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const J = x => JSON.parse(JSON.stringify(x));
const { ID } = require('./coveragefixture');
const { prep, at, addDays, TODAY, TCS, SEN, AYANA, VP, HM, ADMIN, REASON } = require('./ttfixture');

t('1: Admin assigns today → added as TEACHER (Teachers.create), status Active, Primary Teacher unchanged', () => {
  const F = prep(), r = F.mk(F.tk.admin);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.assignment.status, 'ACTIVE');
  assert.deepStrictEqual(F.api.create, [[ID.EA, { userId: TCS }]]); assert.strictEqual(F.api.students, 0, 'never added as a student');
  const c = F.cls.courses.find(x => x.id === ID.EA); assert.ok(c.description.includes(AYANA), 'Course Description (Primary Teacher) untouched');
  const row = F.rows()[0]; assert.strictEqual(row.Primary_Teacher_Email, AYANA); assert.strictEqual(row.Temp_Teacher_APSID, 'APS9001'); assert.strictEqual(row.Created_By_Role, 'Admin');
  assert.strictEqual(row.Status, 'ACTIVE'); assert.ok(row.Added_Timestamp);
});
t('2: Added email From donotreply@ To the temp teacher, CC Primary / HM / VP / admin@ with the required sentences', () => {
  const F = prep(); F.mk(F.tk.admin);
  const m = F.mails(/Temporary Teacher Added/); assert.strictEqual(m.length, 1);
  assert.ok(/donotreply@avvaiyarpadasalai\.org/.test(m[0].from), m[0].from); assert.strictEqual(m[0].to, TCS);
  [AYANA, HM, VP, ADMIN].forEach(e => assert.ok(m[0].cc.includes(e), e));
  ['You have been temporarily assigned as a Teacher for this Google Classroom.', 'You will be automatically removed from this Google Classroom on the specified Removal Date'].forEach(s => assert.ok(m[0].htmlBody.includes(s) || m[0].body.includes(s), s));
  assert.strictEqual(F.rows()[0].Add_Email_Sent, 'SENT');
});
t('3: HM and Super Admin can assign for any class', () => {
  const F = prep(); assert.strictEqual(F.mk(F.tk.hm).assignment.status, 'ACTIVE');
  assert.strictEqual(F.mk(F.tk.sa, { courseId: ID.EB }).assignment.status, 'ACTIVE');
  assert.strictEqual(F.rows().find(r => r.Classroom_ID === ID.EB).Created_By_Role, 'Super Admin');
});
t('4: class VP / Teacher only for their own classes (server-side); others refused', () => {
  const F = prep(), G = F.G;
  assert.deepStrictEqual(J(G.getTempTeacherData(F.tk.vp)).classes.map(c => c.courseId), [ID.EA]);
  assert.strictEqual(F.mk(F.tk.vp).assignment.status, 'ACTIVE');
  assert.throws(() => F.mk(F.tk.vp, { courseId: ID.EB }), /do not have permission/);
  assert.deepStrictEqual(J(G.getTempTeacherData(F.tk.sen)).classes.map(c => c.courseId), [ID.EB]);
  assert.throws(() => F.mk(F.tk.sen, { courseId: ID.ED }), /do not have permission/);
  assert.strictEqual(F.mk(F.tk.sen, { courseId: ID.EB }).assignment.status, 'ACTIVE');
});
t('5: Student and BOD refused on every endpoint', () => {
  const F = prep(), G = F.G; F.mk(F.tk.admin); const id = F.rows()[0].Assignment_ID;
  [F.tk.student, F.tk.bod].forEach(tk => {
    assert.throws(() => G.getTempTeacherData(tk), /permission|ACCESS_OFF|turned off/i);
    assert.throws(() => F.mk(tk), /permission|ACCESS_OFF|turned off|Read-only/i);
    assert.throws(() => G.removeTempTeacherNow(tk, { assignmentId: id, confirmed: true }), /permission|ACCESS_OFF|turned off|Read-only/i);
    assert.throws(() => G.cancelTempTeacherAssignment(tk, { assignmentId: id }), /permission|ACCESS_OFF|turned off|Read-only/i);
  });
});
t('6: reason word limits with the exact messages', () => {
  const F = prep();
  assert.throws(() => F.mk(F.tk.admin, { reason: 'Teacher away this week' }), /^Error: Please provide at least 5 words explaining why this class requires a temporary teacher\.$/);
  assert.throws(() => F.mk(F.tk.admin, { reason: Array(201).fill('word').join(' ') }), /^Error: Reason cannot exceed 200 words\.$/);
  assert.strictEqual(F.mk(F.tk.admin, { reason: Array(200).fill('word').join(' ') }).ok, true, '200 words allowed');
});
t('7: dates — Removal Date mandatory, not before Start, Start not in the past, valid dates only', () => {
  const F = prep();
  assert.throws(() => F.mk(F.tk.admin, { removalDate: '' }), /Removal Date is required/);
  assert.throws(() => F.mk(F.tk.admin, { startDate: addDays(TODAY, 3), removalDate: addDays(TODAY, 2) }), /cannot be before the Start Date/);
  assert.throws(() => F.mk(F.tk.admin, { startDate: addDays(TODAY, -1) }), /cannot be in the past/);
  assert.throws(() => F.mk(F.tk.admin, { startDate: '2026-02-30' }), /valid Start Date/);
  assert.strictEqual(F.rows().length, 0); assert.strictEqual(F.api.create.length, 0);
  assert.strictEqual(F.mk(F.tk.admin, { removalDate: TODAY }).ok, true, 'one-day cover (start = removal) allowed');
});
t('8: already a Teacher (class list, Primary Teacher, live Classroom) → friendly message, nothing written', () => {
  const F = prep();
  assert.throws(() => F.mk(F.tk.admin, { teacherEmail: VP }), /already assigned as a Teacher/, 'r98: a typed email (here the class VP) still gets the already-a-Teacher check');
  assert.throws(() => F.mk(F.tk.admin, { teacherEmail: AYANA }), /already assigned as a Teacher/);
  F.cls.teachers[ID.EA].push({ userId: 'Z', profile: { id: 'Z', name: { fullName: 'S' }, emailAddress: SEN } }); // added in Classroom after the last sync
  assert.throws(() => F.mk(F.tk.admin, { teacherEmail: SEN }), /already assigned as a Teacher/);
  assert.strictEqual(F.rows().length, 0); assert.strictEqual(F.api.create.length, 0);
});
t('9: overlapping assignment for the same classroom blocked with the existing details; later dates allowed', () => {
  const F = prep(); F.mk(F.tk.admin);
  assert.throws(() => F.mk(F.tk.admin, { teacherEmail: SEN, startDate: addDays(TODAY, 2), removalDate: addDays(TODAY, 6) }), e => /overlaps the selected dates\. Existing: Tamil Cover Sakthi \(tcs_aps9001@/.test(e.message) && /ACTIVE, TT-/.test(e.message));
  assert.strictEqual(F.mk(F.tk.admin, { teacherEmail: SEN, startDate: addDays(TODAY, 4), removalDate: addDays(TODAY, 6) }).assignment.status, 'SCHEDULED');
  assert.strictEqual(F.mk(F.tk.admin, { courseId: ID.EB, teacherEmail: TCS, startDate: addDays(TODAY, 1), removalDate: addDays(TODAY, 2) }).ok, true, 'other classroom unaffected (same temp teacher may cover two classes)');
});
t('10: double submit (same requestId) creates one record and one Classroom call', () => {
  const F = prep(); const a = F.mk(F.tk.admin, { requestId: 'SAME1' }), b = F.mk(F.tk.admin, { requestId: 'SAME1' });
  assert.strictEqual(a.assignment.id, 'TT-SAME1'); assert.strictEqual(b.duplicate, true);
  assert.strictEqual(F.rows().length, 1); assert.strictEqual(F.api.create.length, 1); assert.strictEqual(F.mails(/Added/).length, 1);
});
t('11: future start → Scheduled (no Classroom call); scheduler adds on the Start Date; hourly trigger installed', () => {
  const F = prep(), s = addDays(TODAY, 2), r = F.mk(F.tk.admin, { startDate: s, removalDate: addDays(TODAY, 4) });
  assert.strictEqual(r.assignment.status, 'SCHEDULED'); assert.strictEqual(F.api.create.length, 0); assert.strictEqual(F.trig(), 1);
  assert.strictEqual(F.proc(at(addDays(TODAY, 1), 12)).added, 0);
  assert.strictEqual(F.proc(at(s, 0)).added, 1); assert.strictEqual(F.rows()[0].Status, 'ACTIVE'); assert.strictEqual(F.api.create.length, 1);
});
t('12: automatic removal on the Removal Date (from 11 PM ET) → Removed by SYSTEM + Removed email', () => {
  const F = prep(), rd = addDays(TODAY, 2); F.mk(F.tk.admin, { removalDate: rd });
  F.proc(at(rd, 22)); assert.strictEqual(F.rows()[0].Status, 'ACTIVE', 'still covering the last day');
  assert.strictEqual(J(F.G.getTempTeacherData(F.tk.admin)).summary.ACTIVE, 1);
  const o = F.proc(at(rd, 23)); assert.strictEqual(o.removed, 1);
  const row = F.rows()[0]; assert.strictEqual(row.Status, 'REMOVED'); assert.strictEqual(row.Removed_By, 'SYSTEM'); assert.deepStrictEqual(F.api.remove, [[ID.EA, TCS]]);
  const m = F.mails(/Temporary Teacher Removed/); assert.strictEqual(m.length, 1); assert.strictEqual(m[0].to, TCS); [AYANA, HM, VP, ADMIN].forEach(e => assert.ok(m[0].cc.includes(e), e));
  assert.ok(F.cls.teachers[ID.EA].some(x => x.profile.emailAddress === AYANA), 'Primary Teacher still in the class');
  assert.strictEqual(F.trig(), 0, 'no open assignment → scheduler removed');
});
t('13: Removal Due shown when the time is reached but not processed yet', () => {
  const F = prep(), G = F.G; F.mk(F.tk.admin, { removalDate: TODAY });
  const rec = G.ttmRows_()[0]; assert.strictEqual(G.ttmDisplayStatus_(rec, at(TODAY, 23)), 'REMOVAL_DUE'); assert.strictEqual(G.ttmDisplayStatus_(rec, at(TODAY, 9)), 'ACTIVE');
});
t('14: processor is idempotent — repeated runs never remove or email twice', () => {
  const F = prep(), rd = addDays(TODAY, 1); F.mk(F.tk.admin, { removalDate: rd });
  F.proc(at(addDays(rd, 1), 9)); F.proc(at(addDays(rd, 1), 10)); F.proc(at(addDays(rd, 2), 10));
  assert.strictEqual(F.api.remove.length, 1); assert.strictEqual(F.mails(/Removed/).length, 1); assert.strictEqual(F.api.create.length, 1);
});
t('15: removal failure → Failed, ACTION REQUIRED email to admin@ (CC HM / VP / Primary) once; next run retries and removes', () => {
  const F = prep(), rd = addDays(TODAY, 1); F.mk(F.tk.admin, { removalDate: rd }); F.api.failRemove = 'Internal error encountered.';
  F.proc(at(rd, 23)); F.proc(at(addDays(rd, 1), 1));
  const row = F.rows()[0]; assert.strictEqual(row.Status, 'FAILED'); assert.strictEqual(row.Failed_Stage, 'REMOVE');
  const al = F.mails(/^ACTION REQUIRED – Temp Teacher Removal Failed/); assert.strictEqual(al.length, 1, 'sent once');
  assert.strictEqual(al[0].to, ADMIN); [HM, VP, AYANA].forEach(e => assert.ok(al[0].cc.includes(e), e)); assert.ok(/donotreply@/.test(al[0].from));
  assert.strictEqual(J(F.G.getTempTeacherData(F.tk.admin)).summary.FAILED, 1);
  F.api.failRemove = null; F.proc(at(addDays(rd, 1), 2));
  assert.strictEqual(F.rows()[0].Status, 'REMOVED'); assert.strictEqual(F.mails(/Removed/).length, 1);
});
t('16: Remove Temp Teacher Now needs confirmation; removes; Removed_By is the user', () => {
  const F = prep(), G = F.G; F.mk(F.tk.admin); const id = F.rows()[0].Assignment_ID;
  assert.throws(() => G.removeTempTeacherNow(F.tk.vp, { assignmentId: id }), /confirm/);
  const r = J(G.removeTempTeacherNow(F.tk.vp, { assignmentId: id, confirmed: true }));
  assert.strictEqual(r.assignment.status, 'REMOVED'); assert.strictEqual(F.rows()[0].Removed_By, VP); assert.strictEqual(F.rows()[0].Manual_Action, 'REMOVED_NOW');
  assert.strictEqual(J(G.removeTempTeacherNow(F.tk.vp, { assignmentId: id, confirmed: true })).message, 'Already removed.');
  assert.strictEqual(F.api.remove.length, 1);
});
t('17: Cancel before the start keeps the record; an active assignment cannot be cancelled', () => {
  const F = prep(), G = F.G; F.mk(F.tk.admin, { startDate: addDays(TODAY, 2), removalDate: addDays(TODAY, 3) }); F.mk(F.tk.admin, { courseId: ID.EB, teacherEmail: TCS });
  const [s, a] = [F.rows()[0].Assignment_ID, F.rows()[1].Assignment_ID];
  assert.strictEqual(J(G.cancelTempTeacherAssignment(F.tk.hm, { assignmentId: s })).assignment.status, 'CANCELLED');
  assert.strictEqual(F.rows().length, 2, 'record kept'); assert.strictEqual(F.rows()[0].Cancelled_By, 'hm@aps.org');
  assert.throws(() => G.cancelTempTeacherAssignment(F.tk.hm, { assignmentId: a }), /Remove Temp Teacher Now/);
  F.proc(at(addDays(TODAY, 2), 9)); assert.strictEqual(F.api.create.filter(x => x[0] === ID.EA).length, 0, 'cancelled → never added');
});
t('18: add failure → Failed (ADD) + alert; ALREADY_EXISTS → never removed automatically', () => {
  const F = prep(); F.api.failCreate = 'The caller does not have permission';
  const r = F.mk(F.tk.admin); assert.strictEqual(r.ok, false); assert.strictEqual(r.message, 'Temporary teacher could not be added to the Google Classroom. Please try again or contact APS Admin.');
  assert.strictEqual(F.mails(/ACTION REQUIRED – Temp Teacher Add Failed/).length, 1);
  F.api.failCreate = null; F.proc(at(TODAY, 12)); assert.strictEqual(F.rows()[0].Status, 'ACTIVE', 'retried by the scheduler');
  const F2 = prep(), G2 = F2.G; F2.mk(F2.tk.admin, { startDate: addDays(TODAY, 1), removalDate: addDays(TODAY, 2) });
  F2.cls.teachers[ID.EA].push({ userId: 'Q', profile: { id: 'Q', name: { fullName: 'T' }, emailAddress: TCS } });
  F2.proc(at(addDays(TODAY, 1), 9)); assert.strictEqual(F2.rows()[0].Last_Process_Status, 'ALREADY_MEMBER');
  F2.proc(at(addDays(TODAY, 3), 9)); assert.strictEqual(F2.api.remove.length, 0, 'not added by this feature → never removed'); assert.strictEqual(F2.rows()[0].Status, 'CANCELLED');
});
t('19: Primary Teacher protection — never removed even if they became the Primary Teacher', () => {
  const F = prep(); F.mk(F.tk.admin, { removalDate: TODAY });
  const c = F.cls.courses.find(x => x.id === ID.EA); c.description = 'Teacher: ' + TCS; F.G.syncClassroomData();
  F.proc(at(TODAY, 23)); assert.strictEqual(F.api.remove.length, 0); assert.strictEqual(F.rows()[0].Status, 'FAILED');
});
t('20: full audit trail + structured log events', () => {
  const F = prep(), G = F.G, rd = addDays(TODAY, 1); F.mk(F.tk.admin, { removalDate: rd }); F.mk(F.tk.admin, { courseId: ID.EB, startDate: addDays(TODAY, 1), removalDate: rd });
  G.cancelTempTeacherAssignment(F.tk.admin, { assignmentId: F.rows()[1].Assignment_ID }); F.api.failRemove = 'boom'; F.proc(at(rd, 23)); F.api.failRemove = null; F.proc(at(rd, 23));
  const ev = F.audit();
  ['TEMP_TEACHER_ASSIGNMENT_CREATED', 'TEMP_TEACHER_ADDED', 'TEMP_TEACHER_EMAIL_SENT', 'TEMP_TEACHER_CANCELLED', 'TEMP_TEACHER_REMOVAL_STARTED', 'TEMP_TEACHER_REMOVAL_FAILED', 'TEMP_TEACHER_REMOVED'].forEach(e => assert.ok(ev.includes(e), e));
  const s = F.env.wb.getSheetByName('TEMP_TEACHER_AUDIT').data; assert.ok(s.slice(1).every(r => !/refresh|secret|token|password/i.test(r.join(' '))), 'no credentials in the audit');
  const ad = s.slice(1).find(r => r[2] === 'TEMP_TEACHER_REMOVED'); assert.strictEqual(ad[4], 'SYSTEM');
});
t('21: class-card note for every role (students too) — name + APSID + dates, in advance; gone after removal', () => {
  const F = prep(), G = F.G; F.mk(F.tk.admin, { startDate: addDays(TODAY, 1), removalDate: addDays(TODAY, 3) });
  const card = tk => J(G.getDashboardData(tk)).courses.find(c => String(c.id) === ID.EA);
  const n = card(F.tk.student).tempTeacherNote; assert.strictEqual(n.length, 1);
  assert.deepStrictEqual(Object.keys(n[0]).sort(), ['apsId', 'name', 'now', 'removal', 'start']); assert.strictEqual(n[0].name, 'Tamil Cover Sakthi'); assert.strictEqual(n[0].apsId, 'APS9001'); assert.strictEqual(n[0].now, false, 'upcoming');
  assert.ok(!JSON.stringify(n).includes('@'), 'no email in the note'); assert.ok(!JSON.stringify(n).includes('travelling'), 'no reason in the note');
  assert.ok(card(F.tk.admin).tempTeacherNote);
  G.cancelTempTeacherAssignment(F.tk.admin, { assignmentId: F.rows()[0].Assignment_ID });
  assert.strictEqual(card(F.tk.student).tempTeacherNote, undefined, 'cache cleared on change');
});
t('22: Access Control row + switch-off is enforced on the server; scheduler endpoint refuses browser calls', () => {
  const F = prep(), G = F.G;
  const row = G.AC_CATALOG_.find(x => x.key === 'classes.tempTeacher'); assert.deepStrictEqual([row.parent, row.cells], ['classes', 'AYYYLYL']);
  assert.strictEqual(J(G.getDashboardData(F.tk.vp)).tempTeacherAccess, true); assert.strictEqual(J(G.getDashboardData(F.tk.student)).tempTeacherAccess, false);
  G.saveAccessControl(F.tok('admin@aps.org', 'admin'), [{ role: 'teacher', key: 'classes.tempTeacher', visible: false }]);
  assert.throws(() => G.getTempTeacherData(F.tk.vp), /ACCESS_OFF|turned off/i); assert.throws(() => F.mk(F.tk.vp), /ACCESS_OFF|turned off/i);
  assert.ok(J(G.getTempTeacherData(F.tk.hm)).classes.length > 0, 'other roles unaffected');
  assert.throws(() => G.processTemporaryTeacherAssignments({}), /Access denied/);
});
t('23: expired never-added assignment is closed (Cancelled, EXPIRED_NOT_ADDED) without Classroom calls', () => {
  const F = prep(); F.api.failCreate = 'boom'; F.mk(F.tk.admin, { removalDate: TODAY }); F.api.failCreate = 'boom';
  F.proc(at(addDays(TODAY, 1), 8)); const r = F.rows()[0]; assert.strictEqual(r.Status, 'CANCELLED'); assert.strictEqual(r.Manual_Action, 'EXPIRED_NOT_ADDED'); assert.strictEqual(F.api.remove.length, 0);
});
t('24 (r97): Temporary Teacher list = TCS_ONCALL_TEACHER_LIST column E first (sheet order, even when in no class) + every Primary Teacher; VP / HM / co-teachers not offered', () => {
  const { SUPRITHA } = require('./ttfixture');
  const F = prep(), G = F.G;
  const list = J(G.getTempTeacherData(F.tk.admin)).teachers;
  assert.deepStrictEqual(list.filter(t => t.tcsList).map(t => t.email), [TCS, SUPRITHA], 'sheet order; invalid, non-APS and duplicate rows dropped');
  const sup = list.find(t => t.email === SUPRITHA);
  assert.deepStrictEqual([sup.name, sup.apsId, sup.onCall, sup.classes.length], ['Supritha Ramesh', 'APS8093', true, 0], 'name from the Teacher Name column; not in any class yet');
  const rest = list.filter(t => !t.tcsList);
  assert.ok(rest.every(t => t.primary), 'below the TCS list: Primary Teachers only');
  assert.ok(rest.some(t => t.email === AYANA) && rest.some(t => t.email === SEN), 'Primary Teachers listed');
  assert.ok(!list.some(t => t.email === VP || t.email === HM), 'class VP / HM not offered');
  assert.deepStrictEqual(rest.map(t => t.name), rest.map(t => t.name).slice().sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), 'Primary Teachers A-Z');
  assert.strictEqual(list.indexOf(sup) < list.indexOf(list.find(t => t.email === AYANA)), true, 'TCS on top');
  // an invited TCS teacher who is in no Google Classroom yet can be assigned (added as a Teacher when the cover starts)
  const r = J(G.createTempTeacherAssignment(F.tk.admin, { courseId: ID.EA, teacherEmail: SUPRITHA, startDate: TODAY, removalDate: addDays(TODAY, 2), reason: 'Primary teacher is travelling for two weeks this month.', requestId: 'SUP00001' }));
  assert.strictEqual(r.assignment.status, 'ACTIVE'); assert.deepStrictEqual(F.api.create, [[ID.EA, { userId: SUPRITHA }]]);
  assert.strictEqual(F.rows()[0].Temp_Teacher_Name, 'Supritha Ramesh');
  // sheet edits are picked up after the 5-minute cache (here: cache cleared)
  F.env.wb.sheets.TCS_ONCALL_TEACHER_LIST.data.push(['6', 'New Cover', '', '', 'tcs_newcover_aps8100@avvaiyarpadasalai.org']);
  delete F.env.cache.ttm_tcs_list_v1;
  assert.ok(J(G.getTempTeacherData(F.tk.admin)).teachers.some(t => t.email === 'tcs_newcover_aps8100@avvaiyarpadasalai.org' && t.tcsList));
  // no sheet → still works with Primary Teachers only
  delete F.env.wb.sheets.TCS_ONCALL_TEACHER_LIST; delete F.env.cache.ttm_tcs_list_v1;
  const l2 = J(G.getTempTeacherData(F.tk.admin)).teachers; assert.ok(l2.length > 0 && l2.every(t => !t.tcsList));
});
const { D } = require('./ttfixture');
t('26 (r100): the temp teacher never manages the class they cover; transient add error is not "already a member"; removal retries stop; typed email per class', () => {
  const F = prep(), G = F.G;
  const r = F.mk(F.tk.admin); assert.strictEqual(r.assignment.status, 'ACTIVE');
  G.syncClassroomData(); // the TCS teacher now appears on EA's roster
  const tcsTok = F.tok(TCS, 'teacher');
  const mine = J(G.getTempTeacherData(tcsTok));
  assert.ok(!mine.classes.some(c => c.courseId === ID.EA), 'EA (the class they cover) is not manageable by the temp teacher');
  assert.throws(() => G.removeTempTeacherNow(tcsTok, { assignmentId: r.assignment.id, confirmed: true }), /permission/);
  assert.throws(() => G.cancelTempTeacherAssignment(tcsTok, { assignmentId: r.assignment.id }), /permission/);
  assert.throws(() => F.mk(tcsTok, { courseId: ID.EA, startDate: addDays(TODAY, 10), removalDate: addDays(TODAY, 11), teacherEmail: SEN }), /permission/);
  // typed email is per class: the VP may type for the class they support; a plain teacher's classes say anyEmail=false
  assert.ok(J(G.getTempTeacherData(F.tk.vp)).classes.every(c => c.anyEmail === true));
  assert.ok(J(G.getTempTeacherData(F.tk.sen)).classes.every(c => c.anyEmail === false));
  assert.ok(J(G.getTempTeacherData(F.tk.admin)).classes.every(c => c.anyEmail === true));
  // transient Classroom error AFTER the add went through → ACTIVE (removed on schedule), never ALREADY_MEMBER
  const T = G.Classroom.Courses.Teachers, origCreate = T.create; let n = 0;
  T.create = function (res, cid) { const out = origCreate.call(T, res, cid); if (++n === 1) throw new Error('Backend Error: backendError'); return out; };
  const r2 = F.mk(F.tk.admin, { courseId: ID.EB, teacherEmail: 'newcover_aps8210' + D });
  T.create = origCreate;
  assert.strictEqual(r2.assignment.status, 'ACTIVE', JSON.stringify(r2)); assert.notStrictEqual(F.rows().find(x => x.Classroom_ID === ID.EB).Last_Process_Status, 'ALREADY_MEMBER');
  // a removal that keeps failing is retried hourly up to the cap, then parked (no more audit rows); the hourly job is then removed
  const rd = F.rows().find(x => x.Classroom_ID === ID.EB).Removal_Date;
  F.api.failRemove = 'Course is archived';
  for (let h = 0; h < 40; h++) F.proc(new Date(at(rd, 23).getTime() + h * 3600000));
  const ev = F.env.wb.getSheetByName('TEMP_TEACHER_AUDIT').data.slice(1).filter(x => x[8] === 'newcover_aps8210' + D);
  const fails = ev.filter(x => x[2] === 'TEMP_TEACHER_REMOVAL_FAILED').length, starts = ev.filter(x => x[2] === 'TEMP_TEACHER_REMOVAL_STARTED').length;
  assert.ok(fails > 1 && fails <= 24, 'capped: ' + fails); assert.strictEqual(starts, 1, 'one STARTED row, not one per hour');
  const rec = F.rows().find(x => x.Classroom_ID === ID.EB); assert.strictEqual(rec.Status, 'FAILED'); assert.ok(G.ttmRemovalParked_(rec));
  // the Admin can still remove it manually once Classroom allows it
  F.api.failRemove = null;
  assert.strictEqual(J(G.removeTempTeacherNow(F.tk.admin, { assignmentId: rec.Assignment_ID, confirmed: true })).assignment.status, 'REMOVED');
});
t('25 (r98): Admin / HM / VP / On-Call Coordinator may assign ANY valid APS email (not only the list); format, domain, student and account checks; plain Teacher keeps the list', () => {
  const F = prep(), G = F.G, NEW = 'newcover_aps8200' + D;
  const d = J(G.getTempTeacherData(F.tk.admin)); assert.strictEqual(d.canAnyEmail, true); assert.ok(d.emailDomains.includes('avvaiyarpadasalai.org')); assert.ok(d.today && d.removalHourLabel && d.minWords === 5 && d.maxWords === 200, 'existing fields unchanged');
  assert.ok(!d.teachers.some(t => t.email === NEW), 'not in the list');
  const r = F.mk(F.tk.admin, { teacherEmail: '  ' + NEW.toUpperCase() + ' ' });
  assert.strictEqual(r.assignment.status, 'ACTIVE'); assert.deepStrictEqual(F.api.create, [[ID.EA, { userId: NEW }]]);
  const row = F.rows()[0]; assert.deepStrictEqual([row.Temp_Teacher_Email, row.Temp_Teacher_Name, row.Temp_Teacher_APSID], [NEW, 'Dir Name', 'APS8200']);
  assert.strictEqual(F.mails(/Temporary Teacher Added/).length, 1, 'same Added email');
  const au = F.env.wb.getSheetByName('TEMP_TEACHER_AUDIT').data.slice(1).find(x => x[2] === 'TEMP_TEACHER_ASSIGNMENT_CREATED'); assert.ok(/email entered \(not in the teacher list\)/.test(au[12]));
  // format / domain
  ['abc', 'abc@', 'a b@avvaiyarpadasalai.org', 'someone@gmail.com'].forEach(e => assert.throws(() => F.mk(F.tk.admin, { courseId: ID.EB, teacherEmail: e }), /Select a teacher \(APS email\)/, e));
  // student accounts (dashboard roster, then Directory Students OU) and unknown accounts
  const stu = G.readAllCoursesFromCache_().find(c => (c.students || []).length).students[0].email;
  assert.throws(() => F.mk(F.tk.admin, { courseId: ID.EB, teacherEmail: stu }), /belongs to a student account/);
  const dir = G.AdminDirectory.Users.get; G.AdminDirectory.Users.get = e => /ou_kid/.test(e) ? { primaryEmail: e, orgUnitPath: '/Students/2026', name: { fullName: 'Kid' } } : dir(e);
  assert.throws(() => F.mk(F.tk.admin, { courseId: ID.EB, teacherEmail: 'ou_kid_aps9900' + D }), /belongs to a student account/);
  assert.throws(() => F.mk(F.tk.admin, { courseId: ID.EB, teacherEmail: 'nobody_aps9901' + D }), /could not be verified/);
  G.AdminDirectory.Users.get = dir;
  // HM: any class
  assert.strictEqual(F.mk(F.tk.hm, { courseId: ID.EB, teacherEmail: 'hmpick_aps8201' + D }).assignment.status, 'ACTIVE');
  // VP: any email, own classes only
  assert.strictEqual(J(G.getTempTeacherData(F.tk.vp)).canAnyEmail, true);
  assert.throws(() => F.mk(F.tk.vp, { courseId: ID.ED, teacherEmail: 'vppick_aps8202' + D }), /do not have permission/);
  // plain Teacher: list only (unchanged)
  assert.strictEqual(J(G.getTempTeacherData(F.tk.sen)).canAnyEmail, false);
  assert.throws(() => F.mk(F.tk.sen, { courseId: ID.EB, startDate: addDays(TODAY, 10), removalDate: addDays(TODAY, 11), teacherEmail: 'senpick_aps8203' + D }), /^Error: Select a teacher from the APS teacher list\.$/);
  // On-Call Coordinator (BOD role + ON_CALL_COORDINATOR_EMAILS): every class, any email, Remove Now; other BOD members still refused
  const coord = F.tok('tcs_asvika_aps8112@avvaiyarpadasalai.org', 'vcfo_amchsts_bod');
  const cd = J(G.getTempTeacherData(coord)); assert.deepStrictEqual([cd.canAll, cd.canAnyEmail, cd.roleLabel], [true, true, 'On-Call Coordinator']);
  const c1 = F.mk(coord, { courseId: ID.ED, teacherEmail: 'coordpick_aps8204' + D }); assert.strictEqual(c1.assignment.status, 'ACTIVE'); assert.strictEqual(F.rows().find(x => x.Assignment_ID === c1.assignment.id).Created_By_Role, 'On-Call Coordinator');
  assert.strictEqual(J(G.removeTempTeacherNow(coord, { assignmentId: c1.assignment.id, confirmed: true })).assignment.status, 'REMOVED');
  assert.strictEqual(J(G.getDashboardData(coord)).tempTeacherAccess, true); assert.strictEqual(J(G.getDashboardData(F.tk.bod)).tempTeacherAccess, false);
  assert.throws(() => G.getTempTeacherData(F.tk.bod), /permission/);
  G.saveAccessControl(F.tok('admin@aps.org', 'admin'), [{ role: 'vcfo_amchsts_bod', key: 'classes.tempTeacher', visible: false }]);
  assert.throws(() => G.getTempTeacherData(coord), /permission|ACCESS_OFF|turned off/i); assert.strictEqual(J(G.getDashboardData(coord)).tempTeacherAccess, false);
});
console.log(pass + ' passed');

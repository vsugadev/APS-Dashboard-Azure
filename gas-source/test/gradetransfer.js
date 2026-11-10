// r111 — Re-Map grade transfer: Part 1 capture BEFORE removal (read-only Classroom), Part 2 view-only carried grades in Grading. (node test/gradetransfer.js)
const assert = require('assert');
const { build } = require('./gradingfixture');
const tests = []; const t = (n, fn) => tests.push([n, fn]);

function setup(props) {
  const F = build({ props: Object.assign({ APS_ENVIRONMENT: 'LIVE' }, props || {}) }); const { G, cls, P, ids, J } = F;
  G.Session = { getActiveUser: () => ({ getEmail: () => 'admin@aps.org' }), getEffectiveUser: () => ({ getEmail: () => 'admin@aps.org' }) };
  // Real Classroom behaviour: a removed student's work is hidden — the API returns nothing for them any more.
  const subsList = G.Classroom.Courses.CourseWork.StudentSubmissions.list;
  F.subCalls = [];
  G.Classroom.Courses.CourseWork.StudentSubmissions.list = (cid, wid, o) => {
    if (o && o.userId) {
      const p = (cls.students[cid] || []).find(s => s.profile.emailAddress === o.userId);
      F.subCalls.push({ cid, email: o.userId, enrolled: !!p });
      if (!p) return { studentSubmissions: [] };
      return { studentSubmissions: (cls.subs[cid] || []).filter(s => s.userId === p.userId).map(J) };
    }
    return subsList(cid, wid, o);
  };
  F.writes = [];
  G.Classroom.Courses.Students.remove = (cid, email) => { F.writes.push(['remove', cid, email]); cls.students[cid] = (cls.students[cid] || []).filter(s => s.profile.emailAddress !== email); return {}; };
  G.Classroom.Courses.Students.create = (body, cid) => { F.writes.push(['create', cid, body.userId]); if (F.failCreate && cid === F.failCreate) throw new Error('The caller does not have permission'); const p = Object.values(P).find(x => x.profile.emailAddress === body.userId); (cls.students[cid] = cls.students[cid] || []).push(p); return {}; };
  // course cache (what syncClassroomData writes) — seeded directly from the fixture classrooms
  const cs = F.env.wb.insertSheet('Courses'); cs.data[0] = new Array(18).fill('h');
  cls.courses.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id;
    row[17] = JSON.stringify({ id: c.id, name: c.name, courseState: c.courseState, section: c.section || '', teachers: (cls.teachers[c.id] || []).map(x => ({ name: x.profile.name.fullName, email: x.profile.emailAddress })),
      students: (cls.students[c.id] || []).map(x => ({ name: x.profile.name.fullName, email: x.profile.emailAddress })), classSupport: [] }); cs.data[i + 1] = row; });
  F.A = F.tok('admin@aps.org', 'admin');
  F.rows = () => { const s = F.env.wb.sheets.STUDENT_GRADE_TRANSFER; if (!s) return []; const h = s.data[0]; return s.data.slice(1).filter(r => r && r.some(Boolean)).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
  return F;
}
const JOSH = 'joshua_aps3407@avvaiyarpadasalai.org';

t('Part 1: grades are read from the OLD class BEFORE the student is removed, saved, then the move happens; read-only on Classroom', () => {
  const F = setup(); const { G, ids } = F;
  const r = G.assignStudentToClassroom(F.A, JOSH, ids.MAZ, 'Parent asked for the Friday 7:30 class');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(F.subCalls.length, 1); assert.deepStrictEqual(F.subCalls[0], { cid: ids.N3EF, email: JOSH, enrolled: true }, 'one call, while still enrolled');
  assert.deepStrictEqual(F.writes.map(w => w[0]), ['remove', 'create'], 'the only Classroom changes are the move itself (no coursework / grade writes)');
  const rows = F.rows(); const sum = rows.find(x => x.Record_Type === 'SUMMARY'), items = rows.filter(x => x.Record_Type === 'ITEM');
  const expect = F.cls.work[ids.N3EF].filter(w => w.state === 'PUBLISHED' && G.gradesCategory_(w.title) && !G.gradesIsExcluded_(w.title, G.gradesExcludePrefixes_())).map(w => w.title).sort();
  assert.deepStrictEqual(items.map(x => x.Title).sort(), expect, 'every approved assignment of the old class, nothing else');
  assert.ok(items.length >= 4);
  const hw1 = items.find(x => x.Title === 'HW_LSN_1'), hw2 = items.find(x => x.Title === 'HW_LSN_2');
  assert.deepStrictEqual([hw1.Assigned_Grade, hw1.Max_Points, hw1.Status, hw1.Category, String(hw1.Lesson_No), hw1.State], ['9', '10', 'COMPLETED', 'HOMEWORK', '1', 'RETURNED']);
  assert.deepStrictEqual([hw2.Assigned_Grade, hw2.Status, hw2.Late], ['', 'TURNED_IN_LATE', 'TRUE']);
  assert.ok(hw1.Turn_In_Date && hw1.Graded_Date && hw1.Returned_Date, 'dates kept');
  assert.deepStrictEqual([sum.Student_Email, sum.Student_APS_ID, sum.From_Course_ID, sum.To_Course_ID, sum.Captured_By, sum.Reason], [JOSH, 'APS3407', ids.N3EF, ids.MAZ, 'admin@aps.org', 'Parent asked for the Friday 7:30 class']);
  assert.ok(sum.From_Class.startsWith('NILAI 3 - EF') && sum.To_Class.startsWith('MAZHALAI - CB'));
  const graded = items.filter(x => x.Assigned_Grade !== '').length;
  assert.ok(r.message.includes('Grades saved from the previous class: ' + items.length + ' assignment(s), ' + graded + ' graded'), r.message);
  // a later sync no longer sees the hidden work — the saved rows are the only copy
  assert.deepStrictEqual(G.Classroom.Courses.CourseWork.StudentSubmissions.list(ids.N3EF, '-', { userId: JOSH }).studentSubmissions, []);
});
t('capture fails (Classroom error) → Re-Map STOPS, nothing changed; with GRADE_TRANSFER_REQUIRED=false the move continues and says grades were not saved', () => {
  const F = setup(); const { G, ids, cls } = F;
  cls.fail[ids.N3EF] = { op: 'work', msg: 'Service unavailable (503)' };
  assert.throws(() => G.assignStudentToClassroom(F.A, JOSH, ids.MAZ, 'Move'), /Re-Map stopped: the student's grades in NILAI 3 - EF .* could not be saved first .*Nothing was changed/);
  assert.deepStrictEqual(F.writes, [], 'student not removed, not added'); assert.ok(cls.students[ids.N3EF].some(s => s.profile.emailAddress === JOSH));
  assert.strictEqual(F.rows().length, 0);
  const F2 = setup({ GRADE_TRANSFER_REQUIRED: 'false' }); F2.cls.fail[F2.ids.N3EF] = { op: 'work', msg: 'Service unavailable (503)' };
  const r = F2.G.assignStudentToClassroom(F2.A, JOSH, F2.ids.MAZ, 'Move');
  assert.ok(r.ok && /Grades from the previous class could NOT be saved/.test(r.message));
});
t('the move fails after the capture → rollback as before AND the capture is voided (never shown)', () => {
  const F = setup(); const { G, ids } = F; F.failCreate = ids.MAZ; // only the new class refuses; the rollback works
  assert.throws(() => G.assignStudentToClassroom(F.A, JOSH, ids.MAZ, 'Move'), /original classroom assignment was restored/);
  const types = F.rows().map(x => x.Record_Type);
  assert.ok(types.includes('SUMMARY') && types.includes('VOID'));
  assert.strictEqual(G.gtReadItems_().length, 0, 'voided capture is ignored');
});
t('a student with no previous class (first assignment) → no capture, no extra Classroom call', () => {
  const F = setup(); const NEW = 'newkid_aps9999@avvaiyarpadasalai.org';
  F.P.NEWKID = F.person('NK', 'New Kid', NEW);
  const r = F.G.assignStudentToClassroom(F.A, NEW, F.ids.MAZ, 'New admission');
  assert.ok(r.ok && !/Grades/.test(r.message)); assert.strictEqual(F.subCalls.length, 0); assert.strictEqual(F.rows().length, 0);
});
t('Part 2: Grading shows the carried grades view-only to the NEW class teacher, Admin and the student — not to unrelated teachers or students', () => {
  const F = setup(); const { G, ids } = F;
  G.assignStudentToClassroom(F.A, JOSH, ids.MAZ, 'Move');
  G.syncGrading(F.A, { refreshRoster: true }); // the roster now shows Joshua in MAZHALAI - CB
  const carried = tk => F.J(G.getGradingData(tk)).carried;
  const newTeacher = carried(F.tok('teacherb_aps102@avvaiyarpadasalai.org', 'teacher'));
  assert.ok(newTeacher.length >= 4 && newTeacher.every(r => r.e === JOSH && r.toId === ids.MAZ && r.fromId === ids.N3EF));
  const hw1 = newTeacher.find(r => r.t === 'HW_LSN_1'); assert.deepStrictEqual([hw1.g, hw1.max, hw1.status, hw1.cat], ['9', '10', 'COMPLETED', 'HOMEWORK']);
  assert.strictEqual(carried(F.A).length, 0, 'Admin who only teaches another class: same rule as Grading (assigned classes only)');
  F.env.props.APS_GRADING_ALL_CLASSES_ROLES = 'ADMIN';
  assert.strictEqual(carried(F.A).length, newTeacher.length, 'Admin with all-classes Grading access sees them');
  assert.strictEqual(carried(F.tok(JOSH, 'student')).length, newTeacher.length, 'the student sees their own');
  assert.strictEqual(carried(F.tok('raja_aps1234@avvaiyarpadasalai.org', 'student')).length, 0, 'another student: nothing');
  assert.strictEqual(carried(F.tok('tx1_aps301@avvaiyarpadasalai.org', 'teacher')).length, 0, 'a teacher of an unrelated class: nothing');
});

t('r112: the Class / Grade Change Audit Log records the grade-transfer result (success, not saved, none); an existing 11-column log is upgraded, old rows untouched', () => {
  const F = setup({ GRADE_TRANSFER_REQUIRED: 'false' }); const { G, ids, cls } = F;
  const sh = F.env.wb.insertSheet('Student_Classroom_Assignment_Audit'); // production sheet as it is today: 11 columns + an older row
  sh.data[0] = ['Timestamp', 'Admin Email', 'Student Name', 'Student APS Email', 'From Classroom', 'From Timing', 'To Classroom', 'To Timing', 'Student Count After', 'Action', 'Reason'];
  sh.data[1] = ['2026-10-30T12:53:32.824Z', 'info@avvaiyarpadasalai.org', 'Old Move', 'old_aps1@avvaiyarpadasalai.org', 'A', '', 'B', '', 4, 'COMPLETED', 'older row'];
  assert.strictEqual(G.ASSIGN_CLASSROOM_AUDIT_SHEET_NAME, 'Student_Classroom_Assignment_Audit');
  G.assignStudentToClassroom(F.A, JOSH, ids.MAZ, 'Parent request');
  assert.strictEqual(sh.data[0][11], 'Grade Transfer', 'header added as column 12');
  const tid = F.rows().find(x => x.Record_Type === 'SUMMARY').Transfer_ID;
  const items = F.rows().filter(x => x.Record_Type === 'ITEM'), graded = items.filter(x => x.Assigned_Grade !== '').length;
  const log = F.J(G.getAdminAssignmentAuditLog(F.A));
  const mine = log.find(r => r.studentEmail === JOSH && r.type === 'Assign Classroom');
  assert.strictEqual(mine.gradeTransfer, 'Grades saved from the previous class: ' + items.length + ' assignment(s), ' + graded + ' graded. Transfer ID: ' + tid);
  assert.strictEqual(log.find(r => r.studentName === 'Old Move').gradeTransfer, '', 'older rows unchanged');
  // capture not possible but the move allowed → recorded as NOT saved
  cls.fail[ids.N3EA] = { op: 'work', msg: 'Service unavailable (503)' };
  G.assignStudentToClassroom(F.A, 'vani_aps2222@avvaiyarpadasalai.org', ids.N3EA, 'Test'); // Vani: N4AB → N3EA (the old class read works) …
  cls.fail = {}; cls.fail[ids.N4AB] = { op: 'work', msg: 'Service unavailable (503)' };
  G.assignStudentToClassroom(F.A, 'vani_aps2222@avvaiyarpadasalai.org', ids.MAZ, 'Test 2'); // … stale cache still says N4AB → read fails → allowed by the switch
  const v = F.J(G.getAdminAssignmentAuditLog(F.A)).filter(r => r.studentEmail === 'vani_aps2222@avvaiyarpadasalai.org').map(r => r.gradeTransfer);
  assert.ok(v.some(x => /^Grades from the previous class could NOT be saved \(.*503.*\)\.$/.test(x)), JSON.stringify(v));
  // first assignment (no previous class) → nothing recorded
  G.assignStudentToClassroom(F.A, 'newkid_aps9999@avvaiyarpadasalai.org', ids.MAZ, 'New admission');
  assert.strictEqual(F.J(G.getAdminAssignmentAuditLog(F.A)).find(r => r.studentEmail === 'newkid_aps9999@avvaiyarpadasalai.org').gradeTransfer, '');
});

let fails = 0;
for (const [n, fn] of tests) { try { fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 6).join('\n   ')); } }
console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);

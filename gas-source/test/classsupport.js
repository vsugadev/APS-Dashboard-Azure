// APS Classroom role model — Description = PRIMARY_TEACHER, Room "VP Email:" / "HM Email:" = VP / HM (node test/classsupport.js)
const assert = require('assert');
const { build } = require('./gradingfixture');
let pass = 0;
const vm_clearCooldown = F => { Object.keys(F.env.cache).forEach(k => { if (/cooldown|stage/i.test(k)) delete F.env.cache[k]; }); };
const t = (name, fn) => { try { fn(); pass++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name + '\n' + (e.stack || e)); process.exitCode = 1; } };
const J = x => JSON.parse(JSON.stringify(x));
const D = '@avvaiyarpadasalai.org';
const VP1 = 'vp1_aps701' + D, VP2 = 'vp2_aps702' + D, VP3 = 'vp3_aps703' + D;
const HM1 = 'hm1_aps711' + D, HM2 = 'hm2_aps712' + D, HM3 = 'hm3_aps713' + D;
const TA = 'teachera_aps101' + D, TB = 'teacherb_aps102' + D;
const TTS = 'tts_ravi_aps501' + D, TCS = 'tcs_kala_aps502' + D;

// Production-like config: tts_ / tcs_ accounts are hidden from the roster unless the class names them.
function setup(props) {
  const F = build({ props: Object.assign({ HIDDEN_TEACHER_EMAIL_PREFIXES: '["aps_","tts_","tcs_"]' }, props || {}) });
  const { env, cls } = F;
  const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0);
  P.clearContents = P.clearContents || function () { this.data = []; return this; };
  P.autoResizeColumns = P.autoResizeColumns || function () { return this; };
  delete env.wb.sheets.__p;
  F.creates = []; F.failAdd = {};
  F.names = { [TTS]: 'Ravi Kumar', [TCS]: 'Kala Devi', [VP1]: 'Vani Prakash', [HM1]: 'Hema Mohan' };
  env.ctx.Classroom.Courses.Teachers.create = (res, cid) => {
    F.creates.push(cid + '|' + res.userId);
    if (F.failAdd[res.userId]) throw new Error('@CannotDirectAddUser The caller does not have permission');
    const prof = { id: 'N', name: { fullName: F.names[res.userId] || 'Named Person' }, emailAddress: res.userId };
    cls.teachers[cid].push({ userId: 'N' + res.userId, profile: prof });
    return { userId: 'N' + res.userId, profile: prof };
  };
  F.course = id => cls.courses.find(c => c.id === id);
  F.set = (id, room, description) => { const c = F.course(id); c.room = room; c.description = description; };
  F.sync = () => F.G.syncClassroomData();
  F.cached = id => F.G.readAllCoursesFromCache_().find(c => c.id === id);
  F.sup = id => { const o = {}; (F.cached(id).classSupport || []).forEach(s => { o[s.email] = s; }); return o; };
  F.ctx = e => F.G.getViewerContext_(J(F.G.readAllCoursesFromCache_()), { email: e, role: 'teacher' });
  F.sheetRows = name => { const sh = env.wb.getSheetByName(name); return sh ? sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 0), sh.data[0].length).getValues() : []; };
  F.header = name => env.wb.getSheetByName(name).getRange(1, 1, 1, env.wb.getSheetByName(name).data[0].length).getValues()[0];
  return F;
}

// ---------------- Required tests 1–11 ----------------
t('1 normal teacher: Description email -> PRIMARY_TEACHER, sees + manages only that class', () => {
  const F = setup(); F.set(F.ids.N3EA, '', TA); F.sync();
  const s = F.sup(F.ids.N3EA)[TA];
  assert.deepStrictEqual(J([s.roles, s.sources, s.member]), [['PRIMARY_TEACHER'], ['COURSE_DESCRIPTION'], true]);
  assert.ok(!F.creates.length, 'already a Classroom teacher -> no add');
  const c = F.ctx(TA).courses.find(x => x.id === F.ids.N3EA);
  assert.deepStrictEqual(J([c.viewerAccess.label, c.viewerAccess.permission, c.viewerAccess.apsRole]), ['Primary Teacher', 'CLASS_TEACHER', 'TEACHER']);
  assert.strictEqual(F.G.primaryTeacherOf_(F.cached(F.ids.N3EA)).email, TA);
  assert.ok(F.sheetRows('Class_Access_Audit').some(r => r[4] === TA && r[2] === F.ids.N3EA && r[8] === 'CLASS_ACCESS_GRANTED' && r[7] === 'COURSE_DESCRIPTION'));
});

t('2 + 8 HM is also the primary teacher: ONE record [PRIMARY_TEACHER, HM], "Primary Teacher + HM", HM actions on that class', () => {
  const F = setup(); F.set(F.ids.N4AB, 'HM Email: ' + TB, TB); F.sync();
  const all = F.cached(F.ids.N4AB).classSupport.filter(s => s.email === TB);
  assert.strictEqual(all.length, 1, 'one record per user per course');
  assert.deepStrictEqual(J([all[0].roles, all[0].sources]), [['PRIMARY_TEACHER', 'HM'], ['COURSE_DESCRIPTION', 'ROOM']]);
  const t2 = F.cached(F.ids.N4AB).teachers.find(x => x.email === TB);
  assert.deepStrictEqual(J(t2.roleTags), ['HM']); assert.strictEqual(t2.supportRole, undefined, 'tagged (HM), still the teacher of record');
  assert.strictEqual(F.G.primaryTeacherOf_(F.cached(F.ids.N4AB)).email, TB);
  const a = F.ctx(TB).courses.find(x => x.id === F.ids.N4AB).viewerAccess;
  assert.deepStrictEqual(J([a.label, a.apsRole, a.permission]), ['Primary Teacher + HM', 'HM', 'CLASS_SUPPORT']);
  const rows = F.sheetRows('Class_Access_Map').filter(r => r[0] === TB + '|' + F.ids.N4AB);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(J([rows[0][2], rows[0][3], rows[0][6], rows[0][7], rows[0][8]]), ['PRIMARY_TEACHER + HM', 'HM', 'TEACHER', 'COURSE_DESCRIPTION + ROOM', 'CLASS_SUPPORT']);
  assert.ok(J(F.G.setClassStatusManual(F.tok(TB, 'teacher'), F.ids.N4AB, 'cancel', 'Teacher on leave')) !== null, 'HM-level action on its class');
  assert.throws(() => F.G.setClassStatusManual(F.tok(TB, 'teacher'), F.ids.MAZ, 'cancel', 'x'), /Only an Admin or HM/, 'only Teacher on MAZ -> no HM action');
});

t('3 TTS_ teacher in Description: PRIMARY_TEACHER (prefix ignored), added to Classroom, shown on the card by name, has access', () => {
  const F = setup(); F.set(F.ids.MAZ, '', TTS); F.sync();
  assert.ok(F.creates.includes(F.ids.MAZ + '|' + TTS));
  const s = F.sup(F.ids.MAZ)[TTS];
  assert.deepStrictEqual(J([s.roles, s.member, s.added]), [['PRIMARY_TEACHER'], true, true]);
  const card = F.cached(F.ids.MAZ).teachers.find(x => x.email === TTS);
  assert.ok(card, 'shown although tts_ is in HIDDEN_TEACHER_EMAIL_PREFIXES');
  assert.strictEqual(card.name, 'Ravi Kumar', 'name from the Google profile — never the email');
  assert.strictEqual(card.supportRole, undefined);
  assert.strictEqual(F.G.primaryTeacherOf_(F.cached(F.ids.MAZ)).email, TTS);
  assert.strictEqual(J(F.G.getViewerRoleForEmail_(TTS, F.G.readAllCoursesFromCache_())).role, 'teacher');
  assert.deepStrictEqual(J(F.ctx(TTS).courses.map(c => c.id)), [F.ids.MAZ]);
  // an UNNAMED tts_ co-teacher stays hidden (existing behaviour)
  F.cls.teachers[F.ids.N3EA].push({ userId: 'X', profile: { id: 'X', name: { fullName: 'Hidden' }, emailAddress: 'tts_other_aps509' + D } });
  F.sync();
  assert.ok(!F.cached(F.ids.N3EA).teachers.some(x => /tts_other/.test(x.email)));
});

t('4 TCS_ teacher in Description: same as any primary teacher', () => {
  const F = setup(); F.set(F.ids.ATTONLY, '', 'Teacher: ' + TCS.toUpperCase() + ' '); F.sync();
  const s = F.sup(F.ids.ATTONLY)[TCS];
  assert.ok(s && s.roles.join() === 'PRIMARY_TEACHER' && s.member, 'normalized to lower case, trimmed');
  assert.ok(F.cached(F.ids.ATTONLY).teachers.some(x => x.email === TCS && x.name === 'Kala Devi'));
  assert.deepStrictEqual(J(F.ctx(TCS).courses.map(c => c.id)), [F.ids.ATTONLY]);
  assert.strictEqual(F.ctx(TCS).courses[0].viewerAccess.label, 'Primary Teacher');
});

t('5 multiple HM: "HM Email: a ; b , c" -> three HMs, each added once, HM access on that class only', () => {
  const F = setup(); F.set(F.ids.N3EF, 'HM Email: ' + HM1 + ' ; ' + HM2 + ' , ' + HM3 + ' ; ' + HM1, ''); F.sync();
  const s = F.sup(F.ids.N3EF);
  assert.deepStrictEqual(J([HM1, HM2, HM3].map(e => s[e].roles.join())), ['HM', 'HM', 'HM']);
  assert.strictEqual(F.creates.filter(k => k.endsWith(HM1)).length, 1, 'duplicate removed');
  [HM1, HM2, HM3].forEach(e => assert.deepStrictEqual(J(F.ctx(e).courses.map(c => c.id)), [F.ids.N3EF]));
  assert.strictEqual(F.cached(F.ids.N3EF).teachers.find(x => x.email === HM1).supportRole, 'HM');
});

t('6 multiple VP: "VP Email: a; b | c" (pipe continues the label) -> three VPs', () => {
  const F = setup(); F.set(F.ids.N3EF, 'VP Email: ' + VP1 + '; ' + VP2 + ' | ' + VP3, ''); F.sync();
  const s = F.sup(F.ids.N3EF);
  assert.deepStrictEqual(J([VP1, VP2, VP3].map(e => s[e].roles.join() + ':' + s[e].sources.join())), ['VP:ROOM', 'VP:ROOM', 'VP:ROOM']);
  assert.strictEqual(F.G.apsRoleFor_({ email: VP2, role: 'teacher' }, F.G.readAllCoursesFromCache_()), 'VP');
});

t('7 multiple HM + VP in one Room (the documented example format)', () => {
  const F = setup();
  F.set(F.ids.MAZ, 'VP Email: vp.arumbu_aps9003' + D + ' | HM Email: hm.mazhalai_aps9009' + D + ' ; vp.kurinji_aps9007' + D, 'info' + D);
  F.sync();
  const m = F.cached(F.ids.MAZ).classSupport.map(s => s.email + ':' + s.roles.join('+'));
  assert.deepStrictEqual(J(m.sort()), ['hm.mazhalai_aps9009' + D + ':HM', 'info' + D + ':PRIMARY_TEACHER', 'vp.arumbu_aps9003' + D + ':VP', 'vp.kurinji_aps9007' + D + ':HM'].sort(),
    'vp.kurinji is HM because of the label — never by the vp./hm. prefix');
  assert.strictEqual(F.cached(F.ids.MAZ).roomDisplay, '', 'Room shows no emails / labels on the card');
});

t('9 primary + VP: one record [PRIMARY_TEACHER, VP], label "Primary Teacher + VP"', () => {
  const F = setup(); F.set(F.ids.N3EA, 'Room 5 | VP Email: ' + TA, 'Class teacher: ' + TA); F.sync();
  const s = F.sup(F.ids.N3EA)[TA];
  assert.deepStrictEqual(J(s.roles), ['PRIMARY_TEACHER', 'VP']);
  const a = F.ctx(TA).courses.find(x => x.id === F.ids.N3EA).viewerAccess;
  assert.deepStrictEqual(J([a.label, a.apsRole]), ['Primary Teacher + VP', 'VP']);
  assert.strictEqual(F.cached(F.ids.N3EA).roomDisplay, 'Room 5', 'non-email Room text kept');
  assert.deepStrictEqual(J(F.cached(F.ids.N3EA).teachers.find(x => x.email === TA).roleTags), ['VP']);
});

t('10 no Room: no VP / HM; Description primary still works', () => {
  const F = setup(); F.set(F.ids.N3EA, '', TA); F.sync();
  assert.ok(F.cached(F.ids.N3EA).classSupport.every(s => s.roles.indexOf('VP') < 0 && s.roles.indexOf('HM') < 0));
  assert.strictEqual(F.cached(F.ids.N3EA).roomDisplay, '');
});

t('11 no Description: no primary teacher invented; Classroom teacher remains teacher of record; Room VP still applies', () => {
  const F = setup(); F.set(F.ids.N4AB, 'VP Email: ' + VP1, ''); F.sync();
  const cs = F.cached(F.ids.N4AB).classSupport;
  assert.deepStrictEqual(J(cs.map(s => s.email + ':' + s.roles.join())), [VP1 + ':VP']);
  assert.strictEqual(F.G.primaryTeacherOf_(F.cached(F.ids.N4AB)).email, TB, 'fallback: first Classroom teacher, never the VP');
  assert.strictEqual(F.ctx(TB).courses.find(x => x.id === F.ids.N4AB).viewerAccess.label, 'Teacher');
  const F2 = setup(); F2.set(F2.ids.MAZ, '', ''); F2.sync();
  assert.deepStrictEqual(J(F2.cached(F2.ids.MAZ).classSupport), []);
});

// ---------------- Validation, audit, security ----------------
t('invalid / outside-domain / unlabelled Room emails are skipped and audited (EMAIL_SKIPPED); audit header matches the spec', () => {
  const F = setup();
  F.set(F.ids.N3EF, 'Room 12 ' + TA + ' | VP Email: bad@@x , vp9_aps799 ; ' + VP1, 'parent@gmail.com ; not-an-email@ ; ' + TA);
  F.sync();
  const s = F.sup(F.ids.N3EF);
  assert.deepStrictEqual(J(Object.keys(s).sort()), [TA, VP1].sort());
  assert.deepStrictEqual(J(s[TA].roles), ['PRIMARY_TEACHER'], 'unlabelled Room email gives no VP/HM');
  const sk = F.sheetRows('Class_Access_Audit').filter(r => r[8] === 'EMAIL_SKIPPED');
  assert.ok(sk.some(r => r[4] === 'parent@gmail.com' && /domain/.test(r[10])));
  assert.ok(sk.some(r => r[4] === TA && /label/.test(r[10]) && r[7] === 'ROOM'));
  assert.ok(sk.some(r => /vp9_aps799/.test(r[4])), 'missing @domain');
  assert.deepStrictEqual(J(F.header('Class_Access_Audit')), ['Timestamp (EST)', 'Execution ID', 'Course ID', 'Course Name', 'Email', 'APS Role', 'Classroom Role', 'Source', 'Action', 'Result', 'Error Message']);
  assert.ok(/^SYNC-\d{8}-\d{6}-/.test(sk[0][1]), 'execution id');
  const n = F.sheetRows('Class_Access_Audit').length; F.sync();
  assert.strictEqual(F.sheetRows('Class_Access_Audit').filter(r => r[8] === 'EMAIL_SKIPPED').length, sk.length, 'skips logged once per 6 h');
  assert.strictEqual(F.sheetRows('Class_Access_Audit').length, n, 'unchanged sync writes no audit row');
});

t('add once: second sync makes no Classroom calls, no duplicates; failed add -> no access, retried after 6 h', () => {
  const F = setup(); F.failAdd[VP2] = true;
  F.set(F.ids.N3EF, 'VP Email: ' + VP1 + ' ; ' + VP2, ''); F.sync();
  const n = F.creates.length; F.sync();
  assert.strictEqual(F.creates.length, n);
  assert.strictEqual(F.cached(F.ids.N3EF).teachers.filter(x => x.email === VP1).length, 1);
  assert.strictEqual(F.sup(F.ids.N3EF)[VP2].member, false);
  const a = F.sheetRows('Class_Access_Audit');
  assert.ok(a.some(r => r[8] === 'CLASSROOM_TEACHER_ADD_FAILED' && r[4] === VP2 && r[9] === 'FAILED' && /permission/.test(r[10])));
  assert.ok(a.some(r => r[8] === 'CLASS_ACCESS_DENIED' && r[4] === VP2));
  assert.ok(a.some(r => r[8] === 'CLASSROOM_TEACHER_ADDED' && r[4] === VP1 && r[5] === 'VP' && r[6] === 'TEACHER' && r[7] === 'ROOM'));
  assert.strictEqual(F.ctx(VP2).courses.length, 0, 'Room label alone grants nothing');
});

t('removed from the Room: mapping updated (still a Classroom teacher) and audited', () => {
  const F = setup(); F.set(F.ids.N3EF, 'VP Email: ' + VP1 + ' ; ' + VP2, ''); F.sync();
  F.set(F.ids.N3EF, 'VP Email: ' + VP1, ''); F.sync();
  const upd = F.sheetRows('Class_Access_Audit').find(r => r[8] === 'COURSE_ACCESS_MAPPING_UPDATED' && r[4] === VP2);
  assert.ok(upd && /VP>TEACHER/.test(upd[10]) && /still a Google Classroom teacher/.test(upd[10]), upd && upd[10]);
  assert.strictEqual(F.cached(F.ids.N3EF).teachers.find(x => x.email === VP2).supportRole, undefined);
});

t('server-side authorization: changed courseId refused + CLASS_ACCESS_DENIED audited; existing Admin/HM unchanged', () => {
  const F = setup(); F.set(F.ids.N3EF, 'VP Email: ' + VP2, TA); F.sync();
  const vp = F.tok(VP2, 'teacher');
  const r = J(F.G.setTeacherAvailabilityStatus(vp, F.ids.N3EF, 'confirmed', ''));
  assert.strictEqual(r.teacherEmail, TA, 'teacher of record is the primary teacher, not the VP');
  assert.throws(() => F.G.setTeacherAvailabilityStatus(vp, F.ids.N4AB, 'confirmed', ''), /Only this class's own teacher/);
  assert.throws(() => F.G.editAttendanceRecordStatus(vp, F.ids.N4AB, '2026-09-25', 'vani_aps2222' + D, 'STUDENT', 'PRESENT', 'Student was present in the class today and joined late'), /own teacher/);
  assert.ok(F.sheetRows('Class_Access_Audit').some(x => x[8] === 'CLASS_ACCESS_DENIED' && x[4] === VP2 && x[2] === F.ids.N4AB && x[9] === 'DENIED'));
  const courses = F.G.readAllCoursesFromCache_();
  assert.strictEqual(J(F.G.getViewerRoleForEmail_('hm@aps.org', courses)).role, 'headmaster');
  assert.strictEqual(F.G.getViewerContext_(courses, { email: 'hm@aps.org', role: 'headmaster' }).courses.length, courses.length);
  assert.strictEqual(F.G.apsRoleFor_({ email: 'admin@aps.org', role: 'admin' }, courses), 'ADMIN');
});

t('VP elevated actions on its class only; a plain Teacher still cannot', () => {
  const F = setup(); F.set(F.ids.N3EF, 'VP Email: ' + VP2, ''); F.sync();
  const vp = F.tok(VP2, 'teacher'), tchr = F.tok(TB, 'teacher');
  assert.throws(() => F.G.setClassStatusManual(vp, F.ids.N4AB, 'cancel', 'x'), /Only an Admin or HM/);
  assert.throws(() => F.G.setClassStatusManual(tchr, F.ids.N4AB, 'cancel', 'x'), /Only an Admin or HM/);
  F.G.setNeedsTechSupportStage(vp, F.ids.N3EF, 'reported'); vm_clearCooldown(F);
  const ack = J(F.G.setNeedsTechSupportStage(vp, F.ids.N3EF, 'in_progress'));
  assert.ok(ack.stage === 'in_progress' || ack.warning, JSON.stringify(ack));
  const ok = (() => { try { F.G.editAttendanceRecordStatus(vp, F.ids.N3EF, '2026-09-25', TA, 'TEACHER', 'PRESENT', 'Teacher was present and taught the full class today'); return 'ok'; } catch (e) { return e.message; } })();
  assert.ok(!/Only an Admin, Headmaster/.test(ok), ok);
});

t('getDashboardData end-to-end: apsRole, per-class role labels, (VP)/(HM) tags, no emails in Room text', () => {
  const F = setup();
  F.set(F.ids.N3EF, 'VP Email: ' + VP1 + ' | HM Email: ' + HM1, TA);
  F.set(F.ids.N4AB, 'HM Email: ' + VP1, TB);
  F.sync();
  const d = J(F.G.getDashboardData(F.tok(VP1, 'teacher')));
  assert.strictEqual(d.apsRole, 'HM', 'highest role across classes: HM > VP');
  const lbl = {}; d.courses.forEach(c => { lbl[c.id] = c.viewerAccess.label; });
  assert.deepStrictEqual(lbl, { [F.ids.N3EF]: 'VP', [F.ids.N4AB]: 'HM' });
  const n3 = d.courses.find(c => c.id === F.ids.N3EF);
  assert.deepStrictEqual(J(n3.teachers.filter(x => x.roleTags && x.roleTags.length).map(x => x.name + ' (' + x.roleTags.join(')(') + ')')).sort(), ['Hema Mohan (HM)', 'Vani Prakash (VP)']);
  assert.ok(!/@/.test(n3.roomDisplay));
  assert.ok(n3.teachers.every(x => !/@/.test(x.name)), 'names never fall back to an email for added people');
  const dt = J(F.G.getDashboardData(F.tok(TA, 'teacher')));
  assert.strictEqual(dt.apsRole, 'TEACHER');
  assert.strictEqual(dt.courses.find(c => c.id === F.ids.N3EF).viewerAccess.label, 'Primary Teacher');
});

t('Teacher Availability report: class teacher = Description primary; Room-only VP/HM never listed as class teacher', () => {
  const F = setup();
  F.set(F.ids.N3EF, 'VP Email: ' + TB + ' | HM Email: ' + HM1, TA);
  F.sync();
  const m = F.G.ctaBuildReport_(new Date());
  const tb = m.rows.find(r => r.email === TB);
  assert.ok(tb && !tb.classrooms.some(n => /^NILAI 3 - EF/.test(n)), 'TB is VP of N3EF, not its teacher');
  assert.ok(!m.rows.some(r => r.email === HM1));
  assert.strictEqual(F.G.primaryTeacherOf_(F.cached(F.ids.N3EF)).email, TA);
});

t('switches: ADD_TO_CLASSROOM=false never writes to Classroom; ENABLED=false ignores Room + Description', () => {
  const F = setup({ APS_CLASS_SUPPORT_ADD_TO_CLASSROOM: 'false' }); F.set(F.ids.N3EF, 'VP Email: ' + VP1, TTS); F.sync();
  assert.strictEqual(F.creates.length, 0);
  assert.ok(F.cached(F.ids.N3EF).classSupport.every(s => s.member === false));
  const G2 = setup({ APS_CLASS_SUPPORT_ENABLED: 'false' }); G2.set(G2.ids.N3EF, 'VP Email: ' + VP1, TTS); G2.sync();
  assert.strictEqual(G2.creates.length, 0); assert.deepStrictEqual(J(G2.cached(G2.ids.N3EF).classSupport), []);
});

t('Hide toggle: a named person stays visible with their tag; classAuthorizationFor_ object', () => {
  const F = setup({ ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS: '["' + HM1 + '"]' });
  F.set(F.ids.N3EF, 'HM Email: ' + HM1, TA); F.sync();
  const courses = J(F.G.readAllCoursesFromCache_());
  F.G.applyRosterHiddenStaffFilter_(courses);
  assert.ok(courses.find(c => c.id === F.ids.N3EF).teachers.some(x => x.email === HM1));
  const auth = J(F.G.classAuthorizationFor_(F.cached(F.ids.N3EF)));
  assert.deepStrictEqual(auth.users[HM1], { roles: ['HM'], primaryRole: 'HM', classroomRole: 'TEACHER' });
  assert.deepStrictEqual(auth.users[TA], { roles: ['PRIMARY_TEACHER'], primaryRole: 'TEACHER', classroomRole: 'TEACHER' });
});

t('always shown: vsugadev@ kept on every class she teaches (hidden prefix + Hide toggle), no extra access, attendance still excludes her', () => {
  const VS = 'vsugadev@avvaiyarpadasalai.org';
  const F = setup({ HIDDEN_TEACHER_EMAIL_PREFIXES: '["aps_","tts_","tcs_","vsugadev"]', ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS: '["' + VS + '"]' });
  [F.ids.N3EF, F.ids.N4AB].forEach(id => F.cls.teachers[id].push({ userId: 'VS', profile: { id: 'VS', name: { fullName: 'Vasuki Sugadev' }, emailAddress: VS } }));
  F.set(F.ids.N3EF, '', TA); F.sync();
  const courses = J(F.G.readAllCoursesFromCache_());
  F.G.applyRosterHiddenStaffFilter_(courses);
  [F.ids.N3EF, F.ids.N4AB].forEach(id => { const v = courses.find(c => c.id === id).teachers.find(x => x.email === VS); assert.ok(v && v.alwaysShow === true, id); });
  assert.ok(!courses.find(c => c.id === F.ids.MAZ).teachers.some(x => x.email === VS), 'only classes where she is a Classroom teacher');
  assert.ok(F.G.attIsExcludedEmail_(VS), 'attendance exclusion unchanged');
  const F2 = setup({ APS_CLASSES_ALWAYS_SHOW_EMAILS: '[]', HIDDEN_TEACHER_EMAIL_PREFIXES: '["vsugadev"]' });
  F2.cls.teachers[F2.ids.N3EF].push({ userId: 'VS', profile: { id: 'VS', name: { fullName: 'Vasuki Sugadev' }, emailAddress: VS } });
  F2.sync();
  assert.ok(!F2.cached(F2.ids.N3EF).teachers.some(x => x.email === VS), 'configurable: empty list -> hidden as before');
});

t('tcs_ / tts_: shown only as the Course Description Primary Teacher; every other tcs_/tts_ co-teacher left off the card', () => {
  const F = setup({ HIDDEN_TEACHER_EMAIL_PREFIXES: '["aps_"]' }); // even without the hidden-prefix config
  const CO1 = 'tcs_other_aps8301' + D, CO2 = 'tts_other_aps8302' + D, VPX = 'tcs_vp_aps8303' + D;
  F.cls.teachers[F.ids.N3EA].push({ userId: 'C1', profile: { id: 'C1', name: { fullName: 'Oncall One' }, emailAddress: CO1 } },
    { userId: 'C2', profile: { id: 'C2', name: { fullName: 'Oncall Two' }, emailAddress: CO2 } });
  F.set(F.ids.N3EA, 'VP Email: ' + VPX, TCS + ' ; ' + TTS);
  F.sync();
  const names = F.cached(F.ids.N3EA).teachers.map(x => x.email);
  assert.ok(names.includes(TCS) && names.includes(TTS) && names.includes(TA), names.join());
  assert.ok(!names.includes(CO1) && !names.includes(CO2) && !names.includes(VPX), 'other tcs_/tts_ hidden: ' + names.join());
  assert.deepStrictEqual(J(F.ctx(VPX).courses.map(c => c.id)), [F.ids.N3EA], 'a tcs_ VP keeps class access (display only)');
  assert.ok(F.cached(F.ids.MAZ).teachers.every(x => !/^(tcs_|tts_)/.test(x.email)));
});

// ---------------- Oct 2026: Course Description is authoritative for the Primary Teacher ----------------
const ABI = 'abitha_aps978' + D;
t('Primary Teacher "Abitha Sri - TTS" (Description email abitha_aps978): shown as "Abitha Sri", teacher login, own class, teacher of record', () => {
  const F = setup();
  F.cls.teachers[F.ids.N3EA].push({ userId: 'AB', profile: { id: 'AB', name: { fullName: 'Abitha Sri - TTS' }, emailAddress: ABI } });
  F.set(F.ids.N3EA, '', ABI); F.sync();
  const card = F.cached(F.ids.N3EA).teachers.find(x => x.email === ABI);
  assert.ok(card, 'shown'); assert.strictEqual(card.name, 'Abitha Sri'); assert.deepStrictEqual(J(card.apsRoles), ['PRIMARY_TEACHER']);
  assert.strictEqual(F.G.primaryTeacherOf_(F.cached(F.ids.N3EA)).email, ABI);
  const courses = F.G.readAllCoursesFromCache_();
  assert.strictEqual(J(F.G.getViewerRoleForEmail_(ABI, courses)).role, 'teacher');
  const v = F.ctx(ABI); assert.deepStrictEqual(J(v.courses.map(c => c.id)), [F.ids.N3EA]); assert.strictEqual(v.courses[0].viewerAccess.label, 'Primary Teacher');
  const r = J(F.G.setTeacherAvailabilityStatus(F.tok(ABI, 'teacher'), F.ids.N3EA, 'confirmed', ''));
  assert.strictEqual(r.status, 'confirmed', 'teacher feature works on own class');
  assert.throws(() => F.G.setTeacherAvailabilityStatus(F.tok(ABI, 'teacher'), F.ids.N4AB, 'confirmed', ''), /Only this class's own teacher/);
  assert.throws(() => F.G.setClassStatusManual(F.tok(ABI, 'teacher'), F.ids.N3EA, 'cancel', 'x'), /Only an Admin or HM/, 'Primary Teacher = teacher-level, not HM');
});

t('Teacher Availability report: Description Primary Teacher is never "Not Assigned" — even a tts_ / tcs_ / excluded email', () => {
  const F = setup({ APS_CLASS_TEACHER_AVAILABILITY_EXCLUDE_PREFIXES: 'tts_,tcs_' });
  F.set(F.ids.MAZ, '', TTS); F.set(F.ids.ATTONLY, '', TCS); F.sync();
  const m = F.G.ctaBuildReport_(new Date());
  const att = name => m.attention.find(a => a.classroom.indexOf(name) === 0);
  assert.strictEqual(att('MAZHALAI - CB').email, TTS); assert.strictEqual(att('MAZHALAI - CB').name, 'Ravi Kumar');
  assert.strictEqual(att('NILAI 5 - AA').email, TCS); assert.strictEqual(att('NILAI 5 - AA').name, 'Kala Devi');
  assert.ok(!m.attention.some(a => a.classroom.indexOf('MAZHALAI - CB') === 0 && a.name === 'Not Assigned'));
  const row = m.rows.find(x => x.email === TTS); assert.ok(row && row.classrooms.some(n => /^MAZHALAI - CB/.test(n)), 'listed with the class');
  // actual availability selection respected
  F.G.setTeacherAvailabilityStatus(F.tok(TTS, 'teacher'), F.ids.MAZ, 'not_available', 'sub_teacher_arranged');
  const m2 = F.G.ctaBuildReport_(new Date());
  const a2 = m2.attention.find(a => a.classroom.indexOf('MAZHALAI - CB') === 0);
  assert.strictEqual(a2.email, TTS); assert.strictEqual(a2.status, 'Not Available to Take Classes');
});

t('Primary Teacher not (yet) a Classroom teacher: still shown + teacher access to that class only; VP still needs membership', () => {
  const F = setup({ APS_CLASS_SUPPORT_ADD_TO_CLASSROOM: 'false' });
  F.set(F.ids.N4AB, 'VP Email: ' + VP1, ABI); F.sync();
  const c = F.cached(F.ids.N4AB);
  const card = c.teachers.find(x => x.email === ABI);
  assert.ok(card && card.notInClassroom === true && card.name === 'Abitha' && !/@/.test(card.name));
  assert.strictEqual(F.G.primaryTeacherOf_(c).email, ABI);
  assert.deepStrictEqual(J(F.ctx(ABI).courses.map(x => x.id)), [F.ids.N4AB]);
  assert.strictEqual(F.ctx(VP1).courses.length, 0, 'VP named in the Room still needs Classroom membership');
  const row = F.sheetRows('Class_Access_Map').find(r => r[0] === ABI + '|' + F.ids.N4AB);
  assert.deepStrictEqual(J([row[6], row[8]]), ['NONE', 'CLASS_TEACHER']);
  const m = F.G.ctaBuildReport_(new Date());
  assert.strictEqual(m.attention.find(a => a.classroom.indexOf('NILAI 4 - AB') === 0).email, ABI);
});

t('teacherDisplayName_ strips only a trailing TTS / TCS tag', () => {
  const G = setup().G;
  assert.deepStrictEqual(['Abitha Sri - TTS', 'Kala (TCS)', 'Ravi Kumar', 'TTS Coordinator', 'Mani - tcs', 'Priya | TTS', 'Gattss'].map(G.teacherDisplayName_),
    ['Abitha Sri', 'Kala', 'Ravi Kumar', 'TTS Coordinator', 'Mani', 'Priya', 'Gattss']);
});

console.log(pass + ' passed');

// r84: Assign Classroom → Add/Remove Student → Add Student, weekly multiple-classroom report, Google Review (node test/addstudent.js)
const assert = require('assert');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const J = x => JSON.parse(JSON.stringify(x));
const L = v => (Array.isArray(v) ? v : String(v || '').split(/\s*,\s*/)).filter(Boolean);
const { setup, NEW, STU, ID, D } = require('./addfixture');

t('authorization: Admin + Super Admin only (server-side); teacher / HM / student / VP refused with the standard message; BOD reads the audit only; Access Control off → refused', () => {
  const F = setup(), G = F.G;
  [F.tok2.teacher, F.tok2.hm, F.tok2.student, F.tok2.vp, F.tok2.bod].forEach(tk => {
    assert.throws(() => F.ctx(tk, NEW), /You do not have permission to perform this action\./);
    assert.throws(() => F.add(tk), /You do not have permission to perform this action\./);
    assert.throws(() => G.cancelAddStudentRequest(tk, { studentEmail: NEW, courseId: ID.EC, requestId: 'C1' }), /You do not have permission/);
  });
  // a forged role in the request is ignored
  assert.throws(() => G.addStudentToClassroom(F.tok2.teacher, { studentEmail: NEW, courseId: ID.EC, confirmed: true, requestId: 'F1', role: 'admin' }), /You do not have permission/);
  assert.strictEqual(F.ad.created, 0);
  const bod = J(G.getRemovalContext(F.tok2.bod)); assert.strictEqual(bod.canAdd, false); assert.ok(Array.isArray(bod.addAudit));
  const adm = J(G.getRemovalContext(F.tok2.admin)); assert.strictEqual(adm.canAdd, true); assert.ok(/more than one Regular Academic Classroom/.test(adm.multiAck));
  assert.strictEqual(F.ctx(F.SA, NEW).student.email, NEW, 'Super Admin allowed');
  G.saveAccessControl(F.tok('admin@aps.org', 'admin'), [{ role: 'admin', key: 'assignClassroom.remove', visible: false }]);
  assert.throws(() => F.ctx(F.tok2.admin, NEW), /ACCESS_OFF/);
});

t('APS email validation (trim + lowercase + APS domain) and the student-exists check (friendly messages only)', () => {
  const F = setup();
  ['', '   ', 'not-an-email', 'kid@gmail.com', 'a@b'].forEach(e => assert.throws(() => F.ctx(F.tok2.admin, e), /APS email address/, e));
  const c = F.ctx(F.tok2.admin, '  NewKid_APS9001@AvvaiyarPadasalai.ORG ');
  assert.strictEqual(c.student.email, NEW); assert.strictEqual(c.student.name, 'New Kid'); assert.strictEqual(c.student.apsId, 'APS9001');
  assert.deepStrictEqual(c.memberships, []); assert.strictEqual(c.hasRegular, false);
  assert.throws(() => F.ctx(F.tok2.admin, 'ghost_aps9999' + D), /^Error: Student not found\. Please verify the APS email address\.$/);
  F.ad.dir['susp_aps9002' + D] = { name: { fullName: 'S' }, suspended: true };
  assert.throws(() => F.ctx(F.tok2.admin, 'susp_aps9002' + D), /suspended or archived/);
  // Directory unavailable → Classroom profile; any other API error → a friendly message, never the raw text
  F.G.AdminDirectory.Users.get = () => { throw new Error('GoogleJsonResponseException: API call to directory.users.get failed with error: Not Authorized to access this resource/api'); };
  F.G.Classroom.UserProfiles.get = () => { throw new Error('Internal error 500 backendError token=abc'); };
  assert.throws(() => F.ctx(F.tok2.admin, 'other_aps9003' + D), e => /could not be verified right now/.test(e.message) && !/token|500|GoogleJson/.test(e.message));
});

t('memberships with types (Regular Academic / Special Class / Other) + the classroom picker (nilai, section, day, time, teacher, course ID, count, status, already enrolled)', () => {
  const F = setup({ props: { SPECIAL_CLASS_COURSE_IDS: ID.EF_SAT } });
  F.cls.courses.push({ id: '771199', name: 'Robotics Club 2026', courseState: 'ACTIVE', ownerId: 'TOT', section: '' }); F.cls.students['771199'] = [J(F.cls.students[ID.EA][0])];
  const c = F.ctx(F.tok2.admin, STU);
  const m = c.memberships.reduce((o, x) => (o[x.courseId] = x, o), {});
  assert.deepStrictEqual(Object.keys(m).sort(), [ID.EA, ID.EB, '771199'].sort(), 'live list incl. a classroom that is not on the dashboard');
  assert.strictEqual(m[ID.EA].type, 'REGULAR_ACADEMIC'); assert.strictEqual(m[ID.EA].teacher, 'Ayana Nivedida Parthiban'); assert.strictEqual(m['771199'].type, 'SPECIAL_CLASS'); assert.strictEqual(m['771199'].onDashboard, false);
  assert.strictEqual(c.membershipsLive, true); assert.strictEqual(c.hasRegular, true);
  const ea = c.classes.find(x => x.courseId === ID.EA), sat = c.classes.find(x => x.courseId === ID.EF_SAT);
  assert.strictEqual(ea.alreadyEnrolled, true); assert.strictEqual(sat.alreadyEnrolled, false);
  assert.deepStrictEqual([ea.nilai, ea.section, ea.day, ea.time, ea.status, ea.type], ['MUNMAZHALAI', 'EA', 'FRI', '6:30 - 8:00 PM EST', 'ACTIVE', 'REGULAR_ACADEMIC']);
  assert.strictEqual(sat.type, 'SPECIAL_CLASS', 'Script Property SPECIAL_CLASS_COURSE_IDS'); assert.ok(ea.count > 0 && ea.teacher);
  assert.ok(c.classes.every(x => /AY26-27$/.test(x.name)), 'only active AY26-27 classrooms offered');
  // CLASSROOM_TYPE_OVERRIDES wins; live list unavailable → dashboard roster fallback
  F.env.props.CLASSROOM_TYPE_OVERRIDES = JSON.stringify({ [ID.EB]: 'OTHER' }); F.ad.failList = 'backendError';
  const c2 = F.ctx(F.tok2.admin, STU);
  assert.strictEqual(c2.membershipsLive, false); assert.strictEqual(c2.memberships.find(x => x.courseId === ID.EB).type, 'OTHER');
  assert.ok(!c2.memberships.some(x => x.courseId === '771199'));
});

t('same classroom → ALREADY_ENROLLED, nothing added, audit row; Regular + Regular without the tick → VALIDATION_FAILED; with it → ADMIN_OVERRIDE add, other classrooms kept', () => {
  const F = setup(), G = F.G;
  const r0 = F.add(F.tok2.admin, { studentEmail: STU, courseId: ID.EA });
  assert.strictEqual(r0.ok, false); assert.strictEqual(r0.status, 'ALREADY_ENROLLED');
  assert.ok(/^Student Already Enrolled — Stu A0 is already a member of MUNMAZHALAI - EA .*No changes were made\.$/.test(r0.message), r0.message);
  const r1 = F.add(F.tok2.admin, { studentEmail: STU, courseId: ID.EC });
  assert.strictEqual(r1.status, 'VALIDATION_FAILED'); assert.ok(/I understand this student will be enrolled in more than one Regular Academic Classroom/.test(r1.message));
  assert.strictEqual(F.ad.created, 0); assert.strictEqual(F.addMails().length, 0);
  F.env.stats.mails.length = 0;
  const r2 = F.add(F.tok2.admin, { studentEmail: STU, courseId: ID.EC, confirmMultiRegular: true });
  assert.strictEqual(r2.ok, true, r2.message); assert.strictEqual(r2.record.action, 'ADD_STUDENT_TO_MULTIPLE_CLASSROOMS'); assert.strictEqual(r2.record.overrideReason, 'ADMIN_OVERRIDE');
  assert.strictEqual(r2.record.existingCount, '2'); assert.ok(/MUNMAZHALAI - EA/.test(r2.record.existingNames) && /REGULAR_ACADEMIC \| REGULAR_ACADEMIC/.test(r2.record.existingTypes));
  assert.ok(/now in 3 Google Classrooms; no other classroom was changed/.test(r2.message));
  assert.ok(F.find(ID.EA, STU) && F.find(ID.EB, STU) && F.find(ID.EC, STU), 'added, nothing removed'); assert.strictEqual(F.rm.removed, 0);
  const rows = F.rows(); assert.deepStrictEqual(rows.map(r => r.Status), ['ALREADY_ENROLLED', 'VALIDATION_FAILED', 'SUCCESS']);
  assert.ok(rows.every(r => r.Source === 'Dashboard – Assign Classroom → Add/Remove Student' && r.Student_APSID === 'APS6650'));
  assert.ok(!('error' in r2.record) && !JSON.stringify(r2).includes('"Error"'), 'technical errors never sent to the browser');
});

t('first classroom + Regular + Special: allowed without the tick; verified; dashboard cache updated at once; email From donotreply@ To teacher / HM / VP, admin@ CC, with Vanakkam … Nandri + Google Review footer', () => {
  const F = setup({ props: { SPECIAL_CLASS_COURSE_IDS: ID.EF_SAT } }), G = F.G;
  F.env.stats.mails.length = 0;
  const r = F.add(F.tok2.admin);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.record.action, 'ADD_STUDENT_TO_CLASSROOM'); assert.strictEqual(r.record.verification, 'VERIFIED');
  assert.strictEqual(r.record.sheetUpdate, 'UPDATED'); assert.strictEqual(r.record.emailStatus, 'EMAIL_SENT'); assert.strictEqual(r.record.newType, 'REGULAR_ACADEMIC');
  assert.ok(/New Kid was added to MUNMAZHALAI - EC .*\(verified\)\..*notified from donotreply@/.test(r.message), r.message);
  const ctx = J(G.getRemovalContext(F.tok2.admin));
  assert.ok(ctx.students.find(s => s.email === NEW && s.classrooms.some(c => c.courseId === ID.EC)), 'dashboard roster shows the student before the next sync');
  const m = F.addMails(); assert.strictEqual(m.length, 1); const e = m[0];
  assert.ok(/donotreply@avvaiyarpadasalai\.org/.test(e.from), e.from);
  assert.strictEqual(e.subject, 'APS Dashboard – Student Added to Google Classroom – New Kid');
  assert.ok(L(e.to).includes('other_aps8140' + D)); assert.deepStrictEqual(L(e.cc), ['admin@avvaiyarpadasalai.org']);
  assert.strictEqual(new Set(L(e.to)).size, L(e.to).length);
  ['Vanakkam', 'has been added to your Google Classroom', 'New Kid', 'APS9001', NEW, 'MUNMAZHALAI - EC', 'Regular Academic', 'Nandri', 'APS Tech Support Team', 'Avvaiyar Padasalai America would love your feedback', 'https://g.page/r/CUwNOLbnb2InEAE/review']
    .forEach(x => assert.ok(e.htmlBody.includes(x), x));
  assert.ok(e.body.includes('Post a review: https://g.page/r/CUwNOLbnb2InEAE/review'), 'plain-text footer');
  // r81 post-sync "new student" email will not announce the same student again
  const nsa = F.env.wb.getSheetByName('New_Student_Email_Log').getDataRange().getValues().slice(1);
  assert.ok(nsa.some(x => x[1] === ID.EC + '|Unewkid_aps9001' && x[10] === 'SENT'));
  // Special Class next: no tick needed
  const r2 = F.add(F.tok2.admin, { courseId: ID.EF_SAT });
  assert.strictEqual(r2.ok, true); assert.strictEqual(r2.record.overrideReason, ''); assert.strictEqual(r2.record.newType, 'SPECIAL_CLASS');
  // existing Assign Classroom audit log shows both adds
  const log = F.asgLog().filter(x => /ADD_STUDENT/.test(x.type));
  assert.deepStrictEqual(log.map(x => x.type + '/' + x.status).sort(), ['ADD_STUDENT_TO_CLASSROOM/SUCCESS', 'ADD_STUDENT_TO_MULTIPLE_CLASSROOMS/SUCCESS']);
});

t('double submit / resend: the same request id is one add, one email, one audit row', () => {
  const F = setup();
  const a = F.add(F.tok2.admin, { requestId: 'SAME-1' }); const b = F.add(F.tok2.admin, { requestId: 'SAME-1' });
  assert.strictEqual(a.ok, true); assert.strictEqual(b.duplicate, true); assert.ok(/already submitted/.test(b.message));
  assert.strictEqual(F.ad.created, 1); assert.strictEqual(F.addMails().length, 1); assert.strictEqual(F.rows().length, 1);
  assert.throws(() => F.add(F.tok2.admin, { requestId: '' }), /request id/); assert.throws(() => F.add(F.tok2.admin, { confirmed: false }), /confirm/);
});

t('email failure never rolls back (warning + EMAIL_FAILED audited); cache-update failure → "synchronization is pending … do not retry"', () => {
  const F = setup();
  delete F.env.props.TICKET_MAIL_REFRESH_TOKEN; delete F.env.props.TICKET_MAIL_OAUTH_CLIENT_ID;
  const r = F.add(F.tok2.admin);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.record.emailStatus, 'EMAIL_FAILED'); assert.strictEqual(r.emailWarning, true);
  assert.ok(/notification email could not be sent/.test(r.message)); assert.ok(F.find(ID.EC, NEW), 'still added');
  assert.ok(/Email:/.test(F.rows()[0].Error), 'email failure audited');
  const F2 = setup(); F2.G.adsPatchCourseCache_ = () => { throw new Error('Sheets timeout'); };
  const r2 = F2.add(F2.tok2.admin);
  assert.strictEqual(r2.ok, true); assert.strictEqual(r2.syncPending, true); assert.strictEqual(r2.record.sheetUpdate, 'SYNC_PENDING');
  assert.ok(/synchronization is pending\. Please do not retry/.test(r2.message), r2.message);
});

t('Google Classroom errors → friendly messages (no raw API text); 409 → ALREADY_ASSIGNED; inactive / unknown classroom → VALIDATION_FAILED', () => {
  const F = setup();
  F.ad.failCreate = 'GoogleJsonResponseException: API call failed with error: The caller does not have permission (403) token=abc';
  const r = F.add(F.tok2.admin);
  assert.strictEqual(r.status, 'FAILED'); assert.ok(/does not have permission/.test(r.message) && !/GoogleJson|token|403/.test(r.message), r.message);
  F.ad.failCreate = 'backendError 503';
  assert.ok(/temporarily unavailable/.test(F.add(F.tok2.admin).message));
  F.ad.failCreate = 'Precondition check failed. FAILED_PRECONDITION: UserInIllegalDomain';
  assert.ok(/could not be added .* verify the APS email/.test(F.add(F.tok2.admin).message));
  F.ad.failCreate = 'Requested entity already exists';
  const a = F.add(F.tok2.admin); assert.strictEqual(a.status, 'ALREADY_ASSIGNED'); assert.ok(/No changes were made/.test(a.message));
  F.ad.failCreate = null;
  F.cls.courses.find(c => c.id === ID.EC).courseState = 'ARCHIVED';
  const v = F.add(F.tok2.admin); assert.strictEqual(v.status, 'VALIDATION_FAILED'); assert.strictEqual(v.message, 'The selected Google Classroom is not available. Please choose another classroom.');
  assert.strictEqual(F.add(F.tok2.admin, { courseId: '999' }).status, 'VALIDATION_FAILED');
  const s = F.add(F.tok2.admin, { studentEmail: 'ghost_aps9999' + D, courseId: ID.ED }); assert.strictEqual(s.status, 'VALIDATION_FAILED'); assert.ok(/Student not found/.test(s.message));
  assert.strictEqual(F.ad.created, 0); assert.strictEqual(F.addMails().length, 0);
});

t('Cancel on the confirmation screen → one CANCELLED audit row, nothing else', () => {
  const F = setup();
  const r = J(F.G.cancelAddStudentRequest(F.tok2.admin, { studentEmail: NEW, courseId: ID.EC, requestId: 'C-1' }));
  J(F.G.cancelAddStudentRequest(F.tok2.admin, { studentEmail: NEW, courseId: ID.EC, requestId: 'C-1' }));
  assert.strictEqual(r.ok, true); const rows = F.rows(); assert.strictEqual(rows.length, 1); assert.strictEqual(rows[0].Status, 'CANCELLED');
  assert.strictEqual(F.ad.created, 0); assert.strictEqual(F.addMails().length, 0);
  assert.ok(F.asgLog().some(x => x.type === 'ADD_STUDENT_TO_CLASSROOM' && x.status === 'CANCELLED'));
});

t('removal: new subject, and a REMOVE_STUDENT_FROM_CLASSROOM line in the Assign Classroom audit log', () => {
  const F = setup(); F.env.stats.mails.length = 0;
  const r = F.remove(F.tok2.admin); assert.strictEqual(r.record.removal, 'REMOVED');
  assert.ok(F.env.stats.mails.some(m => m.subject === 'APS Dashboard – Student Removed from Google Classroom – Stu A0'));
  const log = F.asgLog().filter(x => x.type === 'REMOVE_STUDENT_FROM_CLASSROOM'); assert.strictEqual(log.length, 1); assert.strictEqual(log[0].status, 'SUCCESS');
});

t('weekly report: one email to admin@ From donotreply@, grouped by student, Regular + Regular flagged "requires review", once per week, audited; nobody removed; trigger Monday ET', () => {
  const F = setup({ props: { SPECIAL_CLASS_COURSE_IDS: ID.EF_SAT } }), G = F.G;
  F.add(F.tok2.admin, { courseId: ID.EF_SAT }); F.add(F.tok2.admin, { courseId: ID.EC }); // NEW: Regular + Special (no review)
  F.env.stats.mails.length = 0;
  const before = JSON.stringify(F.cls.students);
  const res = J(G.admcRun_(new Date(), { runBy: 'test' }));
  assert.strictEqual(res.sent, true); assert.strictEqual(res.students, 3); assert.strictEqual(res.review, 2); // Stu A0 (EA+EB) + fixture's Joshua (3 regular) + New Kid (Regular + Special)
  const m = F.env.stats.mails.filter(x => /Weekly Report/.test(x.subject)); assert.strictEqual(m.length, 1);
  assert.strictEqual(m[0].subject, 'APS Dashboard – Weekly Report – Students Assigned to Multiple Google Classrooms');
  assert.ok(/donotreply@/.test(m[0].from)); assert.deepStrictEqual(L(m[0].to), ['admin@avvaiyarpadasalai.org']);
  const h = m[0].htmlBody;
  ['Stu A0', 'APS6650', 'Requires review — 2 Regular Academic Classrooms', 'New Kid', 'Special Class', ID.EF_SAT, 'no student was removed'].forEach(x => assert.ok(h.includes(x), x));
  assert.ok(h.indexOf('Stu A0') < h.indexOf('New Kid') && h.indexOf('Joshua Kumar') < h.indexOf('New Kid'), 'review cases first'); assert.ok(!/New Kid[^<]*Requires review/.test(h), 'Regular + Special is not flagged');
  assert.strictEqual(JSON.stringify(F.cls.students), before, 'nobody removed');
  assert.ok(J(G.admcRun_(new Date(), {})).skipped, 'second run in the same week is skipped');
  assert.strictEqual(F.env.stats.mails.filter(x => /Weekly Report/.test(x.subject)).length, 1);
  const w = F.rows().filter(r => r.Action === 'WEEKLY_MULTIPLE_CLASSROOM_REPORT'); assert.strictEqual(w.length, 1); assert.strictEqual(w[0].Existing_Classroom_Count, '3'); assert.strictEqual(w[0].Status, 'SUCCESS');
  assert.throws(() => G.apsWeeklyMultipleClassroomReport({}), /Access denied/);
  G.createMultipleClassroomReportTrigger(); G.createMultipleClassroomReportTrigger(); // r117: Monday job of the one apsWeeklyJobs scheduler
  assert.strictEqual(F.env.stats.triggers.filter(x => x.fn === 'apsWeeklyMultipleClassroomReport').length, 0);
  assert.strictEqual(G.ScriptApp.getProjectTriggers().filter(x => x.getHandlerFunction() === 'apsWeeklyJobs').length, 1);
});

t('Google Review: students only, at most once per calendar month; events logged with APSID / email / name / role / Source; never claims a review was posted; URL from Script Property', () => {
  const F = setup(), G = F.G, stu = F.tok2.student;
  const st = J(G.getStudentLoginNoticeStatus(stu)).googleReview;
  assert.strictEqual(st.show, true); assert.strictEqual(st.url, 'https://g.page/r/CUwNOLbnb2InEAE/review'); assert.strictEqual(st.message, 'Avvaiyar Padasalai America would love your feedback. Post a review.');
  assert.strictEqual(J(G.shouldShowGoogleReviewPrompt(F.tok2.admin)).show, false); assert.strictEqual(J(G.getStudentLoginNoticeStatus(F.tok2.admin)).googleReview.student, false);
  assert.strictEqual(J(G.recordGoogleReviewEvent(stu, 'GOOGLE_REVIEW_PROMPT_SHOWN', 'POPUP')).recorded, true);
  assert.strictEqual(J(G.shouldShowGoogleReviewPrompt(stu)).show, false, 'not again this month');
  assert.strictEqual(J(G.recordGoogleReviewEvent(stu, 'GOOGLE_REVIEW_PROMPT_SHOWN', 'POPUP')).duplicate, true);
  G.recordGoogleReviewEvent(stu, 'GOOGLE_REVIEW_CLICKED', 'POPUP'); G.recordGoogleReviewEvent(stu, 'GOOGLE_REVIEW_CLICKED', 'POPUP');
  G.recordGoogleReviewEvent(stu, 'GOOGLE_REVIEW_DISMISSED', 'HEADER_BUTTON');
  assert.throws(() => G.recordGoogleReviewEvent(stu, 'GOOGLE_REVIEW_SUBMITTED'), /Unknown event/);
  const rows = F.env.wb.getSheetByName('Google_Review_Events').getDataRange().getValues();
  assert.deepStrictEqual(rows[0], ['Timestamp', 'APSID', 'Email', 'Name', 'Role', 'Event', 'Source', 'Details']);
  assert.deepStrictEqual(rows.slice(1).map(r => r[5]), ['GOOGLE_REVIEW_PROMPT_SHOWN', 'GOOGLE_REVIEW_CLICKED', 'GOOGLE_REVIEW_DISMISSED'], 'burst of clicks logged once');
  assert.deepStrictEqual(rows[1].slice(1, 7), ['APS6650', STU, 'Stu A0', 'student', 'GOOGLE_REVIEW_PROMPT_SHOWN', 'Dashboard']);
  assert.ok(!JSON.stringify(rows).match(/SUBMITTED|posted/i));
  // next month → shown again
  F.env.userProps['GOOGLE_REVIEW_PROMPT_' + STU] = '2000-01'; // r103: the monthly flag lives in the second store
  assert.strictEqual(J(G.shouldShowGoogleReviewPrompt(stu)).show, true);
  // URL override + unsafe value ignored
  F.env.props.APS_GOOGLE_REVIEW_URL = 'https://example.org/review'; assert.strictEqual(G.getGoogleReviewUrl(), 'https://example.org/review');
  F.env.props.APS_GOOGLE_REVIEW_URL = 'javascript:alert(1)'; assert.strictEqual(G.getGoogleReviewUrl(), 'https://g.page/r/CUwNOLbnb2InEAE/review');
  assert.ok(G.getGoogleReviewEmailFooter().includes('Post a Google Review'));
  assert.ok(!G.apsEmailShell_('x', 'y').includes('Post a Google Review'), 'no footer unless asked (error / internal emails unchanged)');
  assert.ok(G.apsEmailShell_('x', 'y', { googleReview: true }).includes('Post a Google Review'));
  assert.throws(() => G.recordGoogleReviewEvent('bad-token', 'GOOGLE_REVIEW_CLICKED'));
});

t('Re-Map "Classroom Assignment Updated" email (student-facing) ends with the Google Review footer; removal email (internal) does not', () => {
  const F = setup(); F.env.stats.mails.length = 0;
  F.G.assignStudentToClassroom(F.tok2.admin, STU, ID.EC, 'Parent asked for a different class time.');
  const m = F.env.stats.mails.find(x => /Classroom Assignment Updated/.test(x.subject));
  assert.ok(m && m.htmlBody.includes('Post a Google Review') && m.body.includes('Post a review: https://g.page/r/CUwNOLbnb2InEAE/review'));
  F.remove(F.tok2.admin, { courseId: ID.EB, studentEmail: F.cls.students[ID.EB][1].profile.emailAddress });
  const r = F.env.stats.mails.find(x => /Student Removed from Google Classroom/.test(x.subject));
  assert.ok(r && !r.htmlBody.includes('Post a Google Review'));
});

console.log(process.exitCode ? 'SOME ADD STUDENT TESTS FAILED' : 'ALL ' + pass + ' ADD STUDENT / WEEKLY REPORT / GOOGLE REVIEW TESTS PASSED');

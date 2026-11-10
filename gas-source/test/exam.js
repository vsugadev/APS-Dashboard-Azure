// End-to-end tests for the Examination module against a mocked Classroom Advanced Service.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { makeContext, Sheet } = require('./gasmock');
const code = fs.readFileSync(__dirname + '/../Code.gs', 'utf8');
const J = x => JSON.parse(JSON.stringify(x));
let passed = 0; const t = (name, fn) => { fn(); passed++; console.log('PASS', name); };
function fixedDate(iso) { let NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } static set(i) { NOW = new Date(i).getTime(); } } return D; }

// extra mock surface the Examination module uses
const probe = new Sheet('x'); const RangeProto = Object.getPrototypeOf(probe.getRange(1, 1, 1, 1));
RangeProto.getDisplayValues = function () { return this.getValues().map(r => r.map(v => v instanceof Date ? v.toISOString() : String(v))); };
Sheet.prototype.getMaxRows = function () { return 1000; };

const { makeClassroom } = require('./classroommock');

const D = fixedDate('2026-09-28T16:00:00Z'); // Mon Sep 28 2026, 12:00 PM EDT
const env = makeContext({ Date: D });
{ const f0 = env.ctx.Utilities.formatDate; env.ctx.Utilities.formatDate = (d, tz, p) => p.includes('hh') ? f0(d, tz, p.replace('hh', '§')).replace('§', f0(d, tz, 'h').padStart(2, '0')) : f0(d, tz, p); }
env.ctx.Utilities.base64EncodeWebSafe = s => Buffer.from(String(s)).toString('base64url');
const { Classroom, st } = makeClassroom();
env.ctx.Classroom = Classroom;
vm.runInContext(code, env.ctx, { filename: 'Code.gs' });
const G = env.ctx;
const tok = (email, role) => { const k = 'tok_' + email; env.cache['aps_sess_' + k] = JSON.stringify({ email, role }); return k; };
const admin = tok('raja_aps1234@avvaiyarpadasalai.org', 'admin');
const hm = tok('hm@aps.org', 'headmaster');
const teacher = tok('t1@aps.org', 'teacher');
const bod = tok('bod@aps.org', 'vcfo_amchsts_bod');

// 130 ACTIVE courses (forces pagination), mixed years + edge cases
const grades = ['NILAI 1', 'NILAI 2', 'NILAI 3', 'MAZHALAI', 'MUN MAZHALAI'];
for (let i = 0; i < 120; i++) {
  const g = grades[i % grades.length];
  st.courses.push({ id: 'C' + i, name: g + ' - S' + i + ' | SAT 12:00 - 1:30 PM EST | ' + (i % 3 === 2 ? 'AY25-26' : 'AY26-27'), courseState: 'ACTIVE', alternateLink: 'https://classroom/c' + i });
}
st.courses.push({ id: 'LOWER', name: 'NILAI 4 - X | FRI 7:30 - 9:00 PM EST | ay26-27', courseState: 'ACTIVE' });
st.courses.push({ id: 'TRAIL', name: 'NILAI 4 - Y | FRI 7:30 - 9:00 PM EST | AY26-27  ', courseState: 'ACTIVE' });
st.courses.push({ id: 'ARCH', name: 'NILAI 5 - Z | FRI 7:30 - 9:00 PM EST | AY26-27', courseState: 'ARCHIVED' });
for (let i = 0; i < 10; i++) st.courses.push({ id: 'P' + i, name: 'NILAI 6 - P' + i + ' | SUN 7:30 - 9:00 PM EST | AY26-27', courseState: 'ACTIVE' });
const AY = st.courses.filter(c => c.courseState === 'ACTIVE' && c.name.trim().endsWith('AY26-27')).map(c => c.id);

// ---------------------------------------------------------------- access
t('Examination access: Admin/Super Admin read-write, BOD read-only, HM/Teacher/Student refused (server-side)', () => {
  const superadmin = tok('sa@aps.org', 'superadmin'), student = tok('s@aps.org', 'student');
  [teacher, hm, student].forEach(k => assert.throws(() => G.getExaminationCourseOptions(k, {}), /Only Admin \/ Super Admin \(read-write\) and VCFO\/AMCHATS BOD \(read-only\)/));
  assert.throws(() => G.postExaminationAnnouncement('bogus', {}), /SESSION_EXPIRED/);
  assert.ok(G.getExaminationCourseOptions(superadmin, {}).canPublish);
  const b = J(G.getExaminationCourseOptions(bod, {}));
  assert.ok(b.courses.length > 0); assert.strictEqual(b.canPublish, false);
  assert.throws(() => G.previewExaminationAnnouncement(bod, { text: 'x', targetMode: 'ALL' }), /Read-only access/);
  assert.throws(() => G.generateAnnouncementId(bod), /Read-only access/);
  assert.throws(() => G.publishExaminationToCourses(bod, {}), /Read-only access/);
  assert.deepStrictEqual(['admin', 'superadmin', 'vcfo_amchsts_bod', 'headmaster', 'teacher', 'student', 'authorized'].map(r => G.examinationAccessForRole_(r)), ['READ_WRITE', 'READ_WRITE', 'READ_ONLY', '', '', '', '']);
  const pl = J(G.buildAuthenticatedUserPayload_({ email: 'x@aps.org', role: 'vcfo_amchsts_bod' }, []));
  assert.strictEqual(pl.examinationAccess, 'READ_ONLY', 'sent to the browser for tab visibility');
});

let opts;
t('AY26-27 filter: exact suffix, ACTIVE only, all pages (not just first 100)', () => {
  opts = J(G.getExaminationCourseOptions(admin, { forceRefresh: true }));
  assert.ok(st.calls.list >= 2, 'paginated');
  assert.deepStrictEqual(opts.courses.map(c => c.id).sort(), AY.slice().sort());
  assert.ok(!opts.courses.some(c => c.id === 'LOWER' || c.id === 'ARCH'));
  assert.ok(opts.courses.some(c => c.id === 'TRAIL'), 'trailing whitespace trimmed');
  assert.ok(opts.courses.some(c => c.id === 'P9'), 'course on page 2 included');
  assert.strictEqual(st.lastListArgs.fields, 'courses(id,name,alternateLink),nextPageToken');
  assert.deepStrictEqual(opts.topics, ['PROJECT WORK', 'HOMEWORK', 'QUIZ', 'ATTENDANCE', 'EXAMINATION']);
  assert.strictEqual(opts.assignmentNames.HOMEWORK.length, 20); assert.strictEqual(opts.assignmentNames.HOMEWORK[19], 'HW_LSN_20');
  assert.deepStrictEqual(opts.assignmentNames.EXAMINATION, ['MODEL_EXAM_1', 'EXAM_TRIMESTER_1', 'MODEL_EXAM_2', 'EXAM_TRIMESTER_2', 'MODEL_EXAM_3', 'EXAM_FINAL_TRIMESTER_3']);
  assert.ok(opts.grades.find(g => g.grade === 'MUNMAZHALAI'), 'grade groups reuse extractNilaiFromCourseName_');
  assert.ok(opts.canPublish);
});
t('course list is cached (second call makes no Classroom request)', () => {
  const n = st.calls.list; G.getExaminationCourseOptions(admin, {}); assert.strictEqual(st.calls.list, n);
});

// --------------------------------------------------------- announcements
const AY1 = AY[0], AY2 = AY[1], AY3 = AY[2];
let post1;
t('post to ONE classroom: unique ID ANNYYYYMMDD_NNNN appended as the LAST line', () => {
  const pv = J(G.previewExaminationAnnouncement(admin, { text: 'Model Examination 1 will be conducted on October 15, 2026.', includeHeader: true, targetMode: 'SELECT', courseIds: [AY1] }));
  assert.ok(pv.ok); assert.strictEqual(pv.selectedCount, 1); assert.strictEqual(st.calls.annCreate, 0, 'preview never posts');
  const id = G.generateAnnouncementId(admin);
  assert.strictEqual(id, 'ANN20260928_0001');
  post1 = J(G.postExaminationAnnouncement(admin, { text: 'Model Examination 1 will be conducted on October 15, 2026.', includeHeader: true, courseIds: [AY1], announcementId: id, batchId: pv.batchId }));
  assert.strictEqual(post1.counts.success, 1);
  const txt = st.anns[AY1][0].text;
  assert.ok(txt.startsWith('*** 📢 APS ADMIN Team - ANNOUNCEMENT 📢 ***\n\nModel Examination 1'));
  assert.ok(txt.endsWith('\n\nThanks\nAPS Tech Team - Admin\nSugadev Velayutham\nDirector of Technology and Public Relations\n\nANNOUNCEMENT_ID: ANN20260928_0001'), 'signature, then the ID as the last line');
});
let post2;
t('post to MULTIPLE classrooms (ID generated server-side when omitted); IDs never repeat', () => {
  post2 = J(G.postExaminationAnnouncement(admin, { text: 'Hall ticket reminder\nLine 2\nANNOUNCEMENT_ID: ANN19990101_0001', courseIds: [AY1, AY2, AY3] }));
  assert.strictEqual(post2.announcementId, 'ANN20260928_0002');
  assert.strictEqual(post2.counts.success, 3);
  const txt = st.anns[AY2][0].text;
  assert.ok(!txt.includes('ANN19990101_0001'), 'pasted ID line stripped'); assert.ok(txt.includes('Line 2'), 'line breaks kept');
  assert.strictEqual((txt.match(/ANNOUNCEMENT_ID:/g) || []).length, 1);
});
t('post to ALL AY26-27 classrooms in chunks with one ID; a failing classroom does not stop the batch', () => {
  st.fail[AY[5]] = { op: 'create', msg: 'The caller does not have permission' };
  const pv = J(G.previewExaminationAnnouncement(admin, { text: 'All classes', targetMode: 'ALL', courseIds: [] }));
  assert.strictEqual(pv.selectedCount, AY.length);
  const id = G.generateAnnouncementId(admin);
  let results = [];
  for (let i = 0; i < pv.courseIds.length; i += 6) results = results.concat(J(G.postExaminationAnnouncement(admin, { text: 'All classes', courseIds: pv.courseIds.slice(i, i + 6), announcementId: id, batchId: pv.batchId })).results);
  assert.strictEqual(results.length, AY.length);
  const failed = results.filter(r => r.status === 'FAILED');
  assert.strictEqual(failed.length, 1); assert.strictEqual(failed[0].courseId, AY[5]);
  assert.strictEqual(failed[0].message, 'The dashboard account does not have permission to post in this classroom.');
  assert.ok(!('error' in failed[0]), 'raw API error not sent to the browser');
  const auditRow = env.wb.sheets.Examination_Audit_Log.data.find(r => r[7] === AY[5] && r[6] === id);
  assert.ok(/caller does not have permission/.test(auditRow[20]), 'raw error kept in the audit log');
  // Retry Failed: only the failed classroom, no duplicate anywhere
  delete st.fail[AY[5]];
  const before = st.calls.annCreate;
  const retry = J(G.postExaminationAnnouncement(admin, { text: 'All classes', courseIds: [AY[5]], announcementId: id, isRetry: true }));
  assert.strictEqual(retry.counts.success, 1); assert.strictEqual(st.calls.annCreate, before + 1);
  const again = J(G.postExaminationAnnouncement(admin, { text: 'All classes', courseIds: [AY[0], AY[5]], announcementId: id }));
  assert.strictEqual(again.counts.alreadyExists, 2, 'double submit -> ALREADY_EXISTS'); assert.strictEqual(st.calls.annCreate, before + 1);
  post2.allId = id;
});
t('unknown / partial / malformed IDs are rejected', () => {
  assert.throws(() => G.postExaminationAnnouncement(admin, { text: 'x', courseIds: [AY1], announcementId: 'ANN20260928_0999' }), /not issued by this dashboard/);
  assert.throws(() => G.searchExaminationAnnouncement(admin, { announcementId: 'ANN20260928' }), /full Announcement ID/);
  assert.throws(() => G.postExaminationAnnouncement(admin, { text: '   ', courseIds: [AY1] }), /cannot be empty/);
});
t('non-AY26-27 classrooms are never touched (rejected as SKIPPED, no API call)', () => {
  const n = st.calls.annCreate;
  const r = J(G.postExaminationAnnouncement(admin, { text: 'x', courseIds: ['C2', 'LOWER'], announcementId: post1.announcementId }));
  assert.strictEqual(r.counts.skipped, 2); assert.strictEqual(st.calls.annCreate, n);
});
t('search by exact ID: FOUND in the classrooms that have it, with current text and dates', () => {
  // a look-alike in a non-AY course and a partial ID in an AY course must never match
  st.anns['C2'] = [{ id: 'AX1', text: 'old\n\nANNOUNCEMENT_ID: ANN20260928_0002' }];
  (st.anns[AY[10]] = st.anns[AY[10]] || []).push({ id: 'AX2', text: 'similar\n\nANNOUNCEMENT_ID: ANN20260928_000' });
  const r = J(G.searchExaminationAnnouncement(admin, { announcementId: 'ann20260928_0002' }));
  assert.strictEqual(r.announcementId, 'ANN20260928_0002');
  assert.deepStrictEqual(r.rows.filter(x => x.status === 'FOUND').map(x => x.courseId).sort(), [AY1, AY2, AY3].sort());
  assert.ok(r.rows[0].bodyText.startsWith('Hall ticket reminder')); assert.ok(!r.rows[0].bodyText.includes('ANNOUNCEMENT_ID')); assert.ok(!r.rows[0].bodyText.includes('Sugadev'), 'editable text excludes the signature');
  assert.ok(/EST$/.test(r.rows[0].created));
  const deep = J(G.searchExaminationAnnouncement(admin, { announcementId: 'ANN20260928_0002', deep: true, courseIds: [AY1, AY[10], 'C2'] }));
  assert.deepStrictEqual(deep.rows.map(x => x.courseId), [AY1], 'deep scan: exact ID only, AY only');
});
t('search reports MISSING when an announcement was deleted in Classroom', () => {
  st.anns[AY3] = st.anns[AY3].filter(a => !a.text.includes('ANN20260928_0002'));
  const r = J(G.searchExaminationAnnouncement(admin, { announcementId: 'ANN20260928_0002' }));
  assert.strictEqual(r.rows.find(x => x.courseId === AY3).status, 'MISSING');
  assert.strictEqual(r.rows.filter(x => x.status === 'FOUND').length, 2);
});
t('modify: same ID stays at the end, existing announcement updated in place, missing ones not re-posted', () => {
  const found = J(G.searchExaminationAnnouncement(admin, { announcementId: 'ANN20260928_0002' })).rows.filter(x => x.status === 'FOUND');
  const creates = st.calls.annCreate;
  const r = J(G.modifyExaminationAnnouncement(admin, { announcementId: 'ANN20260928_0002', text: 'Updated announcement text\nANNOUNCEMENT_ID: ANN20260928_0009', targets: found.map(f => ({ courseId: f.courseId, classroomId: f.classroomId })) }));
  assert.strictEqual(r.counts.success, 2); assert.strictEqual(st.calls.annCreate, creates, 'no new announcements');
  const a = st.anns[AY1].find(x => x.text.includes('ANN20260928_0002'));
  assert.strictEqual(a.text, 'Updated announcement text\n\nThanks\nAPS Tech Team - Admin\nSugadev Velayutham\nDirector of Technology and Public Relations\n\nANNOUNCEMENT_ID: ANN20260928_0002');
  assert.strictEqual((a.text.match(/Sugadev Velayutham/g) || []).length, 1, 'signature never doubled');
  assert.ok(!(st.anns[AY3] || []).some(x => x.text.includes('ANN20260928_0002')), 'missing classroom not re-posted');
  const again = J(G.modifyExaminationAnnouncement(admin, { announcementId: 'ANN20260928_0002', text: 'Updated announcement text', targets: found.map(f => ({ courseId: f.courseId, classroomId: f.classroomId })) }));
  assert.strictEqual(again.counts.skipped, 2, 'retry is idempotent (Already up to date)');
  // a target whose text no longer carries the ID is refused
  const bad = J(G.modifyExaminationAnnouncement(admin, { announcementId: 'ANN20260928_0001', text: 'x', targets: [{ courseId: AY1, classroomId: a.id }] }));
  assert.strictEqual(bad.results[0].status, 'SKIPPED'); assert.ok(a.text.includes('ANN20260928_0002'));
});
t('delete: only the exact ID is removed; look-alikes, other IDs and non-AY copies are untouched', () => {
  const found = J(G.searchExaminationAnnouncement(admin, { announcementId: 'ANN20260928_0002' })).rows.filter(x => x.status === 'FOUND');
  const others = st.anns[AY1].filter(x => !x.text.includes('ANN20260928_0002')).length;
  const r = J(G.deleteExaminationAnnouncement(admin, { announcementId: 'ANN20260928_0002', targets: found.map(f => ({ courseId: f.courseId, classroomId: f.classroomId })) }));
  assert.strictEqual(r.counts.success, 2);
  assert.strictEqual(st.anns[AY1].length, others, 'ANN..._0001 and the ALL-classes post survive in AY1');
  assert.ok(st.anns['C2'].length === 1 && st.anns[AY[10]].some(x => x.id === 'AX2'));
  const again = J(G.deleteExaminationAnnouncement(admin, { announcementId: 'ANN20260928_0002', targets: found.map(f => ({ courseId: f.courseId, classroomId: f.classroomId })) }));
  assert.strictEqual(again.counts.skipped, 2, 'retrying a delete is safe');
  const s = J(G.searchExaminationAnnouncement(admin, { announcementId: 'ANN20260928_0002' }));
  assert.strictEqual(s.rows.filter(x => x.status === 'DELETED').length, 2);
});
t('ID counter: per day, survives a lost Script Property (reconciled with the audit log)', () => {
  delete env.props.examAnnouncementSeq_v1;
  assert.strictEqual(G.generateAnnouncementId(admin), 'ANN20260928_0004');
  D.set('2026-09-29T14:00:00Z');
  assert.strictEqual(G.generateAnnouncementId(admin), 'ANN20260929_0001');
  D.set('2026-09-28T16:00:00Z');
});
t('Teacher cannot post/modify/delete even by calling the server directly', () => {
  assert.throws(() => G.postExaminationAnnouncement(teacher, { text: 'x', courseIds: [AY1] }), /Only Admin/);
  assert.throws(() => G.deleteExaminationAnnouncement(teacher, { announcementId: 'ANN20260928_0001', targets: [] }), /Only Admin/);
  assert.throws(() => G.publishExaminationToCourses(teacher, {}), /Only Admin/);
});

// -------------------------------------------------------------- classwork
const future = { scheduleDate: '2026-10-15', scheduleTime: '19:00' };
function publishAll(p, ids) { let res = []; for (let i = 0; i < ids.length; i += 6) res = res.concat(J(G.publishExaminationToCourses(admin, Object.assign({}, p, { courseIds: ids.slice(i, i + 6) }))).results); return res; }
const CW = AY.slice(0, 8);
t('Test 1: EXAMINATION / MODEL_EXAM_1 / GRADED 100 / All AY26-27 / future -> scheduled everywhere', () => {
  const p = Object.assign({ type: 'ASSIGNMENT', topic: 'EXAMINATION', assignmentName: 'MODEL_EXAM_1', graded: true, points: 100, instructions: '{TITLE}: Line 1\nLine 2', targetMode: 'ALL' }, future);
  const pv = J(G.previewExaminationClasswork(admin, p));
  assert.ok(pv.ok, pv.errors.join());
  assert.strictEqual(pv.preview.schedule, '10/15/2026 07:00 PM EST'); assert.strictEqual(pv.preview.selectedCount, AY.length);
  assert.strictEqual(pv.preview.target, 'All AY26-27 Classrooms'); assert.strictEqual(st.calls.cwCreate, 0, 'preview never creates');
  const res = publishAll(Object.assign({}, p, { batchId: pv.batchId }), pv.courseIds);
  assert.strictEqual(res.filter(r => r.status === 'SUCCESS').length, AY.length);
  const w = st.work[AY1][0];
  assert.strictEqual(w.title, 'MODEL_EXAM_1'); assert.strictEqual(w.maxPoints, 100); assert.strictEqual(w.state, 'DRAFT'); assert.strictEqual(w.workType, 'ASSIGNMENT');
  assert.strictEqual(w.scheduledTime, '2026-10-15T23:00:00.000Z', '7:00 PM EDT');
  assert.strictEqual(w.description, 'MODEL_EXAM_1: Line 1\nLine 2\n\nThanks\nAPS Tech Team - Admin\nSugadev Velayutham\nDirector of Technology and Public Relations', 'line breaks + {TITLE} + signature');
  assert.strictEqual(st.topics[AY1].filter(x => x.name === 'EXAMINATION').length, 1);
  assert.strictEqual(st.topics[AY1][0].topicId, w.topicId);
  const batchRows = env.wb.sheets.Examination_Audit_Log.data.filter(r => r[5] === pv.batchId);
  assert.strictEqual(batchRows.length, AY.length, 'one audit row per classroom, same batch id');
  assert.deepStrictEqual([batchRows[0][3], batchRows[0][9], batchRows[0][12], batchRows[0][13], batchRows[0][14], batchRows[0][17]], ['CLASSWORK_CREATE', 'EXAMINATION', 'MODEL_EXAM_1', 'GRADED', '100', 'SUCCESS']);
  assert.ok(batchRows[0][18].startsWith('W'), 'Google Classroom id stored'); assert.ok(batchRows[0][10].startsWith('T'), 'topic id stored');
});
t('Test 5 / double click: re-publishing reports ALREADY EXISTS and creates nothing (no duplicate topic)', () => {
  const n = st.calls.cwCreate, tc = st.calls.topicCreate;
  const res = publishAll(Object.assign({ type: 'ASSIGNMENT', topic: 'EXAMINATION', assignmentName: 'MODEL_EXAM_1', graded: true, points: 100, instructions: '' }, future), CW);
  assert.ok(res.every(r => r.status === 'ALREADY_EXISTS')); assert.strictEqual(st.calls.cwCreate, n); assert.strictEqual(st.calls.topicCreate, tc);
});
t('Test 2: HOMEWORK / HW_LSN_1 / UNGRADED -> created without points; existing "Homework" topic reused', () => {
  st.topics[CW[0]].push({ topicId: 'TH', name: 'Homework' });
  const res = publishAll(Object.assign({ type: 'ASSIGNMENT', topic: 'HOMEWORK', assignmentName: 'HW_LSN_1', graded: false, points: 100, instructions: 'x' }, future), CW);
  assert.ok(res.every(r => r.status === 'SUCCESS'));
  const w = st.work[CW[0]].find(x => x.title === 'HW_LSN_1');
  assert.ok(!('maxPoints' in w), 'ungraded'); assert.strictEqual(w.topicId, 'TH');
  assert.ok(!st.topics[CW[0]].some(x => x.name === 'HOMEWORK'), 'no duplicate HOMEWORK topic');
});
t('Test 3: PROJECT WORK / TRMST01_PRO01 -> filed under the correct PROJECT WORK topic', () => {
  const res = publishAll(Object.assign({ type: 'ASSIGNMENT', topic: 'PROJECT WORK', assignmentName: 'TRMST01_PRO01', graded: true, points: 100, instructions: '' }, future), [CW[1]]);
  assert.strictEqual(res[0].status, 'SUCCESS');
  const w = st.work[CW[1]].find(x => x.title === 'TRMST01_PRO01');
  assert.strictEqual(st.topics[CW[1]].find(x => x.topicId === w.topicId).name, 'PROJECT WORK');
});
t('Test 4: past schedule -> validation error, NO Classroom create request', () => {
  const n = st.calls.cwCreate, l = st.calls.cwList;
  const p = Object.assign({ type: 'ASSIGNMENT', topic: 'EXAMINATION', assignmentName: 'MODEL_EXAM_2', graded: true, points: 100, scheduleDate: '2026-09-28', scheduleTime: '11:00', targetMode: 'ALL' });
  const pv = J(G.previewExaminationClasswork(admin, p));
  assert.ok(!pv.ok); assert.ok(pv.errors.some(e => e.startsWith('Scheduled time must be in the future.')));
  const res = J(G.publishExaminationToCourses(admin, Object.assign({}, p, { courseIds: CW.slice(0, 3) })));
  assert.strictEqual(res.counts.failed, 3); assert.ok(res.results[0].message.includes('Scheduled time must be in the future'));
  assert.strictEqual(st.calls.cwCreate, n); assert.strictEqual(st.calls.cwList, l, 'not even a list call');
  // one minute ahead is still refused (2-minute lead), three minutes ahead is fine
  assert.ok(!G.validateExaminationSchedule_('2026-09-28', '12:01').ok);
  assert.ok(G.validateExaminationSchedule_('2026-09-28', '12:03').ok);
});
t('invalid combinations are refused before any API call', () => {
  const bad = J(G.previewExaminationClasswork(admin, Object.assign({ type: 'ASSIGNMENT', topic: 'HOMEWORK', assignmentName: 'MODEL_EXAM_1', graded: true, points: 0, targetMode: 'SELECT', courseIds: [] }, future)));
  assert.ok(!bad.ok);
  assert.ok(bad.errors.some(e => /valid assignment name for HOMEWORK/.test(e)));
  assert.ok(bad.errors.some(e => /Points must be a whole number/.test(e)));
  assert.ok(bad.errors.some(e => /at least one classroom/.test(e)));
  const t2 = J(G.previewExaminationClasswork(admin, Object.assign({ type: 'ASSIGNMENT', topic: 'EXAMNIATION', assignmentName: 'MODEL_EXAM_1', targetMode: 'ALL' }, future)));
  assert.ok(t2.errors.includes('Please select a topic.'), 'misspelled topic cannot be used for new work');
  assert.throws(() => G.publishExaminationToCourses(admin, { courseIds: new Array(13).fill(AY1) }), /Too many classrooms/);
  const dueBad = J(G.previewExaminationClasswork(admin, Object.assign({ type: 'ASSIGNMENT', topic: 'QUIZ', assignmentName: 'QUZ_LSN_1', graded: false, targetMode: 'ALL', dueDate: '2026-10-15', dueTime: '18:00' }, future)));
  assert.ok(dueBad.errors.includes('The due date/time must be after the scheduled time.'));
});
t('legacy "EXAMNIATION" topic is recognised for duplicate detection (never created)', () => {
  const cid = CW[2];
  st.topics[cid].push({ topicId: 'TLEG', name: 'EXAMNIATION' });
  st.work[cid].push({ id: 'WLEG', title: 'EXAM_TRIMESTER_1', topicId: 'TLEG', state: 'PUBLISHED' });
  const res = publishAll(Object.assign({ type: 'ASSIGNMENT', topic: 'EXAMINATION', assignmentName: 'EXAM_TRIMESTER_1', graded: true, points: 50 }, future), [cid, CW[3]]);
  assert.strictEqual(res.find(r => r.courseId === cid).status, 'ALREADY_EXISTS');
  assert.strictEqual(res.find(r => r.courseId === CW[3]).status, 'SUCCESS');
});
t('ATTENDANCE preset = multiple-choice question YES / NO, graded 100, with a due date (DST-aware)', () => {
  const pr = opts.presets.ATTENDANCE;
  assert.strictEqual(pr.type, 'MULTIPLE_CHOICE_QUESTION'); assert.deepStrictEqual(pr.choices, ['YES', 'NO']); assert.strictEqual(pr.points, 100);
  const res = publishAll({ type: pr.type, topic: 'ATTENDANCE', assignmentName: 'ATT_LSN_2', graded: true, points: 100, instructions: pr.instructions, choices: 'YES\nNO\nyes', scheduleDate: '2026-11-06', scheduleTime: '19:30', dueDate: '2026-11-08', dueTime: '' }, [CW[4]]);
  assert.strictEqual(res[0].status, 'SUCCESS');
  const w = st.work[CW[4]].find(x => x.title === 'ATT_LSN_2');
  assert.strictEqual(w.workType, 'MULTIPLE_CHOICE_QUESTION'); assert.deepStrictEqual(w.multipleChoiceQuestion.choices, ['YES', 'NO']);
  assert.strictEqual(w.scheduledTime, '2026-11-07T00:30:00.000Z', 'EST after DST ends');
  assert.deepStrictEqual(w.dueDate, { year: 2026, month: 11, day: 9 }); assert.deepStrictEqual(w.dueTime, { hours: 4, minutes: 59 }, '11:59 PM EST default');
  assert.ok(w.description.startsWith('ATT_LSN_2 - வருகைப்பதிவு 25%'));
});
t('Homework and Project Work keep their OWN instructions (manual-script collision fixed)', () => {
  assert.ok(opts.presets.HOMEWORK.instructions.includes('HOMEWORK: Please complete the exercises'));
  assert.ok(opts.presets['PROJECT WORK'].instructions.includes('project work assigned by your Class Teacher'));
  assert.ok(!opts.presets.HOMEWORK.instructions.includes('project work'));
});
t('Quiz Assignment: per-NILAI Drive file from the quiz sheet; class without a row is SKIPPED (no topic created)', () => {
  const qs = env.wb.insertSheet('KAHOOT_LINK_ALL_NILAI_ASSIGNMENT_POST');
  qs.data = [['NILAI', 'TITLE', 'GOOGLE_DRIVE_LINK'], ['NILAI 1', 'QUZ_LSN_2', 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view'], ['MUN MAZHALAI', 'quz_lsn_2', '1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765432']];
  const n1 = opts.courses.find(c => c.grade === 'NILAI 1').id, mun = opts.courses.find(c => c.grade === 'MUNMAZHALAI').id, n2 = opts.courses.find(c => c.grade === 'NILAI 2').id;
  const tcBefore = (st.topics[n2] || []).length;
  const res = publishAll({ type: 'QUIZ_ASSIGNMENT', topic: 'QUIZ', assignmentName: 'QUZ_LSN_2', graded: false, instructions: opts.presets.QUIZ.instructions, scheduleDate: '2026-10-02', scheduleTime: '18:00' }, [n1, mun, n2]);
  assert.strictEqual(res.find(r => r.courseId === n1).status, 'SUCCESS');
  assert.strictEqual(res.find(r => r.courseId === mun).status, 'SUCCESS');
  const skip = res.find(r => r.courseId === n2); assert.strictEqual(skip.status, 'SKIPPED'); assert.ok(/No quiz material/.test(skip.message));
  assert.strictEqual((st.topics[n2] || []).length, tcBefore, 'no topic created for a skipped class');
  const w = st.work[n1].find(x => x.title === 'QUZ_LSN_2');
  assert.deepStrictEqual(w.materials, [{ driveFile: { driveFile: { id: '1AbCdEfGhIjKlMnOpQrStUvWxYz012345' }, shareMode: 'VIEW' } }]);
  assert.ok(w.description.includes('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view'), '{MATERIAL_LINK}');
  assert.ok(!('maxPoints' in w), 'quiz preset is ungraded');
  assert.strictEqual(st.work[mun].find(x => x.title === 'QUZ_LSN_2').materials[0].driveFile.driveFile.id, '1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765432');
});
t('Material -> courseWorkMaterials.create (no points / due / workType) with a link attachment', () => {
  const res = publishAll({ type: 'MATERIAL', topic: 'EXAMINATION', assignmentName: 'MODEL_EXAM_3', graded: true, points: 100, attachmentUrl: 'https://www.avvaiyarpadasalai.org/calendar.html', dueDate: '2026-10-20', ...future }, [CW[5]]);
  assert.strictEqual(res[0].status, 'SUCCESS');
  const m = st.mats[CW[5]][0];
  assert.strictEqual(m.title, 'MODEL_EXAM_3'); assert.ok(!('maxPoints' in m) && !('dueDate' in m) && !('workType' in m));
  assert.deepStrictEqual(m.materials, [{ link: { url: 'https://www.avvaiyarpadasalai.org/calendar.html' } }]);
  // duplicate detection also covers materials
  const again = publishAll({ type: 'ASSIGNMENT', topic: 'EXAMINATION', assignmentName: 'MODEL_EXAM_3', graded: true, points: 100, ...future }, [CW[5]]);
  assert.strictEqual(again[0].status, 'ALREADY_EXISTS');
});
t('Short-answer Question type', () => {
  const res = publishAll({ type: 'SHORT_ANSWER_QUESTION', topic: 'QUIZ', assignmentName: 'QUZ_LSN_5', graded: true, points: 10, ...future }, [CW[6]]);
  assert.strictEqual(res[0].status, 'SUCCESS'); assert.strictEqual(st.work[CW[6]].find(x => x.title === 'QUZ_LSN_5').workType, 'SHORT_ANSWER_QUESTION');
});
t('one failing classroom, others succeed; Retry Failed creates only the failed one', () => {
  st.fail[CW[1]] = { op: 'create', msg: 'GoogleJsonResponseException: API call to classroom.courses.courseWork.create failed with error: Scheduled time must be in the future.' };
  const p = { type: 'ASSIGNMENT', topic: 'HOMEWORK', assignmentName: 'HW_LSN_2', graded: true, points: 100, ...future };
  const res = publishAll(p, CW.slice(0, 4));
  assert.deepStrictEqual(res.map(r => r.status), ['SUCCESS', 'FAILED', 'SUCCESS', 'SUCCESS']);
  assert.strictEqual(res[1].message, 'The scheduled time must be in the future.');
  delete st.fail[CW[1]];
  const n = st.calls.cwCreate;
  const retry = J(G.retryFailedExaminationPublish(admin, Object.assign({}, p, { courseIds: [CW[1]] })));
  assert.strictEqual(retry.counts.success, 1); assert.strictEqual(st.calls.cwCreate, n + 1);
  CW.slice(0, 4).forEach(cid => assert.strictEqual(st.work[cid].filter(x => x.title === 'HW_LSN_2').length, 1, 'exactly one copy in ' + cid));
});
t('quota errors on create are retried; 500 on create is NOT retried (cannot duplicate)', () => {
  let calls = 0; const orig = Classroom.Courses.CourseWork.create;
  Classroom.Courses.CourseWork.create = function (res, cid) { calls++; if (calls === 1) throw new Error('Quota exceeded for quota metric'); return orig(res, cid); };
  let r = J(G.publishExaminationToCourses(admin, { type: 'ASSIGNMENT', topic: 'HOMEWORK', assignmentName: 'HW_LSN_3', graded: true, points: 100, ...future, courseIds: [CW[0]] }));
  assert.strictEqual(r.results[0].status, 'SUCCESS'); assert.strictEqual(calls, 2);
  calls = 0; Classroom.Courses.CourseWork.create = function () { calls++; throw new Error('Internal error 500 backendError'); };
  r = J(G.publishExaminationToCourses(admin, { type: 'ASSIGNMENT', topic: 'HOMEWORK', assignmentName: 'HW_LSN_4', graded: true, points: 100, ...future, courseIds: [CW[0]] }));
  assert.strictEqual(r.results[0].status, 'FAILED'); assert.strictEqual(calls, 1);
  Classroom.Courses.CourseWork.create = orig;
});
t('in-flight guard: a concurrent publish to the same classroom + topic is a retryable FAILED', () => {
  const key = G.examInflightKey_(CW[7], 'CW', 'HOMEWORK');
  env.cache[key] = '1';
  const r = J(G.publishExaminationToCourses(admin, { type: 'ASSIGNMENT', topic: 'HOMEWORK', assignmentName: 'HW_LSN_9', graded: true, points: 100, ...future, courseIds: [CW[7]] }));
  assert.strictEqual(r.results[0].status, 'FAILED', 'retryable'); assert.ok(/in progress/.test(r.results[0].message));
  delete env.cache[key];
});
t('announcement already in Classroom but missing from the audit log (lost write / timed-out chunk) is not re-posted', () => {
  const id = G.generateAnnouncementId(admin);
  const cid = AY[20];
  (st.anns[cid] = st.anns[cid] || []).push({ id: 'AMANUAL', text: 'x\n\nANNOUNCEMENT_ID: ' + id, state: 'PUBLISHED' });
  const n = st.calls.annCreate;
  const r = J(G.postExaminationAnnouncement(admin, { text: 'x', courseIds: [cid, AY[21]], announcementId: id }));
  assert.deepStrictEqual(r.results.map(x => x.status), ['ALREADY_EXISTS', 'SUCCESS']); assert.strictEqual(st.calls.annCreate, n + 1);
});
t('audit write failure never turns completed Classroom work into FAILED', () => {
  const sh = env.wb.sheets.Examination_Audit_Log; const orig = sh.getRange;
  sh.getRange = function (r, c, nr, nc) { const rg = orig.call(this, r, c, nr, nc); if (r > 1 && nc === 23 && nr > 0 && this.__boom) { rg.setValues = () => { throw new Error('Service Spreadsheets timed out'); }; } return rg; };
  sh.__boom = true;
  const r = J(G.publishExaminationToCourses(admin, { type: 'ASSIGNMENT', topic: 'HOMEWORK', assignmentName: 'HW_LSN_7', graded: true, points: 100, ...future, courseIds: [CW[0]] }));
  sh.__boom = false; sh.getRange = orig;
  assert.strictEqual(r.results[0].status, 'SUCCESS');
});
t('published Google Forms link (/forms/d/e/...) becomes a link attachment, not a bogus Drive id', () => {
  assert.deepStrictEqual(J(G.examMaterialFromLink_('https://docs.google.com/forms/d/e/1FAIpQLSabcdefghijklmnopqrstuvwxyz/viewform')), { link: { url: 'https://docs.google.com/forms/d/e/1FAIpQLSabcdefghijklmnopqrstuvwxyz/viewform' } });
  assert.deepStrictEqual(J(G.examMaterialFromLink_('https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOp/edit')), { driveFile: { driveFile: { id: '1AbCdEfGhIjKlMnOp' }, shareMode: 'VIEW' } });
});
t('history: newest first; filters by ID, assignment name, course, topic, status, action, date', () => {
  let h = J(G.getExaminationHistory(admin, {}));
  assert.ok(h.rows.length > 50); assert.ok(h.rows[0].timestamp >= h.rows[h.rows.length - 1].timestamp);
  h = J(G.getExaminationHistory(admin, { search: 'ANN20260928_0001' })); assert.ok(h.rows.length >= 1 && h.rows.every(r => r.announcementId === 'ANN20260928_0001'));
  h = J(G.getExaminationHistory(admin, { search: 'hw_lsn_2' })); assert.ok(h.rows.every(r => r.assignmentName === 'HW_LSN_2'));
  h = J(G.getExaminationHistory(admin, { topic: 'QUIZ', status: 'SKIPPED' })); assert.strictEqual(h.rows.length, 1);
  h = J(G.getExaminationHistory(admin, { action: 'ANNOUNCEMENT_DELETE', status: 'SUCCESS' })); assert.strictEqual(h.rows.length, 2);
  h = J(G.getExaminationHistory(admin, { date: '2026-09-28' })); assert.ok(h.rows.length > 0);
  h = J(G.getExaminationHistory(admin, { date: '2026-09-27' })); assert.strictEqual(h.rows.length, 0);
  h = J(G.getExaminationHistory(bod, { search: AY1 ? opts.courses[0].name.slice(0, 12) : '' })); assert.ok(h.rows.length > 0, 'course-name search');
  assert.strictEqual(h.rows[0].userApsId, 'APS1234', 'APSID from email'); assert.ok(!('error' in h.rows[0]), 'raw errors not exposed');
  assert.throws(() => G.getExaminationHistory(teacher, {}), /Only Admin/);
});
t('BOD read-only views history/search; Admin with buttons permission off cannot publish; Material/Question also get the signature', () => {
  assert.ok(J(G.getExaminationHistory(bod, {})).rows.length > 0, 'BOD can view history');
  assert.ok(J(G.searchExaminationAnnouncement(bod, { announcementId: 'ANN20260928_0001' })).rows.length > 0, 'BOD can search');
  assert.throws(() => G.deleteExaminationAnnouncement(bod, { announcementId: 'ANN20260928_0001', targets: [] }), /Read-only access/);
  const mat = st.mats[CW[5]][0]; assert.ok(mat.description.endsWith('Director of Technology and Public Relations'));
  const perms = JSON.parse(env.props.dashboardRolePermissions_v1 || '{}');
  perms.admin = { readOnly: false, buttons: false, filters: true, tabs: true };
  env.props.dashboardRolePermissions_v1 = JSON.stringify(perms); delete env.cache.dashboardRolePermissions_v1;
  assert.throws(() => G.publishExaminationToCourses(admin, {}), /Read-only access/);
  assert.strictEqual(J(G.getExaminationCourseOptions(admin, {})).canPublish, false);
});
console.log('\nALL ' + passed + ' EXAMINATION TESTS PASSED');

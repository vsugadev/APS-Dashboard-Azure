// Classes tab Google Meet link per class (node test/meetlinks.js)
const assert = require('assert'); const fs = require('fs'); const vm = require('vm');
const { build } = require('./gradingfixture');
const { makeContext } = require('./gasmock');
const fx = require('./fixtures');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const J = x => JSON.parse(JSON.stringify(x));
const patch = F => { const sh0 = F.env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0); P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete F.env.wb.sheets.__p; return F; };
const day = v => v instanceof Date || /T/.test(String(v)) ? new Date(v).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : String(v);

t('classMeetUrl_ accepts only standard Meet codes / links', () => {
  const G = build().G;
  assert.strictEqual(G.classMeetUrl_('ABCDEFGHIJ'), 'https://meet.google.com/abc-defg-hij');
  assert.strictEqual(G.classMeetUrl_('https://meet.google.com/abc-defg-hij?authuser=1'), 'https://meet.google.com/abc-defg-hij');
  assert.strictEqual(G.classMeetUrl_('abc-defg-hij'), 'https://meet.google.com/abc-defg-hij');
  ['', 'javascript:alert(1)', 'https://evil.com/abc-defg-hij', 'lookup/abcdefgh', 'abc'].forEach(x => assert.strictEqual(G.classMeetUrl_(x), '', x));
});

t('priority: Admin mapping > link in Classroom Description/Room/Section > auto-detected; every visible class gets one', () => {
  const F = patch(build()); const { G, cls, ids, env } = F;
  cls.courses.find(c => c.id === ids.N3EA).description = 'Class link: https://meet.google.com/cla-ssro-omx (Tuesdays)';
  cls.courses.find(c => c.id === ids.N4AB).room = 'Meet: meet.google.com/roo-mlin-kxx';
  cls.courses.find(c => c.id === ids.N3EF).description = 'https://meet.google.com/aaa-bbbb-ccc';
  G.syncClassroomData();
  G.saveCourseMeetLinkMapping(F.tok('admin@aps.org', 'admin'), ids.N3EF, 'https://meet.google.com/adm-inma-ppd', 'N3EF');
  G.classMeetDetectedSave_({ [ids.MAZ]: { code: 'DETECTEDXX', source: 'MEET_AUDIT_TEACHER_CODE', date: '2026-09-26', courseName: 'MAZ' },
    [ids.N3EA]: { code: 'IGNOREDXYZ', source: 'MEET_AUDIT_CLASS_CODE', date: '2026-09-26', courseName: 'N3EA' } });
  const d = J(G.getDashboardData(F.tok('admin@aps.org', 'admin')));
  const m = {}; d.courses.forEach(c => { m[c.id] = [c.meetLink, c.meetLinkSource]; });
  assert.deepStrictEqual(m[ids.N3EF], ['https://meet.google.com/adm-inma-ppd', 'ADMIN_MAPPED']);
  assert.deepStrictEqual(m[ids.N3EA], ['https://meet.google.com/cla-ssro-omx', 'CLASSROOM']);
  assert.deepStrictEqual(m[ids.N4AB], ['https://meet.google.com/roo-mlin-kxx', 'CLASSROOM']);
  assert.deepStrictEqual(m[ids.MAZ], ['https://meet.google.com/det-ecte-dxx', 'AUTO_DETECTED']);
  assert.deepStrictEqual(m[ids.BIG], ['', ''], 'unknown -> no link (never a guessed one)');
  // every role that sees the class gets the link
  const st = J(G.getDashboardData(F.tok('joshua_aps3407@avvaiyarpadasalai.org', 'student')));
  assert.ok(st.courses.length && st.courses.every(c => c.id !== ids.N3EA || c.meetLink === 'https://meet.google.com/cla-ssro-omx'));
  const te = J(G.getDashboardData(F.tok('teacherb_aps102@avvaiyarpadasalai.org', 'teacher')));
  assert.strictEqual(te.courses.find(c => c.id === ids.MAZ).meetLink, 'https://meet.google.com/det-ecte-dxx');
  assert.ok(!te.courses.some(c => c.id === ids.N3EA), 'no link for classes the viewer cannot see');
});

t('detected store: newer class date wins, older never overwrites; one write', () => {
  const F = build(); const { G, env } = F;
  G.classMeetDetectedSave_({ '1': { code: 'AAAAAAAAAA', source: 'MEET_AUDIT_TEACHER_CODE', date: '2026-09-26', courseName: 'X' } });
  G.classMeetDetectedSave_({ '1': { code: 'BBBBBBBBBB', source: 'MEET_AUDIT_TEACHER_CODE', date: '2026-09-19', courseName: 'X' } });
  let rows = env.wb.getSheetByName('Course_Meet_Link_Detected').data.slice(1).filter(r => r[0]);
  assert.deepStrictEqual(J(rows.map(r => [String(r[0]), r[2], day(r[4])])), [['1', 'aaa-aaaa-aaa', '2026-09-26']]);
  G.classMeetDetectedSave_({ '1': { code: 'CCCCCCCCCC', source: 'MEET_AUDIT_CLASS_CODE', date: '2026-10-03', courseName: 'X' } });
  rows = env.wb.getSheetByName('Course_Meet_Link_Detected').data.slice(1).filter(r => r[0]);
  assert.deepStrictEqual(J(rows.map(r => [r[2], day(r[4])])), [['ccc-cccc-ccc', '2026-10-03']]);
  const st = {};
  G.classMeetNoteDetected_(st, { id: 9, name: 'N' }, '2026-09-26', { source: 'MEET_AUDIT_TEACHER_CODE', codes: { aaaaaaaaaa: true, bbbbbbbbbb: true } });
  assert.deepStrictEqual(st, {}, 'two Meets -> ambiguous, not remembered');
  G.classMeetNoteDetected_(st, { id: 9, name: 'N' }, '2026-09-26', { source: 'MEET_AUDIT_NO_ACTIVITY', codes: {} });
  assert.deepStrictEqual(st, {});
});

t('Attendance sync remembers the Meet each class used (end-to-end with the audit-log fixture)', () => {
  const code = fs.readFileSync(__dirname + '/../Code.gs', 'utf8');
  const NOW = new Date('2026-09-26T18:00:00Z').getTime();
  class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } }
  const env = makeContext({ auditItems: fx.audit, Date: D }); vm.runInContext(code, env.ctx, { filename: 'Code.gs' });
  const sh = env.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h');
  fx.courses.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); sh.data[i + 1] = row; });
  env.ctx.syncAttendanceForAllCourses();
  const det = env.wb.getSheetByName('Course_Meet_Link_Detected');
  assert.ok(det, 'sheet created');
  const rows = det.data.slice(1).filter(r => r[0]);
  assert.ok(rows.length >= 1 && rows.every(r => /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(r[2])), JSON.stringify(rows));
  const courses = J(env.ctx.readAllCoursesFromCache_());
  env.ctx.applyMeetLinks_(courses);
  assert.ok(courses.some(c => c.meetLinkSource === 'AUTO_DETECTED' && /^https:\/\/meet\.google\.com\//.test(c.meetLink)));
});

t('auto-fill Course ↔ Meet mapping from Google Classroom: Description, stream (announcement / material lookup link), manual kept, fresh rows skipped, Admin only', () => {
  const F = patch(build()); const { G, cls, ids, env } = F;
  const calls = { ann: 0, mat: 0, cw: 0 };
  const ann = { [ids.N3EA]: [{ text: 'Today’s class: https://meet.google.com/str-eamx-abc see you!' }] };
  const mat = { [ids.N4AB]: [{ title: 'Class link', materials: [{ link: { url: 'https://meet.google.com/lookup/abcd1234ef' } }] }] };
  env.ctx.Classroom.Courses.Announcements = { list: (cid) => { calls.ann++; return { announcements: ann[cid] || [] }; } };
  env.ctx.Classroom.Courses.CourseWorkMaterials = { list: (cid) => { calls.mat++; return { courseWorkMaterial: mat[cid] || [] }; } };
  const cwList = env.ctx.Classroom.Courses.CourseWork.list;
  env.ctx.Classroom.Courses.CourseWork.list = (cid, o) => { calls.cw++; return cwList(cid, o); };
  cls.courses.find(c => c.id === ids.N3EF).description = 'Class Meet: meet.google.com/des-crip-tio';
  G.syncClassroomData();
  G.saveCourseMeetLinkMapping(F.tok('admin@aps.org', 'admin'), ids.MAZ, 'https://meet.google.com/man-ualx-map', 'MAZ');
  assert.throws(() => G.autoMapCourseMeetLinks(F.tok('hm@aps.org', 'headmaster')), /Only an Admin/);
  const before = Object.assign({}, calls);
  const r = J(G.autoMapCourseMeetLinks(F.tok('admin@aps.org', 'admin')));
  assert.ok(r.found >= 3 && r.manualKept === 1, JSON.stringify(r));
  const map = {}; J(G.getCourseMeetLinkMappings(F.tok('admin@aps.org', 'admin'))).forEach(m => { map[m.courseId] = m; });
  assert.deepStrictEqual([map[ids.N3EF].meetCode, map[ids.N3EF].source], ['des-crip-tio', 'AUTO_CLASSROOM']);
  assert.ok(/Description/.test(map[ids.N3EF].updatedBy));
  assert.deepStrictEqual([map[ids.N3EA].meetCode, map[ids.N3EA].source], ['str-eamx-abc', 'AUTO_CLASSROOM']); assert.ok(/Announcements/.test(map[ids.N3EA].updatedBy));
  assert.deepStrictEqual([map[ids.N4AB].meetCode, map[ids.N4AB].joinLink], ['', 'https://meet.google.com/lookup/abcd1234ef']);
  assert.deepStrictEqual([map[ids.MAZ].meetCode, map[ids.MAZ].source], ['man-ualx-map', 'MANUAL'], 'manual row untouched');
  // second run: everything fresh -> no Classroom calls at all
  // daily run: found rows are fresh and classes without a link were just checked -> no Classroom calls at all
  const mid = Object.assign({}, calls); const r2 = J(G.classMeetAutoMap_({}));
  assert.deepStrictEqual(calls, mid, 'no API calls on the next daily run'); assert.strictEqual(r2.updated, 0); assert.ok(r2.skippedRecentlyChecked > 100);
  // display priority: manual > Description > auto (stream) > detected; lookup links are joinable
  const d = J(G.getDashboardData(F.tok('admin@aps.org', 'admin')));
  const m = {}; d.courses.forEach(c => { m[c.id] = [c.meetLink, c.meetLinkSource]; });
  assert.deepStrictEqual(m[ids.MAZ], ['https://meet.google.com/man-ualx-map', 'ADMIN_MAPPED']);
  assert.deepStrictEqual(m[ids.N3EF], ['https://meet.google.com/des-crip-tio', 'CLASSROOM']);
  assert.deepStrictEqual(m[ids.N3EA], ['https://meet.google.com/str-eamx-abc', 'CLASSROOM_STREAM']);
  assert.deepStrictEqual(m[ids.N4AB], ['https://meet.google.com/lookup/abcd1234ef', 'CLASSROOM_STREAM']);
  // attendance pins only real meeting codes (manual + auto), never lookup links
  const pin = G.readCourseMeetLinkMap_();
  assert.strictEqual(pin[ids.N3EA], 'str-eamx-abc'); assert.ok(!pin[ids.N4AB]);
});

console.log(pass + ' passed');

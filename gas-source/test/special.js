// r79: 🎓 சிறப்பு வகுப்புகள் (Special Classes) — server tests (node test/special.js)
const assert = require('assert');
const { setup, D } = require('./coveragefixture');
const J = x => JSON.parse(JSON.stringify(x));
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const day = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); };
const base = (o) => Object.assign({ title: 'பண்ணிசை சிறப்பு வகுப்புகள்', description: 'தமிழர் இசை மரபின் தனிப்பெரும் அடையாளமான பண்ணிசையை\nநம் குழந்தைகளுக்குக் கற்றுக்கொடுப்போம்!', audience: 'STUDENTS_ONLY', mode: 'GOOGLE_CLASSROOM_MEET',
  programStart: day(8), programEnd: day(60), enrollStart: day(-5), enrollEnd: day(5), fees: 'Free for APS Students', startTime: '10:00', endTime: '11:30', classDay: 'Saturday', link: 'https://forms.gle/abc123', status: 'ACTIVE', order: '1' }, o || {});
function prep() {
  const F = setup(); const G = F.G;
  F.A = F.tok2.admin; F.SA = F.tok('super@aps.org', 'superadmin'); F.S = F.tok2.student; F.T = F.tok2.teacher; F.H = F.tok2.hm; F.B = F.tok2.bod;
  F.save = (o, tk) => J(G.saveSpecialClass(tk || F.A, base(o)));
  F.sheet = () => F.env.wb.getSheetByName('APS_SPECIAL_CLASSES_LIVE');
  F.audit = () => (F.env.wb.getSheetByName('APS_SPECIAL_CLASSES_AUDIT') || { getDataRange: () => ({ getValues: () => [[]] }) }).getDataRange().getValues().slice(1);
  return F;
}
const ids = d => d.programs.map(p => p.title);

t('Access Control: new row 🎓 (AYNNYNN) — Student / Admin / Super Admin on; HM, Teacher, BOD, Authorized OFF by default; server refuses them', () => {
  const F = prep(); const G = F.G;
  const ac = J(G.getAccessControl(F.A)); const row = ac.rows.find(r => r.key === 'specialClasses');
  assert.strictEqual(ac.rows.length, 44); // r120: + Users outside the USA; r114: + Volunteer/Teacher Management; r110: + School Leave Management; r94: + Apply Leave; r89: + Temp Teacher; r85: + Assignment Monitoring
  assert.deepStrictEqual(row.cells, { superadmin: 'A', admin: 'Y', headmaster: 'N', teacher: 'N', student: 'Y', vcfo_amchsts_bod: 'N', authorized: 'N' });
  assert.deepStrictEqual(row.values, { superadmin: true, admin: true, headmaster: false, teacher: false, student: true, vcfo_amchsts_bod: false, authorized: false });
  assert.strictEqual(row.editable.teacher, true);
  ['headmaster', 'teacher', 'vcfo_amchsts_bod', 'authorized'].forEach(r => assert.strictEqual(G.apsTabAllowed_(r, 'specialClasses'), false, r));
  ['student', 'admin', 'superadmin'].forEach(r => assert.strictEqual(G.apsTabAllowed_(r, 'specialClasses'), true, r));
  [F.T, F.H, F.B].forEach(tk => assert.throws(() => G.getSpecialClasses(tk), /ACCESS_OFF/));
  assert.ok(G.getSpecialClasses(F.S).programs);
  const dd = J(G.getDashboardData(F.T)); assert.strictEqual(dd.tabAccess.specialClasses, false, 'browser gets the setting too');
});
t('Admin creates programs → SC-YYYY-NNN IDs, headers created, Tamil kept, audited; user cannot manage (server-enforced)', () => {
  const F = prep(); const G = F.G;
  const r1 = F.save(); const r2 = F.save({ title: 'ஆசிரியர் பயிற்சி — தமிழ் இலக்கணமும் எழுத்துப்பிழையும்', audience: 'TEACHERS_ONLY', mode: 'ZOOM', link: 'https://zoom.us/j/1' });
  const y = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).slice(0, 4);
  assert.strictEqual(r1.savedId, 'SC-' + y + '-001'); assert.strictEqual(r2.savedId, 'SC-' + y + '-002'); assert.strictEqual(r2.action, 'CREATE_SPECIAL_CLASS');
  const hdr = F.sheet().getRange(1, 1, 1, F.sheet().getLastColumn()).getValues()[0].filter(Boolean);
  ['Special Class ID', 'Title', 'Description', 'Audience', 'Mode', 'Program Start Date', 'Program End Date', 'Enrollment Start Date', 'Enrollment End Date', 'Fees', 'Class Start Time', 'Class End Time', 'Registration Link', 'Status', 'Display Order', 'Created Date', 'Created By', 'Updated Date', 'Updated By'].forEach((h, i) => assert.strictEqual(hdr[i], h));
  const p = r1.rows.find(x => x.id === r1.savedId);
  assert.strictEqual(p.raw.description, base().description, 'multi-line Tamil description kept'); assert.strictEqual(p.timeLabel, 'Saturday 10:00 AM – 11:30 AM ET'); assert.strictEqual(p.raw.startTime, '10:00');
  assert.ok(F.audit().some(a => a[1] === 'CREATE_SPECIAL_CLASS' && a[2] === r1.savedId && a[4] === 'admin@aps.org'));
  [F.S, F.T, F.B].forEach(tk => { assert.throws(() => G.saveSpecialClass(tk, base()), /Only Admin|ACCESS_OFF/); assert.throws(() => G.getSpecialClassesAdmin(tk), /Only Admin|ACCESS_OFF/); assert.throws(() => G.setSpecialClassActive(tk, r1.savedId, false), /Only Admin|ACCESS_OFF/); });
});
t('existing sheet: columns found by header name (any order), missing ones appended, nothing renamed; malformed rows skipped safely', () => {
  const F = prep(); const G = F.G;
  const sh = F.env.wb.insertSheet('APS_SPECIAL_CLASSES_LIVE');
  sh.getRange(1, 1, 1, 6).setValues([['Title', 'Special Class ID', 'Audience', 'Mode', 'Registration Link', 'Notes for office']]);
  sh.getRange(2, 1, 4, 6).setValues([['Good one', 'SC-2026-010', 'Students Only', 'Zoom Meeting', 'https://ok.example/x', 'keep'], ['No audience', 'SC-2026-011', 'Parents', 'Zoom', '', ''],
    ['Bad link', 'SC-2026-012', 'All', 'Others', 'javascript:alert(1)', ''], ['', '', '', '', '', '']]);
  const d = J(G.getSpecialClasses(F.S));
  assert.deepStrictEqual(ids(d), ['Good one', 'Bad link'], 'unknown audience row skipped; the All program is shown');
  assert.ok(!d.programs.find(p => p.title === 'Bad link').registerUrl);
  const all = J(G.getSpecialClasses(F.A)); assert.deepStrictEqual(all.programs.map(p => p.id).sort(), ['SC-2026-010', 'SC-2026-012']);
  assert.ok(!all.programs.find(p => p.id === 'SC-2026-012').registerUrl, 'unsafe scheme never sent');
  F.save({ title: 'New' });
  const h2 = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  assert.deepStrictEqual(h2.slice(0, 6), ['Title', 'Special Class ID', 'Audience', 'Mode', 'Registration Link', 'Notes for office'], 'existing columns untouched');
  assert.ok(h2.includes('Description') && h2.includes('Program Start Date') && h2.includes('Enrollment Options'));
  assert.strictEqual(sh.getRange(2, 6).getValues()[0][0], 'keep');
});
t('Audience × role: Students Only / Teacher Only / Both / All — and Admin sees every active program', () => {
  const F = prep(); const G = F.G;
  F.save({ title: 'S' }); F.save({ title: 'T', audience: 'TEACHERS_ONLY' }); F.save({ title: 'B', audience: 'STUDENTS_AND_TEACHERS' }); F.save({ title: 'ALL', audience: 'ALL' });
  assert.deepStrictEqual(ids(J(G.getSpecialClasses(F.S))).sort(), ['ALL', 'B', 'S']);
  G.saveAccessControl(F.A, [{ role: 'teacher', key: 'specialClasses', visible: true }, { role: 'vcfo_amchsts_bod', key: 'specialClasses', visible: true }]);
  assert.deepStrictEqual(ids(J(G.getSpecialClasses(F.T))).sort(), ['ALL', 'B', 'T'], 'TEST 3: teacher enabled sees teacher programs only');
  assert.deepStrictEqual(ids(J(G.getSpecialClasses(F.B))), ['ALL'], 'BOD: only All');
  assert.strictEqual(G.apsTabAllowed_('teacher', 'specialClasses'), true);
  assert.deepStrictEqual(ids(J(G.getSpecialClasses(F.A))).sort(), ['ALL', 'B', 'S', 'T']);
  G.saveAccessControl(F.A, [{ role: 'teacher', key: 'specialClasses', visible: false }]);
  assert.throws(() => G.getSpecialClasses(F.T), /ACCESS_OFF/, 'TEST 11: disabled again');
  const st = J(G.getSpecialClasses(F.S)).programs.find(p => p.title === 'S');
  assert.strictEqual(st.registerUrl, 'https://forms.gle/abc123'); assert.ok(!('classroomId' in st) && !(st.options || []).some(o => 'classroomId' in o));
});
t('registration state from the dates: UPCOMING / OPEN / CLOSED / COMPLETED; link only when open; order Open → Upcoming → running → future', () => {
  const F = prep(); const G = F.G;
  F.save({ title: 'Upcoming', enrollStart: day(5), enrollEnd: day(10), programStart: day(12), programEnd: day(40) });
  F.save({ title: 'Open', enrollStart: day(-2), enrollEnd: day(3) });
  F.save({ title: 'ClosedRunning', enrollStart: day(-30), enrollEnd: day(-10), programStart: day(-5), programEnd: day(30), order: '2' });
  F.save({ title: 'Completed', enrollStart: day(-90), enrollEnd: day(-60), programStart: day(-50), programEnd: day(-1) });
  F.save({ title: 'NoDates', enrollStart: '', enrollEnd: '', programStart: '', programEnd: '', link: '', startTime: '', endTime: '' });
  const d = J(G.getSpecialClasses(F.S)), by = Object.fromEntries(d.programs.map(p => [p.title, p]));
  assert.deepStrictEqual(ids(d), ['Open', 'Upcoming', 'ClosedRunning', 'NoDates'], 'completed hidden from users by default');
  assert.strictEqual(by.Open.state.code, 'OPEN'); assert.ok(by.Open.registerUrl);
  assert.strictEqual(by.Upcoming.state.code, 'UPCOMING'); assert.ok(/^Registration Opens [A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(by.Upcoming.state.label)); assert.ok(!by.Upcoming.registerUrl);
  assert.strictEqual(by.ClosedRunning.state.code, 'CLOSED'); assert.ok(!by.ClosedRunning.registerUrl); assert.strictEqual(by.ClosedRunning.state.running, true);
  assert.strictEqual(by.NoDates.state.code, 'NONE'); assert.strictEqual(by.NoDates.timeLabel, 'To Be Announced'); assert.strictEqual(by.NoDates.programLabel, 'To Be Announced');
  const adm = J(G.getSpecialClasses(F.A)); assert.strictEqual(adm.programs.find(p => p.title === 'Completed').state.code, 'COMPLETED');
  G.saveSpecialClassesSettings(F.A, { showCompleted: true, intro: 'Our programs', emptyText: '' });
  const d2 = J(G.getSpecialClasses(F.S)); assert.ok(ids(d2).includes('Completed')); assert.strictEqual(d2.intro, 'Our programs');
});
t('validation: required, controlled lists, date / time order, safe URL, late enrollment needs a tick; values never silently changed', () => {
  const F = prep(); const G = F.G;
  const bad = (o, re) => assert.throws(() => G.saveSpecialClass(F.A, base(o)), re);
  bad({ title: '  ' }, /Title is required/); bad({ description: '' }, /Description is required/);
  bad({ audience: 'PARENTS' }, /Audience/); bad({ mode: 'TEAMS' }, /Mode/);
  bad({ programStart: day(10), programEnd: day(5) }, /Program End Date cannot be before/);
  bad({ enrollStart: day(4), enrollEnd: day(1) }, /Enrollment End Date cannot be before/);
  bad({ enrollStart: day(20), enrollEnd: day(25), programStart: day(10) }, /tick "Allow enrollment/);
  assert.ok(G.saveSpecialClass(F.A, base({ enrollStart: day(20), enrollEnd: day(25), programStart: day(10), allowLateEnrollment: true })).savedId);
  bad({ startTime: '11:30', endTime: '10:00' }, /End Time must be later/);
  bad({ link: 'javascript:alert(1)' }, /Registration Link must be a valid web address/); bad({ link: 'data:text/html,x' }, /Registration Link/);
  bad({ order: 'abc' }, /Display Order/); bad({ status: 'ARCHIVED' }, /Status/);
  bad({ classroomId: 'abc' }, /Google Classroom ID/); bad({ maxSeats: '0' }, /Maximum Seats/);
  bad({ options: [{ label: 'A' }, { label: 'a' }] }, /must be different/); bad({ options: [{ label: '', classroomId: '123456' }] }, /enter a name/);
  const r = F.save({ title: '  Spaced title  ', fees: '$25 per student', mode: 'OTHER', modeDetails: 'In-person / Community Center' });
  const p = r.rows.find(x => x.id === r.savedId); assert.strictEqual(p.raw.title, 'Spaced title'); assert.strictEqual(p.raw.fees, '$25 per student'); assert.strictEqual(p.modeDetails, 'In-person / Community Center');
  const f = F.save({ title: '=HYPERLINK("x")' }); assert.strictEqual(F.sheet().getDataRange().getValues().find(row => String(row[0]) === f.savedId)[1], '\'=HYPERLINK("x")', 'formula text stored as plain text');
  assert.strictEqual(f.rows.find(x => x.id === f.savedId).title, '=HYPERLINK("x")');
});
t('edit + activate / deactivate (no delete): inactive hidden from users, audited; cache cleared so changes show at once', () => {
  const F = prep(); const G = F.G;
  const id = F.save().savedId;
  assert.strictEqual(J(G.getSpecialClasses(F.S)).programs.length, 1);
  const r = J(G.saveSpecialClass(F.A, base({ id, title: 'Renamed', fees: 'Free' })));
  assert.strictEqual(r.action, 'UPDATE_SPECIAL_CLASS'); assert.strictEqual(J(G.getSpecialClasses(F.S)).programs[0].title, 'Renamed', 'no stale cache');
  J(G.setSpecialClassActive(F.SA, id, false)); assert.strictEqual(J(G.getSpecialClasses(F.S)).programs.length, 0);
  assert.strictEqual(J(G.getSpecialClassesAdmin(F.A)).rows[0].status, 'INACTIVE');
  J(G.setSpecialClassActive(F.A, id, true)); assert.strictEqual(J(G.getSpecialClasses(F.S)).programs.length, 1);
  const acts = F.audit().map(a => a[1]); ['CREATE_SPECIAL_CLASS', 'UPDATE_SPECIAL_CLASS', 'DEACTIVATE_SPECIAL_CLASS', 'ACTIVATE_SPECIAL_CLASS'].forEach(a => assert.ok(acts.includes(a), a));
  assert.ok(F.audit().find(a => a[1] === 'UPDATE_SPECIAL_CLASS')[6].includes('title'));
  assert.throws(() => G.saveSpecialClass(F.A, base({ id: 'SC-1999-999' })), /was not found/);
  assert.strictEqual(typeof G.deleteSpecialClass, 'undefined');
});
t('one sheet read per load (cached 10 min); unreadable spreadsheet → friendly message, nothing else breaks', () => {
  const F = prep(); const G = F.G; F.save(); F.save({ title: 'Two' });
  F.env.ctx.CacheService.getScriptCache().remove('aps_special_classes_v1'); F.env.ctx.CacheService.getScriptCache().remove('aps_special_classes_enr_v1');
  let n = 0; const real = F.env.ctx.SpreadsheetApp.openById; F.env.ctx.SpreadsheetApp.openById = id => { if (id === '1itBHvjvjPwQc4BUJMenFdDoqKcSKutjk10v5F_NlpcE') n++; return real(id); };
  G.getSpecialClasses(F.S); G.getSpecialClasses(F.S); G.getSpecialClasses(F.A);
  assert.strictEqual(n, 2, 'programs read once (+ one enrollment read) — then cached');
  F.env.ctx.CacheService.getScriptCache().remove('aps_special_classes_v1');
  F.env.ctx.SpreadsheetApp.openById = id => { if (id === '1itBHvjvjPwQc4BUJMenFdDoqKcSKutjk10v5F_NlpcE') throw new Error('You do not have permission'); return real(id); };
  assert.throws(() => G.getSpecialClasses(F.S), /Special Classes are temporarily unavailable/);
  assert.doesNotThrow(() => G.getDashboardData(F.S));
  F.env.ctx.SpreadsheetApp.openById = real;
});
t('enrollments: Admin adds by email / APSID with option → enrolled people see ⭐ My Special Classes (current / upcoming / past), class link only for them', () => {
  const F = prep(); const G = F.G;
  const cur = F.save({ title: 'Current', programStart: day(-10), programEnd: day(20), enrollStart: day(-20), enrollEnd: day(-12), options: [{ label: 'Saturday 10 AM batch', classroomId: '771101', seats: 20 }, { label: 'Sunday 4 PM batch' }] }).savedId;
  F.G.saveSpecialClass(F.A, base({ id: cur, title: 'Current', programStart: day(-10), programEnd: day(20), enrollStart: day(-20), enrollEnd: day(-12), classLink: 'https://meet.google.com/abc-defg-hij', options: [{ label: 'Saturday 10 AM batch', classroomId: '771101', seats: 20 }, { label: 'Sunday 4 PM batch' }] }));
  const past = F.save({ title: 'Past', programStart: day(-60), programEnd: day(-2), enrollStart: day(-90), enrollEnd: day(-61), classLink: 'https://zoom.us/j/9' }).savedId;
  const up = F.save({ title: 'Teacher upcoming', audience: 'TEACHERS_ONLY' }).savedId;
  const stu = 'sa0_aps6650' + D;
  const r = J(G.addSpecialClassEnrollments(F.A, cur, { people: stu + '\nAPS6651\nnot-an-email\noutsider@gmail.com', option: 'Saturday 10 AM batch', status: 'ENROLLED', payment: 'PAID' }));
  assert.strictEqual(r.added, 2); assert.deepStrictEqual(r.notFound, ['not-an-email', 'outsider@gmail.com']);
  const me = r.rows.find(x => x.email === stu); assert.strictEqual(me.apsId, 'APS6650'); assert.strictEqual(me.role, 'Student'); assert.strictEqual(me.option, 'Saturday 10 AM batch');
  const enrSheet = F.env.wb.getSheetByName('APS_SPECIAL_CLASSES_ENROLLMENTS').getDataRange().getValues();
  assert.strictEqual(enrSheet[1][7], '771101', 'option → its Google Classroom ID stored for future mapping'); assert.strictEqual(enrSheet[1][15], 'NOT_MAPPED'); assert.strictEqual(enrSheet[1][11], 'ADMIN');
  assert.strictEqual(J(G.addSpecialClassEnrollments(F.A, cur, { people: stu })).added, 0, 'no duplicates');
  G.addSpecialClassEnrollments(F.A, past, { people: stu }); G.addSpecialClassEnrollments(F.A, up, { people: stu });
  G.setSpecialClassActive(F.A, past, false);
  const d = J(G.getSpecialClasses(F.S));
  assert.deepStrictEqual(d.mine.map(p => p.title + ':' + p.phase), ['Current:CURRENT', 'Teacher upcoming:UPCOMING', 'Past:PAST'], 'enrolled programs shown even if completed / inactive / other audience');
  assert.strictEqual(d.mine[0].classLink, 'https://meet.google.com/abc-defg-hij'); assert.ok(!d.mine[2].classLink, 'no join link for a past program');
  assert.strictEqual(d.mine[0].enrollment.option, 'Saturday 10 AM batch'); assert.strictEqual(d.mine[0].enrollment.payment, 'PAID');
  assert.ok(!d.programs.some(p => p.classLink), 'class link never in the public list');
  assert.deepStrictEqual(J(G.getSpecialClasses(F.tok('sa2_aps6652' + D, 'student'))).mine, [], 'other students see nothing of it');
  const e = J(G.getSpecialClassEnrollments(F.A, cur)).rows.find(x => x.email === stu);
  J(G.updateSpecialClassEnrollment(F.A, e.id, { status: 'CANCELLED' }));
  assert.ok(!J(G.getSpecialClasses(F.S)).mine.some(p => p.id === cur), 'cancelled → removed from My Special Classes');
  assert.throws(() => G.updateSpecialClassEnrollment(F.A, e.id, { option: 'Monday' }), /Enrollment Option/);
  assert.throws(() => G.addSpecialClassEnrollments(F.S, cur, { people: stu }), /Only Admin/);
  assert.throws(() => G.getSpecialClassEnrollments(F.S, cur), /Only Admin/);
  assert.strictEqual(J(G.getSpecialClassesAdmin(F.A)).rows.find(x => x.id === cur).enrolled, 1);
  assert.ok(F.audit().some(a => a[1] === 'ADD_SPECIAL_CLASS_ENROLLMENT') && F.audit().some(a => a[1] === 'UPDATE_SPECIAL_CLASS_ENROLLMENT'));
});
console.log(process.exitCode ? 'SOME SPECIAL CLASSES TESTS FAILED' : 'ALL ' + pass + ' SPECIAL CLASSES TESTS PASSED');

// r74: 👣 தமிழ்த் தடம் (Tamil Thadam) — server tests (node test/tamil.js)
const assert = require('assert');
const { setup, ID, D } = require('./coveragefixture');
const J = x => JSON.parse(JSON.stringify(x));
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const STU = 'sa0_aps6650' + D, OTHER = 'sa1_aps6651' + D;
const sheet = (F, n) => { const s = F.env.wb.getSheetByName(n); return s ? s.getDataRange().getValues() : []; };
const wk = d => 'WK-' + d;
function att(email, date, score, cid) { return { role: 'STUDENT', email, courseId: cid || ID.EA, className: 'MUNMAZHALAI - EA | FRI 6:30 - 8:00 PM EST | AY26-27', date, weekOf: wk(date), score }; }
function prep(o) {
  o = o || {};
  const F = setup(); const G = F.G;
  F.att = o.att || [];
  G.attReadRecordsForFilters_ = () => { if (F.attFails) throw new Error('attendance workbook unavailable'); return F.att.map(x => Object.assign({}, x)); };
  F.grades = o.grades || { w: [], s: [] };
  G.rosterEnabled_ = () => true;
  G.rosterDataset_ = () => ({ classrooms: [], teachers: [], students: [{ c: ID.EA, e: STU }, { c: ID.EA, e: OTHER }] });
  G.gradesForCourses_ = ids => { const o2 = {}; ids.forEach(id => { o2[id] = id === ID.EA ? F.grades : { w: [], s: [] }; }); return o2; };
  F.tok3 = { stu: F.tok(STU, 'student'), other: F.tok(OTHER, 'student') };
  F.get = (tk, opts) => { F.env.ctx.CacheService.getScriptCache().remove('td_v1_' + STU + '_2026-2027'); F.env.ctx.CacheService.getScriptCache().remove('td_v1_' + OTHER + '_2026-2027'); return J(G.getTamilThadam(tk || F.tok3.stu, opts || {})); };
  return F;
}
const SEPT = ['2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02', '2026-10-09'];

t('students (own) + r75 Admin / Super Admin (read-only look-up); HM, Teacher, VP, BOD, authorized and a forged session are refused on the server', () => {
  const F = prep({ att: [att(STU, SEPT[0], 100)] });
  for (const [e, r] of [['hm@aps.org', 'headmaster'], ['ayana_aps8123' + D, 'teacher'], [F.vpEmail, 'teacher'], ['bod@aps.org', 'vcfo_amchsts_bod'], ['x@aps.org', 'authorized']]) {
    assert.throws(() => F.G.getTamilThadam(F.tok(e, r), { studentEmail: STU }), /available to students \(and to APS Admin/, r + ' ' + e);
    assert.throws(() => F.G.searchTamilThadamStudents(F.tok(e, r), 'stu'), /Only Admin \/ Super Admin/, r);
  }
  assert.throws(() => F.G.getTamilThadam('forged', {}), /session|sign in|expired/i);
  assert.ok(F.get().points > 0);
});
t('a student only ever gets their OWN journey — apsid / email / student parameters are ignored', () => {
  const F = prep({ att: [att(STU, SEPT[0], 100), att(OTHER, SEPT[0], 100), att(OTHER, SEPT[1], 100)] });
  const a = F.get(F.tok3.stu, { apsid: 'APS6651', email: OTHER, student: OTHER, year: '2026-2027' });
  assert.strictEqual(a.student.apsId, 'APS6650'); assert.strictEqual(a.points, 35);
  assert.strictEqual(F.get(F.tok3.other).points, 70);
});
t('r75 Admin / Super Admin: search a student, view that journey read-only (logged); must pick a real student; no way to change anything', () => {
  const F = prep({ att: [att(STU, SEPT[0], 100), att(STU, SEPT[1], 100)] });
  for (const [e, r] of [['admin@aps.org', 'admin'], ['super@aps.org', 'superadmin']]) {
    const tk = F.tok(e, r);
    const found = J(F.G.searchTamilThadamStudents(tk, 'APS6650')); assert.strictEqual(found[0].email, STU);
    assert.ok(J(F.G.searchTamilThadamStudents(tk, 'sa')).length >= 2); assert.deepStrictEqual(J(F.G.searchTamilThadamStudents(tk, 's')), []);
    assert.throws(() => F.G.getTamilThadam(tk, {}), /Choose a student/);
    assert.throws(() => F.G.getTamilThadam(tk, { studentEmail: 'ayana_aps8123' + D }), /not a student/);
    const v = F.get(tk, { studentEmail: STU.toUpperCase() });
    assert.strictEqual(v.points, 70); assert.deepStrictEqual(v.viewer, { mode: 'admin', readOnly: true, studentEmail: STU });
    assert.strictEqual(F.get().points, 70, 'student sees the same'); assert.strictEqual(F.get().viewer, undefined);
  }
  const au = sheet(F, 'TAMIL_THADAM_VIEW_AUDIT'); assert.strictEqual(au.length - 1, 2);
  assert.deepStrictEqual(au.slice(1).map(r => [r[1], r[2], r[3], r[4]]), [['admin@aps.org', 'Admin', STU, 'APS6650'], ['super@aps.org', 'Super Admin', STU, 'APS6650']]);
});
t('Access Control can switch it off for students and for Admin (server refuses); optional (OFF, never widens) for HM / Teacher / BOD / authorized', () => {
  const F = prep();
  const row = J(F.G.getAccessControl(F.tok('admin@aps.org', 'admin'))).rows.find(r => r.key === 'tamilThadam');
  assert.deepStrictEqual(Object.keys(row.cells).filter(k => row.cells[k] !== 'L' && row.cells[k] !== 'O'), ['superadmin', 'admin', 'student']);
  assert.deepStrictEqual(Object.keys(row.cells).filter(k => row.cells[k] === 'O'), ['headmaster', 'teacher', 'vcfo_amchsts_bod', 'authorized'], 'r91: optional switches, OFF by default');
  assert.ok(['headmaster', 'teacher', 'vcfo_amchsts_bod', 'authorized'].every(k => row.values[k] === false));
  F.G.saveAccessControl(F.tok('admin@aps.org', 'admin'), [{ role: 'student', key: 'tamilThadam', visible: false }]);
  assert.throws(() => F.get(), /ACCESS_OFF|turned off/);
});
t('attendance → +10 per class joined, +25 for a whole-class week, streak milestones +25 (once), absent week ends a streak, a week with no class never does', () => {
  const dates = ['2026-08-21', '2026-08-28', '2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02'];
  const F = prep({ att: dates.map((d, i) => att(STU, d, i === 5 ? 0 : i % 2 ? 70 : 100)).concat([att(STU, '2026-10-02', 100, 'OTHERCLASS')]) });
  const r = F.get();
  // weeks: 6 joined (one absent), 4 full in ID.EA (i=0,2,4,6) + 1 other class full
  const classes = 6 + 1, full = 4 + 1;
  assert.strictEqual(r.points, classes * 10 + full * 25 + 25, 'one streak milestone (4 weeks)');
  assert.strictEqual(r.bestStreak, 5); assert.strictEqual(r.streak, 1, 'absent week ended the run; the next class starts a new one');
  F.att = dates.filter((d, i) => i !== 5).map(d => att(STU, d, 100)); // remove the absent week (no class) → streak continues
  const r2 = F.get(); assert.strictEqual(r2.streak, 6); assert.ok(/6 Weeks — Excellent Consistency/.test(r2.streakMessage));
  assert.strictEqual(r2.points, 6 * 10 + 6 * 25 + 25 + 25, 'milestones 4 and 6');
});
t('Google Classroom → homework +10 (+5 on time), quiz +10 (+10 for ≥80 %), project +20, exam +10; ATT_ ignored; other students ignored; homework %', () => {
  const W = (id, t, due, max) => ({ id, t, type: 'ASSIGNMENT', max: max || '10', ad: '2026-09-01', due: due || '2026-09-30 23:59:00' });
  const S = (w, e, st, late, g, ti) => ({ w, u: 'u', e, st, late: !!late, g: g === undefined ? '' : g, ti: ti || '2026-09-20 10:00:00', gd: '', rd: '' });
  const F = prep({ grades: {
    w: [W('h1', 'HW_1 Letters'), W('h2', 'HW_2 Words'), W('h3', 'HW_3 Future', '2099-01-01 00:00:00'), W('h4', 'HW_4 Missing'), W('q1', 'QUZ_1', '', '10'), W('q2', 'QUZ_2', '', '10'), W('p1', 'TRMST Project'), W('e1', 'MODEL_EXAM'), W('a1', 'ATT_1')],
    s: [S('h1', STU, 'TURNED_IN'), S('h2', STU, 'RETURNED', true), S('q1', STU, 'TURNED_IN', false, '9'), S('q2', STU, 'RETURNED', false, '5'), S('p1', STU, 'TURNED_IN'), S('e1', STU, 'RETURNED'), S('a1', STU, 'TURNED_IN'), S('h4', OTHER, 'TURNED_IN'), S('h4', STU, 'CREATED')] } });
  const r = F.get();
  assert.strictEqual(r.points, 10 + 5 + 10 + 10 + 10 + 10 + 20 + 10, '2 HW (1 on time), 2 quizzes (1 high), project, exam');
  const p = k => r.progress.find(x => x.key === k);
  assert.strictEqual(p('homework').value, '67%', '2 of 3 due homework (future one not counted yet)');
  assert.strictEqual(p('quizzes').value, '2'); assert.strictEqual(p('projects').value, '1'); assert.strictEqual(p('exams').value, '1');
  assert.ok(['speaking', 'reading', 'cultural'].every(k => p(k).comingSoon && p(k).value === null), 'never invented');
});
t('teacher appreciation certificate (SENT) → +20 and the Appreciation Star; failed / other students ignored', () => {
  const F = prep();
  const ss = F.env.wb; const sh = ss.getSheetByName('Appreciation_Certificate_Audit') || ss.insertSheet('Appreciation_Certificate_Audit');
  sh.getRange(1, 1, 1, 13).setValues([['Timestamp', 'Sender Email', 'Recipient ID', 'Recipient Name', 'Recipient Email', 'Course ID', 'Course Name', 'Letter Type', 'Result', 'File', 'Details', 'Mode', 'Role']]);
  sh.appendRow([new Date('2026-09-20T15:00:00Z'), 't@x', 'APS6650', 'S', STU, ID.EA, 'MUNMAZHALAI - EA | FRI', 'APS Appreciation Certificate', 'SENT', 'f', '', 'ROSTER', 'teacher']);
  sh.appendRow([new Date('2026-09-21T15:00:00Z'), 't@x', 'APS6650', 'S', STU, ID.EA, 'x', 'APS Appreciation Certificate', 'FAILED', 'f', '', 'ROSTER', 'teacher']);
  sh.appendRow([new Date('2026-09-22T15:00:00Z'), 't@x', 'APS6651', 'O', OTHER, ID.EA, 'x', 'APS Appreciation Certificate', 'SENT', 'f', '', 'ROSTER', 'teacher']);
  const r = F.get();
  assert.strictEqual(r.points, 20); assert.ok(r.badges.find(b => b.id === 'APPRECIATION_STAR').earned);
  assert.strictEqual(r.progress.find(x => x.key === 'appreciation').value, '1');
});
t('no duplicates: the same source record twice and repeated visits never add points twice; the ledger is append-only', () => {
  const F = prep({ att: [att(STU, SEPT[0], 100), att(STU, SEPT[0], 100), att(STU, SEPT[1], 70)] });
  const a = F.get(); const b = F.get(); const c = F.get();
  assert.strictEqual(a.points, 10 + 25 + 10); assert.strictEqual(c.points, a.points);
  const led = sheet(F, 'TAMIL_THADAM_ACTIVITY'); assert.strictEqual(led.length - 1, 3, 'three activities, recorded once');
  assert.ok(led.slice(1).every(r => r[9] === 'AWARDED' && r[2] === STU && r[3] === '2026-2027'));
  assert.strictEqual(sheet(F, 'TAMIL_THADAM_STUDENT').filter(r => r[0] === STU + '|2026-2027').length, 1);
  void b;
});
t('a corrected source record is VOIDED in the audit ledger (total recalculated, never shown as negative to the student)', () => {
  const F = prep({ att: [att(STU, SEPT[0], 100), att(STU, SEPT[1], 100)] });
  assert.strictEqual(F.get().points, 70);
  F.att = [att(STU, SEPT[0], 100)];
  const r = F.get(); assert.strictEqual(r.points, 35);
  const led = sheet(F, 'TAMIL_THADAM_ACTIVITY').slice(1);
  assert.deepStrictEqual(led.filter(x => x[9] === 'VOIDED').map(x => x[6]).sort((a, b) => a - b), [-25, -10]);
  const net = led.reduce((s, x) => s + Number(x[6]), 0); assert.strictEqual(net, 35, 'ledger re-adds to the total');
  assert.ok(JSON.stringify(r).indexOf('-10') < 0 && JSON.stringify(r).indexOf('-25') < 0);
});
t('badges: earned on the date the milestone was reached (deterministic), recorded once; Coming Soon badges never earned; new badge rows work', () => {
  const F = prep({ att: SEPT.map(d => att(STU, d, 100)) });
  const r = F.get();
  const b = id => r.badges.find(x => x.id === id);
  assert.strictEqual(b('TAMIL_EXPLORER').date, SEPT[0]); assert.strictEqual(b('LEARNING_STREAK').date, SEPT[3]); assert.strictEqual(b('PARTICIPATION_STAR').date, SEPT[4]);
  assert.ok(!b('READING_CHAMPION').earned && b('READING_CHAMPION').comingSoon && /coming soon/i.test(b('READING_CHAMPION').hint));
  assert.ok(!b('ATTENDANCE_STAR').earned && !b('ATTENDANCE_STAR').comingSoon && b('ATTENDANCE_STAR').hint, 'locked: encouraging hint only');
  F.get(); assert.strictEqual(sheet(F, 'TAMIL_THADAM_STUDENT_BADGES').length - 1, r.badgeCount, 'each earned badge recorded once');
  const bs = F.env.wb.getSheetByName('TAMIL_THADAM_BADGES'); assert.strictEqual(bs.getLastRow() - 1, 14, 'default badges seeded');
  bs.appendRow(['FIVE_CLASSES', 'Five Classes', 'ஐந்து வகுப்புகள்', 'Joined 5 classes.', '✋', 'Keep going!', 'classes', 5, 'TRUE', 0]);
  bs.appendRow(['BROKEN', 'X', 'X', 'X', 'X', 'X', 'notAMetric', 1, 'TRUE', 0]);
  F.env.ctx.CacheService.getScriptCache().remove('td_badges_v1');
  const r2 = F.get(); assert.ok(r2.badges.find(x => x.id === 'FIVE_CLASSES').earned); assert.ok(!r2.badges.find(x => x.id === 'BROKEN'));
});
t('levels: thresholds and progress to the next level', () => {
  const lv = p => J(prep().G.tdLevel_(p));
  assert.deepStrictEqual([lv(0).ta, lv(199).ta, lv(200).ta, lv(500).ta, lv(1240).ta, lv(2000).ta], ['தமிழ் தொடக்கம்', 'தமிழ் தொடக்கம்', 'தமிழ் வளர்ச்சி', 'தமிழ் திறமை', 'தமிழ் சாதனை', 'தமிழ் சிறப்பு']);
  assert.strictEqual(lv(1240).pct, 24); assert.strictEqual(lv(1240).next.min, 2000); assert.strictEqual(lv(2500).next, null);
});
t('academic years are separate: July activities belong to the previous year; an earlier year is shown from its saved snapshot', () => {
  const F = prep({ att: [att(STU, '2026-07-31', 100), att(STU, '2026-08-07', 100)] });
  const r = F.get(); assert.strictEqual(r.year, '2026-2027'); assert.strictEqual(r.points, 35, 'only the August class');
  const sh = F.env.wb.getSheetByName('TAMIL_THADAM_STUDENT');
  sh.appendRow([STU + '|2025-2026', 'APS6650', STU, 'S', '2025-2026', 60, 'x', 1, 0, 2, '2026-05-01', 'now', JSON.stringify([['CLASS|a', 'CLASS', '2026-04-10', 10, 'Joined'], ['FULL|a', 'FULL_CLASS', '2026-04-10', 25, 'Full'], ['FULL|b', 'FULL_CLASS', '2026-04-17', 25, 'Full']]), '{}']);
  const r2 = F.get(); assert.deepStrictEqual(r2.years, ['2026-2027', '2025-2026']);
  F.env.ctx.CacheService.getScriptCache().remove('td_v1_' + STU + '_2025-2026');
  const old = J(F.G.getTamilThadam(F.tok3.stu, { year: '2025-2026' })); assert.strictEqual(old.points, 60); assert.strictEqual(old.current, false);
  assert.strictEqual(F.get().points, 35, 'current year unchanged');
});
t('empty state: positive welcome, no fabricated numbers; a source that fails shows Coming Soon instead of a number', () => {
  const F = prep();
  const r = F.get(); assert.ok(r.empty); assert.strictEqual(r.points, 0); assert.strictEqual(r.badgeCount, 0); assert.ok(/first achievement is waiting/.test(r.message));
  F.attFails = true; F.att = [att(STU, SEPT[0], 100)];
  const r2 = F.get(); assert.ok(r2.progress.find(x => x.key === 'attendance').comingSoon);
  assert.ok(!F.get().progress.some(x => x.value === '0'), 'a zero count is never shown');
});
t('positive language only: no ranking, comparison or negative labels anywhere in what the student receives', () => {
  const F = prep({ att: [att(STU, SEPT[0], 100), att(STU, SEPT[1], 0), att(STU, SEPT[2], 50)] });
  const txt = JSON.stringify(F.get());
  ['Low ', 'Poor', 'Failed', 'Behind', 'Below', 'Rank', 'Missing', 'Absent', 'At Risk', 'Worst', 'Weak', 'Compared'].forEach(w => assert.ok(txt.indexOf(w) < 0, 'contains ' + w));
  assert.ok(!/leader|top 10|#\d/i.test(txt));
});
t('end-of-year certificate only after the year ends (or when the school opens it), with a stable certificate number; not for an empty journey', () => {
  const F = prep({ att: [att(STU, SEPT[0], 100)] });
  assert.strictEqual(F.get().certificate, null);
  F.env.ctx.PropertiesService.getScriptProperties().setProperty('TAMIL_THADAM_CERTIFICATE_YEARS', '2026-2027');
  const c = F.get().certificate; assert.ok(/^TT-2627-APS6650-[0-9A-F]{6}$/.test(c.number), c.number); assert.strictEqual(c.points, 35);
  assert.strictEqual(F.get().certificate.number, c.number, 'stable');
  assert.strictEqual(F.get(F.tok3.other).certificate, null, 'nothing to certify yet');
});
t('nothing about Tamil Thadam reaches non-students: dashboard payloads carry no Tamil Thadam data; the separate workbook is created once', () => {
  const F = prep({ att: [att(STU, SEPT[0], 100)] });
  F.get();
  for (const [e, r] of [['admin@aps.org', 'admin'], ['ayana_aps8123' + D, 'teacher'], ['hm@aps.org', 'headmaster']]) assert.ok(!/thadam|TAMIL_THADAM|"points":/i.test(JSON.stringify(J(F.G.getDashboardData(F.tok(e, r))))), r);
  assert.strictEqual(F.env.ctx.PropertiesService.getScriptProperties().getProperty('TAMIL_THADAM_SPREADSHEET_ID'), 'mock-wb-id');
  F.get(); assert.strictEqual(F.env.stats.created, 1);
  const fns = Object.keys(F.G).filter(k => /^[a-z]\w*$/.test(k) && /tamil|thadam/i.test(k) && typeof F.G[k] === 'function');
  assert.deepStrictEqual(fns.sort(), ['getTamilThadam', 'searchTamilThadamStudents'], 'read-only endpoints only — no way to add / edit / remove points or badges');
});
console.log(process.exitCode ? 'SOME TAMIL THADAM TESTS FAILED' : 'ALL ' + pass + ' TAMIL THADAM TESTS PASSED');

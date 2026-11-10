// r58: Temporary Class Coverage — server tests A–I, L (node test/coverage.js)
const assert = require('assert');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const J = x => JSON.parse(JSON.stringify(x));
const { setup, ID, FRI, FRI2, nextDow, D } = require('./coveragefixture');
const apply = (F, tk, extra) => F.G.applyCoverage(tk, Object.assign({ originalId: ID.EA, destinationId: ID.ED, date: FRI, confirmed: true, requestId: 'R' + Math.random() }, extra || {}));

t('A: eligible matching — only same Nilai / day / start / end; Meet verification states', () => {
  const F = setup(); const p = J(F.G.getCoveragePlan(F.tok2.admin, { originalId: ID.EA, date: FRI }));
  assert.deepStrictEqual(p.errors, []);
  const ids = p.destinations.map(d => d.id).sort();
  assert.deepStrictEqual(ids, [ID.ED, ID.EB, ID.EC].sort(), 'no SAT, no NILAI 2, no 7:30 class, not itself');
  const by = Object.fromEntries(p.destinations.map(d => [d.id, d]));
  assert.strictEqual(by[ID.ED].verified, 'YES'); assert.strictEqual(by[ID.ED].meetSource, 'CLASSROOM'); assert.strictEqual(by[ID.ED].selectable, true);
  assert.strictEqual(by[ID.EB].verified, 'CONFIRM', 'class-stream link needs a tick'); assert.strictEqual(by[ID.EC].selectable, false); assert.ok(/No Google Meet/.test(by[ID.EC].reason));
  assert.ok(/EDT|EST/.test(p.session.timeLabel) && /6:30 PM – 8:00 PM Eastern Time/.test(p.session.timeLabel));
  const boot = J(F.G.getCoverageBootstrap(F.tok2.admin));
  const ea = boot.originals.find(o => o.id === ID.EA); assert.strictEqual(ea.teacher, 'Ayana Nivedida Parthiban'); assert.ok(ea.dates.length >= 4 && ea.dates.every(d => new Date(d + 'T12:00:00Z').getUTCDay() === 5));
});
t('B: invalid destination / date rejected on the server', () => {
  const F = setup();
  [ID.N2, ID.EF_SAT, ID.EE_7, ID.EA, ID.EC].forEach(d => assert.throws(() => apply(F, F.tok2.admin, { destinationId: d }), /same Nilai|No Google Meet|Pick|must/, d));
  const sat = nextDow(6, 1); assert.throws(() => apply(F, F.tok2.admin, { date: sat }), /is not a Friday/);
  assert.throws(() => apply(F, F.tok2.admin, { date: '2026-01-02' }), /already ended/);
  assert.throws(() => apply(F, F.tok2.admin, { date: 'bad' }), /valid session date/);
  assert.throws(() => apply(F, F.tok2.admin, { confirmed: false }), /confirmation/);
  assert.strictEqual(F.ann.created, 0); assert.strictEqual(F.G.tccRows_().length, 0);
  assert.throws(() => apply(F, F.tok2.admin, { destinationId: ID.EB }), /tick the box/);
  assert.strictEqual(J(apply(F, F.tok2.admin, { destinationId: ID.EB, confirmStreamLink: true })).record.announcement, 'POSTED', 'stream link accepted once confirmed');
});
t('C: authorization — Admin / HM / class VP (own classes only); teacher, student, BOD refused on every endpoint', () => {
  const F = setup(); const G = F.G;
  assert.ok(G.getCoverageBootstrap(F.tok2.hm).originals.length >= 7);
  const vpBoot = J(G.getCoverageBootstrap(F.tok2.vp)); assert.deepStrictEqual(vpBoot.originals.map(o => o.id), [ID.EA], 'VP sees only the class they support');
  assert.throws(() => G.getCoveragePlan(F.tok2.vp, { originalId: ID.EB, date: FRI }) && (() => { throw new Error(J(G.getCoveragePlan(F.tok2.vp, { originalId: ID.EB, date: FRI })).errors[0]); })(), /VP \/ HM/);
  [F.tok2.teacher, F.tok2.student, F.tok2.bod].forEach(tk => {
    assert.throws(() => G.getCoverageBootstrap(tk), /Only Admin|cannot|ACCESS_OFF/);
    assert.throws(() => G.getCoveragePlan(tk, { originalId: ID.EA, date: FRI }), /Only Admin|ACCESS_OFF/);
    assert.throws(() => apply(F, tk), /Only Admin|ACCESS_OFF|Read-only/);
    assert.throws(() => G.retryCoverage(tk, 'TCC-X'), /Only Admin|ACCESS_OFF|Read-only/);
  });
  const ses = J(G.establishSessionForVerifiedClaims_({ email: F.vpEmail })); assert.strictEqual(ses.user.coverageAccess, true);
  assert.strictEqual(J(G.establishSessionForVerifiedClaims_({ email: 'kavitha_aps8130' + D })).user.coverageAccess, false);
  G.saveAccessControl(F.tok('admin@aps.org', 'admin'), [{ role: 'headmaster', key: 'classes.coverage', visible: false }]);
  assert.throws(() => G.getCoverageBootstrap(F.tok2.hm), /ACCESS_OFF/);
});
t('D + E: one announcement in the ORIGINAL class only; student BCC + staff email from attendance@, admin@ CC; record + cleanup trigger', () => {
  const F = setup(); const G = F.G; const mails = F.env.stats.mails;
  const r = J(apply(F, F.tok2.vp));
  assert.strictEqual(r.record.announcement, 'POSTED'); assert.strictEqual(r.record.studentEmail, 'SENT'); assert.strictEqual(r.record.staffEmail, 'SENT');
  assert.strictEqual(F.ann.created, 1); assert.strictEqual((F.ann.store[ID.ED] || []).length, 0, 'destination untouched');
  const a = F.ann.store[ID.EA].find(x => x.id !== 'OTHER1');
  const dl = J(G.getCoveragePlan(F.tok2.admin, { originalId: ID.EB, date: FRI })).session.dateLabel;
  [ '📢🔀 Class Merge Notice 🔀📢 –  ' + dl, 'Dear Student,', 'Your teacher, Ayana Nivedida Parthiban, is not available', 'https://meet.google.com/abc-defg-hij', 'MUNMAZHALAI - ED | FRI 6:30 - 8:00 PM EST | AY26-27',
    'from 6:30 PM to 8:00 PM Eastern Time', 'submit your homework and attendance in your original Google Classroom', 'APS Tech Support Team'].forEach(x => assert.ok(a.text.includes(x), x));
  assert.ok(a.text.indexOf('📢🔀 Class Merge Notice') === 0); // r89: the user's own wording in Code.gs
  assert.strictEqual(mails.length, 2);
  const stu = mails.find(m => /BCC|^$/.test('') && m.to === 'attendance@avvaiyarpadasalai.org');
  assert.ok(stu, 'student email addressed to attendance@ itself'); assert.ok(/<attendance@avvaiyarpadasalai\.org>$/.test(stu.from));
  assert.strictEqual(stu.cc, 'admin@avvaiyarpadasalai.org');
  assert.ok(!/sa0_aps/.test(stu.to + stu.cc), 'no student address visible in To / Cc');
  assert.strictEqual(stu.subject, '[APS] Temporary Class Coverage – MUNMAZHALAI – ' + dl);
  assert.ok(/Join Merged Class – Google Meet/.test(stu.htmlBody) && /Dear Student/.test(stu.htmlBody));
  const staff = mails.find(m => m !== stu);
  const to = staff.to.split(',');
  ['ayana_aps8123' + D, 'kavitha_aps8130' + D, F.vpEmail, 'karuna_aps774' + D].forEach(e => assert.ok(to.includes(e), e));
  assert.ok(!to.includes('senthil_aps8131' + D) && !to.includes('other_aps8140' + D), 'no unrelated teacher');
  assert.strictEqual(staff.cc, 'admin@avvaiyarpadasalai.org'); assert.ok(/Dear Teachers and Leaders/.test(staff.htmlBody));
  assert.strictEqual(F.G.attMailBudget_().used, 1 + 1 + 14 + 4 + 1, 'BCC recipients counted against the attendance@ limit');
  const rows = G.tccRows_(); assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].Announcement_ID, a.id); assert.strictEqual(rows[0].Cleanup_Status, 'CLEANUP_PENDING'); assert.ok(/America\/New_York \((EDT|EST)\)/.test(rows[0].Timezone));
  assert.ok(!/sa0_aps/.test(JSON.stringify(rows[0])), 'no student addresses stored');
  assert.ok(F.env.stats.triggers.some(x => x.fn === 'apsCoverageCleanup'));
});
t('F: duplicate + double-click — same request id returns the first; a second request for the same class/date is refused', () => {
  const F = setup(); const G = F.G;
  const r1 = J(apply(F, F.tok2.admin, { requestId: 'RQ1' }));
  const r2 = J(apply(F, F.tok2.admin, { requestId: 'RQ1' })); assert.strictEqual(r2.duplicate, true); assert.strictEqual(r2.record.mergeId, r1.record.mergeId);
  assert.throws(() => apply(F, F.tok2.hm, { requestId: 'RQ2' }), /already arranged/);
  assert.throws(() => apply(F, F.tok2.admin, { originalId: ID.ED, destinationId: ID.EA, requestId: 'RQ3' }), /already hosting|own teacher is unavailable/);
  assert.strictEqual(F.ann.created, 1); assert.strictEqual(G.tccRows_().length, 1);
  // a different date is fine
  assert.strictEqual(J(apply(F, F.tok2.admin, { date: FRI2, requestId: 'RQ4' })).record.announcement, 'POSTED');
});
t('G: nothing permanent changes (rosters, names, teachers, Meet mappings)', () => {
  const F = setup(); const G = F.G; const before = J(G.readAllCoursesFromCache_().map(c => [c.id, c.name, (c.teachers || []).length, (c.students || []).length, c.meetLinkInClassroom]));
  const mapBefore = J(F.env.wb.getSheetByName('Course_Meet_Link_Map').data);
  apply(F, F.tok2.admin);
  assert.deepStrictEqual(J(G.readAllCoursesFromCache_().map(c => [c.id, c.name, (c.teachers || []).length, (c.students || []).length, c.meetLinkInClassroom])), before);
  assert.deepStrictEqual(J(F.env.wb.getSheetByName('Course_Meet_Link_Map').data), mapBefore);
});
t('H: cleanup deletes ONLY this announcement after end + grace; idempotent; failures retried then flagged for review', () => {
  const F = setup(); const G = F.G;
  const rec = J(apply(F, F.tok2.admin)).record; const row = () => G.tccRows_()[0];
  const end = new Date(row().Session_End_ISO).getTime();
  assert.strictEqual(G.tccRunCleanup_(new Date(end + 10 * 60000)).pending, 1, 'still inside the 30-min grace'); assert.strictEqual(F.ann.removed, 0);
  F.ann.failRemove = 'Backend Error';
  G.tccRunCleanup_(new Date(end + 31 * 60000)); assert.strictEqual(row().Cleanup_Status, 'CLEANUP_FAILED');
  F.ann.failRemove = null;
  const out = G.tccRunCleanup_(new Date(end + 61 * 60000)); assert.strictEqual(out.deleted, 1);
  assert.strictEqual(row().Cleanup_Status, 'CLEANUP_COMPLETED'); assert.strictEqual(row().Announcement_Status, 'DELETED');
  assert.deepStrictEqual(F.ann.store[ID.EA].map(a => a.id), ['OTHER1'], 'unrelated announcement kept');
  G.tccRunCleanup_(new Date(end + 120 * 60000)); assert.strictEqual(F.ann.removed, 1, 'never deleted twice');
  assert.ok(!F.env.stats.triggers.some(x => x.fn === 'apsCoverageCleanup'), 'trigger removed when nothing is pending');
  // already removed by a teacher → completed, not retried
  const F2 = setup(); apply(F2, F2.tok2.admin); const r2 = F2.G.tccRows_()[0]; F2.ann.store[ID.EA] = F2.ann.store[ID.EA].filter(a => a.id === 'OTHER1');
  F2.G.tccRunCleanup_(new Date(new Date(r2.Session_End_ISO).getTime() + 3600000)); assert.strictEqual(F2.G.tccRows_()[0].Cleanup_Status, 'CLEANUP_COMPLETED');
  // permission error → requires review
  const F3 = setup(); apply(F3, F3.tok2.admin); F3.ann.failRemove = 'The caller does not have permission (403)';
  F3.G.tccRunCleanup_(new Date(new Date(F3.G.tccRows_()[0].Session_End_ISO).getTime() + 3600000)); assert.strictEqual(F3.G.tccRows_()[0].Cleanup_Status, 'CLEANUP_REQUIRES_REVIEW');
  assert.throws(() => F.G.apsCoverageCleanup({ triggerUid: 'forged' }), /Access denied/);
});
t('I: email failure after the announcement — retry sends the email and never posts a second announcement; announcement failure stops emails', () => {
  const F = setup({ props: { ATTENDANCE_REFRESH_TOKEN: '' } }); const G = F.G;
  F.env.ctx.MailApp.sendEmail = () => {};
  const r = J(apply(F, F.tok2.admin));
  assert.strictEqual(r.record.announcement, 'POSTED'); assert.strictEqual(r.record.studentEmail, 'FAILED'); assert.strictEqual(r.record.staffEmail, 'FAILED');
  assert.ok(/some emails were not sent/.test(r.message)); assert.strictEqual(r.record.retryLabel, 'Retry email');
  F.env.props.ATTENDANCE_REFRESH_TOKEN = 'att-refresh';
  const r2 = J(G.retryCoverage(F.tok2.admin, r.record.mergeId));
  assert.strictEqual(r2.record.studentEmail, 'SENT'); assert.strictEqual(r2.record.staffEmail, 'SENT'); assert.strictEqual(F.ann.created, 1); assert.strictEqual(r2.record.retries, 1);
  const F2 = setup(); F2.ann.failCreate = 'Service invoked too many times';
  const a = J(apply(F2, F2.tok2.admin)); assert.strictEqual(a.record.announcement, 'FAILED'); assert.strictEqual(a.record.studentEmail, 'NOT_SENT'); assert.strictEqual(F2.env.stats.mails.length, 0);
  F2.ann.failCreate = null; const b = J(F2.G.retryCoverage(F2.tok2.admin, a.record.mergeId));
  assert.strictEqual(b.record.announcement, 'POSTED'); assert.strictEqual(b.record.studentEmail, 'SENT'); assert.strictEqual(F2.ann.created, 1);
  // a crash after Classroom accepted the post: the retry finds and reuses that announcement
  const F3 = setup(); const G3 = F3.G; const origWrite = G3.tccWrite_; let n = 0;
  F3.env.ctx.tccWrite_ = function (rec) { n++; if (rec.Announcement_Status === 'POSTED' && n === 2) { rec.Announcement_Status = 'FAILED'; rec.Last_Error = 'simulated'; } return origWrite(rec); };
  const c = J(apply(F3, F3.tok2.admin)); F3.env.ctx.tccWrite_ = origWrite;
  if (c.record.announcement === 'FAILED') { J(G3.retryCoverage(F3.tok2.admin, c.record.mergeId)); }
  assert.strictEqual(F3.ann.created, 1, 'no duplicate announcement');
});
t('L: Eastern time — EST in winter, EDT in summer, DST weeks; weekday validated', () => {
  const F = setup(); const G = F.G;
  const sched = J(G.tccSchedule_({ name: 'MUNMAZHALAI - EA | FRI 6:30 - 8:00 PM EST | AY26-27' }));
  const w = J(G.tccSession_(sched, '2027-01-08', null)); assert.strictEqual(w.tz, 'EST'); assert.strictEqual(w.end, '2027-01-09T01:00:00.000Z');
  const s = J(G.tccSession_(sched, '2026-10-30', null)); assert.strictEqual(s.tz, 'EDT'); assert.strictEqual(s.end, '2026-10-31T00:00:00.000Z');
  const after = J(G.tccSession_(sched, '2026-11-06', null)); assert.strictEqual(after.tz, 'EST'); assert.strictEqual(after.start, '2026-11-06T23:30:00.000Z', 'first Friday after DST ends');
  const spring = J(G.tccSession_(sched, '2027-03-19', null)); assert.strictEqual(spring.tz, 'EDT');
  assert.strictEqual(w.dateLabel, 'Friday, January 8, 2027');
  assert.ok(/is not a Friday/.test(J(G.tccSession_(sched, '2027-01-09', null)).reason));
  ['MUNMAZHALAI - EA | FRI 6:30 - 8:00 PM EST | AY26-27', 'MAZHALAI - CB | FRI 7:30 - 9:00 PM EST | AY26-27', 'NILAI 8 - AB | SAT 12:00 - 1:30 PM EST | AY26-27', 'THULIR - AA | SAT 12:00 - 1:30 PM EST | AY26-27'].forEach(n => assert.ok(G.tccSchedule_({ name: n }).ok, n));
  ['MUNMAZHALAI - EA | AY26-27', 'Grade 10 for Testing', 'NILAI 3 - EF | FRI 6:30 - 8:00 PM EST | AY25-26'].forEach(n => assert.strictEqual(G.tccSchedule_({ name: n }).ok, false, n));
});
t('attendance credit + class card banner on the session day', () => {
  const F = setup(); const G = F.G;
  apply(F, F.tok2.admin);
  const map = J(G.tccCoverageMap_()); const k = ID.EA + '|' + FRI; assert.ok(map[k] && map[k].destId === ID.ED);
  // attendance: EA students who joined ED's Meet code are credited to EA
  const course = G.readAllCoursesFromCache_().find(c => c.id === ID.EA), dest = G.readAllCoursesFromCache_().find(c => c.id === ID.ED);
  const win = { startDate: new Date(map[k].startIso), endDate: new Date(map[k].endIso) };
  const s0 = course.students[0].email.toLowerCase(); const st = win.startDate.getTime();
  const audit = {}; audit[s0] = [{ code: 'abcdefghij', start: st + 60000, end: st + 80 * 60000 }];
  const a = G.tccAttributeMergedSession_(course, dest, map[k], win, audit, {});
  assert.ok(a && a.source === 'MEET_AUDIT_COVERAGE_MERGE' && a.sessionsByEmail[s0].length === 1);
  // banner (pretend today is the session day)
  const c = [{ id: ID.EA }, { id: ID.ED }];
  const realFmt = F.env.ctx.Utilities.formatDate; F.env.ctx.Utilities.formatDate = (d, tz, p) => p === 'yyyy-MM-dd' ? FRI : realFmt(d, tz, p);
  G.tccStampToday_(c); F.env.ctx.Utilities.formatDate = realFmt;
  assert.strictEqual(c[0].coverageToday.role, 'original'); assert.strictEqual(c[0].coverageToday.meetUrl, 'https://meet.google.com/abc-defg-hij');
  assert.strictEqual(c[1].coverageToday.role, 'destination');
});
console.log(pass + ' passed');

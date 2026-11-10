// r64: Classes → Google Classroom card "Status" box — server tests (node test/livebox.js)
const assert = require('assert');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const J = x => JSON.parse(JSON.stringify(x));
const { setup, ID, D } = require('./coveragefixture');
// Stub the class-status state machine + Meet presence so tests do not depend on the clock.
function withState(F, state) {
  const G = F.G; F.calls = 0;
  const orig = G.applyClassStatus_;
  G.applyClassStatus_ = function (courses) {
    F.calls++; orig(courses);
    courses.forEach(c => {
      const s = state[String(c.id)]; if (!s) { c.classStatus = 'scheduled'; c.classStatusLabel = 'Scheduled'; c.classMeetDetail = null; return; }
      c.classStatus = s.code; c.classStatusLabel = { started: 'Class Started', yet_to_start: 'Yet to Start', completed: 'Class Ended', scheduled: 'Scheduled', cancelled: 'Cancelled' }[s.code];
      c.classMeetDetail = s.detail ? { text: s.detail, statusUnknown: !!s.unknown } : null;
      (c.teachers || []).forEach(x => { x.inMeet = !!s.teacher && x.email === s.teacher; });
      (c.students || []).forEach((x, i) => { x.inMeet = i < (s.students || 0); });
    });
    return courses;
  };
  G.CacheService.getScriptCache().remove('aps_cls_live_box_v1');
}
const TEACH = 'ayana_aps8123' + D;
const STATE = {
  [ID.EA]: { code: 'started', teacher: TEACH, students: 5, detail: 'Teacher joined 12:00 PM · 5 students joined' },
  [ID.EB]: { code: 'yet_to_start', students: 5, detail: '5 students in Meet — waiting for the teacher' },
  [ID.EC]: { code: 'yet_to_start', students: 0, detail: 'Google Meet not started yet' },
  [ID.ED]: { code: 'completed', students: 0, detail: 'Class ended around 8:00 PM' },
  [ID.N2]: { code: 'cancelled' }
};

t('box only during class time (started / yet_to_start); null before, after, cancelled', () => {
  const F = setup(); withState(F, STATE);
  const m = J(F.G.apsClassLiveBoxesForViewer_({ email: 'admin@aps.org', role: 'admin' }));
  assert.deepStrictEqual(Object.keys(m).sort(), [ID.EA, ID.EB, ID.EC].sort());
  assert.strictEqual(F.G.apsClassLiveBox_({ classStatus: 'scheduled' }), null);
  assert.strictEqual(F.G.apsClassLiveBox_(null), null);
});

t('same two lines as GCM - Preview; green when the teacher is in the Meet, red otherwise; "Meet not started" flag', () => {
  const F = setup(); withState(F, STATE);
  const m = J(F.G.apsClassLiveBoxesForViewer_({ email: 'admin@aps.org', role: 'admin' }));
  assert.deepStrictEqual(m[ID.EA], { live: true, tone: 'ok', teacherInMeet: true, notStarted: false, unknown: false, line1: '👩‍🏫 Teacher in Meet · 👥 5 of 14 students', line2: 'Class Started — Teacher joined 12:00 PM · 5 students joined' });
  assert.deepStrictEqual(m[ID.EB], { live: false, tone: 'alert', teacherInMeet: false, notStarted: false, unknown: false, line1: '👩‍🏫 Teacher not in Meet · 👥 5 of 15 students', line2: 'Yet to Start — 5 students in Meet — waiting for the teacher' });
  assert.strictEqual(m[ID.EC].tone, 'alert'); assert.strictEqual(m[ID.EC].notStarted, true); assert.strictEqual(m[ID.EC].line2, 'Yet to Start — Google Meet not started yet');
  // GCM - Preview builds the same text from the same fields (gcmCard_): compare against its items
  withState(F, STATE);
  const g = J(F.G.getMeetPreviewData(F.tok('admin@aps.org', 'admin'))).items;
  [ID.EA, ID.EB, ID.EC].forEach(id => {
    const x = g.find(i => i.id === id);
    const l1 = (x.teacherInMeet ? '👩‍🏫 Teacher in Meet' : '👩‍🏫 Teacher not in Meet') + ' · 👥 ' + x.studentsInMeet + ' of ' + x.studentCount + ' students';
    const l2 = (x.classStatusLabel ? x.classStatusLabel + ' — ' : '') + x.meetDetail;
    assert.strictEqual(m[id].line1, l1, 'line 1 = GCM ' + id); assert.strictEqual(m[id].line2, l2, 'line 2 = GCM ' + id);
  });
  // no Meet detail yet (snapshot unavailable) → just the status label
  assert.strictEqual(F.G.apsClassLiveBox_({ classStatus: 'yet_to_start', classStatusLabel: 'Yet to Start', teachers: [], students: [{}, {}] }).line2, 'Yet to Start');
});

t('r65: live presence cannot be seen → grey "not known", never a false red', () => {
  const F = setup(); withState(F, { [ID.EA]: { code: 'yet_to_start', students: 0, unknown: true, detail: 'Live Google Meet status not available for this class' } });
  const b = J(F.G.apsClassLiveBoxesForViewer_({ email: 'admin@aps.org', role: 'admin' }))[ID.EA];
  assert.deepStrictEqual(b, { live: false, tone: 'unknown', teacherInMeet: false, notStarted: false, unknown: true,
    line1: '👩‍🏫 Teacher: not known · 👥 Students: not known (14 on roster)', line2: 'Yet to Start — Live Google Meet status not available for this class' });
  // GCM - Preview shows the same "not known" line
  withState(F, { [ID.EA]: { code: 'yet_to_start', students: 0, unknown: true, detail: 'Live Google Meet status not available for this class' } });
  const x = J(F.G.getMeetPreviewData(F.tok('admin@aps.org', 'admin'))).items.find(i => i.id === ID.EA);
  assert.strictEqual(x.meetUnknown, true); assert.strictEqual(x.meetDetail, 'Live Google Meet status not available for this class');
  // evidence wins over "unknown": a student seen in the audit log keeps the red waiting state
  withState(F, { [ID.EA]: { code: 'yet_to_start', students: 2, unknown: true, detail: 'x' } });
  assert.strictEqual(J(F.G.apsClassLiveBoxesForViewer_({ email: 'admin@aps.org', role: 'admin' }))[ID.EA].tone, 'alert');
});

t('server-side viewer filter: student / teacher see only their own classes; admin, HM, BOD see all', () => {
  const F = setup(); withState(F, STATE);
  const G = F.G;
  const ids = (email, role) => Object.keys(J(G.apsClassLiveBoxesForViewer_({ email, role }))).sort();
  assert.deepStrictEqual(ids('sa0_aps6650' + D, 'student'), [ID.EA]);
  assert.deepStrictEqual(ids('senthil_aps8131' + D, 'teacher'), [ID.EB]);
  assert.deepStrictEqual(ids('nobody_aps1@avvaiyarpadasalai.org', 'student'), []);
  ['admin', 'headmaster', 'vcfo_amchsts_bod', 'superadmin'].forEach(r => assert.deepStrictEqual(ids('x@aps.org', r), [ID.EA, ID.EB, ID.EC].sort(), r));
});

t('45-second poll: getRealtimeStatusSnapshot carries liveStatus; shared 30 s cache; an error never breaks the snapshot', () => {
  const F = setup(); withState(F, STATE);
  const G = F.G, tk = F.tok('sa0_aps6650' + D, 'student');
  const s1 = J(G.getRealtimeStatusSnapshot(tk));
  assert.deepStrictEqual(Object.keys(s1.liveStatus), [ID.EA]); assert.ok(s1.live && s1.serverTime, 'existing fields unchanged');
  const n = F.calls; G.getRealtimeStatusSnapshot(F.tok('admin@aps.org', 'admin')); G.getRealtimeStatusSnapshot(tk);
  assert.strictEqual(F.calls, n, 'served from the shared cache (no recompute per tab)');
  G.CacheService.getScriptCache().remove('aps_cls_live_box_v1');
  STATE[ID.EA].teacher = null; withState(F, STATE);
  assert.strictEqual(J(G.getRealtimeStatusSnapshot(tk)).liveStatus[ID.EA].tone, 'alert', 'teacher left → red on the next poll');
  STATE[ID.EA].teacher = TEACH;
  G.applyClassStatus_ = () => { throw new Error('boom'); }; G.CacheService.getScriptCache().remove('aps_cls_live_box_v1');
  const s3 = J(G.getRealtimeStatusSnapshot(tk));
  assert.strictEqual(s3.liveStatus, null); assert.ok(s3.live && s3.serverTime);
  assert.throws(() => G.getRealtimeStatusSnapshot('bad-token'));
});

t('getDashboardData: every visible course carries liveBox (null outside class time)', () => {
  const F = setup(); withState(F, STATE);
  const d = J(F.G.getDashboardData(F.tok('admin@aps.org', 'admin')));
  const by = Object.fromEntries(d.courses.map(c => [String(c.id), c]));
  assert.strictEqual(by[ID.EA].liveBox.tone, 'ok'); assert.strictEqual(by[ID.EB].liveBox.tone, 'alert'); assert.strictEqual(by[ID.ED].liveBox, null); assert.strictEqual(by[ID.N2].liveBox, null);
  const s = J(F.G.getDashboardData(F.tok('sa0_aps6650' + D, 'student')));
  assert.ok(s.courses.every(c => String(c.id) === ID.EA || c.liveBox === null) && s.courses.some(c => String(c.id) === ID.EA && c.liveBox));
});

console.log(pass + ' passed');

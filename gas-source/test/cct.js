// r70: Classes → Class Coverage Tracking — server tests (node test/cct.js)
const assert = require('assert');
const { setup, ID, D } = require('./coveragefixture');
const J = x => JSON.parse(JSON.stringify(x));
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const rowsOf = (F, name) => { const sh = F.env.wb.getSheetByName(name); return sh ? sh.getDataRange().getValues() : []; };

t('Admin / Super Admin / HM see every active class; class VP sees only the classes they support; teacher, student, BOD refused', () => {
  const F = setup(); const G = F.G;
  const all = J(G.getClassCoverageTracking(F.tok2.admin, {}));
  assert.ok(all.rows.length > 5 && all.scope === 'all' && all.canEdit);
  assert.deepStrictEqual(J(G.getClassCoverageTracking(F.tok('super@aps.org', 'superadmin'), {})).rows.length, all.rows.length);
  assert.deepStrictEqual(J(G.getClassCoverageTracking(F.tok2.hm, {})).rows.length, all.rows.length);
  const vp = J(G.getClassCoverageTracking(F.tok2.vp, {}));
  assert.deepStrictEqual(vp.rows.map(r => r.courseId), [ID.EA]); assert.strictEqual(vp.scope, 'supported');
  for (const k of ['teacher', 'student', 'bod']) {
    assert.throws(() => G.getClassCoverageTracking(F.tok2[k], {}), /Only Admin, Super Admin, Head Master or a class VP|ACCESS_OFF/, k + ' read');
    assert.throws(() => G.saveClassCoverage(F.tok2[k], { weekId: all.weekId, courseId: ID.EA, status: 'HM_COVERED', action: 'HM covered the class.' }), /Only Admin|ACCESS_OFF|Read-only/, k + ' write');
    assert.throws(() => G.getClassCoverageHistory(F.tok2[k], { weekId: all.weekId, courseId: ID.EA }), /Only Admin|ACCESS_OFF/, k + ' history');
  }
  assert.ok(all.statuses.map(s => s.label).join('|') === 'Pending Coverage|Substitute Assigned|HM Covered|VP Covered|Parent Volunteer Assigned|On-Call Teacher Assigned|Original Teacher Covered|Class Rescheduled|Class Cancelled|Class Not Covered');
  assert.strictEqual(all.weeks.filter(w => w.current).length, 1);
});
t('VP cannot write another class; week outside the list, unknown status, missing / too-long action refused', () => {
  const F = setup(); const G = F.G; const wk = J(G.getClassCoverageTracking(F.tok2.admin, {})).weekId;
  assert.throws(() => G.saveClassCoverage(F.tok2.vp, { weekId: wk, courseId: ID.EB, status: 'VP_COVERED', action: 'VP covered the class.' }), /only for classes you are responsible for/);
  assert.throws(() => G.saveClassCoverage(F.tok2.admin, { weekId: 'WK-2020-01-03', courseId: ID.EA, status: 'VP_COVERED', action: 'x x x' }), /Pick a class week/);
  assert.throws(() => G.saveClassCoverage(F.tok2.admin, { weekId: wk, courseId: ID.EA, status: 'SOMETHING', action: 'abc' }), /Choose a Coverage Status/);
  assert.throws(() => G.saveClassCoverage(F.tok2.admin, { weekId: wk, courseId: ID.EA, status: 'SUBSTITUTE_ASSIGNED', action: '' }), /Describe the action/);
  assert.throws(() => G.saveClassCoverage(F.tok2.admin, { weekId: wk, courseId: ID.EA, status: 'SUBSTITUTE_ASSIGNED', action: 'x'.repeat(301) }), /300 characters/);
  assert.throws(() => G.saveClassCoverage(F.tok2.admin, { weekId: wk, courseId: ID.EA, status: '', action: 'something' }), /Choose a Coverage Status/);
  assert.ok(J(G.saveClassCoverage(F.tok2.admin, { weekId: wk, courseId: ID.EA, status: 'PENDING_COVERAGE', action: '' })).ok, 'Pending needs no action text');
  assert.ok(J(G.saveClassCoverage(F.tok2.vp, { weekId: wk, courseId: ID.EA, status: 'VP_COVERED', action: 'VP covered the class.' })).ok, 'VP writes own class');
});
t('save → record on the row; change → audit keeps previous and new status / action, who and when; history newest first', () => {
  const F = setup(); const G = F.G; const A = F.tok2.admin; const wk = J(G.getClassCoverageTracking(A, {})).weekId;
  const r1 = J(G.saveClassCoverage(A, { weekId: wk, courseId: ID.EB, status: 'SUBSTITUTE_ASSIGNED', action: 'HM invited a substitute teacher / arranged an on-call substitute.', requestId: 'a1' }));
  assert.strictEqual(r1.record.statusLabel, 'Substitute Assigned');
  J(G.saveClassCoverage(F.tok2.hm, { weekId: wk, courseId: ID.EB, status: 'ORIGINAL_TEACHER_COVERED', action: 'Original teacher became available and confirmed coverage.', requestId: 'a2' }));
  const row = J(G.getClassCoverageTracking(A, { weekId: wk })).rows.find(r => r.courseId === ID.EB);
  assert.strictEqual(row.record.status, 'ORIGINAL_TEACHER_COVERED'); assert.strictEqual(row.record.updatedBy, 'hm@aps.org'); assert.strictEqual(row.record.updatedByRole, 'Head Master'); assert.strictEqual(row.historyCount, 2);
  const h = J(G.getClassCoverageHistory(A, { weekId: wk, courseId: ID.EB }));
  assert.strictEqual(h.length, 2);
  assert.deepStrictEqual([h[0].oldStatus, h[0].newStatus, h[0].by], ['Substitute Assigned', 'Original Teacher Covered', 'hm@aps.org']);
  assert.ok(/substitute/.test(h[0].oldAction) && /Original teacher/.test(h[0].newAction));
  assert.deepStrictEqual([h[1].oldStatus, h[1].newStatus], ['(none)', 'Substitute Assigned']);
  assert.ok(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/.test(h[0].at));
  const sheet = rowsOf(F, 'Class_Coverage_Tracking');
  assert.strictEqual(sheet.filter(r => r[1] === wk && String(r[2]) === ID.EB).length, 1, 'one current row per class per week');
  assert.strictEqual(sheet[0].join('|'), 'Record_ID|Week_ID|Course_ID|Class_Name|Teacher_Name|Teacher_Email|Teacher_Availability|Coverage_Status|Coverage_Status_Label|Action_Taken|Updated_At_EST|Updated_By|Updated_By_Role|Created_At_EST|Created_By|Request_ID');
  const created = sheet.find(r => String(r[2]) === ID.EB); assert.strictEqual(created[14], 'admin@aps.org', 'created-by kept after an update');
});
t('same requestId answered once; unchanged save writes no audit; clearing removes the record but keeps history', () => {
  const F = setup(); const G = F.G; const A = F.tok2.admin; const wk = J(G.getClassCoverageTracking(A, {})).weekId;
  G.saveClassCoverage(A, { weekId: wk, courseId: ID.EC, status: 'CLASS_RESCHEDULED', action: 'Class was rescheduled and parents were notified.', requestId: 'dup' });
  G.saveClassCoverage(A, { weekId: wk, courseId: ID.EC, status: 'CLASS_CANCELLED', action: 'changed?', requestId: 'dup' });
  assert.strictEqual(rowsOf(F, 'Class_Coverage_Tracking_Audit').length - 1, 1, 'double click = one change');
  assert.ok(J(G.saveClassCoverage(A, { weekId: wk, courseId: ID.EC, status: 'CLASS_RESCHEDULED', action: 'Class was rescheduled and parents were notified.' })).unchanged);
  assert.strictEqual(rowsOf(F, 'Class_Coverage_Tracking_Audit').length - 1, 1);
  J(G.saveClassCoverage(A, { weekId: wk, courseId: ID.EC, status: '', action: '' }));
  const row = J(G.getClassCoverageTracking(A, { weekId: wk })).rows.find(r => r.courseId === ID.EC);
  assert.strictEqual(row.record, null); assert.strictEqual(row.historyCount, 2);
  assert.strictEqual(J(G.getClassCoverageHistory(A, { weekId: wk, courseId: ID.EC }))[0].newStatus, 'Cleared (no coverage issue)');
});
t('teacher availability is shown read-only (Not Available + alternative) and untouched; weeks are separate; formula-like text stored as text', () => {
  const F = setup(); const G = F.G; const A = F.tok2.admin; const d = J(G.getClassCoverageTracking(A, {}));
  G.setTeacherAvailabilityStatus(A, ID.ED, 'not_available', 'need_hm_support');
  const row = J(G.getClassCoverageTracking(A, { weekId: d.weekId })).rows.find(r => r.courseId === ID.ED);
  assert.deepStrictEqual([row.availability.code, row.availability.label], ['not_available', 'Not Available']);
  assert.ok(/HM Support/.test(row.availability.alternative)); assert.strictEqual(row.record, null);
  const before = JSON.stringify(rowsOf(F, 'Teacher_Weekly_Availability'));
  const other = d.weeks.find(w => !w.current).id;
  G.saveClassCoverage(A, { weekId: other, courseId: ID.ED, status: 'CLASS_NOT_COVERED', action: '=HYPERLINK("x") no teacher found' });
  assert.strictEqual(JSON.stringify(rowsOf(F, 'Teacher_Weekly_Availability')), before, 'availability data unchanged');
  assert.strictEqual(J(G.getClassCoverageTracking(A, { weekId: d.weekId })).rows.find(r => r.courseId === ID.ED).record, null, 'other week stays separate');
  const saved = rowsOf(F, 'Class_Coverage_Tracking').find(r => r[1] === other); assert.ok(String(saved[9]).startsWith("'="), 'no formula');
  assert.strictEqual(J(G.getClassCoverageTracking(A, { weekId: other })).rows.find(r => r.courseId === ID.ED).record.action, '=HYPERLINK("x") no teacher found', 'shown as typed');
  assert.ok(before.length > 10 && /need_hm_support/.test(before), 'availability sheet really checked');
});
t('Access Control: switching Class Coverage Tracking off for HM refuses HM on the server; sub-tab flag per role', () => {
  const F = setup(); const G = F.G; const wk = J(G.getClassCoverageTracking(F.tok2.admin, {})).weekId;
  G.saveAccessControl(F.tok2.admin, [{ role: 'headmaster', key: 'classes.coverageTracking', visible: false }]);
  assert.throws(() => G.getClassCoverageTracking(F.tok2.hm, {}), /ACCESS_OFF|turned off/);
  assert.ok(J(G.getClassCoverageTracking(F.tok2.admin, {})).rows.length, 'admin unaffected');
  assert.ok(J(G.getDashboardData(F.tok2.hm)).tabAccess['classes.coverageTracking'] === false);
  assert.strictEqual(J(G.getDashboardData(F.tok2.teacher)).coverageTrackingAccess, false);
  assert.strictEqual(J(G.getDashboardData(F.tok2.vp)).coverageTrackingAccess, true);
  void wk;
});
console.log(process.exitCode ? 'SOME CLASS COVERAGE TRACKING TESTS FAILED' : 'ALL ' + pass + ' CLASS COVERAGE TRACKING TESTS PASSED');

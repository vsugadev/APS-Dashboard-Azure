// r56: Admin Control → Access Control — server tests (node test/accesscontrol.js)
const assert = require('assert');
const { build } = require('./gradingfixture');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const J = x => JSON.parse(JSON.stringify(x));
function setup() {
  const F = build(); const { env } = F;
  const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0);
  P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p;
  F.G.syncClassroomData();
  F.A = F.tok('admin@aps.org', 'admin'); F.SA = F.tok('super@aps.org', 'superadmin');
  F.T = F.tok('teach_aps1@avvaiyarpadasalai.org', 'teacher'); F.S = F.tok('joshua_aps3407@avvaiyarpadasalai.org', 'student');
  F.H = F.tok('hm@aps.org', 'headmaster'); F.B = F.tok('bod@aps.org', 'vcfo_amchsts_bod');
  return F;
}
const cell = (d, key, role) => d.rows.find(r => r.key === key);
t('defaults: 40 rows x 7 roles; locked cells off, always-on cells on, N cells (r79) off, everything else on; only N cells restricted', () => {
  const F = setup(); const d = J(F.G.getAccessControl(F.A));
  assert.strictEqual(d.rows.length, 44); // r120: + Users outside the USA; r114: + Volunteer/Teacher Management (2 rows); r110: + School Leave Management; r94: + Apply Leave; r89: + Temp Teacher; r85: + Assignment Monitoring; r79: + Special Classes; r74: + Tamil Thadam; r58: + Temporary Class Coverage; r60: + Re-Map / Remove Student; r70: + Class Coverage Tracking, Zoho CRM Sync assert.strictEqual(d.roles.length, 7);
  d.rows.forEach(r => Object.keys(r.cells).forEach(role => assert.strictEqual(r.values[role], r.cells[role] !== 'L' && r.cells[role] !== 'N' && r.cells[role] !== 'O', r.key + '/' + role)));
  assert.strictEqual(cell(d, 'zohoSync').cells.headmaster, 'O'); assert.strictEqual(cell(d, 'classes.coverageTracking').cells.student, 'O'); assert.strictEqual(cell(d, 'classes.coverageTracking').cells.vcfo_amchsts_bod, 'O'); // r70; r91: former 🔒 cells of the five roles are optional switches (O)
  assert.strictEqual(cell(d, 'adminControl.userRoles').cells.admin, 'L', 'Admin / Super Admin columns keep their locked cells');
  assert.strictEqual(cell(d, 'meetPreview').cells.student, 'O'); assert.strictEqual(cell(d, 'adminControl.access').cells.admin, 'A');
  assert.ok(d.rows.every(r => r.cells.superadmin !== 'Y'), 'Super Admin column is never editable');
  const offN = { specialClasses: false }; // r79: off by default for these roles
  const offAm = { assignMon: false }; // r85: Assignment Monitoring off by default for Teacher / Student / BOD / Authorized
  [['superadmin', {}], ['admin', {}], ['headmaster', offN], ['teacher', Object.assign({}, offN, offAm)], ['student', offAm], ['vcfo_amchsts_bod', Object.assign({}, offN, offAm)], ['authorized', Object.assign({}, offN, offAm)], ['none', {}]].forEach(x => assert.deepStrictEqual(J(F.G.acEffectiveForRole_(x[0])), x[1], x[0]));
  assert.strictEqual(d.lastSaved, null);
});
t('only Admin / Super Admin can open or save Access Control (server-enforced)', () => {
  const F = setup();
  assert.ok(F.G.getAccessControl(F.SA).rows.length);
  [F.H, F.T, F.S, F.B].forEach(tk => {
    assert.throws(() => F.G.getAccessControl(tk), /Only Admin/);
    assert.throws(() => F.G.saveAccessControl(tk, [{ role: 'student', key: 'kb', visible: false }]), /Only Admin/);
    assert.throws(() => F.G.getAccessControlHistory(tk), /Only Admin/);
  });
});
t('hiding a tab: audited, sent to the browser, and refused on the server; other roles unaffected', () => {
  const F = setup(); const G = F.G;
  assert.ok(Array.isArray(J(G.getKnowledgeBaseVideos(F.S))) || G.getKnowledgeBaseVideos(F.S) !== undefined);
  const d = J(G.saveAccessControl(F.A, [{ role: 'student', key: 'kb', visible: false }, { role: 'teacher', key: 'attendance', visible: false }]));
  assert.strictEqual(d.saved, 2); assert.ok(d.lastSaved && /admin@aps.org/.test(d.lastSaved.by));
  assert.strictEqual(cell(d, 'kb').values.student, false); assert.strictEqual(cell(d, 'kb').values.teacher, true);
  assert.deepStrictEqual(J(G.acEffectiveForRole_('student')), { kb: false, assignMon: false }); // r85: assignMon off by default
  assert.throws(() => G.getKnowledgeBaseVideos(F.S), /ACCESS_OFF/);
  assert.doesNotThrow(() => G.getKnowledgeBaseVideos(F.T));
  assert.throws(() => G.getAttendanceWeekOptions(F.T), /ACCESS_OFF/);
  assert.doesNotThrow(() => G.getAttendanceWeekOptions(F.A));
  const ses = J(G.establishSessionForVerifiedClaims_({ email: 'joshua_aps3407@avvaiyarpadasalai.org' }));
  assert.strictEqual(ses.user.tabAccess.kb, false, 'login payload carries the setting');
  const dd = J(G.getDashboardData(F.S)); assert.strictEqual(dd.tabAccess.kb, false, 'dashboard data carries the setting');
  const audit = F.env.wb.getSheetByName('Access_Control_Audit');
  assert.strictEqual(audit.getLastRow(), 3);
  const r = audit.getRange(2, 1, 1, 8).getValues()[0];
  assert.deepStrictEqual(r.slice(1), ['admin@aps.org', 'admin', 'student', 'kb', '🎬 Knowledge Base – Videos', 'VISIBLE', 'HIDDEN']);
});
t('turning a tab off turns its sub-tabs off; sub-tab only hides that sub-tab', () => {
  const F = setup(); const G = F.G;
  G.saveAccessControl(F.A, [{ role: 'teacher', key: 'tickets', visible: false }]);
  const eff = J(G.acEffectiveForRole_('teacher'));
  ['tickets', 'tickets.self'].forEach(k => assert.strictEqual(eff[k], false, k));
  assert.throws(() => G.listTickets(F.T, { scope: 'mine' }), /ACCESS_OFF/);
  assert.strictEqual(G.apsTabAllowed_('teacher', 'tickets.self'), false);
  G.saveAccessControl(F.A, [{ role: 'teacher', key: 'tickets', visible: true }, { role: 'admin', key: 'tickets.reports', visible: false }]);
  assert.doesNotThrow(() => G.listTickets(F.T, { scope: 'mine' }));
  assert.throws(() => G.getTicketReports(F.A), /ACCESS_OFF/);
  assert.doesNotThrow(() => G.listTickets(F.A, { scope: 'all' }), 'All Tickets still on for Admin');
  assert.doesNotThrow(() => G.getTicketReports(F.SA), 'Super Admin always keeps everything');
});
t('locked, always-on and unknown cells are refused; unchanged values are not re-audited; one row per cell', () => {
  const F = setup(); const G = F.G;
  assert.throws(() => G.saveAccessControl(F.A, [{ role: 'admin', key: 'adminControl.userRoles', visible: true }]), /not available for Admin/); // r91: only the Admin / Super Admin columns keep locked cells
  assert.throws(() => G.saveAccessControl(F.A, [{ role: 'admin', key: 'adminControl.access', visible: false }]), /always on/);
  assert.throws(() => G.saveAccessControl(F.A, [{ role: 'superadmin', key: 'kb', visible: false }]), /always on/);
  assert.throws(() => G.saveAccessControl(F.A, [{ role: 'parent', key: 'kb', visible: false }]), /Unknown role/);
  assert.throws(() => G.saveAccessControl(F.A, [{ role: 'teacher', key: 'nope', visible: false }]), /Unknown tab/);
  assert.throws(() => G.saveAccessControl(F.A, []), /No changes/);
  assert.strictEqual(G.saveAccessControl(F.A, [{ role: 'teacher', key: 'kb', visible: true }]).saved, 0, 'already visible');
  G.saveAccessControl(F.A, [{ role: 'teacher', key: 'kb', visible: false }]);
  G.saveAccessControl(F.A, [{ role: 'teacher', key: 'kb', visible: true }]);
  const sh = F.env.wb.getSheetByName('Dashboard_Access_Control');
  assert.strictEqual(sh.getLastRow(), 2, 'upsert: one row for teacher/kb');
  assert.deepStrictEqual(sh.getRange(1, 1, 1, 6).getValues()[0], ['Role', 'Tab_Key', 'Tab_Label', 'Visible', 'Updated_At', 'Updated_By']);
  const h = J(G.getAccessControlHistory(F.A)).rows;
  assert.strictEqual(h.length, 2); assert.strictEqual(h[0].to, 'VISIBLE', 'newest first'); assert.strictEqual(h[1].to, 'HIDDEN');
  assert.deepStrictEqual(J(G.acEffectiveForRole_('teacher')), { specialClasses: false, assignMon: false }); // r85
});
t('the setting survives the 10-minute cache: a save clears it at once', () => {
  const F = setup(); const G = F.G;
  G.getAccessControl(F.A); // fills the cache
  G.saveAccessControl(F.A, [{ role: 'headmaster', key: 'exam.grading', visible: false }]);
  assert.strictEqual(G.apsTabAllowed_('headmaster', 'exam.grading'), false);
  assert.throws(() => G.getGradingData(F.H), /ACCESS_OFF/);
});
t('r75 Super Admin: can switch "always on" cells for every role (even other Super Admins); server refuses them; audited', () => {
  const F = setup(); const G = F.G;
  const d0 = J(G.getAccessControl(F.SA)); assert.strictEqual(d0.superAll, true);
  assert.strictEqual(cell(d0, 'classes').editable.teacher, true); assert.strictEqual(cell(d0, 'kb').editable.superadmin, true);
  assert.strictEqual(cell(d0, 'adminControl.access').editable.admin, true); assert.strictEqual(cell(d0, 'meetPreview').editable.student, true, 'r91: optional switch'); assert.strictEqual(cell(d0, 'adminControl.userRoles').editable.admin, false, 'Admin column L stays locked');
  assert.strictEqual(cell(d0, 'adminControl.access').editable.superadmin, false, 'own Access Control protected'); assert.strictEqual(cell(d0, 'adminControl').editable.superadmin, false);
  const dA = J(G.getAccessControl(F.A)); assert.ok(!dA.superAll);
  assert.strictEqual(cell(dA, 'classes').editable.teacher, true, 'r91: Admin can switch the five roles\' always-on cells'); assert.strictEqual(cell(dA, 'classes').editable.admin, false); assert.strictEqual(cell(dA, 'kb').editable.superadmin, false); assert.strictEqual(cell(dA, 'kb').editable.teacher, true, 'Admin keeps Y cells');
  const d = J(G.saveAccessControl(F.SA, [{ role: 'superadmin', key: 'tickets.reports', visible: false }, { role: 'superadmin', key: 'meetPreview', visible: false },
    { role: 'teacher', key: 'classes.list', visible: false }, { role: 'admin', key: 'zohoSync', visible: false }]));
  assert.strictEqual(d.saved, 4); assert.strictEqual(cell(d, 'meetPreview').values.superadmin, false);
  assert.throws(() => G.getTicketReports(F.SA), /ACCESS_OFF/); assert.doesNotThrow(() => G.listTickets(F.SA, { scope: 'all' }));
  assert.strictEqual(G.apsTabAllowed_('teacher', 'classes.list'), false); assert.strictEqual(G.apsTabAllowed_('teacher', 'classes'), true);
  assert.strictEqual(G.apsTabAllowed_('admin', 'zohoSync'), false); assert.throws(() => G.getZohoSyncStatus(F.A), /ACCESS_OFF|Only Admin/);
  const ses = J(G.establishSessionForVerifiedClaims_({ email: 'super@aps.org' })); if (ses && ses.user && ses.user.tabAccess) assert.strictEqual(ses.user.tabAccess.meetPreview, false);
  const audit = F.env.wb.getSheetByName('Access_Control_Audit').getDataRange().getValues().slice(1);
  assert.ok(audit.some(r => r[1] === 'super@aps.org' && r[2] === 'superadmin' && r[3] === 'superadmin' && r[4] === 'meetPreview' && r[7] === 'HIDDEN'));
});
t('r75 Super Admin: a parent "always on" tab off hides all its sub-tabs; own Access Control can never be switched off (no lock-out)', () => {
  const F = setup(); const G = F.G;
  G.saveAccessControl(F.SA, [{ role: 'teacher', key: 'classes', visible: false }, { role: 'admin', key: 'adminControl', visible: false }]);
  const eT = J(G.acEffectiveForRole_('teacher')); ['classes', 'classes.list', 'classes.teacherAvail', 'classes.coverage'].forEach(k => assert.strictEqual(eT[k], false, k));
  assert.strictEqual(G.apsTabAllowed_('admin', 'adminControl.backup'), false); assert.strictEqual(G.apsTabAllowed_('admin', 'adminControl.access'), false);
  assert.throws(() => G.getAccessControl(F.A), /ACCESS_OFF/, 'Admin locked out of Access Control by Super Admin');
  assert.throws(() => G.getMaintenanceStatus(F.A), /ACCESS_OFF/);
  assert.doesNotThrow(() => G.getAccessControl(F.SA));
  assert.throws(() => G.saveAccessControl(F.SA, [{ role: 'superadmin', key: 'adminControl.access', visible: false }]), /always on.*locked out/);
  assert.throws(() => G.saveAccessControl(F.SA, [{ role: 'superadmin', key: 'adminControl', visible: false }]), /cannot be changed/);
  assert.throws(() => G.saveAccessControl(F.SA, [{ role: 'admin', key: 'adminControl.userRoles', visible: true }]), /not available for Admin/);
  G.saveAccessControl(F.SA, [{ role: 'superadmin', key: 'adminControl.userRoles', visible: false }, { role: 'superadmin', key: 'adminControl.backup', visible: false }]);
  assert.throws(() => G.getDashboardUserRoles(F.SA), /ACCESS_OFF/); assert.throws(() => G.getMaintenanceStatus(F.SA), /ACCESS_OFF/);
  assert.strictEqual(G.apsTabAllowed_('superadmin', 'adminControl.access'), true); assert.doesNotThrow(() => G.getAccessControl(F.SA));
  G.saveAccessControl(F.SA, [{ role: 'admin', key: 'adminControl', visible: true }, { role: 'superadmin', key: 'adminControl.userRoles', visible: true }]);
  assert.doesNotThrow(() => G.getAccessControl(F.A)); assert.doesNotThrow(() => G.getDashboardUserRoles(F.SA));
  assert.throws(() => G.saveAccessControl(F.A, [{ role: 'admin', key: 'classes', visible: false }]), /only Super Admin/, 'Admin still cannot change A cells');
});
t('r91: Admin / Super Admin can switch EVERY cell for Headmaster, Teacher, Student, BOD, Authorized — optional cells start OFF and never widen access', () => {
  const F = setup(); const G = F.G; const open = ['headmaster', 'teacher', 'student', 'vcfo_amchsts_bod', 'authorized'];
  [F.A, F.SA].forEach(tk => { const d = J(G.getAccessControl(tk)); d.rows.forEach(r => open.forEach(role => {
    assert.notStrictEqual(r.cells[role], 'L', 'no lock: ' + r.key + '/' + role); assert.strictEqual(r.editable[role], true, 'editable: ' + r.key + '/' + role); })); });
  const before = ['meetPreview', 'zohoSync', 'adminControl', 'tickets.all'].map(k => G.apsTabAllowed_('student', k));
  const d = J(G.saveAccessControl(F.A, [{ role: 'student', key: 'meetPreview', visible: true }, { role: 'student', key: 'zohoSync', visible: true }, { role: 'student', key: 'adminControl', visible: true },
    { role: 'teacher', key: 'classes', visible: false }, { role: 'student', key: 'classes.list', visible: false }]));
  assert.strictEqual(d.saved, 5); assert.strictEqual(cell(d, 'zohoSync').values.student, true);
  assert.deepStrictEqual(['meetPreview', 'zohoSync', 'adminControl', 'tickets.all'].map(k => G.apsTabAllowed_('student', k)), before, 'optional switch adds / removes nothing');
  assert.throws(() => G.getZohoSyncStatus(F.S), /Only Admin|permission|ACCESS_OFF/, 'feature rules still refuse the role');
  assert.throws(() => G.getAccessControl(F.S), /Only Admin/);
  assert.strictEqual(G.apsTabAllowed_('teacher', 'classes'), false, 'Admin switched Classes off for Teacher'); assert.strictEqual(G.apsTabAllowed_('student', 'classes.list'), false);
  G.saveAccessControl(F.A, [{ role: 'student', key: 'zohoSync', visible: false }]);
  const audit = F.env.wb.getSheetByName('Access_Control_Audit').getDataRange().getValues().slice(1);
  assert.ok(audit.some(r => r[3] === 'student' && r[4] === 'zohoSync' && r[6] === 'HIDDEN' && r[7] === 'VISIBLE') && audit.some(r => r[3] === 'student' && r[4] === 'zohoSync' && r[6] === 'VISIBLE' && r[7] === 'HIDDEN'), 'audited both ways');
  assert.deepStrictEqual(J(G.acEffectiveForRole_('headmaster')), { specialClasses: false }, 'untouched role unchanged');
});
console.log(pass + ' passed');

// r70: 🔄 Zoho CRM Sync – Student Contact — server tests with a Zoho emulator (node test/zoho.js)
const assert = require('assert');
const { setup, ID, D } = require('./coveragefixture');
const { install } = require('./zohomock');
const J = x => JSON.parse(JSON.stringify(x));
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const sheet = (F, n) => { const s = F.env.wb.getSheetByName(n); return s ? s.getDataRange().getValues() : []; };
function prep(opts) {
  const F = setup(); const Z = install(F.env, opts); F.A = F.tok2.admin;
  F.ids = []; const sp = F.env.ctx.SpreadsheetApp.openById; F.env.ctx.SpreadsheetApp.openById = id => { F.ids.push(id); return sp(id); };
  return { F, Z, G: F.G };
}
// Zoho holds every APS student with a stale grade, plus a few special cases
function seed(G, Z, A) {
  const L = J(G.loadZohoSyncStudents(A)).rows.filter(r => !r.multiple);
  L.forEach((r, i) => Z.records.push({ id: 'Z' + i, Student_APS_Email_Address: r.email, Grade: 'Nilai 1' }));
  return L;
}
const ENDPOINTS = [['getZohoSyncStatus', []], ['checkZohoConnection', []], ['loadZohoSyncStudents', []], ['previewZohoStudentSync', []], ['runZohoStudentSync', [{ all: true, confirmed: true }]], ['getZohoSyncHistory', [{}]]];

t('every Zoho endpoint refuses HM, VP, teacher, student, BOD (server-side role, not the browser); Admin and Super Admin allowed', () => {
  const { F, G } = prep();
  for (const k of ['hm', 'vp', 'teacher', 'student', 'bod']) for (const [fn, args] of ENDPOINTS) assert.throws(() => G[fn](F.tok2[k], ...args), /Only Admin \/ Super Admin|ACCESS_OFF/, k + ' ' + fn);
  assert.ok(J(G.getZohoSyncStatus(F.A)).configured);
  assert.ok(J(G.getZohoSyncStatus(F.tok('super@aps.org', 'superadmin'))).configured);
  assert.throws(() => G.loadZohoSyncStudents('forged-token'), /session|sign in|expired/i);
});
t('not connected: status shows only which settings are missing; Preview gives a clear message; no secret is ever returned', () => {
  const { F, G } = prep({ configure: false });
  const st = J(G.getZohoSyncStatus(F.A));
  assert.deepStrictEqual([st.configured, st.clientIdSet, st.clientSecretSet, st.refreshTokenSet], [false, false, false, false]);
  assert.throws(() => G.previewZohoStudentSync(F.A), /Zoho is not connected yet/);
  const c = J(G.checkZohoConnection(F.A)); assert.strictEqual(c.ok, false); assert.ok(/not connected/.test(c.error));
  assert.ok(/ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN in Project Settings/.test(c.error), 'message stays readable: ' + c.error);
});
t('Check connection: finds the Student Contacts module and the field API names from Zoho metadata; a missing field is reported, not guessed', () => {
  const { F, Z, G } = prep();
  let c = J(G.checkZohoConnection(F.A));
  assert.ok(c.ok); assert.strictEqual(c.meta.module, 'Student_Contacts');
  assert.deepStrictEqual(Object.keys(c.meta.fields).map(k => c.meta.fields[k] && c.meta.fields[k].api), ['Student_APS_Email_Address', 'Google_Classroom_Full_Name', 'Teacher_Name', 'Teacher_Email_Address', 'Grade']);
  assert.deepStrictEqual(c.meta.missing, []);
  Z.fields = Z.fields.filter(f => f.api_name !== 'Teacher_Name');
  c = J(G.checkZohoConnection(F.A));
  assert.strictEqual(c.meta.fields.teacherName, null); assert.ok(/Teacher Name — set its API name in Script Property ZOHO_FIELD_TEACHER_NAME/.test(c.meta.missing.join()));
  Z.fields.push({ api_name: 'Class_Teacher_X', field_label: 'Something else', data_type: 'text' });
  F.env.ctx.PropertiesService.getScriptProperties().setProperty('ZOHO_FIELD_TEACHER_NAME', 'Class_Teacher_X');
  c = J(G.checkZohoConnection(F.A)); assert.strictEqual(c.meta.fields.teacherName.api, 'Class_Teacher_X', 'Script Property override');
  Z.fields = Z.fields.filter(f => f.api_name !== 'Student_APS_Email_Address');
  c = J(G.checkZohoConnection(F.A)); assert.strictEqual(c.ok, false, 'no match field → not usable');
  assert.throws(() => G.previewZohoStudentSync(F.A), /Student_APS_Email_Address was not found/);
});
t('Load Students uses the dashboard data only (no Zoho call): full class name, Nilai grade, primary teacher name + email, APSID', () => {
  const { F, Z, G } = prep();
  const L = J(G.loadZohoSyncStudents(F.A));
  assert.strictEqual(Z.requests.length, 0, 'no Zoho call on load');
  const r = L.rows.find(x => x.courseId === ID.EA);
  assert.strictEqual(r.classroom, 'MUNMAZHALAI - EA | FRI 6:30 - 8:00 PM EST | AY26-27');
  assert.strictEqual(r.grade, 'Munmazhalai'); assert.strictEqual(r.teacherName, 'Ayana Nivedida Parthiban'); assert.strictEqual(r.teacherEmail, 'ayana_aps8123' + D);
  assert.ok(/^APS\d+$/.test(r.apsId));
  assert.ok(L.rows.every(x => x.email === x.email.trim().toLowerCase()));
});
t('Preview: email matched trimmed + lowercase; READY / NO CHANGE / NOT FOUND / DUPLICATE MATCH / MULTIPLE CLASSES; nothing written to Zoho; ≤200 per read', () => {
  const { F, Z, G } = prep({ perPage: 50 });
  const L = seed(G, Z, F.A);
  const a = L[0], b = L[1], c = L[2], d = L[3];
  Z.records[0].Student_APS_Email_Address = '  ' + a.email.toUpperCase() + ' ';
  Object.assign(Z.records[1], { Google_Classroom_Full_Name: b.classroom, Teacher_Name: b.teacherName, Teacher_Email_Address: b.teacherEmail.toUpperCase(), Grade: b.grade });
  Z.records.splice(2, 1); // c not in Zoho
  Z.records.push({ id: 'ZDUP', Student_APS_Email_Address: d.email });
  const P = J(G.previewZohoStudentSync(F.A));
  const st = e => P.rows.find(r => r.email === e).status;
  assert.strictEqual(st(a.email), 'READY TO UPDATE'); assert.strictEqual(st(b.email), 'NO CHANGE', 'r72: same value apart from capitals → ignored (no update)');
  assert.strictEqual(st(c.email), 'NOT FOUND'); assert.strictEqual(st(d.email), 'DUPLICATE MATCH');
  assert.ok(P.rows.some(r => r.status === 'MULTIPLE CLASSES'));
  assert.strictEqual(Z.calls.put, 0, 'preview never writes');
  assert.strictEqual(Z.calls.list, Math.ceil(Z.records.length / 50), 'paged read');
  const s = P.summary; assert.strictEqual(s.total, P.rows.length); assert.strictEqual(s.notFound, 1); assert.strictEqual(s.duplicate, 1); assert.strictEqual(s.zohoRecordsRead, Z.records.length);
  const ra = P.rows.find(r => r.email === a.email);
  assert.deepStrictEqual(ra.changes.filter(x => x.changed).map(x => x.field), ['Google Classroom Full Name', 'Teacher Name', 'Teacher Email Address', 'Grade'], 'r72: the email differs only in capitals / spaces → not sent');
  assert.ok(P.runId.startsWith('ZPV-'));
});
t('Sync All: only READY students, exactly-one matches, only changed fields, ≤100 records per call, never creates, never blanks; summary', () => {
  const { F, Z, G } = prep();
  const L = seed(G, Z, F.A);
  Object.assign(Z.records[5], { Google_Classroom_Full_Name: L[5].classroom, Teacher_Name: L[5].teacherName, Teacher_Email_Address: L[5].teacherEmail }); // only Grade differs
  Z.records.push({ id: 'ZDUP', Student_APS_Email_Address: L[7].email });
  assert.throws(() => G.runZohoStudentSync(F.A, { all: true }), /confirm/);
  const S = J(G.runZohoStudentSync(F.A, { all: true, confirmed: true, requestId: 'all-1' }));
  assert.ok(Z.puts.every(p => p.data.length <= 100)); assert.ok(Z.puts.length >= 3);
  const sent = [].concat(...Z.puts.map(p => p.data));
  assert.ok(!sent.some(d => !d.id), 'never a record without id (no create)');
  assert.ok(!Z.requests.some(r => r.method === 'post' && /crm/.test(r.url)), 'no POST to CRM');
  assert.ok(!sent.some(d => d.id === 'ZDUP' || Z.records.filter(r => r.Student_APS_Email_Address === L[7].email).some(r => r.id === d.id)), 'duplicate never updated');
  assert.deepStrictEqual(Object.keys(sent.find(d => d.id === 'Z5')).sort(), ['Grade', 'id'], 'only the changed field');
  assert.ok(!sent.some(d => Object.keys(d).some(k => d[k] === '')), 'no blank values');
  assert.strictEqual(S.summary.updated, sent.length); assert.strictEqual(S.summary.duplicate, 1); assert.strictEqual(S.summary.errors, 0);
  const rec = Z.records.find(r => r.id === 'Z0');
  assert.strictEqual(rec.Grade, L[0].grade); assert.strictEqual(rec.Google_Classroom_Full_Name, L[0].classroom); assert.strictEqual(rec.Teacher_Email_Address, L[0].teacherEmail);
  const S2 = J(G.runZohoStudentSync(F.A, { all: true, confirmed: true, requestId: 'all-2' }));
  assert.strictEqual(S2.summary.updated, 0); assert.ok(S2.summary.noChange > 0, 'second run: no change, no PUT'); assert.strictEqual(Z.puts.length, S.summary.updated ? Z.puts.length : 0);
});
t('Sync Selected updates only the ticked students; the same requestId is processed once', () => {
  const { F, Z, G } = prep();
  const L = seed(G, Z, F.A);
  const S = J(G.runZohoStudentSync(F.A, { emails: [L[0].email, ' ' + L[1].email.toUpperCase()], confirmed: true, requestId: 'sel-1' }));
  assert.deepStrictEqual([].concat(...Z.puts.map(p => p.data)).map(d => d.id).sort(), ['Z0', 'Z1']);
  assert.strictEqual(S.summary.total, 2); assert.strictEqual(S.summary.updated, 2);
  const n = Z.calls.put; G.runZohoStudentSync(F.A, { emails: [L[2].email], confirmed: true, requestId: 'sel-1' });
  assert.strictEqual(Z.calls.put, n, 'duplicate request → no second update');
  assert.throws(() => G.runZohoStudentSync(F.A, { emails: [], confirmed: true }), /Select at least one student/);
});
t('fresh re-read before update: a record changed in Zoho since the preview is not overwritten needlessly; one failure never stops the rest', () => {
  const { F, Z, G } = prep();
  const L = seed(G, Z, F.A);
  J(G.previewZohoStudentSync(F.A));
  const origList = Z.records.slice();
  // simulate: list read shows stale, id read shows already-correct values for Z3
  const fetch0 = F.env.ctx.UrlFetchApp.fetch;
  F.env.ctx.UrlFetchApp.fetch = (url, o) => { if (/ids=/.test(url)) Object.assign(Z.records[3], { Google_Classroom_Full_Name: L[3].classroom, Teacher_Name: L[3].teacherName, Teacher_Email_Address: L[3].teacherEmail, Grade: L[3].grade }); return fetch0(url, o); };
  Z.failIds.Z4 = 'invalid data for Grade';
  const S = J(G.runZohoStudentSync(F.A, { all: true, confirmed: true, requestId: 'f-1' }));
  const row = e => S.rows.find(r => r.email === e);
  assert.strictEqual(row(L[3].email).status, 'NO CHANGE'); assert.ok(![].concat(...Z.puts.map(p => p.data)).some(d => d.id === 'Z3'));
  assert.strictEqual(row(L[4].email).status, 'ERROR'); assert.ok(/INVALID_DATA/.test(row(L[4].email).message));
  assert.strictEqual(row(L[5].email).status, 'UPDATED', 'others continue');
  assert.strictEqual(S.summary.errors, 1);
  void origList;
});
t('expired access token → refreshed once and retried; access token cached (one sign-in for many calls)', () => {
  const { F, Z, G } = prep();
  seed(G, Z, F.A);
  J(G.previewZohoStudentSync(F.A));
  assert.strictEqual(Z.calls.token, 1);
  Z.expireTokenOnce = true;
  J(G.runZohoStudentSync(F.A, { all: true, confirmed: true, requestId: 't-1' }));
  assert.strictEqual(Z.calls.token, 2, 'one refresh after the 401');
  Z.tokenFails = true; F.env.ctx.CacheService.getScriptCache().remove('aps_zoho_at_v1');
  assert.throws(() => G.previewZohoStudentSync(F.A), /Zoho sign-in failed/);
});
t('picklist: a grade Zoho does not offer is skipped with a note (no error, other fields still sent); blank APS teacher never clears Zoho', () => {
  const { F, Z, G } = prep();
  const L = seed(G, Z, F.A);
  Z.fields.find(f => f.api_name === 'Grade').pick_list_values = [{ display_value: 'Nilai 1' }];
  J(G.checkZohoConnection(F.A));
  const P = J(G.previewZohoStudentSync(F.A));
  const r = P.rows.find(x => x.email === L[0].email);
  assert.ok(/not one of the Zoho picklist values/.test(r.message)); assert.ok(!r.changes.some(c => c.field === 'Grade' && c.changed));
  assert.strictEqual(r.status, 'READY TO UPDATE', 'classroom / teacher still updated');
  const noTeacher = P.rows.find(x => x.status !== 'MULTIPLE CLASSES' && !x.teacherName);
  if (noTeacher) assert.ok(!noTeacher.changes.some(c => /Teacher/.test(c.field)), 'blank teacher not sent');
});
t('results: latest-per-student sheet + audit log (admin, old → new, status) in the Zoho sync spreadsheet; history endpoint; spreadsheet ID from one place', () => {
  const { F, Z, G } = prep();
  const L = seed(G, Z, F.A);
  G.runZohoStudentSync(F.A, { emails: [L[0].email], confirmed: true, requestId: 'h-1' });
  Z.records[0].Grade = 'Nilai 2';
  G.runZohoStudentSync(F.A, { emails: [L[0].email], confirmed: true, requestId: 'h-2' });
  const latest = sheet(F, 'ZOHO_STUDENT_CONTACT_SYNC');
  assert.strictEqual(latest[0].join('|'), 'Sync Date/Time|Student Email|Student Name|APSID|Current Google Classroom|Current Grade|Zoho Record ID|Previous Google Classroom|New Google Classroom|Previous Grade|New Grade|Previous Teacher Name|New Teacher Name|Previous Teacher Email|New Teacher Email|Sync Status|Error Message|Updated By|Course ID|Run ID|All Field Changes');
  assert.strictEqual(latest.filter(r => r[1] === L[0].email).length, 1, 'one row per student');
  const lr = latest.find(r => r[1] === L[0].email); assert.deepStrictEqual([lr[6], lr[9], lr[10], lr[15], lr[17]], ['Z0', 'Nilai 2', L[0].grade, 'UPDATED', 'admin@aps.org']);
  const log = sheet(F, 'ZOHO_STUDENT_CONTACT_SYNC_LOG');
  const mine = log.filter(r => r[5] === L[0].email); assert.strictEqual(mine.length, 2);
  assert.deepStrictEqual([mine[0][3], mine[0][4], mine[0][11], mine[0][12], mine[0][17]], ['admin@aps.org', 'SYNC_SELECTED', 'Nilai 1', L[0].grade, 'UPDATED']);
  assert.ok(log.some(r => r[17] === 'RUN'));
  const h = J(G.getZohoSyncHistory(F.A, { limit: 10 })); assert.ok(h.length >= 3 && h[0]['Admin'] === 'admin@aps.org');
  F.ids.length = 0; G.getZohoSyncHistory(F.A, {});
  assert.deepStrictEqual(F.ids, ['1rfPGPBmyEi7h2nyOwkbu9OVw9NS0c4s4iLZ1w91Ok0Q'], 'default Zoho sync spreadsheet');
  F.env.ctx.PropertiesService.getScriptProperties().setProperty('ZOHO_SYNC_SPREADSHEET_ID', 'OTHER_ID'); F.ids.length = 0;
  G.getZohoSyncHistory(F.A, {}); assert.deepStrictEqual(F.ids, ['OTHER_ID'], 'Script Property override');
  assert.strictEqual((require('fs').readFileSync(__dirname + '/../Code.gs', 'utf8').match(/1rfPGPBmyEi7h2nyOwkbu9OVw9NS0c4s4iLZ1w91Ok0Q/g) || []).length, 1, 'ID written once in the code');
});
t('no secret or token ever appears in responses, sheets, logs or errors; tokens only in the Authorization header', () => {
  const { F, Z, G } = prep();
  seed(G, Z, F.A); Z.failIds.Z2 = 'Bearer AT-1-SECRETTOKEN rejected';
  const logs = []; const c0 = console.warn, c1 = console.log, c2 = console.error; console.warn = console.log = console.error = (...a) => logs.push(a.join(' '));
  let out = '';
  try {
    out += JSON.stringify(J(G.getZohoSyncStatus(F.A))) + JSON.stringify(J(G.checkZohoConnection(F.A))) + JSON.stringify(J(G.previewZohoStudentSync(F.A)));
    out += JSON.stringify(J(G.runZohoStudentSync(F.A, { all: true, confirmed: true, requestId: 's-1' }))) + JSON.stringify(J(G.getZohoSyncHistory(F.A, {})));
    Z.tokenFails = true; F.env.ctx.CacheService.getScriptCache().remove('aps_zoho_at_v1');
    try { G.previewZohoStudentSync(F.A); } catch (e) { out += e.message; }
  } finally { console.warn = c0; console.log = c1; console.error = c2; }
  const all = out + logs.join('\n') + JSON.stringify(sheet(F, 'ZOHO_STUDENT_CONTACT_SYNC')) + JSON.stringify(sheet(F, 'ZOHO_STUDENT_CONTACT_SYNC_LOG'));
  assert.ok(!/SECRET/.test(all), 'no secret / token text anywhere: ' + (all.match(/.{40}SECRET.{20}/) || [''])[0]);
  assert.ok(Z.requests.filter(r => /zohoapis/.test(r.url)).every(r => !/SECRET/.test(r.url) && !/SECRET/.test(String(r.payload || ''))), 'token never in a URL or body');
});
t('dashboard flags: the browser gets no Zoho data on page load; Access Control can hide the tab for Admin and the server then refuses', () => {
  const { F, Z, G } = prep();
  J(G.getDashboardData(F.A)); assert.strictEqual(Z.requests.length, 0, 'no Zoho call on page view');
  G.saveAccessControl(F.tok('super@aps.org', 'superadmin'), [{ role: 'admin', key: 'zohoSync', visible: false }]);
  assert.throws(() => G.loadZohoSyncStudents(F.A), /ACCESS_OFF|turned off/);
  assert.ok(J(G.loadZohoSyncStudents(F.tok('super@aps.org', 'superadmin'))).total > 0, 'Super Admin always on');
});
console.log(process.exitCode ? 'SOME ZOHO SYNC TESTS FAILED' : 'ALL ' + pass + ' ZOHO SYNC TESTS PASSED');

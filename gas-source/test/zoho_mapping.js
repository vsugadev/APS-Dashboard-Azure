// r71: Zoho CRM Sync — matching fixes (case / invisible characters / records missing from the list),
// Field Mapping (override, keep, default, fixed, transform, type checks, audit) and the Daily Schedule. node test/zoho_mapping.js
const assert = require('assert');
const { setup, D } = require('./coveragefixture');
const { install } = require('./zohomock');
const J = x => JSON.parse(JSON.stringify(x));
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const sheet = (F, n) => { const s = F.env.wb.getSheetByName(n); return s ? s.getDataRange().getValues() : []; };
const EXTRA = [
  { api_name: 'Email', field_label: 'Email', data_type: 'email', length: 100 },
  { api_name: 'Student_Status', field_label: 'Student Status', data_type: 'picklist', length: 50, pick_list_values: [{ display_value: 'Active' }, { display_value: 'Withdrawn' }] },
  { api_name: 'Section_Code', field_label: 'Section Code', data_type: 'text', length: 10 },
  { api_name: 'Parent_Lookup', field_label: 'Parent', data_type: 'lookup' },
  { api_name: 'Created_Time', field_label: 'Created Time', data_type: 'datetime', read_only: true },
  { api_name: 'Last_Dashboard_Sync', field_label: 'Last Dashboard Sync', data_type: 'date' },
  { api_name: 'VP_Email', field_label: 'VP Email', data_type: 'email', length: 100 }
];
function prep(opts) {
  const F = setup(); const Z = install(F.env, opts); F.A = F.tok2.admin;
  Z.fields = Z.fields.concat(EXTRA);
  const L = J(F.G.loadZohoSyncStudents(F.A)).rows.filter(r => !r.multiple);
  L.forEach((r, i) => Z.records.push({ id: 'Z' + i, Student_APS_Email_Address: r.email, Google_Classroom_Full_Name: r.classroom, Teacher_Name: r.teacherName, Teacher_Email_Address: r.teacherEmail, Grade: r.grade }));
  return { F, Z, G: F.G, L };
}
const save = (F, mapping, settings) => J(F.G.saveZohoFieldMapping(F.A, { mapping, settings }));
const row = (P, e) => P.rows.find(r => r.email === e);

t('AADHAN case: an UPPERCASE / spaced / invisible-character / mailto: email in Zoho still matches; r72: a value that is the same apart from capitals / spaces is ignored (no update)', () => {
  const { F, Z, G, L } = prep();
  Z.records[0].Student_APS_Email_Address = L[0].email.toUpperCase();
  Z.records[1].Student_APS_Email_Address = ' ' + L[1].email + '​ ';
  Z.records[2].Student_APS_Email_Address = 'mailto:' + L[2].email;
  const P = J(G.previewZohoStudentSync(F.A));
  [0, 1, 2].forEach(i => { const r = row(P, L[i].email); assert.strictEqual(r.zohoMatch, 'Found'); assert.strictEqual(r.status, 'NO CHANGE'); assert.deepStrictEqual(r.changes.filter(c => c.changed), []); });
  assert.strictEqual(P.summary.notFound, 0);
  const S = J(G.runZohoStudentSync(F.A, { all: true, confirmed: true, requestId: 'a1' }));
  assert.strictEqual(Z.records[0].Student_APS_Email_Address, L[0].email.toUpperCase(), 'left alone'); assert.strictEqual(S.summary.updated, 0); assert.strictEqual(Z.calls.put, 0, 'nothing sent');
  // any field: capitals / extra spaces only → ignored; a real difference → updated
  Z.records[3].Teacher_Name = '  ' + L[3].teacherName.toUpperCase() + '  '; Z.records[3].Google_Classroom_Full_Name = L[3].classroom.replace(/ /g, '  ');
  Z.records[4].Teacher_Name = 'Someone Else';
  const P2 = J(G.previewZohoStudentSync(F.A));
  assert.strictEqual(row(P2, L[3].email).status, 'NO CHANGE'); assert.strictEqual(row(P2, L[4].email).status, 'READY TO UPDATE');
  assert.deepStrictEqual(row(P2, L[4].email).changes.filter(c => c.changed).map(c => c.field), ['Teacher Name']);
});
t('a record the bulk list did not return (Zoho sharing / paging) is found by Zoho search and updated; with search off it stays NOT FOUND', () => {
  const { F, Z, G, L } = prep();
  Z.records[3].Grade = 'Nilai 1'; Z.hiddenFromList = ['Z3'];
  let P = J(G.previewZohoStudentSync(F.A));
  const r = row(P, L[3].email);
  assert.strictEqual(r.status, 'READY TO UPDATE'); assert.ok(/Found \(search: match field\)/.test(r.zohoMatch)); assert.ok(/Check the Zoho API user can see every Student Contact/.test(r.message));
  assert.strictEqual(P.summary.foundBySearch, 1); assert.strictEqual(P.summary.zohoRecordsRead, Z.records.length - 1);
  save(F, J(G.getZohoFieldMapping(F.A)).mapping, { searchFallback: false });
  P = J(G.previewZohoStudentSync(F.A)); assert.strictEqual(row(P, L[3].email).status, 'NOT FOUND'); assert.strictEqual(P.summary.searches, 0);
});
t('Student APS Email Address blank in Zoho but the email is in another email field → matched (setting), and the match field is filled', () => {
  const { F, Z, G, L } = prep();
  Z.records[4].Student_APS_Email_Address = ''; Z.records[4].Email = L[4].email.toUpperCase();
  let P = J(G.previewZohoStudentSync(F.A));
  let r = row(P, L[4].email); assert.ok(/other email field/.test(r.zohoMatch)); assert.deepStrictEqual(r.changes.filter(c => c.changed).map(c => c.to), [L[4].email]);
  J(G.runZohoStudentSync(F.A, { emails: [L[4].email], confirmed: true, requestId: 'o1' }));
  assert.strictEqual(Z.records[4].Student_APS_Email_Address, L[4].email);
  Z.records[5].Student_APS_Email_Address = ''; Z.records[5].Email = L[5].email;
  save(F, J(G.getZohoFieldMapping(F.A)).mapping, { otherEmailFields: false });
  P = J(G.previewZohoStudentSync(F.A)); assert.strictEqual(row(P, L[5].email).status, 'NOT FOUND');
});
t('bulk read pages by page number when Zoho returns no page token (no student silently missed)', () => {
  const { F, Z, G } = prep({ perPage: 50 });
  Z.noPageToken = true;
  const P = J(G.previewZohoStudentSync(F.A));
  assert.strictEqual(P.summary.zohoRecordsRead, Z.records.length); assert.strictEqual(P.summary.notFound, 0); assert.strictEqual(P.summary.searches, 0);
  assert.ok(Z.requests.some(q => /page=2/.test(q.url)));
});
t('Field Mapping data: every Zoho field with type, writable flag (lookup / read-only / system not writable), dashboard values, sample student, recommended mapping', () => {
  const { F, G, L } = prep();
  const d = J(G.getZohoFieldMapping(F.A));
  const f = api => d.fields.find(x => x.api === api);
  assert.strictEqual(f('Parent_Lookup').writable, false); assert.strictEqual(f('Created_Time').writable, false); assert.strictEqual(f('Section_Code').writable, true);
  assert.deepStrictEqual(f('Student_Status').picklist, ['Active', 'Withdrawn']);
  assert.ok(d.sources.some(s => s.key === 'FIXED') && d.sources.some(s => s.key === 'vpEmail') && d.sources.some(s => s.key === 'section'));
  assert.strictEqual(d.saved, false); assert.deepStrictEqual(d.mapping.map(m => m.zohoApi), ['Student_APS_Email_Address', 'Google_Classroom_Full_Name', 'Teacher_Name', 'Teacher_Email_Address', 'Grade']);
  assert.ok(d.sample && d.sample.values.classroom && d.sample.values.grade); assert.strictEqual(d.matchField.api, 'Student_APS_Email_Address');
  assert.strictEqual(J(G.getZohoFieldMapping(F.A, { sampleEmail: L[3].email.toUpperCase() })).sample.email, L[3].email);
});
t('save is validated against Zoho: unknown / lookup / read-only field, duplicate, match field from another value, fixed without default, bad picklist / email default', () => {
  const { F, G } = prep();
  const base = { source: 'classroom', transform: 'none', mode: 'overwrite', defaultValue: '', enabled: true };
  const bad = [
    [[{ ...base, zohoApi: 'Nope' }], /no longer exists/], [[{ ...base, zohoApi: 'Parent_Lookup' }], /cannot be written/], [[{ ...base, zohoApi: 'Created_Time' }], /cannot be written/],
    [[{ ...base, zohoApi: 'Section_Code' }, { ...base, zohoApi: 'Section_Code' }], /mapped twice/], [[{ ...base, zohoApi: 'Student_APS_Email_Address', source: 'teacherEmail' }], /can only receive the Student APS Email/],
    [[{ ...base, zohoApi: 'Student_Status', source: 'FIXED' }], /needs a Default value/], [[{ ...base, zohoApi: 'Student_Status', source: 'FIXED', defaultValue: 'Enrolled' }], /picklist/],
    [[{ ...base, zohoApi: 'VP_Email', source: 'vpEmail', defaultValue: 'not-an-email' }], /not an email/], [[{ ...base, zohoApi: 'Section_Code', enabled: false }], /at least one/]
  ];
  bad.forEach(([m, re]) => assert.throws(() => G.saveZohoFieldMapping(F.A, { mapping: m }), re, JSON.stringify(m)));
  assert.throws(() => G.saveZohoFieldMapping(F.tok2.hm, { mapping: [{ ...base, zohoApi: 'Section_Code' }] }), /Only Admin/);
});
t('override / keep / default / fixed / transform: exactly what is sent; audit records old ⇒ new mapping', () => {
  const { F, Z, G, L } = prep();
  Z.records.forEach(r => { r.Section_Code = r.id === 'Z0' ? 'KEEP' : ''; });
  Z.records[1].Student_Status = 'Withdrawn';
  const m = J(G.getZohoFieldMapping(F.A)).mapping.concat([
    { zohoApi: 'Section_Code', source: 'section', transform: 'lower', mode: 'ifBlank', defaultValue: '', enabled: true },
    { zohoApi: 'Student_Status', source: 'FIXED', transform: 'none', mode: 'ifBlank', defaultValue: 'active', enabled: true },
    { zohoApi: 'VP_Email', source: 'vpEmail', transform: 'none', mode: 'overwrite', defaultValue: 'vp-office@avvaiyarpadasalai.org', enabled: true },
    { zohoApi: 'Last_Dashboard_Sync', source: 'syncDate', transform: 'none', mode: 'overwrite', defaultValue: '', enabled: true }
  ]);
  const res = save(F, m);
  assert.ok(res.changes.some(c => /^Added: Section Code ← Section .* \[lowercase\] · Fill only if blank/.test(c)), res.changes.join('\n'));
  const P = J(G.previewZohoStudentSync(F.A));
  const r0 = row(P, L[0].email), r1 = row(P, L[1].email);
  assert.ok(r0.changes.find(c => c.field === 'Section Code').kept, 'Zoho value kept (only when blank)');
  const sec = (L[1].classroom.split('|')[0].split(' - ')[1] || '').trim(); assert.ok(sec); assert.strictEqual(r1.changes.find(c => c.field === 'Section Code').to, sec.toLowerCase(), 'section, lowercase');
  assert.strictEqual(r1.changes.find(c => c.field === 'Student Status').kept, true, 'fixed value not forced over an existing Zoho value');
  assert.strictEqual(row(P, L[2].email).changes.find(c => c.field === 'Student Status').to, 'Active', 'picklist value written in Zoho’s own spelling');
  const vp = row(P, L[2].email).changes.find(c => c.field === 'VP Email').to;
  assert.ok(vp === (L[2].vpEmail || 'vp-office@avvaiyarpadasalai.org') || /@/.test(vp), 'VP email or default');
  J(G.runZohoStudentSync(F.A, { emails: [L[0].email, L[1].email, L[2].email], confirmed: true, requestId: 'm1' }));
  assert.strictEqual(Z.records[0].Section_Code, 'KEEP'); assert.strictEqual(Z.records[1].Student_Status, 'Withdrawn'); assert.strictEqual(Z.records[2].Student_Status, 'Active');
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(Z.records[2].Last_Dashboard_Sync));
  const sent = [].concat(...Z.puts.map(p => p.data)); assert.ok(!sent.some(d => Object.values(d).some(v => v === '')), 'never a blank');
  const audit = sheet(F, 'ZOHO_FIELD_MAPPING_AUDIT'); assert.strictEqual(audit.length, 2); assert.strictEqual(audit[1][1], 'admin@aps.org');
  assert.ok(/Added: VP Email/.test(audit[1][2]));
  const log = sheet(F, 'ZOHO_STUDENT_CONTACT_SYNC_LOG'); assert.ok(log.some(r => /Student Status: \(blank\) → Active/.test(String(r[19]))), 'all field changes logged');
  assert.ok(J(G.saveZohoFieldMapping(F.A, { mapping: m })).unchanged, 'same mapping again → no audit row'); assert.strictEqual(sheet(F, 'ZOHO_FIELD_MAPPING_AUDIT').length, 2);
});
t('Test with a student: shows from → to for an unsaved mapping, writes nothing', () => {
  const { F, Z, G, L } = prep();
  Z.records[0].Grade = 'Nilai 1';
  const m = J(G.getZohoFieldMapping(F.A)).mapping.concat([{ zohoApi: 'Section_Code', source: 'section', transform: 'upper', mode: 'overwrite', defaultValue: 'NA', enabled: true }]);
  const puts = Z.calls.put, r = J(G.testZohoFieldMapping(F.A, { email: ' ' + L[0].email.toUpperCase(), mapping: m }));
  assert.ok(r.ok); assert.strictEqual(r.status, 'READY TO UPDATE'); assert.ok(r.changes.find(c => c.field === 'Grade').changed);
  assert.ok(r.changes.find(c => c.field === 'Section Code')); assert.strictEqual(Z.calls.put, puts, 'test never writes');
  assert.strictEqual(J(G.getZohoFieldMapping(F.A)).saved, false, 'test never saves');
  assert.ok(/No student/.test(J(G.testZohoFieldMapping(F.A, { email: 'nobody' + D, mapping: m })).errors[0]));
});
t('daily schedule: on → one trigger at the Eastern time; change → still one; off → none; refused for non-admins and without Zoho', () => {
  const { F, G } = prep();
  const trig = () => F.env.stats.triggers.filter(x => x.fn === 'apsZohoDailySync');
  let s = J(G.saveZohoSyncSchedule(F.A, { enabled: true, hour: 6, minute: 30, emailSummary: true }));
  assert.deepStrictEqual(trig().map(x => [x.everyDays, x.hour, x.minute, x.tz]), [[1, 6, 30, 'America/New_York']]);
  assert.ok(s.enabled && s.triggerActive && s.setBy === 'admin@aps.org');
  J(G.saveZohoSyncSchedule(F.A, { enabled: true, hour: 21, minute: 0 })); assert.deepStrictEqual(trig().map(x => x.hour), [21]);
  assert.throws(() => G.saveZohoSyncSchedule(F.A, { enabled: true, hour: 6, minute: 7 }), /Pick a time/);
  s = J(G.saveZohoSyncSchedule(F.A, { enabled: false })); assert.strictEqual(trig().length, 0); assert.strictEqual(s.enabled, false);
  for (const k of ['hm', 'vp', 'teacher', 'student', 'bod']) assert.throws(() => G.saveZohoSyncSchedule(F.tok2[k], { enabled: true, hour: 6, minute: 0 }), /Only Admin|ACCESS_OFF/);
  const P = F.env.ctx.PropertiesService.getScriptProperties(); P.deleteProperty ? P.deleteProperty('ZOHO_REFRESH_TOKEN') : P.setProperty('ZOHO_REFRESH_TOKEN', '');
  F.env.ctx.CacheService.getScriptCache().remove('aps_zoho_meta_v2'); F.env.ctx.CacheService.getScriptCache().remove('aps_zoho_at_v1');
  assert.throws(() => G.saveZohoSyncSchedule(F.A, { enabled: true, hour: 6, minute: 0 }), /not connected/);
  assert.ok(/Only Admin/.test((() => { try { G.getZohoFieldMapping(F.tok2.hm); } catch (e) { return e.message; } })()));
});
t('the scheduled run: Sync All with the saved mapping, logged as the daily schedule, last-run summary kept; does nothing when switched off', () => {
  const { F, Z, G, L } = prep();
  Z.records[0].Grade = 'Nilai 1'; Z.records[1].Grade = 'Nilai 1';
  J(G.saveZohoSyncSchedule(F.A, { enabled: true, hour: 6, minute: 0, emailSummary: true }));
  G.apsZohoDailySync();
  assert.strictEqual(Z.records[0].Grade, L[0].grade); assert.strictEqual(Z.records[1].Grade, L[1].grade);
  const st = J(G.getZohoSyncStatus(F.A)).schedule; assert.strictEqual(st.last.summary.updated, 2); assert.strictEqual(st.last.error, '');
  const log = sheet(F, 'ZOHO_STUDENT_CONTACT_SYNC_LOG'); assert.ok(log.some(r => r[4] === 'SCHEDULED_SYNC_ALL' && /Daily schedule \(set by admin@aps\.org\)/.test(r[3])));
  J(G.saveZohoSyncSchedule(F.A, { enabled: false })); Z.records[0].Grade = 'Nilai 1'; const n = Z.calls.put;
  G.apsZohoDailySync(); assert.strictEqual(Z.calls.put, n, 'off → no run');
});
console.log(process.exitCode ? 'SOME ZOHO MAPPING TESTS FAILED' : 'ALL ' + pass + ' ZOHO MAPPING TESTS PASSED');

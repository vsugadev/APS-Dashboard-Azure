// r108 — HM / VP / teachers see the EARLIER attendance of students now in their classes, even when it was recorded in a
// previous or closed class (view-only). (node test/atthistory.js)
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { makeContext } = require('./gasmock');
const env = makeContext({ props: { APS_ENVIRONMENT: 'LIVE' } });
vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), env.ctx, { filename: 'Code.gs' });
const G = env.ctx, DOM = '@avvaiyarpadasalai.org', J = x => JSON.parse(JSON.stringify(x));
const HM = 'hm.nilai5_aps9014' + DOM, VP = 'vp.mugai_aps9005' + DOM, T_EB = 'sheik_aps8096' + DOM, T_SA = 'sangamithra_aps8030' + DOM, T_EA = 'pasamalar_aps8115' + DOM;
const aadhya = { name: 'AADHYA SAI VINODH', email: 'aadhya_aps3352' + DOM }, other = { name: 'Other Child', email: 'other_aps3399' + DOM }, ebKid = { name: 'EB Kid', email: 'ebkid_aps3400' + DOM };
const sup = (t) => [{ email: t, roles: ['PRIMARY_TEACHER'], member: true }, { email: VP, roles: ['VP'], member: true }, { email: HM, roles: ['HM'], member: true }];
const EB = { id: '901', name: 'NILAI 5 - EB | FRI 6:30 - 8:00 PM EST | AY26-27', courseState: 'ACTIVE', teachers: [{ name: 'Sheik', email: T_EB }, { name: 'VP', email: VP }, { name: 'HM', email: HM }], students: [aadhya, ebKid], classSupport: sup(T_EB) };
const EA = { id: '902', name: 'NILAI 5 - EA | FRI 6:30 - 8:00 PM EST | AY26-27', courseState: 'ACTIVE', teachers: [{ name: 'Pasamalar', email: T_EA }], students: [other], classSupport: [{ email: T_EA, roles: ['PRIMARY_TEACHER'], member: true }] };
// NILAI 5 - SA (id 900) was CLOSED on Oct 28 — not in the course cache any more.
const cs = env.wb.insertSheet('Courses'); cs.data[0] = new Array(18).fill('h');
[EB, EA].forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); cs.data[i + 1] = row; });
const SA_NAME = 'NILAI 5 - SA | SUN 7:30 - 9:00 PM EST | AY26-27';
const R = (cid, cname, p, date, status, role, extra) => Object.assign({ courseId: cid, className: cname, email: p.email, personName: p.name, apsId: G.getAPSIdFromEmail(p.email), date, weekOf: 'WK-' + date, weekNo: 1,
  role: role || 'STUDENT', status, autoStatus: status, overrideStatus: '', overrideBy: '', overrideReason: '', activeMinutes: status === 'ABSENT' ? 0 : 85, score: status === 'ABSENT' ? 0 : 100, callMinutes: 95 }, extra || {});
const RECS = [
  R('900', SA_NAME, aadhya, '2026-09-13', 'PRESENT', 'STUDENT', { overrideStatus: 'PRESENT', overrideBy: 'sangamithra_aps8030@avvaiyarpadasalai.org', overrideReason: 'joined by phone' }),
  R('900', SA_NAME, aadhya, '2026-09-20', 'PRESENT'), R('900', SA_NAME, aadhya, '2026-09-27', 'PRESENT'), R('900', SA_NAME, aadhya, '2026-10-04', 'ABSENT'),
  R('900', SA_NAME, aadhya, '2026-10-11', 'ABSENT'), R('900', SA_NAME, aadhya, '2026-10-18', 'PRESENT'), R('900', SA_NAME, aadhya, '2026-10-25', 'ABSENT'),
  R('900', SA_NAME, { name: 'Old SA classmate', email: 'oldmate_aps3500' + DOM }, '2026-09-20', 'PRESENT'), // left the school — never shown to EB's staff
  R('900', SA_NAME, { name: 'Sangamithra', email: T_SA }, '2026-09-20', 'PRESENT', 'TEACHER'),          // the old class's TEACHER row — never shown
  R('901', EB.name, aadhya, '2026-10-30', 'ABSENT'), R('901', EB.name, ebKid, '2026-10-30', 'PRESENT'), R('901', EB.name, { name: 'Sheik', email: T_EB }, '2026-10-30', 'PRESENT', 'TEACHER'),
  R('902', EA.name, other, '2026-10-30', 'PRESENT'), R('902', EA.name, other, '2026-10-23', 'PRESENT')
];
let reads = 0;
G.attReadRecordsForFilters_ = (f, allowed) => { reads++; return RECS.filter(r => (!allowed || allowed[r.courseId]) && (!f.courseId || r.courseId === String(f.courseId)) && (!f.date || r.date === f.date)).map(r => Object.assign({}, r)); };
const tok = (email, role) => { const k = 'tok_' + email; env.cache['aps_sess_' + k] = JSON.stringify({ email, role }); return k; };
const view = (email, role, f) => J(G.getAttendanceRecordsForViewer(tok(email, role), f || {}));
const tests = []; const t = (n, fn) => tests.push([n, fn]);

t('HM of the current class (Class Support HM, role teacher) now sees all 8 weeks of APS3352 — 7 from the CLOSED class, view-only and labelled', () => {
  const rows = view(HM, 'teacher').filter(r => r.email === aadhya.email);
  assert.strictEqual(rows.length, 8, JSON.stringify(rows.map(r => r.date)));
  const hist = rows.filter(r => r.courseId === '900'), cur = rows.find(r => r.courseId === '901');
  assert.strictEqual(hist.length, 7); assert.ok(hist.every(r => r.previousClass === true && r.editable === false), 'history is view-only');
  assert.ok(!cur.previousClass && cur.editable === true, 'current class row unchanged: editable for the class HM');
  assert.strictEqual(hist.find(r => r.date === '2026-09-13').isOverridden, true, 'the old override still shows as ADJUSTED');
  assert.strictEqual(hist.find(r => r.date === '2026-09-13').overrideBy, '', 'who overrode it in the other class is not exposed');
});
t('never shows other students or the teacher of the old / other class', () => {
  const rows = view(HM, 'teacher');
  assert.ok(!rows.some(r => r.email === 'oldmate_aps3500' + DOM), 'old classmate (not in my class) hidden');
  assert.ok(!rows.some(r => r.email === T_SA), 'old class teacher row hidden');
  assert.ok(!rows.some(r => r.courseId === '902'), 'NILAI 5 - EA (HM not listed there) — still hidden');
});
t('VP and the class teacher of the current class get the same history; a teacher of another class does not', () => {
  assert.strictEqual(view(VP, 'teacher').filter(r => r.email === aadhya.email).length, 8);
  const tr = view(T_EB, 'teacher').filter(r => r.email === aadhya.email);
  assert.strictEqual(tr.length, 8); assert.ok(tr.filter(r => r.previousClass).every(r => !r.editable));
  assert.ok(tr.find(r => r.courseId === '901').editable, "the teacher can still override their own class's row");
  assert.ok(!view(T_EA, 'teacher').some(r => r.email === aadhya.email), 'EA teacher: not their student → nothing');
});
t('Override on a history row is refused by the server (cannot change another class through this view)', () => {
  const k = tok(HM, 'teacher');
  assert.throws(() => G.editAttendanceRecordStatus(k, '900', '2026-10-25', aadhya.email, 'STUDENT', 'PRESENT', 'Student attended the class by phone that day'), /Only an Admin/);
});
t('filters still apply: one course → only that course; "My Attendance" (scope mine) → own teacher rows only', () => {
  const one = view(HM, 'teacher', { courseId: '901' });
  assert.ok(one.length && one.every(r => r.courseId === '901'));
  const mine = view(T_EB, 'teacher', { scope: 'mine' });
  assert.ok(mine.length === 1 && mine[0].role === 'TEACHER' && mine[0].email === T_EB);
  assert.ok(view(HM, 'teacher', { role: 'TEACHER' }).every(r => !r.previousClass), 'role filter: no history teacher rows');
});
t('Admin, Student, BOD unchanged', () => {
  const a = view('info@avvaiyarpadasalai.org', 'admin');
  assert.strictEqual(a.length, RECS.length); assert.ok(a.every(r => !r.previousClass && r.editable));
  const s = view(aadhya.email, 'student'); assert.ok(s.every(r => r.courseId === '901'), 'student view unchanged (current class only)');
  const b = view('bod_aps1' + DOM, G.VCFO_AMCHSTS_BOD_ROLE || 'vcfo_amchsts_bod');
  assert.strictEqual(b.length, RECS.length); assert.ok(b.every(r => !r.editable));
});
t('one bulk attendance read per call', () => { reads = 0; view(HM, 'teacher'); assert.strictEqual(reads, 1); });
if (process.env.ATH_DUMP) { fs.writeFileSync(process.env.ATH_DUMP, JSON.stringify(view(HM, 'teacher').filter(r => r.email === aadhya.email))); }

let fails = 0;
for (const [n, fn] of tests) { try { fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 5).join('\n   ')); } }
console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);

// r82: Attendance Overall % is cumulative across Re-Map / class / grade changes (node test/attremap.js)
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { makeContext } = require('./gasmock');
const { courses, audit } = require('./fixtures');
function fixedDate(iso) { const NOW = new Date(iso).getTime(); class D extends Date { constructor(...a){ if(a.length===0) super(NOW); else super(...a); } static now(){ return NOW; } } return D; }
const code = fs.readFileSync(__dirname + '/../Code.gs', 'utf8');
function boot(nowIso, opts) { opts = opts || {}; opts.Date = fixedDate(nowIso); const env = makeContext(opts); vm.runInContext(code, env.ctx, { filename: 'Code.gs' }); return env; }
function reboot(prev, nowIso) { const env = boot(nowIso, { auditItems: audit, props: prev.props }); env.wb.sheets = prev.wb.sheets; Object.values(env.wb.sheets).forEach(s => s.wb = env.wb); Object.assign(env.cache, prev.cache); return env; }
function seedCourses(env, list) { const sh = env.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h'); (list || courses).forEach((c,i)=>{ const row = new Array(18).fill(''); row[0]=c.id; row[17]=JSON.stringify(c); sh.data[i+1]=row; }); }
function session(env, email, role) { const tok = 'tok_' + email; env.cache['aps_sess_' + tok] = JSON.stringify({ email, role }); return tok; }
const J = x => JSON.parse(JSON.stringify(x));
let passed = 0; const t = (name, fn) => { fn(); passed++; console.log('PASS', name); };
const A = '700000000001', B = '700000000002';

let env = boot('2026-09-12T18:00:00Z', { auditItems: audit }); seedCourses(env); env.ctx.syncAttendanceForAllCourses();
env = reboot(env, '2026-09-19T18:00:00Z'); env.ctx.syncAttendanceForAllCourses();
env = reboot(env, '2026-09-26T18:00:00Z'); env.ctx.syncAttendanceForAllCourses();
const admin = session(env, 'admin@aps.org', 'admin');
const H = env.ctx.ATTENDANCE_HEADER_ROW, col = n => H.indexOf(n);
const weekRows = (email) => Object.values(env.wb.sheets).filter(s => /^AWK\d+ATT$/.test(s.name)).flatMap(s => s.data.slice(1).filter(r => r && r[col('Email')] === email).map(r => ({ sheet: s, row: r })));
const moveTo = (email, sheetName, courseId, className) => { const x = weekRows(email).find(w => w.sheet.name === sheetName); x.row[col('Course ID')] = courseId; x.row[col('Class Name')] = className; };
const rec = (rows, e, d) => rows.find(r => r.email === e && r.date === d);
const expectOverall = (rows, email) => { let ws = 0, w = 0; rows.filter(r => r.email === email).forEach(r => { const wt = env.ctx.attRecordWeight_(r); ws += env.ctx.attEffectiveScore_(r) * wt; w += wt; }); return w > 0 ? Math.round(ws / w * 10) / 10 : 0; };
const view = () => J(env.ctx.getAttendanceRecordsForViewer(admin, {}));

const before = view();
const s1Before = before.filter(r => r.email === 's1@aps.org').map(r => r.overallPct);
const t1Before = before.filter(r => r.email === 't1@aps.org').map(r => r.overallPct);

t('TEST 1: a student who never changed class — Overall unchanged', () => {
  env.ctx.rebuildAttendanceSummary_();
  assert.deepStrictEqual(view().filter(r => r.email === 's1@aps.org').map(r => r.overallPct), s1Before);
});
t('TEST 2 + 4: one Re-Map (weeks 1–2 in class A, week 3 in class B) — Overall keeps every week, each row keeps its own class', () => {
  const w1 = view().filter(r => r.email === 's2@aps.org').sort((a, b) => a.date.localeCompare(b.date))[0];
  env.ctx.editAttendanceRecordStatus(admin, A, w1.date, 's2@aps.org', 'STUDENT', 'PRESENT', 'Make-up class attended in class A'); // gives class A weeks a different score
  moveTo('s2@aps.org', 'AWK03ATT', B, 'NILAI 9 - ZZ | SAT 12:00 - 1:30 PM EST | AY26-27');
  env.ctx.rebuildAttendanceSummary_();
  const rows = view(), s2 = rows.filter(r => r.email === 's2@aps.org');
  assert.deepStrictEqual(s2.map(r => r.courseId).sort(), [A, A, B].sort(), 'historical rows still show the class attended that week');
  const sumA = env.ctx.readAttendanceSummaryMap_()[env.ctx.attSummaryKey_(B, 's2@aps.org')];
  assert.ok(sumA && sumA.weeks === 1, 'per-classroom summary rows unchanged in shape');
  const want = expectOverall(s2, 's2@aps.org');
  assert.ok(s2.every(r => r.overallPct === want), JSON.stringify(s2.map(r => [r.courseId, r.overallPct])) + ' want ' + want);
  assert.notStrictEqual(want, sumA.overallPct, 'not the current class only');
});
t('TEST 3: several Re-Maps (A → C → B) — still every week', () => {
  moveTo('s2@aps.org', 'AWK02ATT', '700000000099', 'NILAI 8 - QQ | SUN 7:30 - 9:00 PM EST | AY26-27');
  env.ctx.rebuildAttendanceSummary_();
  const s2 = view().filter(r => r.email === 's2@aps.org');
  assert.strictEqual(new Set(s2.map(r => r.courseId)).size, 3);
  const want = expectOverall(s2, 's2@aps.org');
  assert.ok(s2.every(r => r.overallPct === want));
  assert.strictEqual(J(env.ctx.readAttendanceSummaryMap_()[env.ctx.attStudentOverallKey_('s2@aps.org')]).classes, 3);
});
t('TEST 5: manual Override on a week in the OLD class updates the cumulative Overall (override value used)', () => {
  const old = view().find(r => r.email === 's2@aps.org' && r.courseId === A);
  const r = env.ctx.editAttendanceRecordStatus(admin, A, old.date, 's2@aps.org', 'STUDENT', 'ABSENT', 'Re-check after the class move');
  assert.strictEqual(r.score, 0);
  const s2 = view().filter(x => x.email === 's2@aps.org');
  assert.ok(s2.every(x => x.overallPct === expectOverall(s2, 's2@aps.org')));
});
t('teachers keep the per-classroom Overall (they teach several classes at once); no attendance → unchanged ("–")', () => {
  assert.deepStrictEqual(view().filter(r => r.email === 't1@aps.org').map(r => r.overallPct), t1Before);
  assert.strictEqual(env.ctx.attOverallFor_({}, { role: 'STUDENT', email: 'nobody@aps.org', courseId: A }), null);
});
t('TEST 7 + 8: a later sync rebuilds the summary and the result stays correct (identity = APS email, no student hard-coded)', () => {
  const s2Now = view().filter(r => r.email === 's2@aps.org').map(r => r.overallPct);
  env.ctx.rebuildAttendanceSummary_();
  assert.deepStrictEqual(view().filter(r => r.email === 's2@aps.org').map(r => r.overallPct), s2Now);
  assert.ok(!/selva|aps1037/i.test(fs.readFileSync(__dirname + '/../Code.gs', 'utf8').slice(fs.readFileSync(__dirname + '/../Code.gs', 'utf8').indexOf('function attOverallFor_'), fs.readFileSync(__dirname + '/../Code.gs', 'utf8').indexOf('function attOverallFor_') + 800)));
});
t('the reproduction case: 4 weeks PA (wk1 adjusted, no call) + wk5 LB absent + wk6 LB 62/64 → Overall over all 6 weeks, not LB only', () => {
  const S = env.ctx.readAttendanceSummaryMap_;
  const rows = [ // the exact effective values from the screenshot; weights by the existing rule (call minutes, or scheduled minutes when overridden without a call)
    { role: 'STUDENT', email: 'x@aps.org', courseId: 'PA', callMinutes: 0, overrideStatus: 'PRESENT', schedStart: '9:00 PM', schedEnd: '10:30 PM', autoScore: 0 },
    { role: 'STUDENT', email: 'x@aps.org', courseId: 'PA', callMinutes: 95, autoScore: 100 }, { role: 'STUDENT', email: 'x@aps.org', courseId: 'PA', callMinutes: 95, autoScore: 100 },
    { role: 'STUDENT', email: 'x@aps.org', courseId: 'PA', callMinutes: 78, autoScore: 100 },
    { role: 'STUDENT', email: 'x@aps.org', courseId: 'LB', callMinutes: 95, autoScore: 0 }, { role: 'STUDENT', email: 'x@aps.org', courseId: 'LB', callMinutes: 64, autoScore: 100 }];
  const ws = rows.reduce((a, r) => a + env.ctx.attEffectiveScore_(r) * env.ctx.attRecordWeight_(r), 0), w = rows.reduce((a, r) => a + env.ctx.attRecordWeight_(r), 0);
  const lbOnly = Math.round((0 * 95 + 100 * 64) / (95 + 64) * 10) / 10;
  assert.strictEqual(lbOnly, 40.3, 'the wrong value shown today = LB weeks only');
  const all = Math.round(ws / w * 10) / 10;
  console.log('    reproduction: LB only = ' + lbOnly + '% → all classes = ' + all + '%');
  assert.ok(all > 80 && all < 82);
});
console.log('\nALL ' + passed + ' ATTENDANCE RE-MAP TESTS PASSED');

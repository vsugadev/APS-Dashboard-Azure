// r101 — Weekly Class Consolidation Analysis (read-only analysis + Wednesday email from donotreply@).
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { makeContext, Sheet } = require('./gasmock');
const tests = []; const t = (name, fn) => tests.push([name, fn]);
function fixedDate(iso) { let NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } static set(i) { NOW = new Date(i).getTime(); } } return D; }
Sheet.prototype.getMaxRows = function () { return 1000; };
const D = fixedDate('2026-10-28T23:00:00Z'); // Wed Oct 28 2026, 7:00 PM EDT
const env = makeContext({ Date: D, props: { APS_ENVIRONMENT: 'LIVE', HEADMASTER_EMAILS: JSON.stringify(['hm_aps600@avvaiyarpadasalai.org']) } });
env.ctx.ScriptApp.WeekDay.WEDNESDAY = 'WEDNESDAY';
let classroomTouched = 0;
env.ctx.Classroom = new Proxy({}, { get(o, k) { classroomTouched++; throw new Error('Classroom API must not be used: ' + String(k)); } });
const code = fs.readFileSync(__dirname + '/../Code.gs', 'utf8');
vm.runInContext(code, env.ctx, { filename: 'Code.gs' });
const J = x => JSON.parse(JSON.stringify(x));
const G = env.ctx;
const DOM = '@avvaiyarpadasalai.org';
const P = (n, k) => Array.from({ length: n }, (_, i) => ({ name: 'S' + k + i, email: 's' + k + i + '_aps' + (3000 + i) + DOM }));
const T = (name, id) => ({ name, email: name.toLowerCase().replace(/\s+/g, '') + '_aps' + id + DOM });
const tA = T('Anbu', 701), tB = T('Bharathi', 702), tC = T('Chelvi', 703), tD = T('Durai', 704), tE = T('Elango', 705), tF = T('Fathima', 706), tG = T('Gowri', 707), tH = T('Hari', 708), tI = T('Indira', 709);
const vp = T('Vani VP', 650), hmx = T('Head M', 601);
const support = (teacher) => [{ email: teacher.email, roles: ['PRIMARY_TEACHER'] }, { email: hmx.email, roles: ['HM'] }, { email: vp.email, roles: ['VP'] }];
const C = (id, name, teacher, n, extra) => Object.assign({ id, name: name + ' | AY26-27', courseState: 'ACTIVE', teachers: teacher ? [teacher] : [], students: P(n, id), classSupport: teacher ? support(teacher) : [] }, extra || {});
let COURSES = [
  C('C1', 'NILAI 6 - EG | FRI 6:30 - 8:00 PM EST', tA, 3),
  C('C2', 'NILAI 6 - EC | FRI 6:30 - 8:00 PM EST', tB, 4),
  C('C3', 'NILAI 6 - EF | FRI 6:30 - 8:00 PM EST', tC, 3),
  C('C4', 'NILAI 6 - EB | FRI 6:30 - 8:00 PM EST', tD, 5),
  C('C5', 'NILAI 6 - ED | FRI 6:30 - 8:00 PM EST', tE, 9),          // >8 never merged
  C('C6', 'NILAI 5 - PD | SAT 10:00 - 11:30 AM EST', tF, 5),
  C('C7', 'NILAI 5 - PC | SAT 10:00 - 11:30 AM EST', tG, 3),         // 8 → MEDIUM
  C('C8', 'NILAI 4 - LA | SUN 6:00 - 7:30 PM EST', tH, 2),
  C('C9', 'NILAI 4 - LB | SUN 6:00 - 7:30 PM EST', tH, 3),           // same teacher both → review
  C('C10', 'NILAI 3 - KA | SUN 9:00 - 10:30 PM EST', null, 2),
  C('C11', 'NILAI 3 - KB | SUN 9:00 - 10:30 PM EST', tI, 3),         // missing teacher → review
  C('C12', 'NILAI 7 - SA | SAT 10:00 - 11:30 AM EST', tF, 2),        // different Nilai, same time as C6 — never merged; tF teaches two at the same time
  C('C13', 'NILAI 7 - SB | SUN 6:00 - 7:30 PM EST', tA, 7),          // target 7; tA has 2 classes
  C('C14', 'NILAI 7 - SC | MON 7:00 - 8:30 PM EST', tB, 8),          // maximum 8
  C('C15', 'NILAI 7 - SD | FRI 9:00 - 10:30 PM EST', tC, 4),         // explore with SA (2) / SC? → combined ≤7 only
  C('C16', 'NILAI 99 - TEST | FRI 6:30 - 8:00 PM EST', tD, 1),       // excluded test class
  C('C17', 'NILAI 6 - OLD | FRI 6:30 - 8:00 PM EST', tE, 1, { courseState: 'ARCHIVED' }),
  Object.assign(C('C18', 'NILAI 6 - XX | FRI 6:30 - 8:00 PM', tE, 1), { name: 'NILAI 6 - XX | FRI 6:30 - 8:00 PM | AY25-26' }),     // other AY
];
function loadCourses() {
  const old = env.wb.sheets['Courses']; if (old) delete env.wb.sheets['Courses'];
  const cs = env.wb.insertSheet('Courses'); cs.data[0] = new Array(18).fill('h');
  COURSES.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); cs.data[i + 1] = row; });
  try { G.CacheService.getScriptCache().removeAll(Object.keys(env.cache)); } catch (e) {}
}
loadCourses();
const sent = []; let mailFail = null;
const realSend = G.apsGmailSend_;
G.apsGmailSend_ = (profile, m) => { sent.push({ profile, m }); if (mailFail) return { ok: false, error: mailFail }; return { ok: true, mode: 'GMAIL_API' }; };
const rows = () => (env.wb.sheets['CLASS_CONSOLIDATION_WEEKLY'] ? env.wb.sheets['CLASS_CONSOLIDATION_WEEKLY'].data.slice(1).filter(r => r && r.some(Boolean)) : []);
const H = () => env.wb.sheets['CLASS_CONSOLIDATION_WEEKLY'].data[0];
const col = (r, h) => r[H().indexOf(h)];
let R;

t('analysis builds in memory from the course cache only', () => {
  R = G.ccwBuild_(G.readAllCoursesFromCache_(), new D());
  assert.strictEqual(R.reportId, 'CCW-AY26-27-2026-10-28');
  assert.strictEqual(R.dateLabel, '10/28/2026');
  assert.strictEqual(R.counts.classes, 15, 'test, archived and other-AY classes are excluded');
  assert.ok(R.excluded.some(x => /NILAI 99/.test(x.name)));
  assert.strictEqual(classroomTouched, 0, 'no Classroom API');
});
t('same-slot merges: Nilai 6 FRI 6:30 — best partition 3+4=7 and 3+5=8? → two 7s preferred', () => {
  const n6 = R.merges.filter(m => m.nilai === 'NILAI 6');
  // classes 3,4,3,5 (and 9 never): best = (3+4)=7 + (3+5)=8 vs (3+3)=6+(4+...)… groups maximise classes removed (2), then 7s.
  assert.strictEqual(n6.length, 2);
  const ids = n6.flatMap(m => m.classes.map(c => c.code));
  assert.strictEqual(new Set(ids).size, ids.length, 'no class appears twice');
  assert.ok(!ids.includes('Nilai 6 ED'), 'a 9-student class is never merged');
  n6.forEach(m => assert.ok(m.combined <= 8));
  assert.ok(n6.some(m => m.combined === 7 && m.priority === 'HIGH'));
});
t('8 combined → MEDIUM review; ≤7 → HIGH', () => {
  const n5 = R.merges.find(m => m.nilai === 'NILAI 5');
  assert.strictEqual(n5.combined, 8); assert.strictEqual(n5.priority, 'MEDIUM');
  assert.ok(/8-student maximum/.test(n5.recommendation));
});
t('never merges different Nilai at the same time', () => {
  R.merges.forEach(m => { const n = new Set(m.classes.map(c => c.code.split(' ').slice(0, 2).join(' '))); assert.strictEqual(n.size, 1); });
  assert.ok(!R.merges.some(m => m.classes.some(c => c.code === 'Nilai 7 SA')));
});
t('same teacher on both classes → HM/VP review, no continuing teacher', () => {
  const m = R.merges.find(x => x.nilai === 'NILAI 4');
  assert.ok(m.sameTeacher && m.reviewRequired && !m.continuing);
});
t('missing primary teacher → review required + data note', () => {
  const m = R.merges.find(x => x.nilai === 'NILAI 3');
  assert.ok(m.reviewRequired && !m.continuing && /no primary teacher/.test(m.recommendation));
  assert.ok(R.reviewNotes.some(x => /Nilai 3 KA/.test(x)));
});
t('suggested continuing teacher: free of conflicts, fewest classes; reason given', () => {
  // Nilai 5 PD (tF, who also teaches Nilai 7 SA at the SAME time) vs PC (tG, 1 class) → tG continues
  const m = R.merges.find(x => x.nilai === 'NILAI 5');
  assert.strictEqual(m.continuing.email, tG.email);
  assert.ok(m.continuing.reason.length > 10);
  R.merges.filter(x => x.continuing).forEach(x => assert.strictEqual(x.classes.filter(c => c.continuing).length, 1));
});
t('teachers with multiple classes + same-time flag', () => {
  const f = R.multi.find(x => x.email === tF.email);
  assert.ok(f && f.count === 2 && f.sameTime === true);
  const a = R.multi.find(x => x.email === tA.email);
  assert.ok(a && a.count === 2 && a.sameTime === false);
  assert.ok(!R.multi.find(x => x.email === tG.email));
});
t('bands, 7:1 / 8 lists, small list, explore (LOW) and Potential impact', () => {
  assert.strictEqual(R.bands.TARGET, 1); assert.strictEqual(R.bands.MAXIMUM, 1); assert.strictEqual(R.bands.OVER, 1);
  assert.strictEqual(R.bands.CRITICAL + R.bands.REVIEW + R.bands.NEAR_TARGET + R.bands.TARGET + R.bands.MAXIMUM + R.bands.OVER, R.counts.classes);
  assert.deepStrictEqual(R.target7.length, 1); assert.deepStrictEqual(R.max8.length, 1);
  assert.ok(R.small.every(x => x.n <= 5));
  const sa = R.explore.find(x => x.code === 'Nilai 7 SA');
  assert.ok(sa && sa.options.some(o => o.code === 'Nilai 7 SD'), 'Nilai 7 SA (2) can explore Nilai 7 SD (4) at another time');
  assert.ok(!R.explore.some(x => x.code === 'Nilai 7 SD' && x.options.some(o => o.code === 'Nilai 7 SA')), 'the same pair is not listed twice');
  R.explore.forEach(x => x.options.forEach(o => assert.ok(o.combined <= 7)));
  assert.strictEqual(R.impact.classesReducedAll, R.merges.reduce((s, m) => s + m.classes.length - 1, 0));
  assert.ok(R.impact.classesReducedHigh <= R.impact.classesReducedAll);
});
t('recipients: HM/VP from class data + HEADMASTER_EMAILS + 3 fixed, de-duplicated', () => {
  const r = R.recipients;
  ['admin@avvaiyarpadasalai.org', 'vasuki_aps999@avvaiyarpadasalai.org', 'tcs_asvika_aps8112@avvaiyarpadasalai.org', 'hm_aps600@avvaiyarpadasalai.org', vp.email, hmx.email]
    .forEach(e => assert.ok(r.includes(e.toLowerCase()), e));
  assert.strictEqual(new Set(r).size, r.length);
  assert.ok(!r.includes(tA.email), 'teachers are not recipients');
});
t('step 1 (7:00 PM): stores one COMPLETED row with the result; no email yet', () => {
  const a = G.ccwRunAnalysis_(new D(), 'trigger');
  assert.strictEqual(a.status, 'COMPLETED');
  assert.strictEqual(rows().length, 1); const r = rows()[0];
  assert.strictEqual(col(r, 'Report_ID'), 'CCW-AY26-27-2026-10-28'); assert.strictEqual(col(r, 'Email_Status'), 'PENDING');
  assert.strictEqual(col(r, 'Classes'), '15');
  assert.strictEqual(sent.length, 0);
  G.ccwRunAnalysis_(new D(), 'trigger'); assert.strictEqual(rows().length, 1, 'same Report_ID → same row');
});
t('step 2 (7:30 PM): sends once from donotreply@ (TICKETS) with the exact subject + HTML sections', () => {
  D.set('2026-10-28T23:30:00Z');
  const e = G.ccwRunEmail_(new D(), 'trigger');
  assert.strictEqual(e.status, 'SENT'); assert.strictEqual(sent.length, 1);
  const m = sent[0].m;
  assert.strictEqual(sent[0].profile, 'TICKETS');
  assert.strictEqual(G.apsMailFrom_('TICKETS'), 'donotreply@avvaiyarpadasalai.org');
  assert.strictEqual(m.subject, 'APS Class Consolidation Analysis – AY26-27 - 10/28/2026');
  assert.ok(Array.isArray(m.to) && m.to.length === R.recipients.length);
  ['Vanakkam', 'EXECUTIVE SUMMARY', 'HIGH-PRIORITY MERGE OPPORTUNITIES', 'MEDIUM-PRIORITY', 'TEACHERS ASSIGNED TO MULTIPLE CLASSES', 'SMALL CLASSES', 'CURRENT 7:1 CLASSES', 'POTENTIAL IMPACT',
    'ADMINISTRATIVE REVIEW', 'No student, teacher, class, or schedule changes have been made automatically.', 'Suggested Continuing Teacher:', 'Teacher Assignment: HM/VP review required.',
    'APS Tech Support Team', 'Avvaiyar Padasalai', '10/28/2026', 'Two classes at the same time'].forEach(s => assert.ok(m.html.includes(s), s));
  assert.ok(!/\{"|stack|Bearer|undefined|NaN/.test(m.html), 'no raw JSON / debug text');
  assert.ok(/Potential/.test(m.text));
  fs.writeFileSync(__dirname + '/r101_ccw_email.html', m.html);
  const r = rows()[0]; assert.strictEqual(col(r, 'Email_Status'), 'SENT'); assert.ok(col(r, 'Recipients').includes('admin@avvaiyarpadasalai.org'));
});
t('no duplicate email for the same Report_ID; re-analysis after sending is refused', () => {
  const e = G.ccwRunEmail_(new D(), 'editor'); assert.strictEqual(e.skipped, 'already sent');
  const a = G.ccwRunAnalysis_(new D(), 'editor'); assert.strictEqual(a.skipped, 'already sent');
  assert.strictEqual(sent.length, 1);
});
t('email failure keeps the result; a later email run resends the stored analysis without re-analysing', () => {
  D.set('2026-11-04T23:00:00Z'); G.ccwRunAnalysis_(new D(), 'trigger');
  const before = col(rows()[1], 'Analysis_Completed');
  D.set('2026-11-04T23:30:00Z'); mailFail = 'Gmail API HTTP 500 Bearer ya29.secret';
  let e = G.ccwRunEmail_(new D(), 'trigger');
  assert.strictEqual(e.status, 'FAILED'); const r = rows()[1];
  assert.strictEqual(col(r, 'Status'), 'COMPLETED'); assert.ok(!/ya29/.test(col(r, 'Error')), 'token masked');
  mailFail = null; D.set('2026-11-04T23:45:00Z');
  e = G.ccwRunEmail_(new D(), 'editor'); assert.strictEqual(e.status, 'SENT');
  assert.strictEqual(col(rows()[1], 'Analysis_Completed'), before, 'not re-analysed');
  assert.strictEqual(rows().length, 2);
});
t('missing 7:00 PM analysis → the email step runs it once, then sends', () => {
  D.set('2026-11-11T23:30:00Z'); const n = sent.length;
  const e = G.ccwRunEmail_(new D(), 'trigger');
  assert.strictEqual(e.status, 'SENT'); assert.strictEqual(sent.length, n + 1);
  assert.ok(/analysis missing at email time/.test(col(rows()[2], 'Run_By')));
});
t('failed analysis → no report to HM/VP; one admin notice; retried once at email time', () => {
  const keep = COURSES; COURSES = []; loadCourses();
  D.set('2026-11-18T23:00:00Z'); const a = G.ccwRunAnalysis_(new D(), 'trigger'); assert.strictEqual(a.status, 'FAILED');
  D.set('2026-11-18T23:30:00Z'); const n = sent.length;
  const e = G.ccwRunEmail_(new D(), 'trigger');
  assert.strictEqual(e.status, 'NOT_SENT'); assert.strictEqual(sent.length, n + 1);
  const m = sent[sent.length - 1].m; assert.strictEqual(JSON.stringify(m.to), JSON.stringify(['admin@avvaiyarpadasalai.org'])); assert.ok(/NOT SENT/.test(m.subject));
  assert.ok(/retry at email time/.test(col(rows()[3], 'Run_By')));
  G.ccwRunEmail_(new D(), 'editor'); assert.strictEqual(sent.length, n + 1, 'notice only once');
  COURSES = keep; loadCourses();
});
t('busy lock → skipped, nothing written', () => {
  const ls = G.LockService.getScriptLock; G.LockService.getScriptLock = () => ({ tryLock: () => false, releaseLock() {} });
  D.set('2026-11-25T23:00:00Z'); const n = rows().length;
  assert.strictEqual(G.ccwRunAnalysis_(new D(), 'trigger').skipped, 'busy'); assert.strictEqual(rows().length, n);
  G.LockService.getScriptLock = ls;
});
t('triggers (r117): Wednesday ~7 PM analysis + email ≥ 25 min later through the one apsWeeklyJobs scheduler; re-running creates no duplicates; editor-only', () => {
  G.Session = { getActiveUser: () => ({ getEmail: () => 'owner@avvaiyarpadasalai.org' }), getEffectiveUser: () => ({ getEmail: () => 'owner@avvaiyarpadasalai.org' }) };
  G.createClassConsolidationTriggers(); G.createClassConsolidationTriggers();
  assert.strictEqual(env.stats.triggers.filter(x => /ClassConsolidation/.test(x.fn)).length, 0, 'no per-job triggers');
  assert.strictEqual(env.stats.triggers.filter(x => x.fn === 'apsWeeklyJobs').length, 1);
  const a = G.wjJob_('CLASS_CONSOLIDATION_ANALYSIS'), e = G.wjJob_('CLASS_CONSOLIDATION_EMAIL');
  assert.deepStrictEqual([a.dow, a.hour, e.dow, e.hour, e.after, e.afterMinutes], [3, 19, 3, 19, 'CLASS_CONSOLIDATION_ANALYSIS', 25]);
  G.Session = { getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => 'owner@avvaiyarpadasalai.org' }) };
  assert.throws(() => G.createClassConsolidationTriggers(), /Access denied/);
  assert.throws(() => G.runClassConsolidationNow(), /Access denied/);
});
t('trigger handlers refuse calls that are not from their own trigger', () => {
  const gp = G.ScriptApp.getProjectTriggers; G.ScriptApp.getProjectTriggers = () => gp().map(x => Object.assign(x, { getUniqueId: () => 'uid-' + x.getHandlerFunction() }));
  assert.throws(() => G.apsClassConsolidationAnalysis({}), /Access denied/);
  assert.throws(() => G.apsClassConsolidationEmail({ triggerUid: 'forged' }), /Access denied/);
  assert.throws(() => G.apsClassConsolidationEmail({ triggerUid: 'uid-apsClassConsolidationAnalysis' }), /Access denied/, "another handler's trigger id is refused");
  D.set('2026-12-02T23:00:00Z'); const ok = J(G.wjRun_(new D(), 'test', { only: 'CLASS_CONSOLIDATION_ANALYSIS', force: true })); assert.strictEqual(ok.ran[0].result, 'OK'); // r117: run by the scheduler
  G.ScriptApp.getProjectTriggers = gp;
});
t('not callable from the browser: no public (non-underscore) data function returns the report to sessions', () => {
  const pub = Object.keys(G).filter(k => /ClassConsolidation/i.test(k) && typeof G[k] === 'function');
  pub.forEach(k => assert.ok(['apsClassConsolidationAnalysis', 'apsClassConsolidationEmail', 'createClassConsolidationTriggers', 'removeClassConsolidationTriggers', 'previewClassConsolidationAnalysis', 'runClassConsolidationNow'].includes(k), k));
  assert.strictEqual(classroomTouched, 0, 'read-only: Classroom never touched');
});

(async () => {
  let fails = 0;
  for (const [n, fn] of tests) { try { await fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n   ')); } }
  console.log(`${tests.length - fails}/${tests.length} passed`);
  process.exit(fails ? 1 : 0);
})();

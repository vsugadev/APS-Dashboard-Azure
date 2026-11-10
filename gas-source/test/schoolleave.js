// r109 — APS School Leave (Phase 1): central service + guards on attendance capture, weekly attendance report,
// Teacher Availability report, PTA "Start Google Meet", Daily Summary; dashboard banner. (node test/schoolleave.js)
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { makeContext, Sheet } = require('./gasmock');
const { courses, audit } = require('./fixtures');
Sheet.prototype.getMaxRows = function () { return 5000; };
const code = fs.readFileSync(__dirname + '/../Code.gs', 'utf8');
function clock(iso) { let NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } static set(i) { NOW = new Date(i).getTime(); } } return D; }
function boot(iso, opts) { opts = opts || {}; const D = clock(iso); opts.Date = D; const env = makeContext(opts); vm.runInContext(code, env.ctx, { filename: 'Code.gs' }); env.D = D; owner(env); return env; }
function owner(env) { env.ctx.Session = { getActiveUser: () => ({ getEmail: () => 'info@avvaiyarpadasalai.org' }), getEffectiveUser: () => ({ getEmail: () => 'info@avvaiyarpadasalai.org' }) }; }
function seed(env, list) { const sh = env.wb.insertSheet('Courses'); sh.data[0] = new Array(18).fill('h'); (list || courses).forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); sh.data[i + 1] = row; }); }
function reboot(prev, iso) { const env = boot(iso, { auditItems: audit, props: prev.props }); env.wb.sheets = prev.wb.sheets; Object.values(env.wb.sheets).forEach(s => s.wb = env.wb); Object.assign(env.cache, prev.cache); return env; }
const J = x => JSON.parse(JSON.stringify(x));
const tests = []; const t = (n, fn) => tests.push([n, fn]);
const attRows = env => { const H = env.ctx.ATTENDANCE_HEADER_ROW; return Object.values(env.wb.sheets).filter(s => /^AWK\d+ATT$/.test(s.name)).flatMap(s => s.data.slice(1).filter(r => r && r.some(Boolean)).map(r => ({ date: env.ctx.attCellToText_(r[0], 'date', 'America/New_York'), course: String(r[1]), role: r[H.indexOf('Role')], status: r[H.indexOf('Attendance Status')] }))); };
const NOV = ['APS Virtual School Holiday', '2026-11-06', '2026-11-08', 'APS Virtual School Holiday', 'School Holiday'];

// ---------------------------------------------------------------- service
t('Tests A–E: Nov 5 normal; Nov 6, 7, 8 on leave (whole days, America/New_York); Nov 9 normal again', () => {
  const env = boot('2026-11-04T15:00:00Z'); const G = env.ctx;
  G.addSchoolLeaveNow(...NOV);
  assert.deepStrictEqual(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'].map(d => G.isAPSSchoolHoliday(d)), [false, true, true, true, false]);
  // Date objects at the day edges, Eastern time (EST after Nov 1)
  assert.strictEqual(G.isAPSSchoolHoliday(new Date('2026-11-06T05:05:00Z')), true, 'Fri 12:05 AM EST');
  assert.strictEqual(G.isAPSSchoolHoliday(new Date('2026-11-06T04:55:00Z')), false, 'Thu 11:55 PM EST');
  assert.strictEqual(G.isAPSSchoolHoliday(new Date('2026-11-09T04:55:00Z')), true, 'Sun 11:55 PM EST');
  assert.strictEqual(G.isAPSSchoolHoliday(new Date('2026-11-09T05:05:00Z')), false, 'Mon 12:05 AM EST');
  const s = J(G.getAPSSchoolLeaveStatus('2026-11-07'));
  assert.deepStrictEqual([s.isSchoolLeave, s.leaveTitle, s.startDate, s.endDate, s.reason, s.leaveType], [true, 'APS Virtual School Holiday', '2026-11-06', '2026-11-08', 'APS Virtual School Holiday', 'School Holiday']);
  assert.strictEqual(J(G.getAPSSchoolLeaveStatus('2026-11-09')).isSchoolLeave, false);
});
t('Test I + J: back-to-back leaves → one continuous period; cancelling one resumes only its dates; DRAFT never counts', () => {
  const env = boot('2026-11-04T15:00:00Z'); const G = env.ctx;
  G.addSchoolLeaveNow(...NOV);
  const b = G.addSchoolLeaveNow('Thanksgiving break', '2026-11-09', '2026-11-10', 'Thanksgiving break', 'Festival Holiday');
  assert.deepStrictEqual(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11'].map(d => G.isAPSSchoolHoliday(d)), [true, true, true, false]);
  assert.strictEqual(J(G.getAPSSchoolLeaveStatus('2026-11-07')).periodEndDate, '2026-11-10', 'banner shows the whole continuous period');
  G.cancelSchoolLeaveNow(b.leaveId);
  assert.deepStrictEqual(['2026-11-08', '2026-11-09'].map(d => G.isAPSSchoolHoliday(d)), [true, false], 'cancelled leave: activities resume for its dates only');
  const sh = env.wb.sheets.APS_SCHOOL_LEAVES; const H = sh.data[0];
  const row = H.map(h => ({ Leave_ID: 'SL-DRAFT', Leave_Title: 'Draft', Start_Date: '2026-11-20', End_Date: '2026-11-20', Reason: 'x', Leave_Type: 'Other', Status: 'DRAFT' }[h] || ''));
  sh.data.push(row); G.slInvalidate_();
  assert.strictEqual(G.isAPSSchoolHoliday('2026-11-20'), false, 'draft ignored');
});
t('Test K: cache — one sheet read, then cached; any write invalidates immediately; kill switch APS_SCHOOL_LEAVE_ENABLED=false', () => {
  const env = boot('2026-11-04T15:00:00Z'); const G = env.ctx;
  G.addSchoolLeaveNow(...NOV);
  G.isAPSSchoolHoliday('2026-11-07');
  G.SL_MEMO_.list = null; // new execution: memo empty, cache warm
  const sh = env.wb.sheets.APS_SCHOOL_LEAVES; const saved = sh.data; sh.data = [saved[0]];
  assert.strictEqual(G.isAPSSchoolHoliday('2026-11-07'), true, 'served from CacheService without reading the sheet');
  sh.data = saved;
  const id = G.listSchoolLeavesNow()[0].Leave_ID; G.cancelSchoolLeaveNow(id);
  G.SL_MEMO_.list = null;
  assert.strictEqual(G.isAPSSchoolHoliday('2026-11-07'), false, 'cancel invalidated the cache at once');
  G.addSchoolLeaveNow('Again', '2026-11-06', '2026-11-08', 'again', 'Other'); assert.strictEqual(G.isAPSSchoolHoliday('2026-11-07'), true, 'add invalidated the cache at once');
  env.props.APS_SCHOOL_LEAVE_ENABLED = 'false'; G.SL_MEMO_.enabled = null;
  assert.strictEqual(G.isAPSSchoolHoliday('2026-11-07'), false, 'kill switch = old behaviour');
});
t('validation + duplicates + editor-only', () => {
  const env = boot('2026-11-04T15:00:00Z'); const G = env.ctx;
  assert.throws(() => G.addSchoolLeaveNow('X', '2026-11-08', '2026-11-06', 'r', 'Other'), /not be later/);
  assert.throws(() => G.addSchoolLeaveNow('', '2026-11-06', '2026-11-08', 'r', 'Other'), /Title is required/);
  assert.throws(() => G.addSchoolLeaveNow('X', '2026-11-06', '2026-11-08', '', 'Other'), /Reason/);
  assert.throws(() => G.addSchoolLeaveNow('X', '2026-11-06', '2026-11-08', 'r', 'Party'), /Unknown Leave Type/);
  G.addSchoolLeaveNow(...NOV); assert.throws(() => G.addSchoolLeaveNow(...NOV), /already exists/);
  const ov = G.addSchoolLeaveNow('Overlap', '2026-11-07', '2026-11-09', 'r', 'Other'); assert.strictEqual(ov.overlaps.length, 1, 'overlap reported');
  env.ctx.Session = { getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => 'info@avvaiyarpadasalai.org' }) };
  assert.throws(() => G.addSchoolLeaveNow('Y', '2026-12-01', '2026-12-01', 'r', 'Other'), /Access denied/);
  assert.throws(() => G.cancelSchoolLeaveNow('x'), /Access denied/);
  const audit = env.wb.sheets.APS_SCHOOL_LEAVE_AUDIT_LOG.data.slice(1).map(r => r[2]); assert.ok(audit.filter(a => a === 'CREATED_APPROVED_EDITOR').length === 2);
});

// ---------------------------------------------------------------- attendance capture (real sync) + weekly report
function runWeek3(withLeave) {
  let env = boot('2026-09-12T18:00:00Z', { auditItems: audit }); seed(env);
  if (withLeave) env.ctx.addSchoolLeaveNow('Holiday', withLeave[0], withLeave[1], 'School holiday', 'School Holiday');
  env.ctx.syncAttendanceForAllCourses();
  env = reboot(env, '2026-09-19T18:00:00Z'); env.ctx.syncAttendanceForAllCourses();
  env = reboot(env, '2026-09-26T18:00:00Z'); env.ctx.syncAttendanceForAllCourses();
  return env;
}
t('attendance capture (real sync): a leave date writes NO rows (not ABSENT); other dates unchanged; never back-filled', () => {
  const ctl = runWeek3(null), lv = runWeek3(['2026-09-25', '2026-09-25']);
  const byDate = rows => rows.reduce((o, r) => (o[r.date] = (o[r.date] || 0) + 1, o), {});
  const c = byDate(attRows(ctl)), l = byDate(attRows(lv));
  assert.ok(c['2026-09-25'] > 0 && c['2026-09-26'] > 0, 'control has both days: ' + JSON.stringify(c));
  assert.strictEqual(l['2026-09-25'], undefined, 'no rows at all for the leave date');
  assert.strictEqual(l['2026-09-26'], c['2026-09-26'], 'the next day is captured exactly as before');
  assert.strictEqual(l['2026-09-11'], c['2026-09-11'], 'earlier weeks unchanged');
  const lv2 = reboot(lv, '2026-10-03T18:00:00Z'); lv2.ctx.syncAttendanceForAllCourses();
  assert.strictEqual(byDate(attRows(lv2))['2026-09-25'], undefined, 'later runs do not back-fill the leave date');
  const skip = lv.wb.sheets.APS_SCHOOL_LEAVE_AUDIT_LOG.data.slice(1).filter(r => r[2] === 'SKIPPED_SCHOOL_LEAVE' && r[3] === 'ATTENDANCE_CAPTURE');
  assert.strictEqual(skip.length, 1, 'SKIPPED_SCHOOL_LEAVE logged once per area + date (not per class / run)');
});
t('a whole holiday weekend with nobody in Meet: control writes ABSENT for everyone; with leave → nothing', () => {
  const ctl = boot('2026-09-12T18:00:00Z', { auditItems: [] }); seed(ctl); ctl.ctx.syncAttendanceForAllCourses();
  const lv = boot('2026-09-12T18:00:00Z', { auditItems: [] }); seed(lv); lv.ctx.addSchoolLeaveNow('Holiday', '2026-09-11', '2026-09-13', 'r', 'School Holiday'); lv.ctx.syncAttendanceForAllCourses();
  const absent = attRows(ctl).filter(r => r.role === 'STUDENT' && r.status === 'ABSENT');
  assert.ok(absent.length > 0, 'without the leave every student is ABSENT ("No Meet activity found")');
  assert.strictEqual(attRows(lv).length, 0, 'with the leave: no rows');
});
t('weekly attendance report (Mon 7 AM): a class whose only class date that week was leave gets no report; others unchanged', () => {
  const mails = env => env.stats.mails.map(m => m.subject).filter(s => /NILAI|MAZHALAI/.test(s)).sort();
  const send = prev => { const e = boot('2026-09-28T11:00:00Z', { auditItems: audit, props: prev.props }); e.wb.sheets = prev.wb.sheets; Object.values(e.wb.sheets).forEach(s => s.wb = e.wb); Object.assign(e.cache, prev.cache); e.ctx.sendWeeklyAttendanceReports(); return e; };
  const c = send(runWeek3(null)), l = send(runWeek3(['2026-09-25', '2026-09-25']));
  const cm = mails(c), lm = mails(l);
  assert.ok(cm.some(s => /MAZHALAI - CB/.test(s)) && cm.some(s => /NILAI 3 - A/.test(s)), JSON.stringify(cm));
  assert.ok(!lm.some(s => /MAZHALAI - CB/.test(s)), 'Friday class (leave) — no report');
  assert.ok(lm.some(s => /NILAI 3 - A/.test(s)), 'Saturday class — report as before');
});

// ---------------------------------------------------------------- Teacher Availability, PTA, Daily Summary
t('Teacher Availability report (Tue–Fri 6 PM) for the holiday week: skipped and logged; the next week runs normally', () => {
  const env = boot('2026-11-03T23:05:00Z', { props: { APS_CLASS_TEACHER_AVAILABILITY_EMAIL_TO: 'admin@avvaiyarpadasalai.org' } }); seed(env); const G = env.ctx; // Tue Nov 3, 6:05 PM EST
  G.addSchoolLeaveNow(...NOV);
  const r = J(G.ctaRunScheduled_(new env.D(), 'trigger'));
  assert.strictEqual(r.skipped, 'SKIPPED_SCHOOL_LEAVE', JSON.stringify(r));
  assert.strictEqual(env.stats.mails.length, 0, 'no availability email for the holiday week');
  const m = G.ctaBuildReport_(new env.D()); assert.strictEqual(m.summary.total, 0, 'holiday-week classes left out of the report');
  env.D.set('2026-11-10T23:05:00Z'); // Tue Nov 10 → week of Nov 13
  const r2 = J(G.ctaRunScheduled_(new env.D(), 'trigger'));
  assert.ok(!r2.skipped || r2.skipped !== 'SKIPPED_SCHOOL_LEAVE', JSON.stringify(r2));
  assert.ok(G.ctaBuildReport_(new env.D()).summary.total > 0, 'normal week: classes back in the report');
});
t('PTA "Start Google Meet" (Fri / Sat / Sun): holiday classes are not listed, their teachers are not emailed', () => {
  const env = boot('2026-11-06T22:00:00Z'); seed(env); const G = env.ctx; // Fri Nov 6, 5:00 PM EST
  const tw = G.getOrCreateTeacherAvailabilitySheet_();
  courses.slice(0, 2).forEach(c => tw.appendRow(['WK-2026-11-06', (c.teachers[0] || {}).email || 't@aps.org', 'T', c.id, c.name, '', 'not_available', 'parent_teacher_arranged', new Date().toISOString(), 'hm@aps.org', 'HM']));
  const before = J(G.ptaRunWindow_('FRIDAY', new env.D(), { dryRun: true, runBy: 'test' }));
  G.addSchoolLeaveNow(...NOV);
  const after = J(G.ptaRunWindow_('FRIDAY', new env.D(), { dryRun: true, runBy: 'test' }));
  assert.ok(before.classes.length > 0, 'control: PTA classes listed ' + JSON.stringify(before.stats));
  assert.strictEqual(after.classes.length, 0); assert.strictEqual(after.stats.schoolLeave, before.classes.length);
});
t('Daily Summary (r106): a leave date has no classes → no report, no row, no attendance capture', () => {
  const env = boot('2026-11-07T12:00:00Z'); seed(env); const G = env.ctx;
  let syncs = 0; G.syncAttendanceForAllCourses_ = () => { syncs++; return {}; };
  assert.ok(G.dsClassesOn_('2026-11-06').length > 0, 'control: Friday class exists');
  G.addSchoolLeaveNow(...NOV);
  assert.strictEqual(G.dsClassesOn_('2026-11-06').length, 0);
  assert.deepStrictEqual(J(G.dsRunDaily_('2026-11-06', new env.D())), { key: '2026-11-06 | DAILY', skipped: 'no class' });
  assert.ok(/skipped/.test(JSON.stringify(G.dsPrep_(new env.D())))); assert.strictEqual(syncs, 0, 'no capture for the leave date');
  assert.ok(G.dsClassesOn_('2026-11-13').length > 0, 'next Friday normal');
});

// ---------------------------------------------------------------- banner data (every signed-in role)
t('banner: getDashboardData carries the active leave for every role on Nov 7; nothing on Nov 9; no editing rights', () => {
  const env = boot('2026-11-07T15:00:00Z'); seed(env); const G = env.ctx;
  G.addSchoolLeaveNow(...NOV);
  const tok = (email, role) => { const k = 'tok_' + role; env.cache['aps_sess_' + k] = JSON.stringify({ email, role }); return k; };
  [['admin@aps.org', 'admin'], ['t1@aps.org', 'teacher'], ['s1@aps.org', 'student']].forEach(([e, r]) => {
    const d = J(G.getDashboardData(tok(e, r))); assert.strictEqual(d.schoolLeave.isSchoolLeave, true, r); assert.strictEqual(d.schoolLeave.endDate, '2026-11-08');
  });
  env.D.set('2026-11-09T15:00:00Z'); G.SL_MEMO_.list = null;
  assert.strictEqual(J(G.getDashboardData(tok('admin@aps.org', 'admin'))).schoolLeave.isSchoolLeave, false);
});

let fails = 0;
for (const [n, fn] of tests) { try { fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 6).join('\n   ')); } }
console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);

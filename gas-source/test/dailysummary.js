// r105/r106 — Daily Class Management Summary & Review (Tamil) + Monthly report; r106: next-morning schedule + catch-up (node test/dailysummary.js)
const fs = require('fs'); const vm = require('vm'); const assert = require('assert');
const { makeContext, Sheet } = require('./gasmock');
const tests = []; const t = (name, fn) => tests.push([name, fn]);
function fixedDate(iso) { let NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } static set(i) { NOW = new Date(i).getTime(); } } return D; }
Sheet.prototype.getMaxRows = function () { return 5000; };
const D = fixedDate('2026-10-31T11:00:00Z'); // Sat Oct 31 2026, 7:00 AM EDT
const env = makeContext({ Date: D, props: { APS_ENVIRONMENT: 'LIVE' } });
env.ctx.ScriptApp.WeekDay.WEDNESDAY = 'WEDNESDAY';
let classroomTouched = 0;
env.ctx.Classroom = new Proxy({}, { get() { classroomTouched++; throw new Error('Classroom API must not be used'); } });
vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), env.ctx, { filename: 'Code.gs' });
const G = env.ctx, DOM = '@avvaiyarpadasalai.org';
const P = (n, k) => Array.from({ length: n }, (_, i) => ({ name: 'Stu ' + k + i, email: 'stu' + k + i + '_aps' + (4000 + i) + DOM }));
const T = (name, id) => ({ name, email: name.toLowerCase().replace(/\s+/g, '') + '_aps' + id + DOM });
const tA = T('Anbu', 801), tB = T('Bala Teacher', 802), tC = T('Chitra Teacher', 803), tS = T('Sat Teacher', 804), tU = T('Sun Teacher', 805), tM = T('Mon Teacher', 806), tT = T('Tue Teacher', 807);
const C = (id, name, teacher, n) => ({ id, name: name + ' | AY26-27', courseState: 'ACTIVE', teachers: [teacher], students: P(n, id), classSupport: [{ email: teacher.email, roles: ['PRIMARY_TEACHER'] }] });
const COURSES = [
  C('F1', 'NILAI 1 - EN | FRI 6:30 - 8:00 PM EST', tA, 3),
  C('F2', 'NILAI 2 - EA | FRI 6:30 - 8:00 PM EST', tB, 4),
  C('F3', 'NILAI 3 - PA | FRI 9:00 - 10:30 PM EST', tC, 2),
  C('F9', 'NILAI 99 - TEST | FRI 6:30 - 8:00 PM EST', tA, 1),
  C('S1', 'NILAI 4 - LA | SAT 12:00 - 1:30 PM EST', tS, 5),
  C('U1', 'NILAI 5 - SA | SUN 7:30 - 9:00 PM EST', tU, 3),
  C('M1', 'NILAI 6 - MA | MON 7:00 - 8:30 PM EST', tM, 2),
  C('T1', 'NILAI 7 - TA | TUE 7:00 - 8:30 PM EST', tT, 2)
];
const cs = env.wb.insertSheet('Courses'); cs.data[0] = new Array(18).fill('h');
COURSES.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); cs.data[i + 1] = row; });
// attendance (the AWK sheet reader is existing, tested code — feed it the day's rows)
let ATT = [];
const stu = (cid, i, status) => ({ date: CUR, courseId: cid, role: 'STUDENT', email: 'stu' + cid + i + '_aps' + (4000 + i) + DOM, status, overrideStatus: '', activeMinutes: status === 'ABSENT' ? 0 : 80, firstJoin: '18:31' });
const tea = (cid, email, join) => ({ date: CUR, courseId: cid, role: 'TEACHER', email, status: 'PRESENT', overrideStatus: '', activeMinutes: 85, firstJoin: join });
let CUR = '2026-10-30';
G.attReadRecordsForSheets_ = names => { const o = {}; names.forEach(n => { o[n] = ATT.filter(r => true); }); return o; };
let syncCalls = 0; G.syncAttendanceForAllCourses_ = () => { syncCalls++; return { at: new Date().toISOString(), occurrencesCaptured: 3, coursesFailed: 0 }; };
// teacher availability (real sheet), temp teacher, class coverage tracking
const tw = G.getOrCreateTeacherAvailabilitySheet_();
const avail = (wk, c, status, alt) => tw.appendRow([wk, c.teachers[0].email, c.teachers[0].name, c.id, c.name, '', status, alt || '', new Date().toISOString(), 'hm@aps.org', 'HM']);
avail('WK-2026-10-30', COURSES[1], 'confirmed'); avail('WK-2026-10-30', COURSES[2], 'not_available', 'need_hm_support'); // F1 not set
const ttm = G.ttmSheet_(); const H = vm.runInContext('TTM_HEADER_', env.ctx);
const ttRow = o => H.map(h => o[h] === undefined ? '' : o[h]);
ttm.getRange(1, 1, 1, H.length).setValues([H]);
ttm.appendRow(ttRow({ Assignment_ID: 'TT1', Classroom_ID: 'F3', Classroom_Name: COURSES[2].name, Primary_Teacher_Name: 'Chitra Teacher', Temp_Teacher_Name: 'Temp Kumar', Temp_Teacher_Email: 'tempk_aps900' + DOM, Start_Date: '2026-10-30', Removal_Date: '2026-10-31', Reason: 'Teacher on leave this week', Status: 'ACTIVE' }));
const CCTH = vm.runInContext('CCT_HEADER_', env.ctx), CCTS = vm.runInContext('CCT_SHEET_', env.ctx);
const cct = G.ctaSheet_(CCTS, CCTH); const r0 = new Array(CCTH.length).fill(''); r0[0] = 'CCT1'; r0[1] = 'WK-2026-10-30'; r0[2] = 'F3'; r0[7] = 'PENDING_COVERAGE'; cct.appendRow(r0);
// mail capture
const sent = []; let failNext = false;
G.apsGmailSend_ = (profile, m) => { if (/Class Summary/.test(m.subject)) { if (failNext) { failNext = false; return { ok: false, error: 'Gmail API HTTP 500' }; } sent.push({ profile, m }); return { ok: true, mode: 'GMAIL_API' }; } return { ok: true }; };
const rows = tab => { const s = env.wb.sheets[tab]; if (!s) return []; const h = s.data[0]; return s.data.slice(1).filter(r => r && r.some(Boolean)).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const at = iso => D.set(iso);
const morning = () => JSON.parse(JSON.stringify(G.dsMorning_(new D())));
const month = () => JSON.parse(JSON.stringify(G.dsMonthlyMorning_(new D())));
const subjects = from => sent.slice(from).map(x => x.m.subject);
const withUids = fn => { const gp = G.ScriptApp.getProjectTriggers; G.ScriptApp.getProjectTriggers = () => gp().map(x => Object.assign(x, { getUniqueId: () => 'uid-' + x.getHandlerFunction() })); try { return fn(); } finally { G.ScriptApp.getProjectTriggers = gp; } };

t('Saturday ~7:00 AM (APS time): FRIDAY\'s Tamil report saved + emailed once from donotreply@ to board@ + admin@ with the exact subject', () => {
  CUR = '2026-10-30';
  ATT = [tea('F2', tB.email, '18:45'), stu('F2', 0, 'PRESENT'), stu('F2', 1, 'PRESENT'), stu('F2', 2, 'PARTIAL'), stu('F2', 3, 'ABSENT'), tea('F3', tC.email, '21:00'), stu('F3', 0, 'ABSENT'), stu('F3', 1, 'ABSENT')];
  at('2026-10-31T11:00:00Z'); // Sat 7:00 AM EDT
  const r = morning();
  assert.strictEqual(r.daily.find(x => x.generated).key, '2026-10-30 | DAILY', JSON.stringify(r));
  assert.strictEqual(sent.length, 1);
  const m = sent[0].m;
  assert.strictEqual(sent[0].profile, 'TICKETS'); assert.strictEqual(G.apsMailFrom_('TICKETS'), 'donotreply@avvaiyarpadasalai.org');
  assert.strictEqual(m.subject, 'APS Daily Class Summary & Review - Friday, October 30, 2026 - Management Report');
  assert.strictEqual(JSON.stringify(Array.from(m.to)), JSON.stringify(['board@amchats.org', 'admin@avvaiyarpadasalai.org']));
  const txt = m.text;
  ['வணக்கம்,', 'அக்டோபர் 30 வெள்ளிக்கிழமை அன்று APS-இல் 3 வகுப்புகள் திட்டமிடப்பட்டிருந்தன; அவற்றில் 9 மாணவர்கள்', 'பங்கேற்பு பதிவுள்ள 6 மாணவர்களில் 3 பேர் கலந்து கொண்டனர் (50%)',
   'வகுப்பு நிலவரம் – அக்டோபர் 30 வெள்ளிக்கிழமை', 'நேர வரிசை', 'மாலை 6:30', 'இரவு 9:00', 'ஆசிரியர் கிடைப்புத் (Teacher Availability) சுருக்கம்', 'Available (உறுதிசெய்தவை): 1', 'Not Available: 1', 'Not Set (பதில் இல்லை): 1',
   'Temporary Teacher Assignment சுருக்கம்', 'NILAI 3 - PA: Temp Kumar', 'Coverage இன்னும் நிலுவையில் (Pending): NILAI 3 - PA',
   'சரியாக நடக்காதவை / கவனிக்க வேண்டியவை', 'NILAI 3 - PA', 'பங்கேற்பு பதிவு கிடைக்கவில்லை', 'NILAI 1 - EN', 'தாமதமாக இணைந்த ஆசிரியர்கள்: NILAI 2 - EA (15 நிமி.)',
   'Management / HM / VP நடவடிக்கை தேவை', 'NILAI 1 - EN வகுப்பு நடைபெற்றதா என்பதை HM உறுதிசெய்யவும்', 'அடுத்த வகுப்பிற்கு மேம்படுத்த வேண்டியவை', 'நன்றி,', 'APS தொழில்நுட்ப உதவிக் குழு', 'ஔவையார் பாடசாலை']
    .forEach(x => assert.ok(txt.includes(x), 'text: ' + x));
  assert.ok(!/இன்று|இன்றைய/.test(txt), 'sent the morning after: never says "today"');
  assert.ok(!/NILAI 99/.test(txt), 'test classroom excluded');
  assert.ok(!/நடத்தவில்லை|was absent|did not conduct/.test(txt), 'never concludes a class/teacher did not happen from missing data');
  assert.ok(!/N\/A|Nothing to report|No issues/.test(txt), 'no filler');
  assert.ok(m.html.includes('Management / HM / VP நடவடிக்கை தேவை'));
  assert.ok(txt.includes('NILAI 3 - PA: பதிவான மாணவர்கள் யாரும் பங்கேற்கவில்லை') && !/NILAI 3 - PA வகுப்பு நடைபெற்றதா/.test(txt), 'zero-present class gets the right action');
  assert.ok(!/தேர்வு பதிவுகளைப் படிக்க/.test(txt), 'exam module not configured → silent');
  if (process.env.DS_DUMP) fs.writeFileSync(process.env.DS_DUMP, m.html);
  const row = rows('Daily Summary'); assert.strictEqual(row.length, 1);
  const x = row[0];
  assert.deepStrictEqual([x['Report Key'], x['Report Type'], x['Day'], x['Class Count'], x['Student Count'], x['Students With Attendance Records'], x['Students Present'], x['Attendance %'], x['Available Teachers'], x['Not Available Teachers'], x['Availability Not Set'], x['Temporary Teacher Assignments'], x['Email Sent']],
    ['2026-10-30 | DAILY', 'DAILY', 'Friday', '3', '9', '6', '3', '50', '1', '1', '1', '1', 'TRUE']);
  assert.strictEqual(x['Full Tamil Report'], txt, 'the exact report sent is stored');
  assert.ok(x['Attention Classes'].includes('NILAI 1 - EN') && x['Availability Not Set Classes'] === 'NILAI 1 - EN');
  assert.strictEqual(classroomTouched, 0, 'no Google Classroom calls');
});
t('duplicate run: no second email, no second row', () => {
  at('2026-10-31T11:10:00Z'); morning(); morning();
  assert.strictEqual(sent.length, 1); assert.strictEqual(rows('Daily Summary').length, 1);
});
t('Oct 31 (Saturday, last day of the month): the monthly waits for Saturday\'s daily, then is sent once on Nov 1 ~8 AM; a failed daily email is resent next morning without a new report', () => {
  CUR = '2026-10-31'; ATT = [tea('S1', tS.email, '12:00'), ...[0, 1, 2, 3, 4].map(i => stu('S1', i, 'PRESENT'))];
  at('2026-11-01T11:00:00Z'); // Sun Nov 1, 6:00 AM EST — before the daily report has run
  assert.ok(/waiting for the daily report of 2026-10-31/.test(month().deferred || ''), 'monthly never built without the last class day');
  at('2026-11-01T12:00:00Z'); // Sun 7:00 AM EST (DST ended)
  failNext = true; morning();
  const d = rows('Daily Summary').find(x => x['Report Date'] === '2026-10-31');
  assert.ok(d && d['Email Sent'] === 'FALSE' && /HTTP 500/.test(d['Email Error']), 'report kept, email marked failed');
  at('2026-11-01T13:00:00Z'); const r = month(); // Sun 8:00 AM EST
  assert.ok(r.generated, JSON.stringify(r));
  const ms = sent.filter(x => /Monthly/.test(x.m.subject)); assert.strictEqual(ms.length, 1);
  assert.strictEqual(ms[0].m.subject, 'APS Monthly Class Summary & Review - October 2026 - Management Report');
  month(); at('2026-11-02T13:00:00Z'); month(); assert.strictEqual(sent.filter(x => /Monthly/.test(x.m.subject)).length, 1, 'monthly sent once');
  CUR = '2026-11-01'; ATT = [];
  const before = sent.length; at('2026-11-02T12:00:00Z'); morning(); // Mon 7 AM: Saturday resent + Sunday's report
  assert.deepStrictEqual(subjects(before), ['APS Daily Class Summary & Review - Saturday, October 31, 2026 - Management Report', 'APS Daily Class Summary & Review - Sunday, November 1, 2026 - Management Report']);
  const d2 = rows('Daily Summary').filter(x => x['Report Date'] === '2026-10-31');
  assert.strictEqual(d2.length, 1, 'no duplicate row'); assert.strictEqual(d2[0]['Email Sent'], 'TRUE', 'resent');
  assert.strictEqual(sent[before].m.text, d2[0]['Full Tamil Report'], 'the same stored report was sent');
  assert.ok(sent[before + 1].m.text.includes('அன்றைய Google Meet பங்கேற்பு பதிவு இன்னும் கிடைக்கவில்லை'), 'missing attendance stated honestly');
});
t('monthly content: Tamil, totals from the Daily Summary rows, recurring issues, actions; saved to "Monthly Summary" (tab reused)', () => {
  const m = rows('Monthly Summary'); assert.strictEqual(m.length, 1);
  const txt = m[0]['Full Tamil Report'];
  ['அக்டோபர் 2026 மாதத்தில் APS-இல் 2 வகுப்பு நாட்களில் மொத்தம் 4 வகுப்பு அமர்வுகள்', 'மாதாந்திர வகுப்பு சுருக்கம்', 'மொத்த வகுப்பு நாட்கள்: 2', 'வகுப்பு நாள் வாரியாக', 'நன்றாக நடந்தவை']
    .forEach(x => assert.ok(txt.includes(x), 'monthly: ' + x));
  assert.strictEqual(txt.includes('Management / HM / VP நடவடிக்கை தேவை'), !!m[0]['Management Action Summary'], 'action section iff actions exist');
  assert.ok(!/N\/A|Nothing to report|No issues/.test(txt), 'no filler');
  assert.strictEqual(m[0]['Report Key'], '2026-10 | MONTHLY'); assert.strictEqual(m[0]['Email Sent'], 'TRUE');
  assert.ok(Object.keys(env.wb.sheets).filter(n => /Summary/.test(n)).sort().join(',') === 'Daily Summary,Monthly Summary', 'one tab each');
});
t('Monday and Tuesday (a class exists) send the next morning; Wednesday and Thursday (no class) send nothing and save nothing', () => {
  const before = sent.length, rowsBefore = rows('Daily Summary').length;
  CUR = '2026-11-02'; at('2026-11-03T12:00:00Z'); morning(); // Tue 7 AM → Monday
  CUR = '2026-11-03'; at('2026-11-04T12:00:00Z'); morning(); // Wed 7 AM → Tuesday
  at('2026-11-05T12:00:00Z'); morning(); at('2026-11-06T12:00:00Z'); morning(); // Thu, Fri mornings → Wed, Thu: no class
  assert.deepStrictEqual(subjects(before), ['APS Daily Class Summary & Review - Monday, November 2, 2026 - Management Report', 'APS Daily Class Summary & Review - Tuesday, November 3, 2026 - Management Report']);
  assert.strictEqual(rows('Daily Summary').length, rowsBefore + 2, 'no row for Wed / Thu');
});
t('a failed build sends nothing, saves nothing, and is caught up the next morning', () => {
  const before = sent.length, rowsBefore = rows('Daily Summary').length;
  const realC = G.dsComposeDaily_; G.dsComposeDaily_ = () => { throw new Error('simulated failure'); };
  at('2026-11-07T12:00:00Z'); const r = morning(); // Sat 7 AM → Friday fails
  G.dsComposeDaily_ = realC;
  assert.ok(r.daily.some(x => x.error), JSON.stringify(r));
  assert.strictEqual(sent.length, before); assert.strictEqual(rows('Daily Summary').length, rowsBefore, 'no partial report row');
  at('2026-11-08T12:00:00Z'); morning(); // Sun 7 AM → Friday caught up, then Saturday
  assert.deepStrictEqual(subjects(before), ['APS Daily Class Summary & Review - Friday, November 6, 2026 - Management Report', 'APS Daily Class Summary & Review - Saturday, November 7, 2026 - Management Report']);
});
t('THE NOV 1 INCIDENT: mornings that never ran (no trigger / cut off) are caught up automatically, oldest first, once each', () => {
  const before = sent.length;
  // no run on Mon Nov 9 and Tue Nov 10 (Sunday + Monday reports missed); Wed Nov 11 7 AM catches up Sun, Mon, Tue
  at('2026-11-11T12:00:00Z'); morning(); morning();
  assert.deepStrictEqual(subjects(before), ['APS Daily Class Summary & Review - Sunday, November 8, 2026 - Management Report', 'APS Daily Class Summary & Review - Monday, November 9, 2026 - Management Report', 'APS Daily Class Summary & Review - Tuesday, November 10, 2026 - Management Report']);
});
t('fresh deploy (empty sheet): only yesterday is sent — no surprise back-fill of older days', () => {
  const sh = env.wb.sheets['Daily Summary'], saved = sh.data.map(r => r.slice());
  sh.data = [saved[0]];
  const before = sent.length; at('2026-11-17T12:00:00Z'); morning(); // Tue 7 AM: Mon 16 only (not Fri 13 / Sat 14 / Sun 15)
  assert.deepStrictEqual(subjects(before), ['APS Daily Class Summary & Review - Monday, November 16, 2026 - Management Report']);
  sh.data = saved; sent.length = before;
});
t('catch-up window is 7 days, and a long catch-up stops before the 6-minute limit and finishes the next morning', () => {
  const before = sent.length;
  const real = G.dsRunDaily_; G.dsRunDaily_ = (d, now) => { const r = real(d, now); D.set(new Date(D.now() + 90000).toISOString()); return r; }; // each report "takes" 1.5 min
  at('2026-11-25T12:00:00Z'); const r = morning(); // Wed 7 AM; nothing ran since Nov 11
  G.dsRunDaily_ = real;
  assert.deepStrictEqual(subjects(before), ['APS Daily Class Summary & Review - Friday, November 20, 2026 - Management Report', 'APS Daily Class Summary & Review - Saturday, November 21, 2026 - Management Report', 'APS Daily Class Summary & Review - Sunday, November 22, 2026 - Management Report'], JSON.stringify([subjects(before), r]));
  assert.deepStrictEqual(r.daily.filter(x => x.deferred).map(x => x.key), ['2026-11-23 | DAILY', '2026-11-24 | DAILY']);
  at('2026-11-26T12:00:00Z'); morning();
  assert.deepStrictEqual(subjects(before).slice(3), ['APS Daily Class Summary & Review - Monday, November 23, 2026 - Management Report', 'APS Daily Class Summary & Review - Tuesday, November 24, 2026 - Management Report']);
  assert.ok(!subjects(before).some(s => /November 1[3-6],/.test(s)), 'older than 7 days: not back-filled');
});
t('attendance capture ~6 AM: once, for yesterday\'s classes only; the 7 AM report never runs the sync itself (r105 timeout fix)', () => {
  syncCalls = 0;
  at('2026-11-27T11:00:00Z'); G.dsPrep_(new D()); // Fri 6 AM → yesterday Thursday: no class
  assert.strictEqual(syncCalls, 0);
  at('2026-11-28T11:00:00Z'); G.dsPrep_(new D()); G.dsPrep_(new D()); // Sat 6 AM → Friday
  assert.strictEqual(syncCalls, 1, 'once');
  G.createDailySummaryTriggers.call(null);
  withUids(() => { at('2026-11-29T12:00:00Z'); const r = G.apsDailySummaryReport({ triggerUid: 'uid-apsDailySummaryReport' }); assert.ok(r.daily, JSON.stringify(r)); });
  assert.strictEqual(syncCalls, 1, 'report did not run the sync');
});
t('triggers: ~6 AM capture, ~7 AM daily, ~8 AM monthly in America/New_York; re-running creates no duplicates; editor / trigger only', () => {
  G.Session = { getActiveUser: () => ({ getEmail: () => 'owner@aps.org' }), getEffectiveUser: () => ({ getEmail: () => 'owner@aps.org' }) };
  G.createDailySummaryTriggers(); G.createDailySummaryTriggers();
  const tr = env.stats.triggers.filter(x => /Summary/.test(x.fn));
  assert.strictEqual(tr.length, 3);
  assert.deepStrictEqual(['apsDailySummaryPrep', 'apsDailySummaryReport', 'apsMonthlySummaryReport'].map(f => { const x = tr.find(y => y.fn === f); return [x.everyDays, x.hour, x.minute, x.tz]; }),
    [[1, 6, 0, 'America/New_York'], [1, 7, 0, 'America/New_York'], [1, 8, 0, 'America/New_York']]);
  G.Session = { getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => 'owner@aps.org' }) };
  assert.throws(() => G.createDailySummaryTriggers(), /Access denied/);
  assert.throws(() => G.runDailySummaryNow('2026-10-30'), /Access denied/);
  assert.throws(() => G.apsDailySummaryReport({}), /Access denied/);
  withUids(() => { assert.throws(() => G.apsDailySummaryPrep({ triggerUid: 'forged' }), /Access denied/); assert.throws(() => G.apsMonthlySummaryReport({ triggerUid: 'uid-apsDailySummaryReport' }), /Access denied/); });
});
t('an old r105 evening trigger (10:50 / 11 PM) moves itself to the morning schedule and sends nothing', () => {
  env.stats.triggers = env.stats.triggers.filter(x => !/Summary/.test(x.fn));
  env.stats.triggers.push({ fn: 'apsDailySummaryPrep', everyDays: 1, hour: 22, minute: 50, tz: 'America/New_York' }, { fn: 'apsDailySummaryReport', everyDays: 1, hour: 23, minute: 0, tz: 'America/New_York' });
  const before = sent.length;
  withUids(() => { at('2026-12-01T04:00:00Z'); const r = G.apsDailySummaryReport({ triggerUid: 'uid-apsDailySummaryReport' }); assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), { migrated: true }); }); // Mon 11 PM EST
  assert.strictEqual(sent.length, before, 'nothing sent from the evening run');
  const tr = env.stats.triggers.filter(x => /Summary/.test(x.fn)).map(x => x.fn + '@' + x.hour).sort();
  assert.deepStrictEqual(tr, ['apsDailySummaryPrep@6', 'apsDailySummaryReport@7', 'apsMonthlySummaryReport@8']);
});
t('manual runs: only past days / months (a same-day manual report would block the complete next-morning one)', () => {
  G.Session = { getActiveUser: () => ({ getEmail: () => 'owner@aps.org' }), getEffectiveUser: () => ({ getEmail: () => 'owner@aps.org' }) };
  at('2026-12-05T18:00:00Z'); // Sat 1 PM EST, during class
  assert.throws(() => G.runDailySummaryNow('2026-12-05'), /past date/);
  assert.throws(() => G.runMonthlySummaryNow('2026-12'), /past month/);
  const before = sent.length; G.runDailySummaryNow('2026-12-04'); assert.deepStrictEqual(subjects(before), ['APS Daily Class Summary & Review - Friday, December 4, 2026 - Management Report']);
  G.runDailySummaryNow('2026-12-04'); assert.strictEqual(sent.length, before + 1, 'still once per date');
  assert.ok(/No class on 2026-12-03/.test(G.previewDailySummary('2026-12-03')));
});
t('existing tab reused: its own columns kept, missing columns appended beyond the 26-column default, no data lost', () => {
  const sh = env.wb.insertSheet('Reuse Test'); sh.data[0] = ['Old A', 'Report Key', 'Old B']; sh.data[1] = ['keep', 'X | DAILY', 'keep2'];
  const H = vm.runInContext('DS_DAILY_HEADER_', env.ctx);
  const meta = G.dsSheet_('Reuse Test', H);
  assert.strictEqual(meta.width, 3 + H.length - 1); assert.ok(sh.getMaxColumns() >= meta.width);
  assert.deepStrictEqual(sh.data[1].slice(0, 3), ['keep', 'X | DAILY', 'keep2']);
  assert.strictEqual(G.dsFind_(meta, 'X | DAILY')['Old A'], 'keep');
  delete env.wb.sheets['Reuse Test'];
});
t('not reachable from the browser: no session-token entry point returns a summary', () => {
  const pub = Object.keys(G).filter(k => typeof G[k] === 'function' && /Summary/i.test(k) && !/_$/.test(k) && /Daily|Monthly/.test(k));
  pub.forEach(k => assert.ok(['apsDailySummaryPrep', 'apsDailySummaryReport', 'apsMonthlySummaryReport', 'createDailySummaryTriggers', 'removeDailySummaryTriggers', 'previewDailySummary', 'runDailySummaryNow', 'runMonthlySummaryNow'].includes(k), k));
  assert.strictEqual(classroomTouched, 0);
});

(async () => {
  let fails = 0;
  for (const [n, fn] of tests) { try { await fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 4).join('\n   ')); } }
  console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);
})();

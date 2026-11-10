// r115 — Weekly Teacher Appreciation: Tamil emails, admin report, ON/OFF switch, idempotency, retry, monthly, continuation (node test/teacherappreciation_email.js)
const assert = require('assert');
const F = require('./teacherappreciation'); const { G, D, tok, sheetRows, J, tA, tB, WK } = F;
const tests = []; const t = (name, fn) => tests.push([name, fn]);
const mails = []; let failFor = null, failCount = 0;
G.apsGmailSend_ = (profile, m) => {
  if (failFor && m.to.includes(failFor) && failCount > 0) { failCount--; return { ok: false, error: 'Gmail API HTTP 500 Bearer ya29.secretTOKEN' }; }
  mails.push({ profile, m: J(m) }); return { ok: true };
};
const ADMIN = tok('info@avvaiyarpadasalai.org', 'admin'), BOD = tok('bod_aps1@avvaiyarpadasalai.org', 'vcfo_amchsts_bod');
const toTeacher = e => mails.filter(x => x.m.to.length === 1 && x.m.to[0] === e);
const adminMails = () => mails.filter(x => /Weekly Teacher Appreciation Report/.test(x.m.subject));
const log = () => sheetRows('TEACHER_APPRECIATION_EMAIL_LOG');
const props = G.PropertiesService.getScriptProperties();

t('emails OFF (default): no teacher email; the admin gets one [PREVIEW] report (attendance@) with a sample Tamil email; PREVIEW rows logged', () => {
  assert.strictEqual(G.taEmailsOn_(), false);
  const r = J(G.runTeacherAppreciationNow(ADMIN, { weekId: WK }));
  assert.strictEqual(r.delivery.mode, 'PREVIEW'); assert.strictEqual(r.delivery.previewed, 1);
  assert.strictEqual(toTeacher(tA.email).length, 0);
  const a = adminMails(); assert.strictEqual(a.length, 1);
  assert.strictEqual(a[0].profile, 'ATTENDANCE'); assert.deepStrictEqual(a[0].m.to, ['admin@avvaiyarpadasalai.org']);
  assert.ok(/^\[PREVIEW\] APS – Weekly Teacher Appreciation Report \| 11\/02\/2026 – 11\/08\/2026$/.test(a[0].m.subject), a[0].m.subject);
  const h = a[0].m.html;
  ['Total active teachers', 'Teachers evaluated', 'Exceptional and Outstanding teachers', 'Teacher performance scores', 'Support check-in suggested', 'Teachers with insufficient data', 'On approved leave', 'Sample teacher email', 'அன்புள்ள', 'graded before the student turned in']
    .forEach(x => assert.ok(h.includes(x), 'admin report has: ' + x));
  assert.ok(!/stu\d/.test(h), 'no student emails / names in the admin report');
  const row = log().find(x => x.Teacher_Email === tA.email && x.Type === 'WEEKLY'); assert.strictEqual(row.Status, 'PREVIEW');
  // a second run does not send the preview report again …
  G.runTeacherAppreciationNow(ADMIN, { weekId: WK }); assert.strictEqual(adminMails().length, 1);
  // … unless asked
  G.runTeacherAppreciationNow(ADMIN, { weekId: WK, resendAdmin: true }); assert.strictEqual(adminMails().length, 2);
});
t('switch: Admin only, audited; BOD refused', () => {
  assert.throws(() => G.setTeacherAppreciationEmails(BOD, true), /Read-only/);
  const r = J(G.setTeacherAppreciationEmails(ADMIN, true)); assert.ok(r.emailsOn);
  assert.ok(sheetRows('TEACHER_APPRECIATION_CONFIG_AUDIT').some(x => x.Setting === 'emails' && x.Old_Value === 'off' && x.New_Value === 'on'));
});
t('emails ON: the eligible teacher gets ONE Tamil email (only to them, no CC, no score / band / ranking); admin LIVE report; never twice', () => {
  const r = J(G.runTeacherAppreciationNow(ADMIN, { weekId: WK }));
  assert.strictEqual(r.delivery.mode, 'LIVE'); assert.strictEqual(r.delivery.sent, 1); assert.strictEqual(r.delivery.admin, 'SENT');
  const m = toTeacher(tA.email); assert.strictEqual(m.length, 1);
  const e = m[0].m; assert.strictEqual(m[0].profile, 'ATTENDANCE'); assert.ok(!e.cc || !e.cc.length); assert.ok(!e.bcc || !e.bcc.length);
  assert.ok(/^APS – உங்கள் அர்ப்பணிப்புக்கு எங்கள் பாராட்டுகள்! \(11\/02\/2026 – 11\/08\/2026\)$/.test(e.subject), e.subject);
  assert.ok(e.html.includes('அன்புள்ள <b>Anbu Teacher</b> அவர்களுக்கு') && e.html.includes('இந்த வாரத்தின் சிறப்புகள்') && e.html.includes('ஒவ்வொரு வகுப்பையும் சரியான நேரத்தில் தொடங்கினீர்கள்'));
  assert.ok(e.text.includes('பாராட்டுக் காலம்: 11/02/2026 – 11/08/2026'));
  assert.ok(!/\b100\b|Exceptional|Outstanding|score|rank/i.test(e.text), 'no score or ranking in the teacher email');
  assert.strictEqual(toTeacher(tB.email).length, 0, 'not eligible → no email');
  assert.ok(!adminMails().pop().m.subject.startsWith('[PREVIEW]'));
  const before = mails.length;
  G.runTeacherAppreciationNow(ADMIN, { weekId: WK });
  assert.strictEqual(toTeacher(tA.email).length, 1, 'never twice'); assert.strictEqual(mails.length, before, 'admin LIVE report not resent either');
  const row = log().find(x => x.Email_Key === 'WEEKLY|' + WK + '|' + tA.email); assert.strictEqual(row.Status, 'SENT'); assert.strictEqual(row.Attempts, '1'); assert.strictEqual(row.Mode, 'LIVE');
});
t('failure: FAILED with the error masked, retried by "Retry failed"; a SENDING row is never resent automatically', () => {
  G.saveTeacherAppreciationConfig(ADMIN, Object.assign(J(G.TA_DEFAULTS_), { appreciateMin: 65 })); // tB (70) becomes eligible
  failFor = tB.email; failCount = 1;
  const r = J(G.runTeacherAppreciationNow(ADMIN, { weekId: WK }));
  assert.strictEqual(r.delivery.failed, 1);
  let row = log().find(x => x.Email_Key === 'WEEKLY|' + WK + '|' + tB.email);
  assert.strictEqual(row.Status, 'FAILED'); assert.ok(!/ya29\.secret/.test(row.Error) && /\[hidden\]/.test(row.Error), row.Error);
  const rr = J(G.retryTeacherAppreciationFailed(ADMIN, { weekId: WK }));
  assert.strictEqual(rr.delivery.sent, 1);
  row = log().find(x => x.Email_Key === 'WEEKLY|' + WK + '|' + tB.email); assert.strictEqual(row.Status, 'SENT'); assert.strictEqual(row.Attempts, '2');
  assert.strictEqual(toTeacher(tB.email).length, 1);
  // a run interrupted mid-send (SENDING) is never sent again automatically
  const L = G.taEmailLog_(); L.put({ Email_Key: 'WEEKLY|' + WK + '|' + tB.email, Status: 'SENDING', Last_Attempt_At: G.taTs_(new D()) });
  G.runTeacherAppreciationNow(ADMIN, { weekId: WK });
  assert.strictEqual(toTeacher(tB.email).length, 1, 'SENDING → not resent');
  L.put({ Email_Key: 'WEEKLY|' + WK + '|' + tB.email, Status: 'SENT' });
  G.saveTeacherAppreciationConfig(ADMIN, J(G.TA_DEFAULTS_));
});
t('budget reached → the rest continue in a one-time trigger 2 minutes later; the admin report waits until all are sent', () => {
  const W2 = 'WK-2026-10-30';
  G.saveTeacherAppreciationConfig(ADMIN, Object.assign(J(G.TA_DEFAULTS_), { appreciateMin: 60, minCoverage: 30 }));
  const keep = G.TA_RUN_BUDGET_MS_; G.TA_RUN_BUDGET_MS_ = -1;
  const adminsBefore = adminMails().length;
  const r = J(G.runTeacherAppreciationNow(ADMIN, { weekId: W2 }));
  G.TA_RUN_BUDGET_MS_ = keep;
  assert.ok(r.delivery.pending >= 1 && r.delivery.sent === 0 && r.delivery.admin === 'WAITING', JSON.stringify(r.delivery));
  assert.ok(F.env.stats.triggers.some(x => x.fn === 'apsTeacherAppreciationContinue' && x.after === 120000));
  assert.strictEqual(props.getProperty('TEACHER_APPRECIATION_CONTINUE'), W2);
  assert.strictEqual(adminMails().length, adminsBefore, 'admin report waits');
  const realGuard = G.apsRequireTriggerCall_; G.apsRequireTriggerCall_ = () => {};
  try { const c = J(G.apsTeacherAppreciationContinue({ triggerUid: 'x' })); assert.strictEqual(c.delivery.sent, r.delivery.pending); assert.strictEqual(c.delivery.admin, 'SENT'); } finally { G.apsRequireTriggerCall_ = realGuard; }
  assert.ok(!F.env.stats.triggers.some(x => x.fn === 'apsTeacherAppreciationContinue'), 'one-time trigger removed');
  assert.strictEqual(props.getProperty('TEACHER_APPRECIATION_CONTINUE'), null);
  assert.strictEqual(adminMails().length, adminsBefore + 1);
  G.saveTeacherAppreciationConfig(ADMIN, J(G.TA_DEFAULTS_));
});
t('monthly “consistently outstanding” (first run of the month): one monthly email; that teacher’s weekly email of the run is skipped (included)', () => {
  // two more outstanding November weeks for Anbu (Fridays 11/13 and 11/20)
  const base = sheetRows('TEACHER_APPRECIATION_SCORES').find(r => r.Week_ID === WK && r.Teacher_Email === tA.email);
  G.taUpsert_('TEACHER_APPRECIATION_SCORES', G.TA_SCORES_HEADER_, ['WK-2026-11-13', 'WK-2026-11-20'].map(w => Object.assign({}, base, { Week_ID: w, Score_Key: w + '|' + tA.email })));
  // the weekly email of WK (already SENT) is removed so this run would send it again → the monthly email replaces it
  const sh = F.env.wb.sheets.TEACHER_APPRECIATION_EMAIL_LOG; const i = sh.data.findIndex(r => r && r[0] === 'WEEKLY|' + WK + '|' + tA.email); sh.data.splice(i, 1);
  D.set('2026-12-03T00:05:00Z'); // Wed Dec 2, 7:05 PM EST
  G.gradesLastSync_ = () => ({ lastSyncAt: D.now() - 3600000, result: 'COMPLETED', lastSync: '12/02/2026 05:00 PM' });
  const r = J(G.runTeacherAppreciationNow(ADMIN, { weekId: WK, resendAdmin: true })); // this week's admin report went out earlier in the test
  assert.strictEqual(r.delivery.monthly.month, '2026-11'); assert.strictEqual(r.delivery.monthly.qualified, 1);
  const m = toTeacher(tA.email).filter(x => /மாதப் பாராட்டு/.test(x.m.subject));
  assert.strictEqual(m.length, 1); assert.ok(/நவம்பர் 2026/.test(m[0].m.subject) && /3 வாரங்களில் 3 வாரங்கள்/.test(m[0].m.text), m[0].m.text.slice(0, 300));
  assert.ok(m[0].m.text.includes('கடந்த வாரத்திலும் (11/02/2026 – 11/08/2026)'), 'this week’s note included');
  const wk = log().find(x => x.Email_Key === 'WEEKLY|' + WK + '|' + tA.email); assert.strictEqual(wk.Status, 'SKIPPED'); assert.ok(/monthly/.test(wk.Error));
  assert.strictEqual(toTeacher(tA.email).filter(x => /வாராந்திர|அர்ப்பணிப்புக்கு எங்கள்/.test(x.m.subject) && x.m.subject.includes('11/02')).length, 1, 'only the original weekly email from before');
  G.runTeacherAppreciationNow(ADMIN, { weekId: WK });
  assert.strictEqual(toTeacher(tA.email).filter(x => /மாதப் பாராட்டு/.test(x.m.subject)).length, 1, 'monthly never twice');
  assert.ok(adminMails().pop().m.html.includes('Consistently outstanding — November 2026'));
});
t('dashboard: email history and previews (BOD may view; teacher email preview is escaped and has no score)', () => {
  const d = J(G.getTeacherAppreciationData(BOD, { weekId: WK }));
  assert.ok(d.emailFeatures && d.emails.some(e => e.type === 'WEEKLY' && e.status === 'SENT') && d.emails.some(e => e.type === 'ADMIN'));
  const p = J(G.getTeacherAppreciationEmailPreview(BOD, { weekId: WK, email: tA.email }));
  assert.ok(/அன்புள்ள/.test(p.html) && !/Exceptional/.test(p.html));
  const rep = J(G.getTeacherAppreciationAdminReport(BOD, { weekId: WK })); assert.ok(/Teacher performance scores/.test(rep.html));
  const x = G.taWeeklyEmail_({ name: '<img src=x onerror=alert(1)>', email: 'x_aps1@avvaiyarpadasalai.org', apsId: 'APS1', highlights: ['ON_TIME'] }, WK);
  assert.ok(!/<img src=x/.test(x.html) && /&lt;img/.test(x.html));
});
t('switch OFF again: runs go back to preview only', () => {
  G.setTeacherAppreciationEmails(ADMIN, false);
  assert.strictEqual(G.taEmailsOn_(), false);
  assert.throws(() => G.retryTeacherAppreciationFailed(ADMIN, { weekId: WK }), /OFF/);
});

let fails = 0;
for (const [n, fn] of tests) { try { fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 6).join('\n   ')); } }
console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);

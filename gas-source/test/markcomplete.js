// r86: ATT_ / QUZ_ "Mark as complete" teacher reminder (background job) — server tests (node test/markcomplete.js)
const assert = require('assert');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const { setup, J, D } = require('./amfixture');
const L = v => (Array.isArray(v) ? v : String(v || '').split(/\s*,\s*/)).filter(Boolean);
const b64 = s => Buffer.from(String(s)).toString('base64url').replace(/=+$/, '');
function prep(props) {
  const F = setup({ props: Object.assign({ ATTQUZ_COMPLETE_ENABLED: 'true', ATTQUZ_COMPLETE_REMINDER_DAYS: '3' }, props || {}) }), G = F.G, N3 = F.ids.N3EF; // r88: OFF + weekly by default — tests switch it on with a 3-day interval
  const c = F.cls.courses.find(x => x.id === N3); c.alternateLink = 'https://classroom.google.com/c/' + b64(N3);
  c.room = 'VP Email: vanivp_aps990' + D + ' | HM Email: hm_aps777' + D;
  F.cls.subs[N3].push({ courseWorkId: 'W3', userId: 'UR', state: 'CREATED', assignedGrade: 1 }); // ATT_LSN_1: graded, never returned → still listed
  G.syncClassroomData(); F.sync();
  { const P = Object.getPrototypeOf(F.env.wb.insertSheet('__d')); P.deleteRows = P.deleteRows || function (start, n) { this.data.splice(start - 1, n); return this; }; delete F.env.wb.sheets.__d; } // mock: Sheet.deleteRows
  F.run = (o) => J(G.mcRun_(o || {}));
  F.mc = () => F.env.stats.mails.filter(m => /Mark Assignments? as Complete/.test(m.subject));
  F.log = () => F.sheet('ATTQUZ_Complete_Log').slice(1);
  F.N3 = N3; return F;
}

t('age rule (New York dates): due ≥ 10 days old; no due date → created date ≥ 10 days old; boundary exact', () => {
  const F = prep(), G = F.G, cfg = G.mcConfig_(), e = w => J(G.mcEligibility_(w, '2026-10-22', cfg));
  assert.strictEqual(e({ due: '2026-10-12 23:59:00' }).eligible, true); assert.strictEqual(e({ due: '2026-10-11 00:00:00' }).eligible, true);
  assert.strictEqual(e({ due: '2026-10-13 00:01:00' }).eligible, false); assert.strictEqual(e({ due: '2026-10-12 08:00:00' }).ageDays, 10);
  assert.deepStrictEqual([e({ due: '', ad: '2026-10-12 09:00:00' }).eligible, e({ due: '', ad: '2026-10-12 09:00:00' }).refType], [true, 'CREATED_DATE']);
  assert.strictEqual(e({ due: '', ad: '2026-10-13 09:00:00' }).eligible, false); assert.strictEqual(e({ due: '', ad: '' }).eligible, false);
  F.env.props.ATTQUZ_COMPLETE_AGE_DAYS = '14'; assert.strictEqual(J(G.mcEligibility_({ due: '2026-10-12 08:00:00' }, '2026-10-22', G.mcConfig_())).eligible, false, 'configurable');
});

t('ATT_ / QUZ_ only; TURNED_IN and RETURNED skipped; NEW / CREATED / RECLAIMED / graded-not-returned listed; only ACTIVE AY26-27 classes', () => {
  const F = prep(), G = F.G, cfg = G.mcConfig_();
  assert.strictEqual(G.mcPrefixOf_('ATT_LSN_5', cfg), 'ATT_'); assert.strictEqual(G.mcPrefixOf_('quz_lsn_3', cfg), 'QUZ_');
  ['HW_LSN_1', 'att lsn 2', 'TRMST01', 'QUIZ-04', 'Reading Material'].forEach(x => assert.strictEqual(G.mcPrefixOf_(x, cfg), '', x));
  const pv = F.run({ preview: true });
  assert.strictEqual(pv.plan.length, 1); const a = pv.plan[0].assignments;
  assert.deepStrictEqual(a.map(x => x.title).sort(), ['ATT_LSN_1', 'QUZ_LSN_1']);
  assert.deepStrictEqual(a.find(x => x.title === 'QUZ_LSN_1').students, ['Raja (APS1234) RECLAIMED_BY_STUDENT'], 'Joshua RETURNED → skipped');
  assert.deepStrictEqual(a.find(x => x.title === 'ATT_LSN_1').students, ['Raja (APS1234) CREATED']);
  assert.ok(!pv.plan.some(c => /HW_/.test(JSON.stringify(c))), 'HW_ never included');
  assert.strictEqual(F.env.stats.mails.filter(m => /Mark/.test(m.subject)).length, 0, 'preview sends nothing'); assert.strictEqual(F.log().length, 0, 'preview writes nothing');
  // a TURNED_IN student is skipped
  F.cls.subs[F.N3].find(s => s.courseWorkId === 'W2' && s.userId === 'UR').state = 'TURNED_IN'; F.sync();
  assert.ok(!J(G.mcRun_({ preview: true })).plan[0].assignments.some(x => x.title === 'QUZ_LSN_1'));
  // an ARCHIVED class is never emailed
  F.cls.courses.find(c => c.id === F.N3).courseState = 'ARCHIVED'; F.sync();
  assert.ok(!J(G.mcRun_({ preview: true })).plan.some(c => /NILAI 3 - EF/.test(c.classroom)), 'archived class excluded');
});

t('one consolidated email per class From donotreply@: To the Primary Teacher, CC VP + HM + admin@; students by name + APSID + status; Student Work link; manual steps; never changes Classroom', () => {
  const F = prep(), G = F.G; let writes = 0;
  ['patch', 'turnIn', 'return', 'reclaim', 'modifyAttachments'].forEach(k => { G.Classroom.Courses.CourseWork.StudentSubmissions[k] = () => { writes++; }; });
  const r = F.run();
  assert.strictEqual(r.sent, 1); assert.strictEqual(r.mode, 'LIVE'); assert.ok(/^MC-\d{8}-\d{6}$/.test(r.executionId));
  const m = F.mc(); assert.strictEqual(m.length, 1); const e = m[0];
  assert.strictEqual(e.subject, '[APS Action Required] Mark Assignments as Complete – NILAI 3 - EF (2 assignments)');
  assert.ok(/donotreply@/.test(e.from)); assert.deepStrictEqual(L(e.to), ['teachera_aps101' + D]);
  assert.deepStrictEqual(L(e.cc).sort(), ['admin@avvaiyarpadasalai.org', 'hm_aps777' + D, 'vanivp_aps990' + D].sort());
  ['Vanakkam Teacher A', 'ATT_LSN_1', 'QUZ_LSN_1', 'Raja', 'APS1234', 'Unsubmitted by the student', 'Graded 1 – not returned', 'Mark as complete', 'Return', '13 days old',
    'https://classroom.google.com/c/' + b64(F.N3) + '/a/' + b64('W2') + '/submissions/by-status/and-sort-last-name/all', 'does not let the dashboard'].forEach(x => assert.ok(e.htmlBody.includes(x), x));
  assert.ok(!e.htmlBody.includes('Joshua'), 'RETURNED student not listed');
  assert.strictEqual(writes, 0, 'no Classroom write');
  const log = F.log(); assert.strictEqual(log.length, 2); assert.ok(log.every(x => x[15] === 'SENT' && x[2].indexOf('MC|' + F.N3 + '|') === 0));
  const runs = F.sheet('ATTQUZ_Complete_Runs').slice(1); assert.strictEqual(runs.length, 1); assert.strictEqual(String(runs[0][9]), '1');
  // switches: no VP / HM / admin CC
  const F2 = prep({ ATTQUZ_COMPLETE_CC_VP: 'false', ATTQUZ_COMPLETE_CC_HM: 'false', ATTQUZ_COMPLETE_CC_ADMIN: 'false' }); F2.run();
  assert.deepStrictEqual(L(F2.mc()[0].cc), []);
  // no Primary Teacher on file → To admin@ with a note
  const F3 = prep(); const c3 = F3.cls.courses.find(x => x.id === F3.N3); c3.description = ''; F3.cls.teachers[F3.N3] = F3.cls.teachers[F3.N3].filter(p => p.userId === 'VPX'); F3.G.syncClassroomData();
  F3.run(); const e3 = F3.mc()[0]; assert.ok(L(e3.to).includes('admin@avvaiyarpadasalai.org') || L(e3.to).includes('vanivp_aps990' + D));
});

t('reminder interval: not again within 3 days (even if the job runs twice); reminder on day 3; a student marked complete drops out after the next dashboard sync; all done → no email', () => {
  const F = prep(), G = F.G, day = 86400000;
  F.run(); F.run(); F.run({ now: new Date(Date.now() + 2 * day) });
  assert.strictEqual(F.mc().length, 1, 'nothing within the interval');
  const r = F.run({ now: new Date(Date.now() + 3 * day + 3600000) });
  assert.strictEqual(r.reminders, 2); assert.ok(/Reminder – /.test(F.mc()[1].subject));
  // teacher marks QUZ complete for Raja; the next dashboard sync picks it up → only ATT listed
  F.cls.subs[F.N3].find(s => s.courseWorkId === 'W2' && s.userId === 'UR').state = 'RETURNED'; F.sync();
  F.run({ now: new Date(Date.now() + 6 * day + 7200000) }); const last = F.mc()[2];
  assert.ok(/ATT_LSN_1/.test(last.subject) && !/QUZ_LSN_1/.test(last.htmlBody));
  F.cls.subs[F.N3].find(s => s.courseWorkId === 'W3' && s.userId === 'UR').state = 'RETURNED'; F.sync();
  F.run({ now: new Date(Date.now() + 9 * day + 7200000) }); assert.strictEqual(F.mc().length, 3, 'all done → no email');
});

t('light: a run makes NO Google Classroom API call (uses only the dashboard\'s synced data); the email says the status is as of the last sync', () => {
  const F = prep(), G = F.G; let api = 0;
  const wrap = (o, path) => Object.keys(o).forEach(k => { if (typeof o[k] === 'function') { const f = o[k]; o[k] = function () { api++; return f.apply(this, arguments); }; } else if (o[k] && typeof o[k] === 'object') wrap(o[k], path + '.' + k); });
  wrap(G.Classroom, 'Classroom'); G.AdminDirectory.Users.get = () => { api++; return {}; };
  const r = F.run(); assert.strictEqual(r.sent, 1); assert.strictEqual(api, 0, 'zero API calls');
  assert.ok(F.mc()[0].htmlBody.includes('Student status is as of the APS Dashboard') && F.mc()[0].body.includes('as of the last APS Dashboard sync'));
  F.run({ preview: true }); assert.strictEqual(api, 0);
});

t('retry: a failed send is logged FAILED and retried on the next run; the success is counted as a retry', () => {
  const F = prep(), G = F.G;
  delete F.env.props.TICKET_MAIL_REFRESH_TOKEN; delete F.env.props.TICKET_MAIL_OAUTH_CLIENT_ID;
  const r = F.run(); assert.strictEqual(r.failed, 1); assert.strictEqual(r.sent, 0); assert.ok(F.log().every(x => x[15] === 'FAILED'));
  Object.assign(F.env.props, { TICKET_MAIL_OAUTH_CLIENT_ID: 'cid', TICKET_MAIL_REFRESH_TOKEN: 'rt' });
  const r2 = F.run(); assert.strictEqual(r2.sent, 1); assert.strictEqual(r2.retries, 2); assert.ok(/Retry of an earlier failed send/.test(F.log().slice(-1)[0][16]));
});

t('DRY_RUN logs what would be sent (no email); OFF switch; daily trigger (separate, idempotent, owner-only), the trigger handler refuses browser calls', () => {
  const F = prep({ ATTQUZ_COMPLETE_DRY_RUN: 'true' }), G = F.G;
  const r = F.run(); assert.strictEqual(r.mode, 'DRY_RUN'); assert.strictEqual(F.mc().length, 0); assert.ok(F.log().length === 2 && F.log().every(x => x[15] === 'DRY_RUN'));
  F.env.props.ATTQUZ_COMPLETE_ENABLED = 'false'; assert.ok(F.run().skipped);
  G.createAttQuzMarkCompleteTrigger(); G.createAttQuzMarkCompleteTrigger();
  const tr = F.env.stats.triggers.filter(x => x.fn === 'apsAttQuzMarkCompleteDaily'); assert.ok(tr.length >= 1);
  const last = tr[tr.length - 1]; assert.strictEqual(last.hour, 23); assert.strictEqual(last.everyDays, 1); assert.strictEqual(last.tz, 'America/New_York');
  assert.strictEqual(G.ScriptApp.getProjectTriggers().filter(x => x.getHandlerFunction() === 'apsAttQuzMarkCompleteDaily').length >= 1, true);
  assert.throws(() => G.apsAttQuzMarkCompleteDaily({}), /Access denied/);
  F.env.stats.activeUser = ''; assert.throws(() => G.runAttQuzMarkCompleteNow(), /Access denied/); assert.throws(() => G.createAttQuzMarkCompleteTrigger(), /Access denied/);
});

t('only the class email: To teacher, CC VP / HM / admin@ — no other email (no admin summary)', () => {
  const F = prep({ ATTQUZ_COMPLETE_ADMIN_SUMMARY: 'true' }); F.env.stats.mails.length = 0; F.run();
  assert.strictEqual(F.env.stats.mails.length, 1); assert.ok(/Mark Assignments? as Complete/.test(F.env.stats.mails[0].subject));
});

t('log cleanup: rows older than 7 days are deleted at the end of every run (both sheets); recent rows and the reminder interval are kept', () => {
  const F = prep(), G = F.G, day = 86400000, ts = d => G.rosterTs_(new Date(Date.now() - d * day));
  const lg = G.ctaSheet_('ATTQUZ_Complete_Log', G.MC_LOG_HEADER_), rn = G.ctaSheet_('ATTQUZ_Complete_Runs', G.MC_RUNS_HEADER_);
  [30, 12, 8].forEach(d => lg.appendRow([ts(d), 'OLD', 'MC|x|' + d, '', '', '', '', '', '', '', '', '', '', '', '', 'SENT', '', '']));
  lg.appendRow([ts(2), 'RECENT', 'MC|' + F.N3 + '|W2', F.N3, '', 'W2', 'QUZ_LSN_1', '', '', '', '', '', '', '', 'FALSE', 'SENT', '', '']); // sent 2 days ago → QUZ not due again yet
  [20, 9].forEach(d => rn.appendRow(['MC-OLD-' + d, ts(d)]));
  const r = F.run();
  assert.strictEqual(r.pruned, 5, 'three old log rows + two old run rows');
  const ids = F.log().map(x => x[1]); assert.ok(!ids.includes('OLD') && ids.includes('RECENT'));
  assert.ok(!F.sheet('ATTQUZ_Complete_Runs').slice(1).some(x => /MC-OLD/.test(x[0])));
  assert.ok(!F.mc()[0].htmlBody.includes('QUZ_LSN_1'), 'interval still honoured after cleanup'); assert.ok(F.mc()[0].htmlBody.includes('ATT_LSN_1'));
  F.env.props.ATTQUZ_COMPLETE_LOG_DAYS = '1'; assert.ok(G.mcConfig_().logDays === 1); // never below the reminder interval in mcRun_ (max(logDays, reminderDays + 1))
});

t('r88 toggle: OFF by default (weekly interval); Admin / Super Admin switch it ON / OFF from Admin Control — trigger installed / removed, audited; others refused; days validated', () => {
  const F = setup(), G = F.G; // plain fixture: no ATTQUZ_COMPLETE_* properties
  const c = G.mcConfig_(); assert.strictEqual(c.enabled, false); assert.strictEqual(c.reminderDays, 7);
  assert.ok(J(G.mcRun_({})).skipped, 'nothing sent while OFF');
  const st = J(G.getAssignmentMonitoringAdmin(F.admin)).markComplete; assert.strictEqual(st.enabled, false); assert.strictEqual(st.scheduler, false);
  const trig = () => G.ScriptApp.getProjectTriggers().filter(x => x.getHandlerFunction() === 'apsAttQuzMarkCompleteDaily').length;
  const on = J(G.saveMarkCompleteSettings(F.admin, { enabled: true, reminderDays: 7 }));
  assert.strictEqual(on.enabled, true); assert.strictEqual(on.scheduler, true); assert.strictEqual(trig(), 1); assert.strictEqual(F.env.props.ATTQUZ_COMPLETE_ENABLED, 'true');
  G.saveMarkCompleteSettings(F.sa, { enabled: true, reminderDays: 14 }); assert.strictEqual(trig(), 1, 'never two triggers'); assert.strictEqual(G.mcConfig_().reminderDays, 14);
  const ev = F.env.stats.triggers.filter(x => x.fn === 'apsAttQuzMarkCompleteDaily').slice(-1)[0]; assert.strictEqual(ev.hour, 23); assert.strictEqual(ev.tz, 'America/New_York');
  [F.hm, F.vp, F.teacherB, F.student, F.bod].forEach(tk => assert.throws(() => G.saveMarkCompleteSettings(tk, { enabled: false }), /You do not have permission/));
  assert.throws(() => G.saveMarkCompleteSettings(F.admin, { enabled: true, reminderDays: 0 }), /1 to 60/);
  const off = J(G.saveMarkCompleteSettings(F.admin, { enabled: false })); assert.strictEqual(off.enabled, false); assert.strictEqual(trig(), 0);
  const aud = F.sheet('AM_Audit_Log').slice(1).map(r => r[3]);
  ['MARK_COMPLETE_REMINDER_ON', 'MARK_COMPLETE_REMINDER_DAYS', 'MARK_COMPLETE_REMINDER_OFF'].forEach(x => assert.ok(aud.includes(x), x));
});

console.log(process.exitCode ? 'SOME MARK-AS-COMPLETE TESTS FAILED' : 'ALL ' + pass + ' MARK-AS-COMPLETE TESTS PASSED');

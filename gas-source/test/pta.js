// r76: Parent-Teacher Arranged Class Coverage — consolidated "START GOOGLE MEET" emails (node test/pta.js)
const assert = require('assert');
const { setup, ID, FRI, D } = require('./coveragefixture');
const J = x => JSON.parse(JSON.stringify(x));
const L = v => (Array.isArray(v) ? v : String(v || '').split(/\s*,\s*/)).filter(Boolean);
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const add = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const SAT = add(FRI, 1), SUN = add(FRI, 2), WK = 'WK-' + FRI;
const STATUS = 'Not Available to Take Classes - Parent-Teacher Arranged';
function prep(statuses, extra) {
  const F = setup(); const G = F.G;
  Object.assign(F.env.props, { TICKET_MAIL_OAUTH_CLIENT_ID: 'cid', TICKET_MAIL_OAUTH_CLIENT_SECRET: 'csecret', TICKET_MAIL_REFRESH_TOKEN: 'rtok' }, extra || {});
  const sh = G.getOrCreateTeacherAvailabilitySheet_();
  Object.keys(statuses).forEach(id => { const [st, alt] = statuses[id]; sh.appendRow([WK, 't@x', 'T', id, 'name', '', st, alt || '', new Date().toISOString(), 'hm@aps.org', 'HM Karuna']); });
  F.at = (date, hh, mm) => G.tccZoned_(date, hh * 60 + mm);
  F.log = () => { const s = F.env.wb.getSheetByName('Parent_Teacher_Arranged_Notify_Log'); return s ? s.getDataRange().getValues().slice(1) : []; };
  return F;
}
const STD = { [ID.EA]: ['not_available', 'parent_teacher_arranged'], [ID.ED]: ['not_available', 'parent_teacher_arranged'], [ID.EF_SAT]: ['not_available', 'parent_teacher_arranged'],
  [ID.EB]: ['not_available', 'sub_teacher_arranged'], [ID.EC]: ['not_available', 'need_hm_support'], [ID.EE_7]: ['confirmed', ''], [ID.N2]: ['not_available', 'on_call_assigned'] };

t('exact status only: "' + STATUS + '" (Sub-Teacher / HM support / On-Call / Available never match)', () => {
  const F = prep(STD); const G = F.G;
  assert.strictEqual(G.ptaClassStatusLabel_({ status: 'not_available', alternative: 'parent_teacher_arranged' }), STATUS);
  assert.strictEqual(G.ptaIsParentTeacherArranged_({ status: 'not_available', alternative: 'sub_teacher_arranged' }), false);
  assert.strictEqual(G.ptaIsParentTeacherArranged_({ status: 'confirmed', alternative: 'parent_teacher_arranged' }), false);
  assert.strictEqual(G.ptaIsParentTeacherArranged_({ status: 'not_available', alternative: '' }), false);
  const r = J(G.ptaRunWindow_('FRIDAY', F.at(FRI, 17, 30), { dryRun: true }));
  assert.deepStrictEqual(r.classes.map(c => c.key).sort(), [ID.EA + '|' + FRI + '|FRIDAY', ID.ED + '|' + FRI + '|FRIDAY', ID.EF_SAT + '|' + SAT + '|FRIDAY'].sort());
  assert.strictEqual(F.env.stats.mails.length, 0, 'dry run sends nothing'); assert.strictEqual(F.log().length, 0, 'dry run writes nothing');
});
t('Friday 5:30 PM: ONE consolidated email From donotreply@, To = Primary / HM / VP once each, CC admin@; grouped Friday → Saturday; one START GOOGLE MEET per class with its own Meet', () => {
  const F = prep(STD); const G = F.G;
  const r = J(G.ptaRunWindow_('FRIDAY', F.at(FRI, 17, 30)));
  assert.strictEqual(r.emailsSent, 1); assert.strictEqual(F.env.stats.mails.length, 1);
  const m = F.env.stats.mails[0];
  assert.ok(/donotreply@avvaiyarpadasalai\.org/.test(m.from), m.from);
  assert.deepStrictEqual(L(m.cc), ['admin@avvaiyarpadasalai.org']);
  const to = L(m.to).slice().sort();
  assert.deepStrictEqual(to, ['ayana_aps8123' + D, 'karuna_aps774' + D, 'kavitha_aps8130' + D, 'other_aps8140' + D, 'priya_aps702' + D].sort());
  assert.strictEqual(new Set(L(m.to)).size, L(m.to).length, 'no duplicate recipients');
  assert.ok(/^Parent-Teacher Arranged Class Coverage – Google Meet Start Required – Fri .* to Sun .* \(3 classes\)$/.test(m.subject), m.subject);
  const h = m.htmlBody;
  assert.ok(/Parent-Teacher Arranged Class Coverage – Google Meet Start Required/.test(h) && /Avvaiyar Padasalai/.test(h));
  assert.ok(/cannot start the Google Meet/.test(h) && /Primary Class Teacher, HM, VP or Admin/.test(h));
  const buttons = [...h.matchAll(/<a href="([^"]+)" target="_blank" rel="noopener" style="display:inline-block;background:#188038[^>]*>▶ START GOOGLE MEET<\/a>/g)].map(x => x[1]);
  assert.deepStrictEqual(buttons.sort(), ['https://meet.google.com/abc-defg-hij', 'https://meet.google.com/sat-satx-sat'], 'one button per class with a Meet, each its own link');
  assert.ok(h.indexOf('>Friday — ') > -1 && h.indexOf('>Saturday — ') > h.indexOf('>Friday — ') && h.indexOf('>Sunday — ') === -1, 'grouped by day');
  assert.strictEqual((h.match(new RegExp(STATUS, 'g')) || []).length, 3);
  assert.ok(/Action Required \/ Missing Information/.test(h) && /MUNMAZHALAI - EA<\/b> \(Friday\): Google Meet URL/.test(h), 'EA has no Meet link → listed, not silently dropped');
  assert.ok(/The Parent-Teacher Arranged teacher cannot start this Google Meet\. Please use the "START GOOGLE MEET" button above/.test(h));
  assert.ok(/START GOOGLE MEET: https:\/\/meet\.google\.com\/abc-defg-hij/.test(m.body), 'plain-text part has the links');
  const log = F.log(), cls = log.filter(r => r[2] === 'CLASS'), run = log.filter(r => r[2] === 'RUN');
  assert.strictEqual(cls.length, 3); assert.ok(cls.every(r => r[14] === 'SENT' && r[3] === 'FRIDAY'));
  assert.ok(cls.some(r => r[4] === ID.EA + '|' + FRI + '|FRIDAY' && r[12] === 'MISSING'));
  assert.strictEqual(run.length, 1); assert.ok(/Courses found \d+ \| Eligible 3 \| Friday 2 \| Saturday 1 \| Sunday 0 \| Recipients 6 .*Missing Meet URL 1/.test(run[0][15]), run[0][15]);
});
t('safe to run twice: the same window never re-sends a class (Course ID|date|WINDOW); a newly arranged class is sent alone', () => {
  const F = prep(STD); const G = F.G;
  G.ptaRunWindow_('FRIDAY', F.at(FRI, 17, 30));
  const r2 = J(G.ptaRunWindow_('FRIDAY', F.at(FRI, 17, 45)));
  assert.strictEqual(r2.emailsSent, 0); assert.strictEqual(r2.stats.duplicates, 3); assert.strictEqual(F.env.stats.mails.length, 1);
  assert.ok(F.log().some(r => r[2] === 'RUN' && r[14] === 'ALREADY_SENT'));
  F.G.getOrCreateTeacherAvailabilitySheet_().appendRow([WK, 't@x', 'T', ID.EB, 'n', '', 'not_available', 'parent_teacher_arranged', '', '', '']); // EB changed to Parent-Teacher Arranged
  const r3 = J(G.ptaRunWindow_('FRIDAY', F.at(FRI, 17, 50)));
  assert.strictEqual(r3.emailsSent, 1); assert.deepStrictEqual(r3.classes.map(c => c.key), [ID.EB + '|' + FRI + '|FRIDAY']);
  assert.deepStrictEqual(L(F.env.stats.mails[1].to), ['senthil_aps8131' + D]);
  assert.ok(/meet\.google\.com\/bbb-bbbb-bbb/.test(F.env.stats.mails[1].htmlBody) && /please confirm it is the class Meet/.test(F.env.stats.mails[1].htmlBody), 'class-stream Meet shown with a confirm note');
});
t('Saturday 11:30 AM = Saturday + Sunday classes only; Sunday 6:30 PM = Sunday only; the Friday window keys do not block Saturday', () => {
  const F = prep(STD); const G = F.G;
  G.ptaRunWindow_('FRIDAY', F.at(FRI, 17, 30));
  const s = J(G.ptaRunWindow_('SATURDAY', F.at(SAT, 11, 30)));
  assert.deepStrictEqual(s.classes.map(c => c.key), [ID.EF_SAT + '|' + SAT + '|SATURDAY']);
  assert.strictEqual(s.emailsSent, 1); assert.deepStrictEqual(L(F.env.stats.mails[1].to), ['other_aps8140' + D]);
  assert.ok(F.env.stats.mails[1].htmlBody.indexOf('>Friday — ') === -1);
  const u = J(G.ptaRunWindow_('SUNDAY', F.at(SUN, 18, 30)));
  assert.strictEqual(u.emailsSent, 0); assert.strictEqual(u.classes.length, 0); assert.ok(F.log().some(r => r[2] === 'RUN' && r[3] === 'SUNDAY' && r[14] === 'NOTHING_TO_SEND'));
});
t('dates come from the class day in its Classroom name and the Fri–Sun class week (America/New_York), not the send date; ended sessions are left out', () => {
  const F = prep(STD); const G = F.G;
  const r = J(G.ptaRunWindow_('FRIDAY', F.at(FRI, 17, 30), { dryRun: true }));
  assert.strictEqual(r.weekId, WK);
  assert.deepStrictEqual(r.classes.map(c => c.day + ' ' + c.date).sort(), ['FRI ' + FRI, 'FRI ' + FRI, 'SAT ' + SAT]);
  const late = J(G.ptaRunWindow_('FRIDAY', F.at(FRI, 21, 0), { dryRun: true, ignoreDay: true }));
  assert.deepStrictEqual(late.classes.map(c => c.day), ['SAT']); assert.strictEqual(late.stats.ended, 2);
  const wrong = J(G.ptaRunWindow_('FRIDAY', F.at(SAT, 11, 30)));
  assert.ok(/not Friday/.test(wrong.skipped)); assert.strictEqual(F.env.stats.mails.length, 0);
});
t('only ACTIVE classes ending with AY26-27 (AY25-26, AY27-28 and archived are ignored)', () => {
  const F = prep(Object.assign({ X1: ['not_available', 'parent_teacher_arranged'], X2: ['not_available', 'parent_teacher_arranged'], X3: ['not_available', 'parent_teacher_arranged'] }, STD)); const G = F.G;
  const real = G.readAllCoursesFromCache_;
  G.readAllCoursesFromCache_ = () => real().concat([
    { id: 'X1', name: 'MUNMAZHALAI - EA | FRI 6:30 - 8:00 PM EST | AY25-26', teachers: [], students: [] },
    { id: 'X2', name: 'MUNMAZHALAI - EA | FRI 6:30 - 8:00 PM EST | AY27-28', teachers: [], students: [] },
    { id: 'X3', name: 'MUNMAZHALAI - EZ | FRI 6:30 - 8:00 PM EST | AY26-27', courseState: 'ARCHIVED', teachers: [], students: [] }]);
  const r = J(G.ptaRunWindow_('FRIDAY', F.at(FRI, 17, 30), { dryRun: true }));
  assert.ok(!r.classes.some(c => /^X/.test(c.key))); assert.strictEqual(r.stats.notAyActive, 3);
});
t('email failure is logged as FAILED (no SENT key), so the next run sends it; disabled switch sends nothing', () => {
  const F = prep(STD, {}); const G = F.G;
  ['TICKET_MAIL_OAUTH_CLIENT_ID', 'TICKET_MAIL_OAUTH_CLIENT_SECRET', 'TICKET_MAIL_REFRESH_TOKEN'].forEach(k => delete F.env.props[k]);
  const r = J(G.ptaRunWindow_('FRIDAY', F.at(FRI, 17, 30)));
  assert.strictEqual(r.result, 'FAILED'); assert.ok(/not configured/.test(r.error)); assert.ok(F.log().filter(x => x[2] === 'CLASS').every(x => x[14] === 'FAILED'));
  F.env.props.TICKET_MAIL_ALLOW_MAILAPP_FALLBACK = 'true';
  const r2 = J(G.ptaRunWindow_('FRIDAY', F.at(FRI, 17, 40)));
  assert.strictEqual(r2.result, 'SENT'); assert.strictEqual(F.env.stats.mails.length, 1);
  F.env.props.PTA_COVERAGE_NOTIFY_ENABLED = 'false';
  assert.strictEqual(J(G.ptaRunWindow_('SATURDAY', F.at(SAT, 11, 30))).skipped, 'disabled');
});
t('setup: exactly three weekly triggers in America/New_York (Fri 17:30, Sat 11:30, Sun 18:30); re-running never duplicates; editor-only; handlers refuse non-trigger calls', () => {
  const F = prep(STD); const G = F.G;
  G.createParentTeacherArrangedCoverageTriggers(); const r = J(G.createParentTeacherArrangedCoverageTriggers());
  const tr = F.env.stats.triggers.filter(x => /^apsPtaCoverageNotify/.test(x.fn));
  assert.strictEqual(r.removed, 3); assert.strictEqual(tr.length, 3);
  assert.deepStrictEqual(tr.map(x => [x.fn, x.weekDay, x.hour, x.minute, x.tz]), [['apsPtaCoverageNotifyFriday', 'FRIDAY', 17, 30, 'America/New_York'],
    ['apsPtaCoverageNotifySaturday', 'SATURDAY', 11, 30, 'America/New_York'], ['apsPtaCoverageNotifySunday', 'SUNDAY', 18, 30, 'America/New_York']]);
  ['apsPtaCoverageNotifyFriday', 'apsPtaCoverageNotifySaturday', 'apsPtaCoverageNotifySunday'].forEach(fn => assert.throws(() => G[fn]({}), /Access denied/));
  F.env.stats.activeUser = '';
  ['createParentTeacherArrangedCoverageTriggers', 'removeParentTeacherArrangedCoverageTriggers', 'previewParentTeacherArrangedCoverage', 'runParentTeacherArrangedCoverageNow'].forEach(fn => assert.throws(() => G[fn]('FRIDAY'), /Access denied/, fn));
  F.env.stats.activeUser = undefined;
  assert.strictEqual(J(G.removeParentTeacherArrangedCoverageTriggers()).removed, 3);
});
console.log(process.exitCode ? 'SOME PTA TESTS FAILED' : 'ALL ' + pass + ' PTA TESTS PASSED');

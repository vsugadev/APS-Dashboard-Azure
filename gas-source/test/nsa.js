// r80: New student added → one email per class to the class teacher (after every roster sync) (node test/nsa.js)
const assert = require('assert');
const { setup, ID, D } = require('./coveragefixture');
const J = x => JSON.parse(JSON.stringify(x));
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const L = v => (Array.isArray(v) ? v : String(v || '').split(/\s*,\s*/)).filter(Boolean);
function prep(extra) {
  const F = setup(); Object.assign(F.env.props, { TICKET_MAIL_OAUTH_CLIENT_ID: 'cid', TICKET_MAIL_OAUTH_CLIENT_SECRET: 'cs', TICKET_MAIL_REFRESH_TOKEN: 'rt' }, extra || {});
  F.sync = () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100); return J(F.G.rosterRunSync_('MANUAL', 'admin@aps.org', {})); }; // 1.1 s apart: First_Seen has 1-second resolution
  F.nsaMails = () => F.env.stats.mails.filter(m => /New students? added to your class/.test(m.subject));
  F.add = (cid, uid, name, email) => F.cls.students[cid].push({ userId: uid, profile: { id: uid, name: { fullName: name }, emailAddress: email } });
  F.log = () => { const s = F.env.wb.getSheetByName('New_Student_Email_Log'); return s ? s.getDataRange().getValues().slice(1) : []; };
  return F;
}
t('first sync only sets the baseline — existing students are never announced', () => {
  const F = prep(); const s = F.sync();
  assert.strictEqual(F.nsaMails().length, 0); assert.ok(F.env.props.NEW_STUDENT_EMAIL_SINCE);
  F.sync(); assert.strictEqual(F.nsaMails().length, 0, 'nothing new → nothing sent');
});
t('a student added after the baseline → ONE email for the class, To the Primary Teacher by name, CC HM + admin@, From donotreply@, with name / APSID / email / class / date', () => {
  const F = prep(); F.sync();
  F.add(ID.EA, 'NEW1', 'Nila Kumar', 'nila_aps7001' + D); F.add(ID.EA, 'NEW2', 'Arun Raj', 'arun_aps7002' + D);
  const s = F.sync();
  const m = F.nsaMails(); assert.strictEqual(m.length, 1, 'one combined email for the class');
  const e = m[0];
  assert.ok(/donotreply@avvaiyarpadasalai\.org/.test(e.from), e.from);
  assert.deepStrictEqual(L(e.to), ['ayana_aps8123' + D]);
  assert.deepStrictEqual(L(e.cc).sort(), ['admin@avvaiyarpadasalai.org', 'karuna_aps774' + D].sort());
  assert.strictEqual(e.subject, 'New students added to your class – MUNMAZHALAI - EA (2)');
  const h = e.htmlBody;
  ['Dear Ayana Nivedida Parthiban,', '2 new students have', 'MUNMAZHALAI - EA | FRI 6:30 - 8:00 PM EST | AY26-27', 'Nila Kumar', 'APS7001', 'nila_aps7001' + D, 'Arun Raj', 'APS7002', 'Avvaiyar Padasalai'].forEach(x => assert.ok(h.includes(x), x));
  assert.ok(/\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2} (AM|PM) EST/.test(h), 'date added in EST');
  assert.ok(/Nila Kumar \| APS7001 \| nila_aps7001/.test(e.body), 'plain-text part');
  assert.strictEqual(s.newStudentEmails.sent, 1); assert.strictEqual(s.newStudentEmails.students, 2);
  assert.strictEqual(F.log().filter(r => r[10] === 'SENT').length, 2);
  F.sync(); assert.strictEqual(F.nsaMails().length, 1, 'never announced twice');
});
t('students added to two classes → one email per class; a class with no Primary Teacher goes to admin@ with a note', () => {
  const F = prep(); F.sync();
  F.add(ID.ED, 'N3', 'Kavin', 'kavin_aps7003' + D); F.add(ID.EC, 'N4', 'Malar', 'malar_aps7004' + D);
  const real = F.G.readAllCoursesFromCache_;
  F.G.readAllCoursesFromCache_ = () => real().map(c => { if (String(c.id) === ID.EC) { c.classSupport = []; c.teachers = []; } return c; });
  F.cls.teachers[ID.EC] = [];
  F.sync();
  const m = F.nsaMails(); assert.strictEqual(m.length, 2);
  const ed = m.find(x => /MUNMAZHALAI - ED/.test(x.subject)), ec = m.find(x => /MUNMAZHALAI - EC/.test(x.subject));
  assert.deepStrictEqual(L(ed.to), ['kavitha_aps8130' + D]); assert.ok(/Dear Kavitha Raman,/.test(ed.htmlBody)); assert.strictEqual(ed.subject, 'New student added to your class – MUNMAZHALAI - ED');
  assert.deepStrictEqual(L(ec.to), ['admin@avvaiyarpadasalai.org']); assert.ok(/No Primary Teacher is named/.test(ec.htmlBody));
});
t('a failed email is retried at the next sync; switched off → nothing sent; the sync itself never fails', () => {
  const F = prep(); F.sync();
  ['TICKET_MAIL_OAUTH_CLIENT_ID', 'TICKET_MAIL_OAUTH_CLIENT_SECRET', 'TICKET_MAIL_REFRESH_TOKEN'].forEach(k => delete F.env.props[k]);
  F.add(ID.EB, 'N5', 'Thamizh', 'thamizh_aps7005' + D);
  const s = F.sync(); assert.ok(!/FAILED/.test(s.result)); assert.strictEqual(s.newStudentEmails.failed, 1); assert.strictEqual(F.log()[0][10], 'FAILED');
  F.env.props.TICKET_MAIL_ALLOW_MAILAPP_FALLBACK = 'true';
  F.sync(); assert.strictEqual(F.nsaMails().length, 1, 'retried and sent');
  F.env.props.NEW_STUDENT_EMAIL_ENABLED = 'false'; F.add(ID.EB, 'N6', 'Iniyan', 'iniyan_aps7006' + D);
  assert.deepStrictEqual(F.sync().newStudentEmails, { skipped: 'disabled' }); assert.strictEqual(F.nsaMails().length, 1);
  delete F.env.props.NEW_STUDENT_EMAIL_ENABLED; F.sync(); assert.strictEqual(F.nsaMails().length, 2, 'switched back on → the waiting student is announced');
  F.G.nsaMessage_ = () => { throw new Error('boom'); }; F.add(ID.EB, 'N7', 'Ezhil', 'ezhil_aps7007' + D);
  assert.ok(!/FAILED/.test(F.sync().result), 'an email problem never breaks the sync');
});
t('HM CC can be switched off; removed students are not announced', () => {
  const F = prep({ NEW_STUDENT_EMAIL_CC_HM: 'false' }); F.sync();
  F.add(ID.EA, 'N8', 'Selvi', 'selvi_aps7008' + D); F.sync();
  assert.deepStrictEqual(L(F.nsaMails()[0].cc), ['admin@avvaiyarpadasalai.org']);
  F.add(ID.EA, 'N9', 'Gone', 'gone_aps7009' + D); F.cls.students[ID.EA] = F.cls.students[ID.EA].filter(x => x.userId !== 'N9');
  F.sync(); assert.strictEqual(F.nsaMails().length, 1);
});
console.log(process.exitCode ? 'SOME NSA TESTS FAILED' : 'ALL ' + pass + ' NEW-STUDENT EMAIL TESTS PASSED');

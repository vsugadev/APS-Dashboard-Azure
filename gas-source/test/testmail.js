// r63: TEST environment email guard (node test/testmail.js)
const assert = require('assert');
const { build } = require('./gradingfixture');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const T1 = 'ayana_aps8123@avvaiyarpadasalai.org', T2 = 'kavitha_aps8130@avvaiyarpadasalai.org', ADM = 'admin@avvaiyarpadasalai.org', STU = 'sa0_aps6650@avvaiyarpadasalai.org', INFO = 'info@avvaiyarpadasalai.org';
const env = props => { const F = build({ props: props || {} }); F.env.stats.mails.length = 0; return F; };
const viaGmail = G => G.attMailSend_({ to: [T1, T2], cc: [ADM], bcc: [STU], replyTo: T1, subject: 'Weekly Report', html: '<p>Hello teachers</p>', text: 'Hello teachers' });
const viaMailApp = G => G.sendApsHtmlEmail_({ to: T1 + ',' + T2, cc: ADM, bcc: STU, subject: 'Alert', htmlBody: '<p>Alert body</p>', body: 'Alert body' });

t('LIVE (property unset or LIVE): both send paths are exactly as before', () => {
  [{}, { APS_ENVIRONMENT: 'LIVE' }].forEach(props => {
    const F = env(props), G = F.G, mails = F.env.stats.mails;
    viaGmail(G); viaMailApp(G);
    assert.strictEqual(mails.length, 2);
    const g = mails[0], m = mails[1];
    assert.strictEqual(g.to, T1 + ',' + T2); assert.strictEqual(g.cc, ADM); assert.strictEqual(g.bcc, STU); assert.strictEqual(g.subject, 'Weekly Report'); assert.strictEqual(g.htmlBody, '<p>Hello teachers</p>');
    assert.strictEqual(m.to, T1 + ',' + T2); assert.strictEqual(m.cc, ADM); assert.strictEqual(m.bcc, STU); assert.strictEqual(m.subject, 'Alert'); assert.strictEqual(m.htmlBody, '<p>Alert body</p>'); assert.strictEqual(m.body, 'Alert body');
    assert.ok(!/TEST ENVIRONMENT/.test(JSON.stringify(mails)));
  });
});

t('TESTING (default REDIRECT): only info@, no CC / BCC, subject prefix, banner lists LIVE recipients, BCC as a count only', () => {
  const F = env({ APS_ENVIRONMENT: 'TESTING' }), G = F.G, mails = F.env.stats.mails;
  viaGmail(G); viaMailApp(G);
  assert.strictEqual(mails.length, 2);
  mails.forEach(x => {
    assert.strictEqual(x.to, INFO); assert.ok(!x.cc, 'no CC'); assert.ok(!x.bcc, 'no BCC');
    assert.ok(/^\[TEST ENVIRONMENT\] /.test(x.subject), x.subject);
    assert.ok(x.htmlBody.includes('THIS EMAIL WAS SENT FROM THE TEST ENVIRONMENT') && x.body.startsWith('*** THIS EMAIL WAS SENT FROM THE TEST ENVIRONMENT ***'));
    assert.ok(x.htmlBody.includes(T1) && x.htmlBody.includes(T2) && x.htmlBody.includes(ADM), 'LIVE To / CC listed');
    assert.ok(!JSON.stringify(x).includes(STU) && x.htmlBody.includes('1 hidden recipient'), 'BCC address never shown');
  });
  assert.ok(mails[0].htmlBody.endsWith('<p>Hello teachers</p>') && mails[1].body.endsWith('Alert body'), 'original content kept under the banner');
  assert.ok(/<attendance@avvaiyarpadasalai\.org>$/.test(mails[0].from), 'sender unchanged (attendance@)');
  // 'TEST' (old value) is treated as TESTING too
  const F2 = env({ APS_ENVIRONMENT: 'TEST' }); viaMailApp(F2.G); assert.strictEqual(F2.env.stats.mails[0].to, INFO);
});

t('TESTING: attachments kept, double prefix avoided, custom / invalid redirect address', () => {
  const F = env({ APS_ENVIRONMENT: 'TESTING', TEST_EMAIL_REDIRECT_TO: 'qa@avvaiyarpadasalai.org' }), G = F.G, mails = F.env.stats.mails;
  const blob = { getName: () => 'letter.pdf' };
  assert.strictEqual(G.apsMailAppSend_({ to: T1, cc: ADM, subject: '[TEST ENVIRONMENT] Letter', body: 'x', htmlBody: '<p>x</p>', attachments: [blob] }), true);
  assert.strictEqual(mails[0].to, 'qa@avvaiyarpadasalai.org'); assert.strictEqual(mails[0].attachments[0], blob);
  assert.strictEqual(mails[0].subject, '[TEST ENVIRONMENT] Letter', 'no double prefix');
  const F2 = env({ APS_ENVIRONMENT: 'TESTING', TEST_EMAIL_REDIRECT_TO: 'not an email' }); viaMailApp(F2.G); assert.strictEqual(F2.env.stats.mails[0].to, INFO);
  const F3 = env({ APS_ENVIRONMENT: 'TESTING' }); F3.G.apsMailAppSend_({ to: T1, subject: 'Text only', body: 'plain' });
  assert.ok(F3.env.stats.mails[0].body.startsWith('*** THIS EMAIL') && F3.env.stats.mails[0].htmlBody === undefined, 'text-only mail stays text-only');
});

t('TESTING + TEST_EMAIL_MODE=OFF: nothing sent, callers still see success', () => {
  const F = env({ APS_ENVIRONMENT: 'TESTING', TEST_EMAIL_MODE: 'off' }), G = F.G;
  const r = G.apsGmailSend_('ATTENDANCE', { to: [T1], cc: [], subject: 's', html: 'h', text: 't' });
  assert.strictEqual(r.ok, true); assert.strictEqual(r.mode, 'TEST_OFF');
  assert.doesNotThrow(() => viaGmail(G)); assert.strictEqual(G.apsMailAppSend_({ to: T1, subject: 's', body: 'b' }), false); viaMailApp(G);
  assert.strictEqual(F.env.stats.mails.length, 0);
});

t('TESTING daily cap (default 30, TEST_EMAIL_DAILY_CAP): extra emails suppressed; counter resets the next day', () => {
  const F = env({ APS_ENVIRONMENT: 'TESTING', TEST_EMAIL_DAILY_CAP: '2' }), G = F.G, mails = F.env.stats.mails;
  viaMailApp(G); viaMailApp(G); viaMailApp(G); viaGmail(G);
  assert.strictEqual(mails.length, 2);
  F.env.props.APS_TEST_EMAIL_COUNT = JSON.stringify({ day: '2000-01-01', n: 99 });
  viaMailApp(G); assert.strictEqual(mails.length, 3, 'new day');
  const D = env({ APS_ENVIRONMENT: 'TESTING' }); for (let i = 0; i < 32; i++) viaMailApp(D.G);
  assert.strictEqual(D.env.stats.mails.length, 30, 'default cap 30');
  const Z = env({ APS_ENVIRONMENT: 'TESTING', TEST_EMAIL_DAILY_CAP: '0' }); viaMailApp(Z.G); assert.strictEqual(Z.env.stats.mails.length, 0);
});

t('real feature in TESTING: Remove Student email reaches only info@, workflow completes', () => {
  const { setup, STU: S, ID } = require('./removalfixture');
  const F = setup({ props: { APS_ENVIRONMENT: 'TESTING' } }); F.env.stats.mails.length = 0;
  const r = F.remove(F.tok2.admin);
  assert.strictEqual(r.record.removal, 'REMOVED'); assert.strictEqual(r.record.email, 'EMAIL_SENT');
  const m = F.env.stats.mails; assert.strictEqual(m.length, 1); assert.strictEqual(m[0].to, INFO); assert.ok(!m[0].cc);
  assert.ok(/^\[TEST ENVIRONMENT\] APS Dashboard – Student Removed from Google Classroom/.test(m[0].subject));
  assert.ok(m[0].htmlBody.includes('ayana_aps8123@avvaiyarpadasalai.org'), 'banner shows the LIVE class teacher');
});

console.log(pass + ' passed');

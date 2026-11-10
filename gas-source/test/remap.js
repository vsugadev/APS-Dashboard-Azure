// r66: Assign Classroom → Re-Map Student — email recipients + notice (node test/remap.js)
const assert = require('assert');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const { setup: covSetup, ID, D } = require('./coveragefixture');
const STU = 'sa0_aps6650' + D, ADMIN = 'admin@avvaiyarpadasalai.org', AYANA = 'ayana_aps8123' + D, KAV = 'kavitha_aps8130' + D;
function setup(props) {
  const F = covSetup({ props: Object.assign({ APS_DASHBOARD_EMAIL_CC: ADMIN }, props || {}) }); const { cls, G } = F;
  G.Classroom.Courses.Students.remove = (cid, email) => { cls.students[cid] = (cls.students[cid] || []).filter(s => s.profile.emailAddress !== email); return {}; };
  G.Classroom.Courses.Students.create = (body, cid) => { (cls.students[cid] = cls.students[cid] || []).push({ userId: 'N' + Math.random(), profile: { emailAddress: body.userId, name: { fullName: 'Moved' } } }); return {}; };
  F.env.stats.mails.length = 0;
  F.A = F.tok('admin@aps.org', 'admin');
  return F;
}
const NOTICE = ['It is the parent’s responsibility to ensure that the student completes all missed classwork and homework and attaches/submits them in the new Google Classroom.',
  'We will follow the APS Grading Policy for all academic and grading requirements.',
  'For a grade change, we can NOT guarantee a new set of books for the new grade.'];

t('email goes to the student; CC admin@ + the OLD and the NEW class teacher (no duplicates); notice + teacher lines in HTML and text', () => {
  const F = setup(); const r = F.G.assignStudentToClassroom(F.A, STU, ID.ED, 'Parent asked for the Friday 6:30 ED class');
  assert.strictEqual(r.ok, true);
  const m = F.env.stats.mails; assert.strictEqual(m.length, 1);
  assert.strictEqual(m[0].to, STU);
  assert.deepStrictEqual(m[0].cc.split(','), [ADMIN, AYANA, KAV]);
  assert.strictEqual(m[0].subject, 'APS Classroom Assignment Updated - MUNMAZHALAI - ED | FRI 6:30 - 8:00 PM EST | AY26-27');
  const h = m[0].htmlBody, b = m[0].body;
  ['Classroom Assignment Updated', 'Previous Classroom:</b> MUNMAZHALAI - EA', 'Previous Class Teacher:</b> Ayana Nivedida Parthiban (' + AYANA + ')', 'New Class Teacher:</b> Kavitha Raman (' + KAV + ')', '<b>Important:</b> ']
    .forEach(x => assert.ok(h.includes(x), 'html: ' + x));
  NOTICE.forEach(x => assert.ok(h.includes(x.replace('’', '&#39;')) || h.includes(x), 'html notice: ' + x.slice(0, 40)));
  assert.ok(b.includes('Important: ' + NOTICE[0]) && b.includes(NOTICE[1]) && b.includes(NOTICE[2]), 'text notice');
  assert.ok(b.includes('Previous class teacher: Ayana Nivedida Parthiban (' + AYANA + ')') && b.includes('New class teacher: Kavitha Raman (' + KAV + ')'));
});

t('student not in any class (first assignment): only the new teacher is added; config CC still kept', () => {
  const F = setup(); const NEW = 'newkid_aps9999' + D;
  F.G.assignStudentToClassroom(F.A, NEW, ID.EB, 'New admission');
  const m = F.env.stats.mails[0];
  assert.deepStrictEqual(m.cc.split(','), [ADMIN, 'senthil_aps8131' + D]);
  assert.ok(m.htmlBody.includes('Previous Classroom:</b> (none)') && m.htmlBody.includes('Previous Class Teacher:</b> —'));
});

t('no APS_DASHBOARD_EMAIL_CC configured: the two teachers are still copied; same teacher in both classes listed once', () => {
  const F = setup({ APS_DASHBOARD_EMAIL_CC: '' });
  F.G.assignStudentToClassroom(F.A, STU, ID.ED, 'Timing change');
  assert.deepStrictEqual(F.env.stats.mails[0].cc.split(','), [AYANA, KAV]);
  const F2 = setup(); // EC and EE_7 share "Other T" as class teacher
  F2.G.assignStudentToClassroom(F2.A, 'sc0_aps6670' + D, ID.EE_7, 'Later time slot');
  assert.deepStrictEqual(F2.env.stats.mails[0].cc.split(','), [ADMIN, 'other_aps8140' + D], 'deduplicated');
});

t('unchanged: Admin only, reason required, move + audit still work; TEST environment guard still applies', () => {
  const F = setup();
  assert.throws(() => F.G.assignStudentToClassroom(F.tok('hm@aps.org', 'headmaster'), STU, ID.ED, 'x'), /ACCESS_OFF|Only Admin/);
  assert.throws(() => F.G.assignStudentToClassroom(F.A, STU, ID.ED, '  '), /reason is required/);
  assert.strictEqual(F.env.stats.mails.length, 0);
  const T = setup({ APS_ENVIRONMENT: 'TESTING' });
  T.G.assignStudentToClassroom(T.A, STU, ID.ED, 'Test env');
  const m = T.env.stats.mails[0]; assert.strictEqual(m.to, 'info@avvaiyarpadasalai.org'); assert.ok(!m.cc);
  assert.ok(m.htmlBody.includes(AYANA) && m.htmlBody.includes(KAV), 'banner lists the LIVE recipients');
});

console.log(pass + ' passed');

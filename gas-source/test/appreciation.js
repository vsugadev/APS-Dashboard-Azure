// APS Appreciation Certificate Generator (Letters tab, r39) — node test/appreciation.js
const assert = require('assert');
const { build } = require('./gradingfixture');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const J = x => JSON.parse(JSON.stringify(x));
const RealDate = Date;
const TEMPLATE = '1-k45mRP1vb0m8mhurUpHxBjeRI7N4V-Iw_XzQm4GsiE';
const TA = 'teachera_aps101@avvaiyarpadasalai.org', JO = 'joshua_aps3407@avvaiyarpadasalai.org', RA = 'raja_aps1234@avvaiyarpadasalai.org', ME = 'meena_aps5555@avvaiyarpadasalai.org';
function setup(opts) {
  opts = opts || {};
  const F = build(); const { G, env, ids } = F;
  { const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0); P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p; }
  G.syncClassroomData();
  const T = new RealDate('2026-10-06T15:00:00-04:00').getTime();
  class D extends RealDate { constructor(...a) { if (a.length) super(...a); else super(T); } static now() { return T; } }
  G.Date = D;
  const drive = F.drive = { copies: [], trashed: [], templateOpened: 0, docs: {}, mails: [] };
  const section = txt => ({ txt, replaceText(p, r) { if (opts.stuckPlaceholder && /TEACHER_MESSAGE/.test(p)) return this; const lit = r.replace(/\$\$/g, '$'); this.txt = this.txt.split(new RegExp(p, 'g')).join(lit); return this; }, getText() { return this.txt; } });
  G.MimeType = { PDF: 'application/pdf' };
  G.DriveApp = {
    getFileById(id) {
      if (id === TEMPLATE) { if (opts.noTemplate) throw new Error('No item with the given ID could be found, or you do not have permission to access it.');
        return { makeCopy(name) { const cid = 'COPY' + drive.copies.length; drive.copies.push({ id: cid, name }); drive.docs[cid] = { body: section('Certificate for {{STUDENT_FULLNAME}} — "{{TEACHER_MESSAGE}}" — {{STUDENT_FULLNAME}}'), header: section('Issued {{ISSUE_DATE}}'), footer: null, saved: false }; return { getId: () => cid }; } }; }
      const d = drive.docs[id];
      return { getAs(m) { return { mime: m, text: d.body.txt + ' | ' + d.header.txt, setName(n) { this.name = n; return this; } }; }, setTrashed(v) { drive.trashed.push(id); } };
    },
    getFolderById() { throw new Error('no folder'); }
  };
  G.DocumentApp = { openById(id) { if (id === TEMPLATE) drive.templateOpened++; const d = drive.docs[id]; return { getBody: () => d.body, getHeader: () => d.header, getFooter: () => d.footer, saveAndClose() { d.saved = true; } }; } };
  G.MailApp = { sendEmail(p) { if (opts.mailFails) throw new Error('Service invoked too many times'); drive.mails.push(p); } };
  F.gen = (who, role, req) => G.generateAppreciationCertificate(F.tok(who, role), req);
  F.audit = () => (env.wb.getSheetByName('Appreciation_Certificate_Audit') || { data: [] }).data.slice(1).filter(r => r && r.length);
  return F;
}
const msg5 = 'Wonderful effort in every class';
const msg15 = 'Wonderful effort and enthusiastic participation in every Tamil class this term, keep shining bright always';
const msg16 = msg15 + ' friend';

t('word count / issue date helpers', () => {
  const { G } = setup();
  assert.strictEqual(G.countWords_('Excellent work!'), 2);
  assert.strictEqual(G.countWords_('  a   b\n c\t d  '), 4);
  assert.strictEqual(msg15.split(' ').length, 15);
  assert.strictEqual(G.appreciationIssueDate_(new RealDate('2026-10-06T23:30:00-04:00')), '10-06-2026');
  assert.strictEqual(G.appreciationIssueDate_(new RealDate('2026-10-07T02:30:00Z')), '10-06-2026', 'America/New_York, not UTC');
  assert.strictEqual(G.appreciationSafeFileName_('A/B: "C"*?<x>|y'), 'A B C x y');
});

t('student list = the teacher’s own AY26-27 classes only, one entry per student with class context', () => {
  const F = setup(); const { G, ids } = F;
  const d = J(G.getAppreciationCertificateStudents(F.tok(TA, 'teacher')));
  assert.strictEqual(d.teacherEmail, TA);
  const emails = d.students.map(s => s.studentEmail).sort();
  assert.deepStrictEqual(emails, [JO, RA].sort());
  const jo = d.students.find(s => s.studentEmail === JO);
  assert.deepStrictEqual(jo.courses.map(c => c.courseId).sort(), [ids.N3EF, ids.N3EA].sort());
  assert.strictEqual(jo.studentFullName, 'Joshua Kumar'); assert.strictEqual(jo.validEmail, true);
  assert.ok(!emails.includes(ME), 'another teacher’s student never listed');
  assert.deepStrictEqual(d.classes.map(c => c.courseId).sort(), [ids.N3EF, ids.N3EA].sort(), 'Google Classroom filter = own classes');
  assert.strictEqual(d.allClasses, false);
  // r42: Admin / Super Admin / Head Master see every AY26-27 class and student
  ['admin', 'superadmin', 'headmaster'].forEach(role => {
    const a = J(G.getAppreciationCertificateStudents(F.tok(role + '@aps.org', role)));
    assert.strictEqual(a.allClasses, true);
    assert.ok(a.students.some(s => s.studentEmail === ME) && a.classes.length > 100 && !a.classes.some(c => c.courseId === '9999'), role);
  });
  assert.throws(() => G.getAppreciationCertificateStudents(F.tok('bod@aps.org', 'vcfo_amchsts_bod')), /Only a Teacher account/);
  assert.throws(() => G.getAppreciationCertificateStudents(F.tok(JO, 'student')), /Only a Teacher account/, 'a student gets no roster');
  assert.throws(() => G.getAppreciationCertificateStudents('bogus'), /SESSION_EXPIRED/);
});

t('success: copy → fill (name edited, special characters) → PDF → To student, CC teacher + admin@; template untouched', () => {
  const F = setup(); const { ids } = F;
  const r = J(F.gen(TA, 'teacher', { studentId: JO, courseId: ids.N3EF, studentName: '  José  María $1 ', appreciationMessage: 'Excellent effort, creativity, kindness, and participation — $5 star!', studentEmail: 'evil@x.com' }));
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.fileName, 'APS Appreciation Certificate - José María $1 - 10-06-2026.pdf');
  assert.strictEqual(r.message, 'APS Appreciation Certificate generated and emailed successfully to José María $1.');
  const d = F.drive;
  assert.strictEqual(d.copies.length, 1); assert.strictEqual(d.copies[0].name, 'APS Appreciation Certificate - José María $1 - 10-06-2026');
  assert.strictEqual(d.templateOpened, 0, 'template never opened for editing');
  const doc = d.docs.COPY0;
  assert.strictEqual(doc.body.txt, 'Certificate for José María $1 — "Excellent effort, creativity, kindness, and participation — $5 star!" — José María $1');
  assert.strictEqual(doc.header.txt, 'Issued 10-06-2026');
  assert.ok(doc.saved); assert.deepStrictEqual(d.trashed, ['COPY0'], 'temporary copy trashed');
  assert.strictEqual(d.mails.length, 1);
  const m = d.mails[0];
  assert.strictEqual(m.to, JO, 'roster email, never the browser value');
  assert.strictEqual(m.cc, TA + ',admin@avvaiyarpadasalai.org');
  assert.strictEqual(m.attachments[0].name, r.fileName); assert.strictEqual(m.attachments[0].mime, 'application/pdf');
  assert.ok(/Dear José María \$1,/.test(m.body) && /Congratulations!/.test(m.body) && /APS Team/.test(m.body));
  assert.ok(!/COPY0|courseId|80\d\d/.test(m.body + m.htmlBody), 'no internal ids in the email');
  const a = F.audit(); assert.strictEqual(a.length, 1);
  assert.deepStrictEqual([a[0][1], a[0][2], a[0][3], a[0][4], String(a[0][5]), a[0][7], a[0][8]], [TA, JO, 'José María $1', JO, ids.N3EF, 'APS Appreciation Certificate', 'SENT']);
  assert.ok(!a[0].join(' ').includes('creativity'), 'appreciation text is not logged');
});

t('word limits: 4 / empty / 16 rejected; 5 and 15 accepted; empty name rejected — server side', () => {
  const F = setup(); const { ids } = F;
  const base = { studentId: JO, courseId: ids.N3EF, studentName: 'Joshua Kumar' };
  assert.throws(() => F.gen(TA, 'teacher', Object.assign({}, base, { appreciationMessage: 'Great job this term' })), /at least 5 words/);
  assert.throws(() => F.gen(TA, 'teacher', Object.assign({}, base, { appreciationMessage: '   ' })), /at least 5 words/);
  assert.throws(() => F.gen(TA, 'teacher', Object.assign({}, base, { appreciationMessage: msg16 })), /no more than 15 words/);
  assert.throws(() => F.gen(TA, 'teacher', Object.assign({}, base, { studentName: '  ', appreciationMessage: msg5 })), /Please enter the student name/);
  assert.strictEqual(F.drive.mails.length, 0);
  assert.strictEqual(F.gen(TA, 'teacher', Object.assign({}, base, { appreciationMessage: msg5 })).success, true);
  assert.strictEqual(F.gen(TA, 'teacher', { studentId: RA, courseId: ids.N3EF, studentName: 'Raja', appreciationMessage: msg15 }).success, true);
  assert.strictEqual(F.drive.mails.length, 2);
});

t('security: tampered studentId / courseId never reaches a student outside the teacher’s roster', () => {
  const F = setup(); const { ids } = F;
  [[ME, ids.MAZ], [ME, ids.N3EF], [JO, ids.MAZ], ['', ids.N3EF], ['evil@x.com', ids.N3EF], [RA, ids.N3EA]].forEach(([sid, cid]) =>
    assert.throws(() => F.gen(TA, 'teacher', { studentId: sid, courseId: cid, studentName: 'X', appreciationMessage: msg5 }), sid ? /not authorized to generate a certificate/ : /Please select a student/, sid + '@' + cid));
  assert.throws(() => F.gen(JO, 'student', { studentId: RA, courseId: ids.N3EF, studentName: 'X', appreciationMessage: msg5 }), /Only a Teacher account/);
  assert.throws(() => F.gen('bod@aps.org', 'vcfo_amchsts_bod', { studentId: JO, courseId: ids.N3EF, studentName: 'X', appreciationMessage: msg5 }), /Read-only/);
  assert.strictEqual(F.drive.mails.length, 0); assert.strictEqual(F.drive.copies.length, 0);
  assert.ok(F.audit().every(r => r[8] === 'DENIED'));
});

t('duplicate submission within 2 minutes is refused', () => {
  const F = setup(); const { ids } = F;
  const req = { studentId: JO, courseId: ids.N3EF, studentName: 'Joshua', appreciationMessage: msg5 };
  F.gen(TA, 'teacher', req);
  assert.throws(() => F.gen(TA, 'teacher', req), /already being generated/);
  assert.strictEqual(F.drive.mails.length, 1);
});

t('failures: template not accessible / placeholder left / email failure — friendly messages, audited', () => {
  let F = setup({ noTemplate: true });
  assert.throws(() => F.gen(TA, 'teacher', { studentId: JO, courseId: F.ids.N3EF, studentName: 'J', appreciationMessage: msg5 }), /template could not be accessed\. Please contact APS support\.$/);
  assert.strictEqual(F.audit()[0][8], 'FAILED'); assert.strictEqual(F.drive.mails.length, 0);
  F = setup({ stuckPlaceholder: true });
  assert.throws(() => F.gen(TA, 'teacher', { studentId: JO, courseId: F.ids.N3EF, studentName: 'J', appreciationMessage: msg5 }), /^Error: The certificate could not be generated\. Please try again\.$/);
  assert.strictEqual(F.drive.mails.length, 0, 'never emailed with an unresolved placeholder'); assert.deepStrictEqual(F.drive.trashed, ['COPY0']);
  F = setup({ mailFails: true });
  assert.throws(() => F.gen(TA, 'teacher', { studentId: JO, courseId: F.ids.N3EF, studentName: 'J', appreciationMessage: msg5 }), /generated, but the email could not be sent/);
  assert.strictEqual(F.audit()[0][8], 'GENERATED_EMAIL_FAILED');
});

t('Reference Letter functions are untouched and still callable', () => {
  const F = setup();
  ['submitReferenceLetterRequest', 'getMyReferenceLetterRequests', 'getReferenceLetterRequestsForApprover', 'decideReferenceLetterFinalApproval', 'generateReferenceLetterPdf_', 'submitAdminInitiatedReferenceLetter'].forEach(fn => assert.strictEqual(typeof F.G[fn], 'function', fn));
});

t('Teacher Appreciation Letter: Admin / Super Admin / HM only; all class teachers listed (support / admin / HM excluded)', () => {
  const F = setup(); const { G } = F;
  const d = J(G.getTeacherAppreciationTeachers(F.tok('hm@aps.org', 'headmaster')));
  const emails = d.teachers.map(x => x.teacherEmail);
  assert.ok(emails.includes(TA) && emails.includes('teacherb_aps102@avvaiyarpadasalai.org'));
  assert.ok(!emails.some(e => /^(admin|hm|support)@/.test(e)), emails.join());
  assert.strictEqual(new Set(emails).size, emails.length, 'one entry per teacher');
  assert.ok(Array.isArray(J(G.getTeacherAppreciationTeachers(F.tok('sa@aps.org', 'superadmin'))).teachers));
  [[TA, 'teacher'], [JO, 'student'], ['bod@aps.org', 'vcfo_amchsts_bod'], ['x@aps.org', 'authorized']].forEach(([e, r]) => {
    assert.throws(() => G.getTeacherAppreciationTeachers(F.tok(e, r)), /Only an Admin, Super Admin or Head Master/, r);
    assert.throws(() => G.generateTeacherAppreciationLetter(F.tok(e, r), { teacherId: TA, teacherName: 'A', appreciationMessage: msg5 }), /Only an Admin, Super Admin or Head Master/, r);
  });
});

t('Teacher Appreciation Letter: same template, To teacher, CC sender + admin@, roster email only', () => {
  const F = setup(); const { G } = F;
  const r = J(G.generateTeacherAppreciationLetter(F.tok('admin@aps.org', 'admin'), { teacherId: TA, teacherName: 'Teacher Aarthi', appreciationMessage: 'Thank you for your inspiring Tamil teaching', teacherEmail: 'evil@x.com' }));
  assert.strictEqual(r.fileName, 'APS Teacher Appreciation Letter - Teacher Aarthi - 10-06-2026.pdf');
  assert.strictEqual(r.message, 'APS Teacher Appreciation Letter generated and emailed successfully to Teacher Aarthi.');
  assert.strictEqual(F.drive.docs.COPY0.body.txt.indexOf('Certificate for Teacher Aarthi'), 0);
  assert.strictEqual(F.drive.docs.COPY0.header.txt, 'Issued 10-06-2026');
  const m = F.drive.mails[0];
  assert.strictEqual(m.to, TA); assert.strictEqual(m.cc, 'admin@aps.org,admin@avvaiyarpadasalai.org');
  assert.ok(/Thank you!/.test(m.body) && /APS Teacher Appreciation Letter attached/.test(m.body));
  assert.strictEqual(F.audit()[0][7], 'APS Teacher Appreciation Letter');
  assert.throws(() => G.generateTeacherAppreciationLetter(F.tok('admin@aps.org', 'admin'), { teacherId: TA, teacherName: 'T', appreciationMessage: msg5 }), /already being generated/);
  [JO, 'support@avvaiyarpadasalai.org', 'evil@x.com'].forEach(id => assert.throws(() => G.generateTeacherAppreciationLetter(F.tok('admin@aps.org', 'admin'), { teacherId: id, teacherName: 'X', appreciationMessage: msg5 }), /not authorized to send an appreciation letter/, id));
  assert.throws(() => G.generateTeacherAppreciationLetter(F.tok('hm@aps.org', 'headmaster'), { teacherId: 'teacherb_aps102@avvaiyarpadasalai.org', teacherName: 'B', appreciationMessage: msg16 }), /no more than 15 words/);
  assert.strictEqual(F.drive.mails.length, 1);
});

t('r41: template with placeholders in TEXT BOXES (real template .docx) → merged via .docx export, re-imported, PDF; nothing left unmerged', () => {
  const fs = require('fs'); const Z = require('./ziputil');
  const F = setup(); const { G, ids } = F;
  // The real template keeps its text in drawings: DocumentApp sees no placeholders in body/header/footer.
  F.drive.docsEmpty = true;
  const origOpen = G.DocumentApp.openById;
  G.DocumentApp.openById = id => { const d = F.drive.docs[id]; d.body.txt = ''; d.header.txt = ''; return origOpen(id); };
  const toBlob = (bytes, name, ct) => ({ bytes: Buffer.from(bytes), name, ct, getName() { return this.name; }, getBytes() { return Array.from(this.bytes); }, getDataAsString() { return this.bytes.toString('utf8'); }, setContentType(c) { this.ct = c; return this; }, setName(n) { this.name = n; return this; } });
  G.Utilities.unzip = b => Z.unzip(b.bytes).map(e => toBlob(e.data, e.name));
  G.Utilities.zip = (blobs, name) => toBlob(Z.zip(blobs.map(b => ({ name: b.getName(), data: Buffer.from(b.bytes) }))), name, 'application/zip');
  G.Utilities.newBlob = (data, ct, name) => toBlob(typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data), name, ct);
  G.MimeType.MICROSOFT_WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const tpl = fs.readFileSync(__dirname + '/appreciation_template.docx');
  const fetched = []; let uploaded = null;
  G.UrlFetchApp = { fetch(url, opt) {
    fetched.push(url);
    if (/\/export\?mimeType=/.test(url)) { assert.ok(url.includes(TEMPLATE)); return { getResponseCode: () => 200, getBlob: () => toBlob(tpl, 'tpl.docx') }; }
    if (/upload\/drive\/v3\/files\?uploadType=multipart/.test(url)) {
      const body = Buffer.from(opt.payload.map(b => b & 255)); const start = body.indexOf(Buffer.from('PK\u0003\u0004', 'latin1')); const end = body.lastIndexOf(Buffer.from('\r\n--'));
      uploaded = { meta: JSON.parse(body.slice(body.indexOf('{'), body.indexOf('}') + 1).toString()), docx: body.slice(start, end), contentType: opt.contentType };
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ id: 'TEMPDOC' }) };
    }
    throw new Error('unexpected fetch ' + url);
  } };
  const df = G.DriveApp.getFileById;
  G.DriveApp.getFileById = id => id === 'TEMPDOC' ? { getAs(m) { return { mime: m, setName(n) { this.name = n; return this; } }; }, setTrashed() { F.drive.trashed.push('TEMPDOC'); } } : df(id);
  const r = J(F.gen(TA, 'teacher', { studentId: JO, courseId: ids.N3EF, studentName: 'José <Raj> & María', appreciationMessage: 'Outstanding effort, kindness & "teamwork" — $5 star!' }));
  assert.strictEqual(r.success, true);
  assert.strictEqual(uploaded.meta.mimeType, 'application/vnd.google-apps.document', 'imported as a temporary Google Doc');
  assert.ok(/^multipart\/related; boundary=/.test(uploaded.contentType));
  const entries = Z.unzip(uploaded.docx);
  const orig = Z.unzip(tpl);
  assert.deepStrictEqual(entries.map(e => e.name).sort(), orig.map(e => e.name).sort(), 'every part kept');
  assert.strictEqual(entries.find(e => e.name === 'word/media/image1.png').data.length, orig.find(e => e.name === 'word/media/image1.png').data.length, 'background image intact');
  const xml = entries.find(e => e.name === 'word/document.xml').data.toString('utf8');
  assert.ok(!/\{\{(STUDENT_FULLNAME|TEACHER_MESSAGE|ISSUE_DATE)\}\}/.test(xml), 'no placeholder left');
  assert.ok(xml.includes('José &lt;Raj&gt; &amp; María'), 'name merged + XML-escaped');
  assert.ok(xml.includes('Outstanding effort, kindness &amp; &quot;teamwork&quot; — $5 star!'), 'message merged');
  assert.ok(xml.includes('>10-06-2026<'), 'issue date merged');
  assert.ok(F.drive.trashed.includes('TEMPDOC') && F.drive.trashed.includes('COPY0'), 'temporary files trashed');
  assert.strictEqual(F.drive.mails[0].to, JO);
  fs.writeFileSync(__dirname + '/appreciation_merged_sample.docx', uploaded.docx);
});

t('r42: Head Master sends a Student Appreciation Letter to any class; teacher list carries Nilai for the filter', () => {
  const F = setup(); const { G, ids } = F;
  const r = J(G.generateAppreciationCertificate(F.tok('hm@aps.org', 'headmaster'), { studentId: ME, courseId: ids.MAZ, studentName: 'Meena', appreciationMessage: msg5 }));
  assert.strictEqual(r.success, true);
  assert.strictEqual(F.drive.mails[0].to, ME); assert.strictEqual(F.drive.mails[0].cc, 'hm@aps.org,admin@avvaiyarpadasalai.org');
  assert.throws(() => G.generateAppreciationCertificate(F.tok('hm@aps.org', 'headmaster'), { studentId: ME, courseId: ids.N3EF, studentName: 'M', appreciationMessage: msg5 }), /not authorized/, 'still must be on that class roster');
  const t2 = J(G.getTeacherAppreciationTeachers(F.tok('admin@aps.org', 'admin')));
  assert.deepStrictEqual(t2.nilaiOptions.slice(0, 4), ['MUNMAZHALAI', 'MAZHALAI', 'NILAI 1', 'NILAI 2']);
  const tb = t2.teachers.find(x => x.teacherEmail === 'teacherb_aps102@avvaiyarpadasalai.org');
  assert.ok(tb.courses.some(c => c.nilai === 'MAZHALAI') && tb.courses.some(c => c.nilai === 'NILAI 4'), JSON.stringify(tb.courses.map(c => c.nilai)));
});

t('r42: manual entry (name + APS email typed) by teacher / HM; non-APS email refused; audit marks MANUAL + role', () => {
  const F = setup(); const { G, ids } = F;
  const r = J(G.generateAppreciationCertificate(F.tok(TA, 'teacher'), { manual: true, recipientEmail: 'NewKid_APS9999@avvaiyarpadasalai.org', studentName: 'New Kid', appreciationMessage: msg5, courseId: ids.N3EF, studentId: ME }));
  assert.strictEqual(r.success, true);
  assert.strictEqual(F.drive.mails[0].to, 'newkid_aps9999@avvaiyarpadasalai.org'); assert.strictEqual(F.drive.mails[0].cc, TA + ',admin@avvaiyarpadasalai.org');
  assert.throws(() => G.generateAppreciationCertificate(F.tok(TA, 'teacher'), { manual: true, recipientEmail: 'someone@gmail.com', studentName: 'X', appreciationMessage: msg5 }), /valid APS email address/);
  assert.throws(() => G.generateAppreciationCertificate(F.tok(TA, 'teacher'), { manual: true, recipientEmail: 'a_aps1@avvaiyarpadasalai.org', studentName: ' ', appreciationMessage: msg5 }), /Please enter the student name/);
  assert.throws(() => G.generateAppreciationCertificate(F.tok(TA, 'teacher'), { manual: true, recipientEmail: 'a_aps1@avvaiyarpadasalai.org', studentName: 'A', appreciationMessage: 'too short' }), /at least 5 words/);
  const t2 = J(G.generateTeacherAppreciationLetter(F.tok('hm@aps.org', 'headmaster'), { manual: true, recipientEmail: 'guest_aps55@avvaiyarpadasalai.org', teacherName: 'Guest Teacher', appreciationMessage: msg5 }));
  assert.strictEqual(t2.fileName, 'APS Teacher Appreciation Letter - Guest Teacher - 10-06-2026.pdf');
  assert.throws(() => G.generateTeacherAppreciationLetter(F.tok(TA, 'teacher'), { manual: true, recipientEmail: 'guest_aps55@avvaiyarpadasalai.org', teacherName: 'G', appreciationMessage: msg5 }), /Only an Admin/);
  const a = F.audit();
  const sent = a.filter(r => r[8] === 'SENT');
  assert.deepStrictEqual(sent.map(r => [r[1], r[3], r[4], r[7], r[11], r[12]]), [
    [TA, 'New Kid', 'newkid_aps9999@avvaiyarpadasalai.org', 'APS Appreciation Certificate', 'MANUAL', 'teacher'],
    ['hm@aps.org', 'Guest Teacher', 'guest_aps55@avvaiyarpadasalai.org', 'APS Teacher Appreciation Letter', 'MANUAL', 'headmaster']]);
  assert.strictEqual(String(sent[0][5]), ids.N3EF, 'own class recorded');
  assert.ok(a.some(r => r[8] === 'REJECTED' && r[11] === 'MANUAL'));
  assert.deepStrictEqual(F.env.wb.getSheetByName('Appreciation_Certificate_Audit').data[0].slice(11, 13), ['Entry Mode', 'Sender Role']);
});

t('r42: letter history — Admin / HM see all; a teacher sees only their own; students refused', () => {
  const F = setup(); const { G, ids } = F;
  G.generateAppreciationCertificate(F.tok(TA, 'teacher'), { studentId: JO, courseId: ids.N3EF, studentName: 'Joshua', appreciationMessage: msg5 });
  G.generateTeacherAppreciationLetter(F.tok('admin@aps.org', 'admin'), { teacherId: TA, teacherName: 'Teacher A', appreciationMessage: msg5 });
  const all = J(G.getAppreciationLetterAudit(F.tok('hm@aps.org', 'headmaster')));
  assert.strictEqual(all.all, true); assert.strictEqual(all.rows.length, 2);
  assert.strictEqual(all.rows[0].sender, 'admin@aps.org', 'newest first');
  assert.deepStrictEqual(Object.keys(all.rows[0]).sort(), ['at', 'course', 'entryMode', 'fileName', 'letterType', 'recipientEmail', 'recipientName', 'result', 'sender', 'senderRole']);
  assert.ok(/^\d\d-\d\d-\d{4} \d\d:\d\d (AM|PM)$/.test(all.rows[0].at), all.rows[0].at);
  const mine = J(G.getAppreciationLetterAudit(F.tok(TA, 'teacher')));
  assert.strictEqual(mine.all, false); assert.deepStrictEqual(mine.rows.map(r => r.recipientName), ['Joshua']);
  assert.throws(() => G.getAppreciationLetterAudit(F.tok(JO, 'student')), /Only a Teacher account/);
});

console.log(pass + ' passed');

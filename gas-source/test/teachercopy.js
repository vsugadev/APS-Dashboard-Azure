// End-to-end tests for Examination -> Exam Question Paper (server), using the REAL pdf-lib bundle (PdfLib.gs)
// in a timer-less sandbox like Apps Script, plus mocked Drive / Sheets / Cache / Lock.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert'); const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { makeContext, Sheet } = require('./gasmock');
const J = x => JSON.parse(JSON.stringify(x));
const tests = []; const t = (name, fn) => tests.push([name, fn]);
function fixedDate(iso) { let NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } static set(i) { NOW = new Date(i).getTime(); } } return D; }
const RangeProto = Object.getPrototypeOf(new Sheet('x').getRange(1, 1, 1, 1));
RangeProto.getDisplayValues = function () { return this.getValues().map(r => r.map(v => String(v))); };
Sheet.prototype.getMaxRows = function () { return 1000; };

const D = fixedDate('2026-10-15T16:00:00Z'); // Wed Oct 14 2026, 12:00 PM EDT
const env = makeContext({ Date: D, props: { LIVE_QUESTION_PAPER_SPREADSHEET_ID: '1hxcZ4I9OyR-YVN1qysdUCL36q0b3HfFpaqH6qgprkHY', APS_ENVIRONMENT: 'LIVE', EXAM_QUESTION_PAPER_STUDENT_TEACHER_ACCESS: 'true', HEADMASTER_EMAILS: JSON.stringify(['hm_aps600@avvaiyarpadasalai.org']) } });
const U = env.ctx.Utilities;
const f0 = U.formatDate;
U.formatDate = (d, tz, p) => {
  const words = [];
  let out = p.replace(/EEEE|MMMM/g, tok => { words.push(new Intl.DateTimeFormat('en-US', tok === 'EEEE' ? { timeZone: tz, weekday: 'long' } : { timeZone: tz, month: 'long' }).format(d)); return '\u00a7' + (words.length - 1) + '\u00a7'; });
  out = out.includes('hh') ? f0(d, tz, out.replace('hh', '\u00b6')).replace('\u00b6', f0(d, tz, 'h').padStart(2, '0')) : f0(d, tz, out);
  return out.replace(/\u00a7(\d+)\u00a7/g, (m, i) => words[Number(i)]);
};
U.getUuid = () => crypto.randomUUID();
U.base64EncodeWebSafe = s => Buffer.from(Array.isArray(s) ? s.map(b => b & 255) : String(s)).toString('base64url');
U.base64Encode = b => Buffer.from(Array.isArray(b) ? b.map(x => x & 255) : String(b)).toString('base64');
U.base64Decode = s => Array.from(Buffer.from(String(s), 'base64')).map(b => b > 127 ? b - 256 : b);
U.DigestAlgorithm = { SHA_256: 'sha256' };
U.computeDigest = (alg, s) => Array.from(crypto.createHash('sha256').update(String(s)).digest()).map(b => b > 127 ? b - 256 : b);
U.newBlob = (bytes, mime, name) => ({ bytes: bytes.slice(), mime, name, getBytes() { return this.bytes.slice(); }, getName() { return this.name; } });
// Drive mock
const drive = { files: {}, folders: {}, seq: 0 };
function mkFolder(name) { const id = 'F' + (++drive.seq); const f = { id, name, getId: () => id, getName: () => name, createFolder: n => mkFolder(n), createFile: blob => { const fid = 'DF' + (++drive.seq); drive.files[fid] = { id: fid, name: blob.getName(), bytes: blob.getBytes(), folder: id }; return { getId: () => fid }; } }; drive.folders[id] = f; return f; }
env.ctx.DriveApp = {
  createFolder: n => mkFolder(n), getFolderById: id => { if (!drive.folders[id]) throw new Error('No folder'); return drive.folders[id]; },
  getFileById: id => {
    const f = drive.files[id] || drive.src[id];
    if (!f || f.unshared) throw new Error('No item with the given ID could be found. Access denied.');
    const mime = f.mime || 'application/pdf';
    return { getBlob: () => ({ getBytes: () => f.bytes.slice() }), getName: () => f.name, getMimeType: () => mime,
      getAs: m => { if (m !== 'application/pdf') throw new Error('bad export'); drive.exports++; return { getBytes: () => (f.pdfBytes || f.bytes).slice() }; } };
  }
};
// The school's Drive files that the LIVE_QUESTION_PAPER_DOWNLOAD_LINK sheet (or a typed link) points at.
drive.src = {}; drive.exports = 0;
const driveLink = id => 'https://drive.google.com/file/d/' + id + '/view?usp=sharing';
let lockBusy = false;
env.ctx.LockService = { getScriptLock: () => ({ tryLock() { return !lockBusy; }, waitLock() {}, releaseLock() {} }) };
// Use the sandbox's own intrinsics (as in Apps Script) so pdf-lib's instanceof Array/Object checks behave.
['Array', 'Object', 'String', 'Number', 'RegExp', 'Error', 'JSON', 'Math', 'parseInt', 'isFinite', 'encodeURIComponent'].forEach(k => delete env.ctx[k]);
const code = fs.readFileSync(__dirname + '/../Code.gs', 'utf8') + '\n' + fs.readFileSync(__dirname + '/../PdfLib.gs', 'utf8');
vm.runInContext(code, env.ctx, { filename: 'Code.gs+PdfLib.gs' });
const G = env.ctx;
assert.strictEqual(typeof G.setTimeout, 'undefined', 'sandbox has no timers, like Apps Script');

// r104 Teacher Copy fixture: four Saturday 12:00 PM EDT classes (exam 2026-10-17 16:00Z), published at different times
const DOM = '@avvaiyarpadasalai.org';
const KAVIYA = 'kaviya_aps993' + DOM, CO = 'coteach_aps994' + DOM, HM = 'hm_aps600' + DOM, OTHER = 'other_aps995' + DOM, OUT = 'outsider@gmail.com';
const COURSES = [
  { id: 'T1', name: 'NILAI 5 - PA | SAT 12:00 - 1:30 PM EST | AY26-27', teachers: [{ name: 'Kaviya Gandhirajan', email: KAVIYA }, { name: 'Co Teacher', email: CO }, { name: 'Head Master', email: HM }], students: [{ name: 'Bala', email: 'bala_aps2002' + DOM }] },
  { id: 'T2', name: 'NILAI 5 - PB | SAT 12:00 - 1:30 PM EST | AY26-27', teachers: [{ name: 'Other Teacher', email: OTHER }], students: [{ name: 'Chitra', email: 'chitra_aps2003' + DOM }] },
  { id: 'T3', name: 'NILAI 5 - PC | SAT 12:00 - 1:30 PM EST | AY26-27', teachers: [{ name: 'Third Teacher', email: 'third_aps996' + DOM }, { name: 'Outside Helper', email: OUT }], students: [{ name: 'Deva', email: 'deva_aps2006' + DOM }] },
  { id: 'T4', name: 'NILAI 5 - PD | SAT 12:00 - 1:30 PM EST | AY26-27', teachers: [{ name: 'Fourth Teacher', email: 'fourth_aps997' + DOM }], students: [{ name: 'Elan', email: 'elan_aps2004' + DOM }] },
  { id: 'T5', name: 'NILAI 5 - PE | SAT 12:00 - 1:30 PM EST | AY26-27', teachers: [{ name: 'Head Master', email: HM }], students: [{ name: 'Guna', email: 'guna_aps2005' + DOM }] }
];
const cs = env.wb.insertSheet('Courses'); cs.data[0] = new Array(18).fill('h');
COURSES.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); cs.data[i + 1] = row; });
const tok = (email, role) => { const k = 'tok_' + email; env.cache['aps_sess_' + k] = JSON.stringify({ email, role }); return k; };
const admin = tok('info@avvaiyarpadasalai.org', 'admin'), hm = tok(HM, 'headmaster');
const tTwo = tok('ttwo_aps701@avvaiyarpadasalai.org', 'teacher'), tMazh = tok('tmazh_aps700@avvaiyarpadasalai.org', 'teacher');
const bala = tok('bala_aps2002@avvaiyarpadasalai.org', 'student'), chitra = tok('chitra_aps2003@avvaiyarpadasalai.org', 'student'), deva = tok('deva@avvaiyarpadasalai.org', 'student');
const raja = tok('raja_aps1234@avvaiyarpadasalai.org', 'student'), bod = tok('bod@amchats.org', 'vcfo_amchsts_bod');
const sheet = n => env.wb.sheets[n];
const rows = n => (sheet(n) ? sheet(n).data.slice(1).filter(r => r && r.some(Boolean)) : []);
const colOf = (n, h) => sheet(n).data[0].indexOf(h);
const cell = (n, r, h) => r[colOf(n, h)];

// A 3-page source PDF (one landscape page) created with the same library.
let SOURCE_B64;
async function makeSource() {
  vm.runInContext(`var __src; (async function(){ var L=examQpLoadPdfLib_(); var d=await L.PDFDocument.create(); var f=await d.embedFont(L.StandardFonts.Helvetica);
    [[612,792],[612,792],[792,612]].forEach(function(s,i){ var p=d.addPage(s); p.drawText('QUESTION PAGE '+(i+1),{x:60,y:s[1]-80,size:18,font:f}); });
    __src = await d.saveAsBase64(); })();`, env.ctx);
  await new Promise(r => setImmediate(r));
  SOURCE_B64 = env.ctx.__src;
  assert.ok(SOURCE_B64 && SOURCE_B64.length > 100);
}
const pdfText = (b64, page) => { const f = '/tmp/qp_' + crypto.randomUUID() + '.pdf'; fs.writeFileSync(f, Buffer.from(b64, 'base64')); const args = page ? ['-f', String(page), '-l', String(page)] : []; return execFileSync('pdftotext', args.concat([f, '-']), { encoding: 'utf8' }).replace(/\s+/g, ' '); };
const pdfPages = b64 => { const f = '/tmp/qp_' + crypto.randomUUID() + '.pdf'; fs.writeFileSync(f, Buffer.from(b64, 'base64')); return Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [f], { encoding: 'utf8' }))[1]); };

const kav = tok(KAVIYA, 'teacher'), co = tok(CO, 'teacher'), other = tok(OTHER, 'teacher'), parent = tok('parent.raja@gmail.com', 'parent'), authorized = tok('auth_aps1999' + DOM, 'authorized');
const START = Date.parse('2026-10-17T16:00:00Z'); // SAT 12:00 PM EDT
const at = iso => D.set(iso);
const tc = (token, id) => G.downloadExamQuestionPaperTeacherCopy(token, { questionPaperId: id, ticket: crypto.randomUUID().replace(/-/g, '') });
const sent = []; const realSend = G.apsGmailSend_;
let failNext = false;
G.apsGmailSend_ = (profile, m) => { if (/^CONFIDENTIAL - /.test(m.subject)) { if (failNext) { failNext = false; return { ok: false, error: 'Gmail API HTTP 500' }; } sent.push({ profile, m }); return { ok: true, mode: 'GMAIL_API' }; } return realSend(profile, m); };
const ids = {};
const MSG = vm.runInContext('EXAM_QP_TCOPY_MSG_', env.ctx);
const audit = () => rows('EXAM_QUESTION_PAPER_AUDIT').map(r => Object.fromEntries(sheet('EXAM_QUESTION_PAPER_AUDIT').data[0].map((h, i) => [h, r[i]])));
const run = () => J(G.examQpTeacherCopyEmailRun_(new D()));
const rec = id => G.examQpReadRecords_(true).find(r => r.Question_Paper_ID === id);

t('setup: Model Examination for 5 classes (Sat 12:00 PM); T1 published 30 h before, T2 exactly 24 h, T3 23 h 59 min, T4 never, T5 30 h', async () => {
  await makeSource();
  at('2026-10-15T16:00:00Z'); // Thu noon
  const res = J(G.saveExamQuestionPaper(admin, { clientRequestId: 'req-tcopy-00001', examTitle: 'Model Examination', examDate: '2026-10-17', courseIds: ['T1', 'T2', 'T3', 'T4', 'T5'] }));
  res.results.forEach(r => { ids[COURSES.find(c => r.className.indexOf(c.name.split(' |')[0]) === 0).id] = r.questionPaperId; });
  assert.strictEqual(Object.keys(ids).length, 5, JSON.stringify(res));
  drive.src.SRCTCOPY1_abcdefghij = { name: 'model.pdf', bytes: Array.from(Buffer.from(SOURCE_B64, 'base64')) };
  J(await G.attachExamQuestionPaperLink(admin, { questionPaperIds: Object.values(ids), driveLink: driveLink('SRCTCOPY1_abcdefghij') }));
  const pub = (id, iso) => { at(iso); const p = J(G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: [id] })); assert.strictEqual(p.results[0].status, 'SUCCESS', JSON.stringify(p)); };
  pub(ids.T1, '2026-10-16T10:00:00Z'); pub(ids.T5, '2026-10-16T10:00:00Z'); // Fri 6:00 AM = 30 h before
  pub(ids.T2, '2026-10-16T16:00:00Z'); // Fri 12:00 PM = exactly 24 h
  pub(ids.T3, '2026-10-16T16:01:00Z'); // Fri 12:01 PM = 23 h 59 min
  assert.strictEqual(rec(ids.T4).Status !== 'PUBLISHED', true);
  assert.ok(env.stats.triggers.some(x => x.fn === 'processExamQuestionPaperAutoEmail'), 'the existing 5-minute run is installed (student toggle OFF) for the Teacher Copy email');
  assert.strictEqual(env.stats.triggers.filter(x => x.fn === 'processExamQuestionPaperAutoEmail').length, 1, 'one trigger, never one per exam');
});
t('24-hour rule is exact (APS time zone): 30 h ✓, exactly 24 h ✓, 23 h 59 min ✗, not published ✗', () => {
  at('2026-10-17T15:05:00Z'); // 11:05 AM, inside the 60-minute window
  assert.strictEqual(G.examQpTeacherCopyBlock_(rec(ids.T1), Date.now()), '', 'Test 1: 30 h');
  assert.strictEqual(G.examQpTeacherCopyBlock_(rec(ids.T2), Date.now()), '', 'Test 2: exactly 24 h');
  assert.strictEqual(G.examQpTeacherCopyBlock_(rec(ids.T3), Date.now()), MSG.NOT_24H, 'Test 3: 23 h 59 min');
  assert.strictEqual(G.examQpTeacherCopyBlock_(rec(ids.T4), Date.now()), MSG.NOT_PUBLISHED, 'Test 4: not published');
});
t('Test 1/10: assigned teacher downloads from 60 min before (TEACHER COPY pdf, no key); 61 min before is refused', async () => {
  at('2026-10-17T14:59:00Z'); // 10:59 AM = 61 min before
  await assert.rejects(async () => tc(kav, ids.T1), /Teacher Copy will be available from 10\/17\/2026 11:00 AM EST \(60 minutes before the exam\)/);
  assert.ok(audit().some(a => a.Event_Type === 'TEACHER_COPY_DENIED' && a.User_Email === KAVIYA), 'denied attempt logged');
  at('2026-10-17T15:00:00Z'); // 11:00 AM
  const r = await tc(kav, ids.T1);
  assert.strictEqual(r.state, 'READY'); assert.ok(/^TEACHER_COPY_/.test(r.fileName));
  const txt = pdfText(r.base64, 1); assert.ok(txt.includes('TEACHER COPY - Kaviya Gandhirajan')); assert.ok(!txt.includes('DOWNLOAD KEY'));
  assert.ok(audit().some(a => a.Event_Type === 'TEACHER_COPY_DOWNLOADED' && a.Result === 'SUCCESS' && a.User_Email === KAVIYA));
  assert.strictEqual((await tc(co, ids.T1)).state, 'READY', 'co-teacher on the same class');
  assert.strictEqual((await tc(admin, ids.T1)).state, 'READY', 'Admin (oversight)');
  assert.strictEqual((await tc(other, ids.T2)).state, 'READY', 'Test 2: exactly 24 h → available');
});
t('Tests 3/4: 23 h 59 min and unpublished are blocked with the exact messages', async () => {
  await assert.rejects(async () => tc(tok('third_aps996' + DOM, 'teacher'), ids.T3), /^Error: Teacher Copy is unavailable because the question paper was not published at least 24 hours before the exam start time\.$/);
  await assert.rejects(async () => tc(tok('fourth_aps997' + DOM, 'teacher'), ids.T4), /Teacher Copy is unavailable because the examination question paper has not been published\./);
});
t('Tests 5/6/7: student, parent, authorized user, HM not teaching, other class teacher, BOD → denied (server-side) and logged', async () => {
  const n0 = audit().length;
  await assert.rejects(async () => tc(bala, ids.T1), /You are not authorized to access this Teacher Copy\./, 'student');
  await assert.rejects(async () => tc(parent, ids.T1), /not authorized|Access denied|not allowed/i, 'parent');
  await assert.rejects(async () => tc(authorized, ids.T1), /not authorized|Access denied|not allowed/i, 'authorized');
  await assert.rejects(async () => tc(bod, ids.T1), /You are not authorized to access this Teacher Copy\./, 'BOD');
  await assert.rejects(async () => tc(other, ids.T1), /Teacher Copy is unavailable because you are not assigned to this examination\./, 'Test 7: other class teacher');
  await assert.rejects(async () => tc(hm, ids.T1), /not assigned to this examination/, 'HM account (hidden staff) listed on the class is not its teacher');
  assert.ok(audit().slice(n0).filter(a => a.Event_Type === 'UNAUTHORIZED_DOWNLOAD_ATTEMPT' && a.Result === 'TEACHER_COPY_REFUSED').length >= 4, 'unauthorized attempts logged');
  assert.ok(!audit().slice(n0).some(a => /DOWNLOAD KEY|[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}/.test(JSON.stringify(a))), 'no download key in the log');
});
t('ticket polling: only the requesting assigned teacher, single use; another teacher or a student cannot fetch it', async () => {
  const ticket = crypto.randomUUID().replace(/-/g, '');
  await G.downloadExamQuestionPaperTeacherCopy(kav, { questionPaperId: ids.T1, ticket });
  assert.strictEqual(J(G.fetchExamQuestionPaperDownload(other, ticket)).state, 'FAILED');
  assert.strictEqual(J(G.fetchExamQuestionPaperDownload(bala, ticket)).state, 'FAILED');
  const f = J(G.fetchExamQuestionPaperDownload(kav, ticket)); assert.strictEqual(f.state, 'READY'); assert.ok(f.base64.length > 100);
  assert.strictEqual(J(G.fetchExamQuestionPaperDownload(kav, ticket)).state, 'FAILED', 'single use');
});
t('Dashboard flags: button only for assigned teachers + Admin; HM sees none; Send to Student flags unchanged', () => {
  const flags = tokn => J(G.getExamQuestionPaperMonitoring(tokn, {})).papers.map(p => ({ cls: p.className.split(' |')[0], show: p.tcopyShow, can: p.tcopyCanUse, why: p.tcopyBlockReason, staff: p.staffCanUse, staffWhy: p.staffBlockReason }));
  const k = flags(kav).find(x => x.cls === 'NILAI 5 - PA'); assert.ok(k.show && k.can);
  const a = flags(admin); assert.ok(a.every(x => x.show)); assert.strictEqual(a.find(x => x.cls === 'NILAI 5 - PC').why, MSG.NOT_24H);
  const h = flags(hm); assert.ok(h.length && h.every(x => x.show === false), 'HM: no Teacher Copy button');
  assert.ok(h.some(x => /Available from 10\/17\/2026 11:45 AM EST — the same time as for students/.test(x.staffWhy || '')), 'Send to Student keeps its own rule (student release time) — unchanged');
  assert.throws(() => G.getExamQuestionPaperMonitoring(bala, {}), /not authorized/, 'students never get the staff view');
});
t('r110: an exam dated inside an approved school leave shows a warning only (never cancelled); cancelling the leave removes it', () => {
  const st0 = J(G.getExamQuestionPaperMonitoring(admin, {})).papers.map(p => p.status);
  const o = G.slWrite_({ Leave_ID: 'SL-TEST', Leave_Title: 'Test Holiday', Start_Date: '2026-10-17', End_Date: '2026-10-17', Reason: 'x', Leave_Type: 'Other', Status: 'APPROVED' });
  const p1 = J(G.getExamQuestionPaperMonitoring(admin, {})).papers;
  assert.ok(p1.length && p1.every(x => /^Test Holiday \(2026-10-17 – 2026-10-17\)$/.test(x.schoolLeave)), JSON.stringify(p1.map(x => x.schoolLeave)));
  assert.deepStrictEqual(p1.map(x => x.status), st0, 'exam status unchanged — nothing cancelled');
  o.Status = 'CANCELLED'; G.slWrite_(o);
  assert.ok(J(G.getExamQuestionPaperMonitoring(admin, {})).papers.every(x => !x.schoolLeave));
});
t('Email timing: nothing at 61 min; at 60 min each assigned teacher gets their own email from donotreply@ (Test 1, Test 12)', () => {
  sent.length = 0;
  at('2026-10-17T14:59:00Z'); assert.strictEqual(run().sent, 0, '61 minutes before: not yet');
  at('2026-10-17T15:00:00Z'); const r = run();
  const to = sent.map(x => x.m.to[0]).sort();
  assert.strictEqual(JSON.stringify(to), JSON.stringify([CO, KAVIYA, OTHER].sort()), 'T1 both teachers + T2; never the HM, T3 (23 h 59 min), T4 (unpublished), T5 (HM only)');
  sent.forEach(x => assert.strictEqual(x.profile, 'TICKETS'));
  assert.strictEqual(G.apsMailFrom_('TICKETS'), 'donotreply@avvaiyarpadasalai.org');
  const km = sent.find(x => x.m.to[0] === KAVIYA).m, cm = sent.find(x => x.m.to[0] === CO).m;
  assert.strictEqual(km.subject, 'CONFIDENTIAL - Model Examination - NILAI 5 - PA | SAT 12:00 - 1:30 PM EST - Kaviya Gandhirajan');
  assert.strictEqual(cm.subject, 'CONFIDENTIAL - Model Examination - NILAI 5 - PA | SAT 12:00 - 1:30 PM EST - Co Teacher');
  assert.strictEqual(km.to.length, 1); assert.strictEqual(km.cc.length, 0); assert.ok(!km.attachments, 'no PDF in the email');
  ['🔴 CONFIDENTIAL — DO NOT SHARE', 'Dear Teacher,', 'ONLY</b> to the assigned APS teacher for examination administration and reference purposes',
   'DO NOT forward, share, screenshot, copy, upload, or distribute this question paper to students, parents, other teachers, or anyone else.',
   'reference in case a student experiences a delay or trouble downloading the question paper', 'STUDENT QUESTION PAPER', 'UNIQUE DOWNLOAD KEY',
   'should <b>NOT</b> be used as a replacement', 'strictly confidential until the examination is officially completed', 'Teacher Copy:', 'https://aps.test/exec',
   'APS Tech Support Team', 'Avvaiyar Padasalai', 'Confidentiality Notice:', '10/17/2026 12:00 PM EST'].forEach(x => assert.ok(km.html.includes(x), 'html: ' + x));
  ['🔴 CONFIDENTIAL — DO NOT SHARE', 'UNIQUE DOWNLOAD KEY', 'Confidentiality Notice:'].forEach(x => assert.ok(km.text.includes(x), 'text: ' + x));
  assert.ok(!/DOWNLOAD KEY: /.test(km.html), 'no student key in the email');
  assert.ok(audit().filter(a => a.Event_Type === 'TEACHER_COPY_EMAIL_SENT').length === 3);
  const tr = rec(ids.T1); assert.strictEqual(tr.Teacher_Copy_Email_Sent_To.split(',').sort().join(','), [CO, KAVIYA].sort().join(','));
});
t('Test 11: the run twice, an admin edit from an older read, and an expired cache claim → still one email per teacher', () => {
  const n = sent.length;
  at('2026-10-17T15:05:00Z'); run(); run();
  const stale = rec(ids.T1); stale.Teacher_Copy_Email_Sent_To = ''; stale.Teacher_Copy_Email_Sent_At = ''; G.examQpTrack_(stale); G.examQpWriteRecords_([stale]); // an edit from a read before the email
  assert.ok(rec(ids.T1).Teacher_Copy_Email_Sent_To.includes(KAVIYA), 'tracking kept by the writer');
  Object.keys(env.cache).filter(k => /^eqtc_/.test(k)).forEach(k => delete env.cache[k]); // claims expired
  at('2026-10-17T15:10:00Z'); run();
  assert.strictEqual(sent.length, n, 'no duplicate');
});
t('missing APS email / no assigned teacher: not sent, logged once; send failure is logged and retried next run', () => {
  const n0 = audit().length;
  // T3 became eligible? no — 23 h 59 min. Use T5 (HM only → no assigned teacher) and a T1 co-teacher with a non-APS email
  at('2026-10-17T15:15:00Z'); run(); run();
  assert.ok(audit().some(a => a.Event_Type === 'TEACHER_COPY_EMAIL_SKIPPED' && a.Question_Paper_ID === ids.T5 && /No assigned teacher/.test(a.Reason)), 'no assigned teacher: logged');
  assert.strictEqual(audit().slice(n0).filter(a => a.Event_Type === 'TEACHER_COPY_EMAIL_SKIPPED' && a.Question_Paper_ID === ids.T5).length, 0, 'not logged again on every 5-minute run');
  assert.ok(!sent.some(x => x.m.subject.includes('NILAI 5 - PE')), 'never emailed');
  // a newly added co-teacher on T1 with a Gmail address + a new APS co-teacher whose first send fails
  const c1 = COURSES[0]; c1.teachers.push({ name: 'Gmail Helper', email: 'helper@gmail.com' }, { name: 'New Teacher', email: 'newt_aps998' + DOM });
  cs.data[1][17] = JSON.stringify(c1); G.invalidateCoursesMemo_();
  failNext = true; run();
  assert.ok(audit().some(a => a.Event_Type === 'TEACHER_COPY_EMAIL_SKIPPED' && /no APS email/.test(a.Reason)), 'non-APS email skipped');
  assert.ok(audit().some(a => a.Event_Type === 'TEACHER_COPY_EMAIL_FAILED'), 'failure logged');
  const n = sent.length; run();
  assert.strictEqual(sent.length, n + 1, 'retried on the next run'); assert.strictEqual(sent.at(-1).m.to[0], 'newt_aps998' + DOM);
  run(); assert.strictEqual(sent.length, n + 1, 'then never again');
});
t('cancelled or locked: blocked, no email; after the start no email; the trigger is removed when nothing is left (student toggle OFF)', async () => {
  at('2026-10-17T15:20:00Z');
  J(G.setExamQuestionPaperStatus(admin, { action: 'CANCEL', questionPaperIds: [ids.T2], reason: 'Exam moved to next week for this class' }));
  await assert.rejects(async () => tc(other, ids.T2), /cancelled/);
  J(G.setExamQuestionPaperStatus(admin, { action: 'LOCK', questionPaperIds: [ids.T1], reason: 'Checking a printing problem' }));
  await assert.rejects(async () => tc(kav, ids.T1), /locked/);
  J(G.setExamQuestionPaperStatus(admin, { action: 'UNLOCK', questionPaperIds: [ids.T1] }));
  const n = sent.length;
  at('2026-10-17T16:01:00Z'); run(); assert.strictEqual(sent.length, n, 'after the start: no email');
  env.props.EXAM_QP_AUTO_EMAIL_ENABLED = 'false';
  G.ScriptApp.getProjectTriggers = (orig => () => orig().map(x => Object.assign(x, { getUniqueId: () => 'u-' + x.getHandlerFunction() })))(G.ScriptApp.getProjectTriggers);
  await G.processExamQuestionPaperAutoEmail({ triggerUid: 'u-processExamQuestionPaperAutoEmail' });
  assert.ok(!env.stats.triggers.some(x => x.fn === 'processExamQuestionPaperAutoEmail'), 'removed: nothing pending');
  delete env.props.EXAM_QP_AUTO_EMAIL_ENABLED;
});
t('student download is unchanged: own key, no Teacher Copy path; Teacher Copy has no key', async () => {
  at('2026-10-17T15:50:00Z'); // student release (15 min before) for T5
  const g = tok('guna_aps2005' + DOM, 'student');
  const mine = J(G.getMyExamQuestionPapers(g)).papers; assert.ok(mine.length >= 1);
  assert.ok(!JSON.stringify(mine).includes('tcopy'), 'no Teacher Copy fields for students');
});

(async () => {
  let fails = 0;
  for (const [n, fn] of tests) { try { await fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 4).join('\n   ')); } }
  console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);
})();

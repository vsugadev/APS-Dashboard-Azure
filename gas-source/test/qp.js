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

const D = fixedDate('2026-10-14T16:00:00Z'); // Wed Oct 14 2026, 12:00 PM EDT
const env = makeContext({ Date: D, props: { LIVE_QUESTION_PAPER_SPREADSHEET_ID: '1hxcZ4I9OyR-YVN1qysdUCL36q0b3HfFpaqH6qgprkHY', APS_ENVIRONMENT: 'LIVE', EXAM_QUESTION_PAPER_STUDENT_TEACHER_ACCESS: 'true' } });
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

// Courses cache (the dashboard's synced roster)
const COURSES = [
  { id: 'C1', name: 'MAZHALAI - CB | FRI 7:30 - 9:00 PM EST | AY26-27', teachers: [{ name: 'Teacher Mazh', email: 'tmazh_aps700@avvaiyarpadasalai.org' }], students: [{ name: 'Raja Kumar', email: 'raja_aps1234@avvaiyarpadasalai.org' }, { name: 'Anu', email: 'anu_aps2001@avvaiyarpadasalai.org' }] },
  { id: 'C2', name: 'NILAI 2 - ED | FRI 6:30 - 8:00 PM EST | AY26-27', teachers: [{ name: 'Teacher Two', email: 'ttwo_aps701@avvaiyarpadasalai.org' }], students: [{ name: 'Bala', email: 'bala_aps2002@avvaiyarpadasalai.org' }, { name: 'Chitra', email: 'chitra_aps2003@avvaiyarpadasalai.org' }, { name: 'Deva', email: 'deva@avvaiyarpadasalai.org' }] },
  { id: 'C3', name: 'NILAI 3 - PA | FRI 9:00 - 10:30 PM EST | AY26-27', teachers: [{ name: 'Teacher Three', email: 'tthree_aps702@avvaiyarpadasalai.org' }], students: [{ name: 'Elan', email: 'elan_aps2004@avvaiyarpadasalai.org' }] },
  { id: 'C7', name: 'NILAI 7 - SA | SUN 7:30 - 9:00 PM EST | AY26-27', teachers: [{ name: 'Teacher Seven', email: 'tseven_aps703@avvaiyarpadasalai.org' }], students: [{ name: 'Guna', email: 'guna_aps2005@avvaiyarpadasalai.org' }] }
];
const cs = env.wb.insertSheet('Courses'); cs.data[0] = new Array(18).fill('h');
COURSES.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); cs.data[i + 1] = row; });
const tok = (email, role) => { const k = 'tok_' + email; env.cache['aps_sess_' + k] = JSON.stringify({ email, role }); return k; };
const admin = tok('info@avvaiyarpadasalai.org', 'admin'), hm = tok('hm_aps600@avvaiyarpadasalai.org', 'headmaster');
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

let exam, ids = {};
t('class-name parsing + release = start − 15 min for the 4 spec examples (FRI 7:15 / 6:15 / 8:45, SUN 7:15 PM EST)', () => {
  const p = J(G.examQpParseClassName_('NILAI 2 - ED | FRI 6:30 - 8:00 PM EST | AY26-27'));
  assert.deepStrictEqual([p.grade, p.section, p.day, p.startLabel, p.endLabel, p.timeZone, p.academicYear], ['NILAI 2', 'ED', 'FRI', '6:30 PM', '8:00 PM', 'EST', 'AY26-27']);
  assert.strictEqual(J(G.examQpParseClassName_('MAZHALAI - CB | FRI 7:30 - 9:00 PM EST | AY26-27')).grade, 'MAZHALAI');
  const res = J(G.saveExamQuestionPaper(admin, { clientRequestId: 'req-000000001', examTitle: 'Mid-Term Examination', examDate: '2026-10-16', courseIds: ['C1', 'C2', 'C3', 'C7'] }));
  assert.strictEqual(res.results.filter(r => r.status === 'CREATED').length, 4);
  res.results.forEach(r => { ids[r.courseId] = r.questionPaperId; assert.ok(/^EQP-\d{8}-[A-Z0-9]{8}$/.test(r.questionPaperId), r.questionPaperId); });
  exam = res.examId; assert.ok(/^EXM-\d{8}-[A-Z0-9]{6}$/.test(exam));
  const m = J(G.getExamQuestionPaperMonitoring(admin, {}));
  const by = cid => m.papers.find(p => p.courseId === cid);
  assert.strictEqual(by('C1').releaseLabel, '10/16/2026 07:15 PM EST'); assert.strictEqual(by('C1').releaseLongLabel, 'Friday, October 16, 2026 – 7:15 PM EST');
  assert.strictEqual(by('C2').releaseLabel, '10/16/2026 06:15 PM EST');
  assert.strictEqual(by('C3').releaseLabel, '10/16/2026 08:45 PM EST');
  assert.strictEqual(by('C7').releaseLabel, '10/18/2026 07:15 PM EST', 'SUN class resolves to the Sunday of that exam week');
  assert.strictEqual(by('C2').closeLabel, '10/16/2026 06:30 PM EST', 'default: closes at class start');
  assert.ok(new Set(m.papers.map(p => p.examId)).size === 1, 'one Exam_ID groups the classes');
  assert.ok(m.papers.every(p => p.status === 'NOT_UPLOADED' && p.examStatus === 'DRAFT'));
  assert.ok(!JSON.stringify(m).includes('Question_Paper_File'), 'no Drive file id to the browser');
});
t('idempotent save: repeated request id returns the same result; new request for same exam/class/date -> ALREADY_EXISTS', () => {
  const again = J(G.saveExamQuestionPaper(admin, { clientRequestId: 'req-000000001', examTitle: 'Mid-Term Examination', examDate: '2026-10-16', courseIds: ['C1', 'C2', 'C3', 'C7'] }));
  assert.deepStrictEqual(again.results.map(r => r.questionPaperId).sort(), Object.values(ids).sort());
  const dup = J(G.saveExamQuestionPaper(admin, { clientRequestId: 'req-000000002', examTitle: 'mid-term examination', examDate: '2026-10-16', courseIds: ['C2'] }));
  assert.strictEqual(dup.results[0].status, 'ALREADY_EXISTS');
  assert.strictEqual(rows('EXAM_QUESTION_PAPERS').length, 4);
});
t('role gates: only Admin manages; HM monitors (manages only with EXAM_QUESTION_PAPER_HM_CAN_MANAGE=true); Teacher/Student/BOD cannot manage', () => {
  assert.throws(() => G.saveExamQuestionPaper(hm, { examTitle: 'X', examDate: '2026-10-16', courseIds: ['C2'] }), /Only Admin/);
  assert.throws(() => G.saveExamQuestionPaper(tTwo, { examTitle: 'X', examDate: '2026-10-16', courseIds: ['C2'] }), /Only Admin/);
  assert.throws(() => G.setExamQuestionPaperStatus(bala, { action: 'PUBLISH', questionPaperIds: [ids.C2] }), /Only Admin/);
  assert.throws(() => G.attachExamQuestionPaperLink(bala, { questionPaperIds: [ids.C2], driveLink: driveLink('SRCPDF1_abcdefghij') }), /Only Admin/);
  assert.throws(() => G.attachExamQuestionPaperLink(bod, { questionPaperIds: [ids.C2], driveLink: driveLink('SRCPDF1_abcdefghij') }), /Only Admin/);
  const b = J(G.getExamQuestionPaperContext(bod));
  assert.deepStrictEqual([b.readOnly, b.canManage, b.canMonitorAll, b.canExport, b.canPreview], [true, false, true, false, false], 'BOD = read-only monitoring');
  assert.throws(() => G.saveExamQuestionPaper(bod, { examTitle: 'X', examDate: '2026-10-16', courseIds: ['C2'] }), /Only Admin/);
  assert.throws(() => G.exportExamQuestionPaperAudit(tTwo, {}), /Only Admin can export/);
  assert.throws(() => G.exportExamQuestionPaperAudit(bod, {}), /Only Admin can export/);
  assert.throws(() => G.getMyExamQuestionPapers(tTwo), /Only students/);
  assert.ok(J(G.getExamQuestionPaperMonitoring(hm, {})).papers.length === 4);
  env.props.EXAM_QUESTION_PAPER_HM_CAN_MANAGE = 'true';
  assert.strictEqual(J(G.getExamQuestionPaperContext(hm)).canManage, true);
  delete env.props.EXAM_QUESTION_PAPER_HM_CAN_MANAGE;
  assert.strictEqual(J(G.getExamQuestionPaperContext(hm)).canManage, false);
});
t('publish is refused until every field + PDF is present', () => {
  const r = J(G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: [ids.C2] }));
  assert.strictEqual(r.results[0].status, 'FAILED'); assert.ok(/Question Paper PDF/.test(r.results[0].message));
});
const attach = async (payload) => J(await G.attachExamQuestionPaperLink(admin, payload));
const res1 = (r) => r.results[0];
t('attach from a typed Drive link: not-a-link, non-PDF, not shared, fake/encrypted/unstampable PDFs are rejected; nothing stored', async () => {
  const pdf = Array.from(Buffer.from(SOURCE_B64, 'base64'));
  drive.src.DOCX1_abcdefghij = { name: 'paper.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: [1, 2, 3] };
  drive.src.PRIV1_abcdefghij = { name: 'private.pdf', bytes: pdf, unshared: true };
  drive.src.TXT1_abcdefghij = { name: 'fake.pdf', bytes: Array.from(Buffer.from('hello')) };
  drive.src.ENC1_abcdefghij = { name: 'enc.pdf', bytes: Array.from(Buffer.concat([Buffer.from(SOURCE_B64, 'base64'), Buffer.from('\ntrailer << /Encrypt 9 0 R >>\n')])) };
  drive.src.BAD1_abcdefghij = { name: 'broken.pdf', bytes: Array.from(Buffer.concat([Buffer.from('%PDF-1.7\n'), crypto.randomBytes(3000)])) };
  assert.throws(() => G.attachExamQuestionPaperLink(admin, { questionPaperIds: [ids.C2], driveLink: 'https://example.com/x.pdf' }), /Google Drive file link/);
  assert.throws(() => G.attachExamQuestionPaperLink(admin, { questionPaperIds: [], driveLink: driveLink('X') }), /No question paper selected/);
  assert.ok(/not a PDF/.test(res1(await attach({ questionPaperIds: [ids.C2], driveLink: driveLink('DOCX1_abcdefghij') })).message));
  const priv = res1(await attach({ questionPaperIds: [ids.C2], driveLink: driveLink('PRIV1_abcdefghij') }));
  assert.strictEqual(priv.status, 'FAILED'); assert.ok(/cannot open this Google Drive file\. Share it with that account/.test(priv.message), priv.message);
  assert.ok(/Only PDF/.test(res1(await attach({ questionPaperIds: [ids.C2], driveLink: driveLink('TXT1_abcdefghij') })).message));
  assert.ok(/encrypted/.test(res1(await attach({ questionPaperIds: [ids.C2], driveLink: driveLink('ENC1_abcdefghij') })).message));
  const bad = await attach({ questionPaperIds: [ids.C2], driveLink: driveLink('BAD1_abcdefghij') });
  assert.strictEqual(bad.updated, 0); assert.ok(/could not be processed for personalized copies/.test(res1(bad).message));
  assert.strictEqual(Object.values(drive.files).length, 0, 'nothing stored for a file that cannot be used');
  assert.strictEqual(G.examQpFindRecord_(ids.C2, true).Question_Paper_File, '');
});
let linkSheetBefore;
t('attach with a BLANK link uses LIVE_QUESTION_PAPER_DOWNLOAD_LINK (NILAI + TITLE, case/space-insensitive): one private snapshot per Drive file, missing row -> SKIPPED; the link sheet is never written', async () => {
  drive.src.SRCPDF1_abcdefghij = { name: 'midterm_nil2.pdf', bytes: Array.from(Buffer.from(SOURCE_B64, 'base64')) };
  drive.src.GDOC1_abcdefghij = { name: 'Mazhalai Midterm', mime: 'application/vnd.google-apps.document', bytes: [9, 9], pdfBytes: Array.from(Buffer.from(SOURCE_B64, 'base64')) };
  const ls = env.wb.insertSheet('LIVE_QUESTION_PAPER_DOWNLOAD_LINK');
  ls.data[0] = ['NILAI', 'TITLE', 'QUESTION PAPER DOWNLOAD LINK'];
  ls.data[1] = ['NILAI 99', 'MODELEXAM 1', 'https://drive.google.com/file/d/1cSj6PcsvsXxNhjYf_inmfzH8bnnuj4gd/view'];
  ls.data[2] = ['NILAI 2', 'MID TERM EXAMINATION', driveLink('SRCPDF1_abcdefghij')];
  ls.data[3] = ['Nilai-3', 'mid-term examination', 'https://drive.google.com/open?id=SRCPDF1_abcdefghij'];
  ls.data[4] = ['MAZHALAI', 'Mid-Term Examination', driveLink('GDOC1_abcdefghij')];
  linkSheetBefore = JSON.stringify(ls.data);
  const r = await attach({ questionPaperIds: Object.values(ids), driveLink: '' });
  const by = cid => r.results.find(x => x.questionPaperId === ids[cid]);
  assert.strictEqual(r.updated, 3);
  ['C1', 'C2', 'C3'].forEach(c => assert.strictEqual(by(c).status, 'SUCCESS', c + ': ' + by(c).message));
  assert.strictEqual(by('C7').status, 'SKIPPED'); assert.ok(/No link in LIVE_QUESTION_PAPER_DOWNLOAD_LINK for NILAI "NILAI 7"/.test(by('C7').message));
  assert.ok(/midterm_nil2\.pdf \(v1, 3 pages\) — READY/.test(by('C2').message), by('C2').message);
  assert.strictEqual(drive.exports, 1, 'Google Doc exported to PDF once');
  assert.strictEqual(Object.values(drive.files).filter(f => /^ORIGINAL_/.test(f.name)).length, 2, 'NILAI 2 + NILAI 3 share one snapshot; MAZHALAI has its own');
  const rec = G.examQpFindRecord_(ids.C2, true);
  assert.deepStrictEqual([rec.Status, rec.Version, rec.Page_Count, rec.Source_Drive_File_ID, rec.Original_File_Name], ['READY', '1', '3', 'SRCPDF1_abcdefghij', 'midterm_nil2.pdf']);
  assert.strictEqual(G.examQpFindRecord_(ids.C1, true).Original_File_Name, 'Mazhalai Midterm.pdf');
  assert.notStrictEqual(rec.Question_Paper_File, 'SRCPDF1_abcdefghij', 'the published paper points at the private copy, not the shared file');
  assert.strictEqual(JSON.stringify(ls.data), linkSheetBefore, 'link sheet untouched');
  // A typed link covers the class with no sheet row.
  const t7 = await attach({ questionPaperIds: [ids.C7], driveLink: driveLink('SRCPDF1_abcdefghij') });
  assert.strictEqual(res1(t7).status, 'SUCCESS');
  assert.ok(/PRIVATE/.test(Object.values(drive.folders)[0].name));
  const log = J(G.getExamQuestionPaperAuditLog(admin, {}));
  assert.ok(log.some(x => x.type === 'QUESTION_PAPER_UPLOADED'));
});
t('missing PdfLib.gs gives a clear setup message (not "examQpLoadPdfLib_ is not defined")', async () => {
  const env3 = makeContext({ Date: D, props: { LIVE_QUESTION_PAPER_SPREADSHEET_ID: 'X', APS_ENVIRONMENT: 'LIVE' } });
  ['Array', 'Object', 'String', 'Number', 'RegExp', 'Error', 'JSON', 'Math', 'parseInt', 'isFinite', 'encodeURIComponent'].forEach(k => delete env3.ctx[k]);
  vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), env3.ctx);
  assert.throws(() => env3.ctx.examQpPdfLib_(), /does not contain the script file "PdfLib\.gs"[\s\S]*Version: New version/);
  assert.ok(/^Setup needed/.test(env3.ctx.checkExamQuestionPaperSetup()), 'editor check reports the problem');
  env3.ctx.HtmlService = { createHtmlOutputFromFile: n => { if (n === 'PdfLib') return {}; throw new Error('No HTML file named ' + n); } };
  assert.throws(() => env3.ctx.examQpPdfLib_(), /was added as an HTML file\. It must be a SCRIPT file/);
  assert.ok(/^OK: PdfLib\.gs is present/.test(G.checkExamQuestionPaperSetup()));
  assert.ok(G.examQpPdfLib_().PDFDocument, 'with PdfLib.gs present it loads');
});
t('publish confirmation data (exam, class, start, release, file, eligible) then publish', () => {
  const pv = J(G.getExamQuestionPaperPublishPreview(admin, [ids.C2]))[0];
  assert.deepStrictEqual([pv.ok, pv.examTitle, pv.shortClass, pv.classStart, pv.release, pv.fileName, pv.eligibleStudents], [true, 'Mid-Term Examination', 'NILAI 2 - ED', '10/16/2026 06:30 PM EST', '10/16/2026 06:15 PM EST', 'midterm_nil2.pdf', 3]);
  const r = J(G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: Object.values(ids) }));
  assert.ok(r.results.every(x => x.status === 'SUCCESS'));
  const again = J(G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: [ids.C2] }));
  assert.strictEqual(again.results[0].status, 'UNCHANGED', 'idempotent');
});
t('student sees only their class, WAITING with server time; no file id / URL exposed', () => {
  const s = J(G.getMyExamQuestionPapers(bala));
  assert.strictEqual(s.papers.length, 1); assert.strictEqual(s.papers[0].className, 'NILAI 2 - ED | FRI 6:30 - 8:00 PM EST | AY26-27');
  assert.strictEqual(s.papers[0].state, 'WAITING'); assert.strictEqual(s.serverNow, Date.parse('2026-10-14T16:00:00Z'));
  assert.strictEqual(s.papers[0].releaseAt, Date.parse('2026-10-16T22:15:00Z'));
  assert.strictEqual(s.student.name, 'Bala'); assert.strictEqual(s.student.apsId, 'APS2002');
  assert.ok(!/DF\d|drive|https?:/i.test(JSON.stringify(s)), 'no Drive id or URL');
});
const dl = (token, extra) => G.downloadExamQuestionPaper(token, Object.assign({ questionPaperId: ids.C2, apsId: 'APS2002', confirmed: true, ticket: crypto.randomUUID().replace(/-/g, ''), userAgent: 'test-UA' }, extra || {}));
const last = () => { const r = rows('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT'); return r[r.length - 1]; };
t('before release: backend refuses (NOT_YET_AVAILABLE) and audits, whatever the browser clock says', async () => {
  const r = J(await dl(bala));
  assert.strictEqual(r.state, 'FAILED'); assert.strictEqual(r.code, 'NOT_YET_AVAILABLE');
  assert.ok(r.message.includes('It will become available at:\nFriday, October 16, 2026 – 6:15 PM EST'));
  assert.strictEqual(cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', last(), 'Download_Status'), 'NOT_YET_AVAILABLE');
});
t('exactly at release: allowed; wrong APSID / missing confirmation / tampered class / wrong class / unknown id / teacher all rejected + audited', async () => {
  D.set('2026-10-16T22:15:00Z'); // 6:15:00 PM EDT
  assert.strictEqual(J(G.getMyExamQuestionPapers(bala)).papers[0].state, 'AVAILABLE');
  let r = J(await dl(bala, { apsId: 'APS9999' })); assert.strictEqual(r.code, 'INVALID_APSID'); assert.ok(r.message.startsWith('The APSID entered does not match your student account.'));
  r = J(await dl(bala, { apsId: 'aps 9998' })); assert.strictEqual(r.code, 'INVALID_APSID');
  r = J(await dl(bala, { confirmed: false })); assert.strictEqual(r.code, 'CONFIRMATION_REQUIRED');
  r = J(await dl(bala, { className: 'NILAI 3 - PA | FRI 9:00 - 10:30 PM EST | AY26-27' })); assert.strictEqual(r.code, 'INVALID_CLASS');
  r = J(await dl(bala, { grade: 'NILAI 3' })); assert.strictEqual(r.code, 'INVALID_CLASS');
  r = J(await dl(bala, { examId: 'EXM-20260101-AAAAAA' })); assert.strictEqual(r.code, 'INVALID_EXAM');
  r = J(await dl(bala, { studentEmail: 'chitra_aps2003@avvaiyarpadasalai.org' })); assert.strictEqual(r.code, 'UNAUTHORIZED');
  r = J(await dl(raja, { apsId: 'APS1234' })); assert.strictEqual(r.code, 'INVALID_CLASS'); assert.strictEqual(r.message, 'This question paper is not assigned to your class.');
  r = J(await dl(bala, { questionPaperId: 'EQP-20261014-ZZZZZZZZ' })); assert.strictEqual(r.code, 'QUESTION_PAPER_NOT_FOUND');
  r = J(await dl(bala, { questionPaperId: '1' })); assert.strictEqual(r.code, 'QUESTION_PAPER_NOT_FOUND');
  r = J(await dl(tTwo)); assert.strictEqual(r.code, 'UNAUTHORIZED');
  assert.throws(() => G.downloadExamQuestionPaper('bogus', { questionPaperId: ids.C2 }), /SESSION_EXPIRED/);
  const audit = rows('EXAM_QUESTION_PAPER_AUDIT').map(x => cell('EXAM_QUESTION_PAPER_AUDIT', x, 'Event_Type'));
  ['INVALID_APSID', 'UNAUTHORIZED_DOWNLOAD_ATTEMPT', 'DOWNLOAD_ATTEMPTED', 'STUDENT_VIEWED_EXAM', 'DOWNLOAD_WINDOW_OPENED'].forEach(e => assert.ok(audit.includes(e), e));
});
let firstOut;
t('valid download: personalized PDF with name, APSID, class, exam and EST time on EVERY page; original untouched; archived; named per spec', async () => {
  D.set('2026-10-16T22:17:00Z'); // 6:17 PM EDT
  const origBefore = Object.values(drive.files).find(f => /^ORIGINAL_/.test(f.name)).bytes.slice();
  const res = await dl(bala);
  assert.strictEqual(res.state, 'READY', JSON.stringify(res).slice(0, 300));
  firstOut = res;
  assert.strictEqual(res.fileName, 'Mid-Term-Examination_NILAI-2-ED_Bala_APS2002_20261016-1817-EST.pdf');
  assert.strictEqual(res.downloadedLabel, '10/16/2026 06:17 PM EST');
  assert.strictEqual(pdfPages(res.base64), 3);
  for (let p = 1; p <= 3; p++) {
    const txt = pdfText(res.base64, p);
    ['Student: Bala', 'APSID: APS2002', 'Class: NILAI 2 - ED | FRI 6:30 - 8:00 PM EST | AY26-27', 'Exam: Mid-Term Examination', 'Downloaded: 10/16/2026 06:17 PM EST', 'QUESTION PAGE ' + p]
      .forEach(s => assert.ok(txt.includes(s), 'page ' + p + ' missing "' + s + '" in: ' + txt.slice(0, 300)));
  }
  const orig = Object.values(drive.files).find(f => /^ORIGINAL_/.test(f.name));
  assert.deepStrictEqual(orig.bytes, origBefore, 'original never modified');
  assert.ok(!pdfText(U.base64Encode(orig.bytes)).includes('Bala'), 'original has no student info');
  const saved = Object.values(drive.files).filter(f => f.name === res.fileName);
  assert.strictEqual(saved.length, 1, 'personalized copy archived privately');
  const ev = last();
  assert.deepStrictEqual(['Download_Status', 'Student_Full_Name', 'APSID', 'Student_Email', 'Verification_Status', 'Confirmation_Checked', 'Download_Attempt_Count', 'Download_Date_Time_EST', 'User_Agent'].map(h => cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', ev, h)),
    ['DOWNLOAD_COMPLETED', 'Bala', 'APS2002', 'bala_aps2002@avvaiyarpadasalai.org', 'VERIFIED', 'TRUE', '1', '2026-10-16 18:17:00', 'test-UA']);
  assert.ok(/^S-/.test(cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', ev, 'Session_ID')) && !cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', ev, 'Session_ID').includes('tok_'), 'session hashed, never the token');
  assert.strictEqual(cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', ev, 'Personalized_File_ID'), saved[0].id);
});
t('each student gets a UNIQUE copy; APSID not in email is accepted as unverifiable but recorded', async () => {
  const c = await dl(chitra, { apsId: 'APS2003' });
  assert.strictEqual(c.state, 'READY'); assert.notStrictEqual(c.base64, firstOut.base64);
  assert.ok(pdfText(c.base64, 1).includes('Student: Chitra') && !pdfText(c.base64, 1).includes('Bala'));
  const d = await dl(deva, { apsId: 'APS3001' });
  assert.strictEqual(d.state, 'READY');
  assert.strictEqual(cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', last(), 'Verification_Status'), 'APSID_NOT_VERIFIABLE_FROM_EMAIL');
});
t('DOWNLOAD KEY: unique per student + paper, printed (red) at top AND bottom of every page, recorded in the audit + summary, stable on re-download, searchable', async () => {
  const key = firstOut.downloadKey;
  assert.ok(/^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}$/.test(key), key);
  for (let p = 1; p <= 3; p++) {
    const txt = pdfText(firstOut.base64, p);
    assert.strictEqual(txt.split('DOWNLOAD KEY: ' + key).length - 1, 2, 'page ' + p + ' has the key at top and bottom: ' + txt.slice(0, 200));
    assert.ok(txt.includes('Write this key at the top of your answer sheet'));
  }
  fs.writeFileSync('/tmp/qp_key_sample.pdf', Buffer.from(firstOut.base64, 'base64'));
  const ev = rows('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT').filter(r => cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', r, 'Student_Email') === 'bala_aps2002@avvaiyarpadasalai.org' && cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', r, 'Download_Status') === 'DOWNLOAD_COMPLETED');
  assert.ok(ev.length >= 1 && ev.every(r => cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', r, 'Download_Key') === key), 'audit Download_Key column');
  assert.ok(rows('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT').filter(r => cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', r, 'Download_Status') !== 'DOWNLOAD_COMPLETED').every(r => !cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', r, 'Download_Key')), 'failed attempts get no key');
  const sum = rows('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY').find(x => cell('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY', x, 'Student_Email') === 'bala_aps2002@avvaiyarpadasalai.org');
  assert.strictEqual(cell('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY', sum, 'Download_Key'), key);
  const chitraKey = rows('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT').filter(r => cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', r, 'Student_Email') === 'chitra_aps2003@avvaiyarpadasalai.org' && cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', r, 'Download_Key')).map(r => cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', r, 'Download_Key'))[0];
  assert.ok(chitraKey && chitraKey !== key, 'each student has a different key');
  assert.notStrictEqual(G.examQpDownloadKey_(ids.C3, 'bala_aps2002@avvaiyarpadasalai.org'), key, 'a different paper gives a different key');
  assert.strictEqual(J(G.getMyExamQuestionPapers(bala)).papers[0].myDownloadKey, key, 'student can see the key again');
  // Teacher checks the key written on an uploaded answer sheet (typed with or without dashes, any case).
  const typed = key.replace(/-/g, '').toLowerCase();
  const found = J(G.getExamQuestionPaperMonitoring(tTwo, { search: typed }));
  assert.deepStrictEqual(found.students.map(x => [x.studentName, x.downloadKey]), [['Bala', key]]);
  assert.ok(found.events.length && found.events.every(e => e.downloadKey === key));
  assert.ok(J(G.exportExamQuestionPaperAudit(admin, {})).csv.includes('"' + key + '"'), 'CSV has the Download Key column');
  assert.ok(env.props.EXAM_QP_DOWNLOAD_KEY_SECRET && env.props.EXAM_QP_DOWNLOAD_KEY_SECRET.length > 20, 'private secret created once');
});
t('repeat download: event + summary track count; ticket readable only by its owner (polling path)', async () => {
  D.set('2026-10-16T22:19:00Z');
  const ticket = crypto.randomUUID().replace(/-/g, '');
  const r = await dl(bala, { ticket });
  assert.strictEqual(r.downloadCount, 2);
  assert.strictEqual(r.downloadKey, firstOut.downloadKey, 'same key on re-download (the key already written on the answer sheet stays valid)');
  const sum = rows('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY').find(x => cell('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY', x, 'Student_Email') === 'bala_aps2002@avvaiyarpadasalai.org');
  assert.deepStrictEqual(['Download_Count', 'First_Download_Date_Time', 'Last_Download_Date_Time'].map(h => cell('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY', sum, h)), ['2', '2026-10-16 18:17:00', '2026-10-16 18:19:00']);
  assert.ok(Number(cell('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY', sum, 'Failed_Attempts')) >= 6);
  const mine = J(G.fetchExamQuestionPaperDownload(bala, ticket));
  assert.strictEqual(mine.state, 'READY'); assert.ok(pdfText(mine.base64, 2).includes('APSID: APS2002'));
  assert.ok(pdfText(mine.base64, 1).includes('Account: bala_aps2002@avvaiyarpadasalai.org'), 'account email stamped too');
  assert.strictEqual(J(G.fetchExamQuestionPaperDownload(bala, ticket)).state, 'FAILED', 'ticket delivery is single-use');
  assert.strictEqual(J(G.fetchExamQuestionPaperDownload(chitra, ticket)).state, 'FAILED', 'another student cannot use the ticket');
  const reuse = J(await dl(bala, { ticket })); assert.strictEqual(reuse.state, 'FAILED', 'a ticket is single-use');
  const my = J(G.getMyExamQuestionPapers(bala)).papers[0];
  assert.strictEqual(my.myDownloadCount, 2); assert.strictEqual(my.myLastDownload, '10/16/2026 06:19 PM EST');
});
t('after class start: download closed (LATE_DOWNLOAD_ATTEMPT); with "allow after start" policy it stays open until class end', async () => {
  D.set('2026-10-16T22:30:00Z'); // 6:30 PM = class start
  let r = J(await dl(bala)); assert.strictEqual(r.code, 'DOWNLOAD_WINDOW_CLOSED');
  assert.ok(rows('EXAM_QUESTION_PAPER_AUDIT').some(x => cell('EXAM_QUESTION_PAPER_AUDIT', x, 'Event_Type') === 'LATE_DOWNLOAD_ATTEMPT'));
  assert.strictEqual(J(G.getMyExamQuestionPapers(bala)).papers[0].state, 'CLOSED');
  // NILAI 3 (9:00 PM) with policy "allow after class start"
  D.set('2026-10-16T12:00:00Z');
  G.setExamQuestionPaperStatus(admin, { action: 'UNPUBLISH', questionPaperIds: [ids.C3] });
  const up = J(G.saveExamQuestionPaper(admin, { questionPaperId: ids.C3, closeAtClassStart: false, releaseMinutes: 15 }));
  assert.strictEqual(up.results[0].status, 'UPDATED');
  G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: [ids.C3] });
  const elan = tok('elan_aps2004@avvaiyarpadasalai.org', 'student');
  D.set('2026-10-17T01:10:00Z'); // 9:10 PM, after start
  r = await dl(elan, { questionPaperId: ids.C3, apsId: 'APS2004' }); assert.strictEqual(r.state, 'READY');
  D.set('2026-10-17T02:31:00Z'); // after 10:30 PM end
  r = J(await dl(elan, { questionPaperId: ids.C3, apsId: 'APS2004' })); assert.strictEqual(r.code, 'DOWNLOAD_WINDOW_CLOSED');
});
t('configurable release window: 30 minutes moves the release to 7:00 PM for MAZHALAI (no code change)', () => {
  D.set('2026-10-16T12:00:00Z');
  G.setExamQuestionPaperStatus(admin, { action: 'UNPUBLISH', questionPaperIds: [ids.C1] });
  assert.throws(() => G.saveExamQuestionPaper(admin, { questionPaperId: ids.C1, releaseMinutes: 0, closeAtClassStart: true }), /at least 1 minute/);
  assert.throws(() => G.setExamQuestionPaperDefaults(admin, { releaseMinutes: 0, closeAtClassStart: true }), /at least 1 minute/);
  G.saveExamQuestionPaper(admin, { questionPaperId: ids.C1, releaseMinutes: 30 });
  assert.strictEqual(G.examQpFindRecord_(ids.C1, true).Close_At_Class_Start, 'true', 'editing minutes keeps the paper\'s own close policy');
  const p = J(G.getExamQuestionPaperMonitoring(admin, {})).papers.find(x => x.courseId === 'C1');
  assert.strictEqual(p.releaseLabel, '10/16/2026 07:00 PM EST');
  G.saveExamQuestionPaper(admin, { questionPaperId: ids.C1, releaseMinutes: 15 });
  assert.throws(() => G.setExamQuestionPaperDefaults(hm, { releaseMinutes: 20, closeAtClassStart: true }), /Only Admin/);
  G.setExamQuestionPaperDefaults(admin, { releaseMinutes: 20, closeAtClassStart: false });
  assert.deepStrictEqual([env.props.EXAM_QUESTION_PAPER_RELEASE_MINUTES, env.props.EXAM_QUESTION_PAPER_CLOSE_AT_CLASS_START], ['20', 'false']);
  assert.strictEqual(J(G.getExamQuestionPaperContext(admin)).config.releaseMinutes, 20);
  G.setExamQuestionPaperDefaults(admin, { releaseMinutes: 15, closeAtClassStart: true });
});
t('replace before release keeps the ID, bumps the version, records who/when/why; refused after release', async () => {
  drive.src.V2PDF_abcdefghij = { name: 'v2.pdf', bytes: Array.from(Buffer.from(SOURCE_B64, 'base64')) };
  assert.ok(/replacement reason/.test(res1(await attach({ questionPaperIds: [ids.C1], driveLink: driveLink('V2PDF_abcdefghij') })).message));
  const up = await attach({ questionPaperIds: [ids.C1], driveLink: driveLink('V2PDF_abcdefghij'), reason: 'Typo fixed on page 2' });
  assert.strictEqual(res1(up).status, 'SUCCESS'); assert.ok(/\(v2, 3 pages\)/.test(res1(up).message));
  const rec = G.examQpFindRecord_(ids.C1);
  assert.strictEqual(rec.Question_Paper_ID, ids.C1); assert.strictEqual(rec.Replacement_Reason, 'Typo fixed on page 2'); assert.strictEqual(rec.Replaced_By, 'info@avvaiyarpadasalai.org');
  assert.strictEqual(JSON.parse(rec.Version_History).length, 2); assert.strictEqual(JSON.parse(rec.Version_History)[1].sourceFileId, 'V2PDF_abcdefghij');
  D.set('2026-10-16T22:20:00Z'); // NILAI 2 released at 6:15 PM
  const late = res1(await attach({ questionPaperIds: [ids.C2], driveLink: driveLink('V2PDF_abcdefghij'), reason: 'late' }));
  assert.strictEqual(late.status, 'FAILED'); assert.ok(/Already released/.test(late.message));
  assert.strictEqual(JSON.stringify(sheet('LIVE_QUESTION_PAPER_DOWNLOAD_LINK').data), linkSheetBefore, 'link sheet still untouched after downloads');
  assert.ok(rows('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT').length > 10, 'download history preserved');
});
t('lock suspends downloads; cancel shows CANCELLED; re-publish needs a reason', async () => {
  G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: [ids.C1] });
  assert.throws(() => G.setExamQuestionPaperStatus(admin, { action: 'LOCK', questionPaperIds: [ids.C1] }), /reason/);
  G.setExamQuestionPaperStatus(admin, { action: 'LOCK', questionPaperIds: [ids.C1], reason: 'Possible leak' });
  D.set('2026-10-16T23:20:00Z'); // 7:20 PM, inside MAZHALAI window
  let r = J(await dl(raja, { questionPaperId: ids.C1, apsId: 'APS1234' })); assert.strictEqual(r.code, 'QUESTION_PAPER_LOCKED');
  assert.strictEqual(J(G.getMyExamQuestionPapers(raja)).papers[0].state, 'LOCKED');
  G.setExamQuestionPaperStatus(admin, { action: 'UNLOCK', questionPaperIds: [ids.C1] });
  r = await dl(raja, { questionPaperId: ids.C1, apsId: 'APS1234' }); assert.strictEqual(r.state, 'READY');
  G.setExamQuestionPaperStatus(admin, { action: 'CANCEL', questionPaperIds: [ids.C7], reason: 'Exam moved' });
  const guna = tok('guna_aps2005@avvaiyarpadasalai.org', 'student');
  assert.strictEqual(J(G.getMyExamQuestionPapers(guna)).papers[0].state, 'CANCELLED');
  r = J(await dl(guna, { questionPaperId: ids.C7, apsId: 'APS2005' })); assert.strictEqual(r.code, 'QUESTION_PAPER_CANCELLED');
  assert.throws(() => G.setExamQuestionPaperStatus(admin, { action: 'REPUBLISH', questionPaperIds: [ids.C7] }), /reason/);
  const rp = J(G.setExamQuestionPaperStatus(admin, { action: 'REPUBLISH', questionPaperIds: [ids.C7], reason: 'Rescheduled back' }));
  assert.strictEqual(rp.results[0].status, 'SUCCESS');
});
t('teacher sees ONLY their class (papers, students, activity); other-class attempts on it never leak', () => {
  const m = J(G.getExamQuestionPaperMonitoring(tTwo, {}));
  assert.strictEqual(m.scope, 'TEACHER');
  assert.deepStrictEqual(m.papers.map(p => p.courseId), ['C2']);
  assert.deepStrictEqual(m.students.map(s => s.studentName).sort(), ['Bala', 'Chitra', 'Deva']);
  const p = m.papers[0];
  assert.deepStrictEqual([p.totalStudents, p.downloadedCount, p.notDownloadedCount, p.downloadPct, p.lastDownload], [3, 3, 0, 100, '10/16/2026 06:19 PM EST']);
  assert.ok(!JSON.stringify(m).includes('raja_aps1234'), 'Raja (MAZHALAI) tried this paper but is not shown to NILAI 2 teacher');
  assert.ok(m.students.find(s => s.studentName === 'Bala').downloadCount === 2);
  const s = J(G.getExamQuestionPaperMonitoring(tTwo, { search: 'aps2003' }));
  assert.deepStrictEqual(s.students.map(x => x.studentName), ['Chitra'], 'case-insensitive APSID search');
  assert.deepStrictEqual(J(G.getExamQuestionPaperMonitoring(tMazh, {})).papers.map(x => x.courseId), ['C1']);
});
t('HM/Admin: all classes, tiles, filters, suspicious activity, CSV export, audit log', () => {
  const m = J(G.getExamQuestionPaperMonitoring(hm, {}));
  assert.strictEqual(m.scope, 'ALL'); assert.strictEqual(m.papers.length, 4);
  const T = m.tiles;
  assert.deepStrictEqual([T.totalExams, T.totalClasses, T.totalStudents, T.published, T.eligible, T.downloaded], [1, 4, 7, 4, 7, 5]);
  assert.strictEqual(T.notDownloaded, 2); assert.strictEqual(T.repeated, 1); assert.ok(T.unauthorized >= 3);
  assert.strictEqual(J(G.getExamQuestionPaperMonitoring(hm, { grade: 'NILAI 2' })).papers.length, 1);
  assert.strictEqual(J(G.getExamQuestionPaperMonitoring(hm, { courseId: 'C7' })).students.length, 1);
  assert.strictEqual(J(G.getExamQuestionPaperMonitoring(hm, { downloadStatus: 'DOWNLOADED' })).students.length, 5);
  assert.strictEqual(J(G.getExamQuestionPaperMonitoring(hm, { downloadStatus: 'NOT_DOWNLOADED_ANY' })).students.length, 2);
  assert.strictEqual(J(G.getExamQuestionPaperMonitoring(hm, { teacher: 'Teacher Three' })).papers.length, 1);
  assert.strictEqual(J(G.getExamQuestionPaperMonitoring(hm, { dateFrom: '2026-10-17' })).papers.length, 1, 'date range');
  const types = m.suspicious.map(s => s.type);
  ['MULTIPLE_INVALID_APSID', 'OTHER_CLASS_OR_UNKNOWN_PAPER', 'ACCOUNT_OR_DATA_MISMATCH', 'BEFORE_RELEASE', 'AFTER_CLOSE', 'REPEATED_DOWNLOADS_SHORT_PERIOD'].forEach(x => assert.ok(types.includes(x), x + ' in ' + types));
  const csv = J(G.exportExamQuestionPaperAudit(admin, {}));
  assert.ok(csv.csv.startsWith('"Student","APSID","Email","Class","Teacher","Exam"'));
  assert.ok(csv.csv.includes('"Bala","APS2002"') && csv.csv.includes('"2"'));
  const log = J(G.getExamQuestionPaperAuditLog(hm, {})).map(x => x.type);
  ['EXAM_CREATED', 'QUESTION_PAPER_UPLOADED', 'QUESTION_PAPER_REPLACED', 'QUESTION_PAPER_PUBLISHED', 'QUESTION_PAPER_UNPUBLISHED', 'QUESTION_PAPER_CANCELLED', 'QUESTION_PAPER_LOCKED', 'QUESTION_PAPER_UNLOCKED', 'EXAM_UPDATED', 'DOWNLOAD_COMPLETED', 'SETTINGS_UPDATED', 'AUDIT_EXPORTED']
    .forEach(x => assert.ok(log.includes(x), x));
  assert.throws(() => G.getExamQuestionPaperAuditLog(tTwo, {}), /Only Admin\/HM/);
});
t('admin preview is watermarked PREVIEW and audited as ADMIN_OVERRIDE', async () => {
  const r = await G.previewExamQuestionPaper(admin, { questionPaperId: ids.C2, ticket: crypto.randomUUID().replace(/-/g, '') });
  assert.strictEqual(r.state, 'READY'); assert.ok(pdfText(r.base64, 3).includes('Student: PREVIEW - info@avvaiyarpadasalai.org'));
  assert.ok(rows('EXAM_QUESTION_PAPER_AUDIT').some(x => cell('EXAM_QUESTION_PAPER_AUDIT', x, 'Event_Type') === 'ADMIN_OVERRIDE'));
  await assert.rejects(async () => G.previewExamQuestionPaper(tTwo, { questionPaperId: ids.C2 }), /Only Admin can preview/);
  await assert.rejects(async () => G.previewExamQuestionPaper(hm, { questionPaperId: ids.C2 }), /Only Admin can preview/, 'HM cannot pull the full paper before release');
  await assert.rejects(async () => G.previewExamQuestionPaper(bod, { questionPaperId: ids.C2 }), /Only Admin can preview/);
  assert.ok(J(G.getExamQuestionPaperMonitoring(bod, {})).papers.length === 4, 'BOD sees monitoring (read-only)');
});
t('r67/r104 ⬇️ Teacher Copy: assigned class teacher + Admin from 60 min before the start, marked TEACHER COPY (no key); HM not teaching, other class, BOD, student, too early refused; student data untouched', async () => {
  const keep = new D().toISOString(); D.set('2026-10-16T22:20:00Z'); // 6:20 PM EDT: C2 released 6:15; C3 releases 8:45 PM
  const dlBefore = rows('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT').length, sumBefore = JSON.stringify(rows('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY'));
  const tc = (token, id) => G.downloadExamQuestionPaperTeacherCopy(token, { questionPaperId: id, ticket: crypto.randomUUID().replace(/-/g, '') });
  const r = await tc(tTwo, ids.C2);
  assert.strictEqual(r.state, 'READY'); assert.ok(/^TEACHER_COPY_/.test(r.fileName), r.fileName);
  const txt = pdfText(r.base64, 1);
  assert.ok(txt.includes('TEACHER COPY'), 'marked TEACHER COPY'); assert.ok(txt.includes('Student: TEACHER COPY - Teacher Two'));
  assert.ok(!txt.includes('DOWNLOAD KEY'), 'no student download key on a teacher copy');
  assert.strictEqual(pdfPages(r.base64), 3, 'every page of the official paper');
  await assert.rejects(async () => tc(hm, ids.C2), /not assigned to this examination/, 'r104: an HM who does not teach the class');
  assert.strictEqual((await tc(admin, ids.C2)).state, 'READY', 'Admin');
  await assert.rejects(async () => tc(tTwo, ids.C1), /not assigned to this examination/, 'another class');
  await assert.rejects(async () => tc(admin, ids.C3), /not published at least 24 hours before the exam start time/, 'r104: C3 was re-published at 8:00 AM for its 9:00 PM exam (13 h before)');
  await assert.rejects(async () => tc(bod, ids.C2), /You are not authorized to access this Teacher Copy/);
  await assert.rejects(async () => tc(bala, ids.C2), /You are not authorized to access this Teacher Copy/);
  // polling path: only the same teacher, single use
  const ticket = crypto.randomUUID().replace(/-/g, '');
  await G.downloadExamQuestionPaperTeacherCopy(tTwo, { questionPaperId: ids.C2, ticket });
  assert.strictEqual(J(G.fetchExamQuestionPaperDownload(tMazh, ticket)).message, 'You are not authorized to access this question paper.');
  const f = J(G.fetchExamQuestionPaperDownload(tTwo, ticket)); assert.strictEqual(f.state, 'READY'); assert.ok(f.base64.length > 100);
  assert.strictEqual(J(G.fetchExamQuestionPaperDownload(tTwo, ticket)).state, 'FAILED', 'single use');
  assert.strictEqual(rows('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT').length, dlBefore, 'student download events unchanged');
  assert.strictEqual(JSON.stringify(rows('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY')), sumBefore, 'student summary unchanged');
  assert.ok(rows('EXAM_QUESTION_PAPER_AUDIT').some(x => cell('EXAM_QUESTION_PAPER_AUDIT', x, 'Event_Type') === 'TEACHER_COPY_DOWNLOADED'));
  D.set(keep);
});
t('r67 📧 Send to Student: confirmed send emails the student\'s own copy (PDF) from attendance@; audit SENT/FAILED; duplicate, roster, APS email, release, mail failure, roles', async () => {
  const keep = new D().toISOString(); D.set('2026-10-16T22:21:00Z');
  const mails = env.stats.mails; mails.length = 0;
  const dlBefore = rows('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT').length;
  const send = (token, id, email, extra) => G.sendExamQuestionPaperToStudent(token, Object.assign({ questionPaperId: id, studentEmail: email, confirmed: true, requestId: 'R' + crypto.randomUUID().replace(/-/g, '').slice(0, 20) }, extra || {}));
  const CH = 'chitra_aps2003@avvaiyarpadasalai.org';
  const ok = J(await send(tTwo, ids.C2, CH, { requestId: 'DUP1' }));
  assert.strictEqual(ok.ok, true); assert.strictEqual(ok.status, 'SENT'); assert.ok(/Question paper sent to Chitra/.test(ok.message));
  assert.strictEqual(mails.length, 1); const m = mails[0];
  assert.strictEqual(m.to, CH); assert.ok(!m.cc); assert.ok(/<attendance@avvaiyarpadasalai\.org>$/.test(m.from)); assert.strictEqual(m.replyTo, 'ttwo_aps701@avvaiyarpadasalai.org');
  assert.strictEqual(m.subject, '[APS] Examination Question Paper – Mid-Term Examination – NILAI 2 - ED');
  ['Vanakkam Chitra,', 'is sending you the official question paper for the examination below, because you may have had difficulty downloading it from the APS Dashboard', 'Mid-Term Examination', 'NILAI 2 - ED', 'APS2003', 'Teacher Two (Teacher)', 'Please do not share', 'please contact Teacher Two at <a href="mailto:ttwo_aps701@avvaiyarpadasalai.org">']
    .forEach(x => assert.ok(m.htmlBody.includes(x), 'html: ' + x));
  assert.strictEqual(m.attachments.length, 1); assert.strictEqual(m.attachments[0].type, 'application/pdf'); assert.ok(/^Mid-Term-Examination_NILAI-2-ED_Chitra_APS2003_/.test(m.attachments[0].name) || /Chitra_APS2003/.test(m.attachments[0].name), m.attachments[0].name);
  const att = pdfText(m.attachments[0].base64, 2);
  assert.ok(att.includes('Student: Chitra') && att.includes('APSID: APS2003'), 'the student\'s own personalized copy');
  assert.ok(att.includes('DOWNLOAD KEY: ' + G.examQpDownloadKey_(ids.C2, CH)), 'same download key as the student\'s own download');
  assert.ok(m.htmlBody.includes(G.examQpDownloadKey_(ids.C2, CH)));
  // duplicate request id → same answer, no second email
  assert.strictEqual(J(await send(tTwo, ids.C2, CH, { requestId: 'DUP1' })).duplicate, true); assert.strictEqual(mails.length, 1);
  assert.throws(() => G.sendExamQuestionPaperToStudent(tTwo, { questionPaperId: ids.C2, studentEmail: CH, requestId: 'X1' }), /Please confirm/);
  // refusals (recorded FAILED, nothing sent)
  let r = J(await send(tTwo, ids.C1, 'raja_aps1234@avvaiyarpadasalai.org')); assert.strictEqual(r.status, 'FAILED'); assert.ok(/not authorized/.test(r.message));
  r = J(await send(tTwo, ids.C2, 'raja_aps1234@avvaiyarpadasalai.org')); assert.ok(/not on the roster/.test(r.message));
  r = J(await send(hm, ids.C3, 'elan_aps2004@avvaiyarpadasalai.org')); assert.ok(/Available from/.test(r.message), 'not before release');
  const c2 = COURSES[1]; c2.students.push({ name: 'Ext Kid', email: 'extkid@gmail.com' });
  cs.data[2][17] = JSON.stringify(c2); G.invalidateCoursesMemo_ && G.invalidateCoursesMemo_();
  r = J(await send(tTwo, ids.C2, 'extkid@gmail.com')); assert.strictEqual(r.status, 'FAILED'); assert.ok(/does not have a valid APS email address/.test(r.message));
  c2.students.pop(); cs.data[2][17] = JSON.stringify(c2); G.invalidateCoursesMemo_ && G.invalidateCoursesMemo_();
  assert.strictEqual(mails.length, 1, 'nothing sent on refusals');
  // mail failure → FAILED + clear error, retry possible with a new request id
  const tokSave = env.props.ATTENDANCE_REFRESH_TOKEN; env.props.ATTENDANCE_REFRESH_TOKEN = '';
  r = J(await send(hm, ids.C2, 'bala_aps2002@avvaiyarpadasalai.org')); assert.strictEqual(r.status, 'FAILED'); assert.ok(/The email could not be sent/.test(r.message), r.message);
  env.props.ATTENDANCE_REFRESH_TOKEN = tokSave;
  r = J(await send(hm, ids.C2, 'bala_aps2002@avvaiyarpadasalai.org')); assert.strictEqual(r.status, 'SENT', 'HM can send for any class');
  assert.throws(() => send(bod, ids.C2, CH), /Only Teacher, VP, HM and Admin/);
  assert.throws(() => send(bala, ids.C2, CH), /Only Teacher, VP, HM and Admin/);
  // audit sheet
  const A = 'EXAM_QUESTION_PAPER_EMAIL_AUDIT', ar = rows(A);
  assert.deepStrictEqual(sheet(A).data[0].slice(0, 14), ['Send_ID', 'Sent_Date_Time_EST', 'Sender_Email', 'Sender_Role', 'Student_Name', 'Student_APSID', 'Student_Email', 'Exam_Title', 'Exam_ID', 'Question_Paper_ID', 'Class_Grade', 'Email_Status', 'Error_Message', 'Request_ID']);
  const first = ar[0];
  assert.deepStrictEqual(['Sender_Email', 'Sender_Role', 'Student_APSID', 'Student_Email', 'Exam_Title', 'Class_Grade', 'Email_Status', 'Error_Message'].map(h => cell(A, first, h)),
    ['ttwo_aps701@avvaiyarpadasalai.org', 'Teacher', 'APS2003', CH, 'Mid-Term Examination', 'NILAI 2 - ED', 'SENT', '']);
  assert.ok(/^2026-10-16 18:21/.test(cell(A, first, 'Sent_Date_Time_EST')));
  const st = ar.map(x => cell(A, x, 'Email_Status')); assert.deepStrictEqual(st.filter(x => x === 'SENT').length, 2); assert.ok(st.filter(x => x === 'FAILED').length >= 5);
  assert.ok(ar.some(x => /could not be sent/.test(cell(A, x, 'Error_Message'))));
  assert.strictEqual(rows('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT').length, dlBefore, 'student download events unchanged');
  // monitoring: staff flags + last emailed; BOD / student views unchanged
  const mo = J(G.getExamQuestionPaperMonitoring(tTwo, {}));
  assert.strictEqual(mo.staffActions, true); assert.strictEqual(mo.papers[0].staffCanUse, true);
  const ch = mo.students.find(x => x.email === CH); assert.strictEqual(ch.canSend, true); assert.ok(/^10\/16\/2026 06:21 PM EST$/.test(ch.lastEmailed), ch.lastEmailed);
  const deva = mo.students.find(x => x.studentName === 'Deva'); assert.strictEqual(deva.canSend, true, 'deva@avvaiyarpadasalai.org is an APS address');
  const hmMo = J(G.getExamQuestionPaperMonitoring(hm, {})); assert.strictEqual(hmMo.papers.find(p => p.courseId === 'C3').staffCanUse, false);
  assert.ok(/Available from/.test(hmMo.papers.find(p => p.courseId === 'C3').staffBlockReason));
  const bm = J(G.getExamQuestionPaperMonitoring(bod, {})); assert.strictEqual(bm.staffActions, false); assert.ok(bm.students.every(x => !x.canSend && !x.lastEmailed));
  D.set(keep);
});
t('r67 VP / class HM (teacher role, supports the class): allowed for THAT class only, labelled with their class role', () => {
  const v = { email: 'priya_aps702@avvaiyarpadasalai.org', role: 'teacher', isTeacher: true };
  const course = { id: 'C2', teachers: [], classSupport: [{ email: 'priya_aps702@avvaiyarpadasalai.org', roles: ['VP'], sources: ['ROOM'], member: true }] };
  const r = { Course_ID: 'C2' };
  assert.strictEqual(J(G.examQpStaffAccess_(v, r, course)).label, 'VP');
  assert.strictEqual(G.examQpStaffAccess_(v, r, { id: 'C1', teachers: [], classSupport: [] }), null, 'not for another class');
  assert.strictEqual(G.examQpStaffAccess_(v, r, { id: 'C2', teachers: [], classSupport: [{ email: v.email, roles: ['VP'], sources: ['ROOM'], member: false }] }), null, 'VP label without Classroom membership: no access (existing rule)');
  assert.strictEqual(J(G.examQpStaffAccess_({ email: 'x', role: 'headmaster', isHm: true }, r, null)).label, 'Head Master');
  assert.strictEqual(G.examQpStaffAccess_({ email: 'x', role: 'vcfo_amchsts_bod', isReadOnly: true }, r, course), null);
});
t('busy lock: the download event is still written atomically (summary rebuildable); rebuild restores counts', async () => {
  D.set('2026-10-18T23:20:00Z'); // SUN 7:20 PM, NILAI 7 window (re-published)
  const guna = tok('guna_aps2005@avvaiyarpadasalai.org', 'student');
  const before = rows('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT').length;
  lockBusy = true;
  const r = await dl(guna, { questionPaperId: ids.C7, apsId: 'APS2005' });
  lockBusy = false;
  assert.strictEqual(r.state, 'READY');
  assert.strictEqual(rows('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT').length, before + 1);
  assert.ok(/summary pending/.test(cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', last(), 'Reason')));
  assert.strictEqual(J(G.getExamQuestionPaperMonitoring(hm, { courseId: 'C7' })).students[0].downloadCount, 1, 'monitoring derives from events');
  const rb = J(G.rebuildExamQuestionPaperSummary(admin));
  assert.ok(rb.rows >= 6);
  assert.ok(rows('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY').some(x => cell('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY', x, 'Student_Email') === 'guna_aps2005@avvaiyarpadasalai.org' && cell('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY', x, 'Download_Count') === '1'));
});
t('concurrency: stale record writes are refused (Row_Version); duplicate new records are skipped inside the lock; save claim blocks a parallel retry', () => {
  const stale = G.examQpTrack_(G.examQpFindRecord_(ids.C3, true));
  G.setExamQuestionPaperStatus(admin, { action: 'LOCK', questionPaperIds: [ids.C3], reason: 'Concurrent admin' });
  stale.Status = 'PUBLISHED'; stale.Locked = 'false';
  assert.throws(() => G.examQpWriteRecords_([stale]), /changed by someone else/);
  assert.strictEqual(G.examQpFindRecord_(ids.C3, true).Locked, 'true', 'the concurrent LOCK survived');
  G.setExamQuestionPaperStatus(admin, { action: 'UNLOCK', questionPaperIds: [ids.C3] });
  const clone = Object.assign({}, G.examQpFindRecord_(ids.C2, true), { Question_Paper_ID: 'EQP-20261016-DUPDUPDU', Row_Version: '' });
  assert.deepStrictEqual(J(G.examQpWriteRecords_([clone])).skipped, ['EQP-20261016-DUPDUPDU']);
  env.cache['examQpReq_req-inflight-1'] = 'PENDING';
  assert.throws(() => G.saveExamQuestionPaper(admin, { clientRequestId: 'req-inflight-1', examTitle: 'Other', examDate: '2026-10-23', courseIds: ['C2'] }), /already in progress/);
  assert.ok(env.props.examQpSetupDone_v1_LIVE, 'first Admin open ran the private setup once');
  assert.strictEqual(typeof G.setupExamQuestionPaperSheets, 'undefined', 'no public setup endpoint');
});
t('environment safety: TESTING never writes to the LIVE sheet', () => {
  env.props.APS_ENVIRONMENT = 'TESTING';
  G.examQpInvalidateRecords_();
  assert.throws(() => G.getExamQuestionPaperMonitoring(admin, {}), /TEST_QUESTION_PAPER_SPREADSHEET_ID/);
  env.props.TEST_QUESTION_PAPER_SPREADSHEET_ID = env.props.LIVE_QUESTION_PAPER_SPREADSHEET_ID;
  assert.throws(() => G.getExamQuestionPaperMonitoring(admin, {}), /Refusing to write TESTING data/);
  delete env.props.TEST_QUESTION_PAPER_SPREADSHEET_ID; env.props.APS_ENVIRONMENT = 'LIVE';
  delete env.props.LIVE_QUESTION_PAPER_SPREADSHEET_ID;
  assert.throws(() => G.getExamQuestionPaperMonitoring(admin, {}), /LIVE_QUESTION_PAPER_SPREADSHEET_ID/);
  env.props.LIVE_QUESTION_PAPER_SPREADSHEET_ID = '1hxcZ4I9OyR-YVN1qysdUCL36q0b3HfFpaqH6qgprkHY';
});
t('DEFAULT policy (EXAM_QUESTION_PAPER_STUDENT_TEACHER_ACCESS unset): HM / Teacher / Student are refused everywhere; Admin + BOD unaffected', async () => {
  delete env.props.EXAM_QUESTION_PAPER_STUDENT_TEACHER_ACCESS;
  [hm, tTwo, bala].forEach(k => assert.throws(() => G.getExamQuestionPaperContext(k), /not authorized/));
  assert.throws(() => G.getMyExamQuestionPapers(bala), /not authorized/);
  assert.throws(() => G.getExamQuestionPaperMonitoring(tTwo, {}), /not authorized/);
  const r = J(await G.downloadExamQuestionPaper(bala, { questionPaperId: ids.C2, apsId: 'APS2002', confirmed: true, ticket: crypto.randomUUID().replace(/-/g, '') }));
  assert.strictEqual(r.code, 'UNAUTHORIZED', 'download refused + audited');
  assert.strictEqual(cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', last(), 'Download_Status'), 'UNAUTHORIZED');
  assert.deepStrictEqual(['headmaster', 'teacher', 'student'].map(x => G.examinationAccessForRole_(x)), ['', '', '']);
  assert.ok(J(G.getExamQuestionPaperContext(admin)).canManage); assert.ok(J(G.getExamQuestionPaperContext(bod)).readOnly);
  env.props.EXAM_QUESTION_PAPER_STUDENT_TEACHER_ACCESS = 'true';
  assert.strictEqual(G.examinationAccessForRole_('student'), 'QUESTION_PAPER');
});
t('schedule: default = class day & time (unchanged); CUSTOM = the Admin-chosen exact date + start time for every selected class; validation; edit can switch modes', () => {
  // D is SUN 10/18/2026 7:20 PM EDT here.
  const m0 = J(G.getExamQuestionPaperMonitoring(admin, {}));
  assert.ok(m0.papers.every(p => p.scheduleMode === 'CLASS'), 'records created with the default schedule (and older records) are CLASS');
  assert.throws(() => G.saveExamQuestionPaper(admin, { clientRequestId: 'req-custom-000a', examTitle: 'Make-up Exam', examDate: '2026-11-04', scheduleMode: 'CUSTOM', courseIds: ['C2'] }), /Start Time is required/);
  assert.throws(() => G.saveExamQuestionPaper(admin, { clientRequestId: 'req-custom-000b', examTitle: 'Make-up Exam', examDate: '2026-11-04', scheduleMode: 'CUSTOM', startTime: '18:00', endTime: '17:00', courseIds: ['C2'] }), /End Time must be after Start Time/);
  assert.throws(() => G.saveExamQuestionPaper(admin, { clientRequestId: 'req-custom-000c', examTitle: 'Make-up Exam', examDate: '2026-10-18', scheduleMode: 'CUSTOM', startTime: '19:30', courseIds: ['C2'] }), /has already passed/);
  const res = J(G.saveExamQuestionPaper(admin, { clientRequestId: 'req-custom-0001', examTitle: 'Make-up Exam', examDate: '2026-11-04', scheduleMode: 'CUSTOM', startTime: '18:00', courseIds: ['C2', 'C7'], releaseMinutes: 20 }));
  assert.deepStrictEqual(res.results.map(r => r.status), ['CREATED', 'CREATED']);
  const recs = res.results.map(r => G.examQpFindRecord_(r.questionPaperId, true));
  recs.forEach(r => assert.deepStrictEqual([r.Class_Date, r.Day, r.Class_Start_Time, r.Class_End_Time, r.Schedule_Mode], ['2026-11-04', 'WED', '18:00', '19:30', 'CUSTOM'], r.Class_Name));
  const mp = J(G.getExamQuestionPaperMonitoring(admin, {})).papers.find(p => p.questionPaperId === recs[0].Question_Paper_ID);
  assert.deepStrictEqual([mp.scheduleMode, mp.releaseLabel, mp.startLabel], ['CUSTOM', '11/04/2026 05:40 PM EST', '11/04/2026 06:00 PM EST'], 'release = custom start − 20 min, not the FRI class time');
  // Edit: back to the class day & time (FRI 6:30 PM in that week), then to another custom date/time.
  const id = recs[0].Question_Paper_ID;
  G.saveExamQuestionPaper(admin, { questionPaperId: id, scheduleMode: 'CLASS', classDate: '2026-11-04' });
  let r = G.examQpFindRecord_(id, true);
  assert.deepStrictEqual([r.Class_Date, r.Day, r.Class_Start_Time, r.Class_End_Time, r.Schedule_Mode], ['2026-11-06', 'FRI', '18:30', '20:00', 'CLASS']);
  G.saveExamQuestionPaper(admin, { questionPaperId: id, scheduleMode: 'CUSTOM', classDate: '2026-11-07', startTime: '10:00', endTime: '11:30' });
  r = G.examQpFindRecord_(id, true);
  assert.deepStrictEqual([r.Class_Date, r.Day, r.Class_Start_Time, r.Class_End_Time, r.Schedule_Mode, r.Calculated_Release_Date_Time], ['2026-11-07', 'SAT', '10:00', '11:30', 'CUSTOM', '2026-11-07 09:40:00']);
  // An older record without Schedule_Mode whose time was changed by hand is shown as CUSTOM.
  assert.strictEqual(G.examQpScheduleModeOf_({ Class_Name: COURSES[1].name, Class_Date: '2026-10-16', Class_Start_Time: '17:00' }), 'CUSTOM');
  assert.strictEqual(G.examQpScheduleModeOf_({ Class_Name: COURSES[1].name, Class_Date: '2026-10-16', Class_Start_Time: '18:30' }), 'CLASS');
});
t('an existing EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT sheet keeps its header and rows; missing columns are appended', () => {
  const env2 = makeContext({ props: { LIVE_QUESTION_PAPER_SPREADSHEET_ID: 'X' } });
  ['Array', 'Object', 'String', 'Number', 'RegExp', 'Error', 'JSON', 'Math', 'parseInt', 'isFinite', 'encodeURIComponent'].forEach(k => delete env2.ctx[k]);
  vm.runInContext(code, env2.ctx);
  const sh = env2.wb.insertSheet('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT');
  sh.data[0] = ['Audit_ID', 'Legacy_Note', 'APSID']; sh.data[1] = ['OLD-1', 'keep me', 'APS1'];
  const meta = env2.ctx.examQpSheet_('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', env2.ctx.EXAM_QP_DOWNLOAD_HEADER || vm.runInContext('EXAM_QP_DOWNLOAD_HEADER', env2.ctx));
  assert.deepStrictEqual(sh.data[0].slice(0, 3), ['Audit_ID', 'Legacy_Note', 'APSID']);
  assert.deepStrictEqual(sh.data[1], ['OLD-1', 'keep me', 'APS1']);
  assert.strictEqual(meta.col.APSID, 2); assert.strictEqual(meta.col.Question_Paper_ID, 3);
  assert.ok(sh.data[0].includes('Download_Attempt_Count'));
});

t('r95: tilesCurrent = the same statistics from today\'s + upcoming exams only (APS time zone); tiles = full history; today stays current; pastPaperIds lists past papers', () => {
  const saved = Date.now();
  try {
    const all0 = J(G.getExamQuestionPaperMonitoring(admin, {}));
    const day = all0.papers.find(p => p.courseId === 'C2').classDate;
    D.set(new Date(day + 'T23:50:00-04:00').toISOString()); // exam day, 11:50 PM EDT: still today
    const m1 = J(G.getExamQuestionPaperMonitoring(admin, {}));
    assert.deepStrictEqual(m1.tilesCurrent, m1.tiles, 'nothing is past yet on the exam day');
    assert.deepStrictEqual(m1.pastPaperIds.filter(id => m1.papers.find(p => p.questionPaperId === id && p.classDate === day)), []);
    D.set(new Date(new Date(day + 'T16:00:00Z').getTime() + 2 * 86400000).toISOString()); // two days later
    const m2 = J(G.getExamQuestionPaperMonitoring(admin, {}));
    const today2 = new Date(new Date(day + 'T16:00:00Z').getTime() + 2 * 86400000).toISOString().slice(0, 10), past = m2.papers.filter(p => p.classDate < today2);
    assert.ok(past.length >= 1 && past.every(p => m2.pastPaperIds.includes(p.questionPaperId)));
    const noToday = x => { const y = J(x); delete y.todaysExams; return y; }; assert.deepStrictEqual(noToday(m2.tiles), noToday(m1.tiles), 'full history unchanged (except Today\'s Exams)'); assert.strictEqual(m2.tilesCurrent.todaysExams, m2.tiles.todaysExams, 'today is never past');
    const t = m2.tilesCurrent, cur = m2.papers.filter(p => !m2.pastPaperIds.includes(p.questionPaperId));
    assert.strictEqual(t.totalExams, new Set(cur.map(p => p.examId)).size);
    assert.strictEqual(t.totalClasses, new Set(cur.map(p => p.courseId)).size);
    assert.strictEqual(t.published, cur.filter(p => p.status === 'PUBLISHED').length);
    assert.strictEqual(t.eligible, cur.reduce((n, p) => n + p.eligibleCount, 0));
    assert.strictEqual(t.downloaded, cur.reduce((n, p) => n + p.downloadedCount, 0));
    assert.ok(t.totalExams < m2.tiles.totalExams || t.downloaded < m2.tiles.downloaded, 'past exams excluded');
    assert.strictEqual(t.failed + t.unauthorized <= m2.tiles.failed + m2.tiles.unauthorized, true);
    assert.strictEqual(t.notDownloaded, Math.max(0, t.eligible - t.downloaded));
    const tm = J(G.getExamQuestionPaperMonitoring(tTwo, {})); assert.ok(tm.tilesCurrent && tm.pastPaperIds, 'teachers get the same pair');
  } finally { D.set(new Date(saved).toISOString()); }
});

(async () => {
  await makeSource();
  let passed = 0;
  for (const [name, fn] of tests) { try { await fn(); passed++; console.log('PASS', name); } catch (e) { console.log('FAIL', name); console.log(e && e.stack || e); process.exit(1); } }
  console.log('\nALL ' + passed + ' EXAM QUESTION PAPER TESTS PASSED');
})();

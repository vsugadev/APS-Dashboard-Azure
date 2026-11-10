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


// ===================== r99: automatic email fallback =====================
const DOM = '@avvaiyarpadasalai.org';
const S = n => 'stu' + n + '_aps30' + String(n).padStart(2, '0') + DOM; // stu1_aps3001@...
const C9 = { id: 'C9', name: 'NILAI 4 - KA | FRI 6:30 - 8:00 PM EST | AY26-27', teachers: [{ name: 'Teacher Nine', email: 'tnine_aps709' + DOM }],
  students: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ name: 'Student ' + n, email: S(n) })).concat([{ name: 'Outside Kid', email: 'outside@gmail.com' }]) };
cs.data[COURSES.length + 1] = (() => { const row = new Array(18).fill(''); row[0] = 'C9'; row[17] = JSON.stringify(C9); return row; })();
const LOG = 'EXAM_QUESTION_PAPER_AUTO_EMAIL_LOG';
const logRows = () => rows(LOG).map(r => Object.fromEntries(sheet(LOG).data[0].map((h, i) => [h, r[i]])));
const lastFor = email => logRows().filter(r => r.Student_Email === email).pop();
const mails = () => env.stats.mails;
const START = Date.parse('2026-10-16T22:30:00Z'); // FRI 6:30 PM EDT
let snap = { at: 0, byCourse: {} };
G.classMeetLiveSnapshot_ = () => snap; // the existing live Meet monitor (its own tests cover how it is built)
const meet = people => { snap = { at: Date.now(), byCourse: { C9: { startIso: new Date(START).toISOString(), live: true, sources: [], people } } }; };
const live = () => ({ r: 'S', first: START - 60000, last: Date.now(), live: true });
const run = async () => J(await G.examQpAutoRun_(new D()));
let QP9;

t('setup: C9 paper attached + published; the toggle is OFF by default (Publish installs nothing, a run sends nothing)', async () => {
  const res = J(G.saveExamQuestionPaper(admin, { clientRequestId: 'req-auto-000001', examTitle: 'Unit Test Examination', examDate: '2026-10-16', courseIds: ['C9'] }));
  QP9 = res.results[0].questionPaperId;
  drive.src.SRCAUTO1_abcdefghij = { name: 'unit_nil4.pdf', bytes: Array.from(Buffer.from(SOURCE_B64, 'base64')) };
  const at = J(await G.attachExamQuestionPaperLink(admin, { questionPaperIds: [QP9], driveLink: driveLink('SRCAUTO1_abcdefghij') }));
  assert.ok(at.results.every(x => /ATTACHED|SUCCESS|UPDATED/.test(x.status)), JSON.stringify(at));
  assert.ok(!env.stats.triggers.some(x => x.fn === 'processExamQuestionPaperAutoEmail'));
  const p = J(G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: [QP9] }));
  assert.strictEqual(p.results[0].status, 'SUCCESS');
  // r104: the same 5-minute run now also sends the 60-minute Teacher Copy email, so Publish installs it even with the student toggle OFF
  assert.ok(env.stats.triggers.some(x => x.fn === 'processExamQuestionPaperAutoEmail'), 'r104: scheduler installed for the Teacher Copy email');
  const mo = J(G.getExamQuestionPaperMonitoring(admin, { questionPaperId: QP9 }));
  assert.deepStrictEqual([mo.papers[0].autoEmailEnabled, mo.papers[0].autoEmailMinutes], [false, 20]);
  D.set('2026-10-16T22:55:00Z'); meet({ [S(2)]: live() }); mails().length = 0;
  const r = await run(); assert.strictEqual(r.evaluated, 0, 'toggle OFF → nothing evaluated'); assert.strictEqual(mails().length, 0);
  D.set('2026-10-14T16:00:00Z');
  assert.throws(() => G.processExamQuestionPaperAutoEmail({}), /Access denied/, 'browser / editor without a trigger id refused');
});
t('toggle + minutes: validation, roles (managers only), per-exam storage, audit; ON installs one 5-minute check', () => {
  const set = (tk, o) => J(G.setExamQuestionPaperAutoEmail(tk, Object.assign({ examId: G.examQpFindRecord_(QP9).Exam_ID, enabled: true, minutes: '20' }, o || {})));
  ['', '0', '-5', 'abc', '2.5', '121', ' '].forEach(m => assert.throws(() => set(admin, { minutes: m }), /Please enter a valid number of minutes/, JSON.stringify(m)));
  [tTwo, hm, bod, bala].forEach(tk => assert.throws(() => set(tk), /Only Admin|not authorized|Read-only|permission/i));
  assert.throws(() => set(admin, { examId: 'bogus' }), /Select an exam/);
  const r = set(admin, { minutes: 20 });
  assert.deepStrictEqual([r.ok, r.enabled, r.minutes, r.changed], [true, true, 20, 1]);
  const rec = G.examQpFindRecord_(QP9, true); assert.deepStrictEqual([rec.Auto_Email_Enabled, rec.Auto_Email_Minutes], ['true', '20']);
  assert.ok(rows('EXAM_QUESTION_PAPER_AUDIT').some(x => cell('EXAM_QUESTION_PAPER_AUDIT', x, 'Event_Type') === 'SETTINGS_UPDATED' && /ON, 20 minutes/.test(cell('EXAM_QUESTION_PAPER_AUDIT', x, 'Reason'))));
  const trg = env.stats.triggers.filter(x => x.fn === 'processExamQuestionPaperAutoEmail');
  assert.strictEqual(trg.length, 1); assert.strictEqual(trg[0].everyMinutes, 5);
  assert.strictEqual(set(admin, { minutes: 20 }).changed, 0, 'unchanged → no write');
  G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: [QP9] });
  assert.strictEqual(env.stats.triggers.filter(x => x.fn === 'processExamQuestionPaperAutoEmail').length, 1, 'never a second trigger');
  // HM may manage only when EXAM_QUESTION_PAPER_HM_CAN_MANAGE=true (existing rule)
  env.props.EXAM_QUESTION_PAPER_HM_CAN_MANAGE = 'true'; assert.strictEqual(set(hm, { minutes: 20 }).ok, true); delete env.props.EXAM_QUESTION_PAPER_HM_CAN_MANAGE;
  // the other exams keep their own setting (OFF)
  assert.ok(G.examQpReadRecords_(true).filter(x => x.Question_Paper_ID !== QP9).every(x => String(x.Auto_Email_Enabled || '') !== 'true'));
});
t('Scenario 1 / 5 / Case 1: students 1 and 5 download on the Dashboard (Case 1: the last at 6:29, before the check)', async () => {
  D.set('2026-10-16T22:16:00Z');
  const dl1 = await G.downloadExamQuestionPaper(tok(S(1), 'student'), { questionPaperId: QP9, apsId: 'APS3001', confirmed: true, ticket: crypto.randomUUID().replace(/-/g, '') });
  assert.strictEqual(dl1.state, 'READY');
  D.set('2026-10-16T22:29:00Z');
  const dl5 = await G.downloadExamQuestionPaper(tok(S(5), 'student'), { questionPaperId: QP9, apsId: 'APS3005', confirmed: true, ticket: crypto.randomUUID().replace(/-/g, '') });
  assert.strictEqual(dl5.state, 'READY');
});
t('before exam start + 20 min (6:49 PM): nothing evaluated, nothing sent', async () => {
  D.set('2026-10-16T22:49:00Z'); mails().length = 0; meet({ [S(2)]: live() });
  const r = await run(); assert.strictEqual(r.evaluated, 0); assert.strictEqual(mails().length, 0); assert.strictEqual(rows(LOG).length, 0);
});
t('at +20 min: the 10-scenario decision table (download → Unreported Absence → Google Meet)', async () => {
  D.set('2026-10-16T22:50:00Z'); mails().length = 0;
  // attendance: staff-marked ABSENT for students 4 and 6 on that class date (the existing attendance sheet; never changed here)
  const name = G.attWeekSheetNameForDate_('2026-10-16', G.getAttendanceWeek1Start_()), ash = G.getOrCreateAttendanceWeekSheet_(name), C = G.ATTENDANCE_COL_;
  [4, 6].forEach(n => { const row = new Array(G.ATTENDANCE_HEADER_ROW.length).fill(''); row[C.DATE] = '2026-10-16'; row[C.COURSE_ID] = 'C9'; row[C.EMAIL] = S(n); row[C.ROLE] = 'STUDENT'; row[C.STATUS] = 'ABSENT'; row[C.OVERRIDE_STATUS] = 'ABSENT'; row[C.OVERRIDE_BY] = 'hm'; ash.data.push(row); });
  const attBefore = JSON.stringify(ash.data);
  // Google Meet: 1 online+downloaded, 2 live, 6 live but UA, 7 live (mail will fail), 9 audit session reaching the exam start, 8 left before the exam started, 3/4/5 not seen
  meet({ [S(1)]: live(), [S(2)]: live(), [S(6)]: live(), [S(7)]: live(), [S(9)]: { r: 'S', first: START - 5 * 60000, last: START + 10 * 60000, live: false },
    [S(8)]: { r: 'S', first: START - 25 * 60000, last: START - 10 * 60000, live: false }, ['tnine_aps709' + DOM]: { r: 'T', first: START, last: Date.now(), live: true } });
  const orig = G.apsGmailSend_; G.apsGmailSend_ = function (k, m) { if (m.to[0] === S(7)) return { ok: false, error: 'Mail service unavailable' }; return orig.apply(null, arguments); };
  const r = await run();
  G.apsGmailSend_ = orig;
  assert.deepStrictEqual([r.papers, r.evaluated, r.sent, r.failed], [1, 10, 2, 1], JSON.stringify(r));
  // emails: only students 2 and 9, only to their own APS email, attendance@ (existing exam sender), their own key + PDF
  assert.deepStrictEqual(mails().map(m => m.to).sort(), [S(2), S(9)].sort());
  const m = mails().find(x => x.to === S(2));
  assert.ok(!m.cc && !m.bcc); assert.ok(/<attendance@avvaiyarpadasalai\.org>$/.test(m.from)); assert.strictEqual(m.subject, 'APS Examination – Question Paper');
  const key2 = G.examQpDownloadKey_(QP9, S(2));
  ['Dear Student,', 'have not downloaded your examination question paper from the APS Dashboard within the assigned time', 'Since you are participating in the Google Meet examination session',
    'backup delivery', 'Please use the unique download key provided', key2, 'Thank you,<br>Avvaiyar Padasalai', 'https://www.namaps.org/dashboard', 'APS3002', 'Unit Test Examination', 'NILAI 4 - KA'].forEach(x => assert.ok(m.htmlBody.includes(x), 'html: ' + x));
  assert.strictEqual(m.attachments.length, 1);
  const txt = pdfText(m.attachments[0].base64, 1);
  assert.ok(txt.includes('Student: Student 2') && txt.includes('APSID: APS3002') && txt.includes('DOWNLOAD KEY: ' + key2), 'the student\'s own watermarked copy, existing key');
  assert.notStrictEqual(key2, G.examQpDownloadKey_(QP9, S(9)), 'keys never shared');
  // log (one row per student, spec fields)
  const L = n => lastFor(S(n));
  const pick = (o) => [o.Download_Status, o.Meet_Status, o.Attendance_Status, o.Eligibility, o.Email_Status, o.Result, o.Reason];
  assert.deepStrictEqual(pick(L(1)), ['DOWNLOADED', '', '', 'NOT_REQUIRED', 'NOT_REQUIRED', 'NOT_REQUIRED', 'DASHBOARD_DOWNLOADED'], 'S1');
  assert.deepStrictEqual(pick(L(2)), ['NOT_DOWNLOADED', 'ONLINE', 'NOT_RECORDED', 'ELIGIBLE', 'SENT', 'AUTO_EMAIL_SENT', 'NOT_DOWNLOADED_AFTER_CONFIGURED_TIME'], 'S2');
  assert.deepStrictEqual(pick(L(3)), ['NOT_DOWNLOADED', 'OFFLINE', 'NOT_RECORDED', 'NOT_ELIGIBLE', 'NOT_SENT', 'AUTO_EMAIL_NOT_SENT', 'STUDENT_NOT_ONLINE'], 'S3');
  assert.deepStrictEqual(pick(L(4)), ['NOT_DOWNLOADED', 'OFFLINE', 'UNREPORTED_ABSENCE', 'NOT_ELIGIBLE', 'NOT_SENT', 'AUTO_EMAIL_NOT_SENT', 'UNREPORTED_ABSENCE'], 'S4');
  assert.strictEqual(L(5).Result, 'NOT_REQUIRED', 'S5 downloaded (offline does not matter)');
  assert.deepStrictEqual(pick(L(6)), ['NOT_DOWNLOADED', 'ONLINE', 'UNREPORTED_ABSENCE', 'NOT_ELIGIBLE', 'NOT_SENT', 'AUTO_EMAIL_NOT_SENT', 'UNREPORTED_ABSENCE'], 'S6 online + UA');
  assert.deepStrictEqual(pick(L(7)).slice(4), ['FAILED', 'AUTO_EMAIL_FAILED', 'EMAIL_DELIVERY_FAILED'], 'S7'); assert.ok(/Mail service unavailable/.test(L(7).Error_Message));
  assert.strictEqual(L(8).Reason, 'STUDENT_NOT_ONLINE', 'S8 left before the exam started');
  assert.deepStrictEqual(pick(L(9)).slice(1, 6), ['JOINED', 'NOT_RECORDED', 'ELIGIBLE', 'SENT', 'AUTO_EMAIL_SENT'], 'S9 audit-log session');
  assert.strictEqual(lastFor('outside@gmail.com').Reason, 'NO_VALID_APS_EMAIL');
  const r2 = L(2);
  assert.deepStrictEqual([r2.Exam_Date, r2.Exam_Start_Time, r2.Configured_Minutes, r2.Question_Paper_ID, r2.Course_ID, r2.Student_APSID, r2.Delivery_Method], ['2026-10-16', '06:30 PM EST', '20', QP9, 'C9', 'APS3002', 'AUTO_EMAIL_FALLBACK']);
  assert.strictEqual(L(1).Delivery_Method, 'DASHBOARD_DOWNLOAD');
  assert.strictEqual(r2.Key_Reference, '***-***-' + key2.slice(-3), 'masked key reference — the full key is never stored in the log');
  assert.ok(!JSON.stringify(sheet(LOG).data).includes(key2));
  assert.strictEqual(JSON.stringify(ash.data), attBefore, 'attendance never changed');
  // existing audit trails: email audit + general audit (system actor)
  const ea = rows('EXAM_QUESTION_PAPER_EMAIL_AUDIT').map(x => [cell('EXAM_QUESTION_PAPER_EMAIL_AUDIT', x, 'Student_Email'), cell('EXAM_QUESTION_PAPER_EMAIL_AUDIT', x, 'Sender_Role'), cell('EXAM_QUESTION_PAPER_EMAIL_AUDIT', x, 'Email_Status')]);
  assert.deepStrictEqual(ea.filter(x => x[1] === 'Automatic fallback').map(x => x[0] + ':' + x[2]).sort(), [S(2) + ':SENT', S(7) + ':FAILED', S(9) + ':SENT'].sort());
  assert.ok(rows('EXAM_QUESTION_PAPER_AUDIT').some(x => cell('EXAM_QUESTION_PAPER_AUDIT', x, 'Event_Type') === 'QUESTION_PAPER_EMAILED' && cell('EXAM_QUESTION_PAPER_AUDIT', x, 'Result') === 'AUTO_EMAIL_SENT' && cell('EXAM_QUESTION_PAPER_AUDIT', x, 'User_Email') === 'SYSTEM'));
});
t('Scenario 7 / 8: next runs never re-send; NOT_SENT logged once per state; a failed send is retried at most 3 times', async () => {
  D.set('2026-10-16T22:55:00Z'); mails().length = 0;
  const before = rows(LOG).length;
  const orig = G.apsGmailSend_; G.apsGmailSend_ = function (k, m) { if (m.to[0] === S(7)) return { ok: false, error: 'Mail service unavailable' }; return orig.apply(null, arguments); };
  let r = await run(); assert.deepStrictEqual([r.sent, r.failed], [0, 1]); assert.strictEqual(mails().length, 0, 'students 2 and 9 never emailed twice');
  assert.strictEqual(rows(LOG).length, before + 1, 'only the retry is logged — unchanged NOT_SENT states are not repeated');
  D.set('2026-10-16T23:00:00Z'); r = await run(); assert.strictEqual(r.failed, 1);
  D.set('2026-10-16T23:05:00Z'); r = await run(); assert.strictEqual(r.failed, 0, 'stops after 3 failed attempts');
  G.apsGmailSend_ = orig;
  assert.strictEqual(logRows().filter(x => x.Student_Email === S(7) && x.Result === 'AUTO_EMAIL_FAILED').length, 3);
  assert.deepStrictEqual(logRows().filter(x => x.Student_Email === S(7)).map(x => x.Attempt), ['1', '2', '3']);
});
t('re-check until the class ends: student 3 is seen in the Meet later → sent then; Scenario 9 (Meet unknown) never sends', async () => {
  D.set('2026-10-16T23:10:00Z'); mails().length = 0;
  snap = { at: Date.now(), byCourse: {} }; // Meet status unknown for the class
  let r = await run(); assert.strictEqual(r.sent, 0); assert.strictEqual(mails().length, 0);
  assert.strictEqual(lastFor(S(3)).Meet_Status, 'UNKNOWN'); assert.strictEqual(lastFor(S(3)).Reason, 'MEET_STATUS_UNKNOWN', 'r100: its own reason (not "Not Online")');
  meet({ [S(3)]: live() });
  r = await run(); assert.strictEqual(r.sent, 1); assert.deepStrictEqual(mails().map(m => m.to), [S(3)]);
  assert.strictEqual(lastFor(S(3)).Result, 'AUTO_EMAIL_SENT');
  // after the class end (8:00 PM) nothing more happens
  D.set('2026-10-17T00:01:00Z'); meet({ [S(8)]: live() }); mails().length = 0;
  r = await run(); assert.strictEqual(r.evaluated, 0); assert.strictEqual(mails().length, 0);
});
t('Case 5: a Dashboard download after the automatic email keeps both records; monitoring tiles, labels and filters (no key)', async () => {
  D.set('2026-10-16T23:20:00Z'); meet({});
  const cfg = G.examQpConfig_(); // the Dashboard is closed at class start by default — open it to simulate a late download
  env.props.EXAM_QUESTION_PAPER_CLOSE_AT_CLASS_START = 'false';
  const recs = G.examQpReadRecords_(true); const rr = recs.find(x => x.Question_Paper_ID === QP9);
  if (String(rr.Close_At_Class_Start) !== 'false') { rr.Close_At_Class_Start = 'false'; G.examQpTrack_(rr); G.examQpWriteRecords_([rr]); }
  const d2 = await G.downloadExamQuestionPaper(tok(S(2), 'student'), { questionPaperId: QP9, apsId: 'APS3002', confirmed: true, ticket: crypto.randomUUID().replace(/-/g, '') });
  assert.strictEqual(d2.state, 'READY', JSON.stringify(d2).slice(0, 200));
  assert.ok(rows('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT').some(x => cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', x, 'Student_Email') === S(2) && cell('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT', x, 'Download_Status') === 'DOWNLOAD_COMPLETED'));
  assert.strictEqual(lastFor(S(2)).Result, 'AUTO_EMAIL_SENT', 'the automatic email record is kept');
  mails().length = 0; await run(); assert.strictEqual(mails().length, 0);
  const mo = J(G.getExamQuestionPaperMonitoring(admin, { questionPaperId: QP9 }));
  const st = e => mo.students.find(x => x.email === e);
  assert.deepStrictEqual([st(S(2)).status, st(S(2)).autoEmail, st(S(2)).autoEmailLabel], ['DOWNLOADED', 'SENT', 'Auto Email Sent'], 'Dashboard Downloaded + Auto Email Sent');
  assert.strictEqual(st(S(4)).autoEmailLabel, 'Unreported Absence – Email Not Sent');
  assert.strictEqual(st(S(8)).autoEmailLabel, 'Not Online – Email Not Sent');
  assert.strictEqual(st(S(7)).autoEmailLabel, 'Auto Email Failed');
  assert.strictEqual(st(S(1)).autoEmail, '', 'downloaded on time: no automatic-email label');
  assert.deepStrictEqual([mo.tiles.autoSent, mo.tiles.autoNotSent, mo.tiles.autoNotOnline, mo.tiles.autoUnreported], [3, 3, 1, 2], JSON.stringify(mo.tiles));
  ['totalExams', 'eligible', 'downloaded', 'notDownloaded', 'downloadPct', 'failed', 'unauthorized', 'repeated'].forEach(k => assert.ok(k in mo.tiles, k));
  const f = J(G.getExamQuestionPaperMonitoring(admin, { questionPaperId: QP9, downloadStatus: 'AUTO_UA' }));
  assert.deepStrictEqual(f.students.map(x => x.email).sort(), [S(4), S(6)].sort());
  assert.deepStrictEqual(J(G.getExamQuestionPaperMonitoring(admin, { questionPaperId: QP9, downloadStatus: 'AUTO_SENT' })).students.map(x => x.email).sort(), [S(2), S(3), S(9)].sort());
  const keyN = G.examQpDownloadKey_(QP9, S(9));
  const tv = J(G.getExamQuestionPaperMonitoring(tok('tnine_aps709' + DOM, 'teacher'), { questionPaperId: QP9 }));
  assert.strictEqual(tv.students.find(x => x.email === S(9)).autoEmailLabel, 'Auto Email Sent'); assert.ok(!JSON.stringify(tv).includes(keyN), 'the emailed key is not shown to teachers (not downloaded on the Dashboard)');
  assert.ok(!JSON.stringify(J(G.getExamQuestionPaperMonitoring(bod, { questionPaperId: QP9 }))).includes(keyN));
  delete env.props.EXAM_QUESTION_PAPER_CLOSE_AT_CLASS_START; void cfg;
});
t('another exam at 30 minutes is processed on its own schedule (Test 3 / 11): nothing at +20, sent after +30', async () => {
  // second exam for C9 on the same evening with a CUSTOM 7:00 PM start, setting 30 minutes
  D.set('2026-10-16T12:00:00Z');
  const res = J(G.saveExamQuestionPaper(admin, { clientRequestId: 'req-auto-000002', examTitle: 'Oral Examination', examDate: '2026-10-16', courseIds: ['C9'], scheduleMode: 'CUSTOM', startTime: '19:00', endTime: '20:00' }));
  const QPB = res.results[0].questionPaperId; assert.ok(QPB, JSON.stringify(res));
  J(await G.attachExamQuestionPaperLink(admin, { questionPaperIds: [QPB], driveLink: driveLink('SRCAUTO1_abcdefghij') }));
  assert.strictEqual(J(G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: [QPB] })).results[0].status, 'SUCCESS');
  J(G.setExamQuestionPaperAutoEmail(admin, { examId: G.examQpFindRecord_(QPB).Exam_ID, enabled: true, minutes: 30 }));
  const startB = Date.parse('2026-10-16T23:00:00Z');
  const snapB = () => { snap = { at: Date.now(), byCourse: { C9: { startIso: new Date(startB).toISOString(), live: true, sources: [], people: { [S(8)]: { r: 'S', first: startB, last: Date.now(), live: true } } } } }; };
  D.set('2026-10-16T23:20:00Z'); snapB(); mails().length = 0;
  let r = await run(); assert.ok(!mails().some(m => m.to === S(8) && /Oral/.test(JSON.stringify(m.attachments.map(a => a.name)))), 'Oral Examination: not before +30');
  assert.ok(!logRows().some(x => x.Question_Paper_ID === QPB), 'nothing evaluated for the 30-minute exam yet');
  D.set('2026-10-16T23:30:00Z'); snapB(); mails().length = 0;
  r = await run();
  const sentB = logRows().filter(x => x.Question_Paper_ID === QPB && x.Result === 'AUTO_EMAIL_SENT').map(x => x.Student_Email);
  assert.deepStrictEqual(sentB, [S(8)], 'only the student in Meet, for the 30-minute exam');
  assert.strictEqual(logRows().find(x => x.Question_Paper_ID === QPB && x.Student_Email === S(8)).Configured_Minutes, '30');
  const mB = mails().find(x => x.to === S(8) && x.attachments[0].name.indexOf('Oral') === 0);
  assert.ok(mB && mB.htmlBody.includes(G.examQpDownloadKey_(QPB, S(8))), 'key of THIS exam paper');
  assert.notStrictEqual(G.examQpDownloadKey_(QPB, S(8)), G.examQpDownloadKey_(QP9, S(8)), 'a different key per question paper');
  // turning the first exam OFF stops it; the Oral exam keeps its own setting
  J(G.setExamQuestionPaperAutoEmail(admin, { examId: G.examQpFindRecord_(QP9).Exam_ID, enabled: false }));
  assert.deepStrictEqual([G.examQpFindRecord_(QP9, true).Auto_Email_Enabled, G.examQpFindRecord_(QPB, true).Auto_Email_Enabled], ['false', 'true']);
  const n9 = logRows().filter(x => x.Question_Paper_ID === QP9).length;
  meet({ [S(1)]: live(), [S(4)]: live() }); D.set('2026-10-16T23:35:00Z'); mails().length = 0;
  await run(); assert.strictEqual(logRows().filter(x => x.Question_Paper_ID === QP9).length, n9, 'OFF → that exam is no longer evaluated'); assert.ok(!mails().some(m => m.attachments[0].name.indexOf('Unit') === 0));
  J(G.setExamQuestionPaperAutoEmail(admin, { examId: G.examQpFindRecord_(QP9).Exam_ID, enabled: true, minutes: 20 }));
});
t('r100: a Dashboard download whose summary row was skipped (busy lock) still counts as downloaded; a failed log read sends nothing', async () => {
  // a third exam for C9 (custom 7:00 PM) — student 6 downloads with the lock busy: only the event row is written
  D.set('2026-10-16T12:00:00Z');
  const res = J(G.saveExamQuestionPaper(admin, { clientRequestId: 'req-auto-000003', examTitle: 'Listening Test', examDate: '2026-10-16', courseIds: ['C9'], scheduleMode: 'CUSTOM', startTime: '19:00', endTime: '20:00' }));
  const QPC = res.results[0].questionPaperId;
  J(await G.attachExamQuestionPaperLink(admin, { questionPaperIds: [QPC], driveLink: driveLink('SRCAUTO1_abcdefghij') }));
  J(G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: [QPC] }));
  const en = J(G.setExamQuestionPaperAutoEmail(admin, { examId: G.examQpFindRecord_(QPC).Exam_ID, enabled: true, minutes: 20 }));
  assert.strictEqual(en.customTimePapers, 1); assert.ok(/custom date\/time/.test(en.message), 'warns: Meet can only be confirmed in regular class time');
  D.set('2026-10-16T22:50:00Z'); // 6:50 PM — inside the 6:45–7:00 release window
  lockBusy = true;
  const d6 = await G.downloadExamQuestionPaper(tok(S(6), 'student'), { questionPaperId: QPC, apsId: 'APS3006', confirmed: true, ticket: crypto.randomUUID().replace(/-/g, '') });
  lockBusy = false;
  assert.strictEqual(d6.state, 'READY');
  assert.ok(!rows('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY').some(x => cell('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY', x, 'Question_Paper_ID') === QPC && cell('EXAM_QUESTION_PAPER_DOWNLOAD_SUMMARY', x, 'Student_Email') === S(6)), 'summary skipped (busy lock)');
  const startC = Date.parse('2026-10-16T23:00:00Z');
  snap = { at: Date.now(), byCourse: { C9: { startIso: new Date(startC).toISOString(), live: true, sources: [], people: { [S(6)]: { r: 'S', first: startC, last: Date.now() + 1e9, live: true } } } } };
  D.set('2026-10-16T23:21:00Z'); mails().length = 0;
  await run();
  const row6 = logRows().filter(x => x.Question_Paper_ID === QPC && x.Student_Email === S(6)).pop();
  assert.strictEqual(row6.Result, 'NOT_REQUIRED', 'downloaded (from the download events)');
  assert.ok(!mails().some(m => m.to === S(6)), 'never emailed after a Dashboard download');
  // a failed read of the log sheet: the run stops — nothing sent, nothing logged
  const before = rows(LOG).length, ss = G.examQpSpreadsheet_(), orig = ss.getSheetByName.bind(ss);
  ss.getSheetByName = n => { if (n === 'EXAM_QUESTION_PAPER_AUTO_EMAIL_LOG') throw new Error('Service Spreadsheets timed out'); return orig(n); };
  D.set('2026-10-16T23:26:00Z'); mails().length = 0;
  const r = await run(); ss.getSheetByName = orig;
  assert.ok(/log unavailable/.test(r.skipped), JSON.stringify(r)); assert.strictEqual(mails().length, 0); assert.strictEqual(rows(LOG).length, before);
  // a class added to the existing exam later inherits its setting
  D.set('2026-10-16T12:00:00Z');
  const add = J(G.saveExamQuestionPaper(admin, { clientRequestId: 'req-auto-000004', examId: G.examQpFindRecord_(QP9).Exam_ID, examTitle: 'Unit Test Examination', examDate: '2026-10-16', courseIds: ['C2'] }));
  const nr = G.examQpFindRecord_(add.results[0].questionPaperId, true);
  assert.deepStrictEqual([nr.Auto_Email_Enabled, nr.Auto_Email_Minutes], ['true', '20'], 'inherits ON / 20 minutes');
  D.set('2026-10-16T23:30:00Z');
});
t('locked paper and EXAM_QP_AUTO_EMAIL_ENABLED=false: nothing evaluated or sent; trigger removed when no paper is upcoming', async () => {
  const save = env.stats.mails.length;
  env.props.EXAM_QP_AUTO_EMAIL_ENABLED = 'false';
  D.set('2026-10-16T22:52:00Z');
  assert.deepStrictEqual(J(await G.examQpAutoRun_(new D())), { skipped: 'disabled' });
  delete env.props.EXAM_QP_AUTO_EMAIL_ENABLED;
  J(G.setExamQuestionPaperStatus(admin, { action: 'LOCK', questionPaperIds: [QP9], reason: 'Paper leak check' }));
  meet({ [S(8)]: live() });
  const r = await run(); assert.strictEqual(r.evaluated, 0, 'locked: never delivered'); assert.strictEqual(env.stats.mails.length, save);
  J(G.setExamQuestionPaperStatus(admin, { action: 'UNLOCK', questionPaperIds: [QP9] }));
  D.set('2026-10-25T12:00:00Z');
  await run();
  assert.ok(!env.stats.triggers.some(x => x.fn === 'processExamQuestionPaperAutoEmail'), 'removed: every published paper is past');
});

(async () => {
  await makeSource();
  let passed = 0;
  for (const [name, fn] of tests) { try { await fn(); passed++; console.log('PASS', name); } catch (e) { console.log('FAIL', name); console.log(e && e.stack || e); process.exit(1); } }
  console.log('\nALL ' + passed + ' EXAM QP AUTO EMAIL TESTS PASSED');
})();

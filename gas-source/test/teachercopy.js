// r104 + r123 Teacher Copy tests. End-to-end tests for Examination -> Exam Question Paper (server), using the REAL pdf-lib bundle (PdfLib.gs)
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

// r104 / r123 Teacher Copy fixture: five Saturday 12:00 PM EDT classes (exam 2026-10-17 16:00Z; student release 11:45 AM = 15:45Z), published at different times
const DOM = '@avvaiyarpadasalai.org';
const KAVIYA = 'kaviya_aps993' + DOM, CO = 'coteach_aps994' + DOM, HM = 'hm_aps600' + DOM, OTHER = 'other_aps995' + DOM, OUT = 'outsider@gmail.com';
const COURSES = [
  { id: 'T1', name: 'NILAI 5 - PA | SAT 12:00 - 1:30 PM EST | AY26-27', teachers: [{ name: 'Kaviya Gandhirajan', email: KAVIYA }, { name: 'Co Teacher', email: CO }, { name: 'Head Master', email: HM }], students: [{ name: 'Bala', email: 'bala_aps2002' + DOM }],
    classSupport: [{ email: 'vp_aps650' + DOM, roles: ['VP'], sources: ['COURSE_DESCRIPTION'], member: true }, { email: HM, roles: ['HM'], sources: ['ROOM'], member: true }] }, // r123: class VP / HM → Cc
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
G.apsGmailSend_ = (profile, m) => { if (/^CONFIDENTIAL - /.test(m.subject)) { if (failNext) { failNext = false; return { ok: false, error: 'Gmail API HTTP 500' }; } sent.push({ profile, m: Object.assign({}, m, { to: Array.from(m.to || []), cc: Array.from(m.cc || []) }) }); return { ok: true, mode: 'GMAIL_API' }; } return realSend(profile, m); };
const ids = {};
const MSG = vm.runInContext('EXAM_QP_TCOPY_MSG_', env.ctx);
const audit = () => rows('EXAM_QUESTION_PAPER_AUDIT').map(r => Object.fromEntries(sheet('EXAM_QUESTION_PAPER_AUDIT').data[0].map((h, i) => [h, r[i]])));
const run = () => J(G.examQpTeacherCopyEmailRun_(new D()));
const rec = id => G.examQpReadRecords_(true).find(r => r.Question_Paper_ID === id);
const VP = 'vp_aps650' + DOM, TEMP = 'temp_aps777' + DOM;
const runP = async () => J(await G.examQpTeacherCopyEmailRun_(new D()));
const flags = tokn => J(G.getExamQuestionPaperMonitoring(tokn, {})).papers.map(p => ({ cls: p.className.split(' |')[0], show: p.tcopyShow, can: p.tcopyCanUse, why: p.tcopyBlockReason, staff: p.staffCanUse, staffWhy: p.staffBlockReason }));

t('setup: Model Examination for 5 classes (Sat 12:00 PM); T1/T5 published Fri 6 AM, T2 Fri 12 PM, T3 Fri 12:01 PM, T4 never; Temp Teacher on T2 for the exam date', async () => {
  await makeSource();
  at('2026-10-15T16:00:00Z'); // Thu noon
  const res = J(G.saveExamQuestionPaper(admin, { clientRequestId: 'req-tcopy-00001', examTitle: 'Model Examination', examDate: '2026-10-17', courseIds: ['T1', 'T2', 'T3', 'T4', 'T5'] }));
  res.results.forEach(r => { ids[COURSES.find(c => r.className.indexOf(c.name.split(' |')[0]) === 0).id] = r.questionPaperId; });
  assert.strictEqual(Object.keys(ids).length, 5, JSON.stringify(res));
  drive.src.SRCTCOPY1_abcdefghij = { name: 'model.pdf', bytes: Array.from(Buffer.from(SOURCE_B64, 'base64')) };
  J(await G.attachExamQuestionPaperLink(admin, { questionPaperIds: Object.values(ids), driveLink: driveLink('SRCTCOPY1_abcdefghij') }));
  // Temp Teacher: T2 (ACTIVE, covers Sat), another one on T2 that ended before the exam, one SCHEDULED on T4 (never published)
  const tt = env.wb.insertSheet(G.TTM_SHEET_); tt.maxCols = 40; tt.data[0] = G.TTM_HEADER_.slice();
  const ttRow = o => G.TTM_HEADER_.map(h => (h in o ? o[h] : ''));
  tt.data.push(ttRow({ Assignment_ID: 'TT1', Classroom_ID: 'T2', Temp_Teacher_Name: 'Temp Teacher', Temp_Teacher_Email: TEMP, Start_Date: '2026-10-16', Removal_Date: '2026-10-18', Status: 'ACTIVE' }),
    ttRow({ Assignment_ID: 'TT2', Classroom_ID: 'T2', Temp_Teacher_Name: 'Old Temp', Temp_Teacher_Email: 'oldtemp_aps778' + DOM, Start_Date: '2026-10-01', Removal_Date: '2026-10-10', Status: 'REMOVED' }),
    ttRow({ Assignment_ID: 'TT3', Classroom_ID: 'T2', Temp_Teacher_Name: 'Later Temp', Temp_Teacher_Email: 'latertemp_aps779' + DOM, Start_Date: '2026-10-20', Removal_Date: '2026-10-25', Status: 'SCHEDULED' }));
  const pub = (id, iso) => { at(iso); const p = J(G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: [id] })); assert.strictEqual(p.results[0].status, 'SUCCESS', JSON.stringify(p)); };
  pub(ids.T1, '2026-10-16T10:00:00Z'); pub(ids.T5, '2026-10-16T10:00:00Z'); // Fri 6:00 AM
  assert.ok(env.stats.triggers.some(x => x.fn === 'processExamQuestionPaperAutoEmail'), 'the existing 5-minute run is installed (student toggle OFF) for the Teacher Copy email');
  assert.strictEqual(env.stats.triggers.filter(x => x.fn === 'processExamQuestionPaperAutoEmail').length, 1, 'one trigger, never one per exam');
  assert.strictEqual(rec(ids.T4).Status !== 'PUBLISHED', true);
});
t('r123 email timing: nothing before 24 h before the student release (Fri 11:45 AM EDT); then ONE email per class — To teachers, Cc class VP / HM, PDF attached', async () => {
  sent.length = 0;
  at('2026-10-16T15:44:00Z'); assert.strictEqual((await runP()).sent, 0, '24 h 1 min before release: not yet');
  at('2026-10-16T15:45:00Z'); const r = await runP();
  assert.strictEqual(r.sent, 1, JSON.stringify(r)); assert.strictEqual(sent.length, 1, 'T1 only (T2/T3 not published yet; T5 has no teacher and no VP / HM)');
  const m = sent[0].m;
  fs.writeFileSync(__dirname + '/r123_teacher_copy_email.html', m.html); // sample for the architecture doc / review
  assert.strictEqual(sent[0].profile, 'TICKETS'); assert.strictEqual(G.apsMailFrom_('TICKETS'), 'donotreply@avvaiyarpadasalai.org');
  assert.deepStrictEqual(m.to.slice().sort(), [CO, KAVIYA].sort(), 'both class teachers in To; never the HM account as a teacher');
  assert.deepStrictEqual(m.cc.slice().sort(), [HM, VP].sort(), 'class VP + HM in Cc');
  assert.strictEqual(m.subject, 'CONFIDENTIAL - Model Examination - NILAI 5 - PA | SAT 12:00 - 1:30 PM EST - TEACHER COPY');
  assert.strictEqual(m.attachments.length, 1, 'PDF attached');
  const b64 = Buffer.from(m.attachments[0].getBytes().map(b => b & 255)).toString('base64');
  const txt = pdfText(b64, 1); assert.ok(txt.includes('TEACHER COPY - NILAI 5 - PA'), txt.slice(0, 300)); assert.ok(!txt.includes('DOWNLOAD KEY'), 'no student key');
  assert.strictEqual(pdfPages(b64), 3, 'every page kept');
  assert.ok(/^TEACHER_COPY_/.test(m.attachments[0].getName()));
  ['🔴 இரகசியம் — யாருடனும் பகிர வேண்டாம்', 'CONFIDENTIAL — DO NOT SHARE', 'அன்புள்ள Kaviya Gandhirajan, Co Teacher அவர்களுக்கு,', 'வணக்கம்!', 'PDF ஆக இணைக்கப்பட்டுள்ளது',
   'நகல் / Copy to (VP / HM)', VP + ' (VP)', HM + ' (HM)', 'பகிரவோ, அனுப்பவோ, படம் எடுக்கவோ', 'UNIQUE DOWNLOAD KEY', '10/17/2026 12:00 PM EST', '10/17/2026 11:45 AM EST',
   'APS தொழில்நுட்ப உதவிக் குழு', '>English<', 'Dear Kaviya Gandhirajan, Co Teacher,', 'is <b>attached</b>', 'Do not share, forward, copy, screenshot or upload it.', 'Confidentiality Notice'].forEach(x => assert.ok(m.html.includes(x), 'html: ' + x));
  assert.ok(!m.html.includes('Teacher Copy on the APS Dashboard') && !/available from/.test(m.html), 'no Dashboard download section');
  assert.ok(!m.html.includes('/dev') && m.html.includes(G.ctaDashboardUrl_()), 'button: the public Dashboard address, never the editor /dev link');
  assert.ok(m.html.indexOf('வணக்கம்') < m.html.indexOf('>English<'), 'Tamil first, then English');
  ['இரகசியம்', 'இணைக்கப்பட்டுள்ளது', 'English', 'Dear Kaviya Gandhirajan, Co Teacher,', 'Copy to (VP / HM): '].forEach(x => assert.ok(m.text.includes(x), 'text: ' + x));
  assert.ok(!/Teacher Copy on the APS Dashboard/.test(m.text));
  const a = audit().filter(x => x.Event_Type === 'TEACHER_COPY_EMAIL_SENT'); assert.strictEqual(a.length, 1);
  assert.ok(/kaviya/.test(a[0].Metadata) && /vp_aps650.*\(VP\)/.test(a[0].Metadata) && /"attached":true/.test(a[0].Metadata), a[0].Metadata);
  const tr = rec(ids.T1); assert.deepStrictEqual(tr.Teacher_Copy_Email_Sent_To.split(',').sort(), [CO, HM, KAVIYA, VP].sort()); assert.ok(/^v1\|/.test(tr.Teacher_Copy_Email_Version));
  assert.ok(audit().some(x => x.Event_Type === 'TEACHER_COPY_EMAIL_SKIPPED' && x.Question_Paper_ID === ids.T5 && /No assigned teacher/.test(x.Reason)), 'T5: no teacher, no VP / HM → logged, not sent');
});
t('r123 published later than 24 h before release (T2 at 12:00 PM, T3 at 12:01 PM Fri): emailed on the next 5-minute run; the Temp Teacher of the exam date is in To', async () => {
  sent.length = 0;
  at('2026-10-16T16:00:00Z'); J(G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: [ids.T2] }));
  at('2026-10-16T16:01:00Z'); J(G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: [ids.T3] }));
  at('2026-10-16T16:05:00Z'); const r = await runP();
  assert.strictEqual(r.sent, 2, JSON.stringify(r));
  const m2 = sent.find(x => x.m.subject.includes('NILAI 5 - PB')).m, m3 = sent.find(x => x.m.subject.includes('NILAI 5 - PC')).m;
  assert.deepStrictEqual(m2.to.slice().sort(), [OTHER, TEMP].sort(), 'class teacher + the Temp Teacher assigned on the exam date (not the ended / later ones)');
  assert.deepStrictEqual(m2.cc, [], 'no VP / HM on this class');
  assert.ok(m2.html.includes('Other Teacher, Temp Teacher'));
  assert.deepStrictEqual(m3.to, ['third_aps996' + DOM], 'non-APS co-teacher never emailed');
  assert.ok(audit().some(x => x.Event_Type === 'TEACHER_COPY_EMAIL_SKIPPED' && /no APS email/.test(x.Reason) && x.Question_Paper_ID === ids.T3), 'non-APS address logged');
  assert.ok(/temp_aps777.*temp teacher/.test(audit().filter(x => x.Event_Type === 'TEACHER_COPY_EMAIL_SENT').find(x => x.Question_Paper_ID === ids.T2).Metadata));
});
t('r123 idempotent: runs again, a stale admin edit and expired claims → still one email per class', async () => {
  const n = sent.length;
  at('2026-10-16T16:10:00Z'); await runP(); await runP();
  const stale = rec(ids.T1); stale.Teacher_Copy_Email_Sent_To = ''; stale.Teacher_Copy_Email_Sent_At = ''; stale.Teacher_Copy_Email_Version = ''; G.examQpTrack_(stale); G.examQpWriteRecords_([stale]);
  assert.ok(rec(ids.T1).Teacher_Copy_Email_Sent_To.includes(KAVIYA) && rec(ids.T1).Teacher_Copy_Email_Version, 'tracking kept by the writer');
  Object.keys(env.cache).filter(k => /^eqtc/.test(k)).forEach(k => delete env.cache[k]);
  at('2026-10-16T16:15:00Z'); await runP();
  assert.strictEqual(sent.length, n, 'no duplicate');
});
t('r123 a teacher added later gets their own copy (no Cc again); a send failure is logged and retried on the next run', async () => {
  const c1 = COURSES[0]; c1.teachers.push({ name: 'New Teacher', email: 'newt_aps998' + DOM });
  cs.data[1][17] = JSON.stringify(c1); G.invalidateCoursesMemo_();
  failNext = true; at('2026-10-16T18:00:00Z'); await runP();
  assert.ok(audit().some(a => a.Event_Type === 'TEACHER_COPY_EMAIL_FAILED' && a.Question_Paper_ID === ids.T1 && /HTTP 500/.test(a.Reason)), 'failure logged');
  const n = sent.length; await runP();
  assert.strictEqual(sent.length, n + 1, 'retried'); const m = sent.at(-1).m;
  assert.deepStrictEqual(m.to, ['newt_aps998' + DOM]); assert.deepStrictEqual(m.cc, [], 'VP / HM already have it');
  assert.ok(m.attachments && m.attachments.length === 1);
  await runP(); assert.strictEqual(sent.length, n + 1, 'then never again');
});
t('r123 a replaced PDF sends an UPDATED copy to everyone (teachers + VP / HM)', async () => {
  drive.src.SRCTCOPY2_abcdefghij = { name: 'model_v2.pdf', bytes: Array.from(Buffer.from(SOURCE_B64, 'base64')) };
  at('2026-10-16T20:00:00Z');
  const rep = J(await G.attachExamQuestionPaperLink(admin, { questionPaperIds: [ids.T1], driveLink: driveLink('SRCTCOPY2_abcdefghij'), reason: 'Corrected question 4' }));
  assert.strictEqual(rep.results[0].status, 'SUCCESS', JSON.stringify(rep));
  if (rec(ids.T1).Status !== 'PUBLISHED') J(G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: [ids.T1] }));
  const n = sent.length; await runP();
  const m = sent.slice(n).find(x => x.m.subject.includes('NILAI 5 - PA'));
  assert.ok(m, 'updated email sent'); assert.ok(/^CONFIDENTIAL - UPDATED - /.test(m.m.subject), m.m.subject);
  assert.deepStrictEqual(m.m.to.slice().sort(), [CO, KAVIYA, 'newt_aps998' + DOM].sort()); assert.deepStrictEqual(m.m.cc.slice().sort(), [HM, VP].sort());
  assert.ok(m.m.html.includes('UPDATED question paper') && m.m.html.includes('திருத்தப்பட்ட வினாத்தாள்'));
  assert.ok(/^v2\|/.test(rec(ids.T1).Teacher_Copy_Email_Version));
});
t('r123 download opens 3 hours before the start (default): 3 h 1 min refused with the exact message, 3 h allowed — no 24-hour publish rule any more', async () => {
  at('2026-10-17T12:59:00Z'); // 8:59 AM EDT
  await assert.rejects(async () => tc(kav, ids.T1), /Teacher Copy will be available from 10\/17\/2026 09:00 AM EST \(3 hours before the exam\)/);
  assert.ok(audit().some(a => a.Event_Type === 'TEACHER_COPY_DENIED' && a.User_Email === KAVIYA), 'denied attempt logged');
  at('2026-10-17T13:00:00Z');
  const r = await tc(kav, ids.T1);
  assert.strictEqual(r.state, 'READY'); assert.ok(/^TEACHER_COPY_/.test(r.fileName));
  const txt = pdfText(r.base64, 1); assert.ok(txt.includes('TEACHER COPY - Kaviya Gandhirajan')); assert.ok(!txt.includes('DOWNLOAD KEY'));
  assert.strictEqual((await tc(co, ids.T1)).state, 'READY', 'co-teacher');
  assert.strictEqual((await tc(admin, ids.T1)).state, 'READY', 'Admin (oversight)');
  assert.strictEqual((await tc(other, ids.T2)).state, 'READY', 'published exactly 24 h before → available');
  assert.strictEqual((await tc(tok('third_aps996' + DOM, 'teacher'), ids.T3)).state, 'READY', 'published 23 h 59 min before → now available too (r123)');
  await assert.rejects(async () => tc(tok('fourth_aps997' + DOM, 'teacher'), ids.T4), /Teacher Copy is unavailable because the examination question paper has not been published\./);
});
t('r123 the download time is an Admin setting (Examination → Settings): 60 min / 4 h apply at once; invalid values and non-Admins refused; audited', async () => {
  const base = { releaseMinutes: 15, closeAtClassStart: true };
  assert.throws(() => G.setExamQuestionPaperDefaults(kav, Object.assign({ teacherCopyOpenMinutes: 60 }, base)), /Only Admin/);
  assert.throws(() => G.setExamQuestionPaperDefaults(hm, Object.assign({ teacherCopyOpenMinutes: 60 }, base)), /Only Admin/);
  assert.throws(() => G.setExamQuestionPaperDefaults(admin, Object.assign({ teacherCopyOpenMinutes: 5 }, base)), /between 15 and 1440/);
  assert.throws(() => G.setExamQuestionPaperDefaults(admin, Object.assign({ teacherCopyOpenMinutes: 90.5 }, base)), /whole number/);
  const s = J(G.setExamQuestionPaperDefaults(admin, Object.assign({ teacherCopyOpenMinutes: 60 }, base)));
  assert.strictEqual(s.teacherCopyOpenMinutes, 60); assert.strictEqual(env.props.EXAM_QP_TEACHER_COPY_OPEN_MINUTES, '60'); assert.strictEqual(s.teacherCopyEmailEnabled, true, 'email setting kept');
  at('2026-10-17T14:59:00Z'); await assert.rejects(async () => tc(kav, ids.T1), /\(1 hour before the exam\)/);
  at('2026-10-17T15:00:00Z'); assert.strictEqual((await tc(kav, ids.T1)).state, 'READY');
  J(G.setExamQuestionPaperDefaults(admin, Object.assign({ teacherCopyOpenMinutes: 240 }, base)));
  at('2026-10-17T12:00:00Z'); assert.strictEqual((await tc(kav, ids.T1)).state, 'READY', '4 h before');
  const ctx = J(G.getExamQuestionPaperContext ? G.getExamQuestionPaperContext(admin) : { config: G.examQpConfig_() });
  assert.strictEqual(ctx.config.teacherCopyOpenMinutes, 240, 'the browser gets the setting');
  assert.ok(audit().some(a => a.Event_Type === 'SETTINGS_UPDATED' && /teacherCopyOpenMinutes":240/.test(a.Metadata)));
  J(G.setExamQuestionPaperDefaults(admin, base)); assert.strictEqual(G.examQpTeacherCopyOpenMinutes_(), 240, 'an older page without the field keeps the value');
  env.props.EXAM_QP_TEACHER_COPY_OPEN_MINUTES = 'abc'; assert.strictEqual(G.examQpTeacherCopyOpenMinutes_(), 180, 'bad stored value → default 3 h');
  J(G.setExamQuestionPaperDefaults(admin, Object.assign({ teacherCopyOpenMinutes: 180 }, base)));
});
t('Dashboard flags: button only for assigned teachers + Admin; HM sees none; reason shows the configured time; Send to Student opens at the same time', () => {
  at('2026-10-17T12:00:00Z'); // 8:00 AM EDT, before 3 h
  const k = flags(kav).find(x => x.cls === 'NILAI 5 - PA'); assert.ok(k.show && !k.can && /3 hours before the exam/.test(k.why), JSON.stringify(k));
  const h0 = flags(hm); assert.ok(h0.some(x => /Available from 10\/17\/2026 09:00 AM EST \(3 hours before the exam\)/.test(x.staffWhy || '')), 'r123: Send to Student opens 3 h before the start too');
  at('2026-10-17T13:30:00Z');
  const k2 = flags(kav).find(x => x.cls === 'NILAI 5 - PA'); assert.ok(k2.show && k2.can);
  const a = flags(admin); assert.ok(a.every(x => x.show)); assert.ok(a.find(x => x.cls === 'NILAI 5 - PC').can, 'T3 (published < 24 h before) available');
  const h = flags(hm); assert.ok(h.length && h.every(x => x.show === false), 'HM: no Teacher Copy button');
  assert.ok(h.some(x => x.staff === true), 'r123: HM can Send to Student 3 h before (after 9:00 AM)');
  assert.throws(() => G.getExamQuestionPaperMonitoring(bala, {}), /not authorized/, 'students never get the staff view');
});
t('r123 Send to Student: class teacher, class VP, HM and Admin can email a student their paper from 3 hours before the start; earlier, other classes, BOD and students refused', async () => {
  const VPT = tok(VP, 'teacher'); // the class VP (Class Support on T1) signs in as a teacher
  const send = (token, id, email) => G.sendExamQuestionPaperToStudent(token, { questionPaperId: id, studentEmail: email, confirmed: true, requestId: 'R' + crypto.randomUUID().replace(/-/g, '').slice(0, 20) });
  const BALA = 'bala_aps2002' + DOM;
  at('2026-10-17T12:59:00Z'); // 8:59 AM EDT — 3 h 1 min before
  let r = J(await send(kav, ids.T1, BALA)); assert.strictEqual(r.status, 'FAILED'); assert.ok(/Available from 10\/17\/2026 09:00 AM EST \(3 hours before the exam\)/.test(r.message), r.message);
  at('2026-10-17T13:00:00Z'); // 9:00 AM EDT
  const mails = env.stats.mails, n0 = mails.length;
  for (const [who, token] of [['class teacher', kav], ['class VP', VPT], ['HM', hm], ['Admin', admin]]) {
    r = J(await send(token, ids.T1, BALA)); assert.strictEqual(r.status, 'SENT', who + ': ' + JSON.stringify(r));
  }
  assert.strictEqual(mails.length, n0 + 4, 'four emails to the student');
  assert.ok(mails.slice(n0).every(m => m.to === BALA && m.attachments && m.attachments.length === 1), 'the student\'s own PDF');
  r = J(await send(other, ids.T1, BALA)); assert.strictEqual(r.status, 'FAILED'); assert.ok(/not authorized/.test(r.message), 'another class teacher');
  assert.throws(() => send(bod, ids.T1, BALA), /Only Teacher, VP, HM and Admin/);
  assert.throws(() => send(bala, ids.T1, BALA), /Only Teacher, VP, HM and Admin/);
});
t('r123 Send to Student time is its own Admin setting: 60 min moves only Send to Student (Teacher Copy stays 3 h); validated; non-Admin refused', async () => {
  const base = { releaseMinutes: 15, closeAtClassStart: true, teacherCopyOpenMinutes: 180 };
  assert.throws(() => G.setExamQuestionPaperDefaults(kav, Object.assign({ sendOpenMinutes: 60 }, base)), /Only Admin/);
  assert.throws(() => G.setExamQuestionPaperDefaults(admin, Object.assign({ sendOpenMinutes: 10 }, base)), /Send to Student time must be a whole number of minutes between 15 and 1440/);
  const s = J(G.setExamQuestionPaperDefaults(admin, Object.assign({ sendOpenMinutes: 60 }, base)));
  assert.strictEqual(s.sendOpenMinutes, 60); assert.strictEqual(s.teacherCopyOpenMinutes, 180); assert.strictEqual(env.props.EXAM_QP_SEND_TO_STUDENT_OPEN_MINUTES, '60');
  at('2026-10-17T13:30:00Z'); // 9:30 AM EDT: Teacher Copy open (3 h), Send to Student not yet (1 h → 11:00 AM)
  const f = J(G.getExamQuestionPaperMonitoring(kav, {})).papers.find(p => p.className.indexOf('NILAI 5 - PA') === 0);
  assert.ok(f.tcopyCanUse, 'Teacher Copy unchanged'); assert.strictEqual(f.staffCanUse, false);
  assert.ok(/Available from 10\/17\/2026 11:00 AM EST \(1 hour before the exam\)/.test(f.staffBlockReason), f.staffBlockReason);
  assert.ok(audit().some(a => a.Event_Type === 'SETTINGS_UPDATED' && /sendOpenMinutes":60/.test(a.Metadata)));
  J(G.setExamQuestionPaperDefaults(admin, { releaseMinutes: 15, closeAtClassStart: true })); assert.strictEqual(G.examQpSendOpenMinutes_(), 60, 'an older page keeps it');
  J(G.setExamQuestionPaperDefaults(admin, Object.assign({ sendOpenMinutes: 180 }, base)));
  assert.strictEqual(J(G.getExamQuestionPaperMonitoring(kav, {})).papers.find(p => p.className.indexOf('NILAI 5 - PA') === 0).staffCanUse, true, 'back to 3 h');
});
t('Tests 5/6/7: student, parent, authorized user, HM not teaching, other class teacher, BOD → denied (server-side) and logged', async () => {
  at('2026-10-17T15:05:00Z');
  const n0 = audit().length;
  await assert.rejects(async () => tc(bala, ids.T1), /You are not authorized to access this Teacher Copy\./, 'student');
  await assert.rejects(async () => tc(parent, ids.T1), /not authorized|Access denied|not allowed/i, 'parent');
  await assert.rejects(async () => tc(authorized, ids.T1), /not authorized|Access denied|not allowed/i, 'authorized');
  await assert.rejects(async () => tc(bod, ids.T1), /You are not authorized to access this Teacher Copy\./, 'BOD');
  await assert.rejects(async () => tc(other, ids.T1), /Teacher Copy is unavailable because you are not assigned to this examination\./, 'other class teacher');
  await assert.rejects(async () => tc(hm, ids.T1), /not assigned to this examination/, 'HM account (hidden staff) listed on the class is not its teacher');
  await assert.rejects(async () => tc(tok(TEMP, 'teacher'), ids.T2), /not assigned to this examination/, 'the Temp Teacher gets the paper by email; the Dashboard download follows the Classroom roster (unchanged)');
  assert.ok(audit().slice(n0).filter(a => a.Event_Type === 'UNAUTHORIZED_DOWNLOAD_ATTEMPT' && a.Result === 'TEACHER_COPY_REFUSED').length >= 4, 'unauthorized attempts logged');
});
t('ticket polling: only the requesting assigned teacher, single use; another teacher or a student cannot fetch it', async () => {
  const ticket = crypto.randomUUID().replace(/-/g, '');
  await G.downloadExamQuestionPaperTeacherCopy(kav, { questionPaperId: ids.T1, ticket });
  assert.strictEqual(J(G.fetchExamQuestionPaperDownload(other, ticket)).state, 'FAILED');
  assert.strictEqual(J(G.fetchExamQuestionPaperDownload(bala, ticket)).state, 'FAILED');
  const f = J(G.fetchExamQuestionPaperDownload(kav, ticket)); assert.strictEqual(f.state, 'READY'); assert.ok(f.base64.length > 100);
  assert.strictEqual(J(G.fetchExamQuestionPaperDownload(kav, ticket)).state, 'FAILED', 'single use');
});
t('r123 email OFF (Admin setting): nothing sent; ON again: resumes', async () => {
  const base = { releaseMinutes: 15, closeAtClassStart: true, teacherCopyOpenMinutes: 180 };
  J(G.setExamQuestionPaperDefaults(admin, Object.assign({ teacherCopyEmailEnabled: false }, base)));
  assert.strictEqual(env.props.EXAM_QP_TEACHER_COPY_EMAIL_ENABLED, 'false');
  const c2 = COURSES[1]; c2.teachers.push({ name: 'Late Teacher', email: 'late_aps999' + DOM }); cs.data[2][17] = JSON.stringify(c2); G.invalidateCoursesMemo_();
  const n = sent.length; at('2026-10-17T15:10:00Z'); const r = await runP();
  assert.strictEqual(sent.length, n); assert.strictEqual(r.pending, false);
  J(G.setExamQuestionPaperDefaults(admin, Object.assign({ teacherCopyEmailEnabled: true }, base)));
  await runP(); assert.strictEqual(sent.length, n + 1); assert.deepStrictEqual(sent.at(-1).m.to, ['late_aps999' + DOM]);
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
t('cancelled or locked: blocked, no email; after the start no email; the trigger is removed when nothing is left (student toggle OFF)', async () => {
  at('2026-10-17T15:20:00Z');
  J(G.setExamQuestionPaperStatus(admin, { action: 'CANCEL', questionPaperIds: [ids.T2], reason: 'Exam moved to next week for this class' }));
  await assert.rejects(async () => tc(other, ids.T2), /cancelled/);
  J(G.setExamQuestionPaperStatus(admin, { action: 'LOCK', questionPaperIds: [ids.T1], reason: 'Checking a printing problem' }));
  await assert.rejects(async () => tc(kav, ids.T1), /locked/);
  const nL = sent.length; await runP(); assert.strictEqual(sent.length, nL, 'locked / cancelled: no email');
  J(G.setExamQuestionPaperStatus(admin, { action: 'UNLOCK', questionPaperIds: [ids.T1] }));
  const n = sent.length;
  at('2026-10-17T16:01:00Z'); await runP(); assert.strictEqual(sent.length, n, 'after the start: no email');
  env.props.EXAM_QP_AUTO_EMAIL_ENABLED = 'false';
  G.ScriptApp.getProjectTriggers = (orig => () => orig().map(x => Object.assign(x, { getUniqueId: () => 'u-' + x.getHandlerFunction() })))(G.ScriptApp.getProjectTriggers);
  await G.processExamQuestionPaperAutoEmail({ triggerUid: 'u-processExamQuestionPaperAutoEmail' });
  assert.ok(!env.stats.triggers.some(x => x.fn === 'processExamQuestionPaperAutoEmail'), 'removed: nothing pending');
  delete env.props.EXAM_QP_AUTO_EMAIL_ENABLED;
});
t('r123 sendTeacherCopyNowForDates (editor, owner only): sends now for the chosen exam dates, no 24-h wait; started / locked not sent; safe to run again; email switch OFF does not block it', async () => {
  at('2026-10-17T16:30:00Z'); // Sat 12:30 PM EDT — the 10/17 exams have started
  const res = J(G.saveExamQuestionPaper(admin, { clientRequestId: 'req-tcopy-00024', examTitle: 'Unit Test', examDate: '2026-10-24', courseIds: ['T1', 'T2', 'T3'] }));
  const nid = {}; res.results.forEach(r => { nid[COURSES.find(c => r.className.indexOf(c.name.split(' |')[0]) === 0).id] = r.questionPaperId; });
  J(await G.attachExamQuestionPaperLink(admin, { questionPaperIds: Object.values(nid), driveLink: driveLink('SRCTCOPY1_abcdefghij') }));
  J(G.setExamQuestionPaperStatus(admin, { action: 'PUBLISH', questionPaperIds: Object.values(nid) }));
  J(G.setExamQuestionPaperStatus(admin, { action: 'LOCK', questionPaperIds: [nid.T3], reason: 'Printing check for this class' }));
  env.props.EXAM_QP_TEACHER_COPY_EMAIL_ENABLED = 'false'; // even with the automatic email OFF
  assert.strictEqual((await runP()).sent, 0, 'automatic run: OFF, and 7 days before anyway');
  env.stats.activeUser = 'someone_aps1@avvaiyarpadasalai.org';
  assert.throws(() => G.sendTeacherCopyNowForDates(['2026-10-24']), /Access denied/, 'not the script owner');
  delete env.stats.activeUser;
  assert.throws(() => G.sendTeacherCopyNowForDates(['24/10/2026']), /must look like 2026-11-14/);
  const n = sent.length;
  const msg = await G.sendTeacherCopyNowForDates(['2026-10-17', '2026-10-24']);
  const mine = sent.slice(n).map(x => x.m);
  assert.strictEqual(mine.length, 2, msg); assert.ok(mine.every(m => /Unit Test/.test(m.subject) && m.attachments && m.attachments.length === 1));
  const a1 = mine.find(m => m.subject.includes('NILAI 5 - PA')); assert.deepStrictEqual(a1.cc.slice().sort(), [HM, VP].sort()); assert.ok(a1.to.includes(KAVIYA));
  assert.ok(!mine.some(m => m.subject.includes('NILAI 5 - PC')), 'locked: not sent');
  assert.ok(/classes emailed: 2/.test(msg) && /exam already started \(not sent\): \d/.test(msg) && /locked \(not sent\): 1/.test(msg), msg);
  await G.sendTeacherCopyNowForDates(['2026-10-24']); assert.strictEqual(sent.length, n + 2, 'run again: nothing twice');
  const d0 = []; const realFmt = G.Utilities.formatDate; // default dates = today + 2 days (APS time zone)
  await G.sendTeacherCopyNowForDates(); assert.strictEqual(sent.length, n + 2, 'default (10/17–10/19): nothing new');
  assert.ok(audit().some(x => x.Event_Type === 'SETTINGS_UPDATED' && /send now/.test(x.Reason) && /2026-10-17","2026-10-18","2026-10-19/.test(x.Metadata)), 'default dates logged');
  void d0; void realFmt;
  delete env.props.EXAM_QP_TEACHER_COPY_EMAIL_ENABLED;
});
t('student download is unchanged: own key, no Teacher Copy path; Teacher Copy has no key', async () => {
  at('2026-10-17T15:50:00Z');
  const g = tok('guna_aps2005' + DOM, 'student');
  const mine = J(G.getMyExamQuestionPapers(g)).papers; assert.ok(mine.length >= 1);
  assert.ok(!JSON.stringify(mine).includes('tcopy'), 'no Teacher Copy fields for students');
});

(async () => {
  let fails = 0;
  for (const [n, fn] of tests) { try { await fn(); console.log('PASS ' + n); } catch (e) { fails++; console.log('FAIL ' + n + '\n   ' + String(e.stack || e).split('\n').slice(0, 4).join('\n   ')); } }
  console.log(`${tests.length - fails}/${tests.length} passed`); process.exit(fails ? 1 : 0);
})();

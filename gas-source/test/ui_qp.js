// Browser (Chromium) end-to-end test: Examination -> Exam Question Paper, against the real Code.gs + PdfLib.gs.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert'); const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { makeContext, Sheet } = require('./gasmock');
function fixedDate(iso) { let NOW = new Date(iso).getTime(); class D extends Date { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } static set(i) { NOW = new Date(i).getTime(); } } return D; }
const RangeProto = Object.getPrototypeOf(new Sheet('x').getRange(1, 1, 1, 1));
RangeProto.getDisplayValues = function () { return this.getValues().map(r => r.map(v => String(v))); };
Sheet.prototype.getMaxRows = function () { return 1000; };
const D = fixedDate('2026-10-16T21:00:00Z'); // Fri Oct 16 2026, 5:00 PM EDT
const env = makeContext({ Date: D, props: { LIVE_QUESTION_PAPER_SPREADSHEET_ID: '1hxcZ4I9OyR-YVN1qysdUCL36q0b3HfFpaqH6qgprkHY', EXAM_QUESTION_PAPER_STUDENT_TEACHER_ACCESS: 'true' } });
const U = env.ctx.Utilities, f0 = U.formatDate;
U.formatDate = (d, tz, p) => {
  const words = [];
  let out = p.replace(/EEEE|MMMM/g, tok => { words.push(new Intl.DateTimeFormat('en-US', tok === 'EEEE' ? { timeZone: tz, weekday: 'long' } : { timeZone: tz, month: 'long' }).format(d)); return '§' + (words.length - 1) + '§'; });
  out = out.includes('hh') ? f0(d, tz, out.replace('hh', '¶')).replace('¶', f0(d, tz, 'h').padStart(2, '0')) : f0(d, tz, out);
  return out.replace(/§(\d+)§/g, (m, i) => words[Number(i)]);
};
U.getUuid = () => crypto.randomUUID();
U.base64EncodeWebSafe = s => Buffer.from(Array.isArray(s) ? s.map(b => b & 255) : String(s)).toString('base64url');
U.base64Encode = b => Buffer.from(Array.isArray(b) ? b.map(x => x & 255) : String(b)).toString('base64');
U.base64Decode = s => Array.from(Buffer.from(String(s), 'base64')).map(b => b > 127 ? b - 256 : b);
U.DigestAlgorithm = { SHA_256: 'sha256' };
U.computeDigest = (alg, s) => Array.from(crypto.createHash('sha256').update(String(s)).digest()).map(b => b > 127 ? b - 256 : b);
U.newBlob = (bytes, mime, name) => ({ bytes: bytes.slice(), name, getBytes() { return this.bytes.slice(); }, getName() { return this.name; } });
const drive = { files: {}, folders: {}, seq: 0 };
function mkFolder(name) { const id = 'F' + (++drive.seq); const f = { getId: () => id, getName: () => name, createFolder: n => mkFolder(n), createFile: blob => { const fid = 'DF' + (++drive.seq); drive.files[fid] = { name: blob.getName(), bytes: blob.getBytes() }; return { getId: () => fid }; } }; drive.folders[id] = f; return f; }
env.ctx.DriveApp = { createFolder: n => mkFolder(n), getFolderById: id => { if (!drive.folders[id]) throw new Error('x'); return drive.folders[id]; }, getFileById: id => { const f = drive.files[id]; if (!f) throw new Error('No item with the given ID could be found.'); return { getBlob: () => ({ getBytes: () => f.bytes.slice() }), getName: () => f.name, getMimeType: () => 'application/pdf' }; } };
['Array', 'Object', 'String', 'Number', 'RegExp', 'Error', 'JSON', 'Math', 'parseInt', 'isFinite', 'encodeURIComponent'].forEach(k => delete env.ctx[k]);
vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8') + '\n' + fs.readFileSync(__dirname + '/../PdfLib.gs', 'utf8'), env.ctx);
const COURSES = [
  { id: 'C1', name: 'MAZHALAI - CB | FRI 7:30 - 9:00 PM EST | AY26-27', teachers: [{ name: 'Teacher Mazh', email: 'tmazh_aps700@avvaiyarpadasalai.org' }], students: [{ name: 'Raja Kumar', email: 'raja_aps1234@avvaiyarpadasalai.org' }] },
  { id: 'C2', name: 'NILAI 2 - ED | FRI 6:30 - 8:00 PM EST | AY26-27', teachers: [{ name: 'Teacher Two', email: 'ttwo_aps701@avvaiyarpadasalai.org' }], students: [{ name: 'Bala', email: 'bala_aps2002@avvaiyarpadasalai.org' }, { name: 'Chitra', email: 'chitra_aps2003@avvaiyarpadasalai.org' }] }
];
const cs = env.wb.insertSheet('Courses'); cs.data[0] = new Array(18).fill('h');
COURSES.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify(c); cs.data[i + 1] = row; });
// Source PDF (2 pages) written with the host copy of pdf-lib
const PDFLibHost = require('/tmp/pl/package/dist/pdf-lib.js');
const calls = []; let unwrapPromises = true; let uiKey = '';
(async () => {
  const src = await PDFLibHost.PDFDocument.create(); ['A', 'B'].forEach(x => src.addPage([612, 792]).drawText('QUESTION ' + x, { x: 60, y: 700, size: 18 }));
  const srcBytes = await src.save();
  fs.writeFileSync('/tmp/midterm_nil2.pdf', srcBytes);
  drive.files.SRCPDF_abcdefghij = { name: 'midterm_nil2.pdf', bytes: Array.from(srcBytes).map(b => b > 127 ? b - 256 : b) }; // the school's shared Drive file
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  async function open(role, email, viewport) {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 1000 }, acceptDownloads: true }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    env.cache['aps_sess_tok_' + role] = JSON.stringify({ email, role });
    await page.exposeFunction('__gas', async (fn, args) => {
      calls.push(fn);
      try {
        let out = env.ctx[fn].apply(null, args);
        if (out && typeof out.then === 'function') {
          if (!unwrapPromises && fn === 'downloadExamQuestionPaper') { out.catch(() => {}); return JSON.stringify({ ok: {} }); } // runtime that does NOT unwrap promises
          out = await out;
        }
        return JSON.stringify({ ok: out === undefined ? null : out });
      } catch (e) { return JSON.stringify({ err: e.message }); }
    });
    await page.addInitScript(() => {
      function runner(s, f) { return new Proxy({}, { get(_, p) {
        if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
        return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); };
      } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } };
    });
    const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const access = env.ctx.examinationAccessForRole_(role); // what getDashboardData() sends
    await page.evaluate(({ role, email, access }) => {
      apsSessionToken = 'tok_' + role; currentUser = { email, role, name: email, permissions: { buttons: true, filters: true, tabs: true }, examinationAccess: access }; allCourses = [];
      const ov = document.getElementById('apsGateOverlay'); if (ov) ov.style.display = 'none';
      updateAttendanceTabVisibility(); updateExaminationTabVisibility();
    }, { role, email, access });
    return { ctx, page, errors };
  }
  const visible = (page, sel) => page.$eval(sel, e => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length));

  // ---------------- Admin: create + upload + publish
  const A = await open('admin', 'info@avvaiyarpadasalai.org');
  await t('Admin sees Announcements / Classwork / Exam Question Paper sub-tabs', async () => {
    await A.page.click('#tabExamination');
    for (const s of ['announcements', 'classwork', 'questionPaper']) assert.strictEqual(await visible(A.page, '[data-exam-section="' + s + '"]'), true, s);
    await A.page.click('[data-exam-section="questionPaper"]');
    await A.page.waitForFunction(() => examQp.mon && document.getElementById('examQpTiles').children.length > 5);
    assert.strictEqual(await visible(A.page, '#examHistoryCard'), false, 'announcement history hidden on this sub-tab');
    assert.strictEqual(await visible(A.page, '#examQpAddBtn'), true);
  });
  await t('+ Add Exam Question Paper: grade -> class, times from class name, release preview, Google Drive link, Save Draft (double click safe)', async () => {
    const p = A.page;
    await p.click('#examQpAddBtn');
    await p.fill('#examQpTitle', 'Mid-Term Examination');
    await p.fill('#examQpDate', '2026-10-16');
    await p.selectOption('#examQpGrade', 'NILAI 2');
    await p.check('[data-exam-qp-class="C2"]');
    assert.strictEqual(await p.$eval('#examQpStart', e => e.value), '18:30'); assert.strictEqual(await p.$eval('#examQpEnd', e => e.value), '20:00');
    assert.ok((await p.textContent('#examQpFormPreview')).includes('NILAI 2 - ED: release FRI 6:15 PM EST'));
    await p.fill('#examQpDriveLink', 'https://drive.google.com/file/d/SRCPDF_abcdefghij/view?usp=sharing');
    await p.dblclick('#examQpFormSave');
    await p.waitForFunction(() => document.getElementById('examQpForm').hidden && examQp.mon && examQp.mon.papers.length === 1 && examQp.mon.papers[0].hasFile);
    const row = await p.textContent('#examQpPane tbody tr');
    ['Mid-Term Examination', 'NILAI 2 - ED', '06:30 PM EST', '06:15 PM EST', 'midterm_nil2.pdf', 'v1', 'READY'].forEach(x => assert.ok(row.includes(x), x + ' in ' + row));
    assert.strictEqual(calls.filter(c => c === 'saveExamQuestionPaper').length, 1, 'double click -> one save');
  });
  await t('Publish confirmation lists Exam / Class / Class Start / Release / Question Paper / Students Eligible, then publishes', async () => {
    const p = A.page;
    await p.click('[data-exam-qp-act="PUBLISH"]');
    await p.waitForSelector('#examQpModalOverlay.open');
    const body = await p.textContent('#examQpModalBody');
    ['Mid-Term Examination', 'NILAI 2 - ED', '10/16/2026 06:30 PM EST', '10/16/2026 06:15 PM EST', 'midterm_nil2.pdf', 'Students Eligible2'].forEach(x => assert.ok(body.includes(x), x + ' in ' + body));
    assert.strictEqual(await p.textContent('#examQpModalTitle'), 'Publish Question Paper?');
    await p.click('#examQpPubGo');
    await p.waitForFunction(() => examQp.mon && examQp.mon.papers[0].status === 'PUBLISHED');
    assert.ok((await p.textContent('#examQpPane tbody tr')).includes('SCHEDULED'));
    assert.deepStrictEqual(A.errors, []);
  });

  // ---------------- Student
  const S = await open('student', 'bala_aps2002@avvaiyarpadasalai.org');
  await t('Student: Examination tab shows ONLY Exam Question Paper; server-clock countdown; no download link before release', async () => {
    const p = S.page;
    assert.strictEqual(await visible(p, '#tabExamination'), true);
    await p.click('#tabExamination');
    await p.waitForSelector('[data-exam-qp-countdown]');
    for (const s of ['announcements', 'classwork']) assert.strictEqual(await visible(p, '[data-exam-section="' + s + '"]'), false);
    assert.strictEqual(await visible(p, '#examScopeBar'), false); assert.strictEqual(await visible(p, '#examHistoryCard'), false);
    const txt = await p.textContent('#examQpStudentList');
    ['Mid-Term Examination', 'NILAI 2 - ED | FRI 6:30 - 8:00 PM EST | AY26-27', 'Question Paper Available In', 'Question Paper Not Yet Available', 'Friday, October 16, 2026 – 6:15 PM EST'].forEach(x => assert.ok(txt.includes(x), x));
    const c1 = await p.textContent('[data-exam-qp-countdown]');
    assert.ok(/^01:1[45]:\d\d$/.test(c1), 'server says 5:00 PM -> ~1h15m left: ' + c1);
    await p.waitForTimeout(1300);
    assert.notStrictEqual(await p.textContent('[data-exam-qp-countdown]'), c1, 'ticks every second');
    assert.strictEqual(await p.$('[data-exam-qp-download]'), null);
  });
  await t('countdown reaching zero re-asks the server, which then offers the download', async () => {
    const p = S.page;
    D.set('2026-10-16T22:14:57Z'); // server: 3 s before release
    await p.evaluate(() => loadMyExamQuestionPapers());
    await p.waitForFunction(() => /^00:00:0[0-3]$/.test((document.querySelector('[data-exam-qp-countdown]') || {}).textContent || ''));
    D.set('2026-10-16T22:17:00Z'); // 6:17 PM when the browser re-asks
    await p.waitForSelector('[data-exam-qp-download]', { timeout: 8000 });
    assert.ok((await p.textContent('#examQpStudentList')).includes('Question Paper Available'));
  });
  await t('verification: Continue needs APSID + non-sharing checkbox; wrong APSID is rejected server-side and returns to the form', async () => {
    const p = S.page;
    await p.click('[data-exam-qp-download]');
    await p.waitForSelector('#examQpModalOverlay.open');
    assert.strictEqual(await p.textContent('#examQpModalTitle'), 'Confirm Your Information');
    assert.strictEqual(await p.$eval('#examQpVName', e => e.value + '|' + e.readOnly), 'Bala|true');
    const body = await p.textContent('#examQpModalBody');
    ['NILAI 2', 'NILAI 2 - ED | FRI 6:30 - 8:00 PM EST | AY26-27', 'Teacher Two', 'Mid-Term Examination', 'I confirm that I will not share this question paper with any other student.', 'இந்த வினாத்தாளை வேறு எந்த மாணவருடனும் பகிரமாட்டேன்'].forEach(x => assert.ok(body.includes(x), x));
    assert.strictEqual(await p.$eval('#examQpVContinue', b => b.disabled), true);
    await p.fill('#examQpVAps', 'APS9999');
    assert.strictEqual(await p.$eval('#examQpVContinue', b => b.disabled), true, 'checkbox still required');
    await p.check('#examQpVConfirm');
    await p.click('#examQpVContinue');
    assert.strictEqual(await p.textContent('#examQpModalTitle'), 'Please verify your information.');
    assert.ok((await p.textContent('#examQpModalBody')).includes('APS9999'));
    await p.click('#examQpVGo');
    await p.waitForFunction(() => /does not match your student account/.test(document.getElementById('examQpModalBody').textContent));
    assert.strictEqual(await p.textContent('#examQpModalTitle'), 'Confirm Your Information');
  });
  await t('Confirm & Download (runtime that does NOT unwrap promises -> ticket polling) saves a personalized PDF stamped on every page', async () => {
    const p = S.page;
    unwrapPromises = false;
    await p.fill('#examQpVAps', 'aps2002');
    const note = await p.textContent('#examQpModalBody .exam-qp-keynote');
    assert.ok(/DOWNLOAD KEY/.test(note) && /write this key clearly at the top of every answer sheet/.test(note) && /Google Classroom/.test(note), 'students are told about the key before downloading');
    await p.check('#examQpVConfirm');
    await p.click('#examQpVContinue');
    const dlp = p.waitForEvent('download', { timeout: 30000 });
    await p.click('#examQpVGo');
    const d = await dlp;
    unwrapPromises = true;
    assert.strictEqual(d.suggestedFilename(), 'Mid-Term-Examination_NILAI-2-ED_Bala_APS2002_20261016-1817-EST.pdf');
    const file = '/tmp/ui_dl.pdf'; await d.saveAs(file);
    for (const pg of [1, 2]) {
      const txt = execFileSync('pdftotext', ['-f', String(pg), '-l', String(pg), file, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
      ['Student: Bala', 'APSID: APS2002', 'Class: NILAI 2 - ED | FRI 6:30 - 8:00 PM EST | AY26-27', 'Exam: Mid-Term Examination', 'Downloaded: 10/16/2026 06:17 PM EST'].forEach(x => assert.ok(txt.includes(x), 'page ' + pg + ': ' + x));
    }
    assert.ok(calls.includes('fetchExamQuestionPaperDownload'), 'polling path used');
    await p.waitForSelector('#examQpDoneBox:not([hidden])');
    const key = (await p.textContent('#examQpDoneKey')).trim();
    assert.ok(/^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}$/.test(key), key);
    for (const pg of [1, 2]) {
      const txt = execFileSync('pdftotext', ['-f', String(pg), '-l', String(pg), file, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
      assert.strictEqual(txt.split('DOWNLOAD KEY: ' + key).length - 1, 2, 'key at top and bottom of page ' + pg);
    }
    assert.strictEqual(await p.$eval('#examQpDoneKey', e => getComputedStyle(e).color), 'rgb(204, 0, 0)', 'key shown in red');
    assert.ok(parseFloat(await p.$eval('#examQpDoneKey', e => getComputedStyle(e).fontSize)) >= 24, 'large, readable');
    await (await p.$('#examQpDoneBox')).screenshot({ path: __dirname + '/qp_done_key.png' });
    uiKey = key;
    const done = await p.textContent('#examQpDoneBox');
    ['Question Paper Downloaded Successfully', 'Bala', 'APS2002', '10/16/2026 06:17 PM EST', 'Please do not share this question paper with another student.'].forEach(x => assert.ok(done.includes(x), x));
    await p.waitForFunction(() => /Your downloads: 1/.test(document.getElementById('examQpStudentList').textContent));
    assert.ok((await p.textContent('#examQpStudentList')).includes('Your download key: ' + key));
    assert.deepStrictEqual(S.errors, []);
  });

  // ---------------- Teacher
  await t('Class Teacher: only their class; summary block + student table; APSID search', async () => {
    const T = await open('teacher', 'ttwo_aps701@avvaiyarpadasalai.org');
    const p = T.page;
    await p.click('#tabExamination');
    await p.waitForFunction(() => examQp.mon && examQp.mon.scope === 'TEACHER');
    assert.strictEqual(await visible(p, '[data-exam-section="announcements"]'), false);
    assert.strictEqual(await visible(p, '#examQpAdminBar'), false); assert.strictEqual(await visible(p, '#examQpExportBtn'), false);
    await p.click('[data-exam-qp-act="VIEW"]');
    await p.waitForSelector('#examQpFocus:not([hidden])');
    const f = await p.textContent('#examQpFocus');
    ['Mid-Term Examination', 'Published', '06:30 PM EST', '06:15 PM EST', 'Total Students2', 'Downloaded1', 'Not Downloaded1', 'Download Rate50%'].forEach(x => assert.ok(f.includes(x), x + ' in ' + f));
    const tbl = await p.textContent('#examQpPane');
    assert.ok(tbl.includes('Bala') && tbl.includes('Chitra') && !tbl.includes('Raja'));
    await p.fill('#examQpSearch', 'aps2003');
    await p.waitForFunction(() => { const t = document.getElementById('examQpPane').textContent; return t.includes('Chitra') && !t.includes('Bala'); });
    await p.screenshot({ path: __dirname + '/qp_teacher.png', fullPage: false });
    // Teacher verifies a plain-paper answer sheet: types the key written on it (lower-case, no dashes).
    await p.fill('#examQpSearch', uiKey.replace(/-/g, '').toLowerCase());
    await p.waitForFunction(k => { const t = document.getElementById('examQpPane').textContent; return t.includes('Bala') && !t.includes('Chitra') && t.includes(k); }, uiKey);
    assert.deepStrictEqual(T.errors, []);
    await T.ctx.close();
  });
  await t('r67 Teacher: ⬇️ Download Teacher Copy (TEACHER COPY pdf) + 📧 Send to Student with confirmation (Name / APSID / APS Email / Exam / Class); one email even on double click', async () => {
    // r104: the Teacher Copy needs the paper published >= 24 h before the start — this fixture published it at 5 PM on exam day
    const G = env.ctx; G.examQpReadRecords_(true).filter(r => r.Status === 'PUBLISHED').forEach(r => { G.examQpTrack_(r); r.Published_Date_Time = '2026-10-14 12:00:00'; G.examQpWriteRecords_([r]); });
    const T = await open('teacher', 'ttwo_aps701@avvaiyarpadasalai.org');
    const p = T.page;
    await p.click('#tabExamination');
    await p.waitForFunction(() => examQp.mon && examQp.mon.scope === 'TEACHER');
    const tc = await p.$('[data-exam-qp-act="TCOPY"]');
    assert.ok(tc, 'Teacher Copy button'); assert.strictEqual(await tc.isDisabled(), false);
    assert.strictEqual((await tc.textContent()).trim(), '🔒 Download Teacher Copy CONFIDENTIAL');
    // r104: red warning first — Cancel = no download, no server call
    let downloads = 0; p.on('download', () => downloads++);
    const n0 = calls.length;
    await tc.click(); await p.waitForSelector('#examQpTcOverlay.open');
    const warn = await p.textContent('#examQpTcOverlay');
    ['IMPORTANT — CONFIDENTIAL TEACHER COPY', 'ONLY to the assigned APS teacher', 'DO NOT SHARE, FORWARD, SCREENSHOT, COPY, UPLOAD, OR DISTRIBUTE', 'UNIQUE DOWNLOAD KEY', 'confidential until the examination is officially completed', 'By continuing, you confirm'].forEach(x => assert.ok(warn.includes(x), x));
    assert.deepStrictEqual(await p.$$eval('#examQpTcOverlay button', b => b.map(x => x.textContent.trim())), ['Cancel', 'I Understand — Download Teacher Copy']);
    assert.strictEqual(await p.$eval('#examQpTcOverlay .modal', e => getComputedStyle(e).borderTopColor), 'rgb(197, 34, 31)', 'red warning');
    await p.screenshot({ path: __dirname + '/r104_teacher_copy_warning.png' });
    await p.click('#examQpTcCancel'); await p.waitForTimeout(300);
    assert.ok(!(await p.$('#examQpTcOverlay.open')), 'Cancel closes'); assert.strictEqual(downloads, 0, 'Cancel: no download');
    assert.ok(!calls.slice(n0).includes('downloadExamQuestionPaperTeacherCopy'), 'Cancel: nothing requested');
    await tc.click(); await p.waitForSelector('#examQpTcOverlay.open'); // asked again every time
    const dlp = p.waitForEvent('download');
    await p.click('#examQpTcOk');
    const d = await dlp;
    assert.ok(/^TEACHER_COPY_/.test(d.suggestedFilename()), d.suggestedFilename());
    const pdfTxt = execFileSync('pdftotext', [await d.path(), '-'], { encoding: 'utf8' });
    if (process.env.QP_DUMP) fs.copyFileSync(await d.path(), process.env.QP_DUMP + '/teacher_copy.pdf');
    assert.ok(pdfTxt.includes('TEACHER COPY') && pdfTxt.includes('QUESTION A'), 'official paper marked TEACHER COPY');
    await p.click('[data-exam-qp-act="VIEW"]');
    await p.waitForSelector('[data-exam-qp-send]');
    assert.ok((await p.textContent('#examQpPane thead')).includes('Question Paper'));
    env.stats.mails.length = 0;
    const idx = await p.$$eval('[data-exam-qp-send]', bs => bs.findIndex(b => b.closest('tr').textContent.includes('Chitra')));
    await p.click(`[data-exam-qp-send="${idx}"]`);
    await p.waitForSelector('#examQpModalOverlay.open');
    const body = await p.textContent('#examQpModalBody');
    ['Student Name', 'Chitra', 'Student APSID', 'APS2003', 'Student APS Email', 'chitra_aps2003@avvaiyarpadasalai.org', 'Examination Name', 'Mid-Term Examination', 'Class / Grade', 'NILAI 2 - ED'].forEach(x => assert.ok(body.includes(x), x));
    await p.evaluate(() => document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'));
    await p.screenshot({ path: __dirname + '/r67_send_confirm.png', clip: await p.$eval('#examQpModalOverlay .modal', e => { const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: r.width + 20, height: r.height + 20 }; }) });
    await p.$eval('#examQpSendGo', b => { b.click(); b.click(); });
    await p.waitForFunction(() => !document.getElementById('examQpModalOverlay').classList.contains('open'));
    await p.waitForFunction(() => /Question paper sent to Chitra/.test(document.getElementById('toast').textContent));
    assert.strictEqual(env.stats.mails.length, 1, 'one email');
    assert.strictEqual(env.stats.mails[0].to, 'chitra_aps2003@avvaiyarpadasalai.org'); assert.strictEqual(env.stats.mails[0].attachments.length, 1);
    if (process.env.QP_DUMP) { fs.writeFileSync(process.env.QP_DUMP + '/email.html', env.stats.mails[0].htmlBody); fs.writeFileSync(process.env.QP_DUMP + '/student_copy.pdf', Buffer.from(env.stats.mails[0].attachments[0].base64, 'base64')); } // optional: save samples for a visual check
    await p.waitForFunction(() => /Emailed \d{2}\/\d{2}\/\d{4}/.test(document.getElementById('examQpPane').textContent));
    await p.evaluate(() => document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'));
    await p.screenshot({ path: __dirname + '/r67_teacher_students.png', fullPage: false });
    // a second send shows the "already emailed" warning first
    await p.click(`[data-exam-qp-send="${idx}"]`); await p.waitForSelector('#examQpModalOverlay.open');
    assert.ok((await p.textContent('#examQpModalBody')).includes('Already emailed'));
    await p.click('#examQpModalButtons button:first-child'); // Cancel
    assert.strictEqual(env.stats.mails.length, 1, 'cancel sends nothing');
    assert.deepStrictEqual(T.errors, []);
    await T.ctx.close();
  });
  await t('r67 student and BOD: no Teacher Copy / Send buttons; student download screen unchanged; teacher phone layout fits', async () => {
    const S2 = await open('student', 'bala_aps2002@avvaiyarpadasalai.org');
    await S2.page.click('#tabExamination'); await S2.page.waitForSelector('[data-exam-qp-download]');
    assert.strictEqual(await S2.page.$$eval('[data-exam-qp-act="TCOPY"], [data-exam-qp-send]', x => x.length), 0);
    assert.deepStrictEqual(S2.errors, []); await S2.ctx.close();
    const B = await open('vcfo_amchsts_bod', 'bod@amchats.org');
    await B.page.click('#tabExamination'); await B.page.click('[data-exam-section="questionPaper"]');
    await B.page.waitForFunction(() => examQp.mon && examQp.mon.scope === 'ALL');
    assert.strictEqual(await B.page.$$eval('[data-exam-qp-act="TCOPY"]', x => x.length), 0);
    await B.page.click('[data-exam-qp-view="students"]');
    assert.strictEqual(await B.page.$$eval('[data-exam-qp-send]', x => x.length), 0);
    assert.deepStrictEqual(B.errors, []); await B.ctx.close();
    const M = await open('teacher', 'ttwo_aps701@avvaiyarpadasalai.org', { width: 375, height: 780 });
    await M.page.click('#tabExamination'); await M.page.waitForFunction(() => examQp.mon && examQp.mon.scope === 'TEACHER');
    await M.page.click('[data-exam-qp-act="VIEW"]'); await M.page.waitForSelector('[data-exam-qp-send]');
    await M.page.click('[data-exam-qp-send]'); await M.page.waitForSelector('#examQpModalOverlay.open');
    assert.ok(await M.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1, 'no page overflow');
    assert.ok((await M.page.$eval('#examQpModalOverlay .modal', e => e.getBoundingClientRect().width)) <= 375);
    await M.page.click('#examQpModalButtons button:first-child');
    assert.deepStrictEqual(M.errors, []); await M.ctx.close();
  });
  await t('HM: tiles are clickable filters; Export CSV downloads the audit', async () => {
    const H = await open('headmaster', 'hm_aps600@avvaiyarpadasalai.org');
    const p = H.page;
    await p.click('#tabExamination'); await p.click('[data-exam-section="questionPaper"]');
    await p.waitForFunction(() => examQp.mon && examQp.mon.scope === 'ALL');
    assert.strictEqual(await visible(p, '#examQpAddBtn'), false, 'HM view-only by default');
    await p.click('[data-exam-qp-tile="downloaded"]');
    await p.waitForFunction(() => examQp.view === 'students' && document.getElementById('examQpFStatus').value === 'DOWNLOADED' && /Bala/.test(document.getElementById('examQpPane').textContent) && !/Chitra/.test(document.getElementById('examQpPane').textContent));
    await p.click('[data-exam-qp-view="suspicious"]');
    assert.ok((await p.textContent('#examQpPane')).includes('INVALID APSID'));
    const dlp = p.waitForEvent('download');
    await p.click('#examQpExportBtn');
    const d = await dlp;
    assert.ok(/^exam-question-paper-audit_\d{8}-\d{4}\.csv$/.test(d.suggestedFilename()));
    const csv = fs.readFileSync(await d.path(), 'utf8');
    assert.ok(csv.includes('"Bala","APS2002"'));
    await p.click('[data-exam-qp-view="audit"]');
    await p.waitForFunction(() => /QUESTION_PAPER_PUBLISHED/.test(document.getElementById('examQpPane').textContent));
    await p.screenshot({ path: __dirname + '/qp_hm.png', fullPage: false });
    assert.deepStrictEqual(H.errors, []);
    await H.ctx.close();
  });
  await t('mobile 375px student: no horizontal scroll; verification dialog fits', async () => {
    const M = await open('student', 'chitra_aps2003@avvaiyarpadasalai.org', { width: 375, height: 780 });
    const p = M.page;
    await p.click('#tabExamination');
    await p.waitForSelector('[data-exam-qp-download]');
    await p.click('[data-exam-qp-download]');
    await p.waitForSelector('#examQpModalOverlay.open');
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 1, 'overflow ' + over);
    const w = await p.$eval('#examQpModalOverlay .modal', e => e.getBoundingClientRect().width);
    assert.ok(w <= 375, 'modal width ' + w);
    await p.screenshot({ path: __dirname + '/qp_student_mobile.png' });
    assert.deepStrictEqual(M.errors, []);
    await M.ctx.close();
  });
  await t('Admin: Exam Schedule = Custom date & time — one exact date/time for several classes; default mode unchanged', async () => {
    const p = A.page;
    D.set('2026-10-16T21:00:00Z');
    await p.click('#examQpAddBtn');
    assert.strictEqual(await p.$eval('#examQpSchedMode', e => e.value), 'CLASS', 'default = class day & time');
    await p.fill('#examQpTitle', 'Make-up Exam');
    await p.selectOption('#examQpGrade', '');
    await p.check('[data-exam-qp-class="C1"]'); await p.check('[data-exam-qp-class="C2"]');
    assert.strictEqual(await p.$eval('#examQpStart', e => e.disabled), true, 'default mode, 2 classes: times come from each class');
    await p.selectOption('#examQpSchedMode', 'CUSTOM');
    assert.strictEqual(await p.$eval('#examQpStart', e => e.disabled), false);
    assert.ok(/exactly this date/.test(await p.textContent('#examQpDateNote')));
    await p.fill('#examQpDate', '2026-10-24');
    await p.fill('#examQpStart', '10:00');
    await (await p.$('#examQpForm')).screenshot({ path: __dirname + '/qp_custom_form.png' });
    const pv = await p.textContent('#examQpFormPreview');
    assert.ok(pv.includes('Exam Saturday 2026-10-24 at 10:00 AM EST') && pv.includes('release 9:45 AM EST') && pv.includes('2 class(es)'), pv);
    await p.click('#examQpFormSave');
    await p.waitForFunction(() => document.getElementById('examQpForm').hidden && examQp.mon && examQp.mon.papers.filter(x => x.examTitle === 'Make-up Exam').length === 2, null, { timeout: 15000 });
    const mk = await p.evaluate(() => examQp.mon.papers.filter(x => x.examTitle === 'Make-up Exam').map(x => [x.classDate, x.startTime, x.scheduleMode, x.releaseLabel]));
    mk.forEach(x => assert.deepStrictEqual(x, ['2026-10-24', '10:00', 'CUSTOM', '10/24/2026 09:45 AM EST']));
    await p.evaluate(() => { if (document.getElementById('examQpModalOverlay').classList.contains('open')) examQpCloseModal_(); });
    assert.deepStrictEqual(A.errors, []);
  });
  await t('r92 Display Past Exams (default OFF): Teacher, Admin and Student lists hide past exam dates; ON shows them again; no extra server call; today counts as current', async () => {
    const saved = Date.now();
    D.set('2026-10-18T16:00:00Z'); // Sun Oct 18 2026 noon EDT: Mid-Term (Fri 10/16) is past, Make-up (Sat 10/24) is upcoming
    try {
      for (const [role, email] of [['teacher', 'ttwo_aps701@avvaiyarpadasalai.org'], ['admin', 'info@avvaiyarpadasalai.org']]) {
        const X = await open(role, email); const p = X.page;
        await p.click('#tabExamination');
        if (role === 'admin') await p.click('[data-exam-section="questionPaper"]');
        await p.waitForFunction(() => examQp.mon && examQp.mon.papers.some(x => x.examTitle === 'Mid-Term Examination'));
        assert.strictEqual(await p.getAttribute('#examQpPastToggle', 'aria-checked'), 'false', role + ': default OFF');
        let pane = await p.textContent('#examQpPane');
        assert.ok(!pane.includes('Mid-Term Examination') && pane.includes('Make-up Exam'), role + ': past hidden, upcoming shown');
        const tile = () => p.$eval('[data-exam-qp-tile="totalExams"] b', b => b.textContent);
        const offTotal = await tile(), want = await p.evaluate(() => [examQp.mon.tilesCurrent.totalExams, examQp.mon.tiles.totalExams]);
        assert.strictEqual(offTotal, String(want[0]), role + ': OFF tiles = today + upcoming');
        const before = calls.length;
        await p.click('#examQpPastToggle');
        assert.strictEqual(await tile(), String(want[1]), role + ': ON tiles = full history');
        assert.strictEqual(await p.textContent('#examQpViews .exam-qp-past-state'), 'ON');
        pane = await p.textContent('#examQpPane'); assert.ok(pane.includes('Mid-Term Examination') && pane.includes('Make-up Exam'), role + ': ON shows past');
        if (role === 'teacher') await p.screenshot({ path: __dirname + '/r92_past_on_teacher.png' });
        if (role === 'admin') await p.screenshot({ path: __dirname + '/r95_tiles_on_admin.png' });
        await p.click('#examQpPastToggle');
        await p.click('[data-exam-qp-view="students"]');
        pane = await p.textContent('#examQpPane'); assert.ok(!pane.includes('Mid-Term Examination'), role + ': students view follows the toggle');
        assert.strictEqual(calls.slice(before).filter(f => /ExamQuestionPaper/.test(f)).length, 0, role + ': toggle makes no server call');
        await p.click('[data-exam-qp-view="papers"]');
        if (role === 'teacher') await p.screenshot({ path: __dirname + '/r92_past_off_teacher.png' });
        if (role === 'admin') await p.screenshot({ path: __dirname + '/r95_tiles_off_admin.png' });
        assert.deepStrictEqual(X.errors, []); await X.ctx.close();
      }
      const St = await open('student', 'bala_aps2002@avvaiyarpadasalai.org'); const q = St.page;
      await q.click('#tabExamination');
      await q.waitForFunction(() => examQp.student && examQp.student.papers.some(x => x.examTitle === 'Mid-Term Examination'));
      assert.ok(!(await q.textContent('#examQpStudentList')).includes('Mid-Term Examination'), 'student: past hidden by default');
      await q.click('#examQpPastToggleStu');
      assert.ok((await q.textContent('#examQpStudentList')).includes('Mid-Term Examination'), 'student: ON shows the completed exam');
      await q.screenshot({ path: __dirname + '/r92_past_on_student.png' });
      assert.deepStrictEqual(St.errors, []); await St.ctx.close();
      D.set('2026-10-16T23:30:00Z'); // exam day 7:30 PM EDT (after class start): still "today"
      const S2 = await open('student', 'bala_aps2002@avvaiyarpadasalai.org'); await S2.page.click('#tabExamination');
      await S2.page.waitForFunction(() => examQp.student && examQp.student.papers.length);
      assert.ok((await S2.page.textContent('#examQpStudentList')).includes('Mid-Term Examination'), 'exam day stays visible with the toggle OFF');
      await S2.ctx.close();
    } finally { D.set(new Date(saved).toISOString()); }
  });
  await t('r99 "Send Email to Student After X Minutes": Admin panel (OFF by default, validation, Save per exam), 4 new tiles (click → Students filtered), per-student line; Teacher / HM see no panel', async () => {
    const G = env.ctx, recs = G.examQpReadRecords_(true), qp2 = recs.find(r => r.Course_ID === 'C2'), qp1 = recs.find(r => r.Course_ID === 'C1');
    const meta = G.examQpSheet_('EXAM_QUESTION_PAPER_AUTO_EMAIL_LOG', vm.runInContext('EXAM_QP_AUTO_HEADER_', env.ctx));
    const add = (qp, email, name, result, reason) => G.examQpAppendAtomic_(meta, [G.examQpRowFromObject_(meta, { Log_ID: 'EQF-1-' + email.slice(0, 4), Evaluated_Date_Time_EST: '2026-10-16 18:50:00', Exam_ID: qp.Exam_ID, Question_Paper_ID: qp.Question_Paper_ID,
      Course_ID: qp.Course_ID, Class_Name: qp.Class_Name, Student_Name: name, Student_Email: email, Result: result, Reason: reason, Delivery_Method: 'AUTO_EMAIL_FALLBACK' })]);
    add(qp2, 'chitra_aps2003@avvaiyarpadasalai.org', 'Chitra', 'AUTO_EMAIL_SENT', 'NOT_DOWNLOADED_AFTER_CONFIGURED_TIME');
    add(qp1, 'raja_aps1234@avvaiyarpadasalai.org', 'Raja Kumar', 'AUTO_EMAIL_NOT_SENT', 'UNREPORTED_ABSENCE');
    if (qp1.Status !== 'PUBLISHED') { G.examQpTrack_(qp1); qp1.Status = 'PUBLISHED'; G.examQpWriteRecords_([qp1]); } // the C1 paper counts only when published
    // ---- Admin panel
    const Ad = await open('admin', 'info@avvaiyarpadasalai.org'), a = Ad.page;
    await a.click('#tabExamination'); await a.click('[data-exam-section="questionPaper"]');
    await a.waitForFunction(() => examQp.mon && examQp.mon.canManage);
    if (!(await a.evaluate(() => examQp.showPast))) { await a.click('#examQpPastToggle'); await a.waitForTimeout(150); }
    assert.strictEqual(await visible(a, '#examQpAutoBox'), true);
    assert.strictEqual(await a.getAttribute('#examQpAutoToggle', 'aria-checked'), 'false', 'OFF by default');
    assert.strictEqual(await a.inputValue('#examQpAutoMin'), '20');
    assert.ok((await a.textContent('#examQpAutoBox')).includes('Send Email to Student After'));
    await a.click('#examQpAutoToggle'); await a.fill('#examQpAutoMin', '0'); await a.click('#examQpAutoSave');
    assert.ok(/Please enter a valid number of minutes/.test(await a.textContent('#examQpAutoMsg')));
    await a.fill('#examQpAutoMin', '2.5'); await a.click('#examQpAutoSave');
    assert.ok(/Please enter a valid number of minutes/.test(await a.textContent('#examQpAutoMsg')));
    const before = calls.filter(c => c === 'setExamQuestionPaperAutoEmail').length; assert.strictEqual(before, 0, 'invalid input never reaches the server');
    await a.fill('#examQpAutoMin', '25'); await a.click('#examQpAutoSave');
    await a.waitForFunction(() => /ON — 25 minutes/.test(document.getElementById('examQpAutoMsg').textContent));
    const exId = await a.inputValue('#examQpAutoExam');
    assert.ok(G.examQpReadRecords_(true).filter(r => r.Exam_ID === exId).every(r => r.Auto_Email_Enabled === 'true' && r.Auto_Email_Minutes === '25'), 'saved on every class paper of that exam');
    assert.strictEqual(await a.textContent('#examQpAutoState'), '✓ ON');
    await a.waitForFunction(() => /📧 Auto email after 25 min/.test(document.getElementById('examQpPane').textContent));
    await a.evaluate(() => document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'));
    await (await a.$('#examQpAutoBox')).screenshot({ path: __dirname + '/r99_qp_auto_toggle.png' });
    assert.deepStrictEqual(Ad.errors, []); await Ad.ctx.close();
    // ---- HM (monitor only): tiles + labels, no panel
    const H = await open('headmaster', 'hm_aps600@avvaiyarpadasalai.org'), p = H.page;
    await p.click('#tabExamination'); await p.click('[data-exam-section="questionPaper"]');
    await p.waitForFunction(() => examQp.mon && examQp.mon.scope === 'ALL');
    assert.strictEqual(await visible(p, '#examQpAutoBox'), false, 'HM cannot change the setting (existing manage rule)');
    if (!(await p.evaluate(() => examQp.showPast))) { await p.click('#examQpPastToggle'); await p.waitForTimeout(150); }
    const labels = await p.$$eval('#examQpTiles .exam-qp-tile span', x => x.map(e => e.textContent));
    ['Repeated Downloads', 'Automatic Emails Sent', 'Automatic Emails Not Sent', 'Not Online', 'Unreported Absence'].forEach(l => assert.ok(labels.includes(l), l));
    const val = k => p.$eval('[data-exam-qp-tile="' + k + '"] b', b => b.textContent);
    assert.deepStrictEqual([await val('autoSent'), await val('autoNotSent'), await val('autoNotOnline'), await val('autoUnreported')], ['1', '1', '0', '1']);
    await p.click('[data-exam-qp-tile="autoSent"]');
    await p.waitForFunction(() => examQp.view === 'students' && document.getElementById('examQpFStatus').value === 'AUTO_SENT' && /Chitra/.test(document.getElementById('examQpPane').textContent) && !/Raja/.test(document.getElementById('examQpPane').textContent));
    assert.ok((await p.textContent('#examQpPane')).includes('📧 Auto Email Sent · 06:50 PM EST'));
    await p.click('[data-exam-qp-tile="autoUnreported"]');
    await p.waitForFunction(() => /Unreported Absence – Email Not Sent/.test(document.getElementById('examQpPane').textContent));
    await p.selectOption('#examQpFStatus', ''); await p.evaluate(() => loadExamQpMonitoring()); await p.waitForTimeout(400);
    await p.evaluate(() => { examQpSwitchView_('students'); document.querySelectorAll('.aps-tip,#apsTooltip').forEach(e => e.style.display = 'none'); });
    await p.screenshot({ path: __dirname + '/r99_qp_auto_email.png' });
    assert.deepStrictEqual(H.errors, []); await H.ctx.close();
    // ---- Teacher: no panel; phone width has no side scroll with the panel shown to Admin
    const T = await open('teacher', 'ttwo_aps701@avvaiyarpadasalai.org');
    await T.page.click('#tabExamination'); await T.page.click('[data-exam-section="questionPaper"]'); await T.page.waitForFunction(() => !!examQp.mon);
    assert.strictEqual(await visible(T.page, '#examQpAutoBox'), false); await T.ctx.close();
    const Ph = await open('admin', 'info@avvaiyarpadasalai.org', { width: 375, height: 800 });
    await Ph.page.click('#tabExamination'); await Ph.page.click('[data-exam-section="questionPaper"]'); await Ph.page.waitForFunction(() => examQp.mon && !document.getElementById('examQpAutoBox').hidden);
    assert.ok(await Ph.page.$eval('#examQpAutoBox', e => e.scrollWidth <= e.clientWidth + 1), 'panel fits a phone'); await Ph.ctx.close();
  });
  await A.ctx.close(); await S.ctx.close();
  await browser.close();
  console.log('\nALL ' + passed + ' EXAM QUESTION PAPER UI TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });

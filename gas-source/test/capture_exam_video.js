// Browser (Chromium) end-to-end test: Examination -> Exam Question Paper, against the real Code.gs + PdfLib.gs.
const fs = require('fs'); const vm = require('vm'); const assert = require('assert'); const crypto = require('crypto');
const { execFileSync } = require('child_process');
const OUT = process.argv[2] || '/home/claude/video/exam/shots'; fs.mkdirSync(OUT, { recursive: true });
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
    const ctx = await browser.newContext({ viewport: viewport || { width: 1500, height: 900 }, deviceScaleFactor: viewport ? 2 : 1.3, acceptDownloads: true }); const page = await ctx.newPage();
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
      
      updateAttendanceTabVisibility(); updateExaminationTabVisibility();
    }, { role, email, access });
    return { ctx, page, errors };
  }
  const visible = (page, sel) => page.$eval(sel, e => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length));

  const hideGate = p => p.evaluate(() => { const ov = document.getElementById('apsGateOverlay'); if (ov) ov.style.display = 'none'; try { renderViewerInfo(); } catch (e) {} });
  const pause = (p, ms) => p.waitForTimeout(ms || 500);
  async function clean(p, name) {
    await p.mouse.move(2, 2);
    await p.evaluate(keep => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      document.querySelectorAll('[role=tooltip], .aps-tip').forEach(e => { e.hidden = true; });
      let st = document.getElementById('__vidcss'); if (!st) { st = document.createElement('style'); st.id = '__vidcss'; document.head.appendChild(st); }
      st.textContent = '#apsTooltip,.aps-tip{display:none!important}' + (keep ? '' : '#toast{display:none!important}'); }, /toast/.test(name));
  }
  async function shot(p, name, sel, maxH) {
    await pause(p, 350);
    await clean(p, name);
    if (!sel) { await p.screenshot({ path: OUT + '/' + name + '.png' }); console.log('shot', name); return; }
    const el = await p.$(sel); await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    const y = Math.max(0, b.y - 8);
    await p.screenshot({ path: OUT + '/' + name + '.png', clip: { x: Math.max(0, b.x - 8), y, width: Math.min(b.width + 16, p.viewportSize().width), height: Math.min(b.height + 16, maxH || 900, p.viewportSize().height - y) } });
    console.log('shot', name);
  }
  async function region(p, name, sels, maxH) { // union box of several elements (after scrolling first into view)
    await clean(p, name);
    const first = await p.$(sels[0]); await first.evaluate(e => e.scrollIntoView({ block: 'start' })); await p.evaluate(() => window.scrollBy(0, -12)); await pause(p, 300);
    let x1 = 1e9, y1 = 1e9, x2 = 0, y2 = 0;
    for (const s of sels) { const e = await p.$(s); if (!e) continue; const b = await e.boundingBox(); if (!b) continue; x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height); }
    y1 = Math.max(0, y1 - 10); x1 = Math.max(0, x1 - 10);
    await p.screenshot({ path: OUT + '/' + name + '.png', clip: { x: x1, y: y1, width: Math.min(x2 - x1 + 20, p.viewportSize().width - x1), height: Math.min(y2 - y1 + 20, maxH || 880, p.viewportSize().height - y1) } });
    console.log('shot', name);
  }
  const modal = (p, name) => shot(p, name, '#examQpModalOverlay .modal');

  // ===== Login screen (student) =====
  const S = await open('student', 'bala_aps2002@avvaiyarpadasalai.org');
  await shot(S.page, 'login');
  await hideGate(S.page);

  // ===== Admin =====
  const A = await open('admin', 'info@avvaiyarpadasalai.org');
  await hideGate(A.page);
  const a = A.page;
  await a.click('#tabExamination');
  await pause(a, 600);
  await shot(a, 'ad_exam_tab');
  await a.click('[data-exam-section="questionPaper"]');
  await a.waitForFunction(() => examQp.mon && document.getElementById('examQpTiles').children.length > 5);
  await a.evaluate(() => document.getElementById('examQpHelp').open = true);
  await shot(a, 'ad_help', '#examQpHelp');
  await a.evaluate(() => document.getElementById('examQpHelp').open = false);
  await region(a, 'ad_qp_home', ['#examQpSection .exam-card-head', '#examQpAdminBar', '#examQpTiles', '#examQpFilters', '#examQpViews', '#examQpPane']);
  await a.click('#examQpSettingsBtn');
  await shot(a, 'ad_settings', '#examQpSettingsBox');
  await a.click('#examQpSetCancel');
  await a.click('#examQpAddBtn');
  await shot(a, 'ad_form_empty', '#examQpForm');
  await a.fill('#examQpTitle', 'Mid-Term Examination');
  await a.fill('#examQpDate', '2026-10-16');
  await a.selectOption('#examQpGrade', 'NILAI 2');
  await a.check('[data-exam-qp-class="C2"]');
  await a.fill('#examQpDriveLink', 'https://drive.google.com/file/d/SRCPDF_abcdefghij/view?usp=sharing');
  await a.evaluate(() => examQpUpdateFormPreview_());
  await shot(a, 'ad_form_filled', '#examQpForm');
  await region(a, 'ad_form_times', ['#examQpStartLabel', '#examQpClose', '#examQpFileField', '#examQpFormPreview', '#examQpFormSave']);
  await a.click('#examQpFormSave');
  await a.waitForFunction(() => document.getElementById('examQpForm').hidden && examQp.mon && examQp.mon.papers.length === 1 && examQp.mon.papers[0].hasFile);
  await region(a, 'ad_row_ready', ['#examQpTiles', '#examQpViews', '#examQpPane']);
  await a.click('[data-exam-qp-act="PUBLISH"]');
  await a.waitForSelector('#examQpModalOverlay.open');
  await modal(a, 'ad_publish_modal');
  await a.click('#examQpPubGo');
  await a.waitForFunction(() => examQp.mon && examQp.mon.papers[0].status === 'PUBLISHED');
  await pause(a, 500);
  await region(a, 'ad_row_published', ['#examQpTiles', '#examQpViews', '#examQpPane']);
  // Lock -> show LOCKED, then Unlock
  await a.click('[data-exam-qp-act="LOCK"]'); await a.waitForSelector('#examQpModalOverlay.open');
  await a.fill('#examQpReason', 'Checking a typo on page 2');
  await modal(a, 'ad_lock_modal');
  await a.click('#examQpActGo');
  await a.waitForFunction(() => examQp.mon && examQp.mon.papers[0].locked);
  await pause(a, 600);
  await shot(a, 'ad_row_locked', '#examQpPane');
  await a.click('[data-exam-qp-act="UNLOCK"]'); await a.waitForSelector('#examQpModalOverlay.open');
  await modal(a, 'ad_unlock_modal');
  await a.click('#examQpActGo');
  await a.waitForFunction(() => examQp.mon && !examQp.mon.papers[0].locked);
  // Cancel dialog (not executed)
  await pause(a, 400);
  await a.click('[data-exam-qp-act="CANCEL"]'); await a.waitForSelector('#examQpModalOverlay.open');
  await modal(a, 'ad_cancel_modal');
  await a.evaluate(() => examQpCloseModal_());
  // Preview
  await a.click('[data-exam-qp-act="PREVIEW"]');
  await pause(a, 2500);
  await shot(a, 'ad_preview_toast');

  // ===== Student =====
  const s = S.page;
  await s.click('#tabExamination');
  await s.waitForSelector('[data-exam-qp-countdown]');
  await pause(s, 1200);
  await shot(s, 'st_exam_tab');
  await shot(s, 'st_countdown', '#examQpStudentList');
  await s.evaluate(() => document.getElementById('examQpHelp').open = true);
  await shot(s, 'st_help', '#examQpHelp');
  await s.evaluate(() => document.getElementById('examQpHelp').open = false);
  D.set('2026-10-16T22:16:00Z');
  await s.evaluate(() => loadMyExamQuestionPapers());
  await s.waitForSelector('[data-exam-qp-download]', { timeout: 8000 });
  await shot(s, 'st_available', '#examQpStudentList');
  await s.click('[data-exam-qp-download]');
  await s.waitForSelector('#examQpModalOverlay.open');
  await modal(s, 'st_confirm_empty');
  await s.fill('#examQpVAps', 'APS9999'); await s.check('#examQpVConfirm'); await s.click('#examQpVContinue');
  await s.click('#examQpVGo');
  await s.waitForFunction(() => /does not match your student account/.test(document.getElementById('examQpModalBody').textContent));
  await modal(s, 'st_wrong_apsid');
  D.set('2026-10-16T22:17:00Z');
  await s.fill('#examQpVAps', 'aps2002');
  if (!(await s.isChecked('#examQpVConfirm'))) await s.check('#examQpVConfirm');
  await modal(s, 'st_confirm_filled');
  await s.click('#examQpVContinue');
  await modal(s, 'st_verify');
  const dlp = s.waitForEvent('download', { timeout: 30000 });
  await s.click('#examQpVGo');
  const d = await dlp; await d.saveAs(OUT + '/student_copy.pdf');
  await s.waitForSelector('#examQpDoneBox:not([hidden])');
  await shot(s, 'st_done', '#examQpDoneBox');
  const key = (await s.textContent('#examQpDoneKey')).trim();
  await s.waitForFunction(() => /Your downloads: 1/.test(document.getElementById('examQpStudentList').textContent));
  await shot(s, 'st_after', '#examQpStudentList');
  execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-r', '110', '-png', OUT + '/student_copy.pdf', OUT + '/st_pdf']);
  console.log('KEY', key, 'file', d.suggestedFilename());

  // ===== Teacher =====
  const T = await open('teacher', 'ttwo_aps701@avvaiyarpadasalai.org'); await hideGate(T.page);
  const tp = T.page;
  await tp.click('#tabExamination');
  await tp.waitForFunction(() => examQp.mon && examQp.mon.scope === 'TEACHER');
  await pause(tp, 500);
  await region(tp, 'te_home', ['#examQpTiles', '#examQpFilters', '#examQpViews', '#examQpPane']);
  await tp.click('[data-exam-qp-act="VIEW"]');
  await tp.waitForSelector('#examQpFocus:not([hidden])');
  await pause(tp, 600);
  await region(tp, 'te_view', ['#examQpFocus', '#examQpPane']);
  await tp.fill('#examQpSearch', key.replace(/-/g, '').toLowerCase());
  await tp.waitForFunction(k => { const x = document.getElementById('examQpPane').textContent; return x.includes(k) && !x.includes('Chitra'); }, key);
  await region(tp, 'te_key_search', ['#examQpFilters', '#examQpViews', '#examQpPane']);

  // ===== Head Master =====
  const H = await open('headmaster', 'hm_aps600@avvaiyarpadasalai.org'); await hideGate(H.page);
  const h = H.page;
  await h.click('#tabExamination'); await h.click('[data-exam-section="questionPaper"]');
  await h.waitForFunction(() => examQp.mon && examQp.mon.scope === 'ALL');
  await pause(h, 500);
  await shot(h, 'hm_tiles', '#examQpTiles');
  await h.click('[data-exam-qp-tile="downloaded"]');
  await h.waitForFunction(() => examQp.view === 'students' && /Bala/.test(document.getElementById('examQpPane').textContent));
  await region(h, 'hm_downloaded', ['#examQpFilters', '#examQpViews', '#examQpPane']);
  await h.click('[data-exam-qp-view="events"]'); await pause(h, 600);
  await region(h, 'hm_events', ['#examQpViews', '#examQpPane']);
  await h.click('[data-exam-qp-view="suspicious"]'); await pause(h, 600);
  await region(h, 'hm_suspicious', ['#examQpViews', '#examQpPane']);
  await h.click('#examQpExportBtn'); await pause(h, 1200);
  await shot(h, 'hm_export_toast');

  // ===== Admin: audit log, custom schedule, attach dialog, bulk bar =====
  await a.click('[data-exam-qp-view="audit"]');
  await a.waitForFunction(() => /QUESTION_PAPER_PUBLISHED/.test(document.getElementById('examQpPane').textContent));
  await region(a, 'ad_audit', ['#examQpViews', '#examQpPane']);
  await a.click('[data-exam-qp-view="papers"]'); await pause(a, 500);
  await a.click('#examQpAddBtn');
  await a.fill('#examQpTitle', 'Make-up Exam');
  await a.selectOption('#examQpGrade', '');
  await a.check('[data-exam-qp-class="C1"]'); await a.check('[data-exam-qp-class="C2"]');
  await a.selectOption('#examQpSchedMode', 'CUSTOM');
  await a.fill('#examQpDate', '2026-10-24'); await a.fill('#examQpStart', '10:00');
  await a.evaluate(() => examQpUpdateFormPreview_());
  await shot(a, 'ad_form_custom', '#examQpForm');
  await a.click('#examQpFormSave');
  await a.waitForFunction(() => document.getElementById('examQpForm').hidden && examQp.mon && examQp.mon.papers.filter(x => x.examTitle === 'Make-up Exam').length === 2, null, { timeout: 15000 });
  await a.evaluate(() => { if (document.getElementById('examQpModalOverlay').classList.contains('open')) examQpCloseModal_(); });
  await pause(a, 500);
  await shot(a, 'ad_papers_three', '#examQpPane');
  await a.click('#examQpSelAll'); await pause(a, 400);
  await region(a, 'ad_bulk', ['#examQpBulkBar', '#examQpPane']);
  await a.click('#examQpSelAll'); await pause(a, 300);
  const up = await a.$$('[data-exam-qp-act="UPLOAD"]'); await up[up.length - 1].click();
  await a.waitForSelector('#examQpModalOverlay.open');
  await modal(a, 'ad_attach_modal');
  await a.evaluate(() => examQpCloseModal_());

  // ===== Mobile student =====
  const M = await open('student', 'chitra_aps2003@avvaiyarpadasalai.org', { width: 390, height: 844 }); await hideGate(M.page);
  await M.page.click('#tabExamination'); await M.page.waitForSelector('[data-exam-qp-download]'); await pause(M.page, 600);
  await M.page.$eval('#examQpStudentList', e => e.scrollIntoView({ block: 'start' }));
  await shot(M.page, 'st_mobile');
  await M.page.click('[data-exam-qp-download]'); await M.page.waitForSelector('#examQpModalOverlay.open'); await pause(M.page, 400);
  await shot(M.page, 'st_mobile_confirm');
  const errs = [].concat(A.errors, S.errors, T.errors, H.errors, M.errors);
  console.log('page errors:', errs.length ? errs : 'none');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

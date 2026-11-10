// Browser test: r111 — "📦 Grades carried over from a previous class" panel in Examination → Grading (node test/ui_gradetransfer.js)
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { build } = require('./gradingfixture');
const F = build({ props: { APS_ENVIRONMENT: 'LIVE' } }); const { G, cls, P, ids, J } = F;
G.Classroom.Courses.Students.remove = (cid, email) => { cls.students[cid] = (cls.students[cid] || []).filter(s => s.profile.emailAddress !== email); return {}; };
G.Classroom.Courses.Students.create = (body, cid) => { (cls.students[cid] = cls.students[cid] || []).push(Object.values(P).find(x => x.profile.emailAddress === body.userId)); return {}; };
const sl = G.Classroom.Courses.CourseWork.StudentSubmissions.list;
G.Classroom.Courses.CourseWork.StudentSubmissions.list = (cid, wid, o) => { if (o && o.userId) { const p = (cls.students[cid] || []).find(s => s.profile.emailAddress === o.userId); return { studentSubmissions: p ? (cls.subs[cid] || []).filter(s => s.userId === p.userId).map(J) : [] }; } return sl(cid, wid, o); };
const cs = F.env.wb.insertSheet('Courses'); cs.data[0] = new Array(18).fill('h');
cls.courses.forEach((c, i) => { const row = new Array(18).fill(''); row[0] = c.id; row[17] = JSON.stringify({ id: c.id, name: c.name, courseState: c.courseState, teachers: (cls.teachers[c.id] || []).map(x => ({ name: x.profile.name.fullName, email: x.profile.emailAddress })), students: (cls.students[c.id] || []).map(x => ({ name: x.profile.name.fullName, email: x.profile.emailAddress })), classSupport: [] }); cs.data[i + 1] = row; });
const A = F.tok('admin@aps.org', 'admin');
G.assignStudentToClassroom(A, 'joshua_aps3407@avvaiyarpadasalai.org', ids.MAZ, 'Move to Friday 7:30');
cls.subs[ids.MAZ].push({ courseWorkId: 'M1', userId: 'UJ', state: 'RETURNED', assignedGrade: 8 }); // the new class graded HW_LSN_1 for him too
G.syncGrading(A, { refreshRoster: true });
const TB = F.tok('teacherb_aps102@avvaiyarpadasalai.org', 'teacher');
const data = J(G.getGradingData(TB));
(async () => {
  assert.ok(data.carried.length >= 4);
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1366, height: 1100 } }); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/^https:\/\/(?!aps\.test\/).*/, r => r.abort());
  await page.addInitScript(() => { const run = new Proxy({}, { get(_, p) { if (p === 'withSuccessHandler' || p === 'withFailureHandler' || p === 'withUserObject') return () => run; return () => {}; } }); window.google = { script: { run, history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } }; });
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto('https://aps.test/', { waitUntil: 'load' });
  const out = await page.evaluate(d => {
    currentUser = { role: 'teacher', email: 'teacherb_aps102@avvaiyarpadasalai.org', gradingAccess: 'TEACHER', courses: [] };
    document.getElementById('apsGateOverlay').style.display = 'none';
    let p = document.getElementById('grdCarried'); while (p && p !== document.body) { p.hidden = false; if (p.style) p.style.display = ''; p = p.parentElement; }
    grd.data = d; grdIndex_(); grdInit_(); grdRender_();
    const box = document.getElementById('grdCarried');
    return { hidden: box.hidden, text: box.innerText, replaced: Array.from(box.querySelectorAll('[data-grd-replaced]')).map(x => x.closest('tr').innerText), editable: box.querySelectorAll('input,button,select,[contenteditable]').length };
  }, data);
  assert.strictEqual(out.hidden, false);
  ['Grades carried over from a previous class', 'view only', 'Joshua Kumar', 'moved from NILAI 3 - EF to MAZHALAI - CB', 'HW_LSN_1', 'HW_LSN_2', '9 / 10', '1 replaced by this class'].forEach(x => assert.ok(out.text.includes(x), x + ' | ' + out.text.slice(0, 400)));
  assert.strictEqual(out.replaced.length, 1); assert.ok(/HW_LSN_1/.test(out.replaced[0]) && /replaced by HW_LSN_1 in this class/.test(out.replaced[0]));
  assert.strictEqual(out.editable, 0, 'view only: no controls');
  await (await page.$('#grdCarried')).screenshot({ path: __dirname + '/r111_grades_carried_over.png' });
  // r113: carried grades in the Grades matrix (Joshua's current-class row) and in his Overall %
  const mx = await page.evaluate(maz => {
    const sel = document.getElementById('grdClass'); sel.value = maz; grdRender_();
    const tr = Array.from(document.querySelectorAll('#grdPane table.grd-matrix tbody tr')).find(x => /Joshua Kumar/.test(x.innerText));
    if (!tr) return { dbg: document.querySelector('#grdPane').innerText.slice(0, 300), n: document.querySelectorAll('#grdPane table.grd-matrix tbody tr').length, lim: grd.limit, joshua: grd.data.students.filter(s => /joshua/.test(s.e)) };
    const own = { pts: 0, mx: 0 }, d = grd.data, cur = d.students.find(s => /joshua/.test(s.e) && s.s === 'ACTIVE' && s.c === maz);
    (grd.idx.workByCourse[cur.c] || []).forEach(w => { const s = grd.idx.sub[cur.c + '|' + w.id + '|' + cur.u]; if (s && s.g !== '' && s.g != null && Number(w.max)) { own.pts += Number(s.g); own.mx += Number(w.max); } });
    const prev = grdCarriedRows_(grdFilters_()).rows.filter(r => /joshua/.test(r.e) && !r._rep && r.g !== '' && r.g != null && Number(r.max));
    const exp = { pts: own.pts + prev.reduce((a, r) => a + Number(r.g), 0), mx: own.mx + prev.reduce((a, r) => a + Number(r.max), 0) };
    return { overall: tr.querySelector('td.grd-c-overall').innerText, prevCells: tr.querySelectorAll('[data-grd-prev]').length, prevText: Array.from(tr.querySelectorAll('[data-grd-prev]')).map(x => x.innerText).join(' || '),
      exp, own, nPrev: prev.length, editable: tr.querySelectorAll('input,button,select,[contenteditable]').length };
  }, ids.MAZ);
  assert.ok(mx && !mx.dbg, 'Joshua row in the Grades matrix ' + JSON.stringify(mx));
  assert.ok(mx.nPrev >= 1 && mx.prevCells >= 1, JSON.stringify(mx));
  const pct = Math.round(mx.exp.pts * 1000 / mx.exp.mx) / 10;
  assert.ok(mx.overall.includes(pct + '%') && mx.overall.includes(Math.round(mx.exp.pts * 10) / 10 + ' / ' + mx.exp.mx), 'Overall % includes carried: ' + JSON.stringify(mx));
  assert.ok(mx.overall.includes('incl. ' + mx.nPrev + ' 📦 from previous class'), mx.overall);
  assert.ok(/Previous class: NILAI 3 - EF/.test(mx.prevText), mx.prevText);
  assert.ok(!/HW_LSN_1/.test(mx.prevText), 'replaced lesson not counted twice');
  assert.strictEqual(mx.editable, 0, 'view only');
  await page.evaluate(() => { const t = document.querySelector('#grdPane table.grd-matrix'); t.parentElement.scrollLeft = 0; });
  await (await page.$('#grdPane')).screenshot({ path: __dirname + '/r113_grades_matrix_carried.png' });
  console.log('PASS Grades matrix: carried grades shown (📦, view only) and counted in Overall % (' + mx.overall.replace(/\n/g, ' ') + ')');
  // filter: another classroom selected → panel hidden
  const hid = await page.evaluate(id => { const sel = document.getElementById('grdClass'); const o = document.createElement('option'); o.value = id; sel.appendChild(o); sel.value = id; grdRender_(); return document.getElementById('grdCarried').hidden; }, ids.N4AB);
  assert.strictEqual(hid, true, 'class filter applies');
  // r112: Class / Grade Change Audit Log shows the grade-transfer result under the row status
  const audit = J(G.getAdminAssignmentAuditLog(A));
  audit.push({ type: 'Assign Classroom', timestamp: '2026-11-05T15:00:00Z', studentName: 'X', studentEmail: 'x@aps.org', from: 'A', to: 'B', status: 'COMPLETED', reason: 'r', gradeTransfer: 'Grades from the previous class could NOT be saved (Service unavailable).' });
  const al = await page.evaluate(rows => {
    apsScriptRun = { withSuccessHandler(f) { return { withFailureHandler() { return { getAdminAssignmentAuditLog() { f(rows); } }; } }; } };
    let b = document.getElementById('assignmentAuditBody'); let p = b; while (p && p !== document.body) { p.hidden = false; if (p.style) p.style.display = ''; p = p.parentElement; }
    loadAssignmentAudit();
    return Array.from(document.querySelectorAll('#assignmentAuditBody [data-audit-grades]')).map(x => ({ text: x.textContent, tip: x.getAttribute('title'), red: x.getAttribute('style').includes('--red') }));
  }, audit);
  assert.ok(al.some(x => /^📦 Grades saved: \d+ assignment\(s\), \d+ graded$/.test(x.text) && /^Grades saved from the previous class: .* Transfer ID: GT-/.test(x.tip) && !x.red), JSON.stringify(al));
  assert.ok(al.some(x => x.text === '📦 Grades NOT saved' && /NOT be saved \(Service unavailable\)/.test(x.tip) && x.red), 'failure shown in red, reason in the tooltip');
  await (await page.$('#assignmentAuditBody')).screenshot({ path: __dirname + '/r112_audit_grade_transfer.png' });
  assert.deepStrictEqual(errors, []);
  console.log('PASS audit log: grade-transfer result shown under the status (success / NOT saved in red)');
  console.log('PASS carried-over panel: student, from → to, grades, replaced lesson dimmed, view only, filters apply, no JS errors');
  await browser.close(); console.log('3/3 passed');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

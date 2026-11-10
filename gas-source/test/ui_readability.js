// Browser test: readability / responsive layout of the Grades section (long names, emails, assignment titles) at desktop, tablet and phone widths.
const fs = require('fs'); const assert = require('assert');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { build } = require('./gradingfixture');
const F0 = build(); const { env, ids, tok, J, G, cls, person } = F0;
// Long real-world values: name, email, assignment title
const LONG = person('UL', 'Abhinavasundari Kalyanaraman Thirunavukkarasu', 'abhinavasundari.kalyanaraman_aps9876@avvaiyarpadasalai.org');
cls.students[ids.N3EF].push(LONG);
cls.work[ids.N3EF].push({ id: 'WL', title: 'MODEL_EXAM_FINAL_REVIEW_2026_TRIMESTER_THREE', workType: 'ASSIGNMENT', state: 'PUBLISHED', maxPoints: 50, creationTime: new Date(Date.now() - 2 * 86400000).toISOString() });
cls.subs[ids.N3EF].push({ courseWorkId: 'WL', userId: 'UL', state: 'RETURNED', assignedGrade: 44 });
const adminTok = tok('admin@aps.org', 'admin');
assert.strictEqual(G.syncGrading(adminTok, { refreshRoster: true }).result, 'COMPLETED');

(async () => {
  const browser = await chromium.launch();
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
  const html = fs.readFileSync(__dirname + '/../Dashboard.html', 'utf8').replace(/<\?!?=.*?\?>/gs, 'null');
  async function open(role, email, viewport) {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1366, height: 1000 }, acceptDownloads: true }); const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    env.cache['aps_sess_tok_' + role] = JSON.stringify({ email, role });
    await page.exposeFunction('__gas', async (fn, args) => {
      try { const out = G[fn].apply(null, args); return JSON.stringify({ ok: out === undefined ? null : J(out) }); } catch (e) { return JSON.stringify({ err: e.message }); }
    });
    await page.addInitScript(() => {
      function runner(s, f) { return new Proxy({}, { get(_, p) {
        if (p === 'withSuccessHandler') return h => runner(h, f); if (p === 'withFailureHandler') return h => runner(s, h); if (p === 'withUserObject') return () => runner(s, f);
        return (...args) => { window.__gas(p, args).then(r => { r = JSON.parse(r); if ('err' in r) { f && f(new Error(r.err)); } else { s && s(r.ok); } }); };
      } }); }
      window.google = { script: { run: runner(null, null), history: {}, url: { getLocation(cb) { cb({ parameter: {}, parameters: {} }); } } } };
    });
    await page.route('https://aps.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('https://aps.test/', { waitUntil: 'load' });
    const p = J(G.buildAuthenticatedUserPayload_({ email, role }, []));
    await page.evaluate(({ role, email, p }) => {
      apsSessionToken = 'tok_' + role; currentUser = { email, role, name: email, permissions: p.permissions, examinationAccess: p.examinationAccess, gradingAccess: p.gradingAccess }; allCourses = [];
      const ov = document.getElementById('apsGateOverlay'); if (ov) ov.style.display = 'none';
      updateAttendanceTabVisibility(); updateExaminationTabVisibility();
    }, { role, email, p });
    return { ctx, page, errors };
  }

  const goGrading = async p => { await p.click('#tabExamination'); await p.click('[data-exam-section="grading"]'); await p.waitForFunction(() => /Showing/.test(document.getElementById('grdCount').textContent), null, { timeout: 15000 }); await p.waitForTimeout(200); };
  for (const [label, vp, frozen] of [['desktop', { width: 1366, height: 900 }, 4], ['tablet', { width: 820, height: 1000 }, 4], ['phone', { width: 390, height: 844 }, 1]]) {
    const { ctx, page, errors } = await open('admin', 'admin@aps.org', vp);
    await t(label + ': no page-wide horizontal scroll; ' + frozen + ' frozen column(s); long email / name / assignment wrap inside sensible widths', async () => {
      await goGrading(page);
      const r = await page.evaluate(() => {
        const box = document.getElementById('grdPane'), tbl = box.querySelector('table.grd-matrix');
        const row = [...tbl.querySelectorAll('tbody tr')].find(tr => /Abhinavasundari/.test(tr.textContent));
        const email = row.querySelector('td.grd-c-email'), name = row.querySelector('td.grd-c-name');
        const longTh = [...tbl.querySelectorAll('th.grd-grp')].find(th => /MODEL_EXAM_FINAL_REVIEW/.test(th.textContent));
        return { pageW: document.documentElement.scrollWidth, winW: window.innerWidth, fz: tbl.querySelectorAll('thead tr:first-child th.grd-fz').length,
          emailW: email.getBoundingClientRect().width, emailLines: Math.round(email.querySelector('.aps-email').getBoundingClientRect().height / 16),
          nameW: name.getBoundingClientRect().width, thW: longTh.getBoundingClientRect().width, boxScrolls: box.scrollWidth > box.clientWidth,
          row2Top: tbl.querySelector('thead tr:nth-child(2) th').style.top, row1H: tbl.querySelector('thead tr').getBoundingClientRect().height };
      });
      assert.ok(r.pageW <= r.winW + 1, 'page does not scroll sideways: ' + JSON.stringify(r));
      assert.strictEqual(r.fz, frozen, JSON.stringify(r));
      assert.ok(r.emailW <= 240 && r.emailLines >= 2, 'email wraps after @ inside its column: ' + JSON.stringify(r));
      assert.ok(r.nameW <= 220, 'name column bounded: ' + JSON.stringify(r));
      assert.ok(r.thW <= 360, 'long assignment title wraps: ' + JSON.stringify(r));
      assert.ok(r.boxScrolls, 'assignments scroll inside the Grades box');
      assert.ok(Math.abs(parseFloat(r.row2Top) - r.row1H) < 1.5, 'second header row sits right under the (wrapped) first: ' + JSON.stringify(r));
      // scroll: frozen cells keep their place and stay on top of assignment cells
      const before = await page.$$eval('#grdPane tbody tr:first-child td.grd-fz', tds => tds.map(td => Math.round(td.getBoundingClientRect().left)));
      await page.$eval('#grdPane', el => { el.scrollLeft = 500; });
      const after = await page.$$eval('#grdPane tbody tr:first-child td.grd-fz', tds => tds.map(td => Math.round(td.getBoundingClientRect().left)));
      assert.deepStrictEqual(after, before, 'frozen columns stay put');
      const onTop = await page.evaluate(() => { const td = document.querySelector('#grdPane tbody tr:first-child td.grd-fz-last'); td.scrollIntoView({ block: 'center', inline: 'nearest' }); const b = td.getBoundingClientRect(); const el = document.elementFromPoint(b.right - 4, b.top + b.height / 2); return td.contains(el); });
      assert.ok(onTop, 'assignment columns never cover the frozen columns');
      await page.waitForFunction(() => { const t = document.querySelector('#grdPane th.grd-grp'), o = document.querySelector('#grdPane td.grd-c-overall'), h = [...document.querySelectorAll('#grdPane thead th')].find(x => /Student Email Address/.test(x.textContent));
        return t && /Homework|Attendance|Quiz|Examination/.test(t.getAttribute('data-tooltip') || '') && o && /Overall/.test(o.getAttribute('data-tooltip') || '') && h && /frozen/i.test(h.getAttribute('data-tooltip') || ''); }, null, { timeout: 5000 });
      await page.$eval('#grdPane', el => { el.scrollLeft = 260; });
      await page.screenshot({ path: __dirname + '/readability_grades_' + label + '.png', fullPage: false });
      assert.deepStrictEqual(errors, []);
    });
    await ctx.close();
  }
  await browser.close();
  console.log(passed + ' passed');
})().catch(e => { console.error(e); process.exit(1); });

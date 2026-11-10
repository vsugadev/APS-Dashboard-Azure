// Runs the Apps Script regression suite (gas-source/test/*.js) — the acceptance checklist each Azure module must
// match when it is ported. Same runner rules as the Apps Script project (helper files skipped, 6 min per suite).
// Usage: npm run test:gas            (UI suites need Playwright installed globally)
const fs = require('fs'); const path = require('path'); const { spawnSync } = require('child_process');
const dir = path.join(__dirname, '..', 'gas-source', 'test');
const SKIP = new Set('perf_measure zohomock classroommock coveragefixture fixtures fixtures2 gasmock gradingfixture removalfixture addfixture amfixture ttfixture ziputil dbg shot capture_video capture_exam_video sample_email prod_repro'.split(' '));
const only = process.argv.slice(2);
let pass = 0, fail = 0; const failed = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
  const b = f.replace(/\.js$/, '');
  if (SKIP.has(b) || (only.length && !only.includes(b))) continue;
  const r = spawnSync(process.execPath, [path.join(dir, f)], { cwd: path.join(__dirname, '..', 'gas-source'), encoding: 'utf8', timeout: 360000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const bad = r.status !== 0 || /^FAIL/m.test(out);
  if (bad) { fail++; failed.push(b); } else pass++;
  const lines = out.trim().split('\n'); const sum = lines.filter((l) => /passed|PASSED|\bfail/i.test(l)).pop() || lines.pop() || '';
  console.log((bad ? 'FAIL ' : 'ok   ') + b + '  ' + sum.slice(0, 90));
}
console.log(`\n${pass} passed, ${fail} failed${failed.length ? ': ' + failed.join(', ') : ''}`);
process.exit(fail ? 1 : 0);

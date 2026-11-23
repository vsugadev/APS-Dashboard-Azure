/** v0.25.2: every Code.gs function the dashboard page calls is answered by Azure (never "NOT_ON_AZURE_YET"); live "Report a problem". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs'; import path from 'path';
import { buildRegistry } from '../src/server';
import { WRITE_THROUGH, READ_THROUGH } from '../src/api/endpoints/writes';
import { DashboardPage } from '../src/web/render';
import { readinessLines, type ReadinessFacts } from '../src/parallel/parallelRun';
import { loadConfig } from '../src/config';
import { testConfig } from './helpers';

const ROOT = path.join(__dirname, '..', '..');

test('every Code.gs function Dashboard.html calls is registered on Azure (natively or through the bridge)', () => {
  const page = fs.readFileSync(path.join(ROOT, 'public', 'Dashboard.html'), 'utf8');
  const code = fs.readFileSync(path.join(ROOT, 'gas-source', 'Code.gs'), 'utf8');
  const fns = new Set<string>(); for (const m of code.matchAll(/^function ([A-Za-z0-9]+)\s*\(/gm)) if (!m[1].endsWith('_')) fns.add(m[1]);
  const used = new Set<string>(); for (const m of page.matchAll(/['".]([A-Za-z][A-Za-z0-9]+)['"]?\s*[,(]/g)) if (fns.has(m[1])) used.add(m[1]);
  const have = new Set((buildRegistry() as any).handlers.keys());
  assert.ok(used.size > 200, 'found the page\'s calls (' + used.size + ')');
  assert.deepEqual([...used].filter((n) => !have.has(n)).sort(), [], 'these would answer NOT_ON_AZURE_YET');
  for (const n of ['sendSchoolLeaveNotification', 'getAppreciationCertificateStudents', 'getTeacherAppreciationTeachers', 'publishExaminationToCourses']) assert.ok(have.has(n), n);
});

test('the bridge lists match Apps Script AzureBridge.gs r143 (Apps Script refuses a function it does not list)', () => {
  const gs = fs.readFileSync(path.join(ROOT, 'gas-source', 'AzureBridge.gs'), 'utf8');
  const list = (name: string) => { const i = gs.indexOf('var ' + name + ' = ['); return Array.from(gs.slice(i, gs.indexOf('];', i)).replace(/\/\/.*$/gm, '').matchAll(/'([A-Za-z0-9]+)'/g)).map((m) => m[1]).sort(); };
  assert.deepEqual(list('AZURE_BRIDGE_CALLS_'), WRITE_THROUGH.slice().sort());
  assert.deepEqual(list('AZURE_BRIDGE_READS_'), READ_THROUGH.slice().sort());
});

test('REPORT_PROBLEMS=on: a "Report a problem" button for everyone on the live dashboard (no test-run text); readiness OK', () => {
  assert.equal(loadConfig({ REPORT_PROBLEMS: 'on' } as any).reportProblems, true); assert.equal(loadConfig({} as any).reportProblems, false);
  const page = new DashboardPage(path.join(ROOT, 'public', 'Dashboard.html'));
  const html = page.render({ authUrl: '#', token: null, user: null, error: null, parallel: { officialUrl: '', mode: 'live' } });
  assert.match(html, /<script src="\/aps-parallel\.js" defer data-official="" data-mode="live"><\/script>/);
  const js = fs.readFileSync(path.join(ROOT, 'public', 'aps-parallel.js'), 'utf8');
  assert.match(js, /btn: 'Report a problem'/); assert.match(js, /getAttribute\('data-mode'\) === 'live'/);
  const f: ReadinessFacts = { googleOk: true, bridgeOk: true, sessionsSql: true, chatReady: true, classLiveError: null, jobs: ['a'], timedJobs: ['b'], mailOk: true, mailJobs: ['c'], mailJobsPreview: false, dbCopy: ['main'], dbReads: [], feedbackReady: true };
  assert.ok(readinessLines(testConfig({ reportProblems: true }), f).some((l) => /^OK\s+"Report a problem" button for everyone/.test(l)));
  const s = fs.readFileSync(path.join(ROOT, 'src', 'server.ts'), 'utf8'); assert.match(s, /ctx\.cfg\.reportProblems \? \{ officialUrl: '', mode: 'live' as const \}/);
});

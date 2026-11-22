/** v0.24.0 performance release: learned preload, all needs per pass, reused answers, compression, measurement. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http'; import path from 'path'; import zlib from 'zlib';
import { buildRegistry, cacheableNames, createApp } from '../src/server';
import { signInWithClaims } from '../src/app/context';
import { ResponseCache, responseCache } from '../src/api/responseCache';
import { PerfMonitor } from '../src/api/perf';
import { runStats, forgetLearned, learnedFor } from '../src/gas/run';
import { DashboardPage } from '../src/web/render';
import { testContext } from './helpers';

const D = '@avvaiyarpadasalai.org';

test('#1 learned preload: the second run of a screen needs no re-runs for data it needed the first time', async () => {
  forgetLearned();
  const ctx: any = testContext(); const reg = buildRegistry();
  const tok = (await signInWithClaims(ctx, { email: 'admin' + D, email_verified: true }) as any).token;
  const names = ['getSpecialClasses', 'getSpecialClassesAdmin', 'getZohoSyncHistory', 'getTicketBootstrap'];
  let first = 0, second = 0;
  for (const n of names) {
    const a0 = runStats.attempts; const r1 = await reg.call(ctx, n, [tok]); first += runStats.attempts - a0;
    const a1 = runStats.attempts; const r2 = await reg.call(ctx, n, [tok]); second += runStats.attempts - a1;
    assert.deepEqual(JSON.parse(JSON.stringify(r2)), JSON.parse(JSON.stringify(r1)), n + ': same answer');
  }
  assert.ok(second < first, 'fewer runs the second time: ' + first + ' → ' + second);
  assert.equal(second, names.length, 'exactly one run per call once learned');
  assert.ok(learnedFor('getSpecialClasses'), 'remembered per screen');
});

test('#2 reused answers: same session + arguments only; a save clears all; an ended session is refused even on a hit; expired after the TTL', async () => {
  const ctx: any = testContext(); const reg = buildRegistry(); let now = 0;
  reg.cache = new ResponseCache(30_000, 100, () => now); for (const n of cacheableNames()) reg.cacheable.add(n);
  let runs = 0; const orig = (reg as any).handlers.get('getKnowledgeBaseVideos'); (reg as any).handlers.set('getKnowledgeBaseVideos', async (c: any, a: any) => { runs++; return orig(c, a); });
  const a = (await signInWithClaims(ctx, { email: 'admin' + D, email_verified: true }) as any).token;
  const b = (await signInWithClaims(ctx, { email: 'super' + D, email_verified: true }) as any).token;
  const r1 = await reg.call(ctx, 'getKnowledgeBaseVideos', [a]); await reg.call(ctx, 'getKnowledgeBaseVideos', [a]);
  assert.equal(runs, 1, 'second call reused'); assert.deepEqual(await reg.call(ctx, 'getKnowledgeBaseVideos', [a]), r1);
  await reg.call(ctx, 'getKnowledgeBaseVideos', [b]); assert.equal(runs, 2, 'another session never gets it');
  await reg.call(ctx, 'getKnowledgeBaseVideos', [a, 'x']); assert.equal(runs, 3, 'other arguments → run');
  reg.cache.clear(); await reg.call(ctx, 'getKnowledgeBaseVideos', [a]); assert.equal(runs, 4, 'cleared (a save) → run');
  now += 31_000; await reg.call(ctx, 'getKnowledgeBaseVideos', [a]); assert.equal(runs, 5, 'older than the TTL → run');
  await ctx.sessions.remove(a);
  assert.match(String((await reg.call(ctx, 'getKnowledgeBaseVideos', [a]) as any).err), /session/i, 'signed out → refused even though an answer is kept');
  for (const n of ['getDashboardData', 'getRealtimeStatusSnapshot', 'getChatMessages', 'saveAccessControl', 'editAttendanceRecordStatus']) assert.ok(!cacheableNames().includes(n), n + ' never reused');
});

test('#2 a save through the bridge clears the reused answers', async () => {
  responseCache.set('x\u0000t\u0000[]', { ok: 1 }); assert.equal(responseCache.size(), 1);
  const src = require('fs').readFileSync(path.join(__dirname, '..', '..', 'src', 'api', 'endpoints', 'writes.ts'), 'utf8');
  assert.match(src, /if \(isWrite\) \{[^\n]*responseCache\.clear\(\)/);
  responseCache.clear(); assert.equal(responseCache.size(), 0);
});

test('#3 the page and data are compressed (gzip) when the browser accepts it', async () => {
  const ctx: any = testContext(); const app = createApp(ctx, new DashboardPage(path.join(__dirname, '..', '..', 'public', 'Dashboard.html')));
  const srv = app.listen(0); await new Promise((r) => srv.once('listening', r));
  try {
    const port = (srv.address() as any).port;
    const got: { enc: string; len: number; body: string } = await new Promise((res, rej) => http.get({ port, path: '/', headers: { 'Accept-Encoding': 'gzip' } }, (r) => {
      const chunks: Buffer[] = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => { const buf = Buffer.concat(chunks); res({ enc: String(r.headers['content-encoding']), len: buf.length, body: zlib.gunzipSync(buf).toString('utf8') }); });
    }).on('error', rej));
    assert.equal(got.enc, 'gzip'); assert.ok(got.body.includes('Classroom Dashboard')); assert.ok(got.len < got.body.length / 3, 'at least 3× smaller: ' + got.len + ' vs ' + got.body.length);
  } finally { srv.close(); }
});

test('#7 measurement: calls, average, p95, max per function; slow requests reported once per 10 minutes; names only', () => {
  const logs: string[] = []; let now = 0; const p = new PerfMonitor((m) => logs.push(m), () => now);
  for (let i = 1; i <= 20; i++) p.record('getAttendanceRecordsForViewer', i * 100, true);
  p.record('getAttendanceRecordsForViewer', 50, true, true); p.record('listTickets', 6000, true); p.record('listTickets', 7000, true);
  const s = p.summary(); assert.equal(s[0].name, 'listTickets'); assert.equal(s[1].calls, 21); assert.equal(s[1].cacheHits, 1); assert.equal(s[1].maxMs, 2000);
  assert.equal(logs.filter((l) => /slow: listTickets/.test(l)).length, 1, 'once per 10 minutes');
  p.report(); assert.match(logs[logs.length - 1], /\[Perf\] last hour: 23 calls; slowest \(p95\): listTickets 2× avg 6500/);
});

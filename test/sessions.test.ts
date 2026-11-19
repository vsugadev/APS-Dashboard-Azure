/** Phase 3 step 1 (v0.15.0): lasting sign-ins — sessions in Azure SQL behind an in-memory cache. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DurableSessionStore, MemorySessionDb, MssqlSessionDb, tokenHash } from '../src/auth/sqlSessions';

const TTL = 6 * 3600;
test('a sign-in survives a restart / reaches a second instance; the database holds only the token hash', async () => {
  let now = 1_800_000_000_000; const db = new MemorySessionDb();
  const a = new DurableSessionStore(db, TTL, () => now, () => {});
  const tok = await a.create({ email: 'priya_aps8001@avvaiyarpadasalai.org', role: 'teacher' });
  assert.equal(db.rows.size, 1);
  const [[h, row]] = Array.from(db.rows.entries());
  assert.equal(h, tokenHash(tok)); assert.ok(!JSON.stringify([h, row]).includes(tok), 'never the token itself');
  const b = new DurableSessionStore(db, TTL, () => now, () => {}); // restarted app / other instance
  assert.deepEqual(await b.get(tok), { email: 'priya_aps8001@avvaiyarpadasalai.org', role: 'teacher', issuedAt: now });
  await b.get(tok); assert.equal(b.stats.dbReads, 1, 'looked up once, then from memory');
  now += TTL * 1000 + 1; assert.equal(await b.get(tok), null, 'expires 6 h after sign-in, as before');
});
test('sign-out removes it everywhere; unknown tokens are not looked up again for 30 s', async () => {
  let now = 1_800_000_000_000; const db = new MemorySessionDb();
  const a = new DurableSessionStore(db, TTL, () => now, () => {}), b = new DurableSessionStore(db, TTL, () => now, () => {});
  const tok = await a.create({ email: 'admin@avvaiyarpadasalai.org', role: 'admin' });
  await a.remove(tok); assert.equal(db.rows.size, 0); assert.equal(await b.get(tok), null);
  for (let i = 0; i < 5; i++) await b.get('bogus-token');
  assert.equal(b.stats.dbReads, 2, 'the removed token once + the bogus one once');
  now += 31_000; await b.get('bogus-token'); assert.equal(b.stats.dbReads, 3);
  assert.equal(await b.get(''), null); assert.equal(await b.get('x'.repeat(200)), null);
});
test('the database never blocks a sign-in: slow or failing → the session still works here; logged once, without e-mails or tokens', async () => {
  const db = new MemorySessionDb(); const logs: string[] = [];
  const s = new DurableSessionStore(db, TTL, Date.now, (m) => logs.push(m), 50, 50);
  db.delayMs = 200; const t0 = Date.now();
  const slow = await s.create({ email: 'meena_aps5555@avvaiyarpadasalai.org', role: 'student' });
  assert.ok(Date.now() - t0 < 180, 'did not wait for the slow database'); assert.ok(await s.get(slow));
  await new Promise((r) => setTimeout(r, 250)); assert.equal(db.rows.size, 1, 'the write finished in the background');
  db.delayMs = 0; db.failNext = true;
  const failed = await s.create({ email: 'arun_aps5556@avvaiyarpadasalai.org', role: 'student' });
  assert.ok(await s.get(failed), 'works on this server');
  db.failNext = true; assert.equal(await s.get('someone-elses-token'), null, 'a failed look-up = sign in again, never an error page');
  assert.equal(logs.length, 1, 'one log line per minute'); assert.match(logs[0], /\[Sessions\] .* still work on this server/);
  assert.ok(!/aps555|@|meena|arun/.test(logs.join('')) && !logs.join('').includes(slow) && !logs.join('').includes(failed));
});
test('hourly clean-up deletes expired rows', async () => {
  let now = 1_800_000_000_000; const db = new MemorySessionDb();
  const s = new DurableSessionStore(db, TTL, () => now, () => {});
  await s.create({ email: 'a@avvaiyarpadasalai.org', role: 'teacher' });
  now += TTL * 1000; await s.create({ email: 'b@avvaiyarpadasalai.org', role: 'teacher' });
  now += 1; s.start(3_600_000); s.stop(); await new Promise((r) => setImmediate(r));
  assert.equal(db.rows.size, 1, 'the expired one deleted, the fresh one kept');
});
test('Azure SQL: table created once; parameterised queries only; token never in SQL text', async () => {
  const qs: string[] = []; const inputs: unknown[] = [];
  const req = () => { const r: any = { input: (_n: string, _t: unknown, v: unknown) => { inputs.push(v); return r; }, query: async (q: string) => { qs.push(q); return { recordset: [{ email: 'e@x', role: 'admin', issued_at: new Date(1), expires_at: new Date(9e12) }], rowsAffected: [2] }; } }; return r; };
  const sql: any = { Char: () => 0, NVarChar: () => 0, DateTime2: () => 0 };
  const db = new MssqlSessionDb(async () => ({ request: req }) as any, sql);
  await db.put('a'.repeat(64), { email: 'e@x', role: 'admin', issuedAt: 1, expiresAt: 2 });
  assert.deepEqual(await db.get('a'.repeat(64), 5), { email: 'e@x', role: 'admin', issuedAt: 1, expiresAt: 9e12 });
  await db.del('a'.repeat(64)); assert.equal(await db.sweep(5), 2);
  assert.equal(qs.filter((q) => /CREATE TABLE dbo\.app_session/.test(q)).length, 1, 'created once');
  assert.ok(qs.every((q) => !q.includes('aaaa') && !q.includes('e@x')), 'values only as parameters');
});

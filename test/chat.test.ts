/** Phase 3 step 4 (v0.16.0): chat owner — store rules, version, retention, SQL text. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatOwner } from '../src/db/chatOwner';
import { MemoryChatStore, MssqlChatStore } from '../src/db/chatStore';

test('import only when empty; newest 200 of the last 10 days; prune; version from newest / oldest id; database down → "not available" (never Sheet data)', async () => {
  let now = 1_800_000_000_000; const store = new MemoryChatStore();
  const sheet = [['Timestamp', 'Email', 'Role', 'Name', 'Message', 'Class Name']].concat(
    Array.from({ length: 230 }, (_v, i) => [new Date(now - (230 - i) * 60_000).toISOString(), 'a@x.org', 'teacher', 'A', 'm' + i, 'C'] as any));
  sheet.push([new Date(now - 11 * 86_400_000), 'old@x.org', 'admin', 'O', 'old', ''] as any, ['', '', '', '', '', ''] as any);
  const o = new ChatOwner(store, async () => {}, () => now, () => {});
  await o.start(async () => sheet, 3_600_000); o.stop();
  assert.equal(store.rows.length, 230, 'old and blank rows skipped');
  const l = await o.list(); assert.equal(l.length, 200); assert.equal(l[0].message, 'm30'); assert.equal(l[199].message, 'm229');
  const v1 = o.version(); assert.equal(v1, 'v230.1');
  const o2 = new ChatOwner(store, async () => {}, () => now, () => {}); let read = 0;
  await o2.start(async () => { read++; return sheet; }, 3_600_000); o2.stop(); assert.equal(read, 0, 'not copied again'); assert.equal(store.rows.length, 230);
  now += 10 * 86_400_000 - 60 * 60_000; await store.prune(now - 10 * 86_400_000); await o.refreshVersion();
  assert.ok(store.rows.length < 230 && o.version() !== v1, 'pruned; version changed');
  store.failNext = true; await assert.rejects(o.list());
  const off = new ChatOwner(new MemoryChatStore(), async () => {}, () => now, () => {}); await assert.rejects(off.list(), /not available/);
});
test('SQL: table + index created once; parameterised only; newest N selected then ordered oldest first', async () => {
  const qs: string[] = [];
  const req = () => { const r: any = { input: () => r, query: async (q: string) => { qs.push(q); return { recordset: [{ id: 5, mx: 5, mn: 1, n: 5 }], rowsAffected: [1] }; } }; return r; };
  const s = new MssqlChatStore(async () => ({ request: req }) as any, { DateTime2: () => 0, NVarChar: () => 0, Int: 0 } as any);
  await s.add({ createdAt: 1, email: 'e@x.org', role: 'admin', name: 'N', message: "hi'); DROP TABLE x;--", className: '' });
  await s.list(0, 200); await s.stamp(0); await s.prune(0);
  assert.equal(qs.filter((q) => /CREATE TABLE dbo\.chat_message/.test(q)).length, 1);
  assert.ok(qs.some((q) => /SELECT TOP \(@k\) \* FROM dbo\.chat_message WHERE created_at > @s ORDER BY id DESC\) x ORDER BY id ASC/.test(q)));
  assert.ok(qs.every((q) => !q.includes('DROP TABLE x') && !q.includes('e@x.org')), 'values only as parameters');
});

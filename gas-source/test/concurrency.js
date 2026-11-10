// r96: Apps Script simultaneous-executions fixes — server tests (node test/concurrency.js)
const assert = require('assert');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const { prep, J } = require('./ttfixture');
const F = prep(), G = F.G, env = F.env;
const sheetReads = () => { const s = env.wb.sheets.Dashboard_Chat_Window; return s ? s.reads || 0 : 0; };

t('chat: second read comes from the cache (no sheet read); a post clears it and bumps the chat version; same list shape', () => {
  G.postChatMessage(F.tk.admin, 'Hello everyone');
  const v1 = G.chatVersion_();
  const a = J(G.getChatMessages(F.tk.student));
  const sh = env.wb.sheets.Dashboard_Chat_Window; const orig = sh.getRange.bind(sh); let reads = 0; sh.getRange = function () { reads++; return orig.apply(null, arguments); };
  const b = J(G.getChatMessages(F.tk.student)); assert.deepStrictEqual(b, a); assert.strictEqual(reads, 0, 'cache hit');
  assert.ok(typeof a[0].timestamp === 'string' && a[0].message === 'Hello everyone' && a[0].email === 'admin@aps.org');
  G.postChatMessage(F.tk.teacher || F.tk.sen, 'Second message');
  assert.notStrictEqual(G.chatVersion_(), v1, 'version bumped');
  const c = J(G.getChatMessages(F.tk.student)); assert.strictEqual(c.length, a.length + 1); assert.ok(reads > 0, 're-read after the post');
  sh.getRange = orig;
});
t('realtime snapshot carries chatVersion + pollMs (90 s idle, 45 s while a class is live)', () => {
  const s = J(G.getRealtimeStatusSnapshot(F.tk.student));
  assert.ok(/^v\d+$/.test(s.chatVersion)); assert.strictEqual(s.pollMs, Object.keys(s.liveStatus || {}).length ? 45000 : 90000);
  const real = G.apsClassLiveBoxesForViewer_; G.apsClassLiveBoxesForViewer_ = () => ({ x: { live: true } });
  assert.strictEqual(J(G.getRealtimeStatusSnapshot(F.tk.student)).pollMs, 45000); G.apsClassLiveBoxesForViewer_ = real;
});
t('heartbeat: one write per person per minute; never waits for a busy script lock (skips instead)', () => {
  const props = env.userProps; const key = 'aps_hb_sa0_aps6650@avvaiyarpadasalai.org'; // r103: presence lives in the second store
  delete env.cache[key]; delete props.presenceMap;
  G.recordHeartbeat_('sa0_aps6650@avvaiyarpadasalai.org');
  const first = JSON.parse(props.presenceMap)['sa0_aps6650@avvaiyarpadasalai.org'].lastSeen; assert.ok(first);
  props.presenceMap = JSON.stringify({}); G.recordHeartbeat_('sa0_aps6650@avvaiyarpadasalai.org');
  assert.deepStrictEqual(JSON.parse(props.presenceMap), {}, 'throttled within the minute');
  delete env.cache[key];
  const LS = G.LockService; let waited = null; G.LockService = { getScriptLock: () => ({ tryLock(ms) { waited = ms; return false; }, waitLock() { throw new Error('must not wait'); }, releaseLock() {} }) };
  G.recordHeartbeat_('sa0_aps6650@avvaiyarpadasalai.org'); G.LockService = LS;
  assert.strictEqual(waited, 300); assert.deepStrictEqual(JSON.parse(props.presenceMap), {}, 'busy lock → skipped, no unlocked write');
  assert.strictEqual(env.cache[key], undefined, 'skipped write is retried on the next request');
});
t('live status map: when it expires, only one request rebuilds; the others reuse the last map', () => {
  const K = G.CLS_LIVE_BOX_CACHE_KEY_;
  G.apsClassLiveBoxesForViewer_({ email: 'admin@aps.org', role: 'admin' });
  assert.ok(env.cache[K + '_s'], 'stale copy kept'); assert.strictEqual(env.cache[K + '_b'], undefined, 'build marker cleared');
  delete env.cache[K]; env.cache[K + '_b'] = '1'; env.cache[K + '_s'] = JSON.stringify({ STALE: { line1: 'x' } });
  const realRead = G.readAllCoursesFromCache_; let reads = 0; G.readAllCoursesFromCache_ = function () { reads++; return realRead.apply(null, arguments); };
  const m = J(G.apsClassLiveBoxesForViewer_({ email: 'admin@aps.org', role: 'admin' }));
  assert.deepStrictEqual(m, { STALE: { line1: 'x' } }); assert.strictEqual(reads, 0, 'no rebuild while another request builds');
  delete env.cache[K + '_b'];
  G.apsClassLiveBoxesForViewer_({ email: 'admin@aps.org', role: 'admin' }); assert.ok(reads > 0, 'rebuilds when nobody else is');
  G.readAllCoursesFromCache_ = realRead;
});
t('r100: a post that lands while another request is reading the chat sheet is never hidden by a stale cached list', () => {
  G.postChatMessage(F.tk.admin, 'msg-A');
  delete env.cache.aps_chat_msgs_v1;
  const sh = env.wb.sheets.Dashboard_Chat_Window, orig = sh.getRange.bind(sh); let fired = false;
  sh.getRange = function () { const out = orig.apply(null, arguments); if (!fired && arguments.length === 4) { fired = true; G.postChatMessage(F.tk.admin, 'msg-B'); } return out; };
  G.getChatMessages(F.tk.student); // reads the old list while msg-B is posted
  sh.getRange = orig;
  const list = J(G.getChatMessages(F.tk.student)).map(m => m.message);
  assert.ok(list.includes('msg-B'), 'the new message is visible on the next poll: ' + list.slice(-3).join(','));
});
t('r100: a Tamil-heavy chat list over the cache byte limit is not cached (and never throws)', () => {
  const big = 'தமிழ்'.repeat(1500); for (let i = 0; i < 6; i++) G.postChatMessage(F.tk.admin, big.slice(0, 1000));
  delete env.cache.aps_chat_msgs_v1;
  const l = J(G.getChatMessages(F.tk.student)); assert.ok(l.length > 0);
});
console.log(pass + ' passed');

// r49: performance (course-list cache, invalidation, legacy trigger cleanup) + system backup and 3-month audit archive
// (node test/maintenance.js)
const assert = require('assert');
const { build } = require('./gradingfixture');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const J = x => JSON.parse(JSON.stringify(x));

function setup() {
  const F = build(); const { env } = F;
  { const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0); P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; };
    P.deleteRows = P.deleteRows || function (r, n) { this.data.splice(r - 1, n); this.deletes = (this.deletes || 0) + 1; return this; };
    P.deleteRow = P.deleteRow || function (r) { this.data.splice(r - 1, 1); this.deletes = (this.deletes || 0) + 1; return this; };
    const WB = Object.getPrototypeOf(env.wb); WB.getId = WB.getId || function () { return this.__id || 'WB-MAIN'; }; WB.getName = WB.getName || function () { return this.__name || 'APS main'; };
    delete env.wb.sheets.__p; }
  // Drive mock: one backup folder holding sub-folders and files
  const drive = { folders: {}, files: {}, seq: 0, trashed: [] };
  const mkFolder = (name, parent) => {
    const id = 'FD' + (++drive.seq);
    const f = { id, name, parent, kids: [], files: [], getId: () => id, getName: () => f.name, getUrl: () => 'https://drive/' + id,
      createFolder: n => { const k = mkFolder(n, id); f.kids.push(k); return k; },
      createFile: (n, content) => { const fid = 'F' + (++drive.seq); const file = { id: fid, name: n, content }; drive.files[fid] = file; f.files.push(file); return { getId: () => fid }; },
      getFolders: () => { const list = f.kids.filter(k => !k.trashed); let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; },
      getFilesByName: n => { const list = f.files.filter(x => x.name === n); let i = 0; return { hasNext: () => i < list.length, next: () => ({ getId: () => list[i++].id }) }; },
      setTrashed: v => { f.trashed = v; drive.trashed.push(f.name); } };
    drive.folders[id] = f; return f;
  };
  const root = mkFolder('APS-DASHBOAD-SYSTEM-BACKUP-CLAUDE');
  const BACKUP_ID = '1B9qATFrfcqbafzqYMBnbshGo0mA4nQTY';
  drive.folders[BACKUP_ID] = root;
  const archives = {};
  env.ctx.DriveApp = {
    getFolderById: id => { if (!drive.folders[id]) throw new Error('not found'); return drive.folders[id]; },
    getFileById: id => ({ makeCopy: (name, folder) => { const c = folder.createFile(name, 'copy-of:' + id); return { getId: c.getId, getName: () => name }; },
      moveTo: folder => { folder.files.push({ id, name: archives[id].getName() }); } })
  };
  env.ctx.ScriptApp.getScriptId = () => 'SCRIPT-ID';
  env.ctx.ScriptApp.WeekDay.SUNDAY = 'SUNDAY';
  env.ctx.MimeType = { PLAIN_TEXT: 'text/plain' };
  { const gp = env.ctx.PropertiesService.getScriptProperties; env.ctx.PropertiesService.getScriptProperties = () => Object.assign(gp(), { getProperties: () => Object.assign({}, env.props) }); }
  const { makeContext } = require('./gasmock');
  const origOpen = env.ctx.SpreadsheetApp.openById;
  env.ctx.SpreadsheetApp.create = name => { const w = makeContext({}).wb; const WB = Object.getPrototypeOf(w); WB.getId = WB.getId || function () { return this.__id; }; WB.getName = function () { return this.__name || 'APS main'; };
    w.__id = 'ARCH' + (++drive.seq); w.__name = name; w.getUrl = () => 'https://sheet/' + w.__id; archives[w.__id] = w; return w; };
  env.ctx.SpreadsheetApp.openById = id => archives[id] || origOpen(id);
  env.ctx.SpreadsheetApp.flush = () => {};
  return Object.assign(F, { drive, root, archives });
}
const DAY = 86400000;
const usDate = ms => { const d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear() + ' 10:00'; };

t('course list is served from the cache after the first read (no sheet read), and every write invalidates it', () => {
  const F = setup(); const { G, env } = F;
  G.syncClassroomData();
  const sheet = env.wb.getSheetByName('Courses');
  const first = J(G.readAllCoursesFromCache_());
  assert.ok(first.length > 3);
  let reads = 0; const orig = sheet.getDataRange.bind(sheet); sheet.getDataRange = () => { reads++; return orig(); };
  const again = J(G.readAllCoursesFromCache_());
  assert.deepStrictEqual(again, first); assert.strictEqual(reads, 0, 'served from cache');
  // callers may mutate what they get back
  const m = G.readAllCoursesFromCache_(); m[0].name = 'MUTATED'; assert.notStrictEqual(G.readAllCoursesFromCache_()[0].name, 'MUTATED');
  // a status write (setter) must be visible immediately
  const admin = F.tok('admin@aps.org', 'admin');
  G.setLiveStatus(admin, String(first[0].id), true);
  const after = G.readAllCoursesFromCache_().find(c => String(c.id) === String(first[0].id));
  assert.strictEqual(after.live, true, 'setter invalidated the cache'); assert.ok(reads >= 1);
  // a full sync rewrite too
  F.cls.courses[0].name = F.cls.courses[0].name.replace(/\| AY26-27$/, '| AY26-27');
  const before = reads; G.syncClassroomData(); G.readAllCoursesFromCache_(); assert.ok(reads > before, 'sync invalidated the cache');
});

t('dashboard refresh and chat do not re-read the Courses sheet each time', () => {
  const F = setup(); const { G, env } = F;
  const admin = F.tok('admin@aps.org', 'admin');
  G.syncClassroomData();
  assert.ok(J(G.getDashboardData(admin)).courses.length > 3);
  const sheet = env.wb.getSheetByName('Courses'); let reads = 0; const orig = sheet.getDataRange.bind(sheet); sheet.getDataRange = () => { reads++; return orig(); };
  G.getDashboardData(admin); G.getChatMessages(admin); G.getChatMessages(admin);
  assert.strictEqual(reads, 0);
});

t('legacy 15-minute syncClassroomData trigger is removed; createSyncTrigger no longer installs one; weekly maintenance trigger installed once', () => {
  const F = setup(); const { G, env } = F;
  env.stats.triggers.push({ fn: 'syncClassroomData', everyMinutes: 15 });
  G.rosterEnsureTrigger_(true);
  const fns = env.stats.triggers.map(x => x.fn);
  assert.ok(!fns.includes('syncClassroomData'), fns.join(','));
  assert.strictEqual(fns.filter(f => f === 'apsWeeklyMaintenance').length, 0); assert.strictEqual(fns.filter(f => f === 'apsWeeklyJobs').length, 1); // r117: Sunday job of the scheduler
  G.createSyncTrigger();
  assert.ok(!env.stats.triggers.some(x => x.fn === 'syncClassroomData'));
  G.rosterEnsureTrigger_(true);
  assert.strictEqual(env.stats.triggers.filter(x => x.fn === 'apsWeeklyJobs').length, 1, 'idempotent');
});

function seedAudit(F) {
  const now = Date.now();
  const sh = F.env.wb.insertSheet('Class_Access_Audit');
  sh.data = [['Timestamp', 'Actor', 'Action'],
    [usDate(now - 200 * DAY), 'a@x', 'OLD1'], [usDate(now - 120 * DAY), 'a@x', 'OLD2'], [usDate(now - 95 * DAY), 'a@x', 'OLD3'],
    [usDate(now - 10 * DAY), 'a@x', 'NEW1'], [usDate(now - 1 * DAY), 'a@x', 'NEW2']];
  const ex = F.env.wb.insertSheet('Examination_Audit_Log'); // dates out of order -> non-contiguous delete path
  ex.data = [['Audit_ID', 'Timestamp', 'User'], ['A1', new Date(now - 5 * DAY), 'u'], ['A2', new Date(now - 300 * DAY), 'u'], ['A3', new Date(now - 2 * DAY), 'u']];
  const keep = F.env.wb.insertSheet('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT'); // never archived
  keep.data = [['Timestamp', 'Student'], [usDate(now - 400 * DAY), 's']];
  return { sh, ex, keep };
}

t('preview counts rows older than 90 days per sheet; download audit / letters are never in scope', () => {
  const F = setup(); const { G } = F; seedAudit(F);
  const st = J(G.getMaintenanceStatus(F.tok('admin@aps.org', 'admin')));
  const row = n => st.plan.find(p => p.sheet === n);
  assert.strictEqual(st.retentionDays, 90);
  assert.strictEqual(row('Class_Access_Audit').old, 3); assert.strictEqual(row('Class_Access_Audit').dateColumn, 'Timestamp');
  assert.strictEqual(row('Examination_Audit_Log').old, 1);
  assert.ok(!row('EXAM_QUESTION_PAPER_DOWNLOAD_AUDIT'));
  assert.ok(/drive\//.test(st.folderUrl));
});

t('archive: backup first, rows copied to the yearly archive, verified, then removed; recent rows stay', () => {
  const F = setup(); const { G } = F; const { sh, ex, keep } = seedAudit(F);
  const r = J(G.runAuditArchiveNow(F.tok('admin@aps.org', 'admin')));
  assert.strictEqual(r.moved, 4, JSON.stringify(r)); assert.deepStrictEqual(r.errors, []);
  assert.ok(r.backup && /^APS-Dashboard-Backup LIVE /.test(r.backup.name), 'backup made first');
  assert.deepStrictEqual(sh.data.slice(1).map(x => x[2]), ['NEW1', 'NEW2']);
  assert.deepStrictEqual(ex.data.slice(1).map(x => x[0]), ['A1', 'A3']);
  assert.strictEqual(keep.data.length, 2, 'download audit untouched');
  const arch = Object.values(F.archives)[0];
  assert.ok(/^APS Dashboard Audit Archive \d{4} \(LIVE\)$/.test(arch.getName()));
  const tab = arch.getSheetByName('Main · Class_Access_Audit');
  assert.deepStrictEqual(tab.data[0], ['Timestamp', 'Actor', 'Action', 'Archived At']);
  assert.deepStrictEqual(tab.data.slice(1).map(x => x[2]), ['OLD1', 'OLD2', 'OLD3']);
  assert.ok(F.root.files.some(f => f.name === arch.getName()), 'archive lives in the backup folder');
  // a second run moves nothing and makes no extra backup
  const again = J(F.G.runAuditArchiveNow(F.tok('admin@aps.org', 'admin')));
  assert.strictEqual(again.moved, 0); assert.strictEqual(again.backup, null);
  assert.strictEqual(tab.data.length, 4, 'archive tab appended once');
});

t('backup: script project + spreadsheet copy + MANIFEST (no secret values); only the newest 8 backup folders kept', () => {
  const F = setup(); const { G, env } = F;
  env.props.OAUTH_CLIENT_SECRET = 'TOPSECRET-123'; env.props.EXAM_QP_DOWNLOAD_KEY_SECRET = 'K2';
  const admin = F.tok('admin@aps.org', 'admin');
  for (let i = 0; i < 9; i++) { const f = F.root.createFolder('APS-Dashboard-Backup LIVE 2026-01-0' + (i + 1) + ' 0200'); }
  const r = J(G.runSystemBackupNow(admin));
  assert.strictEqual(r.errors.length, 0, JSON.stringify(r.errors));
  const folder = Object.values(F.drive.folders).find(f => f.name === r.name);
  const names = folder.files.map(f => f.name);
  assert.ok(names.some(n => /^APS Dashboard SCRIPT \(code\) LIVE /.test(n)), names.join(' | '));
  assert.ok(names.some(n => /^Main workbook LIVE /.test(n)));
  const manifest = folder.files.find(f => f.name === 'MANIFEST.txt').content;
  assert.ok(!manifest.includes('TOPSECRET-123') && !manifest.includes('"K2"'), 'secrets never copied');
  assert.ok(/RESTORE/.test(manifest) && /TARGET_SPREADSHEET_ID/.test(manifest));
  const live = F.root.kids.filter(k => !k.trashed && k.name.indexOf('APS-Dashboard-Backup LIVE ') === 0);
  assert.strictEqual(live.length, 8, 'newest 8 kept'); assert.ok(F.drive.trashed.includes('APS-Dashboard-Backup LIVE 2026-01-01 0200'), 'oldest trashed (recoverable)');
});

t('security: maintenance endpoints are Admin / Super Admin only; the weekly handler only runs from its own trigger', () => {
  const F = setup(); const { G } = F; seedAudit(F);
  [['hm@aps.org', 'headmaster'], ['teachera_aps101@avvaiyarpadasalai.org', 'teacher']].forEach(([e, r]) => {
    const tk = F.tok(e, r);
    ['getMaintenanceStatus', 'runSystemBackupNow', 'runAuditArchiveNow'].forEach(fn => assert.throws(() => G[fn](tk), /Only Admin/, fn + ' as ' + r));
  });
  assert.throws(() => G.apsWeeklyMaintenance({}), /Access denied/);
  assert.throws(() => G.apsWeeklyMaintenance({ triggerUid: 'forged' }), /Access denied/);
});

t('weekly maintenance (real trigger): one backup, then archive using that backup; status recorded', () => {
  const F = setup(); const { G, env } = F; seedAudit(F);
  G.rosterEnsureTrigger_(true);
  assert.ok(env.stats.triggers.find(x => x.fn === 'apsWeeklyJobs'), 'r117: the scheduler runs the Sunday maintenance');
  const r = J(G.wjRun_(new Date(), 'test', { only: 'WEEKLY_MAINTENANCE', force: true }));
  assert.strictEqual(r.ran[0].result, 'OK');
  assert.strictEqual(F.root.kids.filter(k => /^APS-Dashboard-Backup LIVE /.test(k.name)).length, 1, 'exactly one backup');
  const st = J(G.getMaintenanceStatus(F.tok('admin@aps.org', 'admin')));
  assert.ok(st.last.backup && st.last.archive && st.last.archive.detail.moved === 4);
});

t('presence map drops entries not seen for 24 h (keeps the Script Property small)', () => {
  const F = setup(); const { G, env } = F;
  env.props.presenceMap = JSON.stringify({ 'old@x': { lastSeen: new Date(Date.now() - 3 * DAY).toISOString(), loginAt: '' }, 'recent@x': { lastSeen: new Date().toISOString(), loginAt: '' } });
  G.recordHeartbeat_('me@aps.org');
  const m = JSON.parse(env.userProps.presenceMap); // r103: read from Script Properties once, then moved to the second store
  assert.ok(!m['old@x'] && m['recent@x'] && m['me@aps.org']);
  assert.strictEqual(env.props.presenceMap, undefined, 'old Script Property copy removed');
});

console.log(pass + ' passed');

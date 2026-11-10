// Performance profile (not a pass/fail test): counts Sheet / property / cache / Classroom calls and payload for the hot paths.
const { setup } = require('../test/coveragefixture');
const { Sheet } = require('../test/gasmock');
const F = setup(); const { G, env } = F;
const C = {}; const inc = k => { C[k] = (C[k] || 0) + 1; };
const wrapProto = (P, names, pre) => names.forEach(n => { if (typeof P[n] !== 'function') return; const o = P[n]; P[n] = function () { inc(pre + n + (n === 'getRange' || n === 'getValues' ? '' : '') + (this.name ? '' : '')); if (n === 'getValues' || n === 'getValue' || n === 'getDisplayValues') inc('READ:' + (this.__sheet || '?')); return o.apply(this, arguments); }; });
wrapProto(Sheet.prototype, ['getRange', 'getDataRange', 'getLastRow', 'getLastColumn', 'appendRow', 'deleteRows', 'insertSheet'], 'sheet.');
// ranges
const sh0 = env.wb.insertSheet('__x'); const R = Object.getPrototypeOf(sh0.getRange(1, 1)); delete env.wb.sheets.__x;
['getValues', 'getValue', 'getDisplayValues', 'setValues', 'setValue'].forEach(n => { if (!R[n]) return; const o = R[n]; R[n] = function () { inc('range.' + n); inc((/^set/.test(n) ? 'WRITE:' : 'READ:') + ((this.sheet && this.sheet.name) || (this.sh && this.sh.name) || '?')); return o.apply(this, arguments); }; });
const WB = Object.getPrototypeOf(env.wb); ['getSheetByName'].forEach(n => { const o = WB[n]; WB[n] = function () { inc('wb.' + n); return o.apply(this, arguments); }; });
const SS = G.SpreadsheetApp; ['openById', 'getActiveSpreadsheet', 'openByUrl'].forEach(n => { if (!SS[n]) return; const o = SS[n].bind(SS); SS[n] = function () { inc('ss.' + n); return o.apply(null, arguments); }; });
const wrapStore = (get, label) => { const st = get(); ['getProperty', 'getProperties', 'setProperty', 'deleteProperty', 'getKeys'].forEach(n => { const o = st[n]; if (!o) return; st[n] = function () { inc(label + '.' + n); return o.apply(st, arguments); }; }); return st; };
const sp = wrapStore(() => G.PropertiesService.getScriptProperties(), 'sp'); G.PropertiesService.getScriptProperties = () => sp;
const up = wrapStore(() => G.PropertiesService.getUserProperties(), 'up'); G.PropertiesService.getUserProperties = () => up;
const cache = G.CacheService.getScriptCache(); ['get', 'getAll', 'put', 'putAll', 'remove'].forEach(n => { const o = cache[n]; if (!o) return; cache[n] = function () { inc('cache.' + n); return o.apply(cache, arguments); }; }); G.CacheService.getScriptCache = () => cache;
const walk = (o, p) => Object.keys(o || {}).forEach(k => { const v = o[k]; if (typeof v === 'function') { o[k] = function () { inc('API:' + p + '.' + k); return v.apply(this, arguments); }; } else if (v && typeof v === 'object' && p.split('.').length < 4) walk(v, p + '.' + k); });
walk(G.Classroom, 'Classroom'); if (G.UrlFetchApp) walk(G.UrlFetchApp, 'UrlFetch'); if (G.AdminReports) walk(G.AdminReports, 'Reports');
const run = (label, fn) => { Object.keys(C).forEach(k => delete C[k]); const t = Date.now(); const out = fn(); const ms = Date.now() - t; const kb = out === undefined ? 0 : (JSON.stringify(out).length / 1024).toFixed(1);
  const reads = Object.keys(C).filter(k => /^READ:/.test(k)).map(k => k.slice(5) + '×' + C[k]).join(', ');
  console.log('\n== ' + label + ' — ' + ms + ' ms (mock), payload ' + kb + ' KB');
  console.log('   ' + Object.keys(C).filter(k => !/^READ:|^WRITE:/.test(k)).sort().map(k => k + '=' + C[k]).join('  '));
  console.log('   sheet reads: ' + (reads || 'none')); const w = Object.keys(C).filter(k => /^WRITE:/.test(k)).map(k => k.slice(6) + '×' + C[k]).join(', '); if (w) console.log('   sheet writes: ' + w); };
const memo = () => { try { G.ROSTER_MEMO_ = {}; G.UC_MEMO_ = null; } catch (e) {} };
for (const role of ['admin', 'teacher', 'student']) {
  memo(); run('getDashboardData ' + role + ' (1st)', () => G.getDashboardData(F.tok2[role]));
  memo(); run('getDashboardData ' + role + ' (2nd, warm cache)', () => G.getDashboardData(F.tok2[role]));
}
memo(); run('getRealtimeStatusSnapshot admin', () => G.getRealtimeStatusSnapshot(F.tok2.admin));
memo(); run('getRealtimeStatusSnapshot student', () => G.getRealtimeStatusSnapshot(F.tok2.student));
if (G.getStartupBundle) { memo(); try { run('getStartupBundle admin', () => G.getStartupBundle(F.tok2.admin, ['getLastSyncInfo', 'getCourseNameSuffix', 'getShowContactPhone', 'getMyCountryPreference'].map(n => ({ name: n, args: [] })))); } catch (e) { console.log('bundle: ' + e.message); } }
memo(); try { run('getChatMessages admin', () => G.getChatMessages(F.tok2.admin)); } catch (e) { console.log('chat: ' + e.message); }

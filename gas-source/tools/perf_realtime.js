// Performance measurement (not pass/fail): realtime poll payload / service calls with production-sized data.
const { setup } = require('../test/coveragefixture');
const F = setup(); const { G, env } = F;
const now = Date.now(), iso = ms => new Date(ms).toISOString(), D = '@avvaiyarpadasalai.org';
const courses = G.readAllCoursesFromCache_(); const people = [...new Set(courses.flatMap(c => (c.students || []).concat(c.teachers || [])).map(p => p.email.toLowerCase()))];
const ll = {}, pres = {}, ext = {}, av = {};
for (let i = 0; i < 1500; i++) { const e = i < people.length ? people[i] : 'student' + i + '_aps' + (3000 + i) + D; ll[e] = { gc: iso(now - (i % 90) * 864e5), gm: i % 2 ? iso(now - (i % 60) * 864e5) : undefined, db: iso(now - (i % 30) * 864e5 - i * 1000) }; if (!ll[e].gm) delete ll[e].gm; }
people.slice(0, 40).forEach((e, i) => { pres[e] = { lastSeen: iso(now - i * 60e3), loginAt: iso(now - 3600e3) }; ll[e].db = iso(now - i * 30e3); });
for (let i = 0; i < 300; i++) { const e = i < people.length ? people[i] : 'x' + i + D; ext[e] = { gm: iso(now - (i % 48) * 3600e3), gc: iso(now - (i % 24) * 3600e3) }; }
const wk = G.getCurrentWeekId_(); courses.forEach(c => { av[wk + '|' + c.id] = { weekId: wk, courseId: c.id, status: 'CONFIRMED', alternative: '', updatedAt: iso(now - (Number(c.id) % 5) * 864e5 - 3600e3 * (Number(c.id) % 3 === 0 ? 0 : 1)), updatedByName: 'Teacher Name' }; });
G.apsBigSet_('lastLoginMap', JSON.stringify(ll)); G.apsBigSet_('presenceMap', JSON.stringify(pres));
env.props.externalActivityRealtimeMap_v1 = JSON.stringify(ext); env.props[G.EXTERNAL_ACTIVITY_REALTIME_PROP_KEY] = JSON.stringify(ext); env.props.teacherAvailabilityRealtimeMap = JSON.stringify(av);
const C = {}; const inc = k => C[k] = (C[k] || 0) + 1;
const sp = G.PropertiesService.getScriptProperties(); ['getProperty'].forEach(n => { const o = sp[n]; sp[n] = function () { inc('sp.' + n); return o.apply(sp, arguments); }; }); G.PropertiesService.getScriptProperties = () => sp;
const up = G.PropertiesService.getUserProperties(); ['getProperty'].forEach(n => { const o = up[n]; up[n] = function () { inc('up.' + n); return o.apply(up, arguments); }; }); G.PropertiesService.getUserProperties = () => up;
const ca = G.CacheService.getScriptCache(); ['get', 'put', 'getAll'].forEach(n => { const o = ca[n]; ca[n] = function () { inc('cache.' + n); return o.apply(ca, arguments); }; }); G.CacheService.getScriptCache = () => ca;
const run = (label, fn) => { Object.keys(C).forEach(k => delete C[k]); const t = process.hrtime.bigint(); const out = fn(); const ms = Number(process.hrtime.bigint() - t) / 1e6;
  const j = JSON.stringify(out); const parts = Object.keys(out || {}).filter(k => out[k] && typeof out[k] === 'object').map(k => k + ' ' + (JSON.stringify(out[k]).length / 1024).toFixed(1)).join(', ');
  console.log(label + ': payload ' + (j.length / 1024).toFixed(1) + ' KB [' + parts + '] · ' + ms.toFixed(1) + ' ms mock · ' + Object.keys(C).sort().map(k => k + '=' + C[k]).join(' ')); return out; };
for (const r of ['admin', 'teacher', 'student']) { run('snapshot ' + r + ' 1st', () => G.getRealtimeStatusSnapshot(F.tok2[r])); run('snapshot ' + r + ' 2nd', () => G.getRealtimeStatusSnapshot(F.tok2[r])); }
for (const r of ['admin', 'teacher', 'student']) { run('getDashboardData ' + r, () => G.getDashboardData(F.tok2[r])); }

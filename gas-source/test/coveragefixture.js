// r58: shared fixture for Temporary Class Coverage tests (server + UI)
const { build } = require('./gradingfixture');
const J = x => JSON.parse(JSON.stringify(x));
const D = '@avvaiyarpadasalai.org';
const ID = { EA: '771101', ED: '771102', EB: '771103', EC: '771104', EF_SAT: '771105', N2: '771106', EE_7: '771107' };
// next Friday (New York) at least 1 day ahead, as yyyy-MM-dd
function nextDow(dow, minAhead) {
  const now = new Date(); for (let i = minAhead || 1; i < 15; i++) { const d = new Date(now.getTime() + i * 86400000); const s = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); const w = new Date(s + 'T12:00:00Z').getUTCDay(); if (w === dow) return s; } }
const FRI = nextDow(5, 1), FRI2 = nextDow(5, 8);
function setup(opts) {
  opts = opts || {};
  const F = build({ props: opts.props || {} }); const { env, cls, person, G } = F;
  const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0);
  P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p;
  const T = (k, n) => person('T' + k, n, k + '_aps8' + k.length + '01' + D);
  const tAyana = person('TAY', 'Ayana Nivedida Parthiban', 'ayana_aps8123' + D), tKav = person('TKV', 'Kavitha Raman', 'kavitha_aps8130' + D),
    tSen = person('TSE', 'Senthil Kumar', 'senthil_aps8131' + D), tVp = person('TVP', 'Priya VP', 'priya_aps702' + D), tOther = person('TOT', 'Other T', 'other_aps8140' + D);
  const st = (p, n) => Array.from({ length: n }, (_, i) => person(p + i, 'Stu ' + p + i, 's' + p.toLowerCase() + i + '_aps' + (6000 + i + p.charCodeAt(0) * 10) + D));
  const add = (id, name, teachers, students, desc, room) => { cls.courses.push({ id, name, courseState: 'ACTIVE', ownerId: teachers[0].userId, section: '', description: desc || '', room: room || '' }); cls.teachers[id] = teachers; cls.students[id] = students; };
  add(ID.EA, 'MUNMAZHALAI - EA | FRI 6:30 - 8:00 PM EST | AY26-27', [tAyana, tVp], st('A', 14), 'Teacher: ' + tAyana.profile.emailAddress, 'VP Email: ' + tVp.profile.emailAddress + ' | HM Email: karuna_aps774' + D);
  add(ID.ED, 'MUNMAZHALAI - ED | FRI 6:30 - 8:00 PM EST | AY26-27 ', [tKav], st('D', 12), 'Teacher: ' + tKav.profile.emailAddress + ' Join: https://meet.google.com/abc-defg-hij', '');
  add(ID.EB, 'MUNMAZHALAI - EB | FRI 6:30 - 8:00 PM EST | AY26-27', [tSen], st('B', 15), 'Teacher: ' + tSen.profile.emailAddress, '');
  add(ID.EC, 'MUNMAZHALAI - EC | FRI 6:30 - 8:00 PM EST | AY26-27', [tOther], st('C', 9), 'Teacher: ' + tOther.profile.emailAddress, '');
  add(ID.EF_SAT, 'MUNMAZHALAI - EF | SAT 6:30 - 8:00 PM EST | AY26-27', [tOther], st('F', 5), 'Teacher: ' + tOther.profile.emailAddress + ' meet.google.com/sat-satx-sat', '');
  add(ID.N2, 'NILAI 2 - EA | FRI 6:30 - 8:00 PM EST | AY26-27', [tOther], st('N', 5), 'Teacher: ' + tOther.profile.emailAddress + ' meet.google.com/nnn-nnnn-nnn', '');
  add(ID.EE_7, 'MUNMAZHALAI - EE | FRI 7:30 - 9:00 PM EST | AY26-27', [tOther], st('E', 5), 'Teacher: ' + tOther.profile.emailAddress + ' meet.google.com/eee-eeee-eee', '');
  cls.courses.find(c => c.id === ID.ED).name = 'MUNMAZHALAI - ED | FRI 6:30 - 8:00 PM EST | AY26-27';
  // Google Classroom: get + announcements
  const ann = { store: {}, seq: 0, created: 0, removed: 0, failCreate: null, failRemove: null };
  G.Classroom.Courses.get = id => { const c = cls.courses.find(x => x.id === String(id)); if (!c) throw new Error('Requested entity was not found.'); return J(c); };
  G.Classroom.Courses.Announcements = {
    list(cid) { return { announcements: (ann.store[cid] || []).slice().reverse() }; },
    create(res, cid) { if (ann.failCreate) throw new Error(ann.failCreate); ann.created++; const a = Object.assign({ id: 'AN' + (++ann.seq), state: 'PUBLISHED' }, J(res)); (ann.store[cid] = ann.store[cid] || []).push(a); return a; },
    remove(cid, aid) { if (ann.failRemove) throw new Error(ann.failRemove); const b = (ann.store[cid] || []).length; ann.store[cid] = (ann.store[cid] || []).filter(a => a.id !== aid); if (b === ann.store[cid].length) throw new Error('Requested entity was not found.'); ann.removed++; }
  };
  (ann.store[ID.EA] = []).push({ id: 'OTHER1', text: 'Homework reminder', state: 'PUBLISHED' }); // unrelated — must never be touched
  G.syncClassroomData();
  // EB's Meet only in its class stream (auto mapping); EC has no Meet at all
  const mm = env.wb.getSheetByName('Course_Meet_Link_Map') || env.wb.insertSheet('Course_Meet_Link_Map');
  if (!mm.data[0] || !mm.data[0].length) mm.data[0] = ['Course ID', 'Course Name', 'Meet Link', 'Updated', 'By', 'Source', 'Join Link'];
  mm.data.push([ID.EB, 'EB', 'https://meet.google.com/bbb-bbbb-bbb', '', '', 'AUTO_CLASSROOM_STREAM', '']);
  env.ctx.CacheService.getScriptCache().remove('aps_class_meet_maps_v1');
  F.ann = ann; F.tok2 = { admin: F.tok('admin@aps.org', 'admin'), hm: F.tok('hm@aps.org', 'headmaster'), vp: F.tok(tVp.profile.emailAddress, 'teacher'),
    teacher: F.tok(tKav.profile.emailAddress, 'teacher'), student: F.tok('sa0_aps6650' + D, 'student'), bod: F.tok('bod@aps.org', 'vcfo_amchsts_bod') };
  F.vpEmail = tVp.profile.emailAddress;
  return F;
}
module.exports = { setup, ID, FRI, FRI2, nextDow, D };

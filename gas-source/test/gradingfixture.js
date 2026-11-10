// Shared Google Classroom mock (real pagination, fields masks, call counting) + school fixture for the Grading tests.
const fs = require('fs'); const vm = require('vm');
const { makeContext } = require('./gasmock');
const J = x => JSON.parse(JSON.stringify(x));
function build(opts) {
  opts = opts || {};
  const env = makeContext({ props: opts.props || {} });
  const cls = { courses: [], teachers: {}, students: {}, work: {}, subs: {}, fail: {}, rejectFields: false,
    calls: { courses: 0, teachers: 0, students: 0, work: 0, subs: 0 }, lastWorkArgs: null, lastSubArgs: null };
  const page = (arr, o, key) => { const start = Number(o && o.pageToken || 0); const size = Math.min((o && o.pageSize) || 30, 100); const out = {}; out[key] = J(arr.slice(start, start + size)); if (start + size < arr.length) out.nextPageToken = String(start + size); return out; };
  const fail = (cid, op) => { const f = cls.fail[cid]; if (f && f.op === op) throw new Error(f.msg); };
  const fieldsCheck = o => { if (cls.rejectFields && o && o.fields) throw new Error('Invalid argument: fields'); };
  env.ctx.Classroom = { Courses: {
    list(o) { cls.calls.courses++; return page(cls.courses.filter(c => (o.courseStates || []).includes(c.courseState)), o, 'courses'); },
    Teachers: { list(cid, o) { cls.calls.teachers++; fail(cid, 'teachers'); return page(cls.teachers[cid] || [], o, 'teachers'); } },
    Students: { list(cid, o) { cls.calls.students++; fail(cid, 'students'); return page(cls.students[cid] || [], o, 'students'); } },
    CourseWork: {
      list(cid, o) { cls.calls.work++; cls.lastWorkArgs = J(o); fieldsCheck(o); fail(cid, 'work'); return page((cls.work[cid] || []).filter(w => (o.courseWorkStates || ['PUBLISHED']).includes(w.state)), o, 'courseWork'); },
      StudentSubmissions: { list(cid, wid, o) { cls.calls.subs++; cls.lastSubArgs = [cid, wid, J(o)]; fieldsCheck(o); fail(cid, 'subs'); if (wid !== '-') throw new Error('test expects one stream per classroom'); return page(cls.subs[cid] || [], Object.assign({ pageSize: 100 }, o), 'studentSubmissions'); } }
    }
  } };
  let trigSeq = 0;
  const origNew = env.ctx.ScriptApp.newTrigger;
  env.ctx.ScriptApp.newTrigger = fn => { const b = origNew(fn); const c = b.create; b.create = () => { c(); env.stats.triggers[env.stats.triggers.length - 1].uid = 'U' + (++trigSeq); }; return b; };
  env.ctx.ScriptApp.getProjectTriggers = () => env.stats.triggers.map(x => ({ getHandlerFunction: () => x.fn, getUniqueId: () => x.uid || 'none' }));
  env.ctx.Utilities.base64EncodeWebSafe = s => Buffer.from(Array.isArray(s) ? s.map(x => x & 255) : String(s)).toString('base64url'); // r53: byte arrays too (Gmail API MIME)
  { const f0 = env.ctx.Utilities.formatDate; env.ctx.Utilities.formatDate = (d, tz, p) => p.includes('hh') ? f0(d, tz, p.replace('hh', '\u00b6')).replace('\u00b6', f0(d, tz, 'h').padStart(2, '0')) : f0(d, tz, p); } // mock: 'hh' like Apps Script
  vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), env.ctx, { filename: 'Code.gs' });
  vm.runInContext("HIDDEN_TEACHER_NAMES.push('aps tech support');", env.ctx);

  const person = (uid, name, email) => ({ userId: uid, profile: { id: uid, name: { fullName: name }, emailAddress: email } });
  const P = {
    TA: person('TA', 'Teacher A', 'teachera_aps101@avvaiyarpadasalai.org'), TB: person('TB', 'Teacher B', 'teacherb_aps102@avvaiyarpadasalai.org'),
    ADMIN: person('AD', 'APS Admin', 'admin@aps.org'), HM: person('HMU', 'Head Master', 'hm@aps.org'), SUP: person('SUP', 'APS Tech Support', 'support@avvaiyarpadasalai.org'),
    JOSHUA: person('UJ', 'Joshua Kumar', 'joshua_aps3407@avvaiyarpadasalai.org'), RAJA: person('UR', 'Raja', 'raja_aps1234@avvaiyarpadasalai.org'),
    VANI: person('UV', 'Vani', 'vani_aps2222@avvaiyarpadasalai.org'), MEENA: person('UM', 'Meena', 'meena_aps5555@avvaiyarpadasalai.org')
  };
  const add = (id, name, teachers, students) => { cls.courses.push({ id, name, courseState: 'ACTIVE', ownerId: teachers[0].userId, section: '' }); cls.teachers[id] = teachers; cls.students[id] = students; };
  const ids = { N3EF: '8001', N3EA: '8002', N4AB: '8003', MAZ: '8004', ATTONLY: '8005', BIG: '8006' };
  add(ids.N3EF, 'NILAI 3 - EF | FRI 6:30 - 8:00 PM EST | AY26-27', [P.TA, P.ADMIN, P.SUP], [P.JOSHUA, P.RAJA]);
  add(ids.N3EA, 'NILAI 3 - EA | SAT 12:00 - 1:30 PM EST | AY26-27', [P.TA], [P.JOSHUA]);
  add(ids.N4AB, 'NILAI 4 - AB | SUN 7:30 - 9:00 PM EST | AY26-27', [P.TB, P.HM], [P.JOSHUA, P.VANI]);
  add(ids.MAZ, 'MAZHALAI - CB | FRI 7:30 - 9:00 PM EST | AY26-27', [P.TB], [P.MEENA]);
  add(ids.ATTONLY, 'NILAI 5 - AA | FRI 6:30 - 8:00 PM EST | AY26-27', [P.TB], [person('U5', 'Five', 'five_aps5005@avvaiyarpadasalai.org')]);
  add(ids.BIG, 'NILAI 8 - AB | SAT 12:00 - 1:30 PM EST | AY26-27', [P.TB], Array.from({ length: 150 }, (_, i) => person('B' + i, 'Big ' + i, 'big' + i + '_aps' + (7000 + i) + '@avvaiyarpadasalai.org')));
  for (let i = 1; i <= 110; i++) add(String(9000 + i), 'NILAI ' + (1 + i % 8) + ' - X' + i + ' | FRI 6:30 - 8:00 PM EST | AY26-27', [person('TX' + i, 'Teacher X' + i, 'tx' + i + '_aps' + (300 + i) + '@avvaiyarpadasalai.org')], [person('SX' + i, 'Student X' + i, 'sx' + i + '_aps' + (8000 + i) + '@avvaiyarpadasalai.org')]);
  cls.courses[0].section = 'Teacher: DIYA BALAMURUGAN \ud83d\udcde[630-973-6617] |HM: Karunambikai [\ud83d\udcde+919686457264]'; // Google Classroom "Section" text
  cls.courses.push({ id: '9999', name: 'NILAI 3 - OLD | FRI 6:30 - 8:00 PM EST | AY25-26', courseState: 'ACTIVE' });

  // Assignments: due dates relative to "now" (real clock) so MISSING / ASSIGNED are deterministic.
  const day = 86400000, iso = t => new Date(t).toISOString();
  const due = t => { const d = new Date(t); return { dueDate: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }, dueTime: { hours: d.getUTCHours(), minutes: d.getUTCMinutes() } }; };
  const now = Date.now();
  const W = (id, title, max, createdDaysAgo, dueInDays, extra) => Object.assign({ id, title, workType: 'ASSIGNMENT', state: 'PUBLISHED', creationTime: iso(now - createdDaysAgo * day) }, max === null ? {} : { maxPoints: max }, dueInDays === null ? {} : due(now + dueInDays * day), extra || {});
  cls.work[ids.N3EF] = [W('W1', 'HW_LSN_1', 10, 20, -13), W('W2', 'QUZ_LSN_1', 5, 20, -13, { workType: 'MULTIPLE_CHOICE_QUESTION' }), W('W3', 'ATT_LSN_1', 1, 20, -13), W('W4', 'HW_LSN_2', 10, 6, -1), W('W5', 'QUZ_LSN_2', 5, 6, 3), W('W6', 'Reading Log', null, 2, null), W('WD', 'HW_LSN_9 draft', 10, 1, 5, { state: 'DRAFT' })];
  const H = (state, t) => ({ stateHistory: { state, stateTimestamp: iso(t) } });
  const G = (pts, t) => ({ gradeHistory: { pointsEarned: pts, gradeTimestamp: iso(t), gradeChangeType: 'ASSIGNED_GRADE_POINTS_EARNED_CHANGE' } });
  cls.subs[ids.N3EF] = [
    { courseWorkId: 'W1', userId: 'UJ', state: 'RETURNED', assignedGrade: 9, submissionHistory: [H('CREATED', now - 20 * day), H('TURNED_IN', now - 16 * day), G(9, now - 12 * day), H('RETURNED', now - 12 * day)] },
    { courseWorkId: 'W2', userId: 'UJ', state: 'RETURNED', assignedGrade: 5, submissionHistory: [H('TURNED_IN', now - 19 * day), G(5, now - 19 * day), H('RETURNED', now - 19 * day)] },
    { courseWorkId: 'W3', userId: 'UJ', state: 'RETURNED', assignedGrade: 1 },                                  // attendance -> ignored
    { courseWorkId: 'W4', userId: 'UJ', state: 'TURNED_IN', late: true, submissionHistory: [H('TURNED_IN', now - 0.5 * day)] },
    { courseWorkId: 'W5', userId: 'UJ', state: 'CREATED' },
    { courseWorkId: 'W1', userId: 'UR', state: 'TURNED_IN', draftGrade: 8, submissionHistory: [H('TURNED_IN', now - 14 * day)] },
    { courseWorkId: 'W2', userId: 'UR', state: 'RECLAIMED_BY_STUDENT' },
    { courseWorkId: 'W4', userId: 'UR', state: 'NEW' }                                                          // past due, not turned in -> MISSING
  ];
  cls.work[ids.N3EA] = [W('E1', 'HW_LSN_1', 10, 20, -13)];
  cls.subs[ids.N3EA] = [{ courseWorkId: 'E1', userId: 'UJ', state: 'RETURNED', assignedGrade: 7 }];
  cls.work[ids.N4AB] = [W('F1', 'HW_LSN_1', 20, 20, -13)];
  cls.subs[ids.N4AB] = [{ courseWorkId: 'F1', userId: 'UJ', state: 'RETURNED', assignedGrade: 18 }, { courseWorkId: 'F1', userId: 'UV', state: 'RETURNED', assignedGrade: 15 }];
  cls.work[ids.MAZ] = [W('M1', 'HW_LSN_1', 10, 20, -13)];
  cls.subs[ids.MAZ] = [{ courseWorkId: 'M1', userId: 'UM', state: 'RETURNED', assignedGrade: 10 }];
  cls.work[ids.ATTONLY] = [W('A1', 'ATT_LSN_1', 1, 3, -2), W('A2', 'att lsn 2', 1, 1, 1)];
  cls.work[ids.BIG] = [W('B1', 'HW_LSN_1', 10, 9, -2)];
  cls.subs[ids.BIG] = Array.from({ length: 150 }, (_, i) => ({ courseWorkId: 'B1', userId: 'B' + i, state: 'RETURNED', assignedGrade: i % 11 }));

  const tok = (email, role) => { const k = 'tok_' + email; env.cache['aps_sess_' + k] = JSON.stringify({ email, role }); return k; };
  return { env, cls, ids, P, person, tok, J, G: env.ctx };
}
module.exports = { build };

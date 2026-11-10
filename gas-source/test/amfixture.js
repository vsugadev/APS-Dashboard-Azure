// r85: shared fixture for the Assignment Monitoring tests (server + UI) — the Grading fixture plus a few monitored items
const { build } = require('./gradingfixture');
const J = x => JSON.parse(JSON.stringify(x));
const D = '@avvaiyarpadasalai.org';
function setup(opts) {
  opts = opts || {};
  const F = build({ props: Object.assign({ TICKET_MAIL_OAUTH_CLIENT_ID: 'cid', TICKET_MAIL_OAUTH_CLIENT_SECRET: 'cs', TICKET_MAIL_REFRESH_TOKEN: 'rt' }, opts.props || {}) });
  const { env, cls, ids, person, G } = F;
  const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0);
  P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p;
  const day = 86400000, now = Date.now(), iso = t => new Date(t).toISOString();
  const due = t => { const d = new Date(t); return { dueDate: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }, dueTime: { hours: d.getUTCHours(), minutes: d.getUTCMinutes() } }; };
  // a class VP (teacher account, Room "VP Email:") for NILAI 3 - EF
  const vp = person('VPX', 'Vani VP', 'vanivp_aps990' + D);
  cls.teachers[ids.N3EF].push(vp);
  cls.courses.find(c => c.id === ids.N3EF).room = 'VP Email: vanivp_aps990' + D;
  cls.courses.find(c => c.id === ids.N3EF).description = 'Teacher: teachera_aps101' + D;
  // HW_LSN_3 due in ~30 h (first reminder window), HW-05 (hyphen style), and a "Reading Log" style item
  cls.work[ids.N3EF].push(Object.assign({ id: 'W7', title: 'HW_LSN_3', workType: 'ASSIGNMENT', state: 'PUBLISHED', maxPoints: 10, creationTime: iso(now - day) }, due(now + 30 * 3600000)));
  cls.work[ids.N3EF].push(Object.assign({ id: 'W8', title: 'HW-05', workType: 'ASSIGNMENT', state: 'PUBLISHED', maxPoints: 10, creationTime: iso(now - 3 * day) }, due(now - 2 * day)));
  cls.subs[ids.N3EF].push({ courseWorkId: 'W7', userId: 'UJ', state: 'CREATED' }, { courseWorkId: 'W7', userId: 'UR', state: 'TURNED_IN', submissionHistory: [{ stateHistory: { state: 'TURNED_IN', stateTimestamp: iso(now - 3600000) } }] },
    { courseWorkId: 'W8', userId: 'UJ', state: 'CREATED', assignedGrade: 0 }, { courseWorkId: 'W8', userId: 'UR', state: 'CREATED', assignedGrade: 10 });
  G.syncClassroomData();
  F.admin = F.tok('admin@aps.org', 'admin'); F.sa = F.tok('super@aps.org', 'superadmin'); F.hm = F.tok('hm@aps.org', 'headmaster');
  F.teacherA = F.tok('teachera_aps101' + D, 'teacher'); F.teacherB = F.tok('teacherb_aps102' + D, 'teacher'); F.vp = F.tok('vanivp_aps990' + D, 'teacher');
  F.student = F.tok('raja_aps1234' + D, 'student'); F.bod = F.tok('bod@aps.org', 'vcfo_amchsts_bod');
  F.sync = () => J(G.syncGrading(F.admin, { refreshRoster: true }));
  F.sync();
  F.am = (tk, o) => J(G.getAssignmentMonitoring(tk, o || {}));
  F.mails = re => env.stats.mails.filter(m => re.test(m.subject));
  F.sheet = n => { const s = env.wb.getSheetByName(n); return s ? s.getDataRange().getValues() : []; };
  F.cfg = c => J(G.saveAssignmentMonitoringConfig(F.admin, Object.assign(J(G.getAssignmentMonitoringAdmin(F.admin)).config, c)));
  F.D = D; F.day = day;
  return F;
}
module.exports = { setup, J, D };

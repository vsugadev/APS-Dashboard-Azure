// r89: shared fixture for Classes → Temp Teacher tests (server + UI)
const J = x => JSON.parse(JSON.stringify(x));
const { setup, ID, D } = require('./coveragefixture');
const NY = d => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const TODAY = NY(new Date()), addDays = (ymd, n) => NY(new Date(Date.parse(ymd + 'T16:00:00Z') + n * 86400000));
/** A Date whose New York wall time is `ymd` at `hour`:30. */
const at = (ymd, hour) => { for (const off of [4, 5]) { const d = new Date(Date.parse(ymd + 'T' + String(hour).padStart(2, '0') + ':30:00Z') + off * 3600000); const p = d.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' }); if (NY(d) === ymd && Number(p.split(', ')[1]) % 24 === hour) return d; } throw new Error('no time'); };
const TCS = 'tcs_aps9001' + D, SEN = 'senthil_aps8131' + D, AYANA = 'ayana_aps8123' + D, VP = 'priya_aps702' + D, HM = 'karuna_aps774' + D, ADMIN = 'admin@avvaiyarpadasalai.org';
const SUPRITHA = 'tcs_supritha_aps8093' + D;
const REASON = 'Primary teacher is travelling for two weeks this month.';

function prep() {
  const F = setup({ props: { TICKET_MAIL_OAUTH_CLIENT_ID: 'cid', TICKET_MAIL_OAUTH_CLIENT_SECRET: 'cs', TICKET_MAIL_REFRESH_TOKEN: 'rt' } }), G = F.G, cls = F.cls;
  cls.teachers[ID.EF_SAT].push({ userId: 'TCS1', profile: { id: 'TCS1', name: { fullName: 'Tamil Cover Sakthi' }, emailAddress: TCS } }); // an On-Call (TCS) teacher the dashboard knows
  { const sh = F.env.wb.insertSheet('TCS_ONCALL_TEACHER_LIST'); // r97: the on-call invite list (column E = APS email)
    sh.data[0] = ['No', 'Teacher Name', 'Phone', 'Status', 'APS Email']; sh.data[1] = ['1', 'Tamil Cover Sakthi', '', 'Active', TCS];
    sh.data[2] = ['2', 'Supritha Ramesh', '', 'Active', SUPRITHA]; sh.data[3] = ['3', 'Bad row', '', '', 'not-an-email']; sh.data[4] = ['4', 'Outside', '', '', 'someone@gmail.com']; sh.data[5] = ['5', 'Dup', '', '', TCS.toUpperCase()]; }
  G.syncClassroomData();
  const api = { create: [], remove: [], students: 0, failCreate: null, failRemove: null, failGet: null };
  const find = (cid, e) => (cls.teachers[cid] || []).find(x => x.profile.emailAddress.toLowerCase() === String(e).toLowerCase());
  Object.assign(G.Classroom.Courses.Teachers, {
    get(cid, e) { if (api.failGet) throw new Error(api.failGet); const x = find(cid, e); if (!x) throw new Error('Requested entity was not found.'); return J(x); },
    create(res, cid) { api.create.push([cid, J(res)]); if (api.failCreate) throw new Error(api.failCreate); if (find(cid, res.userId)) throw new Error('Requested entity already exists'); const p = { userId: 'N' + api.create.length, profile: { id: 'N', name: { fullName: 'X' }, emailAddress: res.userId } }; cls.teachers[cid].push(p); return J(p); },
    remove(cid, e) { api.remove.push([cid, e]); if (api.failRemove) throw new Error(api.failRemove); const b = cls.teachers[cid].length; cls.teachers[cid] = cls.teachers[cid].filter(x => x.profile.emailAddress !== e); if (b === cls.teachers[cid].length) throw new Error('Requested entity was not found.'); return {}; }
  });
  G.Classroom.Courses.Students.create = () => { api.students++; throw new Error('never a student'); };
  G.AdminDirectory.Users.get = e => { if (/nobody/.test(e)) throw new Error('Resource Not Found: userKey'); return { primaryEmail: e, suspended: /suspended/.test(e), name: { fullName: e === TCS ? 'Tamil Cover Sakthi' : 'Dir Name' } }; };
  F.api = api;
  F.tk = { admin: F.tok2.admin, hm: F.tok2.hm, vp: F.tok2.vp, sen: F.tok(SEN, 'teacher'), student: F.tok2.student, bod: F.tok2.bod, sa: F.tok('sa@aps.org', 'superadmin') };
  F.mk = (tk, o) => J(G.createTempTeacherAssignment(tk, Object.assign({ courseId: ID.EA, teacherEmail: TCS, startDate: TODAY, removalDate: addDays(TODAY, 3), reason: REASON, requestId: 'R' + Math.random().toString(36).slice(2, 10) }, o || {})));
  F.rows = () => J(G.ttmRows_());
  F.audit = () => { const s = F.env.wb.getSheetByName('TEMP_TEACHER_AUDIT'); return s ? s.data.slice(1).map(r => r[2]) : []; };
  F.mails = re => F.env.stats.mails.filter(m => re.test(m.subject));
  F.trig = () => F.env.stats.triggers.filter(x => x.fn === 'processTemporaryTeacherAssignments' && !x.deleted).length;
  F.proc = now => J(G.ttmProcess_(now));
  return F;
}

module.exports = { SUPRITHA, prep, at, addDays, TODAY, ID, D, J, TCS, SEN, AYANA, VP, HM, ADMIN, REASON };

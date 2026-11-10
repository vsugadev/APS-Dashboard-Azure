// r84: shared fixture for the Add Student tests (server + UI)
const J = x => JSON.parse(JSON.stringify(x));
const { setup: rmSetup, STU, ID, D } = require('./removalfixture');
const NEW = 'newkid_aps9001' + D;

function setup(opts) {
  opts = opts || {};
  const F = rmSetup(); const { cls, G, env } = F;
  Object.assign(env.props, { TICKET_MAIL_OAUTH_CLIENT_ID: 'cid', TICKET_MAIL_OAUTH_CLIENT_SECRET: 'cs', TICKET_MAIL_REFRESH_TOKEN: 'rt' }, opts.props || {});
  const ad = { created: 0, failCreate: null, failList: null, dir: {} };
  ad.dir[NEW] = { primaryEmail: NEW, name: { fullName: 'New Kid' } };
  G.AdminDirectory.Users.get = e => { const u = ad.dir[String(e).toLowerCase()]; if (!u) throw new Error('Resource Not Found: userKey'); return J(u); };
  G.Classroom.UserProfiles = { get: e => { throw new Error('Requested entity was not found.'); } };
  const origList = G.Classroom.Courses.list;
  G.Classroom.Courses.list = o => {
    if (!o || !o.studentId) return origList(o);
    if (ad.failList) throw new Error(ad.failList);
    const e = String(o.studentId).toLowerCase();
    return { courses: J(cls.courses.filter(c => (o.courseStates || ['ACTIVE']).includes(c.courseState) && (cls.students[c.id] || []).some(s => s.profile.emailAddress.toLowerCase() === e))) };
  };
  G.Classroom.Courses.Students.create = (res, cid) => {
    if (ad.failCreate) throw new Error(ad.failCreate);
    const e = String(res.userId).toLowerCase();
    if ((cls.students[cid] || []).some(s => s.profile.emailAddress.toLowerCase() === e)) throw new Error('Requested entity already exists');
    ad.created++;
    const known = Object.values(cls.students).flat().find(s => s.profile.emailAddress.toLowerCase() === e);
    const s = known ? J(known) : { userId: 'U' + e.split('@')[0], profile: { id: 'U' + e.split('@')[0], name: { fullName: (ad.dir[e] && ad.dir[e].name.fullName) || e }, emailAddress: e } };
    (cls.students[cid] = cls.students[cid] || []).push(s); return J(s);
  };
  F.ad = ad;
  F.ctx = (tk, email) => J(G.getAddStudentContext(tk, email));
  F.add = (tk, extra) => J(G.addStudentToClassroom(tk, Object.assign({ studentEmail: NEW, courseId: ID.EC, confirmed: true, requestId: 'A' + Math.random().toString(36).slice(2) }, extra || {})));
  F.addMails = () => env.stats.mails.filter(m => /Student Added to Google Classroom/.test(m.subject));
  F.rows = () => G.adsRows_();
  F.asgLog = () => J(G.getAdminAssignmentAuditLog(F.tok2.admin));
  return F;
}

module.exports = { setup, NEW, STU, ID, D };

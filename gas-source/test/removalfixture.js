// r60: shared fixture for the Remove Student tests (server + UI)
const J = x => JSON.parse(JSON.stringify(x));
const { setup: covSetup, ID, D } = require('./coveragefixture');
const STU = 'sa0_aps6650' + D;              // "Stu A0" — in EA (and, below, also in EB)
const W = n => Array.from({ length: n }, (_, i) => 'word' + i).join(' ');
const REASON = 'Parent requested withdrawal from this class after the term started.';

function setup(opts) {
  const F = covSetup(opts); const { cls, G } = F;
  // the same student is also in EB → removing from EA must leave EB untouched
  cls.students[ID.EB].push(cls.students[ID.EA][0]);
  const rm = { removed: 0, gets: 0, failRemove: null, noop: false, failGet: null };
  const find = (cid, email) => (cls.students[cid] || []).find(s => s.profile.emailAddress.toLowerCase() === String(email).toLowerCase());
  G.Classroom.Courses.Students.get = (cid, email) => { rm.gets++; if (rm.failGet) throw new Error(rm.failGet); const s = find(cid, email); if (!s) throw new Error('Requested entity was not found.'); return J(s); };
  G.Classroom.Courses.Students.remove = (cid, email) => {
    if (rm.failRemove) throw new Error(rm.failRemove);
    rm.removed++; if (rm.noop) return {};
    const b = (cls.students[cid] || []).length; cls.students[cid] = (cls.students[cid] || []).filter(s => s.profile.emailAddress.toLowerCase() !== String(email).toLowerCase());
    if (b === cls.students[cid].length) throw new Error('Requested entity was not found.'); return {};
  };
  G.syncClassroomData();
  F.rm = rm; F.find = find;
  F.SA = F.tok('super@aps.org', 'superadmin');
  F.remove = (tk, extra) => J(G.removeStudentFromClassroom(tk, Object.assign({ studentEmail: STU, courseId: ID.EA, reason: REASON, confirmed: true, requestId: 'R' + Math.random().toString(36).slice(2) }, extra || {})));
  return F;
}

module.exports = { setup, STU, W, REASON, ID, D };

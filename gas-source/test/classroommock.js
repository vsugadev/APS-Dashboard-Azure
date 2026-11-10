const assert = require('assert');
const J = x => JSON.parse(JSON.stringify(x));
function makeClassroom() {
  const st = { courses: [], topics: {}, work: {}, mats: {}, anns: {}, seq: 1000, calls: { list: 0, topicCreate: 0, cwCreate: 0, matCreate: 0, annCreate: 0, patch: 0, remove: 0, cwList: 0 }, fail: {}, lastListArgs: null };
  const id = () => String(++st.seq);
  const failFor = (cid, op) => { const f = st.fail[cid]; if (f && (!f.op || f.op === op)) throw new Error(f.msg); };
  const page = (arr, o, key) => { const start = Number(o && o.pageToken || 0); const size = (o && o.pageSize) || 100; const out = {}; out[key] = arr.slice(start, start + size); if (start + size < arr.length) out.nextPageToken = String(start + size); return out; };
  const Classroom = { Courses: {
    list(o) { st.calls.list++; st.lastListArgs = o; return page(st.courses.filter(c => (o.courseStates || ['ACTIVE']).includes(c.courseState)), o, 'courses'); },
    Topics: {
      list(cid, o) { return page(st.topics[cid] || [], o, 'topic'); },
      create(res, cid) { st.calls.topicCreate++; const tp = { topicId: 'T' + id(), name: res.name }; (st.topics[cid] = st.topics[cid] || []).push(tp); return tp; }
    },
    CourseWork: {
      list(cid, o) { st.calls.cwList++; return page(st.work[cid] || [], o, 'courseWork'); },
      create(res, cid) { failFor(cid, 'create'); st.calls.cwCreate++; const w = Object.assign({ id: 'W' + id(), alternateLink: 'https://classroom/w' }, J(res)); (st.work[cid] = st.work[cid] || []).push(w); return w; }
    },
    CourseWorkMaterials: {
      list(cid, o) { return page(st.mats[cid] || [], o, 'courseWorkMaterial'); },
      create(res, cid) { failFor(cid, 'create'); st.calls.matCreate++; const m = Object.assign({ id: 'M' + id() }, J(res)); (st.mats[cid] = st.mats[cid] || []).push(m); return m; }
    },
    Announcements: {
      list(cid, o) { return page((st.anns[cid] || []).slice().reverse(), o, 'announcements'); },
      get(cid, aid) { const a = (st.anns[cid] || []).find(x => x.id === aid); if (!a) throw new Error('Requested entity was not found.'); return J(a); },
      create(res, cid) { failFor(cid, 'create'); st.calls.annCreate++; const a = Object.assign({ id: 'A' + id(), state: 'PUBLISHED', creationTime: new Date().toISOString(), updateTime: new Date().toISOString(), alternateLink: 'https://classroom/a' }, J(res)); (st.anns[cid] = st.anns[cid] || []).push(a); return a; },
      patch(res, cid, aid, o) { failFor(cid, 'patch'); assert.strictEqual(o.updateMask, 'text'); st.calls.patch++; const a = (st.anns[cid] || []).find(x => x.id === aid); if (!a) throw new Error('Requested entity was not found.'); a.text = res.text; a.updateTime = new Date().toISOString(); return J(a); },
      remove(cid, aid) { failFor(cid, 'remove'); st.calls.remove++; const before = (st.anns[cid] || []).length; st.anns[cid] = (st.anns[cid] || []).filter(x => x.id !== aid); if (before === st.anns[cid].length) throw new Error('Requested entity was not found.'); return {}; }
    }
  } };
  return { Classroom, st };
}

module.exports = { makeClassroom };

// Acceptance fixture for the Sept 27 rules. Week 3 = Fri Sep 25 - Sun Sep 27 2026 (EDT = UTC-4).
function ev(email, code, startIso, endIso, organizer) {
  return { actor: { email }, id: { time: endIso }, events: [{ name: 'call_ended', parameters: [
    { name: 'meeting_code', value: code.toUpperCase().replace(/-/g,'') }, { name: 'identifier', value: email },
    { name: 'start_timestamp_seconds', intValue: String(Math.floor(new Date(startIso).getTime()/1000)) },
    { name: 'duration_seconds', intValue: String((new Date(endIso)-new Date(startIso))/1000) },
    { name: 'organizer_email', value: organizer || email } ] }] };
}
const D = 'avvaiyarpadasalai.org';
const T130 = 'teachera_aps1001@' + D, T75 = 'teacherb_aps1002@' + D, T89 = 'teacherc_aps1003@' + D, T90 = 'teacherd_aps1004@' + D, T85 = 'teachere_aps1005@' + D;
const RAJA = 'raja_aps1234@' + D, KUMAR = 'kumar_APS5678@' + D, SURESH = 'suresh_APS9988@' + D, UNK = 'unknown@example.com';
const DEVI = 'devi_aps2001@' + D, ELA = 'ela_aps2002@' + D, FARI = 'fari_aps2003@' + D, MANI = 'mani_aps3001@' + D;
const courses = [
  { id: '800000000130', name: 'NILAI 3 - EF | FRI 6:30 - 8:00 PM EST | AY26-27', teachers: [{ name: 'Teacher A', email: T130 }],
    students: [{ name: 'Raja', email: RAJA }, { name: 'Kumar', email: KUMAR }, { name: 'Suresh', email: SURESH }, { name: 'Unknown Kid', email: UNK }, { name: 'Mani', email: MANI }] },
  { id: '800000000075', name: 'NILAI 4 - A | SAT 12:00 - 1:30 PM EST | AY26-27', teachers: [{ name: 'Teacher B', email: T75 }],
    students: [{ name: 'Devi', email: DEVI }, { name: 'Mani', email: MANI }] },
  { id: '800000000089', name: 'NILAI 5 - B | SUN 7:30 - 9:00 PM EST | AY26-27', teachers: [{ name: 'Teacher C', email: T89 }], students: [{ name: 'Ela', email: ELA }] },
  { id: '800000000090', name: 'NILAI 6 - C | FRI 9:00 - 10:30 PM EST | AY26-27', teachers: [{ name: 'Teacher D', email: T90 }], students: [{ name: 'Fari', email: FARI }] },
  { id: '800000000085', name: 'NILAI 7 - D | SAT 3:00 - 4:30 PM EST | AY26-27', teachers: [{ name: 'Teacher E', email: T85 }], students: [{ name: 'Mani', email: MANI }] }
];
const at = (d, hm) => new Date('2026-09-' + d + 'T' + hm + ':00-04:00').toISOString();
const audit = [
  // NILAI 3 - EF (Fri 25): teacher 6:20 -> 8:30 = 130 min; Raja 95, Kumar 80 (two overlapping joins), Suresh 60, Mani 130 (whole class)
  ev(T130, 'aaa-bbbb-ccc', at(25,'18:20'), at(25,'20:30')),
  ev(RAJA, 'aaa-bbbb-ccc', at(25,'18:25'), at(25,'20:00')),
  ev(KUMAR, 'aaa-bbbb-ccc', at(25,'18:30'), at(25,'19:30')), ev(KUMAR, 'aaa-bbbb-ccc', at(25,'19:20'), at(25,'19:50')), // overlap -> 80 unique
  ev(SURESH, 'aaa-bbbb-ccc', at(25,'17:50'), at(25,'19:20')), // joined 30 min before the teacher -> only 60 counted
  ev(MANI, 'aaa-bbbb-ccc', at(25,'18:20'), at(25,'20:30')),
  // NILAI 6 - C (Fri 25 night): teacher 90 -> 95; Fari 90
  ev(T90, 'ddd-eeee-fff', at(25,'21:00'), at(25,'22:30')), ev(FARI, 'ddd-eeee-fff', at(25,'21:00'), at(25,'22:30')),
  // NILAI 4 - A (Sat 26): teacher 75; Devi 60; Mani 75
  ev(T75, 'ggg-hhhh-iii', at(26,'12:00'), at(26,'13:15')), ev(DEVI, 'ggg-hhhh-iii', at(26,'12:10'), at(26,'13:10')), ev(MANI, 'ggg-hhhh-iii', at(26,'12:00'), at(26,'13:15')),
  // NILAI 7 - D (Sat 26 afternoon): teacher 85; Mani 85
  ev(T85, 'jjj-kkkk-lll', at(26,'15:00'), at(26,'16:25')), ev(MANI, 'jjj-kkkk-lll', at(26,'15:00'), at(26,'16:25')),
  // NILAI 5 - B (Sun 27): teacher REJOINS: 7:30-8:00 + 8:10-8:59 -> window 89 min; Ela 80
  ev(T89, 'mmm-nnnn-ooo', at(27,'19:30'), at(27,'20:00')), ev(T89, 'mmm-nnnn-ooo', at(27,'20:10'), at(27,'20:59')),
  ev(ELA, 'mmm-nnnn-ooo', at(27,'19:35'), at(27,'20:55'))
];
module.exports = { courses, audit, ev, emails: { T130, T75, T89, T90, T85, RAJA, KUMAR, SURESH, UNK, DEVI, ELA, FARI, MANI } };

function ev(email, code, startIso, endIso, organizer) {
  return { actor: { email }, id: { time: endIso }, events: [{ name: 'call_ended', parameters: [
    { name: 'meeting_code', value: code.toUpperCase().replace(/-/g,'') }, { name: 'identifier', value: email },
    { name: 'start_timestamp_seconds', intValue: String(Math.floor(new Date(startIso).getTime()/1000)) },
    { name: 'duration_seconds', intValue: String((new Date(endIso)-new Date(startIso))/1000) },
    { name: 'organizer_email', value: organizer || 't1@aps.org' } ] }] };
}
const courses = [
  { id: '700000000001', name: 'MAZHALAI - CB | FRI 7:30 - 9:00 PM EST | AY26-27',
    teachers: [{ name: 'Teacher One', email: 't1@aps.org' }, { name: 'The HM', email: 'hm@aps.org' }],
    students: [{ name: 'Stu One', email: 's1@aps.org' }, { name: 'Stu Two', email: 's2@aps.org' }, { name: 'Stu Three', email: 's3@aps.org' },
               { name: 'Support Acct', email: 'aps_support@aps.org' }, { name: 'Admin Acct', email: 'admin@aps.org' }] },
  { id: '700000000002', name: 'NILAI 3 - A | SAT 12:00 - 1:30 PM EST | AY26-27',
    teachers: [{ name: 'Teacher Two', email: 't2@aps.org' }, { name: 'Sugadev V', email: 'VSugadev@avvaiyarpadasalai.org' }],
    students: [{ name: 'Stu Four', email: 's4@aps.org' }, { name: 'Stu Five', email: 's5@aps.org' }] },
  { id: '700000000003', name: 'NO SCHEDULE CLASS | AY26-27', teachers: [], students: [] }
];
const audit = [
  ev('hm@aps.org', 'abc-defg-hij', '2026-09-25T22:00:00Z', '2026-09-26T03:00:00Z'),   // excluded HM: must not stretch the call window
  ev('t1@aps.org', 'abc-defg-hij', '2026-09-25T23:25:00Z', '2026-09-26T01:05:00Z'),
  ev('s1@aps.org', 'abc-defg-hij', '2026-09-25T23:30:00Z', '2026-09-26T01:00:00Z'),
  ev('s2@aps.org', 'xyz-abcd-efg', '2026-09-25T22:00:00Z', '2026-09-25T23:40:00Z', 'other@aps.org'),
  ev('s2@aps.org', 'abc-defg-hij', '2026-09-26T00:15:00Z', '2026-09-26T01:00:00Z'),
  ev('aps_support@aps.org', 'abc-defg-hij', '2026-09-25T23:00:00Z', '2026-09-26T02:00:00Z'),
  ev('s4@aps.org', 'klm-nopq-rst', '2026-09-26T16:00:00Z', '2026-09-26T17:30:00Z', 'x@aps.org'),
  ev('s5@aps.org', 'klm-nopq-rst', '2026-09-26T16:40:00Z', '2026-09-26T17:30:00Z', 'x@aps.org'),
  ev('vsugadev@avvaiyarpadasalai.org', 'klm-nopq-rst', '2026-09-26T15:00:00Z', '2026-09-26T19:00:00Z', 'vsugadev@avvaiyarpadasalai.org'), // always-excluded: must not appear or stretch the call
  ev('outsider@aps.org', 'abc-defg-hij', '2026-09-25T23:30:00Z', '2026-09-26T01:00:00Z'),
];
module.exports = { courses, audit, ev };

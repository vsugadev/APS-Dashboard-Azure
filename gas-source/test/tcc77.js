// r77: Temporary Class Coverage — Destination Class decision support + speed (node test/tcc77.js)
const assert = require('assert');
const { setup, ID, FRI, D } = require('./coveragefixture');
const J = x => JSON.parse(JSON.stringify(x));
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const plan = (F, orig, dest, extra) => J(F.G.getCoveragePlan(F.tok2.admin, Object.assign({ originalId: orig || ID.EA, date: FRI, destinationId: dest || '' }, extra || {})));
const apply = (F, orig, dest, extra) => J(F.G.applyCoverage(F.tok2.admin, Object.assign({ originalId: orig, destinationId: dest, date: FRI, confirmed: true, requestId: 'R' + Math.random() }, extra || {})));
const WK = 'WK-' + FRI;
function card(F, id, st, alt) { F.G.getOrCreateTeacherAvailabilitySheet_().appendRow([WK, 't@x', 'T', id, 'n', '', st, alt || '', new Date().toISOString(), 'x', 'X']); }
function form(F, email, st, times) { const sh = F.G.ctaSheet_('Teacher_Availability_Selection', F.G.CTA_SELECTION_HEADER_); sh.appendRow([WK, 'AY26-27', email, 'N', 'APS1', 'MUNMAZHALAI', (times || []).join('\n'), st, '', '', email]); }
const counter = F => { const sh = F.env.wb.getSheetByName('Teacher_Weekly_Availability') || F.G.getOrCreateTeacherAvailabilitySheet_(); const P = Object.getPrototypeOf(sh.getRange(1, 1, 1, 1)); const orig = P.getValues; const c = { n: 0 }; P.getValues = function () { c.n++; return orig.apply(this, arguments); }; c.restore = () => { P.getValues = orig; }; return c; };

t('Scenario 1/6: available teacher — APSID, 🟢 availability for the session week (class card), Existing APS Teacher; no warning', () => {
  const F = setup(); card(F, ID.ED, 'confirmed');
  const p = plan(F); const ed = p.destinations.find(d => d.id === ID.ED);
  assert.strictEqual(ed.teacher, 'Kavitha Raman'); assert.strictEqual(ed.teacherApsId, 'APS8130');
  assert.strictEqual(ed.availability.state, 'available'); assert.strictEqual(ed.availability.current, WK === F.G.getCurrentWeekId_()); assert.ok(/^Week of /.test(ed.availability.weekLabel));
  assert.deepStrictEqual(ed.availability.lines.map(l => [l.text, l.state, l.source]), [['Friday 6:30–8:00 PM', 'available', 'Class card']]);
  assert.deepStrictEqual(ed.apsTeacher, { level: 'existing', classes: 1 }); assert.strictEqual(ed.alreadyHosting, 0); assert.deepStrictEqual(ed.hosting, []);
  assert.strictEqual(plan(F, ID.EA, ID.ED).destHosting, 0);
});
t('Scenario 2/3: Not Available (class card, with arrangement) → 🔴; nothing submitted → 🟡; Teacher Availability form times are listed too', () => {
  const F = setup(); card(F, ID.EB, 'not_available', 'need_hm_support'); form(F, 'kavitha_aps8130' + D, 'confirmed', ['FRI 6:30 - 8:00 PM EST', 'SAT 12:00 - 1:30 PM EST']);
  const by = Object.fromEntries(plan(F).destinations.map(d => [d.id, d]));
  assert.strictEqual(by[ID.EB].availability.state, 'not_available'); assert.strictEqual(by[ID.EB].availability.lines[0].note, 'Need HM Support');
  assert.strictEqual(by[ID.EB].selectable, true, 'availability never changes the existing selection rules');
  assert.strictEqual(by[ID.EC].availability.state, 'not_submitted'); assert.deepStrictEqual(by[ID.EC].availability.lines, []);
  assert.deepStrictEqual(by[ID.ED].availability.lines.map(l => l.text + '|' + l.source), ['Friday 6:30–8:00 PM|Teacher Availability form', 'Saturday 12:00–1:30 PM|Teacher Availability form']);
  assert.strictEqual(by[ID.ED].availability.state, 'available');
});
t('only the session week counts (an older week record is ignored); availability read failure → flagged, plan still works', () => {
  const F = setup();
  F.G.getOrCreateTeacherAvailabilitySheet_().appendRow(['WK-2026-09-04', 't', 'T', ID.ED, 'n', '', 'confirmed', '', '', '', '']);
  assert.strictEqual(plan(F).destinations.find(d => d.id === ID.ED).availability.state, 'not_submitted');
  const real = F.G.readTeacherAvailabilityMap_; F.G.readTeacherAvailabilityMap_ = () => { throw new Error('sheet down'); };
  const p = plan(F); assert.deepStrictEqual(p.errors, []); assert.ok(p.destinations.every(d => d.availability.error === true));
  const p2 = plan(F, ID.EA, ID.ED); assert.strictEqual(p2.ok, true, 'workflow continues'); F.G.readTeacherAvailabilityMap_ = real;
});
t('Scenario 7: APSID missing → "" (client shows "APSID unavailable"), APS-teacher level unknown; never undefined', () => {
  const F = setup(); const real = F.G.readAllCoursesFromCache_;
  F.G.readAllCoursesFromCache_ = () => real().map(c => { if (String(c.id) === ID.ED) { c.classSupport = []; c.teachers = [{ email: 'guest.teacher@avvaiyarpadasalai.org', name: 'Guest Teacher' }]; } return c; });
  const ed = plan(F).destinations.find(d => d.id === ID.ED);
  assert.strictEqual(ed.teacher, 'Guest Teacher'); assert.strictEqual(ed.teacherApsId, ''); assert.strictEqual(ed.apsTeacher.level, 'unknown');
});
t('Scenario 4/5: existing coverage detected with source + date; Confirm & Apply needs the extra tick (server), 2 assignments reported', () => {
  const F = setup();
  apply(F, ID.EA, ID.ED);
  let p = plan(F, ID.EB, ID.ED, { confirmStreamLink: true });
  const ed = p.destinations.find(d => d.id === ID.ED);
  assert.strictEqual(ed.alreadyHosting, 1); assert.strictEqual(ed.hosting[0].source, 'MUNMAZHALAI - EA'); assert.ok(/^\d{2}\/\d{2}\/\d{4}$/.test(ed.hosting[0].date));
  assert.strictEqual(p.destHosting, 1); assert.strictEqual(p.ok, true, 'warning only — the plan is still valid');
  assert.throws(() => apply(F, ID.EB, ID.ED), /already has 1 Temporary Class Coverage assignment .*I understand/);
  assert.strictEqual(apply(F, ID.EB, ID.ED, { confirmMultiHost: true }).record.announcement, 'POSTED');
  F.G.saveCourseMeetLinkMapping && 0;
  const mm = F.env.wb.getSheetByName('Course_Meet_Link_Map'); mm.data.push([ID.EC, 'EC', 'https://meet.google.com/ccc-cccc-ccc', '', '', 'MANUAL', '']); F.env.ctx.CacheService.getScriptCache().remove('aps_class_meet_maps_v1');
  p = plan(F, ID.EC, ID.ED); assert.strictEqual(p.destHosting, 2); assert.strictEqual(p.destinations.find(d => d.id === ID.ED).hosting.length, 2);
});
t('ranking: selectable + Meet verified + teacher available first; no auto-selection', () => {
  const F = setup(); card(F, ID.ED, 'not_available', 'need_hm_support');
  const p = plan(F);
  assert.deepStrictEqual(p.destinations.map(d => d.id), [ID.ED, ID.EB, ID.EC], 'verified (ED) > class-stream (EB) > no Meet (EC)');
  assert.strictEqual(p.dest, null);
});
t('performance: the merge sheet is read ONCE per plan (was 1 + 2 per candidate); the whole plan is a fixed number of sheet reads', () => {
  const F = setup(); apply(F, ID.EA, ID.ED);
  const real = F.G.tccRows_; let n = 0; F.G.tccRows_ = function () { n++; return real.apply(this, arguments); };
  plan(F, ID.EB); assert.strictEqual(n, 1, 'tccRows_ calls while listing destinations');
  n = 0; plan(F, ID.EB, ID.ED, { confirmStreamLink: true, withPreview: true }); assert.strictEqual(n, 1);
  F.G.tccRows_ = real;
  const c = counter(F); plan(F, ID.EB, ID.ED, { confirmStreamLink: true, withPreview: true }); c.restore();
  console.log('    sheet range reads for one Destination Class selection: ' + c.n);
  assert.ok(c.n <= 8, 'reads: ' + c.n);
});
// r78: ONE recommended Destination Class — available this week first, then Existing APS Teacher, then lowest NUMERIC APSID
const { nextDow } = require('./coveragefixture');
const SAT = nextDow(6, 1), WKS = (() => { const d = new Date(SAT + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return 'WK-' + d.toISOString().slice(0, 10); })();
function nilai1(F, people, opts) {
  opts = opts || {};
  const mk = (id, sec, email, name, n, extra) => Object.assign({ id, name: 'NILAI 1 - ' + sec + ' | SAT 12:00 - 1:30 PM EST | AY26-27', courseState: 'ACTIVE', link: 'https://classroom.google.com/c/' + id,
    meetLinkInClassroom: 'https://meet.google.com/' + sec.toLowerCase() + 'x-abcd-efg', teachers: [{ email, name }], classSupport: email ? [{ email, roles: ['PRIMARY_TEACHER'], member: true }] : [],
    students: Array.from({ length: n }, (_, i) => ({ email: 's' + sec + i + '_aps' + (7000 + i) + D, name: 'S' })) }, extra || {});
  const list = [mk('LB', 'LB', 'shobana_aps961' + D, 'Shobana Devi', 6)].concat(people.map(p => mk(p.id, p.id, p.email, p.name, 5, p.extra)));
  F.G.readAllCoursesFromCache_ = () => JSON.parse(JSON.stringify(list));
  const sh = F.G.getOrCreateTeacherAvailabilitySheet_();
  people.forEach(p => { if (p.st) sh.appendRow([WKS, p.email, p.name, p.id, 'n', '', p.st, p.alt || '', new Date().toISOString(), 'x', 'X']); });
  return J(F.G.getCoveragePlan(F.tok2.admin, { originalId: 'LB', date: SAT }));
}
const SHOT = [{ id: 'LC', email: 'suganya_aps8056' + D, name: 'Suganya Ganesh', st: 'confirmed' }, { id: 'LD', email: 'dhanasri_aps8051' + D, name: 'Dhanasri Manikandan', st: 'confirmed' },
  { id: 'LE', email: 'jerrome_aps8081' + D, name: 'Jerrome Arulraj', st: 'not_available', alt: 'need_hm_support' }, { id: 'LA', email: 'kalaivani_aps884' + D, name: 'Kalaivani Ganapathi', st: 'not_available', alt: 'parent_teacher_arranged' }];
const rec = p => p.destinations.filter(d => d.recommended).map(d => d.teacherApsId);
t('r78 screenshot case: APS8051 is the ONE recommendation (APS884 is lower but Not Available; APS8056 available but higher)', () => {
  const F = setup(); const p = nilai1(F, SHOT);
  assert.strictEqual(p.destinations.length, 4); assert.ok(p.destinations.every(d => d.selectable));
  assert.deepStrictEqual(rec(p), ['APS8051']); assert.strictEqual(p.destinations.find(d => d.recommended).recommendWhy, 'lowest');
  assert.ok(p.destinations.filter(d => !d.recommended).every(d => d.recommended === false));
  assert.ok(p.destinations.every(d => d.apsTeacher.level === 'existing'), 'Existing APS Teacher detection unchanged');
  assert.strictEqual(p.noAvailableTeacher, false);
});
t('r78 edge cases: nobody available → no recommendation + notice; one available → "only"; numeric (not alphabetic) compare; missing / invalid APSID never wins; Not-Existing APS teacher skipped', () => {
  let p = nilai1(setup(), SHOT.map(x => Object.assign({}, x, { st: 'not_available', alt: 'sub_teacher_arranged' })));
  assert.deepStrictEqual(rec(p), []); assert.strictEqual(p.noAvailableTeacher, true);
  p = nilai1(setup(), SHOT.map(x => Object.assign({}, x, x.id === 'LC' ? {} : { st: 'not_available', alt: 'on_call_assigned' })));
  assert.deepStrictEqual(rec(p), ['APS8056']); assert.strictEqual(p.destinations.find(d => d.recommended).recommendWhy, 'only');
  p = nilai1(setup(), [{ id: 'LC', email: 'a_aps10000' + D, name: 'A', st: 'confirmed' }, { id: 'LD', email: 'b_aps9' + D, name: 'B', st: 'confirmed' }]);
  assert.deepStrictEqual(rec(p), ['APS9'], '9 < 10000 numerically ("APS10000" < "APS9" as strings)');
  p = nilai1(setup(), [{ id: 'LC', email: 'guest.teacher' + D, name: 'Guest', st: 'confirmed' }, { id: 'LD', email: 'x_apsab12' + D, name: 'X', st: 'confirmed' }, { id: 'LE', email: 'c_aps8999' + D, name: 'C', st: 'confirmed' }]);
  assert.deepStrictEqual(rec(p), ['APS8999'], 'no APSID / letters never recommended, never treated as 0');
  assert.strictEqual(F_num('APS0884'), 884); assert.strictEqual(F_num(''), null); assert.strictEqual(F_num('NA'), null); assert.strictEqual(F_num('APSAB12'), null);
  p = nilai1(setup(), [{ id: 'LC', email: 'n_aps100' + D, name: 'N', st: 'confirmed', extra: { classSupport: [] } }, { id: 'LD', email: 'm_aps200' + D, name: 'M', st: 'confirmed' }]);
  assert.deepStrictEqual(rec(p), ['APS200'], 'APS100 is not detected as an Existing APS Teacher (no Primary Teacher label)');
  p = nilai1(setup(), [{ id: 'LC', email: 'p_aps50' + D, name: 'P', st: 'confirmed', extra: { meetLinkInClassroom: '' } }, { id: 'LD', email: 'q_aps60' + D, name: 'Q', st: 'confirmed' }]);
  assert.deepStrictEqual(rec(p), ['APS60'], 'a class that cannot be selected (no Meet) is never recommended');
});
function F_num(x) { return setup.__G ? setup.__G.tccApsIdNumber_(x) : (setup.__G = setup().G).tccApsIdNumber_(x); }
console.log(process.exitCode ? 'SOME TCC77 TESTS FAILED' : 'ALL ' + pass + ' TCC77 TESTS PASSED');

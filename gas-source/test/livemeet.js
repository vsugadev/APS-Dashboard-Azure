// Live Class Status from Google Meet (r35) + GCM - Preview server endpoint (node test/livemeet.js)
const assert = require('assert');
const { build } = require('./gradingfixture');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + (e.stack || e)); process.exitCode = 1; } };
const J = x => JSON.parse(JSON.stringify(x));
const RealDate = Date;
const setNow = (G, iso) => { const T = new RealDate(iso).getTime(); class D extends RealDate { constructor(...a) { if (a.length) super(...a); else super(T); } static now() { return T; } } G.Date = D; };
// Friday Oct 9 2026 (EDT, -04:00). N3EF = FRI 6:30 - 8:00 PM EST: TA (+ admin, support) / JOSHUA, RAJA.
const at = hm => '2026-10-09T' + hm + ':00-04:00';
const ms = hm => new RealDate(at(hm)).getTime();
const ended = (email, from, to, code) => ({ actor: { email }, id: { time: new RealDate(ms(to)).toISOString() },
  events: [{ name: 'call_ended', parameters: [{ name: 'meeting_code', value: code || 'AAABBBBCCC' }, { name: 'duration_seconds', intValue: String((ms(to) - ms(from)) / 1000) }, { name: 'organizer_email', value: 'teachera_aps101@avvaiyarpadasalai.org' }] }] });
const TA = 'teachera_aps101@avvaiyarpadasalai.org', JO = 'joshua_aps3407@avvaiyarpadasalai.org', RA = 'raja_aps1234@avvaiyarpadasalai.org';
function setup(audit) {
  const F = build(); const { G, env } = F;
  { const sh0 = env.wb.insertSheet('__p'); const P = Object.getPrototypeOf(sh0); P.clearContents = P.clearContents || function () { this.data = []; return this; }; P.autoResizeColumns = P.autoResizeColumns || function () { return this; }; delete env.wb.sheets.__p; }
  setNow(G, at('12:00')); G.syncClassroomData();
  env.ctx.AdminReports.Activities.list = (u, app, o) => { env.stats.reportsCalls++; const s = new RealDate(o.startTime).getTime(), e = o.endTime ? new RealDate(o.endTime).getTime() : Infinity;
    return { items: (F.audit || []).filter(it => { const x = new RealDate(it.id.time).getTime(); return x >= s && x <= e; }) }; };
  F.audit = audit || [];
  F.dash = (who, role, hm, opt) => { setNow(G, at(hm)); if (!opt || !opt.keepCache) delete env.cache['aps_class_meet_live_v1']; return J(G.getDashboardData(F.tok(who, role))); };
  F.card = (d, id) => d.courses.find(c => String(c.id) === String(id));
  return F;
}

t('not in the class window: Scheduled; Saturday class on Friday stays Scheduled', () => {
  const F = setup(); const d = F.dash('admin@aps.org', 'admin', '17:00');
  assert.strictEqual(F.card(d, F.ids.N3EF).classStatusLabel, 'Scheduled');
  assert.strictEqual(F.card(d, F.ids.N3EF).classMeetDetail, null);
  const d2 = F.dash('admin@aps.org', 'admin', '18:45');
  assert.strictEqual(F.card(d2, F.ids.N3EA).classStatusLabel, 'Scheduled');
});

t('window open, nobody seen: "not started" ONLY when the live Meet check can see the class; otherwise "status not available" (r65)', () => {
  // no live Meet access (no mapped code / Meet REST refused) and no audit rows: the dashboard cannot tell
  let F = setup(); let c = F.card(F.dash('admin@aps.org', 'admin', '18:45'), F.ids.N3EF);
  assert.strictEqual(c.classStatus, 'yet_to_start');
  assert.strictEqual(c.classMeetDetail.text, 'Live Google Meet status not available for this class');
  assert.strictEqual(c.classMeetDetail.statusUnknown, true); assert.strictEqual(c.classMeetDetail.liveKnown, false);
  // before the class time: still "not started yet"
  F = setup(); c = F.card(F.dash('admin@aps.org', 'admin', '18:10'), F.ids.N3EF);
  assert.strictEqual(c.classStatus, 'scheduled'); assert.strictEqual(c.classMeetDetail.text, 'Google Meet not started yet'); assert.ok(!c.classMeetDetail.statusUnknown);
  // Meet REST can see the space and there is NO active conference → really "not started"
  F = setup(); const { G, env } = F;
  setNow(G, at('12:00')); G.saveCourseMeetLinkMapping(F.tok('admin@aps.org', 'admin'), F.ids.N3EF, 'https://meet.google.com/abc-defg-hij', 'N3EF');
  let conf = false;
  env.ctx.UrlFetchApp.fetchAll = reqs => reqs.map(r => /\/spaces\/abc-defg-hij$/.test(r.url)
    ? { getResponseCode: () => 200, getContentText: () => JSON.stringify(conf ? { name: 'spaces/x', activeConference: { conferenceRecord: 'conferenceRecords/c9' } } : { name: 'spaces/x' }) }
    : /conferenceRecords\/c9\/participants/.test(r.url) ? { getResponseCode: () => 200, getContentText: () => JSON.stringify({ participants: [{ anonymousUser: { displayName: 'Guest' } }] }) }
    : { getResponseCode: () => 403, getContentText: () => 'denied' });
  c = F.card(F.dash('admin@aps.org', 'admin', '18:45'), F.ids.N3EF);
  assert.strictEqual(c.classMeetDetail.text, 'Google Meet not started yet'); assert.strictEqual(c.classMeetDetail.liveKnown, true); assert.ok(!c.classMeetDetail.statusUnknown);
  // conference running but nobody identifiable (anonymous / not signed in) → "running", not "not started"
  conf = true;
  c = F.card(F.dash('admin@aps.org', 'admin', '18:48'), F.ids.N3EF);
  assert.strictEqual(c.classMeetDetail.text, 'Google Meet is running — participants not identified yet'); assert.strictEqual(c.classMeetDetail.statusUnknown, true);
});

t('teacher + student joined BEFORE the scheduled start -> Class Started (was stuck on Scheduled)', () => {
  const F = setup([ended(JO, '18:12', '18:20')]);
  F.G.recordMeetJoinClick(F.tok(TA, 'teacher'), F.ids.N3EF); // needs the clock inside the window
  setNow(F.G, at('18:15')); assert.strictEqual(F.G.recordMeetJoinClick(F.tok(TA, 'teacher'), F.ids.N3EF).recorded, true);
  const c = F.card(F.dash('admin@aps.org', 'admin', '18:22'), F.ids.N3EF);
  assert.strictEqual(c.classStatusLabel, 'Class Started');
  assert.ok(/^Teacher joined 6:15 PM · 1 student joined$/.test(c.classMeetDetail.text), c.classMeetDetail.text);
  assert.deepStrictEqual(c.classMeetDetail.sources.sort(), ['Dashboard Join', 'Meet audit log']);
  assert.ok(c.teachers.find(x => x.email === TA).inMeet && c.students.find(x => x.email === JO).inMeet && !c.students.find(x => x.email === RA).inMeet);
});

t('teacher only -> waiting for students (not Started); students only -> waiting for the teacher', () => {
  const F = setup([ended(TA, '18:31', '18:40')]);
  let c = F.card(F.dash('admin@aps.org', 'admin', '18:45'), F.ids.N3EF);
  assert.strictEqual(c.classStatus, 'yet_to_start'); assert.ok(/teacher joined 6:31 PM, waiting for students/.test(c.classMeetDetail.text), c.classMeetDetail.text);
  F.audit = [ended(JO, '18:31', '18:40'), ended(RA, '18:33', '18:41')];
  c = F.card(F.dash('admin@aps.org', 'admin', '18:46'), F.ids.N3EF);
  assert.strictEqual(c.classStatus, 'yet_to_start'); assert.strictEqual(c.classMeetDetail.text, '2 students in Meet — waiting for the teacher');
});

t('support / admin / HM accounts never count as the class teacher or students', () => {
  const F = setup([ended('support@avvaiyarpadasalai.org', '18:31', '18:40'), ended('admin@aps.org', '18:31', '18:41'), ended(JO, '18:31', '18:42')]);
  setNow(F.G, at('18:40'));
  assert.strictEqual(F.G.recordMeetJoinClick(F.tok('admin@aps.org', 'admin'), F.ids.N3EF).recorded, false);
  assert.strictEqual(F.G.recordMeetJoinClick(F.tok('meena_aps5555@avvaiyarpadasalai.org', 'student'), F.ids.N3EF).recorded, false, 'not on this roster');
  const c = F.card(F.dash('admin@aps.org', 'admin', '18:50'), F.ids.N3EF);
  assert.strictEqual(c.classStatus, 'yet_to_start');
});

t('started, then quiet after the scheduled end -> Class Ended (sticky); still active after end -> stays Started', () => {
  const F = setup([ended(TA, '18:29', '19:58'), ended(JO, '18:30', '19:57')]);
  let c = F.card(F.dash('admin@aps.org', 'admin', '19:59'), F.ids.N3EF);
  assert.strictEqual(c.classStatusLabel, 'Class Started');
  c = F.card(F.dash('admin@aps.org', 'admin', '20:05'), F.ids.N3EF);
  assert.strictEqual(c.classStatusLabel, 'Class Started', 'within the 10-minute grace');
  F.audit.push(ended(RA, '19:50', '20:06'));
  c = F.card(F.dash('admin@aps.org', 'admin', '20:12'), F.ids.N3EF);
  assert.strictEqual(c.classStatusLabel, 'Class Started', 'activity at 8:06 keeps it running');
  c = F.card(F.dash('admin@aps.org', 'admin', '20:17'), F.ids.N3EF);
  assert.strictEqual(c.classStatusLabel, 'Class Ended'); assert.ok(/^Class ended around 8:06 PM$/.test(c.classMeetDetail.text), c.classMeetDetail.text);
  F.audit.push(ended(RA, '20:10', '20:18'));
  c = F.card(F.dash('admin@aps.org', 'admin', '20:20'), F.ids.N3EF);
  assert.strictEqual(c.classStatusLabel, 'Class Ended', 'ended is sticky for the occurrence');
  assert.ok(!c.teachers.some(x => x.inMeet && x.email === TA));
});

t('never started and the class time passed -> Class Ended with "No Google Meet activity"', () => {
  const F = setup(); const c = F.card(F.dash('admin@aps.org', 'admin', '20:15'), F.ids.N3EF);
  assert.strictEqual(c.classStatusLabel, 'Class Ended'); assert.strictEqual(c.classMeetDetail.text, 'No Google Meet activity was detected for this class today');
});

t('Google Meet REST (live): active conference with teacher + student -> Started; conference over -> Ended early', () => {
  const F = setup(); const { G, env } = F;
  setNow(G, at('12:00'));
  G.saveCourseMeetLinkMapping(F.tok('admin@aps.org', 'admin'), F.ids.N3EF, 'https://meet.google.com/abc-defg-hij', 'N3EF');
  let live = true; let fetches = 0;
  env.ctx.AdminDirectory.Users.get = id => ({ primaryEmail: { TA: TA, UJ: JO }[id] });
  env.ctx.UrlFetchApp.fetchAll = reqs => reqs.map(r => { fetches++;
    if (/\/spaces\/abc-defg-hij$/.test(r.url)) return { getResponseCode: () => 200, getContentText: () => JSON.stringify(live ? { name: 'spaces/x', activeConference: { conferenceRecord: 'conferenceRecords/c1' } } : { name: 'spaces/x' }) };
    if (/conferenceRecords\/c1\/participants/.test(r.url)) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ participants: [
      { signedinUser: { user: 'users/TA' }, earliestStartTime: new RealDate(ms('18:27')).toISOString() }, { signedinUser: { user: 'users/UJ' }, earliestStartTime: new RealDate(ms('18:29')).toISOString() }] }) };
    return { getResponseCode: () => 403, getContentText: () => 'denied' }; });
  let c = F.card(F.dash('admin@aps.org', 'admin', '18:35'), F.ids.N3EF);
  assert.strictEqual(c.classStatusLabel, 'Class Started');
  assert.strictEqual(c.classMeetDetail.liveNow, true); assert.ok(c.classMeetDetail.sources.indexOf('Google Meet (live)') > -1);
  assert.ok(c.teachers.find(x => x.email === TA).inMeet);
  live = false;
  c = F.card(F.dash('admin@aps.org', 'admin', '19:10'), F.ids.N3EF);
  assert.strictEqual(c.classStatusLabel, 'Class Ended', 'teacher closed the Meet early');
  assert.ok(fetches > 0);
});

t('Meet REST refusal is re-checked after 45 s (r65; was 6 h), only for refused codes; success clears it; the audit log still works', () => {
  const F = setup([ended(TA, '18:29', '18:40'), ended(JO, '18:30', '18:41')]); const { G, env } = F;
  setNow(G, at('12:00')); G.saveCourseMeetLinkMapping(F.tok('admin@aps.org', 'admin'), F.ids.N3EF, 'https://meet.google.com/abc-defg-hij', 'N3EF');
  let fetches = 0, allow = false;
  env.ctx.UrlFetchApp.fetchAll = reqs => reqs.map(r => { if (/\/spaces\//.test(r.url)) fetches++;
    return allow && /\/spaces\/abc-defg-hij$/.test(r.url) ? { getResponseCode: () => 200, getContentText: () => JSON.stringify({ name: 'spaces/x' }) }
      : { getResponseCode: () => 403, getContentText: () => '{"error":{"code":403,"message":"The caller does not have permission"}}' }; });
  assert.strictEqual(F.card(F.dash('admin@aps.org', 'admin', '18:45'), F.ids.N3EF).classStatusLabel, 'Class Started', 'audit log still works');
  let dg = JSON.parse(env.props.classMeetLiveDiagnostic);
  assert.strictEqual(dg.rest.noAccess, 1); assert.strictEqual(dg.rest.retrySeconds, 45);
  assert.ok(/^HTTP 403 for abc-defg-hij: .*caller does not have permission/.test(dg.rest.lastError), dg.rest.lastError);
  const tk = F.tok('admin@aps.org', 'admin');
  setNow(G, '2026-10-09T18:45:30-04:00'); const n = fetches; G.refreshClassMeetLiveStatus(tk);
  assert.strictEqual(fetches, n, 'within 45 s: not re-checked'); assert.strictEqual(JSON.parse(env.props.classMeetLiveDiagnostic).rest.skipped, 1);
  setNow(G, '2026-10-09T18:45:50-04:00'); G.refreshClassMeetLiveStatus(tk);
  assert.strictEqual(fetches, n + 1, 'after 45 s: re-checked');
  allow = true; setNow(G, '2026-10-09T18:46:40-04:00'); G.refreshClassMeetLiveStatus(tk);
  dg = JSON.parse(env.props.classMeetLiveDiagnostic); assert.strictEqual(dg.rest.ok, 1); assert.strictEqual(dg.rest.noAccess, 0);
  setNow(G, '2026-10-09T18:46:50-04:00'); const n2 = fetches; G.refreshClassMeetLiveStatus(tk);
  assert.strictEqual(fetches, n2 + 1, 'readable code checked every refresh');
  env.props.MEET_REST_RETRY_SECONDS = '300'; allow = false; setNow(G, '2026-10-09T18:47:00-04:00'); G.refreshClassMeetLiveStatus(tk);
  setNow(G, '2026-10-09T18:48:00-04:00'); const n3 = fetches; G.refreshClassMeetLiveStatus(tk);
  assert.strictEqual(fetches, n3, 'MEET_REST_RETRY_SECONDS is configurable');
});

t('45-second live check only during class time (start → end); before start / after end: no Meet calls, 120 s cadence', () => {
  const F = setup(); const { G, env } = F;
  setNow(G, at('12:00')); G.saveCourseMeetLinkMapping(F.tok('admin@aps.org', 'admin'), F.ids.N3EF, 'https://meet.google.com/abc-defg-hij', 'N3EF');
  let spaces = 0; env.ctx.UrlFetchApp.fetchAll = reqs => reqs.map(r => { if (/\/spaces\//.test(r.url)) spaces++; return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ name: 'spaces/x' }) }; });
  F.dash('admin@aps.org', 'admin', '18:15'); // FRI 6:30 class: inside the early window, before class time
  let dg = JSON.parse(env.props.classMeetLiveDiagnostic);
  assert.strictEqual(spaces, 0, 'no Meet call before class time'); assert.strictEqual(dg.refreshSeconds, 120); assert.ok(dg.rest.outsideClassTime >= 1);
  F.dash('admin@aps.org', 'admin', '18:31');
  dg = JSON.parse(env.props.classMeetLiveDiagnostic);
  assert.strictEqual(spaces, 1, 'class time: checked'); assert.strictEqual(dg.refreshSeconds, 45);
  F.dash('admin@aps.org', 'admin', '20:10'); // after 8:00 PM end, still in the late window
  dg = JSON.parse(env.props.classMeetLiveDiagnostic);
  assert.strictEqual(spaces, 1, 'no Meet call for this class after its class time'); assert.ok(dg.rest.outsideClassTime >= 1);
  assert.strictEqual(dg.refreshSeconds, 45, 'the FRI 7:30 - 9:00 PM class is still in class time, so the cadence stays 45 s');
});

t('diagnostic: written even when no class is in its Meet window (throttled), and returned to GCM - Preview (Admin)', () => {
  const F = setup(); const { G, env } = F;
  delete env.props.classMeetLiveDiagnostic; F.dash('admin@aps.org', 'admin', '15:00');
  const dg = JSON.parse(env.props.classMeetLiveDiagnostic);
  assert.strictEqual(dg.classesInWindow, 0); assert.ok(/No class is inside its Google Meet window/.test(dg.note));
  env.props.classMeetLiveDiagnostic = 'x'; F.dash('admin@aps.org', 'admin', '15:01', { keepCache: true });
  assert.strictEqual(env.props.classMeetLiveDiagnostic, 'x', 'not rewritten on every request');
  env.props.classMeetLiveDiagnostic = JSON.stringify({ at: 'a', classesInWindow: 3, rest: { ok: 1, noAccess: 2 } });
  setNow(G, at('15:02')); const g = J(G.getMeetPreviewData(F.tok('admin@aps.org', 'admin')));
  assert.deepStrictEqual(g.liveDiag, { at: 'a', classesInWindow: 3, rest: { ok: 1, noAccess: 2 } });
});

t('refresh is throttled (one live check per 45 s — r65, was 2 min — shared by every viewer; MEET_LIVE_REFRESH_SECONDS overrides)', () => {
  const F = setup([ended(TA, '18:29', '18:40')]); const { env, G } = F;
  const dashAt = (who, role, iso) => { setNow(G, iso); return J(G.getDashboardData(F.tok(who, role))); };
  F.dash('admin@aps.org', 'admin', '18:45'); const n = env.stats.reportsCalls;
  dashAt(JO, 'student', '2026-10-09T18:45:20-04:00');
  dashAt(TA, 'teacher', '2026-10-09T18:45:40-04:00');
  assert.strictEqual(env.stats.reportsCalls, n, 'within 45 s: one shared check');
  dashAt('admin@aps.org', 'admin', '2026-10-09T18:45:50-04:00');
  assert.strictEqual(env.stats.reportsCalls, n + 1, 'after 45 s: refreshed');
  env.props.MEET_LIVE_REFRESH_SECONDS = '120';
  dashAt('admin@aps.org', 'admin', '2026-10-09T18:47:00-04:00');
  assert.strictEqual(env.stats.reportsCalls, n + 1, 'configurable');
  dashAt('admin@aps.org', 'admin', '2026-10-09T18:47:50-04:00'); assert.strictEqual(env.stats.reportsCalls, n + 2, '120 s later');
  env.props.MEET_LIVE_REFRESH_SECONDS = '5'; dashAt('admin@aps.org', 'admin', '2026-10-09T18:48:05-04:00');
  assert.strictEqual(env.stats.reportsCalls, n + 2, 'never below 30 s');
});

t('join click outside the class window is ignored; manual Cancel still wins over live status', () => {
  const F = setup([ended(TA, '18:29', '18:40'), ended(JO, '18:30', '18:41')]);
  setNow(F.G, at('15:00')); assert.strictEqual(F.G.recordMeetJoinClick(F.tok(TA, 'teacher'), F.ids.N3EF).recorded, false);
  setNow(F.G, at('18:00')); F.G.setClassStatusManual(F.tok('admin@aps.org', 'admin'), F.ids.N3EF, 'cancel');
  assert.strictEqual(F.card(F.dash('admin@aps.org', 'admin', '18:45'), F.ids.N3EF).classStatusLabel, 'Class Cancelled');
});

t('GCM - Preview: Admin / Super Admin only; HM, VP-teacher, Teacher, Student, BOD rejected on a direct call', () => {
  const F = setup(); const { G } = F;
  setNow(G, at('18:45'));
  assert.ok(Array.isArray(G.getMeetPreviewData(F.tok('admin@aps.org', 'admin')).items));
  assert.ok(Array.isArray(G.getMeetPreviewData(F.tok('sa@aps.org', 'superadmin')).items));
  [['hm@aps.org', 'headmaster'], [TA, 'teacher'], [JO, 'student'], ['bod@aps.org', 'vcfo_amchsts_bod'], ['x@aps.org', 'authorized']].forEach(([e, r]) =>
    assert.throws(() => G.getMeetPreviewData(F.tok(e, r)), /Access denied/, r));
  assert.throws(() => G.getMeetPreviewData('bogus'));
});

t('GCM - Preview: AY26-27 only, no Classroom API calls, LIVE first, Primary Teacher + live text reused', () => {
  const F = setup([ended(TA, '18:29', '18:40'), ended(JO, '18:30', '18:41')]); const { G, cls } = F;
  setNow(G, at('18:45')); delete F.env.cache['aps_class_meet_live_v1'];
  const before = J(cls.calls);
  const d = J(G.getMeetPreviewData(F.tok('admin@aps.org', 'admin')));
  assert.deepStrictEqual(J(cls.calls), before, 'cache only');
  assert.ok(!d.items.some(x => x.id === '9999'), 'AY25-26 excluded');
  assert.strictEqual(d.items[0].status, 'LIVE');
  const n3 = d.items.find(x => String(x.id) === F.ids.N3EF);
  assert.strictEqual(n3.status, 'LIVE'); assert.strictEqual(n3.classStatusLabel, 'Class Started'); assert.ok(/Teacher joined/.test(n3.meetDetail));
  const ranks = { LIVE: 0, UPCOMING: 1, COMPLETED: 2, RESCHEDULED: 3, CANCELLED: 3 };
  for (let i = 1; i < d.items.length; i++) assert.ok(ranks[d.items[i - 1].status] <= ranks[d.items[i].status], 'sorted by status');
  assert.ok(!JSON.stringify(d).includes('@'), 'no email addresses in the GCM payload');
});

console.log(pass + ' passed');

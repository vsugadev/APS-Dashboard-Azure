/**
 * Phase 2 step 1 parity: the Azure Classes view (getDashboardData) against Code.gs getDashboardData run in the
 * Apps Script mock on the same classes, for every role. Parts that are not on Azure yet are listed and skipped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { buildClassesView, countryPreference, gasScopeFor, MAIN_SHEETS, ATTENDANCE_SHEETS } from '../src/api/endpoints/classes';
import { testContext, testConfig } from './helpers';
import { FixtureDataSource } from '../src/data/sources';
import { scriptSettingsFrom } from '../src/config';
import { FixtureLiveSource } from '../src/live/liveSource';
import { LIVE_KEYS, LIVE_PREFIXES, AZURE_SETTING_KEYS, NEVER_KEYS, NEVER_RE } from '../src/live/allowlist';

const ROOT = path.join(__dirname, '..', '..');
const GAS = path.resolve(process.env.APS_GAS_PROJECT || path.join(ROOT, 'gas-source'));
const have = fs.existsSync(path.join(GAS, 'test', 'coveragefixture.js'));
const J = (x: unknown) => JSON.parse(JSON.stringify(x));

// Top-level fields that come in later Phase 2 steps / Phase 3 (see CLASSES_NOT_YET and the header of classes.ts).
const SKIP_TOP = ['assignMonAccess', 'examinationAccess', 'gradingAccess', 'name'];
const SKIP_COURSE = /^$/; // every card field is compared since step 2

/** Rows for the Sheets the copied Code.gs readers read, so every step-2 part has real data (dates as Date cells). */
function seedSheets(F: any) {
  const G = F.G, wb = F.env.wb, now = new Date();
  const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const day = (n: number) => new Date(now.getTime() + n * 86400000);
  const sheet = (name: string, header: string[]) => { const sh = wb.getSheetByName(name) || wb.insertSheet(name); sh.maxCols = Math.max(sh.maxCols || 26, header.length + 5); // the mock's new sheets have 26 columns; the real sheets have all header columns
    if (!sh.data.length || !sh.data[0] || !sh.data[0].length) sh.data[0] = header.slice(); return sh; };
  const row = (header: string[], o: Record<string, unknown>) => header.map((h) => (h in o ? o[h] : ''));
  const ids = J(G.readAllCoursesFromCache_()).map((c: any) => String(c.id));
  // Teacher availability: one "not available" with an arrangement, one confirmed (current week)
  const wk = G.getCurrentWeekId_(now);
  const av = sheet(G.TEACHER_AVAILABILITY_SHEET_NAME, ['Week ID', 'Teacher Email', 'Teacher Name', 'Course ID', 'Course Name', 'Section (Day/Time)', 'Availability Status', 'Alternative Arrangement', 'Updated At', 'Updated By Email', 'Updated By Name']);
  av.data.push([wk, 'x@a.org', 'X', Number(ids[0]), 'n', '', G.AVAILABILITY_STATUS.NOT_AVAILABLE, 'Sub: Kavitha', now, 'x@a.org', 'X'], [wk, 'y@a.org', 'Y', ids[1], 'n', '', G.AVAILABILITY_STATUS.CONFIRMED, '', now, '', '']);
  // WhatsApp link for one class (name matched like Code.gs)
  sheet(G.WHATSAPP_LINKS_SHEET_NAME, ['Class Name', 'Schedule (reference only)', 'WhatsApp Group Link']).data.push(['MUNMAZHALAI - EB | FRI 6:30 - 8:00 PM EST | AY26-27', '', ' https://chat.whatsapp.com/EBGROUP ']);
  // USER_COUNTRY: a teacher outside the USA
  sheet(G.UC_SHEET_, G.UC_HEADER_).data.push(row(G.UC_HEADER_, { Email: 'kavitha_aps8130@avvaiyarpadasalai.org', Country_Code: 'IN', Country_Name: 'India', Source: 'DEFAULT', Updated_At: now }));
  // Approved school leave covering today (Date cells) + a following one that extends the period
  const sl = sheet(G.SL_SHEET_, G.SL_HEADER_);
  sl.data.push(row(G.SL_HEADER_, { Leave_ID: 'SL-1', Leave_Title: 'Diwali break', Start_Date: day(-1), End_Date: day(1), Reason: 'Festival', Leave_Type: 'Festival Holiday', Status: 'APPROVED' }),
    row(G.SL_HEADER_, { Leave_ID: 'SL-2', Leave_Title: 'Extra day', Start_Date: ymd(day(2)), End_Date: ymd(day(2)), Status: 'APPROVED' }),
    row(G.SL_HEADER_, { Leave_ID: 'SL-3', Leave_Title: 'Draft', Start_Date: day(-1), End_Date: day(9), Status: 'DRAFT' }));
  // Temporary Class Coverage merged today (ends in 1 h) — original + destination banners
  sheet(G.TCC_SHEET_, G.TCC_HEADER_).data.push(row(G.TCC_HEADER_, { Merge_ID: 'M1', Original_Course_ID: ids[2], Original_Course_Name: 'Orig', Destination_Course_ID: ids[3], Destination_Course_Name: 'Dest',
    Session_Date: ymd(now), Session_Start: '6:30 PM', Session_End: '8:00 PM', Session_Start_ISO: day(-0.02).toISOString(), Session_End_ISO: new Date(now.getTime() + 3600000), Meet_URL: 'https://meet.google.com/aaa-bbbb-ccc', Announcement_Status: 'POSTED' }));
  // Temp Teacher active now (Date cells)
  sheet(G.TTM_SHEET_, G.TTM_HEADER_).data.push(row(G.TTM_HEADER_, { Assignment_ID: 'T1', Classroom_ID: ids[1], Temp_Teacher_Name: 'Temp T', Temp_Teacher_APSID: 'APS9999', Start_Date: day(-1), Removal_Date: day(5), Status: 'ACTIVE' }));
  const cache = F.env.ctx.CacheService.getScriptCache();
  ['aps_whatsapp_map_v1', G.SL_CACHE_KEY_, G.TCC_CACHE_KEY_, G.TTM_CARD_CACHE_, G.UC_CACHE_KEY_, G.CLASS_MEET_CACHE_KEY_].forEach((k: string) => cache.remove(k));
  G.SL_MEMO_ = { list: null, enabled: null, seen: {} }; G.UC_MEMO_ = null;
}
/** Phase 3 live data in Apps Script's stores, written with Code.gs's own helpers (same encoding as production):
 *  people online now, last login, an onboarded student, a cancelled class, one on-call teacher. */
function seedLive(F: any) {
  const G = F.G, now = new Date(), iso = now.toISOString();
  const ids = J(G.readAllCoursesFromCache_()).map((c: any) => String(c.id));
  const kav = 'kavitha_aps8130@avvaiyarpadasalai.org', stu = 'sa0_aps6650@avvaiyarpadasalai.org';
  G.apsBigSet_(G.PRESENCE_PROP_KEY, JSON.stringify({ [kav]: { lastSeen: iso, loginAt: iso }, [stu]: { lastSeen: iso, loginAt: iso } }));
  G.apsBigSet_(G.LAST_LOGIN_PROP_KEY, JSON.stringify({ [kav]: { gc: '2026-11-01T14:00:00.000Z', gm: null, db: iso }, [stu]: { db: '2026-11-09T22:00:00.000Z' } }));
  G.apsBigSet_(G.ONBOARDED_STUDENTS_PROP_KEY, JSON.stringify({ [stu]: '2026-10-01T12:00:00.000Z' }));
  const sp = G.PropertiesService.getScriptProperties();
  sp.setProperty(G.CLASS_STATUS_PROP_KEY, JSON.stringify({ [ids[4]]: { status: 'cancelled', updatedAt: iso, updatedBy: 'admin@aps.org' } }));
  sp.setProperty(G.ON_CALL_TEACHERS_PROP_KEY, JSON.stringify([{ email: kav, name: 'Kavitha', apsId: 'APS8130' }]));
}
/** Apps Script's live Script / User Properties as the bridge would send them (the mock's stores, allow-listed by
 *  FixtureLiveSource exactly like the real bridge). The App Service settings are only the plain APS_/TCC_… names. */
function liveFromMock(F: any) { return new FixtureLiveSource({ script: F.env.props, user: F.env.userProps }); }
/** The same Sheets as the Azure fixture data source sees them (both workbooks are the one mock workbook). */
function sheetsFromMock(F: any) {
  // The mock has ONE workbook for both spreadsheets: every sheet is visible in both (loaded on demand by the runner).
  const all: Record<string, unknown[][]> = {};
  for (const sh of F.env.wb.getSheets()) all[sh.name] = sh.data.map((r: unknown[]) => (r || []).slice());
  void MAIN_SHEETS; void ATTENDANCE_SHEETS;
  // Extra spreadsheets the copied code opens by ID (Special Classes, Zoho sync log) are the same mock workbook too.
  const out: Record<string, Record<string, unknown[][]>> = { main: all, attendance: all };
  for (const f of ['scSpreadsheetId_', 'zhSheetId_']) if (typeof F.G[f] === 'function') out['id:' + F.G[f]()] = all;
  return out;
}

export function loadFixture() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { setup } = require(path.join(GAS, 'test', 'coveragefixture.js'));
  const log = console.log, warn = console.warn; console.log = () => {}; console.warn = () => {};
  try { return setup(); } finally { console.log = log; console.warn = warn; }
}

function diffs(a: any, b: any, at = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) === !Array.isArray(b)) {
    const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
    return keys.flatMap((k) => diffs(a[k], b[k], at + '.' + k));
  }
  return [at + ': azure=' + JSON.stringify(a)?.slice(0, 80) + ' gas=' + JSON.stringify(b)?.slice(0, 80)];
}

test('Classes view (getDashboardData) matches Code.gs for every role — cards, rosters, schedule/status, filters, order', { skip: !have && 'Apps Script fixture not found' }, async () => {
  const F = loadFixture(); const G = F.G;
  seedSheets(F);
  G.recordHeartbeat_ = () => {}; // Code.gs writes the viewer's heartbeat; Azure writes nothing yet (Phase 3 reads only)
  seedLive(F);
  G.getGoogleProfileName_ = () => null; // Admin Directory profile names: not on Azure (badge falls back like Code.gs)
  const list = (k: string) => J(G.getConfigList_(k, []));
  const cfg = testConfig({
    superadminEmails: list('SUPERADMIN_EMAILS'), adminEmails: J(G.ADMIN_EMAILS), headmasterEmails: J(G.HEADMASTER_EMAILS), bodEmails: list('VCFO_AMCHATS_BOD_EMAILS'),
    onCallCoordinatorEmails: list('ON_CALL_COORDINATOR_EMAILS'), rosterHiddenStaffAdditionalEmails: J(G.ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS), gradingTeamEmails: J(G.APS_GRADING_TEAM_EMAILS_),
    scriptSettings: scriptSettingsFrom(J(G.PropertiesService.getScriptProperties().getProperties())), attendanceSpreadsheetId: 'mock', targetSpreadsheetId: 'TGT',
  });
  const seen = { avail: 0, alt: 0, wa: 0, meet: 0, flag: 0, covO: 0, covD: 0, ttm: 0, leave: 0, covAccess: 0, ttmAccess: 0, online: 0, lastLogin: 0, onboarded: 0, cancelled: 0, onCall: 0 };
  const viewers: [string, string][] = [['admin@aps.org', 'admin'], ['hm@aps.org', 'headmaster'], ['bod@aps.org', 'vcfo_amchsts_bod'], [F.vpEmail, 'teacher'],
    ['kavitha_aps8130@avvaiyarpadasalai.org', 'teacher'], ['sa0_aps6650@avvaiyarpadasalai.org', 'student'], ['someone@namaps.org', 'authorized']];
  let compared = 0;
  for (const [email, role] of viewers) {
    const courses = J(G.readAllCoursesFromCache_());
    const ctx = testContext({ cfg }); ctx.data = new FixtureDataSource({ courses, userRoles: {}, accessOverrides: {}, sheets: sheetsFromMock(F) }); ctx.live = liveFromMock(F);
    const now = new Date();
    const gas = J(G.getDashboardData(F.tok(email, role)));
    const az = J(await buildClassesView(ctx, { email, role }, J(courses), now));
    for (const k of SKIP_TOP) { delete gas[k]; delete az[k]; }
    if (az.schoolLeave && az.schoolLeave.isSchoolLeave) seen.leave++;
    if (az.onCallTeacher && az.onCallTeacherCount === 1) seen.onCall++;
    if (az.coverageAccess) seen.covAccess++; if (az.tempTeacherAccess) seen.ttmAccess++;
    for (const c of az.courses) {
      if (c.teacherAvailabilityStatus !== 'Not Set') seen.avail++; if (c.teacherAvailabilityAlt) seen.alt++; if (c.whatsappLink) seen.wa++; if (c.meetLink) seen.meet++;
      if (c.coverageToday && c.coverageToday.role === 'original') seen.covO++; if (c.coverageToday && c.coverageToday.role === 'destination') seen.covD++; if (c.tempTeacherNote) seen.ttm++;
      for (const p of (c.teachers || []).concat(c.students || [])) { if (p.countryFlag) seen.flag++; if (p.online) seen.online++; if (p.lastLoginAt) seen.lastLogin++; if (p.onboarded) seen.onboarded++; }
      if (c.classStatus === 'cancelled' && c.classStatusManual) seen.cancelled++;
    }
    assert.deepEqual(az.courses.map((c: any) => c.id), gas.courses.map((c: any) => c.id), role + ': same classes, same order');
    az.courses.forEach((c: any, i: number) => {
      const g = gas.courses[i];
      for (const k of Object.keys(g).concat(Object.keys(c))) if (SKIP_COURSE.test(k)) { delete g[k]; delete c[k]; }
      if (g.classMeetDetail) { for (const k of ['classStatus', 'classStatusLabel', 'classStatusColorCategory', 'classMeetDetail', 'liveBox']) { delete g[k]; delete c[k]; } } // live Meet status: Phase 3
      compared++;
    });
    const d = diffs(az, gas);
    assert.deepEqual(d, [], role + ' differences:\n' + d.slice(0, 15).join('\n'));
  }
  assert.ok(compared >= 20, 'compared ' + compared + ' class cards');
  // every step-2 part really had data on both sides (not just "empty = empty")
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 0, 'part exercised (step 2 / Phase 3 live data): ' + k);
});

test('getMyCountryPreference matches Code.gs (USER_COUNTRY row, no row, feature off) — never asks for a country', { skip: !have && 'Apps Script fixture not found' }, async () => {
  const F = loadFixture(); const G = F.G;
  seedSheets(F);
  const email = 'kavitha_aps8130@avvaiyarpadasalai.org', tok = F.tok(email, 'teacher');
  const scope = async (settings: Record<string, string>) => { const ctx = testContext({ cfg: testConfig({ scriptSettings: settings }) }); ctx.data = new FixtureDataSource({ sheets: sheetsFromMock(F) }); return gasScopeFor(ctx); };
  const on = J(countryPreference(await scope({}), email));
  assert.deepEqual(on, J(G.getMyCountryPreference(tok))); assert.equal(on.countryCode, 'IN', 'the USER_COUNTRY row is used');
  assert.deepEqual(J(countryPreference(await scope({}), 'nobody@avvaiyarpadasalai.org')), J(G.getMyCountryPreference(F.tok('nobody@avvaiyarpadasalai.org', 'teacher'))));
  G.PropertiesService.getScriptProperties().setProperty('APS_COUNTRY_FEATURE', 'off'); G.APS_REQ_MEMO_ = null;
  assert.deepEqual(J(countryPreference(await scope({ APS_COUNTRY_FEATURE: 'off' }), email)), J(G.getMyCountryPreference(tok)));
});

test('Teacher Availability view (getClassTeacherAvailabilityView) matches Code.gs — teacher form, Admin / HM / BOD report, refusals', { skip: !have && 'Apps Script fixture not found' }, async () => {
  const F = loadFixture(); const G = F.G;
  seedSheets(F);
  // this week's own selections (Teacher_Availability_Selection)
  const wk = G.getCurrentWeekId_(new Date()), H = J(G.CTA_SELECTION_HEADER_);
  const sel = F.env.wb.getSheetByName(G.CTA_SELECTION_SHEET_) || F.env.wb.insertSheet(G.CTA_SELECTION_SHEET_); sel.maxCols = 40;
  if (!sel.data.length || !sel.data[0] || !sel.data[0].length) sel.data[0] = H.slice();
  const now = new Date().toISOString();
  sel.data.push([wk, G.COURSE_NAME_SUFFIX, 'kavitha_aps8130@avvaiyarpadasalai.org', 'Kavitha Raman', 'APS8130', 'MUNMAZHALAI', 'FRI 6:30 - 8:00 PM EST', 'confirmed', now, now, 'kavitha_aps8130@avvaiyarpadasalai.org'],
    [wk, G.COURSE_NAME_SUFFIX, 'senthil_aps8131@avvaiyarpadasalai.org', 'Senthil Kumar', 'APS8131', '', '', 'not_available', now, now, 'senthil_aps8131@avvaiyarpadasalai.org']);
  const list = (k: string) => J(G.getConfigList_(k, []));
  const cfg = testConfig({ superadminEmails: list('SUPERADMIN_EMAILS'), adminEmails: J(G.ADMIN_EMAILS), headmasterEmails: J(G.HEADMASTER_EMAILS), bodEmails: list('VCFO_AMCHATS_BOD_EMAILS'),
    onCallCoordinatorEmails: list('ON_CALL_COORDINATOR_EMAILS'), rosterHiddenStaffAdditionalEmails: J(G.ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS), gradingTeamEmails: J(G.APS_GRADING_TEAM_EMAILS_),
    scriptSettings: scriptSettingsFrom(J(G.PropertiesService.getScriptProperties().getProperties())), attendanceSpreadsheetId: 'mock', targetSpreadsheetId: 'TGT' });
  const reg = (await import('../src/server')).buildRegistry();
  const viewers: [string, string][] = [['kavitha_aps8130@avvaiyarpadasalai.org', 'teacher'], ['admin@aps.org', 'admin'], ['hm@aps.org', 'headmaster'], ['bod@aps.org', 'vcfo_amchsts_bod'], ['sa0_aps6650@avvaiyarpadasalai.org', 'student']];
  let reports = 0;
  for (const [email, role] of viewers) {
    const ctx = testContext({ cfg }); ctx.data = new FixtureDataSource({ courses: J(G.readAllCoursesFromCache_()), userRoles: {}, accessOverrides: {}, sheets: sheetsFromMock(F) }); ctx.live = liveFromMock(F);
    const token = await ctx.sessions.create({ email, role });
    let gas: any; try { gas = J(G.getClassTeacherAvailabilityView(F.tok(email, role))); } catch (e) { gas = { err: (e as Error).message }; }
    const az: any = await reg.call(ctx, 'getClassTeacherAvailabilityView', [token]);
    if (gas.err) { assert.deepEqual(az, { err: gas.err }, role + ': same refusal'); continue; }
    assert.ok(az.ok, role + ': Azure answered ' + JSON.stringify(az));
    const a = az.ok;
    assert.equal(a.canSubmit, false, role + ': Save is not on Azure yet'); assert.equal(a.canSendTest, false); assert.equal(a.azureReadOnly, true);
    for (const k of ['canSubmit', 'canSendTest', 'azureReadOnly']) { delete a[k]; delete gas[k]; }
    if (a.report) { delete a.report.generatedAt; delete gas.report.generatedAt; reports++; }
    const d = diffs(a, gas);
    assert.deepEqual(d, [], role + ' differences:\n' + d.slice(0, 15).join('\n'));
    if (role === 'teacher') assert.equal(a.mine && a.mine.status, 'confirmed', 'teacher sees own saved week');
  }
  assert.ok(reports >= 3, 'Admin / HM / BOD weekly report compared');
});

test('Active Directory (getDirectoryIndex) matches Code.gs — full tier (staff, teacher) and basic tier (student, authorized)', { skip: !have && 'Apps Script fixture not found' }, async () => {
  const F = loadFixture(); const G = F.G;
  seedSheets(F);
  seedLive(F); // Phase 3: online now / last login / onboarded come from Apps Script's stores (bridge snapshot)
  const list = (k: string) => J(G.getConfigList_(k, []));
  const cfg = testConfig({ superadminEmails: list('SUPERADMIN_EMAILS'), adminEmails: J(G.ADMIN_EMAILS), headmasterEmails: J(G.HEADMASTER_EMAILS), bodEmails: list('VCFO_AMCHATS_BOD_EMAILS'),
    onCallCoordinatorEmails: list('ON_CALL_COORDINATOR_EMAILS'), rosterHiddenStaffAdditionalEmails: J(G.ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS), gradingTeamEmails: J(G.APS_GRADING_TEAM_EMAILS_),
    scriptSettings: scriptSettingsFrom(J(G.PropertiesService.getScriptProperties().getProperties())), attendanceSpreadsheetId: 'mock', targetSpreadsheetId: 'TGT' });
  const reg = (await import('../src/server')).buildRegistry();
  const viewers: [string, string][] = [['admin@aps.org', 'admin'], ['hm@aps.org', 'headmaster'], ['bod@aps.org', 'vcfo_amchsts_bod'], ['kavitha_aps8130@avvaiyarpadasalai.org', 'teacher'],
    ['sa0_aps6650@avvaiyarpadasalai.org', 'student'], ['someone@namaps.org', 'authorized']];
  const tiers: Record<string, number> = {}; let live = 0;
  for (const [email, role] of viewers) {
    const ctx = testContext({ cfg }); ctx.data = new FixtureDataSource({ courses: J(G.readAllCoursesFromCache_()), userRoles: {}, accessOverrides: {}, sheets: sheetsFromMock(F) }); ctx.live = liveFromMock(F);
    const token = await ctx.sessions.create({ email, role });
    let gas: any; try { gas = J(G.getDirectoryIndex(F.tok(email, role))); } catch (e) { gas = { err: (e as Error).message }; }
    const az: any = await reg.call(ctx, 'getDirectoryIndex', [token]);
    if (gas.err) { assert.deepEqual(az, { err: gas.err }, role + ': same refusal'); continue; }
    assert.ok(az.ok, role + ': Azure answered ' + JSON.stringify(az));
    delete az.ok.builtAt; delete gas.builtAt;
    const d = diffs(az.ok, gas);
    assert.deepEqual(d, [], role + ' differences:\n' + d.slice(0, 15).join('\n'));
    tiers[gas.tier] = (tiers[gas.tier] || 0) + 1;
    for (const c of az.ok.classes) for (const p of (c.teachers || []).concat(c.students || [])) if (p.online || p.lastLoginAt) live++;
    if (gas.tier === 'basic') assert.ok(az.ok.classes.every((c: any) => c.students.every((p: any) => !p.email || p.email.toLowerCase() === email)), 'basic tier: no other student emails');
  }
  assert.ok(tiers.full >= 3 && tiers.basic >= 1, 'both tiers compared: ' + JSON.stringify(tiers));
  assert.ok(live > 0, 'live data (online / last login) appeared in the Directory');
});

/** Two real weekly attendance sheets (AWKnnATT) + Attendance_Summary + Attendance_Audit_Log, some cells as Date cells. */
function seedAttendance(F: any) {
  const G = F.G, wb = F.env.wb, now = new Date();
  const week1 = G.getAttendanceWeek1Start_(), curId = G.getCurrentWeekId_(now), curNo = Math.max(2, G.attWeekNumberForWeekId_(curId, week1));
  const courses = J(G.readAllCoursesFromCache_());
  const mk = (name: string, header: string[]) => { const sh = wb.getSheetByName(name) || wb.insertSheet(name); sh.maxCols = header.length + 5; sh.data = [header.slice()]; return sh; };
  let n = 0;
  for (const weekNo of [curNo - 1, curNo]) {
    const weekId = G.attWeekIdForNumber_(weekNo, week1), date = weekId.slice(3);
    const sh = mk(G.formatAwkSheetName_(weekNo), J(G.ATTENDANCE_HEADER_ROW));
    for (const c of courses.slice(0, 4)) {
      const people = (c.teachers || []).map((t: any) => [t, 'TEACHER']).concat((c.students || []).slice(0, 4).map((p: any) => [p, 'STUDENT']));
      for (const [p, role] of people) {
        n++;
        const status = n % 5 === 0 ? 'ABSENT' : n % 7 === 0 ? 'LATE' : 'PRESENT';
        const row = G.attRecordToRow_({ date, courseId: String(c.id), className: c.name, level: '', section: '', day: 'FRI', schedStart: '6:30 PM', schedEnd: '8:00 PM', tz: 'EST', academicYear: 'AY26-27',
          personName: p.name, apsId: G.getAPSIdFromEmail(p.email), email: p.email, role, sessionCount: 1, sessionDetails: '', firstJoin: '6:31 PM', lastLeave: '7:58 PM',
          activeMinutes: status === 'ABSENT' ? 0 : 80, status, lastUpdated: '', autoStatus: status, overrideStatus: n % 11 === 0 ? 'EXCUSED' : '', overrideBy: n % 11 === 0 ? 'admin@aps.org' : '',
          overrideReason: n % 11 === 0 ? 'Leave' : '', weekOf: weekId, weekNo, callMinutes: 90, attendedPct: 89, autoScore: 100, score: 100, actualClassMinutes: 90, effectiveClassMinutes: 90 });
        if (n % 3 === 0) row[0] = new Date(date + 'T12:00:00Z'); // older rows were saved as Date cells
        sh.data.push(row);
      }
    }
  }
  const sum = mk(G.ATTENDANCE_SUMMARY_SHEET_NAME, J(G.ATTENDANCE_SUMMARY_HEADER_ROW));
  for (const c of courses.slice(0, 2)) for (const p of (c.students || []).slice(0, 3)) sum.data.push([String(c.id), c.name, p.name, p.email, 'STUDENT', 2, 160, 180, 180, 180, 88.9, now]);
  const aud = mk(G.ATTENDANCE_AUDIT_LOG_SHEET_NAME, J(G.ATTENDANCE_AUDIT_LOG_HEADER_ROW));
  aud.data.push([new Date(now.getTime() - 3600000), 'admin@aps.org', 'admin', String(courses[0].id), courses[0].name, curId.slice(3), 'Kid', 'kid_aps1@avvaiyarpadasalai.org', 'STUDENT', 'ABSENT', 'EXCUSED', 'Leave', 'OVERRIDE', 'ABSENT'],
    ['2026-11-01 10:00', 'hm@aps.org', 'headmaster', String(courses[1].id), courses[1].name, new Date('2026-10-30T12:00:00Z'), 'Kid2', 'kid_aps2@avvaiyarpadasalai.org', 'STUDENT', 'PRESENT', 'ABSENT', 'x', 'OVERRIDE', 'PRESENT']);
  return { curId, prevId: G.attWeekIdForNumber_(curNo - 1, week1), courseId: String(courses[0].id) };
}

test('Attendance tab reads (7 functions) match Code.gs for every role — weekly sheets loaded on demand, read-only', { skip: !have && 'Apps Script fixture not found' }, async () => {
  const F = loadFixture(); const G = F.G;
  seedSheets(F); const W = seedAttendance(F);
  const list = (k: string) => J(G.getConfigList_(k, []));
  const cfg = testConfig({ superadminEmails: list('SUPERADMIN_EMAILS'), adminEmails: J(G.ADMIN_EMAILS), headmasterEmails: J(G.HEADMASTER_EMAILS), bodEmails: list('VCFO_AMCHATS_BOD_EMAILS'),
    onCallCoordinatorEmails: list('ON_CALL_COORDINATOR_EMAILS'), rosterHiddenStaffAdditionalEmails: J(G.ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS), gradingTeamEmails: J(G.APS_GRADING_TEAM_EMAILS_),
    scriptSettings: scriptSettingsFrom(J(G.PropertiesService.getScriptProperties().getProperties())), attendanceSpreadsheetId: 'mock', targetSpreadsheetId: 'TGT' });
  const reg = (await import('../src/server')).buildRegistry();
  const viewers: [string, string][] = [['admin@aps.org', 'admin'], ['hm@aps.org', 'headmaster'], ['bod@aps.org', 'vcfo_amchsts_bod'], [F.vpEmail, 'teacher'],
    ['kavitha_aps8130@avvaiyarpadasalai.org', 'teacher'], ['sa0_aps6650@avvaiyarpadasalai.org', 'student'], ['someone@namaps.org', 'authorized']];
  const calls: [string, unknown[]][] = [['getAttendanceWeekOptions', []], ['getAttendanceCourseAwkMap', []], ['getAttendanceRecordsForViewer', [{}]],
    ['getAttendanceRecordsForViewer', [{ weekOf: W.curId }]], ['getAttendanceRecordsForViewer', [{ weekOf: W.prevId, courseId: W.courseId }]], ['getAttendanceRecordsForViewer', [{ scope: 'mine' }]],
    ['getOnCallTeacherAttendance', [{ includeNotJoined: true }]], ['getAttendanceAuditLog', [{}]], ['getAttendanceSyncDiagnostics', []], ['getAttendanceLastSyncInfo', []]];
  let rows = 0, editableOnGas = 0, refusals = 0, awk = 0;
  for (const [email, role] of viewers) {
    for (const [fn, args] of calls) {
      const ctx = testContext({ cfg }); ctx.data = new FixtureDataSource({ courses: J(G.readAllCoursesFromCache_()), userRoles: {}, accessOverrides: {}, sheets: sheetsFromMock(F) }); ctx.live = liveFromMock(F);
      const token = await ctx.sessions.create({ email, role });
      let gas: any; try { gas = J(G[fn](F.tok(email, role), ...J(args))); } catch (e) { gas = { err: (e as Error).message }; }
      const az: any = await reg.call(ctx, fn, [token, ...J(args)]);
      if (gas && gas.err) { assert.deepEqual(az, { err: gas.err }, role + ' ' + fn + ': same refusal'); refusals++; continue; }
      assert.ok('ok' in az, role + ' ' + fn + ': Azure answered ' + JSON.stringify(az).slice(0, 300));
      let a = az.ok;
      if (fn === 'getAttendanceRecordsForViewer') { for (const r of gas) { if (r.editable) editableOnGas++; r.editable = false; } rows += a.length; }
      if (fn === 'getAttendanceCourseAwkMap') awk += a.length;
    const d = diffs(a, gas);
      assert.deepEqual(d, [], role + ' ' + fn + ' ' + JSON.stringify(args) + ' differences:\n' + d.slice(0, 15).join('\n'));
      a = null;
    }
  }
  assert.ok(rows > 50 && editableOnGas > 0 && refusals > 0 && awk >= 2, JSON.stringify({ rows, editableOnGas, refusals, awk }));
});

test('Remaining read-only calls (Phase 2 step 6, 62 functions) match Code.gs for every role — same answer or same refusal', { skip: !have && 'Apps Script fixture not found' }, async () => {
  const F = loadFixture(); const G = F.G;
  seedSheets(F); seedAttendance(F);
  const list = (k: string) => J(G.getConfigList_(k, []));
  const cfg = testConfig({ superadminEmails: list('SUPERADMIN_EMAILS'), adminEmails: J(G.ADMIN_EMAILS), headmasterEmails: J(G.HEADMASTER_EMAILS), bodEmails: list('VCFO_AMCHATS_BOD_EMAILS'),
    onCallCoordinatorEmails: list('ON_CALL_COORDINATOR_EMAILS'), rosterHiddenStaffAdditionalEmails: J(G.ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS), gradingTeamEmails: J(G.APS_GRADING_TEAM_EMAILS_),
    scriptSettings: scriptSettingsFrom(J(G.PropertiesService.getScriptProperties().getProperties())), attendanceSpreadsheetId: 'mock', targetSpreadsheetId: 'TGT' });
  // Real rows for the parts that live in their own sheets / spreadsheets (so "same" is never "empty = empty").
  const put = (name: string, rows: unknown[][]) => { const sh = F.env.wb.getSheetByName(name) || F.env.wb.insertSheet(name); sh.maxCols = Math.max(sh.maxCols || 26, rows[0].length); sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows); };
  const kav = 'kavitha_aps8130@avvaiyarpadasalai.org';
  const rl = (o: Record<string, string>) => G.REFERENCE_LETTER_FIELD_KEYS.map((k: string) => o[k] || '');
  put(G.REFERENCE_LETTER_SHEET_NAME, [G.REFERENCE_LETTER_COLUMNS,
    rl({ requestId: 'RL-0001', requestDateTime: '2026-10-01 09:00', teacherEmail: kav, teacherName: 'Kavitha', requestReason: 'Job application', requestStatus: 'PENDING_STAGE1', source: G.REFERENCE_LETTER_SOURCE.TEACHER_SELF, letterType: 'REFERENCE' }),
    rl({ requestId: 'RL-0002', requestDateTime: '2026-10-05 10:30', teacherEmail: kav, teacherName: 'Kavitha', requestReason: 'Visa', requestStatus: 'COMPLETED', source: G.REFERENCE_LETTER_SOURCE.TEACHER_SELF, letterType: 'REFERENCE' })]);
  put('APS_SPECIAL_CLASSES_LIVE', [['Title', 'Special Class ID', 'Audience', 'Mode', 'Registration Link', 'Status'],
    ['Tamil grammar camp', 'SC-2026-010', 'Students Only', 'Zoom Meeting', 'https://ok.example/x', 'Active'],
    ['Parents meet', 'SC-2026-011', 'All', 'Zoom Meeting', 'https://ok.example/y', 'Active']]);
  put(G.ZH_LOG_SHEET_, [G.ZH_LOG_HEADER_, G.ZH_LOG_HEADER_.map((h: string, i: number) => (i === 0 ? 'LOG-1' : i === 3 ? 'admin@aps.org' : i === 4 ? 'UPDATE' : 'v' + i))]);
  const { READS2 } = await import('../src/api/endpoints/reads');
  const P = Object.getPrototypeOf(F.env.wb.getSheetByName('Courses')); P.getMaxRows = P.getMaxRows || function (this: any) { return Math.max(1000, this.data.length); }; // the mock lacks getMaxRows (real sheets have it)
  const reg = (await import('../src/server')).buildRegistry();
  G.getGoogleProfileName_ = () => null; G.apsDashboardUrl_ = () => 'https://www.avvaiyarpadasalai.org'; // same as the Azure runtime
  const viewers: [string, string][] = [['admin@aps.org', 'admin'], ['hm@aps.org', 'headmaster'], ['bod@aps.org', 'vcfo_amchsts_bod'], [F.vpEmail, 'teacher'],
    ['kavitha_aps8130@avvaiyarpadasalai.org', 'teacher'], ['sa0_aps6650@avvaiyarpadasalai.org', 'student']];
  const problems: string[] = []; let same = 0, refusals = 0, answers = 0;
  for (const name of Object.values(READS2).flat()) for (const [email, role] of viewers) {
    const ctx = testContext({ cfg }); ctx.data = new FixtureDataSource({ courses: J(G.readAllCoursesFromCache_()), userRoles: {}, accessOverrides: {}, sheets: sheetsFromMock(F) }); ctx.live = liveFromMock(F);
    const token = await ctx.sessions.create({ email, role });
    let gas: any; try { gas = J(G[name](F.tok(email, role))); } catch (e) { gas = { err: (e as Error).message }; }
    if (gas === undefined) gas = null;
    const az: any = await reg.call(ctx, name, [token]);
    const a = 'ok' in az ? (az.ok === undefined ? null : az.ok) : { err: az.err };
    // mailReady: Code.gs checks its mail credentials; they never leave Apps Script and Azure sends no email yet → false.
    if (gas && typeof gas === 'object' && 'mailReady' in gas && a && typeof a === 'object') { assert.equal(a.mailReady, false, name + ': no email on Azure'); a.mailReady = gas.mailReady; }
    if (name === 'getCacheSheetUrl' && gas === 'u' && typeof a === 'string' && /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/edit$/.test(a)) gas = a; // the mock's getUrl() is the literal 'u'
    const d = diffs(a, gas);
    if (d.length) problems.push(role + ' ' + name + ': ' + d.slice(0, 3).join(' | '));
    else { same++; if (gas && gas.err) refusals++; else answers++; }
  }
  assert.deepEqual(problems, [], problems.length + ' differences:\n' + problems.slice(0, 40).join('\n'));
  // the seeded parts really came back through Azure (other spreadsheets opened read-only by ID)
  const one = async (name: string, email: string, role: string) => { const ctx = testContext({ cfg }); ctx.data = new FixtureDataSource({ courses: J(G.readAllCoursesFromCache_()), userRoles: {}, accessOverrides: {}, sheets: sheetsFromMock(F) }); ctx.live = liveFromMock(F); return (await reg.call(ctx, name, [await ctx.sessions.create({ email, role })]) as any).ok; };
  assert.equal((await one('getMyReferenceLetterRequests', kav, 'teacher')).length, 2, 'reference letters');
  assert.ok((await one('getReferenceLetterRequestsForApprover', 'admin@aps.org', 'admin')).length >= 2, 'approver queue');
  assert.ok(JSON.stringify(await one('getSpecialClassesAdmin', 'admin@aps.org', 'admin')).includes('SC-2026-010'), 'special classes (own spreadsheet)');
  assert.ok(JSON.stringify(await one('getSpecialClasses', 'sa0_aps6650@avvaiyarpadasalai.org', 'student')).includes('Tamil grammar camp'), 'special classes for a student');
  assert.equal((await one('getZohoSyncHistory', 'admin@aps.org', 'admin'))[0]['Log ID'], 'LOG-1', 'Zoho sync log (own spreadsheet)');
  assert.ok(answers > 100 && refusals > 20, JSON.stringify({ same, answers, refusals }));
});

test('Phase 3: realtime poll (getRealtimeStatusSnapshot) matches Code.gs for every role — online, last login, class status, live flags', { skip: !have && 'Apps Script fixture not found' }, async () => {
  const F = loadFixture(); const G = F.G;
  seedSheets(F); seedLive(F);
  const ids = J(G.readAllCoursesFromCache_()).map((c: any) => String(c.id)), iso = new Date().toISOString();
  const sp = G.PropertiesService.getScriptProperties();
  sp.setProperty(G.LIVE_PROP_KEY, JSON.stringify({ [ids[0]]: { live: true, updatedAt: iso, updatedBy: 'admin@aps.org' } }));
  sp.setProperty(G.TEACHER_NOT_IN_CLASS_PROP_KEY, JSON.stringify({ [ids[1]]: { flagged: true, updatedAt: iso } }));
  sp.setProperty(G.NEEDS_TECH_SUPPORT_PROP_KEY, JSON.stringify({ [ids[2]]: { flagged: true, updatedAt: iso } }));
  G.chatVersion_ = () => ''; // chat is not on Azure: constant version (runtime) — same on both sides
  const list = (k: string) => J(G.getConfigList_(k, []));
  const cfg = testConfig({ superadminEmails: list('SUPERADMIN_EMAILS'), adminEmails: J(G.ADMIN_EMAILS), headmasterEmails: J(G.HEADMASTER_EMAILS), bodEmails: list('VCFO_AMCHATS_BOD_EMAILS'),
    onCallCoordinatorEmails: list('ON_CALL_COORDINATOR_EMAILS'), rosterHiddenStaffAdditionalEmails: J(G.ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS), gradingTeamEmails: J(G.APS_GRADING_TEAM_EMAILS_),
    scriptSettings: scriptSettingsFrom(J(G.PropertiesService.getScriptProperties().getProperties())), attendanceSpreadsheetId: 'mock', targetSpreadsheetId: 'TGT' });
  const reg = (await import('../src/server')).buildRegistry();
  const viewers: [string, string][] = [['admin@aps.org', 'admin'], ['hm@aps.org', 'headmaster'], ['bod@aps.org', 'vcfo_amchsts_bod'], [F.vpEmail, 'teacher'],
    ['kavitha_aps8130@avvaiyarpadasalai.org', 'teacher'], ['sa0_aps6650@avvaiyarpadasalai.org', 'student'], ['someone@namaps.org', 'authorized']];
  const seen = { presence: 0, lastLogin: 0, classStatusManual: 0, live: 0, teacherNotInClass: 0, needsTechSupport: 0 };
  for (const [email, role] of viewers) {
    const ctx = testContext({ cfg }); ctx.data = new FixtureDataSource({ courses: J(G.readAllCoursesFromCache_()), userRoles: {}, accessOverrides: {}, sheets: sheetsFromMock(F) }); ctx.live = liveFromMock(F);
    G.CacheService.getScriptCache().remove(G.APS_RT_RECENT_KEY_);
    let gas: any; try { gas = J(G.getRealtimeStatusSnapshot(F.tok(email, role))); } catch (e) { gas = { err: (e as Error).message }; }
    const az: any = await reg.call(ctx, 'getRealtimeStatusSnapshot', [await ctx.sessions.create({ email, role })]);
    if (gas.err) { assert.deepEqual(az, { err: gas.err }, role + ': same refusal'); continue; }
    const a = az.ok; delete a.serverTime; delete gas.serverTime;
    const d = diffs(a, gas);
    assert.deepEqual(d, [], role + ' differences:\n' + d.slice(0, 15).join('\n'));
    for (const k of Object.keys(seen) as (keyof typeof seen)[]) if (a[k] && Object.keys(a[k]).length) seen[k]++;
  }
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 0, 'realtime part had data: ' + k);
});

test('Phase 3: every Script / User Property the copied Code.gs code read in these tests is classified (live, Azure setting or never sent)', async () => {
  const { PROPERTY_READS } = await import('../src/gas/runtime');
  assert.ok(PROPERTY_READS.size > 50, 'property reads were recorded: ' + PROPERTY_READS.size);
  const loose: string[] = [];
  for (const tagged of PROPERTY_READS) {
    const k = tagged.slice(2);
    if (k === '*') { loose.push(tagged + ' (getProperties: list the keys it needs instead)'); continue; }
    const known = LIVE_KEYS.includes(k) || LIVE_PREFIXES.some((p) => k.startsWith(p)) || AZURE_SETTING_KEYS.includes(k) || NEVER_KEYS.includes(k) || NEVER_RE.test(k);
    if (!known) loose.push(tagged);
  }
  assert.deepEqual(loose, [], 'add these to src/live/allowlist.ts AND AzureBridge.gs (or to the never lists)');
});

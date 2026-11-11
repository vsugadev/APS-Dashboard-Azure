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

const ROOT = path.join(__dirname, '..', '..');
const GAS = path.resolve(process.env.APS_GAS_PROJECT || path.join(ROOT, 'gas-source'));
const have = fs.existsSync(path.join(GAS, 'test', 'coveragefixture.js'));
const J = (x: unknown) => JSON.parse(JSON.stringify(x));

// Top-level fields that come in later Phase 2 steps / Phase 3 (see CLASSES_NOT_YET and the header of classes.ts).
const SKIP_TOP = ['assignMonAccess', 'examinationAccess', 'gradingAccess', 'onCallTeacher', 'onCallTeacherCount', 'name'];
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
/** The same Sheets as the Azure fixture data source sees them (both workbooks are the one mock workbook). */
function sheetsFromMock(F: any) {
  const pick = (names: string[]) => { const o: Record<string, unknown[][]> = {}; for (const n of names) { const sh = F.env.wb.getSheetByName(n); if (sh) o[n] = sh.data.map((r: unknown[]) => (r || []).slice()); } return o; };
  return { main: pick(MAIN_SHEETS), attendance: pick(ATTENDANCE_SHEETS) };
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
  G.recordHeartbeat_ = () => {}; // Code.gs writes the viewer's heartbeat (live data — Phase 3; Azure writes nothing)
  G.getGoogleProfileName_ = () => null; // Admin Directory profile names: not on Azure (badge falls back like Code.gs)
  const list = (k: string) => J(G.getConfigList_(k, []));
  const cfg = testConfig({
    superadminEmails: list('SUPERADMIN_EMAILS'), adminEmails: J(G.ADMIN_EMAILS), headmasterEmails: J(G.HEADMASTER_EMAILS), bodEmails: list('VCFO_AMCHATS_BOD_EMAILS'),
    onCallCoordinatorEmails: list('ON_CALL_COORDINATOR_EMAILS'), rosterHiddenStaffAdditionalEmails: J(G.ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS), gradingTeamEmails: J(G.APS_GRADING_TEAM_EMAILS_),
    scriptSettings: J(G.PropertiesService.getScriptProperties().getProperties()), attendanceSpreadsheetId: 'mock',
  });
  const seen = { avail: 0, alt: 0, wa: 0, meet: 0, flag: 0, covO: 0, covD: 0, ttm: 0, leave: 0, covAccess: 0, ttmAccess: 0 };
  const viewers: [string, string][] = [['admin@aps.org', 'admin'], ['hm@aps.org', 'headmaster'], ['bod@aps.org', 'vcfo_amchsts_bod'], [F.vpEmail, 'teacher'],
    ['kavitha_aps8130@avvaiyarpadasalai.org', 'teacher'], ['sa0_aps6650@avvaiyarpadasalai.org', 'student'], ['someone@namaps.org', 'authorized']];
  let compared = 0;
  for (const [email, role] of viewers) {
    const courses = J(G.readAllCoursesFromCache_());
    const ctx = testContext({ cfg }); ctx.data = new FixtureDataSource({ courses, userRoles: {}, accessOverrides: {}, sheets: sheetsFromMock(F) });
    const now = new Date();
    const gas = J(G.getDashboardData(F.tok(email, role)));
    const az = J(await buildClassesView(ctx, { email, role }, J(courses), now));
    for (const k of SKIP_TOP) { delete gas[k]; delete az[k]; }
    if (az.schoolLeave && az.schoolLeave.isSchoolLeave) seen.leave++;
    if (az.coverageAccess) seen.covAccess++; if (az.tempTeacherAccess) seen.ttmAccess++;
    for (const c of az.courses) {
      if (c.teacherAvailabilityStatus !== 'Not Set') seen.avail++; if (c.teacherAvailabilityAlt) seen.alt++; if (c.whatsappLink) seen.wa++; if (c.meetLink) seen.meet++;
      if (c.coverageToday && c.coverageToday.role === 'original') seen.covO++; if (c.coverageToday && c.coverageToday.role === 'destination') seen.covD++; if (c.tempTeacherNote) seen.ttm++;
      for (const p of (c.teachers || []).concat(c.students || [])) if (p.countryFlag) seen.flag++;
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
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 0, 'step-2 part exercised: ' + k);
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
    scriptSettings: J(G.PropertiesService.getScriptProperties().getProperties()), attendanceSpreadsheetId: 'mock' });
  const reg = (await import('../src/server')).buildRegistry();
  const viewers: [string, string][] = [['kavitha_aps8130@avvaiyarpadasalai.org', 'teacher'], ['admin@aps.org', 'admin'], ['hm@aps.org', 'headmaster'], ['bod@aps.org', 'vcfo_amchsts_bod'], ['sa0_aps6650@avvaiyarpadasalai.org', 'student']];
  let reports = 0;
  for (const [email, role] of viewers) {
    const ctx = testContext({ cfg }); ctx.data = new FixtureDataSource({ courses: J(G.readAllCoursesFromCache_()), userRoles: {}, accessOverrides: {}, sheets: sheetsFromMock(F) });
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

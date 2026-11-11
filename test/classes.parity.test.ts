/**
 * Phase 2 step 1 parity: the Azure Classes view (getDashboardData) against Code.gs getDashboardData run in the
 * Apps Script mock on the same classes, for every role. Parts that are not on Azure yet are listed and skipped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { buildClassesView, countryPreference } from '../src/api/endpoints/classes';
import { testContext, testConfig } from './helpers';
import { FixtureDataSource } from '../src/data/sources';

const ROOT = path.join(__dirname, '..', '..');
const GAS = path.resolve(process.env.APS_GAS_PROJECT || path.join(ROOT, 'gas-source'));
const have = fs.existsSync(path.join(GAS, 'test', 'coveragefixture.js'));
const J = (x: unknown) => JSON.parse(JSON.stringify(x));

// Top-level fields that come in later Phase 2 steps / Phase 3 (see CLASSES_NOT_YET and the header of classes.ts).
const SKIP_TOP = ['coverageAccess', 'coverageTrackingAccess', 'assignMonAccess', 'tempTeacherAccess', 'examinationAccess', 'gradingAccess', 'onCallTeacher', 'onCallTeacherCount', 'schoolLeave', 'name'];
const SKIP_COURSE = /^(whatsapp|meet|coverage|tcc|ttm|tempTeacher|teacherAvailability|joinLink|classMeetLink)/i;

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
  G.recordHeartbeat_ = () => {}; // Code.gs writes the viewer's heartbeat (live data — Phase 3; Azure writes nothing)
  G.getGoogleProfileName_ = () => null; // Admin Directory profile names: not on Azure (badge falls back like Code.gs)
  const list = (k: string) => J(G.getConfigList_(k, []));
  const cfg = testConfig({
    superadminEmails: list('SUPERADMIN_EMAILS'), adminEmails: J(G.ADMIN_EMAILS), headmasterEmails: J(G.HEADMASTER_EMAILS), bodEmails: list('VCFO_AMCHATS_BOD_EMAILS'),
    onCallCoordinatorEmails: list('ON_CALL_COORDINATOR_EMAILS'), rosterHiddenStaffAdditionalEmails: J(G.ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS), gradingTeamEmails: J(G.APS_GRADING_TEAM_EMAILS_),
  });
  const viewers: [string, string][] = [['admin@aps.org', 'admin'], ['hm@aps.org', 'headmaster'], ['bod@aps.org', 'vcfo_amchsts_bod'], [F.vpEmail, 'teacher'],
    ['kavitha_aps8130@avvaiyarpadasalai.org', 'teacher'], ['sa0_aps6650@avvaiyarpadasalai.org', 'student'], ['someone@namaps.org', 'authorized']];
  let compared = 0;
  for (const [email, role] of viewers) {
    const courses = J(G.readAllCoursesFromCache_());
    const ctx = testContext({ cfg }); ctx.data = new FixtureDataSource({ courses, userRoles: {}, accessOverrides: {} });
    const now = new Date();
    const gas = J(G.getDashboardData(F.tok(email, role)));
    const az = J(await buildClassesView(ctx, { email, role }, J(courses), now));
    for (const k of SKIP_TOP) { delete gas[k]; delete az[k]; }
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
});

test('getMyCountryPreference matches Code.gs (feature on with no USER_COUNTRY row, and feature off) — never asks for a country', { skip: !have && 'Apps Script fixture not found' }, () => {
  const F = loadFixture(); const G = F.G;
  const tok = F.tok('kavitha_aps8130@avvaiyarpadasalai.org', 'teacher');
  assert.deepEqual(countryPreference(testConfig({ countryFeatureOn: true })), J(G.getMyCountryPreference(tok)));
  G.PropertiesService.getScriptProperties().setProperty('APS_COUNTRY_FEATURE', 'off'); G.APS_REQ_MEMO_ = null;
  assert.deepEqual(countryPreference(testConfig({ countryFeatureOn: false })), J(G.getMyCountryPreference(tok)));
});

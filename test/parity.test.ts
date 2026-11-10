/**
 * Parity with the Apps Script code: loads Code.gs (gas-source/Code.gs) in the same Node mock
 * the Apps Script regression suite uses, and checks the Azure ports give identical answers.
 * Default: gas-source/ (the Apps Script snapshot in this project); APS_GAS_PROJECT=<folder> to use another copy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { testConfig, testCourses, D } from './helpers';
import { AC_CATALOG, AC_ROLES, acCellValue, acCellView, acEditableBy, acEffectiveForRole, apsTabAllowed } from '../src/auth/accessControl';
import { getViewerRoleForEmail, defaultRolePermissions, viewerCourses } from '../src/auth/roles';
import { extractAPSID, isApsEmailAllowed } from '../src/lib/email';
import type { AccessOverrides } from '../src/data/types';

// Apps Script reference copy kept in this project (gas-source/, refreshed with `npm run sync-gas`).
const ROOT = path.join(__dirname, '..', '..');
const GAS = path.resolve(process.env.APS_GAS_PROJECT || path.join(ROOT, 'gas-source'));
const have = fs.existsSync(path.join(GAS, 'Code.gs')) && fs.existsSync(path.join(GAS, 'test', 'gasmock.js'));
const cfg = testConfig();

function loadGas() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { makeContext } = require(path.join(GAS, 'test', 'gasmock.js'));
  const env = makeContext({ props: {
    SUPERADMIN_EMAILS: JSON.stringify(cfg.superadminEmails), ADMIN_EMAILS: JSON.stringify(cfg.adminEmails), HEADMASTER_EMAILS: JSON.stringify(cfg.headmasterEmails),
    VCFO_AMCHATS_BOD_EMAILS: JSON.stringify(cfg.bodEmails), ON_CALL_COORDINATOR_EMAILS: JSON.stringify(cfg.onCallCoordinatorEmails) } });
  const log = console.warn; console.warn = () => {};
  try { vm.runInContext(fs.readFileSync(path.join(GAS, 'Code.gs'), 'utf8'), env.ctx, { filename: 'Code.gs' }); } finally { console.warn = log; }
  return env.ctx as Record<string, any>;
}
function rnd(seed: number) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

test('Access Control catalog is identical to Code.gs AC_CATALOG_ (keys, labels, parents, cells)', { skip: !have && 'Apps Script project not found' }, () => {
  const G = loadGas();
  const gas = JSON.parse(JSON.stringify(G.AC_CATALOG_)).map((i: any) => ({ key: i.key, label: i.label, cells: i.cells, parent: i.parent || '' }));
  assert.deepEqual(AC_CATALOG.map((i) => ({ key: i.key, label: i.label, cells: i.cells, parent: i.parent || '' })), gas);
  assert.deepEqual(AC_ROLES, JSON.parse(JSON.stringify(G.AC_ROLES_)));
});

test('Access Control decisions match Code.gs for 300 random switch sets × every role, tab and viewer', { skip: !have && 'Apps Script project not found' }, () => {
  const G = loadGas(); const r = rnd(42);
  const roles = AC_ROLES.concat(['none']);
  let checks = 0;
  for (let n = 0; n < 300; n++) {
    const ov: AccessOverrides = {};
    for (const role of AC_ROLES) for (const item of AC_CATALOG) { const x = r(); if (x < 0.15) (ov[role] = ov[role] || {})[item.key] = false; else if (x < 0.25) (ov[role] = ov[role] || {})[item.key] = true; }
    G.acOverrides_ = () => ov; G.APS_REQ_MEMO_ = null;
    for (const role of roles) {
      assert.deepEqual(acEffectiveForRole(role, ov), JSON.parse(JSON.stringify(G.acEffectiveForRole_(role))), 'effective ' + role);
      for (const item of AC_CATALOG) {
        assert.equal(apsTabAllowed(role, item.key, ov), G.apsTabAllowed_(role, item.key), `allowed ${role} ${item.key}`); checks++;
        if (role === 'none') continue;
        const gi = G.acItem_(item.key);
        assert.equal(acCellValue(item, role, ov), G.acCellValue_(gi, role, ov), `value ${role} ${item.key}`);
        assert.equal(acCellView(item, role), G.acCellView_(gi, role));
        for (const viewer of ['admin', 'superadmin']) assert.equal(acEditableBy(item, role, viewer), G.acEditableBy_(gi, role, viewer));
      }
    }
  }
  assert.ok(checks > 90000);
});

test('roles, visible classes, APSID, allowed domains and default permissions match Code.gs', { skip: !have && 'Apps Script project not found' }, () => {
  const G = loadGas();
  const configured = { ['config_aps1' + D]: 'headmaster', ['cfgstudent' + D]: 'student', ['admin' + D]: 'teacher' };
  G.readConfiguredUserRoles_ = () => configured;
  const emails = ['super' + D, 'SUPER' + D, 'bod@amchats.org', 'admin' + D, 'admin2@amchats.org', 'hm' + D, 'tcs_coord_aps8112' + D, 'config_aps1' + D, 'cfgstudent' + D,
    'priya_aps8001' + D, 'tts_hidden_aps9001' + D, 'vp_aps7001' + D, 'notmember_aps7002' + D, 'pt_aps7003' + D, 'meena_aps5555' + D, 'arun_aps5556' + D,
    'someone@namaps.org', 'x@apsamerica.org', 'kid@gmail.com', '', '  Meena_APS5555' + D + '  '];
  for (const e of emails) {
    const courses = testCourses();
    const mine = getViewerRoleForEmail(cfg, e, courses, configured);
    const gas = JSON.parse(JSON.stringify(G.getViewerRoleForEmail_(e, testCourses())));
    assert.deepEqual(mine, gas, 'role for "' + e + '"');
    const gctx = JSON.parse(JSON.stringify(G.getViewerContext_(testCourses(), gas).courses || [])).map((c: any) => c.id);
    assert.deepEqual(viewerCourses(mine, courses).map((c) => c.id), gctx, 'visible classes for "' + e + '"');
  }
  for (const s of ['meena_aps5555' + D, 'a_APS12ab@x.org', 'noaps@x.org', '', 'x_aps@x.org', 'a_aps99@b@c'])
    assert.equal(extractAPSID(s), G.extractAPSID_(s), 'APSID ' + s);
  for (const s of ['a@avvaiyarpadasalai.org', 'A@AMCHATS.ORG', 'a@namaps.org.evil.com', 'a@gmail.com', 'teacher@', ' a@apsamerica.org '])
    assert.equal(isApsEmailAllowed(s, cfg.allowedDomains), G.isApsEmailAllowed_(s), 'domain ' + s);
  assert.deepEqual(defaultRolePermissions(), JSON.parse(JSON.stringify(G.defaultDashboardRolePermissions_())));
});

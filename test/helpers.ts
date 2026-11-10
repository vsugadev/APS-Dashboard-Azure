/** Shared test fixture: a small school with every role, plus a fake Google sign-in. */
import { loadConfig, type AppConfig } from '../src/config';
import { FixtureDataSource } from '../src/data/sources';
import { MemorySessionStore } from '../src/auth/sessions';
import { StateNonces, type GoogleAuth, type VerifiedClaims } from '../src/auth/google';
import type { AppContext } from '../src/app/context';
import type { AccessOverrides, Course } from '../src/data/types';

export const D = '@avvaiyarpadasalai.org';
export function testConfig(over: Partial<AppConfig> = {}): AppConfig {
  const cfg = loadConfig({ NODE_ENV: 'test', APS_DATA_MODE: 'fixture', PUBLIC_BASE_URL: 'http://localhost:8080', GOOGLE_OAUTH_CLIENT_ID: 'test-client.apps.googleusercontent.com',
    SUPERADMIN_EMAILS: JSON.stringify(['super' + D]), ADMIN_EMAILS: JSON.stringify(['admin' + D, 'Admin2@amchats.org']),
    HEADMASTER_EMAILS: JSON.stringify(['hm' + D]), VCFO_AMCHATS_BOD_EMAILS: JSON.stringify(['bod@amchats.org']),
    ON_CALL_COORDINATOR_EMAILS: JSON.stringify(['tcs_coord_aps8112' + D]) } as NodeJS.ProcessEnv);
  return { ...cfg, ...over };
}
export function testCourses(): Course[] {
  return [
    { id: '101', name: 'NILAI 3 - EF | FRI 6:30 - 8:00 PM EST | AY26-27', teachers: [{ email: 'priya_aps8001' + D, name: 'Priya' }],
      students: [{ email: 'meena_aps5555' + D, name: 'Meena' }, { email: 'arun_aps5556' + D, name: 'Arun' }],
      rosterTeacherEmails: ['priya_aps8001' + D, 'tts_hidden_aps9001' + D],
      classSupport: [{ email: 'vp_aps7001' + D, member: true, roles: ['VP'], sources: ['ROOM'] }, { email: 'notmember_aps7002' + D, member: false, roles: ['HM'], sources: ['ROOM'] }] },
    { id: '102', name: 'NILAI 1 - EA | SAT 10:00 - 11:30 AM EST | AY26-27', teachers: [{ email: 'kavi_aps8002' + D, name: 'Kavi' }],
      students: [{ email: 'Arun_aps5556' + D, name: 'Arun' }, { email: 'devi_aps5557' + D, name: 'Devi' }],
      classSupport: [{ email: 'pt_aps7003' + D, member: false, roles: ['PRIMARY_TEACHER'], sources: ['DESCRIPTION'] }] },
  ];
}
export function fakeGoogle(claimsByCode: Record<string, VerifiedClaims>): GoogleAuth {
  return {
    authUrl: (state: string) => 'https://accounts.google.com/o/oauth2/v2/auth?state=' + state + '&x=<&>',
    exchangeAndVerify: async (code: string) => { const c = claimsByCode[code]; if (!c) throw new Error('INVALID_TOKEN: code not recognised'); return c; },
  };
}
export function testContext(opts: { cfg?: AppConfig; userRoles?: Record<string, string>; access?: AccessOverrides; claims?: Record<string, VerifiedClaims>; now?: () => number } = {}): AppContext {
  const cfg = opts.cfg || testConfig();
  return {
    cfg,
    data: new FixtureDataSource({ courses: testCourses(), userRoles: opts.userRoles || {}, accessOverrides: opts.access || {} }),
    sessions: new MemorySessionStore(cfg.sessionTtlSeconds, opts.now),
    google: fakeGoogle(opts.claims || {}),
    nonces: new StateNonces(600_000, opts.now),
  };
}

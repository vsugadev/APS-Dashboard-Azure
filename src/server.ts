/**
 * APS Dashboard on Azure — Phase 1 web server (Azure App Service, Node 22 LTS).
 *   GET  /            the dashboard page; also the Google sign-in callback (?code=&state=), as Code.gs doGet
 *   POST /api/run/:fn  the google.script.run replacement (see src/api/registry.ts)
 *   GET  /healthz     liveness for App Service health checks (no data, no secrets)
 *   GET  /dev/login   LOCAL DEVELOPMENT ONLY (DEV_LOGIN=1, refused in Azure)
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import * as path from 'path';
import { loadConfig, configProblems, configWarnings, type AppConfig } from './config';
import { FixtureDataSource, SheetsDataSource } from './data/sources';
import { bridgeUsable, bridgeCall, secretFingerprint, AppsScriptLiveSource, EmptyLiveSource, FixtureLiveSource } from './live/liveSource';
import { BridgeHeartbeat, NoopHeartbeat } from './live/heartbeat';
import { registerWrites } from './api/endpoints/writes';
import { mountReverseBridge } from './api/bridge';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const APP_VERSION: string = (() => { try { return String(require(path.join(__dirname, '..', '..', 'package.json')).version || ''); } catch { return ''; } })();
import { DurableSessionStore, MssqlSessionDb } from './auth/sqlSessions';
import { ChatOwner, readChatSheet } from './db/chatOwner';
import { BridgeClassLive } from './live/classLive';
import { MssqlLiveMirror } from './db/liveMirror';
import { JobScheduler, MssqlJobStore, bridgeJobRunner, parseJobList } from './jobs/scheduler';
import { MssqlChatStore } from './db/chatStore';
import { DbBackedDataSource } from './db/dbData';
import { MssqlSheetStore } from './db/sheetStore';
import { startDatabase } from './db/start';
import type { FetchLike } from './live/liveSource';
import { serviceAccountTokenProvider } from './google/serviceAccount';
import { MemorySessionStore } from './auth/sessions';
import { googleAuth, StateNonces } from './auth/google';
import { Registry } from './api/registry';
import { registerCore } from './api/endpoints/core';
import { registerClasses } from './api/endpoints/classes';
import { registerReads2 } from './api/endpoints/reads';
import { DashboardPage } from './web/render';
import { signInWithClaims, type AppContext, type SignInResult } from './app/context';
import { describeGoogleError } from './google/diagnose';

export function buildRegistry(fetchImpl?: FetchLike): Registry {
  const reg = new Registry();
  registerCore(reg);
  registerClasses(reg);
  registerReads2(reg);
  registerWrites(reg, fetchImpl); // write phase step 1: Admin settings saves → Apps Script (signed bridge)
  return reg;
}

/** The bridge is used only with the real /exec address and a long enough secret (config warnings say why not). */
export { bridgeUsable };

export function createContext(cfg: AppConfig): AppContext {
  const sheetsData = cfg.dataMode === 'fixture' ? FixtureDataSource.fromFile(cfg.fixturePath) : new SheetsDataSource(cfg, serviceAccountTokenProvider(cfg));
  // Database pilot (v0.11.0): Special Classes read from Azure SQL when SQL_SERVER + SQL_DATABASE are set (else Google Sheets only).
  const data = cfg.dataMode === 'sheets' && cfg.sqlServer && cfg.sqlDatabase ? new DbBackedDataSource(sheetsData, new MssqlSheetStore(cfg.sqlServer, cfg.sqlDatabase)) : sheetsData;
  const live = cfg.dataMode === 'fixture' ? FixtureLiveSource.fromFile(cfg.fixturePath)
    : bridgeUsable(cfg) ? (data instanceof DbBackedDataSource
      ? new AppsScriptLiveSource(cfg.appsScriptBridgeUrl, cfg.appsScriptBridgeSecret).useMirror(new MssqlLiveMirror(() => (data.storeRef() as unknown as MssqlSheetStore).connectPool())) // v0.17.0 settings copy
      : new AppsScriptLiveSource(cfg.appsScriptBridgeUrl, cfg.appsScriptBridgeSecret)) : new EmptyLiveSource();
  const heartbeat = cfg.dataMode !== 'fixture' && cfg.heartbeatEnabled && bridgeUsable(cfg) ? new BridgeHeartbeat(cfg.appsScriptBridgeUrl, cfg.appsScriptBridgeSecret) : new NoopHeartbeat();
  // Phase 3 step 1 (v0.15.0): sign-ins kept in Azure SQL (same connection pool) so restarts / deploys / a second instance keep them.
  const sessions = data instanceof DbBackedDataSource && cfg.sessionStore === 'sql'
    ? new DurableSessionStore(new MssqlSessionDb(() => (data.storeRef() as unknown as MssqlSheetStore).connectPool()), cfg.sessionTtlSeconds)
    : new MemorySessionStore(cfg.sessionTtlSeconds);
  // Phase 3 step 4 (v0.16.0): chat owned by Azure SQL; a post made here tells Apps Script (forward bridge "chatChanged").
  const chat = data instanceof DbBackedDataSource && cfg.chatOwner === 'azure'
    ? new ChatOwner(new MssqlChatStore(() => (data.storeRef() as unknown as MssqlSheetStore).connectPool()),
        async () => { if (bridgeUsable(cfg)) await bridgeCall(cfg.appsScriptBridgeUrl, cfg.appsScriptBridgeSecret, { action: 'chatChanged', v: 1 }, fetch as unknown as FetchLike, Date.now, 15_000).catch((e: unknown) => console.warn('[Chat] Apps Script not told about the new message: ' + String((e as Error).message).slice(0, 40))); })
    : undefined;
  const classLive = cfg.dataMode !== 'fixture' && cfg.classLiveEnabled && bridgeUsable(cfg) ? new BridgeClassLive(cfg.appsScriptBridgeUrl, cfg.appsScriptBridgeSecret) : undefined;
  return { cfg, data, live, heartbeat, sessions, chat, classLive, google: googleAuth(cfg), nonces: new StateNonces(600_000, Date.now, StateNonces.keyFromSecret(cfg.oauthClientSecret)) };
}

/** Start-up self-check of the Apps Script live-data bridge (Phase 3): key counts only, never names' values. */
export async function checkLiveBridge(ctx: AppContext, log: (m: string) => void = console.log): Promise<boolean> {
  if (ctx.cfg.dataMode === 'fixture') return true;
  if (!bridgeUsable(ctx.cfg)) { log('[Live] Apps Script bridge not configured — live data (online now, last login, class status, on-call banner) is empty.'); return false; }
  const s = await ctx.live.get(); const st = ctx.live.status();
  if (st.ok) log(`[Live] Apps Script bridge OK — ${Object.keys(s.script).length} Script + ${Object.keys(s.user).length} User Properties (allow-listed).`);
  else log('[Live] Apps Script bridge FAILED: ' + (st.error || 'unknown') + ' — see the guide, section Logs.');
  // v0.8.3: BAD_SIGNATURE = the two copies of the secret differ — log length + fingerprint (never the value) to compare
  // with Apps Script ONE_TIME_azureBridgeFingerprint.
  if (!st.ok && /BAD_SIGNATURE/.test(st.error || '')) log(`[Live] Azure's secret: ${ctx.cfg.appsScriptBridgeSecret.length} characters, fingerprint ${secretFingerprint(ctx.cfg.appsScriptBridgeSecret)} — run ONE_TIME_azureBridgeFingerprint in Apps Script: both must be the same, else put the Apps Script value into Key Vault (New Version).`);
  return st.ok;
}

/** Start-up self-check: one read of the class list, so the log says at once whether Google access works and, if not,
 *  what to fix — instead of waiting for someone's sign-in to fail. Never blocks start-up; never logs data or keys. */
export async function checkGoogleAccess(ctx: AppContext, log: (m: string) => void = console.log): Promise<boolean> {
  if (ctx.cfg.dataMode !== 'sheets') return true;
  try {
    const courses = await ctx.data.readCourses();
    log(`[Google] Sheet check OK — ${courses.length} classes readable.`);
    return true;
  } catch (e) {
    log('[Google] Sheet check FAILED: ' + describeGoogleError(e));
    return false;
  }
}

export function createApp(ctx: AppContext, page: DashboardPage | null, reg: Registry = buildRegistry()): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // App Service front end
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://namaps.org https://*.namaps.org");
    if (ctx.cfg.env === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // v0.17.1: the running version, so a wrong deployment is seen at once (https://<app>/healthz)
  app.get('/healthz', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ ok: true, phase: 1, version: APP_VERSION }); });
  app.use(express.static(path.join(__dirname, '..', '..', 'public'), { index: false, maxAge: '10m' }));

  const TICKET_RE = /^APS-\d{8}-\d{4,6}$/;
  const sendPage = (res: Response, result: SignInResult | null, ticket: string | null = null) => {
    if (!page) { res.status(503).send('Dashboard page not deployed.'); return; }
    let authUrl = '#';
    try { authUrl = ctx.google.authUrl(ctx.nonces.issue(ticket)); } catch (e) { authUrl = '#'; }
    const boot = result && result.ok ? { token: result.token, user: result.user, error: null }
      : { token: null, user: null, error: result ? { code: result.code, ...(result.message ? { message: result.message } : {}) } : null };
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(page.render({ authUrl, ...boot, ticket }));
  };

  app.get('/', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const oauthError = typeof req.query.error === 'string' ? req.query.error : '';
    const tk = String(req.query.ticket || '').trim().toUpperCase();
    let ticket: string | null = TICKET_RE.test(tk) ? tk : null;
    if (code) {
      let result: SignInResult;
      try {
        const st = ctx.nonces.take(typeof req.query.state === 'string' ? req.query.state : '');
        if (st.ticket) ticket = st.ticket;
        if (!st.ok) {
          result = { ok: false, code: 'invalid_token', message: 'This sign-in link has expired. Please sign in again.' };
        } else {
          result = await signInWithClaims(ctx, await ctx.google.exchangeAndVerify(code));
        }
      } catch (e) {
        result = { ok: false, code: 'invalid_token', message: String((e as Error).message || e).slice(0, 300) };
      }
      sendPage(res, result, ticket);
      return;
    }
    sendPage(res, oauthError ? { ok: false, code: 'cancelled' } : null, ticket);
  });

  if (ctx.cfg.devLogin && !ctx.cfg.runningInAzure && ctx.cfg.env !== 'production') {
    app.get('/dev/login', async (req, res) => {
      const email = String(req.query.email || '');
      const result = await signInWithClaims(ctx, { email, email_verified: true });
      sendPage(res, result);
    });
  }

  mountReverseBridge(app, ctx); // v0.13.0: Apps Script → Azure (Special Classes owned by Azure SQL)

  app.post('/api/run/:fn', express.json({ limit: '25mb' }) /* v0.14.0: uploads go through */, async (req, res) => {
    const out = await reg.call(ctx, req.params.fn, req.body && req.body.args);
    res.setHeader('Cache-Control', 'no-store');
    res.json(out);
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Server] ' + String(err && err.message).slice(0, 200));
    res.status(400).json({ err: 'Bad request.' });
  });
  return app;
}

if (require.main === module) {
  const cfg = loadConfig();
  const problems = configProblems(cfg);
  if (problems.length) {
    console.error('[Config] cannot start:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  for (const w of configWarnings(cfg)) console.warn('[Config] ' + w);
  const page = new DashboardPage(path.resolve(cfg.dashboardHtmlPath));
  const ctx = createContext(cfg);
  const app = createApp(ctx, page);
  app.listen(cfg.port, () => {
    console.log(`[Server] APS Dashboard (Azure) v${APP_VERSION} listening on ${cfg.port} — data: ${cfg.dataMode}`);
    void checkGoogleAccess(ctx);
    void checkLiveBridge(ctx);
    if (ctx.sessions instanceof DurableSessionStore) { ctx.sessions.start(); console.log('[Sessions] sign-ins are kept in Azure SQL (dbo.app_session) — restarts and deploys no longer sign people out.'); }
    if (ctx.chat) void ctx.chat.start(() => readChatSheet(ctx));
    { // Phase 4 step 1 (v0.17.0): repeating jobs on Azure's timetable (AZURE_JOBS + Apps Script APS_JOBS_ON_AZURE)
      const jobs = parseJobList(cfg.jobsOnAzure);
      if (jobs.unknown.length) console.warn('[Jobs] AZURE_JOBS names not known (ignored): ' + jobs.unknown.join(', '));
      if (jobs.on.length && ctx.data instanceof DbBackedDataSource && bridgeUsable(cfg)) {
        const db = ctx.data;
        new JobScheduler(jobs.on, new MssqlJobStore(() => (db.storeRef() as unknown as MssqlSheetStore).connectPool()), bridgeJobRunner(cfg.appsScriptBridgeUrl, cfg.appsScriptBridgeSecret)).start();
      } else if (jobs.on.length) console.warn('[Jobs] AZURE_JOBS is set but Azure SQL or the Apps Script bridge is not — no job runs on Azure (Apps Script keeps running them).');
    }
    if (ctx.data instanceof DbBackedDataSource) void startDatabase(ctx, ctx.data.storeRef(), ctx.data, cfg.dbSyncMinutes * 60_000);
  });
}

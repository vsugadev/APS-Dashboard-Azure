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
import { startDatabase, startCopies } from './db/start';
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
import { createMailSender, checkMail } from './mail/gmailSender';
import { registerParallelRun, MssqlFeedbackStore, readinessLines, type ReadinessFacts } from './parallel/parallelRun';
import { ShadowComparer, MssqlShadowStore, bridgeAppsScriptRunner } from './parallel/shadow';
import { TimedJobScheduler, bridgeScheduleSource, parseTimedList } from './jobs/timed';
import { MailJobRunner, MssqlMailJobStore, liveMailJobDeps, parseMailJobList } from './mail/mailJobs';

export function buildRegistry(fetchImpl?: FetchLike): Registry {
  const reg = new Registry();
  registerCore(reg);
  registerClasses(reg);
  registerReads2(reg);
  registerWrites(reg, fetchImpl); // write phase step 1: Admin settings saves → Apps Script (signed bridge)
  registerParallelRun(reg); // v0.21.0: azureReportDifference (parallel run)
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
  const feedback = data instanceof DbBackedDataSource ? new MssqlFeedbackStore(() => (data.storeRef() as unknown as MssqlSheetStore).connectPool()) : undefined;
  return { cfg, data, live, heartbeat, sessions, chat, classLive, feedback, google: googleAuth(cfg), nonces: new StateNonces(600_000, Date.now, StateNonces.keyFromSecret(cfg.oauthClientSecret)) };
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
    const parallel = ctx.cfg.parallelRunOn ? { officialUrl: ctx.cfg.parallelRunOfficialUrl || ctx.cfg.appsScriptBridgeUrl } : null;
    res.type('html').send(page.render({ authUrl, ...boot, ticket, parallel }));
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
        // v0.23.5: a genuine sign-in link that only went stale (the page stayed open > 10 min, a reload, the back button, a
        // restart during a deploy) restarts the Google sign-in ONCE with a fresh link instead of showing a warning. Google
        // usually completes it at once (already signed in). A second failure, or a link that is not ours, shows the message.
        if (!st.ok && (st.reason === 'expired' || st.reason === 'used') && !st.again) {
          let to = '#';
          try { to = ctx.google.authUrl(ctx.nonces.issue(ticket, true)); } catch { to = '#'; }
          if (to !== '#') { res.setHeader('Cache-Control', 'no-store'); res.redirect(302, to); return; }
        }
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

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    // v0.23.1: the browser closed / left the page while sending (body parser 'request.aborted') — nothing failed on the server
    if ((err as { type?: string }).type === 'request.aborted' || /request aborted/i.test(String(err && err.message))) {
      console.log('[Server] the browser stopped sending a request before it finished (page closed or reloaded) — ' + String(req.path).slice(0, 60) + '; nothing was run.');
      if (!res.headersSent) res.status(400).end();
      return;
    }
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
  const reg = buildRegistry();
  if (cfg.shadowSample > 0 && bridgeUsable(cfg) && ctx.data instanceof DbBackedDataSource) { // v0.22.0: shadow comparison (parallel run)
    const db = ctx.data; let ignore: RegExp | null = null;
    try { ignore = cfg.shadowIgnore ? new RegExp(cfg.shadowIgnore) : null; } catch { console.warn('[Shadow] SHADOW_IGNORE is not a valid pattern — nothing ignored.'); }
    const sc = new ShadowComparer(reg, bridgeAppsScriptRunner(cfg.appsScriptBridgeUrl, cfg.appsScriptBridgeSecret), new MssqlShadowStore(() => (db.storeRef() as unknown as MssqlSheetStore).connectPool()),
      { samplePct: cfg.shadowSample, dailyCap: cfg.shadowDailyCap, ignore });
    reg.observer = sc.observe; sc.start();
  } else if (cfg.shadowSample > 0) console.warn('[Shadow] SHADOW_SAMPLE is set but the Apps Script bridge or Azure SQL is not — no comparison.');
  const app = createApp(ctx, page, reg);
  app.listen(cfg.port, () => {
    console.log(`[Server] APS Dashboard (Azure) v${APP_VERSION} listening on ${cfg.port} — data: ${cfg.dataMode}`);
    const facts: ReadinessFacts = { googleOk: null, bridgeOk: false, sessionsSql: ctx.sessions instanceof DurableSessionStore, chatReady: null, classLiveError: null,
      jobs: [], timedJobs: [], mailOk: null, mailJobs: [], mailJobsPreview: !!cfg.mailJobsPreviewTo, dbCopy: cfg.dbCopyBooks, dbReads: cfg.dbReadBooks, feedbackReady: !!ctx.feedback };
    void checkGoogleAccess(ctx).then((ok) => { facts.googleOk = ok; });
    void checkLiveBridge(ctx).then((ok) => { facts.bridgeOk = ok; });
    { // v0.21.0: parallel-run readiness — one block ~90 s after start, then daily
      const report = () => {
        facts.chatReady = ctx.chat ? ctx.chat.ready : null;
        facts.classLiveError = ctx.classLive ? ((ctx.classLive as unknown as { error?: string }).error || null) : 'not configured';
        console.log('[ParallelRun] readiness (v' + APP_VERSION + '):\n  ' + readinessLines(cfg, facts).join('\n  '));
      };
      setTimeout(report, 90_000).unref?.(); setInterval(report, 86_400_000).unref?.();
    }
    { // Phase 4 step 3 (v0.19.0): email From donotreply@ sent by Azure (AZURE_MAIL=on) — sign-in check + optional test email
      const mail = createMailSender(cfg);
      if (mail) void checkMail(mail, cfg, APP_VERSION).then((ok) => { facts.mailOk = ok; });
      // Phase 4 step 4 (v0.20.0): email jobs built and sent by Azure (AZURE_MAIL_JOBS; preview with MAIL_JOBS_PREVIEW_TO)
      const mj = parseMailJobList(cfg.mailJobs);
      if (mj.unknown.length) console.warn('[MailJobs] AZURE_MAIL_JOBS names not known (ignored): ' + mj.unknown.join(', '));
      const previewOk = !cfg.mailJobsPreviewTo || cfg.allowedDomains.includes(cfg.mailJobsPreviewTo.split('@')[1] || '');
      if (mj.on.length && mail && previewOk && ctx.data instanceof DbBackedDataSource && bridgeUsable(cfg)) {
        const db = ctx.data;
        facts.mailJobs = mj.on;
        new MailJobRunner(mj.on, new MssqlMailJobStore(() => (db.storeRef() as unknown as MssqlSheetStore).connectPool()), mail, liveMailJobDeps(ctx), cfg.mailJobsPreviewTo).start();
      } else if (mj.on.length) console.warn('[MailJobs] AZURE_MAIL_JOBS is set but ' + (!mail ? 'AZURE_MAIL is not on' : !previewOk ? 'MAIL_JOBS_PREVIEW_TO is not an APS address' : 'Azure SQL or the Apps Script bridge is not set') + ' — Apps Script keeps sending.');
    }
    if (ctx.sessions instanceof DurableSessionStore) { ctx.sessions.start(); console.log('[Sessions] sign-ins are kept in Azure SQL (dbo.app_session) — restarts and deploys no longer sign people out.'); }
    if (ctx.chat) void ctx.chat.start(() => readChatSheet(ctx));
    { // Phase 4 step 1 (v0.17.0): repeating jobs on Azure's timetable (AZURE_JOBS + Apps Script APS_JOBS_ON_AZURE)
      const jobs = parseJobList(cfg.jobsOnAzure);
      if (jobs.unknown.length) console.warn('[Jobs] AZURE_JOBS names not known (ignored): ' + jobs.unknown.join(', '));
      if (jobs.on.length && ctx.data instanceof DbBackedDataSource && bridgeUsable(cfg)) {
        const db = ctx.data;
        facts.jobs = jobs.on;
        new JobScheduler(jobs.on, new MssqlJobStore(() => (db.storeRef() as unknown as MssqlSheetStore).connectPool()), bridgeJobRunner(cfg.appsScriptBridgeUrl, cfg.appsScriptBridgeSecret)).start();
      } else if (jobs.on.length) console.warn('[Jobs] AZURE_JOBS is set but Azure SQL or the Apps Script bridge is not — no job runs on Azure (Apps Script keeps running them).');
      // Phase 4 step 2 (v0.23.0): fixed-time daily / weekly jobs (AZURE_TIMED_JOBS + Apps Script APS_JOBS_ON_AZURE; times from Apps Script)
      const timed = parseTimedList(cfg.timedJobsOnAzure);
      if (timed.unknown.length) console.warn('[Jobs] AZURE_TIMED_JOBS names not known (ignored): ' + timed.unknown.join(', '));
      if (timed.on.length && ctx.data instanceof DbBackedDataSource && bridgeUsable(cfg)) {
        const db = ctx.data;
        facts.timedJobs = timed.on;
        new TimedJobScheduler(timed.on, new MssqlJobStore(() => (db.storeRef() as unknown as MssqlSheetStore).connectPool()), bridgeJobRunner(cfg.appsScriptBridgeUrl, cfg.appsScriptBridgeSecret),
          bridgeScheduleSource(cfg.appsScriptBridgeUrl, cfg.appsScriptBridgeSecret)).start();
      } else if (timed.on.length) console.warn('[Jobs] AZURE_TIMED_JOBS is set but Azure SQL or the Apps Script bridge is not — Apps Script keeps running them.');
    }
    if (ctx.data instanceof DbBackedDataSource) { const db = ctx.data; void startDatabase(ctx, db.storeRef(), db, cfg.dbSyncMinutes * 60_000).finally(() => startCopies(ctx, db.storeRef(), db, cfg.dbSyncMinutes * 60_000)); }
  });
}

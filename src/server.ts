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
import { serviceAccountTokenProvider } from './google/serviceAccount';
import { MemorySessionStore } from './auth/sessions';
import { googleAuth, StateNonces } from './auth/google';
import { Registry } from './api/registry';
import { registerCore } from './api/endpoints/core';
import { DashboardPage } from './web/render';
import { signInWithClaims, type AppContext, type SignInResult } from './app/context';
import { describeGoogleError } from './google/diagnose';

export function buildRegistry(): Registry {
  const reg = new Registry();
  registerCore(reg);
  return reg;
}

export function createContext(cfg: AppConfig): AppContext {
  const data = cfg.dataMode === 'fixture' ? FixtureDataSource.fromFile(cfg.fixturePath) : new SheetsDataSource(cfg, serviceAccountTokenProvider(cfg));
  return { cfg, data, sessions: new MemorySessionStore(cfg.sessionTtlSeconds), google: googleAuth(cfg), nonces: new StateNonces(600_000, Date.now, StateNonces.keyFromSecret(cfg.oauthClientSecret)) };
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

  app.get('/healthz', (_req, res) => { res.json({ ok: true, phase: 1 }); });
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

  app.post('/api/run/:fn', express.json({ limit: '1mb' }), async (req, res) => {
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
    console.log(`[Server] APS Dashboard (Azure, Phase 1) listening on ${cfg.port} — data: ${cfg.dataMode}`);
    void checkGoogleAccess(ctx);
  });
}

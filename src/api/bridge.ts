/**
 * Reverse bridge (v0.13.0, database stage 3) — Apps Script → Azure. POST /api/bridge
 *
 * When Azure SQL owns Special Classes (SC_OWNER=azure), Apps Script's Special Classes screens read and save through
 * here (AzureBridge.gs r134: scAzureOwnedRecords_ / scAzureOwnedSave_). Same shared secret as the other direction
 * (APPS_SCRIPT_BRIDGE_SECRET = Script Property AZURE_BRIDGE_SECRET), but a different signed text, so a request in one
 * direction can never be replayed in the other:
 *
 *   body { gas: 1, p, ts, nonce, sig }   sig = hex HMAC-SHA256(secret, "gas." + ts + "." + nonce + "." + p)
 *   ts within 5 minutes; every nonce used once; p ≤ 100 000 characters.
 *
 * Actions (p = JSON):
 *   { action: "scGrid", v: 1 }                               → the owned programs sheet (dates as {"$d": iso})
 *   { action: "chatList", v: 1, email }                      → v0.16.0 (CHAT_OWNER=azure): the chat, as getChatMessages
 *   { action: "call", v: 1, fn, args, email }                → saveSpecialClass / setSpecialClassActive, postChatMessage ONLY, for that
 *                                                             e-mail. AZURE decides the role itself (same rules as
 *                                                             sign-in) — the role is never taken from the request.
 * Answers { ok: true, result } or { ok: false, code } (+ `error`: the Code.gs message for a refused save). Never the
 * secret, never stack traces.
 */
import crypto from 'crypto';
import express, { type Express } from 'express';
import type { AppContext } from '../app/context';
import { normalizeEmail, isApsEmailAllowed } from '../lib/email';
import { roleFromLists, getViewerRoleForEmail } from '../auth/roles';
import { encodeGrid } from '../db/sheetStore';
import { SC_OWNED_FNS, scOwnedByAzure, runOwnedSave, ownedProgramsGrid } from '../db/scOwner';
import { ownedChatList, ownedChatPost } from '../db/chatOwner';

export const REVERSE_WINDOW_MS = 5 * 60_000;
export const REVERSE_MAX_P = 100_000;

export function signReverse(secret: string, ts: string, nonce: string, p: string): string {
  return crypto.createHmac('sha256', secret).update('gas.' + ts + '.' + nonce + '.' + p).digest('hex');
}

export class NonceBook {
  private seen = new Map<string, number>();
  constructor(private windowMs = REVERSE_WINDOW_MS, private now: () => number = Date.now) {}
  /** true the first time; false on any repeat inside the window. */
  use(n: string): boolean {
    const t = this.now();
    if (this.seen.size > 5000) for (const [k, at] of this.seen) if (t - at > this.windowMs * 2) this.seen.delete(k);
    if (this.seen.has(n)) return false;
    this.seen.set(n, t);
    return true;
  }
}

type Answer = { status: number; body: Record<string, unknown> };
const fail = (code: string, status = 400, error?: string): Answer => ({ status, body: error ? { ok: false, code, error } : { ok: false, code } });

export async function handleReverse(ctx: AppContext, nonces: NonceBook, body: any, now: () => number = Date.now): Promise<Answer> {
  const secret = ctx.cfg.appsScriptBridgeSecret;
  if (!secret || secret.length < 32) return fail('NOT_CONFIGURED', 503);
  if (!body || body.gas !== 1 || typeof body.p !== 'string' || typeof body.ts !== 'string' || typeof body.nonce !== 'string' || typeof body.sig !== 'string') return fail('BAD_REQUEST');
  if (body.p.length > REVERSE_MAX_P || !/^[0-9a-f]{64}$/.test(body.sig) || !/^[A-Za-z0-9-]{8,64}$/.test(body.nonce)) return fail('BAD_REQUEST');
  const want = Buffer.from(signReverse(secret, body.ts, body.nonce, body.p), 'hex'), got = Buffer.from(body.sig, 'hex');
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return fail('BAD_SIGNATURE', 401);
  const ts = Number(body.ts);
  if (!Number.isFinite(ts) || Math.abs(now() - ts) > REVERSE_WINDOW_MS) return fail('EXPIRED', 401);
  if (!nonces.use(body.nonce)) return fail('REPLAY', 401);
  let p: any;
  try { p = JSON.parse(body.p); } catch { return fail('BAD_REQUEST'); }
  if (!p || p.v !== 1) return fail('BAD_REQUEST');
  const chatOwned = ctx.cfg.chatOwner === 'azure' && !!ctx.chat;
  const isChat = p.action === 'chatList' || (p.action === 'call' && p.fn === 'postChatMessage');
  // Apps Script thinks Azure owns this module; Azure does not — refuse, never guess
  if (isChat ? ctx.cfg.chatOwner !== 'azure' : !scOwnedByAzure(ctx)) return fail('NOT_OWNER', 409);
  if (isChat && !chatOwned) return fail('NOT_READY', 503);

  if (p.action === 'chatList' || (p.action === 'call' && p.fn === 'postChatMessage')) {
    const email = normalizeEmail(p.email);
    if (!isApsEmailAllowed(email, ctx.cfg.allowedDomains)) return fail('BAD_REQUEST');
    const role = await resolveRole(ctx, email);
    if (role === null) return fail('NOT_READY', 503);
    try {
      if (p.action === 'chatList') return { status: 200, body: { ok: true, result: { value: role === 'none' ? [] : await ownedChatList(ctx, { email, role }) } } };
      if (!Array.isArray(p.args)) return fail('BAD_REQUEST');
      return { status: 200, body: { ok: true, result: { value: await ownedChatPost(ctx, { email, role }, p.args[0]) } } };
    } catch (e) { return { status: 200, body: { ok: true, result: { error: String((e as Error).message || 'Not posted.').slice(0, 300) } } }; }
  }

  if (p.action === 'scGrid') {
    try { const g = await ownedProgramsGrid(ctx); return { status: 200, body: { ok: true, result: { grid: encodeGrid(g.values), timeZone: g.timeZone, version: g.version } } }; }
    catch { return fail('NOT_READY', 503); }
  }
  if (p.action === 'call') {
    const fn = String(p.fn || ''), args = Array.isArray(p.args) ? p.args : null;
    if (SC_OWNED_FNS.indexOf(fn) < 0 || !args) return fail('BAD_REQUEST');
    const email = normalizeEmail(p.email);
    if (!isApsEmailAllowed(email, ctx.cfg.allowedDomains)) return fail('BAD_REQUEST');
    const role = await resolveRole(ctx, email);
    if (role === null) return fail('NOT_READY', 503);
    if (!role || role === 'none') return { status: 200, body: { ok: true, result: { error: 'You do not have access to manage Special Classes.' } } };
    const token = await ctx.sessions.create({ email, role });
    try {
      const value = await runOwnedSave(ctx, { email, role }, token, fn, args);
      return { status: 200, body: { ok: true, result: { value: JSON.parse(JSON.stringify(value === undefined ? null : value)) } } };
    } catch (e) {
      return { status: 200, body: { ok: true, result: { error: String((e as Error).message || 'Not saved.').slice(0, 500) } } }; // the Code.gs message, shown to the Admin
    } finally { await ctx.sessions.remove(token); }
  }
  return fail('BAD_REQUEST');
}

/** The role for an e-mail — decided by AZURE (same rules as its sign-in), never taken from the request. null = data unavailable. */
async function resolveRole(ctx: AppContext, email: string): Promise<string | null> {
  const listed = roleFromLists(ctx.cfg, email);
  if (listed) return listed;
  try { const [courses, configured] = await Promise.all([ctx.data.readCourses(), ctx.data.readConfiguredUserRoles()]); return getViewerRoleForEmail(ctx.cfg, email, courses, configured).role; }
  catch { return null; }
}

export function mountReverseBridge(app: Express, ctx: AppContext, nonces = new NonceBook()): void {
  app.post('/api/bridge', express.json({ limit: '256kb' }), async (req, res) => {
    let a: Answer;
    try { a = await handleReverse(ctx, nonces, req.body); }
    catch (e) { console.error('[Bridge] reverse call failed: ' + String((e as Error).message).slice(0, 120)); a = fail('ERROR', 500); }
    if (!a.body.ok) console.warn('[Bridge] reverse request refused: ' + a.body.code);
    res.setHeader('Cache-Control', 'no-store');
    res.status(a.status).json(a.body);
  });
}

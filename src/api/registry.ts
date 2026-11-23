/**
 * Endpoint registry — the Azure replacement for google.script.run. Every function the browser calls is registered
 * here under the SAME name as in Code.gs and receives the SAME arguments (the session token first, exactly as the
 * Dashboard's apsScriptRun wrapper sends it today). Each handler does its own server-side checks.
 *
 * Wire format (POST /api/run/<name>, body {"args":[...]}) → {"ok": value} or {"err": message} — the browser shim
 * turns {"err"} into an Error with that message, so failure handlers and SESSION_EXPIRED handling work unchanged.
 * A name not moved to Azure yet answers {"err":"NOT_ON_AZURE_YET: <name>"}.
 */
import { REQUEST, newRequest, type RequestInfo } from '../app/requestContext';
import type { AppContext } from '../app/context';
import { requireSession } from '../app/context';
import type { ResponseCache } from './responseCache';

export type Handler = (ctx: AppContext, args: unknown[]) => Promise<unknown> | unknown;
export const NOT_ON_AZURE = 'NOT_ON_AZURE_YET: ';
const NAME_RE = /^[A-Za-z][A-Za-z0-9]{0,79}$/; // public Code.gs names: no underscore suffix (private helpers are never callable)

/** v0.22.0: told about every answered call (shadow comparison in the parallel run). Must never throw or block. */
export type CallObserver = (ctx: AppContext, name: string, args: unknown[], out: { ok: unknown } | { err: string }, ms: number, cached?: boolean, info?: RequestInfo) => void;

export class Registry {
  private handlers = new Map<string, Handler>();
  /** v0.24.0: several observers (shadow comparison, performance); setting `observer` adds one (as before). */
  private observers: CallObserver[] = [];
  set observer(o: CallObserver | null) { if (o) this.observers.push(o); }
  addObserver(o: CallObserver): void { this.observers.push(o); }
  /** v0.24.0 (performance #2): answers of these functions are reused for a short time (same session + arguments). */
  cache: ResponseCache | null = null;
  cacheable = new Set<string>();
  register(name: string, h: Handler): this {
    if (!NAME_RE.test(name)) throw new Error('Invalid endpoint name: ' + name);
    if (this.handlers.has(name)) throw new Error('Duplicate endpoint: ' + name);
    this.handlers.set(name, h);
    return this;
  }
  has(name: string): boolean { return this.handlers.has(name); }
  names(): string[] { return Array.from(this.handlers.keys()).sort(); }
  async call(ctx: AppContext, name: string, args: unknown): Promise<{ ok: unknown } | { err: string }> {
    if (!NAME_RE.test(String(name))) return { err: 'Bad request.' };
    const h = this.handlers.get(name);
    if (!h) return { err: NOT_ON_AZURE + name };
    if (!Array.isArray(args) || args.length > 20) return { err: 'Bad request.' };
    const t0 = Date.now();
    let out: { ok: unknown } | { err: string };
    const rq = newRequest();
    const ck = this.cache && this.cacheable.has(name) ? this.cache.key(name, args) : null;
    if (ck) {
      const hit = this.cache!.get(ck);
      if (hit) {
        try { await requireSession(ctx, args[0]); } // the session (and the test group) is checked on EVERY answer, cached or not
        catch (e) { return { err: safeErrorMessage(String((e as Error)?.message || e)) }; }
        for (const o of this.observers) { try { o(ctx, name, args, hit, Date.now() - t0, true); } catch { /* never affects the answer */ } }
        return hit;
      }
    }
    try {
      const v = await REQUEST.run(rq, () => h(ctx, args)); // v0.24.2: requireSession fills in who it is for
      out = { ok: v === undefined ? null : v };
      if (ck) this.cache!.set(ck, out as { ok: unknown });
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      out = { err: safeErrorMessage(msg) };
    }
    for (const o of this.observers) { try { o(ctx, name, args, out, Date.now() - t0, false, rq); } catch { /* never affects the answer */ } }
    return out;
  }
}

/** Never send stack traces, tokens or keys to the browser (Code.gs saSafeErr_ rules). */
export function safeErrorMessage(msg: string): string {
  return msg
    .replace(/(Bearer\s+|access_token[=:]\s*|refresh_token[=:]\s*|client_secret[=:]\s*)[^\s,)]+/gi, '$1[hidden]')
    .replace(/ya29\.[\w.-]+/g, '[hidden]')
    .replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '[hidden]')
    .split('\n')[0]
    .slice(0, 500);
}

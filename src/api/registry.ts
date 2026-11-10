/**
 * Endpoint registry — the Azure replacement for google.script.run. Every function the browser calls is registered
 * here under the SAME name as in Code.gs and receives the SAME arguments (the session token first, exactly as the
 * Dashboard's apsScriptRun wrapper sends it today). Each handler does its own server-side checks.
 *
 * Wire format (POST /api/run/<name>, body {"args":[...]}) → {"ok": value} or {"err": message} — the browser shim
 * turns {"err"} into an Error with that message, so failure handlers and SESSION_EXPIRED handling work unchanged.
 * A name not moved to Azure yet answers {"err":"NOT_ON_AZURE_YET: <name>"}.
 */
import type { AppContext } from '../app/context';

export type Handler = (ctx: AppContext, args: unknown[]) => Promise<unknown> | unknown;
export const NOT_ON_AZURE = 'NOT_ON_AZURE_YET: ';
const NAME_RE = /^[A-Za-z][A-Za-z0-9]{0,79}$/; // public Code.gs names: no underscore suffix (private helpers are never callable)

export class Registry {
  private handlers = new Map<string, Handler>();
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
    try {
      const v = await h(ctx, args);
      return { ok: v === undefined ? null : v };
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      return { err: safeErrorMessage(msg) };
    }
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

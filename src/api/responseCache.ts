/**
 * v0.24.0 (performance #2) — reuse recent answers of the read screens Azure answers itself.
 * Key = function + session token + arguments, so an answer is only ever given back to the same signed-in session with the
 * same input (never across people). Kept `ttlMs` (PERF_CACHE_SECONDS, default 30 s); ANY save through the bridge clears it all
 * (writes.ts), so a change is seen at once by the person who made it and everyone else. On every hit the caller re-checks the
 * session (and the test group) first. Bounded (oldest dropped). In memory only — nothing is stored anywhere.
 */
export class ResponseCache {
  private map = new Map<string, { at: number; out: { ok: unknown } }>();
  hits = 0; misses = 0;
  constructor(public ttlMs = 30_000, private max = 600, private now: () => number = Date.now) {}
  key(name: string, args: unknown[]): string | null {
    if (typeof args[0] !== 'string' || !args[0]) return null;
    let rest = '';
    try { rest = JSON.stringify(args.slice(1)); } catch { return null; }
    return rest.length > 4000 ? null : name + '\u0000' + args[0] + '\u0000' + rest;
  }
  get(k: string): { ok: unknown } | null {
    const e = this.map.get(k);
    if (!e) { this.misses++; return null; }
    if (this.now() - e.at > this.ttlMs) { this.map.delete(k); this.misses++; return null; }
    this.hits++;
    return e.out;
  }
  set(k: string, out: { ok: unknown }): void {
    if (this.ttlMs <= 0) return;
    if (this.map.size >= this.max) { const first = this.map.keys().next().value; if (first !== undefined) this.map.delete(first); }
    this.map.set(k, { at: this.now(), out });
  }
  clear(): void { this.map.clear(); }
  size(): number { return this.map.size; }
}
/** One per process; writes.ts clears it after every save. */
export const responseCache = new ResponseCache();

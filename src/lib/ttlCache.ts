/** Tiny in-memory TTL cache with in-flight de-duplication (one load per key at a time).
 *  Phase 1 runs a single App Service instance; Phase 3 replaces this with Azure Cache for Redis. */
export class TtlCache {
  private store = new Map<string, { at: number; value: unknown }>();
  private inflight = new Map<string, Promise<unknown>>();
  constructor(private now: () => number = Date.now) {}
  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key);
    if (hit && this.now() - hit.at < ttlMs) return hit.value as T;
    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;
    const p = load().then((v) => { this.store.set(key, { at: this.now(), value: v }); return v; })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }
  delete(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
}

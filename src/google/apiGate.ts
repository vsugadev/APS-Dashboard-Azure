/**
 * v0.23.3 — Google Sheets API budget. The Sheets API allows about 60 read requests per minute per user (the account Azure
 * impersonates) and per project; a burst above that answers 429 RESOURCE_EXHAUSTED for the rest of the minute.
 * Every Sheets call from Azure goes through ONE gate per process:
 *  - at most `perMinute` calls in any 60 s (default 45 — room for retries), at most `concurrent` at a time (default 4);
 *    callers wait their turn instead of failing;
 *  - a 429 pauses ALL calls for `cooldownMs` (default 30 s) and the call is tried once more after it.
 */
export class ApiGate {
  private times: number[] = [];
  private active = 0;
  private queue: (() => void)[] = [];
  private pausedUntil = 0;
  calls = 0; waits = 0; throttled = 0;
  constructor(private perMinute = 45, private concurrent = 4, private cooldownMs = 30_000,
    private now: () => number = Date.now, private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private log: (m: string) => void = console.warn) {}

  private async slot(): Promise<void> {
    for (;;) {
      const t = this.now();
      this.times = this.times.filter((x) => t - x < 60_000);
      if (t < this.pausedUntil) { this.waits++; await this.sleep(this.pausedUntil - t); continue; }
      if (this.times.length >= this.perMinute) { this.waits++; await this.sleep(60_000 - (t - this.times[0]) + 5); continue; }
      if (this.active >= this.concurrent) { this.waits++; await new Promise<void>((r) => this.queue.push(r)); continue; }
      this.times.push(t); this.active++; this.calls++;
      return;
    }
  }
  private release(): void { this.active--; const n = this.queue.shift(); if (n) n(); }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      await this.slot();
      try { return await fn(); }
      catch (e) {
        if (attempt === 0 && /GOOGLE_API_429/.test(String((e as Error).message))) {
          this.throttled++;
          this.pausedUntil = Math.max(this.pausedUntil, this.now() + this.cooldownMs);
          this.log('[Google] Sheets API rate limit reached — all Sheets reads wait ' + Math.round(this.cooldownMs / 1000) + ' s, then continue (' + this.calls + ' calls so far).');
          continue;
        }
        throw e;
      } finally { this.release(); }
    }
  }
}

/**
 * v0.23.3 — Google Sheets API budget. The Sheets API allows about 60 read requests per minute per user (the account Azure
 * impersonates) and per project; a burst above that answers 429 RESOURCE_EXHAUSTED for the rest of the minute.
 * Every Sheets call from Azure goes through ONE gate per process:
 *  - at most `perMinute` calls in any 60 s (default 45 — room for retries), at most `concurrent` at a time (default 4);
 *    callers wait their turn instead of failing;
 *  - a 429 pauses ALL calls for `cooldownMs` (default 30 s) and the call is tried once more after it.
 *  - v0.24.1 FOREGROUND FIRST: calls made for a person (screens) always go before BACKGROUND calls (spreadsheet copies,
 *    reconciliation, warm-up — marked with inBackground()). Background work uses at most `bgConcurrent` (2) of the slots and
 *    leaves `userReserve` (15) calls of every minute free for people; a waiting person is served before any waiting job.
 */
import { AsyncLocalStorage } from 'async_hooks';

const LANE = new AsyncLocalStorage<'bg'>();
/** Runs `fn` as background work: every Sheets call made inside it (however deep) waits behind calls made for people. */
export function inBackground<T>(fn: () => Promise<T>): Promise<T> { return LANE.run('bg', fn); }
export function isBackground(): boolean { return LANE.getStore() === 'bg'; }

export class ApiGate {
  private times: number[] = [];
  private active = 0;
  private bgActive = 0;
  private queue: (() => void)[] = [];
  private bgQueue: (() => void)[] = [];
  private pausedUntil = 0;
  calls = 0; waits = 0; throttled = 0; bgCalls = 0; userWaitMs = 0;
  constructor(private perMinute = 45, private concurrent = 4, private cooldownMs = 30_000,
    private now: () => number = Date.now, private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private log: (m: string) => void = console.warn, private bgConcurrent = 2, private userReserve = 15) {}

  private async slot(bg: boolean): Promise<void> {
    const t0 = this.now();
    for (;;) {
      const t = this.now();
      this.times = this.times.filter((x) => t - x < 60_000);
      if (t < this.pausedUntil) { this.waits++; await this.sleep(this.pausedUntil - t); continue; }
      const limit = bg ? Math.max(1, this.perMinute - this.userReserve) : this.perMinute;
      if (this.times.length >= limit) { this.waits++; await this.sleep(60_000 - (t - this.times[this.times.length - limit]) + 5); continue; }
      if (bg ? (this.active >= this.concurrent || this.bgActive >= this.bgConcurrent || this.queue.length > 0) : this.active >= this.concurrent) {
        this.waits++; await new Promise<void>((r) => (bg ? this.bgQueue : this.queue).push(r)); continue;
      }
      this.times.push(t); this.active++; this.calls++;
      if (bg) { this.bgActive++; this.bgCalls++; } else this.userWaitMs += t - t0;
      return;
    }
  }
  /** A person waiting goes first; a job only when no person is waiting. */
  private release(bg: boolean): void {
    this.active--; if (bg) this.bgActive--;
    const n = this.queue.shift() || this.bgQueue.shift();
    if (n) n();
  }
  /** One short line for the hourly [Perf] summary; counters restart. */
  takeStats(): string {
    const fg = this.calls - this.bgCalls;
    const s = 'Google Sheets calls: ' + fg + ' for people (waited ' + (this.userWaitMs / 1000).toFixed(1) + ' s in total), ' + this.bgCalls + ' background' + (this.throttled ? ', ' + this.throttled + ' rate-limit pauses' : '');
    this.calls = 0; this.bgCalls = 0; this.userWaitMs = 0; this.waits = 0; this.throttled = 0;
    return s;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const bg = isBackground();
    for (let attempt = 0; ; attempt++) {
      await this.slot(bg);
      try { return await fn(); }
      catch (e) {
        if (attempt === 0 && /GOOGLE_API_429/.test(String((e as Error).message))) {
          this.throttled++;
          this.pausedUntil = Math.max(this.pausedUntil, this.now() + this.cooldownMs);
          this.log('[Google] Sheets API rate limit reached — all Sheets reads wait ' + Math.round(this.cooldownMs / 1000) + ' s, then continue (' + this.calls + ' calls so far).');
          continue;
        }
        throw e;
      } finally { this.release(bg); }
    }
  }
}

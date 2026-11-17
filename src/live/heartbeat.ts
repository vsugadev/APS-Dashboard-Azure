/**
 * Phase 3 step 2 (v0.9.0) — heartbeats from the Azure dashboard.
 *
 * A person using the Azure dashboard must show "online now" and get a Last Login (DB) exactly as if they used the
 * Apps Script dashboard. Code.gs records that on every getDashboardData (page load + 5-minute refresh) and on
 * recordDashboardSignOff (tab hidden / closed); Azure does the same, but cannot write Apps Script's Script Properties
 * itself, so it sends the e-mails of its OWN signed-in sessions through the signed bridge (AzureBridge.gs r131,
 * action "heartbeat") — batched every FLUSH_MS, each person at most once per MIN_GAP_MS (sign-off always goes).
 *
 *  - Only the session e-mail (never a browser-supplied one) is sent; Apps Script accepts APS-domain e-mails only.
 *  - A failed batch is kept and sent again next time (at most MAX_PENDING people kept).
 *  - Apps Script older than r131 answers BAD_REQUEST ("Unknown action") → heartbeats pause 10 minutes, logged once.
 *  - App setting AZURE_HEARTBEAT=off turns this off (live data is still read).
 */
import { bridgeCall, type FetchLike } from './liveSource';

export interface HeartbeatSink { note(email: string, force?: boolean): void; flush(): Promise<void>; status(): { sent: number; failed: number; error: string } }

export const FLUSH_MS = 15_000;
export const MIN_GAP_MS = 60_000;
export const MAX_BATCH = 200;
export const MAX_PENDING = 2_000;
const PAUSE_MS = 10 * 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Bridge not configured / switched off: nothing is sent. */
export class NoopHeartbeat implements HeartbeatSink {
  note(): void { /* nothing */ }
  async flush(): Promise<void> { /* nothing */ }
  status() { return { sent: 0, failed: 0, error: 'off' }; }
}

export class BridgeHeartbeat implements HeartbeatSink {
  private pending = new Set<string>();
  private lastSent = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private inflight: Promise<void> | null = null;
  private pausedUntil = 0;
  private lastLogged = 0;
  private sent = 0; private failed = 0; private error = '';
  constructor(private url: string, private secret: string, private fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private now: () => number = Date.now, private autoFlush = true, private log: (m: string) => void = console.warn) {}

  status() { return { sent: this.sent, failed: this.failed, error: this.error }; }

  note(email: string, force = false): void {
    const e = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(e) || e.length > 254) return;
    const t = this.now();
    if (!force && t - (this.lastSent.get(e) || 0) < MIN_GAP_MS) return;
    if (this.pending.size >= MAX_PENDING && !this.pending.has(e)) return;
    this.pending.add(e);
    if (this.autoFlush && !this.timer) { this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, FLUSH_MS); this.timer.unref?.(); }
  }

  async flush(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = this.flushOnce().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  private async flushOnce(): Promise<void> {
    const t = this.now();
    if (!this.pending.size || t < this.pausedUntil) return;
    const batch = Array.from(this.pending).slice(0, MAX_BATCH);
    try {
      const r = (await bridgeCall(this.url, this.secret, { action: 'heartbeat', v: 1, emails: batch }, this.fetchImpl, this.now)) || {};
      if (r.busy) throw new Error('BUSY');
      for (const e of batch) { this.pending.delete(e); this.lastSent.set(e, t); }
      for (const [e, at] of this.lastSent) if (t - at > MIN_GAP_MS) this.lastSent.delete(e);
      this.sent += batch.length; this.error = '';
    } catch (err) {
      this.failed += batch.length;
      this.error = String((err as Error).message || err).slice(0, 80);
      if (/^BAD_REQUEST/.test(this.error)) this.pausedUntil = t + PAUSE_MS;
      if (t - this.lastLogged > 60_000) {
        this.lastLogged = t;
        this.log('[Live] heartbeat not sent: ' + this.error + (/^BAD_REQUEST/.test(this.error) ? ' — deploy AzureBridge.gs r131 (heartbeat action) in Apps Script; paused 10 minutes' : ' — kept, sent again with the next batch'));
      }
    }
    if (this.pending.size && this.autoFlush && !this.timer) { this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, FLUSH_MS); this.timer.unref?.(); }
  }
}

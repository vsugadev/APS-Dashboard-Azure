/**
 * Phase 3 step 5 (v0.17.0) — live Google Meet class status on Azure.
 *
 * Code.gs works out each class's live status (Meet audit log + Meet REST + "Join" clicks) with Google APIs the Azure
 * service account is not approved for yet. Until it is, Azure asks Apps Script for the RESULT through the signed bridge
 * (AzureBridge.gs r137, action "classLive"): per class whose live status applies right now — { code, detail, inMeet }.
 * The copied Code.gs applyClassStatus_ then uses it exactly where Code.gs uses classMeetApplyLive_ (runtime.ts), so labels,
 * colours, "Teacher joined 6:31 PM · 12 students joined" and the green "in Meet" dots match the Apps Script dashboard.
 *
 *  - One request per 30 s for the whole app (not per person); while a refresh runs, the last answer is used.
 *  - Bridge down → the last answer for up to 5 minutes, then none (Code.gs's own schedule-based status, as before).
 *  - App setting AZURE_CLASS_LIVE=off → never asked (schedule-based status only).
 */
import { bridgeCall, type FetchLike } from './liveSource';

export interface ClassLiveEntry { code: string; detail: Record<string, unknown>; inMeet: { e: string; since: string }[] }
export interface ClassLive { at: number; byCourse: Record<string, ClassLiveEntry> }
export interface ClassLiveSource { peek(): Promise<ClassLive | null> }

export const CLASS_LIVE_TTL_MS = 30_000, CLASS_LIVE_STALE_MAX_MS = 5 * 60_000, CLASS_LIVE_WAIT_MS = 4000;

export class BridgeClassLive implements ClassLiveSource {
  private last: ClassLive | null = null;
  private inflight: Promise<void> | null = null;
  private lastLog = 0;
  error = '';
  constructor(private url: string, private secret: string, private fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private now: () => number = Date.now, private log: (m: string) => void = console.warn) {}

  private refresh(): Promise<void> {
    if (!this.inflight) {
      this.inflight = bridgeCall(this.url, this.secret, { action: 'classLive', v: 1 }, this.fetchImpl, this.now, 20_000)
        .then((r: any) => { this.last = clean(r, this.now()); this.error = ''; })
        .catch((e) => {
          this.error = String((e as Error).message || e).slice(0, 60);
          const t = this.now();
          if (t - this.lastLog > 300_000) { this.lastLog = t; this.log('[Live] live Google Meet status not available from Apps Script (' + this.error + ') — ' + (this.error === 'BAD_REQUEST' ? 'deploy AzureBridge.gs r137' : 'class cards use the schedule-based status') + '.'); }
        })
        .finally(() => { this.inflight = null; });
    }
    return this.inflight;
  }

  /** The current answer; refreshes in the background when older than 30 s (waits up to 4 s only when there is none). */
  async peek(): Promise<ClassLive | null> {
    const t = this.now();
    const fresh = this.last && t - this.last.at < CLASS_LIVE_TTL_MS;
    if (!fresh) {
      const p = this.refresh();
      if (!this.last) await Promise.race([p, new Promise((r) => setTimeout(r, CLASS_LIVE_WAIT_MS))]);
    }
    if (this.last && this.now() - this.last.at < CLASS_LIVE_STALE_MAX_MS) return this.last;
    return null;
  }
}

/** Only well-formed entries; e-mails lower-cased; nothing else from the answer is used. */
function clean(r: any, at: number): ClassLive {
  const out: ClassLive = { at, byCourse: {} };
  const by = r && typeof r.byCourse === 'object' && r.byCourse ? r.byCourse : {};
  for (const id of Object.keys(by).slice(0, 2000)) {
    const x = by[id];
    if (!x || typeof x.code !== 'string' || !/^[a-z_]{3,20}$/.test(x.code)) continue;
    const inMeet = Array.isArray(x.inMeet) ? x.inMeet.filter((p: any) => p && typeof p.e === 'string').slice(0, 300).map((p: any) => ({ e: String(p.e).trim().toLowerCase(), since: typeof p.since === 'string' ? p.since : '' })) : [];
    out.byCourse[String(id)] = { code: x.code, detail: x.detail && typeof x.detail === 'object' ? x.detail : {}, inMeet };
  }
  return out;
}

/** Runtime replacement for Code.gs classMeetApplyLive_ (same contract: mutates the people "in Meet", returns { code, detail } or null). */
export function applyClassLive(live: ClassLive, c: any): { code: string; detail: Record<string, unknown> } | null {
  const x = live.byCourse[String(c && c.id)];
  if (!x) return null;
  const seen: Record<string, string> = {};
  for (const p of x.inMeet) seen[p.e] = p.since;
  for (const p of ([] as any[]).concat(c.teachers || [], c.students || [])) {
    const e = String((p && p.email) || '').trim().toLowerCase();
    if (e && e in seen) { p.inMeet = true; p.online = true; p.meetSince = p.meetSince || seen[e] || ''; }
  }
  return { code: x.code, detail: JSON.parse(JSON.stringify(x.detail)) };
}

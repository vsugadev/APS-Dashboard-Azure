/**
 * Phase 3 — Apps Script's live data on Azure.
 *
 * While Apps Script is production it keeps the live data (online now, last login, onboarded, manual class status,
 * on-call teachers, Hide/Show, sync status, admin settings saved from the dashboard …) in its Script / User Properties.
 * Azure cannot read those directly, so the live Apps Script answers ONE signed, read-only request (AzureBridge.gs,
 * routed by doPost) with an allow-listed snapshot. Azure keeps it for LIVE_TTL_MS, shares one fetch between
 * concurrent requests, and filters it again with the same allow-list (src/live/allowlist.ts) — defence in depth.
 *
 * Signature: HMAC-SHA256(APPS_SCRIPT_BRIDGE_SECRET, ts + '.' + nonce + '.' + p), as the Parent Portal bridge.
 * The secret lives in Key Vault (Azure) and Script Property AZURE_BRIDGE_SECRET (Apps Script); never logged.
 */
import crypto from 'crypto';
import fs from 'fs';
import { filterLive } from './allowlist';
import type { AppConfig } from '../config';

/** The bridge is used only with the real /exec address and a long enough secret (config warnings say why not). */
export function bridgeUsable(cfg: AppConfig): boolean {
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(cfg.appsScriptBridgeUrl) && cfg.appsScriptBridgeSecret.length >= 32;
}

export interface LiveProps { script: Record<string, string>; user: Record<string, string> }
export interface LiveSnapshot extends LiveProps { at: number; ok: boolean }
export interface LiveSource { get(): Promise<LiveProps>; status(): { ok: boolean; at: number; error: string }; /** write phase: next get() fetches again */ invalidate?(): void }

export const LIVE_TTL_MS = 20_000;            // presence is "online" for minutes; 20 s keeps it as fresh as a page refresh
export const LIVE_STALE_MAX_MS = 5 * 60_000;  // after a failed refresh, the last good snapshot is used up to 5 minutes
const EMPTY: LiveProps = { script: {}, user: {} };

/** No bridge configured (local development, tests without live data): Phase 2 behaviour — nothing stored. */
export class EmptyLiveSource implements LiveSource {
  async get(): Promise<LiveProps> { return { script: {}, user: {} }; }
  status() { return { ok: false, at: 0, error: 'not configured' }; }
}

/** Tests / local development: a fixed snapshot, filtered by the same allow-list as the real one. */
export class FixtureLiveSource implements LiveSource {
  constructor(private snap: LiveProps) {}
  static fromFile(path: string): FixtureLiveSource {
    try { const j = JSON.parse(fs.readFileSync(path, 'utf8')); return new FixtureLiveSource(j && j.live ? j.live : EMPTY); }
    catch { return new FixtureLiveSource(EMPTY); }
  }
  async get(): Promise<LiveProps> { const f = filterLive(this.snap); return { script: { ...f.script }, user: { ...f.user } }; }
  status() { return { ok: true, at: Date.now(), error: '' }; }
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; redirect: 'follow'; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export class AppsScriptLiveSource implements LiveSource {
  private last: LiveSnapshot | null = null;
  private inflight: Promise<LiveSnapshot> | null = null;
  private lastError = '';
  private lastLogged = 0;
  constructor(private url: string, private secret: string, private fetchImpl: FetchLike = fetch as unknown as FetchLike, private now: () => number = Date.now) {}

  private stale = false;
  status() { return { ok: !!this.last && this.last.ok, at: this.last ? this.last.at : 0, error: this.lastError }; }
  /** v0.10.0: a save went through to Apps Script — the next read fetches a fresh snapshot (the old one stays as fallback). */
  invalidate(): void { this.stale = true; }

  async get(): Promise<LiveProps> {
    const t = this.now();
    if (this.last && !this.stale && t - this.last.at < LIVE_TTL_MS) return copy(this.last);
    if (!this.inflight) this.inflight = this.fetchOnce().finally(() => { this.inflight = null; });
    try { this.last = await this.inflight; this.lastError = ''; this.stale = false; return copy(this.last); }
    catch (e) {
      this.lastError = String((e as Error).message || e).slice(0, 120);
      if (t - this.lastLogged > 60_000) { this.lastLogged = t; console.warn('[Live] Apps Script bridge failed: ' + this.lastError + (this.last && t - this.last.at < LIVE_STALE_MAX_MS ? ' — using the last snapshot' : ' — live data empty')); }
      if (this.last && t - this.last.at < LIVE_STALE_MAX_MS) return copy(this.last);
      return { script: {}, user: {} };
    }
  }

  /** One signed request. Errors carry a short code only — never the secret, the body or Google's page. */
  private async fetchOnce(): Promise<LiveSnapshot> {
    const r = (await bridgeCall(this.url, this.secret, { action: 'liveSnapshot', v: 1 }, this.fetchImpl, this.now)) || {};
    const f = filterLive({ script: strMap(r.script), user: strMap(r.user) });
    return { ...f, at: this.now(), ok: true };
  }
}

/**
 * One signed bridge request (shared by the snapshot and the r131 heartbeat): HMAC-SHA256(secret, ts.nonce.p).
 * Returns the bridge's `result`; throws Error(<SHORT_CODE>) — never the secret, the body or Google's page.
 */
export async function bridgeCall(url: string, secret: string, payload: Record<string, unknown>, fetchImpl: FetchLike, now: () => number = Date.now, timeoutMs = 0): Promise<any> {
  const p = JSON.stringify(payload);
  const ts = String(now()), nonce = crypto.randomUUID();
  const sig = crypto.createHmac('sha256', secret).update(ts + '.' + nonce + '.' + p).digest('hex');
  let res: Awaited<ReturnType<FetchLike>>;
  try { res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ azure: 1, p, ts, nonce, sig }), redirect: 'follow', ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}) }); }
  catch (e) { throw new Error(/abort|timeout/i.test(String((e as Error).name) + String((e as Error).message)) ? 'TIMEOUT' : 'NETWORK'); }
  if (!res.ok) throw new Error('HTTP_' + res.status);
  let j: any;
  try { j = JSON.parse(await res.text()); } catch { throw new Error('NOT_JSON (check APPS_SCRIPT_BRIDGE_URL is the /exec address)'); }
  if (!j || j.ok !== true) throw new Error(String((j && j.code) || 'BRIDGE_ERROR').replace(/[^A-Z_]/g, '').slice(0, 40) || 'BRIDGE_ERROR');
  return j.result;
}

function strMap(o: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (typeof v === 'string') out[k] = v;
  return out;
}
function copy(s: LiveProps): LiveProps { return { script: { ...s.script }, user: { ...s.user } }; }

/**
 * v0.8.3 — a fingerprint to compare the two copies of the bridge secret WITHOUT showing it: the first 8 hex characters
 * of SHA-256(secret). Apps Script prints the same value (AzureBridgeSetup.gs ONE_TIME_azureBridgeFingerprint). 32 bits
 * of a hash of a 244-bit random value — reveals nothing usable.
 */
export function secretFingerprint(secret: string): string {
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest('hex').slice(0, 8);
}

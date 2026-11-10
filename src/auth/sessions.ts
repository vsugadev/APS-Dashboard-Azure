/**
 * Server-side sessions — same model as Code.gs: a random token → { email, role, issuedAt } kept for
 * SESSION_TTL_SECONDS (6 h). The browser only ever holds the opaque token. Phase 1: in memory (one App Service
 * instance); Phase 3: Azure Cache for Redis behind the same interface, so sessions survive restarts and scale-out.
 */
import { randomUUID } from 'crypto';

export interface Session { email: string; role: string; issuedAt: number }
export interface SessionStore {
  create(s: Omit<Session, 'issuedAt'>): Promise<string>;
  get(token: string): Promise<Session | null>;
  remove(token: string): Promise<void>;
}
export const SESSION_EXPIRED_MSG = 'SESSION_EXPIRED: please sign in again.';

export class MemorySessionStore implements SessionStore {
  private map = new Map<string, { s: Session; exp: number }>();
  constructor(private ttlSeconds: number, private now: () => number = Date.now) {}
  async create(s: Omit<Session, 'issuedAt'>): Promise<string> {
    const token = randomUUID();
    this.map.set(token, { s: { ...s, issuedAt: this.now() }, exp: this.now() + this.ttlSeconds * 1000 });
    if (this.map.size % 200 === 0) this.sweep();
    return token;
  }
  async get(token: string): Promise<Session | null> {
    if (!token || typeof token !== 'string') return null;
    const v = this.map.get(token);
    if (!v) return null;
    if (v.exp <= this.now()) { this.map.delete(token); return null; }
    return { ...v.s };
  }
  async remove(token: string): Promise<void> { this.map.delete(token); }
  private sweep(): void { const t = this.now(); for (const [k, v] of this.map) if (v.exp <= t) this.map.delete(k); }
}

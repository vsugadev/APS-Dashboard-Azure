/**
 * v0.24.0 (performance #7) — measure every screen: per function calls, average, p95 and max time, errors, cache hits.
 * `[Perf]` hourly summary of the 10 slowest (by p95) + one line for any single request over 5 s (at most one per function per
 * 10 minutes). Names and times only — never arguments, e-mails or data.
 */
export class PerfMonitor {
  private by = new Map<string, { n: number; total: number; max: number; errs: number; hits: number; last: number[] }>();
  private slowLogged = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  /** v0.24.1: extra facts appended to the hourly line (Google Sheets calls for people vs background, waiting). */
  extra: (() => string) | null = null;
  constructor(private log: (m: string) => void = console.log, private now: () => number = Date.now, public slowMs = 5000) {}
  record(name: string, ms: number, ok: boolean, cached = false, detail: (() => string) | null = null): void {
    const s = this.by.get(name) || { n: 0, total: 0, max: 0, errs: 0, hits: 0, last: [] };
    s.n++; s.total += ms; s.max = Math.max(s.max, ms); if (!ok) s.errs++; if (cached) s.hits++;
    s.last.push(ms); if (s.last.length > 200) s.last.shift();
    this.by.set(name, s);
    if (ms >= this.slowMs && !cached) {
      const t = this.now();
      const prevAt = this.slowLogged.get(name);
      if (prevAt === undefined || t - prevAt > 600_000) { this.slowLogged.set(name, t); let d = ''; try { d = detail ? detail() : ''; } catch { d = ''; }
        this.log('[Perf] slow: ' + name + ' took ' + (ms / 1000).toFixed(1) + ' s' + (d ? ' (' + d + ')' : '')); }
    }
  }
  summary(top = 10): { name: string; calls: number; avgMs: number; p95Ms: number; maxMs: number; errors: number; cacheHits: number }[] {
    const rows = Array.from(this.by.entries()).map(([name, s]) => {
      const sorted = s.last.slice().sort((a, b) => a - b);
      return { name, calls: s.n, avgMs: Math.round(s.total / s.n), p95Ms: Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || 0), maxMs: Math.round(s.max), errors: s.errs, cacheHits: s.hits };
    });
    return rows.sort((a, b) => b.p95Ms - a.p95Ms).slice(0, top);
  }
  report(): void {
    const rows = this.summary();
    if (!rows.length) return;
    const total = Array.from(this.by.values()).reduce((a, s) => a + s.n, 0);
    this.log('[Perf] last hour: ' + total + ' calls; slowest (p95): ' + rows.map((r) => r.name + ' ' + r.calls + '× avg ' + r.avgMs + ' / p95 ' + r.p95Ms + ' / max ' + r.maxMs + ' ms' + (r.cacheHits ? ' (' + r.cacheHits + ' from cache)' : '') + (r.errors ? ' (' + r.errors + ' errors)' : '')).join('; ') + (this.extra ? ' | ' + this.extra() : ''));
    this.by.clear();
  }
  start(everyMs = 3_600_000): void { if (this.timer) return; this.timer = setInterval(() => this.report(), everyMs); this.timer.unref?.(); }
}

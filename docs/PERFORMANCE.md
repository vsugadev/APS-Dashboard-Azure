# Performance (v0.24.0): free changes first

APS is a non-profit. **Use free resources first, and never trade away performance.** This is rule B0 in the prompt file. Every
item below costs nothing.

| # | Change | Where | Status |
|---|---|---|---|
| 1 | **Learned preload:** each screen loads what it needed last time in its first pass. Every sheet, spreadsheet and batchGet range found during a run is loaded at once (it used to be one per re-run). The main, attendance and extra workbooks are read in parallel. | `src/gas/run.ts` (`key` per screen) | v0.24.0 |
| 2 | **Reused answers** for 30 s (`PERF_CACHE_SECONDS`, 0 = off) for the read screens Azure answers itself, keyed on the same session and the same arguments. Any save through the bridge, and any Special Classes save, clears them all. The session and test group are re-checked on every reuse. | `src/api/responseCache.ts`, `Registry.cache` | v0.24.0 |
| 3 | **Compression** (gzip / brotli): the page goes from 1.4 MB to about 250 KB, and JSON answers shrink 5–10×. | `compression` in `src/server.ts` | v0.24.0 |
| 4 | **Browser caching** of the fixed files (`public/*.js`, 1 hour + ETag). The dashboard page itself stays no-store because it carries the sign-in. | `express.static` | v0.24.0 |
| 5 | Portal: **Always On**, **HTTP/2**, **ARR affinity off** | App Service → Configuration → General settings | **you** |
| 6 | Move the busiest Apps Script pass-through screens onto Azure | chosen from #7 | next |
| 7 | **Measurement:** an hourly `[Perf]` summary (calls, average, p95 and max per screen, plus cache hits) and `[Perf] slow:` for any request over 5 s | `src/api/perf.ts` | v0.24.0 |
| 8 | Web app and database in the same Azure region | portal | **you** (check) |

**Not reused (#2), on purpose:**

- the class cards (`getDashboardData`), because they also record "online now"
- the realtime check
- chat
- anything Azure passes through to Apps Script
- every save

**Local measurement** (fixture data, one screen with a second data load): 2.5 ms → 0.3 ms per call with the learned preload,
and 0.03 ms when the answer is reused. On the live data each avoided re-run saves a full pass over the sheets, so the gain is
larger there. Read the `[Perf]` lines.

**Paid, only if `[Perf]` and the portal metrics show the need:**

- B1 → B2 (+$12/month) at go-live, if CPU stays above about 70% at class start
- Redis only with 2+ instances
- no bigger database (CPU is at 4%)

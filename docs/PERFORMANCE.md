# Performance (v0.24.0 – v0.24.2): free changes first

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
| 8 | Web app and database in the same Azure region | portal | **parked** (see below) |
| 9 | **People first at the Google gate:** the spreadsheet copies (every 5 min, plus one after every save), the reconciliation and the warm-up run as background work. They use at most 2 of the 4 slots and leave 15 calls of every minute for people, and a person waiting is always served before a job. | `src/google/apiGate.ts`, `src/data/background.ts` | v0.24.1 |
| 10 | **Remembered screen needs survive restarts:** saved in Azure SQL (`dbo.app_state`) at most every 5 minutes when changed, and restored at start. A stored entry can never open a spreadsheet the settings don't name. | `src/gas/learnedStore.ts`, `src/gas/run.ts` | v0.24.1 |
| 11 | **One warm-up after start** (background, about 20 s after start): courses, roles, Access Control and the sheets the screens use are read once. | `src/gas/learnedStore.ts` | v0.24.1 |
| 13 | **Other people's saves no longer send everyone to Google:** after a save, only the person who saved reads from Google, until a newer copy exists, so they see their change at once. Everyone else keeps reading the fast copy and sees the change at the next copy, usually within 1–2 minutes. `DB_READ_AFTER_SAVE=all` brings back the old behaviour. | `src/db/dbData.ts`, `src/app/requestContext.ts` | v0.24.2 |
| 14 | **Copies rewrite only changed tabs.** Before, every copy rewrote and re-read all ~90 tabs (about 60,000 rows) every 5 minutes and after every save. Now unchanged tabs only get their time renewed, with one small statement. | `src/db/sync.ts`, `src/db/sheetStore.ts` | v0.24.2 |
| 15 | **Slow lines say why:** `[Perf] slow: X took 12.3 s (waiting for data 0.4 s, 1 run(s), answer 850 KB)`. The hourly line also shows copy times. | `src/api/perf.ts`, `src/gas/run.ts` | v0.24.2 |
| 12 | **Read from the verified Azure copy** (`DB_READS=main,attendance`): milliseconds instead of seconds. After a save, reads go to Google until a fresh copy is made. | app setting | **your decision** |

**Global students (rule B0.5):** APS students are all over the world: US (EST, CST, PST), Canada, India and other countries.
Every change is judged by the delay the farthest students feel. That means fewer round trips per screen, small answers,
fixed files cached in the browser, and few server-side calls. A round trip from India to any US region is about 200–250 ms,
so each round trip saved helps them most.

**Region (#8), parked 2026-11-22:** the web app `aps-dashboard-ap` is in East US and the database
`aps-dashboard-sql-ap01/aps-dashboard` is in Central US. The web app stays where it is: no US region is closest for a global
student body, and moving it means a new address plus sign-in, bridge, deploy and Key Vault changes. Moving the database to
East US is parked until `[Perf]` shows the cross-region database delay matters. A portal Copy loses the free offer
(estimated $5–10 a month); the alternative is a new free-offer database plus a table-copy tool.

**Why v0.24.1 (live logs, 2026-11-23):** the first screens after a restart took 7–44 s, and even tiny calls such as
`getCourseNameSuffix` took 30 s. They were waiting in the same queue as the background spreadsheet copies, which run every
5 minutes and once more after every save. People are now served first (#9). Locally, a screen opened while a copy runs went
from 493 ms to 200 ms. The hourly `[Perf]` line now ends with `Google Sheets calls: N for people (waited X s in total), M
background`.

**Why v0.24.2 (live, 2026-11-23):** "reading from the database is slow" was really reading from Google. Any save by anyone
marked both copies out of date for everyone, so every screen went back to Google until a full re-copy finished, about 1–2
minutes. With live traffic, that was most of the time. Now one person's save affects only that person's reads (#13), and a
re-copy after a save writes only the tabs that changed (#14), so it finishes much sooner. Database writes also drop sharply,
which means less database CPU and lower cost.

**About #12 (your decision):** the copy is refreshed every `DB_SYNC_MINUTES` (default 5) and checked against the sheet. A
save made on Azure switches reads back to Google until a newer copy exists, so Azure users always see their own saves. A
change made on the Apps Script dashboard, or straight in the sheet, appears on Azure after the next copy, within about 5
minutes.

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

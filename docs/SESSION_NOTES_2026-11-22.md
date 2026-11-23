# APS Dashboard — session notes, 2026-11-22 (continue tomorrow)

## Where things stand

- **Azure v0.24.0** (performance release, rule B0) is built and saved in `APS-Dashboard-Azure`. All 135 tests and the 10 browser checks pass.
- **Prompt file:** rule **B0.5 Global students** has been added. Every change and analysis is judged by the delay the farthest students feel (US EST/CST/PST, Canada, India, other countries).
- **Region:** the web app `aps-dashboard-ap` is in East US and the database `aps-dashboard-sql-ap01/aps-dashboard` is in Central US.
  - The web app stays in East US.
  - Moving the database is **parked** until the `[Perf]` lines show the cross-region delay matters.
  - The portal Copy runbook was given in chat. A Copy loses the free offer (estimated $5–10/month); the alternative is a new free-offer database plus a table-copy tool.
- **Apps Script:** r142 is deployed. `LIVE_QUESTION_PAPER_SPREADSHEET_ID` is set.

## Your steps (if not done yet)

1. Push v0.24.0 together with the prompt and docs update:

   ```powershell
   cd C:\Users\AmChaTS\PycharmProjects\APS-Dashboard-Azure
   git checkout -- src/api/bridge.ts
   git add -A src test docs gas-source tools package.json package-lock.json aps_dashboard_Azure_prompt.txt .env.example
   git commit -m "v0.24.0: performance release + rule B0.5 global students; region move parked"
   git push origin main
   ```

   Then check that `/healthz` shows `0.24.0`.
2. In the portal (free): App Service → Configuration → General settings → **Always On = On**, **HTTP 2.0**, **ARR affinity = Off**.
3. Re-test **Exam Question Paper** and **Attendance** (week view + Override). If they work, run:
   `UPDATE dbo.parallel_feedback SET status='FIXED' WHERE id BETWEEN 1 AND 7;`
4. After an hour of normal use, send these log lines:
   - `[Perf] last hour:`
   - `[Shadow]` (the attendance row difference)
   - `[Reconcile]`
   - the 5 PM fixed-time `[Jobs]` lines

## Next development (after the `[Perf]` data arrives)

- **Free change #6:** move the slowest Apps Script pass-through screens onto Azure, with the fewest round trips (rule B0.5).
- Later:
  - fixed-time jobs for summaries/CTA, then MC/PTA
  - hand MULTIPLE_CLASSROOM_REPORT to Azure after the Mondays match
  - B1 → B2 decision at go-live, based on measurements
  - rotate the Zoho keys

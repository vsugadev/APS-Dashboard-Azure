# APS Dashboard on Azure — Guide

*Avvaiyar Padasalai · ஔவையார் பாடசாலை — the Azure version of the APS Classroom Dashboard.*
*Last updated: 2026-11-11 (v0.5.0, Phase 2 step 4). Keep this guide updated with every Azure change.*

The **live dashboard is still the Apps Script web app** — every teacher, student and admin keeps using it.
The Azure version is being built beside it, one screen at a time, and reads the **same Google Sheets**, so both always
show the same data. Nothing on Azure changes any data yet.

---

## 1. What is on Azure today

| Area | On Azure | Notes |
|---|---|---|
| Sign-in | ✅ | Google sign-in (APS domains only), 6-hour server sessions, roles exactly as Apps Script |
| Access Control | ✅ view | Tab switches applied server-side; editing stays in Apps Script |
| **Classes** tab — cards, rosters, filters | ✅ | Who sees which classes, Nilai / class-time filters, order, class schedule + automatic status |
| Classes — card extras from Sheets | ✅ | Teacher availability, WhatsApp link, Google Meet link, country flags, Temporary Class Coverage banner, Temp Teacher note, School Leave banner |
| Classes → **Teacher Availability** | ✅ view | Teacher's own week; Admin / HM / BOD weekly report. **Save** and **Send test email** are off on Azure |
| **Active Directory** → Directory Search | ✅ | Role-tiered on the server: staff / teachers see full details; students see names, classes and only their own details |
| Active Directory → Student Onboarding Status | ✅ | Built from the Classes data in the browser; "onboarded" = online now until Phase 3 |
| Online now, last login, live Meet status, manual class status, on-call banner | ⏳ Phase 3 | Live data kept in Apps Script properties — empty on Azure for now |
| Every other tab, every save / email / sync | ⏳ | Shows "not on Azure yet" — use the Apps Script dashboard |

---

## 2. How it works (short)

- **Same page:** Azure serves the same `Dashboard.html`. A small script (`aps-gas-shim.js`) sends each
  `google.script.run.<name>(…)` call to Azure (`POST /api/run/<name>`) — same names, same answers.
- **Same rules:** Code.gs code is **copied word for word** by two tools, never retyped:
  `gen-gas-helpers` (pure rules) and `gen-gas-scope` (Sheet readers and whole read-only screens).
- **Read-only runtime:** the copied code runs against a **snapshot** of the Google Sheets read through the Sheets API
  (whole sheet, cached 60 s). It cannot change any existing sheet or setting (`READ_ONLY`).
- **Proved by tests:** every screen is compared with Code.gs itself (run in the Apps Script test mock) for every role.

---

## 3. Settings

### Key Vault secrets (`kv-apsdashboardapu7zau2j`)

| Secret | Value |
|---|---|
| `google-oauth-client-id`, `google-oauth-client-secret` | Google sign-in client (type "Web application") |
| `google-service-account-json` | The **service-account key** file (`{"type": "service_account", …}`) — not the OAuth client file |
| `superadmin-emails`, `admin-emails`, `headmaster-emails`, `bod-emails`, `on-call-coordinator-emails` | JSON lists, copied from Script Properties (`tools\push-role-lists-to-keyvault.ps1`) |
| `role-permissions-json` | Optional (`dashboardRolePermissions_v1`) |

**After changing any secret** (a restart alone is not enough):
```powershell
az rest --method post --uri "https://management.azure.com/subscriptions/6a7feb18-766c-4257-b84c-8c920f499720/resourceGroups/rg-aps-dashboard/providers/Microsoft.Web/sites/aps-dashboard-ap/config/configreferences/appsettings/refresh?api-version=2022-03-01"
az webapp restart -g rg-aps-dashboard -n aps-dashboard-ap
```

### App settings (same names as the Script Properties)

| Setting | Needed | Purpose |
|---|---|---|
| `TARGET_SPREADSHEET_ID` | yes | Main Google Sheet |
| `ATTENDANCE_SPREADSHEET_ID` | yes (for Meet links) | Attendance spreadsheet (Meet link map sheets) |
| `GOOGLE_IMPERSONATE_USER` | yes | Account the app reads Sheets as (must open both spreadsheets) |
| `PUBLIC_BASE_URL` | yes | `https://aps-dashboard-ap.azurewebsites.net` |
| `APS_SCHOOL_LEAVE_ENABLED`, `APS_COUNTRY_FEATURE`, `APS_ENVIRONMENT`, `TCC_CLEANUP_GRACE_MINUTES`, `APS_CLASS_TEACHER_AVAILABILITY_*`, `ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS`, `APS_GRADING_TEAM_EMAILS`, `APS_CLASSES_ALWAYS_SHOW_EMAILS` | optional | Same meaning as in Apps Script; unset = Apps Script default |

Set one (PowerShell):
```powershell
az webapp config appsettings set -g rg-aps-dashboard -n aps-dashboard-ap --settings NAME=value
az webapp config appsettings list -g rg-aps-dashboard -n aps-dashboard-ap -o table | Select-String NAME
```
Values containing `|` need `az --% …` (e.g. `--linux-fx-version "NODE|22-lts"`).

---

## 4. Deploy a change

```powershell
cd C:\Users\AmChaTS\PycharmProjects\APS-Dashboard-Azure
npm install
npm test                     # must end with fail 0
git add -A
git status                   # no .env, no key .json, no ENV_VARIABLE file
git commit -m "…"
git push                     # GitHub Actions builds, tests and deploys
```
Then GitHub → **Actions** → green run; `https://aps-dashboard-ap.azurewebsites.net/healthz` → `{"ok":true,"phase":1}`.
Undo the last release: `git revert HEAD` then `git push`.

Local test without Google: `Copy-Item .env.example .env` (set `ADMIN_EMAILS`), `npm run start:local`, open
`http://localhost:8080/dev/login?email=admin@avvaiyarpadasalai.org` (works only on your computer).

---

## 5. Logs and troubleshooting

```powershell
az webapp log tail -g rg-aps-dashboard -n aps-dashboard-ap
```

| You see | Meaning / fix |
|---|---|
| `listening on 8080 — data: sheets` | App is up |
| `[Google] Sheet check OK — N classes readable.` | Google access works |
| `[Google] Sheet check FAILED: … [delegation_not_active]` | Domain-wide delegation: Client ID = service account **numeric Unique ID**, scope `spreadsheets.readonly` (up to 24 h) |
| `[Google] Sheet check FAILED: error [unknown]` within ~10 ms of start | Key Vault holds the wrong file (OAuth client) — upload the service-account key, then refresh secrets |
| `[Config] cannot start: …` | A required setting is missing (named, never its value) |
| `[Config] X: Key Vault reference not resolved yet` | Secret missing or misspelled — check the green ticks under App Service → Environment variables |
| `[Classes] attendance workbook not readable` | `ATTENDANCE_SPREADSHEET_ID` not set, or the impersonated account cannot open it |
| `[Gas] … sheet "X" exists but was not read` | Developer: add the sheet to the snapshot list (`MAIN_SHEETS` / `ATTENDANCE_SHEETS`) |
| Page: "This sign-in link has expired" | Open the site fresh and sign in again |
| Page: "cannot read class data right now" | Google access problem — see the `[Google]` / `[SignIn]` line |
| Chrome "Dangerous" label | Report a false positive at safebrowsing.google.com or verify the site in Search Console; long term use an APS domain |
| 503 / "Cannot find module dist/src/server.js" | Code not deployed yet — check GitHub Actions |
| GitHub Actions `AADSTS700213` | Federated credential subject must match exactly (`repo:vsugadev@20652424/APS-Dashboard-Azure@1453001598:environment:production`) |

---

## 6. For developers — moving the next screen

Follow `aps_dashboard_Azure_prompt.txt` Part B11 (the same steps): copy the Code.gs function with `gen-gas-scope`,
add any new sheet to the snapshot list, register the endpoint with the Code.gs name, switch off writes, add a parity
test with real seeded rows for every role, add a browser check, update `docs/PHASE2.md` and this guide.

Project folders: `src/` (Azure app), `src/gas/` (copied Code.gs code — generated), `public/` (page + shim),
`test/` (Azure + parity tests), `tools/` (generators, sync, browser check, Key Vault script), `infra/` (Bicep),
`gas-source/` (Apps Script reference copy — refresh with `npm run sync-gas`, then `npm run gen-gas`), `docs/`.

---

## 7. Change log

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-11-09 | Phase 1: sign-in, sessions, roles, Access Control, page + shim, Bicep, CI/CD |
| 0.1.1 | 2026-11-10 | Restart-safe sign-in link, address-bar clean-up, `[Google] Sheet check`, Azure help wording, Node 22 |
| 0.2.0 | 2026-11-11 | Phase 2 step 1: Classes view (cards, rosters, filters, automatic status), country preference |
| 0.3.0 | 2026-11-11 | Phase 2 step 2: card extras from Sheets via the read-only Code.gs runtime |
| 0.4.0 | 2026-11-11 | Phase 2 step 3: Teacher Availability view (read-only); generator indexes `const`/`let`; full Java date patterns |
| 0.5.0 | 2026-11-11 | Phase 2 step 4: Active Directory (Directory Search, role-tiered); one shared set of live-data passes for every screen |

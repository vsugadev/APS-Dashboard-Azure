# APS Dashboard on Azure — Guide

*Avvaiyar Padasalai · ஔவையார் பாடசாலை — the Azure version of the APS Classroom Dashboard.*
*Last updated: 2026-11-22 (v0.23.6, Exam Question Paper opens its spreadsheet on Azure; v0.23.5 no "sign-in link has expired" warning for a stale link; v0.23.4 attendance from the copy + Exam Question Paper setting; v0.23.3 Google Sheets API budget — no more 429 bursts; v0.23.2 parallel-run fixes: speed + Examination tab; v0.23.1 log clean-up after the first parallel-run day; v0.23.0 Phase 4 step 2: fixed-time daily / weekly jobs on Azure's timetable; v0.22.0 shadow comparison of real requests Apps Script vs Azure; v0.21.0 migration + parallel-run kit — record-level reconciliation, test group, Report a difference, readiness; runbook `docs/CUTOVER.md`; v0.20.0 Phase 4 step 4: first email job sent by Azure — Multiple Classrooms report, preview then owner; v0.19.0 Phase 4 step 3: email From donotreply@ sent by Azure; v0.18.0 Phase 5 step 1: verified spreadsheet copies; live class status, settings copy, jobs on Azure's timetable). Complete switch-on list: `docs/FINAL_SETUP.md`. Keep this guide updated with every Azure change.*

The **live dashboard is still the Apps Script web app** — every teacher, student and admin keeps using it.
The Azure version is being built beside it, one screen at a time, and reads the **same Google Sheets**, so both always
show the same data. Live data Apps Script keeps in its Script / User Properties (online now, last login, class status …)
reaches Azure through a signed, read-only bridge (Phase 3). Nothing on Azure changes any data yet.

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
| **Attendance** tab | ✅ view | Week list, records (by week / class / mine), on-call teacher attendance, audit log — all read-only (no edits). Sync status / diagnostics empty until Phase 3 |
| Active Directory → Student Onboarding Status | ✅ | Built from the Classes data in the browser; onboarded list from Apps Script (Phase 3) |
| **Other read-only screens** (Phase 2 step 6) | ✅ view | 62 more calls: Admin Control lists, Teacher Appreciation reports, Assignment Monitoring, Class change / grade change requests, Leave, Coverage, Examination history / monitoring, Reference letters, Special Classes, Temp Teacher, Tickets, Zoho sync history, Tamil Thadam search. Buttons that save / send / sync still say "not on Azure yet" |
| Grading, Add Student context, Meet preview, Tamil Thadam, Teacher Appreciation data, Assignment Monitoring / Grading Help admin, Maintenance status, Exam context / course options / announcement search & previews, Zoho checks / mapping / status / preview, ticket attachments, exports (v0.12.0) | ✅ view | Read-through: the real Code.gs function runs in Apps Script for you (about 1–3 s per screen) — `docs/PHASE2.md` step 7 |
| Teacher class-card actions: Mark Live, Teacher NOT in Class, Needs Tech Support, availability, class status (v0.13.0) | ✅ save | Write-through: the real Code.gs function runs in Apps Script for the teacher — `docs/PHASE4.md` step 2 |
| Special Classes + Add / Edit / Activate (v0.13.0) | ✅ save | Forwarded to Apps Script; with `SC_OWNER=azure` saved in Azure SQL and Apps Script uses Azure — `docs/DATABASE.md` stage 3 |
| Everything else: requests (leave, timing / grade change, reference letters), tickets, attendance edits, chat, exam question papers (save, preview, download, send, batch), coverage, temp teacher, add / remove / assign student, Meet links, user roles, Zoho sync, backups and other Admin jobs (v0.14.0) | ✅ | Through Apps Script — `docs/PHASE4.md` step 3. **Role permissions** stay in Key Vault (Azure refuses that one Save with the steps) |
| Chat, exam question paper download / preview | ⏳ | Later steps |
| **Live data** (Phase 3): online now, last login, onboarded, manual class status, on-call banner, Hide/Show, realtime poll (live / Teacher NOT in Class / Needs Tech Support flags), sync status | ✅ view | From Apps Script's Script / User Properties through the bridge (refreshed every 20 s). Needs the bridge settings below |
| **Heartbeat** (v0.9.0): people using Azure show 🟢 online and get Last Login (DB) | ✅ | Sent to Apps Script through the signed bridge (`AzureBridge.gs` r131, action heartbeat), batched every 15 s. Setting `AZURE_HEARTBEAT=off` stops it |
| Live Google Meet status on class cards, chat | ⏳ | Meet / Reports APIs |
| **Admin settings saves** (v0.10.0): Access Control, Assignment Monitoring, Grading Help Team report, Mark-as-complete reminder, Teacher Appreciation settings + emails switch, Special Classes texts, Ticket settings, Exam Question Paper release window / automatic email, Hide / Show staff | ✅ | Saved through the signed bridge: the real Code.gs function runs in Apps Script for you (same checks, audit). `AZURE_WRITE_THROUGH=off` stops it |
| **Database pilot** (v0.11.0): Special Classes read from Azure SQL (free offer), copied from Google Sheets every 5 minutes | ✅ when `SQL_SERVER` / `SQL_DATABASE` are set | Falls back to Google Sheets by itself. Set-up: `docs/DATABASE.md` |
| Every other save / email / sync | ⏳ | Shows "not on Azure yet" — use the Apps Script dashboard |

---

## 2. How it works (short)

- **Same page:** Azure serves the same `Dashboard.html`. A small script (`aps-gas-shim.js`) sends each
  `google.script.run.<name>(…)` call to Azure (`POST /api/run/<name>`) — same names, same answers.
- **Same rules:** Code.gs code is **copied word for word** by two tools, never retyped:
  `gen-gas-helpers` (pure rules) and `gen-gas-scope` (Sheet readers and whole read-only screens).
- **Read-only runtime:** the copied code runs against a **snapshot** of the Google Sheets read through the Sheets API
  (cached 60 s). It cannot change any existing sheet or setting (`READ_ONLY`). Sheets are **loaded on demand**: if the
  code needs a sheet (e.g. a weekly attendance sheet) that is not loaded yet, Azure loads it and runs the read again.
- **Live data bridge (Phase 3):** Azure asks the live Apps Script web app (one signed POST, HMAC secret shared through Key
  Vault and the Script Property `AZURE_BRIDGE_SECRET`) for an **allow-listed** snapshot of its Script / User Properties.
  Secrets, role lists and spreadsheet IDs are never sent; Azure filters the answer again. Kept 20 s; if Apps Script cannot
  be reached the last snapshot is used up to 5 min, then live data is empty (the page still works).
- **Proved by tests:** every screen is compared with Code.gs itself (run in the Apps Script test mock) for every role.

---

## 3. Settings

### Key Vault secrets (`kv-apsdashboardapu7zau2j`)

| Secret | Value |
|---|---|
| `google-oauth-client-id`, `google-oauth-client-secret` | Google sign-in client (type "Web application") |
| `google-service-account-json` | The **service-account key** file (`{"type": "service_account", …}`) — not the OAuth client file |
| `superadmin-emails`, `admin-emails`, `headmaster-emails`, `bod-emails`, `on-call-coordinator-emails` | JSON lists, copied from Script Properties (`tools\push-role-lists-to-keyvault.ps1`) |
| `role-permissions-json` | Optional (`dashboardRolePermissions_v1`) — also used by the copied Code.gs screens |
| `apps-script-bridge-secret` | Phase 3: random text, ≥ 32 characters — the SAME value as Script Property `AZURE_BRIDGE_SECRET` in the live Apps Script |

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
| `APPS_SCRIPT_BRIDGE_URL` | yes (Phase 3) | The live Apps Script web app address `https://script.google.com/macros/s/…/exec` |
| `APPS_SCRIPT_BRIDGE_SECRET` | yes (Phase 3) | Key Vault reference `@Microsoft.KeyVault(SecretUri=https://kv-apsdashboardapu7zau2j.vault.azure.net/secrets/apps-script-bridge-secret/)` |
| `SPECIAL_CLASSES_SPREADSHEET_ID`, `SPECIAL_CLASSES_SHEET_NAME`, `ZOHO_SYNC_SPREADSHEET_ID` | optional | Only if Apps Script sets them (unset = Code.gs default). `GOOGLE_IMPERSONATE_USER` must be able to open the Special Classes and Zoho sync spreadsheets |
| `SQL_SERVER`, `SQL_DATABASE`, `DB_SYNC_MINUTES` | optional | Azure SQL database (Special Classes) — `docs/DATABASE.md` |
| `AZURE_SESSION_STORE` | optional | Empty = sign-ins kept in Azure SQL when the database is set (v0.15.0); `memory` = as before (a restart signs everyone out) |
| `CHAT_OWNER` | optional | `azure` = Azure SQL owns the chat (v0.16.0) — set together with Apps Script Script Property `CHAT_OWNER=azure`; empty = the sheet (default) |
| `AZURE_CLASS_LIVE` | optional | Default on: live Google Meet class status from Apps Script (v0.17.0); `off` = schedule-based status only |
| `AZURE_JOBS` | optional | Apps Script job handlers run on Azure's timetable (v0.17.0) — set together with Script Property `APS_JOBS_ON_AZURE`; see `docs/JOBS.md` |
| `PARALLEL_RUN` | optional | `on` = test-run bar with "Official dashboard" link and "Report a difference" (v0.21.0, `docs/CUTOVER.md`) |
| `PARALLEL_RUN_USERS` | optional | e-mails and/or role names allowed on Azure during the test run (checked on every call); empty = everyone |
| `PARALLEL_RUN_OFFICIAL_URL` | optional | link in the bar; default `APPS_SCRIPT_BRIDGE_URL` |
| `SHADOW_SAMPLE` | optional | percent of read-screen calls compared with Apps Script (v0.22.0; 0 = off; 20 during the parallel run); `SHADOW_DAILY_CAP` (400), `SHADOW_IGNORE` (pattern of result paths) |
| `RECONCILE_HOURS` | optional | record-level reconciliation of the `DB_COPY` copies every N hours (default 6; 0 = off) |
| `LIVE_QUESTION_PAPER_SPREADSHEET_ID` | **required for Exam Question Paper** | same value as the Apps Script Script Property (v0.23.4); a TEST app uses `TEST_QUESTION_PAPER_SPREADSHEET_ID` |
| `AZURE_TIMED_JOBS` | optional | fixed-time daily / weekly jobs run on Azure's timetable (v0.23.0; same names in Apps Script `APS_JOBS_ON_AZURE`; `docs/JOBS.md`) |
| `AZURE_MAIL_JOBS` | optional | `MULTIPLE_CLASSROOM_REPORT` = that weekly email is built and sent by Azure (v0.20.0); with `MAIL_JOBS_PREVIEW_TO` = one APS address it only sends a weekly preview copy there (`docs/MAIL.md`) |
| `AZURE_MAIL` | optional | `on` = Azure signs in as donotreply@ through the Gmail API (v0.19.0, `docs/MAIL.md`); with `MAIL_TEST_TO` = one APS address, one test email at start-up (remove after) |
| `DB_COPY` | optional | `main,attendance` = copy every tab of those spreadsheets into Azure SQL and check each copy (v0.18.0, `docs/PHASE5.md`) |
| `DB_READS` | optional | Of those, the books whose reads come from the copy (switch on after two clean weeks) |
| `DB_COPY_EXCLUDE` | optional | Tabs not copied (regular expression on the tab name) |
| `SC_OWNER` | optional | `azure` = Azure SQL OWNS Special Classes (stage 3) — set together with Apps Script Script Property `SPECIAL_CLASSES_OWNER=azure`; empty = Apps Script owns them (default) |
| `APS_SCHOOL_LEAVE_ENABLED`, `APS_COUNTRY_FEATURE`, `APS_ENVIRONMENT`, `TCC_CLEANUP_GRACE_MINUTES`, `APS_CLASS_TEACHER_AVAILABILITY_*`, `ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS`, `APS_GRADING_TEAM_EMAILS`, `APS_CLASSES_ALWAYS_SHOW_EMAILS` | optional | Same meaning as in Apps Script; unset = Apps Script default |

Set one (PowerShell):
```powershell
az webapp config appsettings set -g rg-aps-dashboard -n aps-dashboard-ap --settings NAME=value
az webapp config appsettings list -g rg-aps-dashboard -n aps-dashboard-ap -o table | Select-String NAME
```
Values containing `|` need `az --% …` (e.g. `--linux-fx-version "NODE|22-lts"`).

### Phase 3 bridge — set up once

1. **Make the secret — easiest (Apps Script r128):** in the live Apps Script editor run `ONE_TIME_setAzureBridgeSecret`
   (file `AzureBridgeSetup.gs`; owner only; creates Script Property `AZURE_BRIDGE_SECRET`, never logs it), copy the value
   from Project Settings → Script Properties, then:
   ```powershell
   $s = Get-Clipboard
   az keyvault secret set --vault-name kv-apsdashboardapu7zau2j -n apps-script-bridge-secret --value $s -o none
   Remove-Variable s; Set-Clipboard ' '
   ```
   and skip the Script Property part of step 2. (`ONE_TIME_rotateAzureBridgeSecret` replaces it later.)
   **Or make it in PowerShell** (the value goes to Key Vault and to the clipboard — never into a file or chat):
   ```powershell
   $b = New-Object byte[] 36; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
   $s = [Convert]::ToBase64String($b) -replace '[+/=]', ''
   az keyvault secret set --vault-name kv-apsdashboardapu7zau2j -n apps-script-bridge-secret --value $s -o none
   Set-Clipboard $s; Remove-Variable s, b
   ```
2. **Apps Script** (live project, editor): add the file `AzureBridge.gs`, apply the one-line change in `PortalBridge.gs`
   `doPost`; **Project Settings → Script Properties → Add** `AZURE_BRIDGE_SECRET` = paste (Ctrl+V); then clear the
   clipboard (`Set-Clipboard ' '`). **Deploy → Manage deployments → ✏️ edit the live web app → Version: New version →
   Deploy** (the /exec address stays the same). Copy that /exec address.
3. **Azure app settings**, then refresh secrets and restart:
   ```powershell
   az webapp config appsettings set -g rg-aps-dashboard -n aps-dashboard-ap -o none --settings "APPS_SCRIPT_BRIDGE_URL=https://script.google.com/macros/s/<ID>/exec" "APPS_SCRIPT_BRIDGE_SECRET=@Microsoft.KeyVault(SecretUri=https://kv-apsdashboardapu7zau2j.vault.azure.net/secrets/apps-script-bridge-secret/)"
   az rest --method post --uri "https://management.azure.com/subscriptions/6a7feb18-766c-4257-b84c-8c920f499720/resourceGroups/rg-aps-dashboard/providers/Microsoft.Web/sites/aps-dashboard-ap/config/configreferences/appsettings/refresh?api-version=2022-03-01"
   az webapp restart -g rg-aps-dashboard -n aps-dashboard-ap
   ```
4. Log: `[Live] Apps Script bridge OK — N Script + M User Properties (allow-listed).`
   To change the secret later: repeat 1–2 (same value in both places), then the refresh + restart.

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
| `[Config] APPS_SCRIPT_BRIDGE_… ` | A bridge setting is missing / not the /exec address / secret too short (value never printed) |
| `[Gas] … too many sheet loads` / `requested again after loading` | Developer: a read keeps asking for data the source cannot deliver — check the sheet name / range |
| `[Gas] attendance workbook not readable` | `ATTENDANCE_SPREADSHEET_ID` not set, or the impersonated account cannot open it |
| `[Gas] extra spreadsheet not readable` / page "Special Classes are temporarily unavailable" | `GOOGLE_IMPERSONATE_USER` cannot open the Special Classes or Zoho sync spreadsheet — share it (Viewer is enough) |
| `[Live] … BAD_SIGNATURE` + `[Live] Azure's secret: N characters, fingerprint xxxxxxxx` (v0.8.3) | Run `ONE_TIME_azureBridgeFingerprint` in the Apps Script editor. Different fingerprint (or length) = Key Vault `apps-script-bridge-secret` is not the Apps Script value: copy it with `ONE_TIME_showAzureBridgeSecret` into a New Version, update the setting (version-pinned Secret Identifier forces a re-read), restart. Same fingerprint but still failing = the /exec URL is another project / deployment |
| `[SignIn] Google token exchange failed: <reason> — <fix>` (v0.8.2) | The sign-in page said INVALID_TOKEN. `invalid_grant` = code reused / expired (reload, Back, double click) — sign in again from a fresh page; if EVERY time, client ID and secret are not the same OAuth client. `redirect_uri_mismatch` = add `PUBLIC_BASE_URL/` to the OAuth client's Authorized redirect URIs. `invalid_client` = Key Vault `google-oauth-client-secret` is wrong / rotated — New Version with the current secret, refresh, restart |
| `[DB] … FAILED: <CODE> — <fix>` / `[DB] read from Google Sheets instead: …` (v0.11.0) | Database pilot: `LOGIN_FAILED` = run the CREATE USER / ALTER ROLE lines (docs/DATABASE.md step 2); `FIREWALL` = allow Azure services; `NO_IDENTITY` = App Service → Identity On; `WAKING_UP` = free database was paused (retries); `FREE_LIMIT_REACHED` = monthly free allowance used — Sheets serve until next month |
| `[Read] <function> not answered: <code>` (v0.12.0) | A read-through screen: `TIMEOUT` = Apps Script took over 2 minutes; `BAD_REQUEST` = `AzureBridge.gs` older than r133 (deploy it); other codes as `[Write]` |
| `[DB] SC_OWNER=azure: Special Classes could not be imported: …` (v0.13.0) | Database not reachable at start, or the programs sheet missing — fix as the message says, then Restart; Special Classes show "not available" until then |
| `[Config] "ADMIN_EMAILS" is written with single quotes …` (v0.15.1) | The value was pasted from a .gs file. It is read, but store it as JSON (`["a@x.org","b@x.org"]`, double quotes) when you next change it |
| `[Config] "ADMIN_EMAILS" is not a list Azure can read …` | The value is not a plain list — those people do NOT get that role on Azure. Key Vault → Secrets → that secret → New Version → `["a@x.org","b@x.org"]`; Restart |
| `[Jobs] <handler> ran on Azure's timetable: FAILED — NOT_ON_AZURE …` (v0.17.0) | Add the handler to Apps Script Script Property `APS_JOBS_ON_AZURE` (Apps Script keeps running it meanwhile) |
| `[Live] live Google Meet status not available from Apps Script (BAD_REQUEST)` | Deploy `AzureBridge.gs` r137 |
| `[Chat] CHAT_OWNER=azure: the chat table could not be prepared: …` (v0.16.0) | Database problem at start — fix as the message says, then Restart; the chat shows "not available" until then |
| `[Chat] Apps Script not told about the new message: …` | The forward bridge failed once; Apps Script users see the message after its cache expires (≤ 10 min) — check `[Live]` lines |
| `[Sessions] a sign-in could not be … in Azure SQL (…)` (v0.15.0) | Database slow (waking up) or unreachable — sign-ins still work on this server; fix the database (see `[DB]` lines) so they survive the next restart |
| `[Write] <function> not saved: TIMEOUT` (v0.14.0) | Over 220 s (Azure front door limit ~230 s). The action keeps running in Apps Script and normally completes — check its result there |
| `[Write] <function> not saved: TOO_LARGE` | `PortalBridge.gs` older than r135 (deploy it) |
| `[Bridge] reverse request refused: NOT_OWNER` | Apps Script has `SPECIAL_CLASSES_OWNER=azure` but Azure `SC_OWNER` is not `azure` — set both the same |
| `[Bridge] reverse request refused: BAD_SIGNATURE` | Apps Script `AZURE_BRIDGE_SECRET` ≠ Key Vault `apps-script-bridge-secret` (compare fingerprints, §3) |
| `[Write] <function> not saved: <code>` (v0.10.0) | The page said "could not be saved right now". `BAD_REQUEST` = Apps Script `AzureBridge.gs` older than r132 (deploy it); `BAD_SIGNATURE` / `NOT_JSON` = bridge settings (§3); `HTTP_5xx` = Apps Script busy — try again |
| `[Live] heartbeat not sent: BAD_REQUEST … deploy AzureBridge.gs r131` (v0.9.0) | Apps Script still runs the bridge without the heartbeat action — replace `AzureBridge.gs` (r131) → Deploy → New version. Heartbeats pause 10 minutes and then try again; reading live data is not affected |
| `[Live] heartbeat not sent: <code> — kept` | Temporary (Apps Script busy / network): the batch is sent again 15 s later |
| `[Live] Apps Script bridge not configured` | `APPS_SCRIPT_BRIDGE_URL` / `APPS_SCRIPT_BRIDGE_SECRET` missing (or Key Vault reference not resolved) — §3 |
| `[Live] … FAILED: NOT_CONFIGURED` | Script Property `AZURE_BRIDGE_SECRET` missing / shorter than 32, or the new Apps Script version is not deployed |
| `[Live] … FAILED: BAD_SIGNATURE` | The two secrets differ — set the same value in Key Vault and the Script Property, refresh + restart |
| `[Live] … FAILED: STALE` | Server clock difference > 5 min (rare) — restart the app |
| `[Live] … FAILED: NOT_JSON` / `HTTP_4xx` | `APPS_SCRIPT_BRIDGE_URL` is not the live web app `/exec` address, or the deployment does not allow "Anyone" |
| Online dots / last login empty on Azure only | Bridge failing for > 5 min — see the `[Live]` lines |
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
| 0.6.0 | 2026-11-11 | Phase 2 step 5: Attendance tab reads (7, read-only); on-demand sheet loading; Sheets advanced service (read) |
| 0.7.0 | 2026-11-11 | Phase 2 step 6: 62 remaining read-only calls; Special Classes / Zoho sync spreadsheets opened read-only by ID; number format no-op |
| 0.18.0 | 2026-11-21 | Phase 5 step 1: verified copies of the main / attendance spreadsheets in Azure SQL (`DB_COPY`, content-hash check, daily `dbo.sheet_sync_log`), reads per book (`DB_READS`), saves send reads to Google until a fresh copy; live status "not known" fallback like Apps Script; `AzureBridge.gs` r138 |
| 0.19.0 | 2026-11-21 | Phase 4 step 3: Azure mail sender (`src/mail/gmailSender.ts`) — From donotreply@ via Gmail API, service account of project APS Dashboard Azure with domain-wide delegation (gmail.send only); same MIME as Code.gs apsGmailSend_ (test compares byte for byte) and same TEST guard; `AZURE_MAIL=on`, start-up sign-in check, optional `MAIL_TEST_TO`; no job sends from Azure yet (`docs/MAIL.md`) |
| 0.20.0 | 2026-11-21 | Phase 4 step 4: first email job built and sent by Azure — `MULTIPLE_CLASSROOM_REPORT` (`src/mail/mailJobs.ts`; copied `admcBuild_`/`admcEmail_`, test = Apps Script email byte for byte). `AZURE_MAIL_JOBS`, preview mode `MAIL_JOBS_PREVIEW_TO`; owner only while Apps Script has the job off; `dbo.mail_job` claim (never twice); results recorded in Apps Script (`AzureBridge.gs` r139, action `mailJob`). Email links on Azure = the live Apps Script /exec (`APS_DASHBOARD_URL` default). `docs/MAIL.md` |
| 0.21.0 | 2026-11-22 | Migration and parallel run: record-level reconciliation of the spreadsheet copies (`src/db/reconcile.ts`, `RECONCILE_HOURS`, `dbo.reconcile_run`: SOURCE/TARGET/MATCH/MISSING/EXTRA/DIFFERENT/DUPLICATES/ERRORS, two-pass); test group checked on the server at sign-in and every call (`PARALLEL_RUN_USERS`); test-run bar + Report a difference (`PARALLEL_RUN`, `public/aps-parallel.js`, `azureReportDifference` → `dbo.parallel_feedback`); `[ParallelRun] readiness` log block. Runbook `docs/CUTOVER.md` |
| 0.22.0 | 2026-11-22 | Parallel run: shadow comparison of real requests (`src/parallel/shadow.ts`): a sample (`SHADOW_SAMPLE` %) of 63 side-effect-free read screens is also run in Apps Script for the same person and input (`AzureBridge.gs` r140, `shadow:true`, own allow-list mirrored + guard test over Code.gs); MATCH / DIFFERENT (paths only) / ERROR + both times; re-checked after 90 s; `dbo.shadow_compare`; hourly summary. Registry call observer (never affects the answer) |
| 0.23.0 | 2026-11-22 | Phase 4 step 2: 12 fixed-time daily / weekly jobs on Azure's timetable (`src/jobs/timed.ts`, `AZURE_TIMED_JOBS`): times from Apps Script (`jobSchedule`, r141) incl. time zone and DST, once per slot (lease + `dbo.job_run`), only while the trigger is installed there; Apps Script trigger skips while Azure is alive, else takes over and Azure's slot is refused. Code.gs r141: `ON_AZURE` guard in the 12 handlers. `docs/JOBS.md` |
| 0.23.1 | 2026-11-22 | Log only: a request the browser stopped sending (page closed / reloaded) is logged as an information line, not `[Server] request aborted`; the Special Classes copy says "nothing to copy yet (… not in the spreadsheet)" instead of "no sheet yet; checked identical". Day 1 result: reconciliation IDENTICAL (main 42,786 rows, attendance 17,239 rows) |
| 0.23.2 | 2026-11-22 | Parallel-run reports #1–#3. **Speed:** a read from the Azure SQL copy fetched EVERY tab of the spreadsheet (tens of MB) per sheet load — now only the requested tabs, and the copies this instance makes are kept in memory, so reads need no database round trip (same freshness rules). **Examination tab / sub-tabs hidden:** Phase 1–2 placeholders removed — `examinationAccess`, `gradingAccess`, `assignMonAccess`, `apsRole`, coverage / Temp Teacher flags now come from the copied Code.gs (sign-in and Classes). **Same buttons as Apps Script:** Teacher Availability Save / test email, attendance Override and Access Control editing were hidden on Azure since Phase 2 although their saves go through the bridge since v0.14 — now shown exactly as Code.gs decides |
| 0.23.3 | 2026-11-22 | **Sheets API rate limit (429 RESOURCE_EXHAUSTED)**: a whole-spreadsheet copy read each tab with its own call (71 calls at once for "main", every 5 min and after saves) — now batches of 20 tabs per call, and every Sheets call goes through one budget per instance (≤45/min, 4 at a time; a 429 pauses all reads 30 s and retries once) (`src/google/apiGate.ts`). The copy after a save waits at least 60 s (was 20 s). **Wrong error name:** a Google 429 was reported as `FREE_LIMIT_REACHED` (the words "RESOURCE_EXHAUSTED" matched) — Google errors are now named as Google errors; the earlier FREE_LIMIT_REACHED lines were this. A failed Access Control read is no longer cached for a minute |
| 0.23.4 | 2026-11-22 | Reports #4–#5. **Attendance speed / 429 on Override:** the week-sheet reads (Code.gs `Sheets.Values.batchGet`, UNFORMATTED_VALUE + SERIAL_NUMBER) are answered from the verified attendance copy in memory (exactly the Sheets API form: dates as serial numbers, trailing empties dropped); any other form, a tab not copied, or a copy dirty after a save → Google as before. **Exam Question Paper "not configured":** `LIVE_QUESTION_PAPER_SPREADSHEET_ID` (and `TEST_…`) are Azure app settings by design (never sent over the bridge) but were not read — now read; a warning names it when missing. Apps Script r142: + `TAMIL_THADAM_SPREADSHEET_ID`, `EXAM_QUIZ_MATERIAL_SHEET_ID`, `DAILY_SUMMARY_SPREADSHEET_ID` in the export list; `TEST_QUESTION_PAPER_SPREADSHEET_ID` reserved as Azure's own |
| 0.23.5 | 2026-11-22 | Sign-in: "We couldn't verify your Google sign-in — This sign-in link has expired" appeared when the sign-in page had been open more than 10 minutes, after a reload / the back button, or during a deploy restart. A genuine (signed) link that is only expired or already used now restarts the Google sign-in ONCE with a fresh link (usually completes at once); the restart is marked so it can never loop; a link that is not ours, or a second failure, still shows the message. Security unchanged: signed, 10-minute, single-use state |
| 0.23.6 | 2026-11-22 | Examination → Exam Question Paper: "Azure runtime: SpreadsheetApp.openById only opens the APS spreadsheets" — the copied screens may now open (read-only) the spreadsheets named by `LIVE_QUESTION_PAPER_SPREADSHEET_ID` / `TEST_…` (app settings) and `TAMIL_THADAM_SPREADSHEET_ID`, `EXAM_QUIZ_MATERIAL_SHEET_ID`, `DAILY_SUMMARY_SPREADSHEET_ID` (from Apps Script, r142) — `EXTRA_BOOK_ID_PROPS` in `src/gas/run.ts`; any other ID is still refused. The spreadsheet must be readable by `GOOGLE_IMPERSONATE_USER` |
| 0.17.1 | 2026-11-20 | `/healthz` and the start-up line show the running version (`[Server] APS Dashboard (Azure) v0.17.1 listening …`); a refused reverse-bridge request logs why (`[Bridge] reverse request refused: BAD_REQUEST — chatList: e-mail domain not in APS_ALLOWED_DOMAINS (…)`). **Deploy only through GitHub Actions from the APS-Dashboard-Azure folder** — an old build deployed on 2026-11-20 ~05:00 UTC replaced v0.17.0 |
| 0.17.0 | 2026-11-19 | Phase 3: live Google Meet class status (from Apps Script), settings copy in Azure SQL; Phase 4 step 1: five repeating jobs on Azure's timetable (`AZURE_JOBS`); `AzureBridge.gs` r137 |
| 0.16.0 | 2026-11-19 | Phase 3 step 4: chat owned by Azure SQL (`CHAT_OWNER=azure`, `dbo.chat_message`), shared with Apps Script through the reverse bridge (`AzureBridge.gs` r136); Azure's realtime poll now carries the chat version |
| 0.15.1 | 2026-11-19 | Role lists (SUPERADMIN / ADMIN / HEADMASTER / BOD / On-Call Coordinator …) pasted from a .gs file (single quotes, line breaks, trailing comma, `//` comments) are read; the warning never prints any part of a value |
| 0.15.0 | 2026-11-19 | Phase 3 step 3: lasting sign-ins — sessions kept in Azure SQL (`dbo.app_session`, token hashes only) behind a memory cache; restarts / deploys / a second instance no longer sign people out; `AZURE_SESSION_STORE=memory` |
| 0.14.0 | 2026-11-19 | Every remaining dashboard action through Apps Script (73 functions; bridge r135: Promise results, uploads up to 24 MB, 220 s limit with "still running" message); role permissions refused on purpose |
| 0.13.0 | 2026-11-18 | Teacher class-card actions saved through Apps Script; Special Classes saves forwarded; database stage 3 (`SC_OWNER=azure`: Azure SQL owns Special Classes, reverse bridge `/api/bridge` for Apps Script, `AzureBridge.gs` r134) |
| 0.12.0 | 2026-11-18 | Phase 2 completed: the 21 remaining read screens run through Apps Script (bridge `call`, `AzureBridge.gs` r133 `AZURE_BRIDGE_READS_` = `READ_THROUGH`); bridge calls time out after 2 minutes; network / time-out errors give short codes |
| 0.11.0 | 2026-11-17 | Database pilot: Azure SQL Database (free offer, managed identity) as a read copy of Special Classes (`src/db/`: sheet store, 5-minute sync with row-count check, DB-backed reads with automatic fallback to Sheets); `mssql` 11.0.1; settings `SQL_SERVER`, `SQL_DATABASE`, `DB_SYNC_MINUTES` |
| 0.10.0 | 2026-11-17 | Write phase step 1: 11 Admin settings saves on Azure — `src/api/endpoints/writes.ts` sends each Save through the signed bridge (Apps Script `AzureBridge.gs` r132 `call`): the real Code.gs function runs for the signed-in person, Apps Script decides the role; lists identical on both sides; caches refreshed after a save; `AZURE_WRITE_THROUGH=off` |
| 0.9.0 | 2026-11-17 | Phase 3 step 2: heartbeat — `getDashboardData` / `recordDashboardSignOff` on Azure send the session e-mail through the signed bridge (Apps Script `AzureBridge.gs` r131 `heartbeat`: presence + Last Login DB, APS e-mails only, ≤ 200 per call, one lock / one write); batched 15 s, once per person per minute (sign-off always); `AZURE_HEARTBEAT=off`; shared `bridgeCall` |
| 0.8.3 | 2026-11-17 | Bridge: the secret is trimmed (a pasted space / line break no longer breaks it); on `BAD_SIGNATURE` the log shows `[Live] Azure's secret: N characters, fingerprint xxxxxxxx` to compare with Apps Script `ONE_TIME_azureBridgeFingerprint` (never the value) |
| 0.8.2 | 2026-11-17 | Sign-in: a failed Google code exchange now logs Google's reason + the fix (`[SignIn] Google token exchange failed: …`, never the code or secret); flaky state-tamper test fixed |
| 0.8.1 | 2026-11-16 | Apps Script r123–r126 copied (gas-source, page, copied code): Exam Question Paper monitoring now follows r123 (Teacher Copy / Send to Student times — 3 new live settings in both allow-lists, Apps Script `AzureBridge.gs` r127), r124 Clear filters, r125 batch / emailed-key display (keys of emailed students blank on Azure: the HMAC secret stays in Apps Script), r126 student download page (downloads stay on Apps Script) |
| 0.8.0 | 2026-11-11 | Phase 3 step 1: Apps Script live-data bridge (AzureBridge.gs, r122); Code.gs live passes + realtime poll on Azure; generator copies var set-up lines; `TARGET_SPREADSHEET_ID` / role permissions passed to copied screens |

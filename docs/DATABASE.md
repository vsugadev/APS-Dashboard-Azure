# Database pilot — Azure SQL Database (free offer) · Special Classes (v0.11.0)

**Why Special Classes:** its own spreadsheet (`APS_SPECIAL_CLASSES_LIVE`, `…_ENROLLMENTS`), Admin-owned, small, and no
other Code.gs module reads it — so the database can never affect attendance, exams or classes.

## Stage 2 — read copy (this release)

- **Table:** `dbo.sheet_snapshot (book, sheet, time_zone, grid NVARCHAR(MAX) JSON, row_count, synced_at)` — one row per
  sheet, plus `__titles__` (the spreadsheet's sheet list). Created by the app on start (`IF OBJECT_ID … IS NULL CREATE`).
- **Copy:** on start and every `DB_SYNC_MINUTES` (default 5) the app copies the Special Classes sheets from Google
  Sheets, reads each copy back and compares the row counts (`src/db/sync.ts`). The spreadsheet ID and sheet name come
  from the copied Code.gs code itself (`scSpreadsheetId_`, `scSheetName_`) — the same Script Property / default as Apps Script.
- **Reads:** `getSpecialClasses` / `getSpecialClassesAdmin` run the SAME copied Code.gs readers; only the grid comes from
  the database (`src/db/dbData.ts`) when every sheet's copy is ≤ 15 minutes old. Older copy, database paused or
  unreachable → Google Sheets, automatically (one log line a minute at most). The page never breaks because of the database.
- **Owner:** still Apps Script (Admins edit Special Classes there or on the Apps Script sheet). Stage 3 moves ownership.
- **Sign-in:** the web app's managed identity (Entra ID) — **no password** (`authentication: azure-active-directory-default`).
- **Logs:** `[DB] Special Classes copied to Azure SQL — … rows; reads now come from the database.` / `[DB] … FAILED: <CODE> — <fix>`.

## Set up (once, Azure Portal)

1. **Create the database with the free offer:** portal → **Azure SQL** → **+ Create** → **SQL databases / Single database**.
   When the banner **"Want to try Azure SQL Database for free?" → Apply offer** shows, click it (the free offer: serverless,
   auto-pauses when the monthly free allowance is used — choose *Auto-pause the database until next month*).
   - Resource group `rg-aps-dashboard`; database name `aps-dashboard`.
   - **Server → Create new:** name e.g. `aps-dashboard-sql`, same region as the web app;
     **Authentication: Use Microsoft Entra-only authentication**; **Set admin** = your own account.
   - **Networking:** Public endpoint; **Allow Azure services and resources to access this server = Yes**; add your client IP
     only if you want the portal Query editor from your PC (the portal offers it).
   - Review → **Create**. Check the cost line says the free offer is applied before you create.
2. **Let the app in:** database → **Query editor** → sign in with Entra (your account) → run:
   ```sql
   CREATE USER [aps-dashboard-ap] FROM EXTERNAL PROVIDER;
   ALTER ROLE db_datareader ADD MEMBER [aps-dashboard-ap];
   ALTER ROLE db_datawriter ADD MEMBER [aps-dashboard-ap];
   ALTER ROLE db_ddladmin  ADD MEMBER [aps-dashboard-ap];   -- lets the app create its table on start
   ```
   (`aps-dashboard-ap` = the web app's system-assigned managed identity name; App Service → Identity must be **On**.)
3. **App settings** (App Service → Environment variables): `SQL_SERVER` = `aps-dashboard-sql.database.windows.net`,
   `SQL_DATABASE` = `aps-dashboard` → Apply → Restart.
4. **Log stream:** `[DB] Special Classes copied to Azure SQL — APS_SPECIAL_CLASSES_LIVE N rows, …`.

## Tests

`test/db.test.ts` (grid round trip with dates; sync + row-count check; DB-backed reads: fresh → database, stale /
failing / other sheets → Sheets; SQL client: managed identity, encrypted, parameterised only, idempotent create; error
explanations) and `test/classes.parity.test.ts` (Special Classes through the database copy = Code.gs for Admin and a
student; Sheets not read after the copy). `npm test` 55/55, `npm run e2e` 10/10.
**Not executed here:** the SQL statements against a real Azure SQL Database (no database in this test environment) —
the start-up log line proves them on the first deploy.

## Stage 3 — the database OWNS Special Classes (v0.13.0, Apps Script r134)

**What changes when switched on.** The programs sheet (`APS_SPECIAL_CLASSES_LIVE`) and the audit sheet
(`APS_SPECIAL_CLASSES_AUDIT`) live in Azure SQL table `dbo.owned_sheet` and nowhere else. Both dashboards read and save
them there, so they always show the same records. Enrollments stay a read copy, as in the pilot.

| | Before (default) | `SC_OWNER=azure` + `SPECIAL_CLASSES_OWNER=azure` |
|---|---|---|
| Azure reads programs | Read copy (≤ 15 min old) | `dbo.owned_sheet` (always current) |
| Azure + Add / Edit / Activate | Forwarded to Apps Script (write-through) | Run **on Azure** against the database |
| Apps Script reads programs | Google Sheet | Azure, through the reverse bridge (60 s cache) |
| Apps Script + Add / Edit / Activate | Writes the Sheet | Saved by Azure through the reverse bridge |
| Google Sheet | The owner | Untouched; the last copy before the switch |

**How a save runs on Azure.** The copied Code.gs functions `saveSpecialClass` / `setSpecialClassActive` run on Azure
themselves: same validation, Admin and read-only checks, `SC-YYYY-NNN` numbering, and audit rows with the person's
e-mail. They run against a writable in-memory copy of the two sheets (`src/gas/runtime.ts`: `SnapWorkbook` writable plus
`dirtySheets()`). `src/db/scOwner.ts` then stores each changed sheet with an **optimistic version check**:
`UPDATE … WHERE version = @v`, or `INSERT … WHERE NOT EXISTS` for a new sheet. Saves run one at a time in each process.
If another instance saved first, the version check fails and the Admin sees "Someone else changed Special Classes at the
same moment — please reload and save again." Nothing is ever written to Google.

**Table** (created on start when the owner is `azure`):
`dbo.owned_sheet(book, sheet, time_zone, grid NVARCHAR(MAX), row_count, version, updated_at, updated_by)`, with primary
key `(book, sheet)`. Cells are stored as grid JSON, the same format as the read copy: dates are stored as `{"$d": iso}`.

**Import.** On the first start with `SC_OWNER=azure`, Azure copies the programs and audit sheets from Google into
`dbo.owned_sheet` once. The log shows `[DB] Special Classes imported into Azure SQL and now OWNED there …`. On later
starts it shows `[DB] Special Classes are OWNED by Azure SQL … v<N>`. Saves and owned reads are refused until the import
has worked. A database problem is never answered with Google data for an owned sheet, because that data would be stale.
Instead Special Classes show "not available".

**Reverse bridge** (`src/api/bridge.ts`, `POST /api/bridge`). Apps Script → Azure, using the same secret as the forward
bridge. The signed text is `"gas." + ts + "." + nonce + "." + p`, so a request in one direction can never be replayed
in the other.

- Each request is accepted only within 5 minutes of `ts`, and each nonce works only once.
- Actions:
  - `scGrid`: returns the programs sheet.
  - `call`: runs `saveSpecialClass` or `setSpecialClassActive` only, for the given e-mail. **Azure works out the role
    itself** with the same rules as its sign-in.
- Refusal codes:
  - `NOT_OWNER`: Azure is not the owner.
  - `BAD_SIGNATURE`, `EXPIRED` or `REPLAY`: the request failed the security checks.
  - `NOT_READY`: the import has not finished yet.

**Apps Script side** (`AzureBridge.gs` r134, Code.gs hooks behind `typeof … === 'function'` guards):

- `scRecords_` → `scAzureOwnedRecords_`, parsed with the same `scParseRow_`.
- `saveSpecialClass` / `setSpecialClassActive` → `scAzureOwnedSave_`. The local Admin and read-only checks still run
  first.
- Loop guard: a save that arrived **from** Azure (session `via: 'azure'`) is refused with "owner settings disagree" and is
  never sent back to Azure.
- The Special Classes **settings** (Script Properties) are unchanged and still saved by Apps Script. The settings audit row
  still goes to the Sheet.

### Switch on (do both together, and make no Special Classes edits in between)

1. Azure App settings: `SC_OWNER` = `azure` → Apply → Restart. Log: `imported into Azure SQL and now OWNED there`.
2. Apps Script → Project Settings → Script Properties:
   - `AZURE_DASHBOARD_URL` = `https://aps-dashboard-ap.azurewebsites.net` (no trailing slash).
   - `SPECIAL_CLASSES_OWNER` = `azure`.
   - Then Deploy → Manage deployments → edit → **New version** (needed once, for r134).
3. Check: open Special Classes in both dashboards and confirm they show the same list. Edit one program in the Apps
   Script dashboard. Azure's log then shows `[SC owner] saveSpecialClass by … stored in Azure SQL`, and the change
   appears in Azure.

### Switch back (roll back)

1. Apps Script editor: run `ONE_TIME_scCopyAzureToSheet`. It copies Azure's programs into the Sheet.
2. Delete Script Property `SPECIAL_CLASSES_OWNER`.
3. Set Azure `SC_OWNER` to empty (or delete it) → Restart.

Audit rows made while Azure owned the programs stay in `dbo.owned_sheet`. Read them in the portal Query editor with
`SELECT grid FROM dbo.owned_sheet WHERE sheet = 'APS_SPECIAL_CLASSES_AUDIT'`.

### Tests (stage 3)

- `test/classes.parity.test.ts` "Database stage 3" runs real Code.gs in the Apps Script mock next to Azure:
  - Create, edit and deactivate give the same answers as Code.gs, and validation and read-only refusals are identical.
  - Audit rows are stored with the Admin's e-mail.
  - Google is never written.
  - Versions count up, and a lost race gives the conflict message.
  - Reverse bridge: `scGrid` and `call` work; replay, wrong secret, expired request, a forward-direction signature,
    other functions and non-APS e-mails are all refused; a non-Admin is refused by Azure's own role; `NOT_OWNER` when
    switched off.
- `test/db.test.ts` checks the owned store's version rules (memory and SQL text), and that owned reads never come from
  Google and are refused before the import.
- Apps Script `test/azurereverse.js` (8 checks) uses a fake Azure that verifies the signature:
  - Owner unset: unchanged behaviour.
  - Owner `azure`: reads and saves go to Azure, with the e-mail only and the Sheet untouched; Azure's messages pass
    through; students and BOD are refused locally.
  - Loop guard; Azure down or misconfigured shows the usual message; the secret is never logged; roll-back helper.

**Not executed here:** a real Azure SQL Database or a real Apps Script ↔ Azure call. The two log lines above prove them on
the first switch-on.


## Sessions table (v0.15.0)

`dbo.app_session` holds the Azure dashboard's sign-ins, as SHA-256 token hashes only. See `docs/PHASE3.md` step 3. To
sign everyone out of the Azure dashboard at once, run `DELETE FROM dbo.app_session;` in the Query editor and then
Restart.

## Chat table (v0.16.0)

`dbo.chat_message`: id, created_at, email, role, name, message, class_name. It is used only when `CHAT_OWNER=azure`; see
`docs/PHASE3.md` step 4. To read it: `SELECT TOP 50 created_at, name, message FROM dbo.chat_message ORDER BY id DESC;`

## Tables added in v0.17.0

- `dbo.live_props`: one row holding the copy of Apps Script's allow-listed live settings (`docs/PHASE3.md` step 6).
- `dbo.job_lease` and `dbo.job_run`: the job timetable's lease and run log (`docs/JOBS.md`). To see recent runs:
  `SELECT TOP 20 handler, started_at, finished_at, ok, summary FROM dbo.job_run ORDER BY id DESC;`

## Phase 5 step 1 (v0.18.0): whole-spreadsheet copies

`DB_COPY=main,attendance` copies every tab into `dbo.sheet_snapshot` and checks each copy. Results are counted per day in
`dbo.sheet_sync_log`. `DB_READS` switches reads to the copy. See `docs/PHASE5.md`.

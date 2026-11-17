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

## Next (stage 3)

Make the database the owner of the programs list: typed tables (`special_classes`, `special_class_audit`), Admin
Save / Activate write the database (with audit), the Apps Script Special Classes admin screen hands over to Azure.

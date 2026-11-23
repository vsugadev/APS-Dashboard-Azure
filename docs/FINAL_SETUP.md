# APS Dashboard on Azure: final setup (v0.17.0 + Apps Script r137)

*2026-11-19. This is one checklist for everything built so far: Phases 1–3 and Phase 4 step 1. Work through it top to
bottom. Every switch can be turned off again, and the Apps Script dashboard keeps working throughout.*

---

## 0. Deploy both sides (once)

**Apps Script** (APS-Classroom-Dashboard project):

1. Replace these files: **`Code.gs`** (r137), **`AzureBridge.gs`** (r137) and **`PortalBridge.gs`** (r135, if not yet
   done). `AzureBridgeSetup.gs` stays as it is.
2. Deploy → Manage deployments → ✏️ edit → **Version: New version** → Deploy. The /exec address stays the same.

**Azure** (APS-Dashboard-Azure folder):

```
git add -A
git commit -m "v0.17.0: live class status, settings copy, jobs on Azure's timetable"
git push
```

Wait for the green tick in GitHub Actions. The app restarts by itself. Check `https://aps-dashboard-ap.azurewebsites.net/healthz`: it must show the version you just pushed. **Deploy only this way.** Never deploy from another folder, a zip, or by re-running an older GitHub Actions run, because that replaces the current version with an old one.

---

## 1. Azure resources (should already be in place)

| Resource | Name | Check |
|---|---|---|
| Resource group | `rg-aps-dashboard` | |
| Web app (Linux, Node 22) | `aps-dashboard-ap` | Settings → Identity → System assigned: **On** |
| Key Vault | `kv-apsdashboardapu7zau2j` | Access: the web app's identity has **Key Vault Secrets User** |
| SQL server / database | `aps-dashboard-sql-ap01` / `aps-dashboard` | Server → Networking → **Allow Azure services and resources to access this server** ticked |
| Database user for the app | `aps-dashboard-ap` | Created once with the SQL below |

```sql
-- database aps-dashboard → Query editor (signed in with Entra), only if not done before
CREATE USER [aps-dashboard-ap] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [aps-dashboard-ap];
ALTER ROLE db_datawriter ADD MEMBER [aps-dashboard-ap];
ALTER ROLE db_ddladmin  ADD MEMBER [aps-dashboard-ap];   -- the app creates its tables itself
```

The app creates these tables on first use: `sheet_snapshot`, `owned_sheet`, `app_session`, `chat_message`,
`live_props`, `job_lease`, `job_run`.

---

## 2. Key Vault secrets

| Secret | Value |
|---|---|
| `google-oauth-client-id`, `google-oauth-client-secret` | Google sign-in client (Google Cloud console) |
| `google-service-account-json` | Service account key (reads the Google Sheets) |
| `apps-script-bridge-secret` | **Same value** as Apps Script Script Property `AZURE_BRIDGE_SECRET` (see `ONE_TIME_azureBridgeFingerprint`) |
| `superadmin-emails`, `admin-emails`, `headmaster-emails`, `bod-emails`, `on-call-coordinator-emails` | One line of JSON with double quotes, e.g. `["a@avvaiyarpadasalai.org","b@avvaiyarpadasalai.org"]` |
| `role-permissions-json` | Optional: role permissions as a JSON object (otherwise the Code.gs defaults apply) |

After changing a secret, open **App Service → Environment variables → Refresh**, then Restart. A plain restart can keep
the old value for up to 24 h.

---

## 3. Azure App settings (App Service → Environment variables)

| Setting | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `APS_DATA_MODE` | `sheets` | |
| `PUBLIC_BASE_URL` | `https://aps-dashboard-ap.azurewebsites.net` | |
| `DASHBOARD_HTML_PATH` | `public/Dashboard.html` | |
| `TARGET_SPREADSHEET_ID`, `ATTENDANCE_SPREADSHEET_ID` | (as now) | |
| `GOOGLE_IMPERSONATE_USER` | `info@avvaiyarpadasalai.org` | |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON` | `@Microsoft.KeyVault(SecretUri=…/secrets/<name>/)` | No version at the end |
| `SUPERADMIN_EMAILS`, `ADMIN_EMAILS`, `HEADMASTER_EMAILS`, `VCFO_AMCHATS_BOD_EMAILS`, `ON_CALL_COORDINATOR_EMAILS`, `ROLE_PERMISSIONS_JSON` | Key Vault references | Green "Key vault" tick |
| `APPS_SCRIPT_BRIDGE_URL` | The Apps Script `/exec` address | |
| `APPS_SCRIPT_BRIDGE_SECRET` | `@Microsoft.KeyVault(VaultName=kv-apsdashboardapu7zau2j;SecretName=apps-script-bridge-secret)` | |
| `SQL_SERVER` / `SQL_DATABASE` | `aps-dashboard-sql-ap01.database.windows.net` / `aps-dashboard` | |
| `SC_OWNER` | `azure` | ✅ already on |
| `CHAT_OWNER` | `azure` | Step 5.3 |
| `AZURE_JOBS` | Job names | Step 5.4 |
| *(optional)* `AZURE_CLASS_LIVE` | `off` | Only to turn off live class status (default on) |
| *(optional)* `AZURE_SESSION_STORE` | `memory` | Only to turn off lasting sign-ins |
| *(optional)* `AZURE_WRITE_THROUGH`, `AZURE_HEARTBEAT` | `off` | Only to turn those off |

---

## 4. Apps Script Script Properties (Project Settings → Script Properties)

| Property | Value | Purpose |
|---|---|---|
| `AZURE_BRIDGE_SECRET` | (made by `ONE_TIME_setAzureBridgeSecret`) | Signs both bridge directions |
| `AZURE_DASHBOARD_URL` | `https://aps-dashboard-ap.azurewebsites.net` | Where Apps Script calls Azure |
| `SPECIAL_CLASSES_OWNER` | `azure` | ✅ already on |
| `CHAT_OWNER` | `azure` | Step 5.3, together with Azure `CHAT_OWNER` |
| `APS_JOBS_ON_AZURE` | The same names as Azure `AZURE_JOBS` | Step 5.4 |

If the project has more than 50 properties, Project Settings can't add more. Ask for a one-time function that sets them.

---

## 5. Switch on, one module at a time

After each step, open **Log stream** and check the line shown.

### 5.1 Lasting sign-ins: already on (v0.15.0)

Log line: `[Sessions] sign-ins are kept in Azure SQL (dbo.app_session) …`. Test: sign in, Restart, refresh. You should
still be signed in.

### 5.2 Live Google Meet class status: on automatically after the deploy

There is nothing to set. During a class, an Azure class card shows the same live text as Apps Script, for example
"Teacher joined 6:31 PM · 12 students joined", and the green "in Meet" dots. If you see
`[Live] live Google Meet status not available … (BAD_REQUEST)`, deploy `AzureBridge.gs` r137.

### 5.3 Chat owned by Azure SQL

1. Azure: `CHAT_OWNER=azure` → Apply → Restart. Log line: `[Chat] chat is now OWNED by Azure SQL … N message(s) … copied`.
2. Apps Script: Script Property `CHAT_OWNER=azure`.
3. Test: post on Azure and see it in the Apps Script chat within about a minute. Then post on Apps Script and see it
   on Azure.

### 5.4 Jobs on Azure's timetable (Phase 4 step 1)

Move them in this order, one or two at a time, waiting a day between steps:

| Step | `AZURE_JOBS` **and** `APS_JOBS_ON_AZURE` |
|---|---|
| a | `processTemporaryTeacherAssignments,apsCoverageCleanup` |
| b | add `amScheduler` |
| c | add `apsWeeklyJobs` |
| d | add `processExamQuestionPaperAutoEmail` (outside an exam window) |

For each step:

1. Set the Azure setting first, then Apply → Restart. Log line: `[Jobs] on Azure's timetable: …`.
2. Set the Script Property to the same list.
3. Check `[Jobs] <name> ran on Azure's timetable: ok (N s)`, and in the database:
   `SELECT TOP 20 handler, started_at, ok, summary FROM dbo.job_run ORDER BY id DESC;`
4. In Apps Script → Executions, the job's own trigger runs now return `{ skipped: 'ON_AZURE' }`.

**Safety net:** if Azure misses a listed job (3 h; 30 min for the exam auto-email; 90 min for the clean-up), Apps Script
runs it again and logs `[AzureJobs] … running it here`.

### 5.6 Spreadsheet copies (Phase 5 step 1, v0.18.0)

1. Azure: `DB_COPY` = `main,attendance` → Apply. Log line: `[DB] Spreadsheet "main" copied to Azure SQL — … checked identical`.
2. After two weeks with no mismatches (queries in `docs/PHASE5.md`), set `DB_READS` = `main` → Apply.

### 5.7 Email sent by Azure (Phase 4 step 3, v0.19.0)

Google project: **APS Dashboard Azure** (not the `sys-…` Apps Script projects). Gmail API enabled; delegation entry
for the Azure Client ID includes `https://www.googleapis.com/auth/gmail.send` (§6).
1. Azure: `AZURE_MAIL` = `on`, `MAIL_TEST_TO` = your own APS address → Apply (restarts).
2. Log: `[Mail] Azure can send as donotreply@…` then `[Mail] test email sent to …`. Check the inbox.
3. **Delete `MAIL_TEST_TO`** → Apply. Leave `AZURE_MAIL=on`. No job sends from Azure yet. Details: `docs/MAIL.md`.

### 5.8 First email job on Azure (Phase 4 step 4, v0.20.0)

Needs §5.7 working. Apps Script: deploy `AzureBridge.gs` r139 (New version).
1. Preview: Azure `AZURE_MAIL_JOBS` = `MULTIPLE_CLASSROOM_REPORT`, `MAIL_JOBS_PREVIEW_TO` = your address → Apply. A `[AZURE PREVIEW]`
   copy arrives within minutes. Compare it with Monday's Apps Script email.
2. After one or two matching Mondays: Apps Script run `removeMultipleClassroomReportTrigger`; Azure delete `MAIL_JOBS_PREVIEW_TO`.
3. Back: Apps Script `createMultipleClassroomReportTrigger` (Azure stops by itself). Details: `docs/MAIL.md`.

### 5.10 Fixed-time jobs on Azure (Phase 4 step 2, v0.23.0)

Apps Script r141 first. Then add the names to both `APS_JOBS_ON_AZURE` (Apps Script) and `AZURE_TIMED_JOBS` (Azure), starting with the
4 daily syncs. Details and order: `docs/JOBS.md`.

### 5.11 Performance (v0.24.0, free)

App Service → Configuration → General settings: **Always On = On**, **HTTP version = 2.0**, **ARR affinity = Off** → Save.
Read the hourly `[Perf]` line. Details: `docs/PERFORMANCE.md`. (The region move is parked; see PERFORMANCE #8.)

v0.24.1 needs no setting. The app creates `dbo.app_state` itself (the app's `db_ddladmin` role already allows it). Optional, and
your decision: `DB_READS=main,attendance` makes screens read the verified Azure copy (PERFORMANCE #12).

### 5.9 Parallel run and cut-over (v0.21.0)

Follow `docs/CUTOVER.md`: Day 1 reconciliation (`RECONCILE_HOURS`), Day 2 test group (`PARALLEL_RUN=on`, `PARALLEL_RUN_USERS`),
Day 3 GO / NO-GO, rollback by area.

### 5.5 Settings copy: automatic

The `dbo.live_props` row refreshes every minute. To check:
`SELECT copied_at FROM dbo.live_props;` should show a time within the last couple of minutes.

---

## 6. Google Admin console: only for the next steps (not needed now)

These scopes are needed only when the remaining job bodies and the live Meet check are rewritten to run on Azure
itself. Today Azure only reads Google Sheets; everything else goes through Apps Script.

Admin console → Security → Access and data control → API controls → **Domain-wide delegation** → the Azure service
account's client ID → add the scopes:

| Needed for | Scopes |
|---|---|
| Live Meet status on Azure | `https://www.googleapis.com/auth/admin.reports.audit.readonly`, `https://www.googleapis.com/auth/meetings.space.readonly` |
| Emails from Azure (as donotreply@) — **needed now for v0.19.0** (§5.7) | `https://www.googleapis.com/auth/gmail.send` |
| Classroom jobs (sync, add / remove, announcements) | `https://www.googleapis.com/auth/classroom.courses.readonly`, `…/classroom.rosters`, `…/classroom.profile.emails`, `…/classroom.announcements`, `…/classroom.coursework.students` |
| Drive / Docs (backups, letters, question papers) | `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/documents` |
| Google profile names (badge) | `https://www.googleapis.com/auth/admin.directory.user.readonly` |

These mirror what the Apps Script project already uses (`appsscript.json`). Add them only when that step starts. Each
scope widens what the service account can do.

---

## 7. Switch back (per module)

| Module | Steps |
|---|---|
| Jobs (interval and fixed-time) | Remove the name from `APS_JOBS_ON_AZURE` first (Apps Script runs it at once), then from `AZURE_JOBS` → Restart |
| Chat | Run `ONE_TIME_chatCopyAzureToSheet` → delete `CHAT_OWNER` (Apps Script) → clear `CHAT_OWNER` (Azure) → Restart |
| Special Classes | Run `ONE_TIME_scCopyAzureToSheet` → delete `SPECIAL_CLASSES_OWNER` → clear `SC_OWNER` → Restart |
| Live class status | `AZURE_CLASS_LIVE=off` → Restart |
| Email from Azure | Clear `AZURE_MAIL` → Restart (Apps Script sends every email anyway) |
| Multiple Classrooms report | Apps Script `createMultipleClassroomReportTrigger` first (Azure stops at once), then clear `AZURE_MAIL_JOBS` |
| Sign-ins | `AZURE_SESSION_STORE=memory` → Restart |
| Everything on Azure | Users keep using the Apps Script dashboard, which has been production throughout |

---

## 8. Daily health check (2 minutes)

1. **Log stream** after the morning restart or deploy should show these lines: `[Sessions] …`, `[Google] Sheet check OK`,
   `[Live] Apps Script bridge OK`, `[DB] Special Classes are OWNED …`, `[Chat] chat is OWNED …` and
   `[Jobs] on Azure's timetable …`.
2. **Database:**
   `SELECT handler, MAX(started_at) AS last_run, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failures FROM dbo.job_run WHERE started_at > DATEADD(day, -1, SYSUTCDATETIME()) GROUP BY handler;`
3. **Apps Script → Executions:** no new failures from `doPost`.

## 9. What remains (from the implementation plan)

- **Phase 4 step 2:** follow the configured hour of the daily and weekly jobs. These are the daily syncs, Class
  Teacher Availability report, Mark-Complete reminder, daily and monthly summaries, Zoho daily sync, and
  Parent-Teacher Arranged coverage notices.
- **Phase 4 step 3:** rewrite the job bodies on Azure, which needs the §6 scopes. After that, the plan's gate applies to
  each job: two matching runs, then its Apps Script copy is turned off.
- **Phase 5:** the remaining sheets move to Azure SQL, one table at a time, with dual-write.
- **Phase 6:** parallel run, then go-live. The settings owner moves to Azure, starting from the §5.5 copy;
  namaps.org/dashboard switches to Azure; and Apps Script becomes read-only for 30 days.

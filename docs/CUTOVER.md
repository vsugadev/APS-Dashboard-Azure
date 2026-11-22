# Migration, parallel run and cut-over (v0.21.0, 2026-11-22)

This is the runbook for the next 2–3 days: data migration → validation → parallel run → reconciliation → cut-over.
All earlier rules still apply. Apps Script is the official system and the source of truth until the GO decision.

## 1. What "data migration" means in this project (decision, with reason)

The dashboard's data lives in Google: the main spreadsheet (every tab), the attendance spreadsheet, the Special Classes
spreadsheet, Script / User Properties, Drive files and Google Classroom.

| Option | 2–3 days? | Risk |
|---|---|---|
| **A. Azure becomes the primary *system*, Google stays the one data store** (Azure serves every screen, runs the jobs and sends the moved emails; every save runs the real Code.gs function through the signed bridge; verified copies of the sheets in Azure SQL) | Yes: all of it is built and tested | Low: one store, so nothing to merge back; rollback = point the link back |
| B. Move ownership of all 74 sheets to Azure SQL now | No | High: every Code.gs writer would need rewriting, with dual-write and two clean weeks per table (the plan's own rule) |

**Decision: A.** Ownership of individual tables moves later, one at a time, as the plan says.

Already owned by Azure SQL, with a tested copy-back for rollback:

- Special Classes (`SC_OWNER`)
- Chat (`CHAT_OWNER`)
- Sign-in sessions
- Job and email records

## 2. Source → target mapping

| Source (Google, source of truth) | Identifier | Target (Azure SQL) | Transformation | Validation |
|---|---|---|---|---|
| Main spreadsheet: every tab (discovered each run; `DB_COPY_EXCLUDE`) | book + tab name; rows keep sheet order | `dbo.sheet_snapshot` (one row per tab: the whole grid) | none (dates stored as `{"$d": ISO}` and read back as dates) | read-back hash after every copy (`dbo.sheet_sync_log`) **+ record-level reconciliation** (`dbo.reconcile_run`, §3) |
| Attendance spreadsheet: every tab | same | same | same | same |
| Special Classes programs + audit | sheet rows; `version` | `dbo.owned_sheet` (Azure = **owner**) | none | imported once; saves are optimistic-versioned; rollback = `ONE_TIME_scCopyAzureToSheet` |
| Chat (`Dashboard_Chat_Window`, last 10 days) | message id | `dbo.chat_message` (Azure = **owner**) | the same 6 columns | rollback = `ONE_TIME_chatCopyAzureToSheet` |
| Script / User Properties (allow-listed, no secrets) | key | `dbo.live_props` (copy, every minute) | none | Apps Script stays owner until go-live |
| Weekly-job and email state | job + week (`MULTI_CLASSROOM_REPORT_LAST_WEEK`, `APS_WEEKLY_JOBS_STATE`) | `dbo.job_run`, `dbo.job_lease`, `dbo.mail_job` | Azure keeps its own run records; **Apps Script keeps the official record** (audit rows, "last sent") | `mailJob check` before each send |
| Drive files, Google Classroom | Drive / course ids | not copied (they stay in Google) | — | — |

Existing identifiers are kept everywhere (Request_ID, Ticket_Number, course id, APS e-mail, week id). No new identity
scheme was introduced.

## 3. Reconciliation (`RECONCILE_HOURS`, default 6)

For every copied tab: SOURCE_COUNT, TARGET_COUNT, MATCH, MISSING_IN_TARGET, EXTRA_IN_TARGET, DIFFERENT_VALUES (same key,
different cells), DUPLICATES (same key twice, in the source and in the target) and ERRORS.

- Every cell of every row is compared, not just the counts. The key is the first identifier-like column that is unique (…ID, Email, Request_ID, Ticket_Number …).
- The copy is read first, then the sheet. A tab that differs is checked again right after a fresh copy, and only differences that **persist** are reported. An edit made between the copy and the check is not a migration error.
- The log shows one line per spreadsheet:
  `[Reconcile] "main" 52 tabs: SOURCE 18233 · TARGET 18233 · MATCH 18233 · MISSING 0 · EXTRA 0 · DIFFERENT 0 · DUPLICATE KEYS src/target 0/0 · ERRORS 0 — IDENTICAL`
- Details go to `dbo.reconcile_run`, with sheet row **numbers** only (never names or e-mails):

```sql
-- latest result per tab, problems first
WITH x AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY book, tab ORDER BY run_at DESC) n FROM dbo.reconcile_run)
SELECT book, tab, key_column, source_count, target_count, match_count, missing_in_target, extra_in_target, different_values,
       duplicates_source, duplicates_target, errors, confirmed, samples, run_at
FROM x WHERE n = 1 ORDER BY (missing_in_target + extra_in_target + different_values + errors) DESC, book, tab;
```

**DUPLICATES in the source** are data-quality findings in the Google Sheet itself, for example the same Request_ID twice. Report them; they are not caused by Azure.

## 4. Progression: existing settings only, no new framework

| Stage | Azure app settings | Apps Script | Who uses what |
|---|---|---|---|
| EXISTING_ONLY | `PARALLEL_RUN` off; no job/mail switches | as today | everyone → Apps Script |
| **PARALLEL_RUN** | `PARALLEL_RUN=on`, `SHADOW_SAMPLE=20`, `PARALLEL_RUN_USERS=admin,superadmin,headmaster,<named testers>`, `DB_COPY=main,attendance`, `DB_SYNC_MINUTES=5`, `RECONCILE_HOURS=6`, `AZURE_MAIL=on`, `AZURE_MAIL_JOBS=MULTIPLE_CLASSROOM_REPORT` + `MAIL_JOBS_PREVIEW_TO` | unchanged (official) | test group uses both; differences reported with the bar's button |
| AZURE_PRIMARY | clear `PARALLEL_RUN_USERS` and `PARALLEL_RUN`; `AZURE_TIMED_JOBS` = the 12 fixed-time jobs (+ `APS_JOBS_ON_AZURE`); `MAIL_JOBS_PREVIEW_TO` removed (Azure sends) | `removeMultipleClassroomReportTrigger`; Apps Script web app stays deployed | namaps.org/dashboard and the APS Gate → Azure URL |
| AZURE_PRIMARY + FALLBACK | as above | kept deployed and working for 30 days (plan) | if needed, the link points back (§6) |

A session made before `PARALLEL_RUN_USERS` changes is re-checked on every call. Narrowing the group takes effect at once.

## 5. Parallel run (Day 2): what is compared, and how

| Area | Method | Where to look |
|---|---|---|
| **Real requests (automatic)** | **Shadow comparison (v0.22.0):** with `SHADOW_SAMPLE=20`, 1 in 5 read-screen calls by the people using Azure is also run in Apps Script for the same person and input (`AzureBridge.gs` r140) and compared: MATCH / DIFFERENT (paths) / ERROR, plus both sides' time. A difference is re-checked after 90 s and reported only if it persists. 63 read screens without side effects (checked by a test over Code.gs); at most 1 per screen per 2 min and `SHADOW_DAILY_CAP` (400) a day. Expected differences can be excluded with `SHADOW_IGNORE` (a pattern of result paths) | `[Shadow]` lines (each difference + an hourly summary with average times), `dbo.shadow_compare` |
| Data | §3 reconciliation; read screens on Azure use the copied Code.gs readers over the same data | `[Reconcile]` lines, `dbo.reconcile_run` |
| Screens / behaviour | the test group uses both dashboards and presses **Report a difference** (screen + text; who and role come from the session) | `SELECT * FROM dbo.parallel_feedback ORDER BY id DESC;` (set `status`: NEW / EXPECTED / FIXED / BLOCKER) |
| Saves | one implementation (the real Code.gs function runs in Apps Script for the person), so a save cannot differ in data; compare the toast and the screen afterwards | feedback + Apps Script audit sheets |
| Emails | the Multiple Classrooms preview (`[AZURE PREVIEW]`) vs Apps Script's email to admin@; byte-for-byte equality is already tested | mailbox; `dbo.mail_job` |
| Jobs | jobs on Azure's timetable run the real Code.gs job; check every run's result | `dbo.job_run` (ok = 1), Apps Script audit sheets |
| Errors | every failure has a log line with what / when / which job or tab, never secrets | App Service log stream; Apps Script Executions |
| Performance | page open and refresh times on Azure vs Apps Script, from the test group's reports; plus App Service metrics (CPU, response time) and the database's compute use | Azure portal |

```sql
-- shadow comparison: per screen, last 24 h
SELECT fn, COUNT(*) compared, SUM(CASE WHEN result='MATCH' THEN 1 ELSE 0 END) match_count, SUM(CASE WHEN result='DIFFERENT' THEN 1 ELSE 0 END) different,
       SUM(CASE WHEN result='ERROR' THEN 1 ELSE 0 END) errors, AVG(azure_ms) azure_ms, AVG(apps_script_ms) apps_script_ms
FROM dbo.shadow_compare WHERE compared_at > DATEADD(day, -1, SYSUTCDATETIME()) GROUP BY fn ORDER BY different + errors DESC;
-- the differences themselves (paths, never values)
SELECT TOP 50 compared_at, fn, role, result, diffs, paths, note FROM dbo.shadow_compare WHERE result <> 'MATCH' ORDER BY id DESC;
```

**Not shadow-compared, and why:** the class cards (`getDashboardData`) and the realtime check write caches and triggers in
Apps Script. Running them twice would change Apps Script's own state. Their logic is the copied Code.gs, compared by the
parity tests, and the test group compares them by eye and reports differences. The other screens left out are
`getDirectoryIndex`, `getClassTeacherAvailabilityView` (it writes an audit), the three screens that use Google profile names,
`getExamQuestionPaperMonitoring`, and `getDashboardRolePermissions` (Azure's comes from Key Vault on purpose).

**Email checklist** (compare the Monday preview with Apps Script's email):

- Sender `APS Dashboard Tickets <donotreply@…>`.
- To: admin@ (the `ATTENDANCE_MAIL_ADMIN_CC` setting). No CC or BCC; Code.gs sends none for this job.
- Reply-To: admin@.
- Subject.
- Student list and "require review" count.
- The "ACCESS APS DASHBOARD" link goes to the live dashboard /exec.
- No attachments; this job has none.
- Timing: Monday from 07:00 New York.
- Exactly one email per week.

## 6. Rollback, by area

| Area | Rollback | Why it is safe |
|---|---|---|
| Users | point namaps.org/dashboard / APS Gate back to the Apps Script /exec; optionally set `PARALLEL_RUN_USERS=admin` to close Azure | Apps Script never stopped working |
| Data (sheets) | nothing to do | Google remained the only store for these; Azure SQL holds copies |
| Special Classes / Chat | `ONE_TIME_scCopyAzureToSheet` / `ONE_TIME_chatCopyAzureToSheet`, then clear the owner switches on both sides | tested copy-back; one owner at a time |
| Saves | nothing to do | every save always ran in Apps Script |
| Jobs | remove names from `APS_JOBS_ON_AZURE` (Apps Script runs them at once), then from `AZURE_JOBS` | the gate guarantees one runner; Apps Script also takes over automatically when Azure misses a job |
| Emails | `createMultipleClassroomReportTrigger` | Azure stops by itself (it sends only while Apps Script has the job off); the week already sent is recorded in Apps Script, so it is not sent twice |
| Configuration | revert the app settings in §4 | no code change needed |

## 7. Three days

| Day | Do | Done when |
|---|---|---|
| **1: migrate + validate** | deploy v0.21.0; `DB_COPY=main,attendance`, `DB_SYNC_MINUTES=5`, `RECONCILE_HOURS=6`; read the `[Reconcile]` lines and `[ParallelRun] readiness`; investigate every non-zero MISSING / EXTRA / DIFFERENT / ERROR | every tab IDENTICAL, or each difference explained; readiness has no unexpected CHECK |
| **2: parallel run** | `PARALLEL_RUN=on` + test group; HM/VP/admin use both dashboards for real work; triage `dbo.parallel_feedback` twice a day; keep reconciling; fix P0/P1 | no open BLOCKER/HIGH; `dbo.job_run` all ok; email preview matches |
| **3: readiness** | final reconciliation; error / retry / duplicate checks (§8); security checks (§9); rollback rehearsal (move the link back and forth once) | GO / GO WITH KNOWN DIFFERENCES / NO-GO recorded |

## 8. Duplicate and retry protection

All of these are covered by automated tests (`npm test`).

| Risk | Protection |
|---|---|
| A job runs twice | `dbo.job_lease` (one slot per interval across instances) + the Apps Script gate (Azure's run or the trigger, never both) |
| An email is sent twice | one owner (`mailJob check offHere`) + `dbo.mail_job` claim per week (primary key) + Apps Script "last sent" week; an interrupted send is not retried (UNKNOWN), because a second email is worse than none |
| A save runs twice | the browser sends it once; the bridge's nonce is single-use; Code.gs functions keep their own locks and validation |
| A retry repeats an action | failed sends: 3 tries, each recorded; recording in Apps Script is retried but never re-sends; a retried record writes nothing |
| A copy duplicates rows | each copy replaces the tab's stored grid (by book + tab); reconciliation counts duplicate keys |

## 9. Security checks before GO

- **Sign-in:** Google, APS domains only (`APS_ALLOWED_DOMAINS`). A personal Gmail is refused; test it once.
- **Roles:** decided on the server (role lists in Key Vault, configured roles, rosters). The browser's role or e-mail is never trusted. The test group is checked on every call.
- **Secrets:** OAuth client, service-account key, bridge secret and SQL are Key Vault references. Nothing is in code, logs or the page. Rotate the Zoho keys that appeared in a screenshot.
- **Google:** one service account (project APS Dashboard Azure) with domain-wide delegation, scopes limited to Sheets read and `gmail.send` for now.
- **Database (check):** SQL server networking should be `Allow Azure services` plus only the admin IPs you deliberately added (remove old ones). Check the backup retention on the database.
- **Environments:** `APS_ENVIRONMENT=TESTING` on a test copy sends every email to info@ only (TEST guard).

## 10. Issue classes and the GO decision

Classify every finding as **BLOCKER**, **HIGH**, **MEDIUM**, **LOW** or **EXPECTED DIFFERENCE**. Record it in `dbo.parallel_feedback.status`, or in a list kept with this runbook.

- **GO:** no BLOCKER/HIGH, all reconciliations IDENTICAL or explained, jobs and emails matching, rollback rehearsed.
- **GO WITH KNOWN DIFFERENCES:** only MEDIUM/LOW/EXPECTED remain, each written down.
- **NO-GO:** otherwise.

Known expected differences so far:

- **Live Google Meet status.** Azure shows Apps Script's own result. If Apps Script doesn't answer within 5 minutes, Azure falls back to the schedule, the same as Apps Script without Meet data.
- **Multiple Classrooms audit row.** It shows "Azure weekly job" as Requested_By.

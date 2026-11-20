# Phase 4 — scheduled jobs on Azure

*Step 1: v0.17.0 / Apps Script r137, 2026-11-19.*

## Step 1: Azure owns the timetable of the repeating jobs

Azure decides **when** a job runs. The job itself still runs in Apps Script, exactly as from its trigger (signed bridge
action `job`), until it is rewritten on Azure. This step covers only the jobs that decide for themselves what is due, so
running one at a slightly different minute changes nothing:

| Handler (Apps Script) | Every | What it covers |
|---|---|---|
| `apsWeeklyJobs` | 60 min | The 7 weekly jobs: backup and audit archive, multiple-classroom report, grading help report, student absence, class consolidation analysis and email, Teacher Appreciation |
| `amScheduler` | 60 min | Assignment Monitoring reminders and summaries |
| `processTemporaryTeacherAssignments` | 60 min | Temp Teacher add / remove |
| `apsCoverageCleanup` | 30 min | Class Coverage clean-up |
| `processExamQuestionPaperAutoEmail` | 5 min | Exam question paper auto-email and Teacher Copy email (a Promise answer, collected) |

**How it works:**

- **One run per interval across all App Service instances:** a lease row per job in `dbo.job_lease`.
- **Every run is recorded:** `dbo.job_run` holds start, end, ok and a short summary. This is the evidence for the
  plan's gate, "each job ran twice on Azure with matching emails and rows".
- **Waiting:** runs are server to server, so Azure waits up to 380 s for a job (Apps Script's limit is 6 minutes).
- **Apps Script side** (`AzureBridge.gs` r137, plus a gate in Code.gs `apsRequireTriggerCall_` and five one-line handler
  guards):
  - A job is run for Azure **only** if it's listed in Script Property `APS_JOBS_ON_AZURE`. Otherwise Azure gets
    `NOT_ON_AZURE`, so it can never run a job Apps Script still runs.
  - The listed job's own trigger then does nothing ("ON_AZURE"). No triggers are deleted.
  - **Safety net:** if Azure hasn't run a listed job for 3 hours (30 min for the exam auto-email, 90 min for the
    clean-up), the Apps Script trigger runs it again and logs why. A job never stops because one side is misconfigured or
    down.
  - A browser can't fake an Azure run, and a trigger id is always checked against the project's real triggers.

**Switch on (per job):**

1. Azure App settings: `AZURE_JOBS` = the handler names, for example `amScheduler,processTemporaryTeacherAssignments`
   → Apply → Restart. The log shows `[Jobs] on Azure's timetable: …`.
2. Apps Script Script Property `APS_JOBS_ON_AZURE` = **the same names**.
3. Check `[Jobs] <handler> ran on Azure's timetable: ok (N s)` in the log, and in the database:
   `SELECT TOP 20 handler, started_at, ok, summary FROM dbo.job_run ORDER BY id DESC;`

Suggested order: start with `processTemporaryTeacherAssignments` and `apsCoverageCleanup` (quiet, idempotent). Then
`amScheduler` and `apsWeeklyJobs`. The exam auto-email last, outside an exam window.

**Switch back:** remove the name from `APS_JOBS_ON_AZURE` first (Apps Script runs it again at once), then from
`AZURE_JOBS`.

## Not yet moved (they keep their Apps Script triggers)

These jobs run **at a configured hour**, and the hour is stored in Apps Script settings:

- The daily Classroom / attendance syncs and the Meet link auto-map.
- The Class Teacher Availability report.
- The Mark-Complete reminder.
- The daily and monthly summaries.
- The Zoho daily sync.
- The Parent-Teacher Arranged coverage notices (weekly).
- The legacy attendance triggers.

**Step 2:** an Apps Script action that reports each job's configured time, so Azure can follow it.

**Step 3:** the job bodies are rewritten on Azure one by one. This needs the service account to be allowed to send mail
as `donotreply@` (Gmail API) and to use Classroom, Drive and the Admin Reports API. Those scopes are added in the Google
Admin console; see `docs/FINAL_SETUP.md` §6.

**Tests:**

- `test/jobs.test.ts`: the `AZURE_JOBS` list; each job runs once per interval; two instances never run the same slot; a
  running job isn't started again; runs are recorded; SQL lease and tables; the real Apps Script gate (Azure run,
  `NOT_ON_AZURE`, the trigger skips, take-over after a missed run, fakes refused, the Promise job collected).
- Apps Script `test/azurejobs.js` (4 checks).

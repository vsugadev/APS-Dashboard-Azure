# Email sent by Azure (Phase 4 step 3, v0.19.0)

Azure sends email **From donotreply@** through the **Gmail API**, the same way Apps Script does today
(`Code.gs apsGmailSend_('TICKETS')`, service-account mode). Code: `src/mail/gmailSender.ts`.

## How it signs in

- Service account: the one in `GOOGLE_SERVICE_ACCOUNT_JSON` (Google Cloud project **APS Dashboard Azure**,
  `aps-dashboard-azure`). Its key ID matches the Key Vault secret.
- It acts **as the From mailbox** (`MAIL_FROM`) with domain-wide delegation and **only** the scope
  `https://www.googleapis.com/auth/gmail.send`.
- The Apps Script projects (**APS School - Live Dashboard**, **APS Classroom Dashboard TEST**, both `sys-…`) are
  not used or changed.

## One-time Google set-up

1. Cloud console, project **APS Dashboard Azure**: APIs & Services → **Gmail API → Enable**. (Done 2026-11-21.)
2. IAM & Admin → Service Accounts → the Azure account → copy the **Unique ID** (Client ID).
3. admin.google.com → Security → Access and data control → API controls → **Manage Domain Wide Delegation** → the
   entry for that Client ID → add `https://www.googleapis.com/auth/gmail.send` (keep the scopes already there,
   comma-separated) → Authorize. A change can take from minutes up to 24 hours.
4. `donotreply@avvaiyarpadasalai.org` must be an **active user mailbox** (a group or alias cannot be impersonated).

## App settings

| Setting | Value | Meaning |
|---|---|---|
| `AZURE_MAIL` | `on` | Turns the mail sender on (default off: nothing here runs) |
| `MAIL_FROM` | optional | Default `donotreply@avvaiyarpadasalai.org` (= Code.gs `TICKET_MAIL_FROM` default) |
| `MAIL_DISPLAY_NAME` | optional | Default `APS Dashboard Tickets` (= Code.gs profile TICKETS) |
| `MAIL_TEST_TO` | one APS address | At start-up, one test email is sent there. **Remove it after the test**, or it is sent again on every restart |
| `TEST_EMAIL_MODE`, `TEST_EMAIL_REDIRECT_TO`, `TEST_EMAIL_DAILY_CAP` | optional | Only with `APS_ENVIRONMENT=TESTING`: same TEST guard as Code.gs (redirect to info@, `[TEST ENVIRONMENT]`, banner, cap 30/day; `OFF` = nothing sent) |

## What the log says

| Line | Meaning / fix |
|---|---|
| `[Mail] Azure can send as donotreply@… — no job sends from Azure yet.` | Sign-in works. Nothing was sent |
| `[Mail] test email sent to … — remove MAIL_TEST_TO now.` | The test email went out; check the inbox (and Spam) |
| `… unauthorized_client …` | The delegation entry for the Azure Client ID lacks `gmail.send`, or it hasn't taken effect yet (wait, then restart) |
| `… invalid_grant …` | `MAIL_FROM` isn't an active user mailbox, or the key was deleted |
| `… Gmail API HTTP 403` | Gmail API not enabled in project **APS Dashboard Azure**, or the mailbox can't send |

## Limits

Gmail's daily sending limit is **per mailbox** (about 2,000/day on Workspace). Apps Script and Azure both send as
donotreply@, so they share it. Each email job will run on only one side at a time (like the job switches), so the total
doesn't grow.

## Email jobs sent by Azure (v0.20.0)

| Job | When | To |
|---|---|---|
| `MULTIPLE_CLASSROOM_REPORT`: Students Assigned to Multiple Google Classrooms | Monday from 07:00 New York (within 24 h, up to 3 tries, skipped on school leave) | admin@ (`ATTENDANCE_MAIL_ADMIN_CC`) |

The email is built by the same Code.gs functions (`admcBuild_`, `admcEmail_`, copied word for word; a test compares
the result with Apps Script's byte for byte). Code: `src/mail/mailJobs.ts`. Apps Script: `AzureBridge.gs` r139.

| Setting | Value | Meaning |
|---|---|---|
| `AZURE_MAIL_JOBS` | `MULTIPLE_CLASSROOM_REPORT` | The job runs on Azure (needs `AZURE_MAIL=on`, Azure SQL and the bridge) |
| `MAIL_JOBS_PREVIEW_TO` | one APS address | **Preview:** Apps Script keeps sending the real email; Azure sends one `[AZURE PREVIEW]` copy per week to this address only. Remove it to make Azure the sender |

**Steps:**

1. **Preview.** Set `AZURE_MAIL_JOBS=MULTIPLE_CLASSROOM_REPORT` and `MAIL_JOBS_PREVIEW_TO=<you>`. A preview of this week arrives
   within minutes, then one each Monday. Compare it with Apps Script's email to admin@: subject, the list of students,
   the "require review" count.
2. **Owner.** Apps Script editor: run `removeMultipleClassroomReportTrigger` (switches the job off in apsWeeklyJobs). Azure:
   delete `MAIL_JOBS_PREVIEW_TO` → Apply. From the next Monday 07:00 Azure sends it, and the dashboard's audit log shows the row
   "Azure weekly job".
3. **Back.** Apps Script: run `createMultipleClassroomReportTrigger`. Azure stops by itself, because it sends only while Apps Script
   has the job off. Then clear `AZURE_MAIL_JOBS`.

**Never twice:**

- One owner: Azure asks Apps Script first and sends only when the job is off there and that week isn't recorded.
- One row per week in `dbo.mail_job` is claimed before sending, so two instances can't both send.
- A send interrupted half-way is **not** repeated. The log says to check admin@'s inbox.
- Apps Script records the result: the "last sent" week and the audit row.

| Log line | Meaning |
|---|---|
| `[MailJobs] … PREVIEW sent to …` | Preview mode worked |
| `[MailJobs] … is still ON in Apps Script — Azure does NOT send it` | Owner mode, but step 2 in Apps Script isn't done |
| `[MailJobs] … email sent by Azure to admin@ (N students, M require review)` | Azure sent the real email |
| `[MailJobs] … result not recorded in Apps Script yet` | Retried every 10 min; never re-sent |

`SELECT * FROM dbo.mail_job ORDER BY updated_at DESC;` shows every week's status.

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

## Not yet

No job sends through Azure in v0.19.0. Next: the first email job on Azure (one weekly email), with its own switch and the
same idempotency log as Code.gs, so a job can never send twice.

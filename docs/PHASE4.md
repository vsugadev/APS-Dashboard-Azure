# Phase 4 — Writes from the Azure dashboard

**Principle:** while Apps Script is production, Azure never writes Apps Script's stores (Script / User Properties,
Sheets written by Code.gs) itself. A Save on Azure is sent through the signed bridge and the **real Code.gs function**
runs in Apps Script for the signed-in person. One implementation, the same checks, the same audit — and nothing to
merge back at cut-over.

## Step 1 — Admin settings saves (v0.10.0, 2026-11-17)

**Functions (same names and arguments as `google.script.run`; `WRITE_THROUGH` in `src/api/endpoints/writes.ts` =
`AZURE_BRIDGE_CALLS_` in Apps Script `AzureBridge.gs` r132 — the test fails if they differ):**
`saveAccessControl`, `saveAssignmentMonitoringConfig`, `saveMissingGradingConfig`, `saveMarkCompleteSettings`,
`saveTeacherAppreciationConfig`, `setTeacherAppreciationEmails`, `saveSpecialClassesSettings`, `saveTicketSettings`,
`setExamQuestionPaperDefaults`, `setExamQuestionPaperAutoEmail`, `setRosterHiddenStaffVisible`.

**How (one Save):**
```
Azure page → POST /api/run/<name> → requireSession (Azure session)
   → bridgeCall { action:'call', v:1, fn:<name>, args:[…without the token], email:<session e-mail> }  (HMAC, 5-min, single use)
   → AzureBridge.gs azureBridgeCall_: fn in AZURE_BRIDGE_CALLS_? APS e-mail? role = getViewerRoleForEmail_(email) — decided
     by Apps Script, never by Azure → temporary session (2 min, removed after) → Code.gs <name>(token, …args)
   → { value } / { error: the function's own message } → Azure returns it to the page (same toast as Apps Script)
   → Azure refreshes its cached reads (live snapshot, Sheets) so the page shows the change.
```
**Not included (on purpose):** `saveDashboardRolePermissions`, `saveDashboardUserRole` — Azure keeps role lists and role
permissions in Key Vault (`AZURE_SETTING_KEYS`); saving them in Apps Script would not change Azure. Everything that
sends email, touches Classroom / Drive / Zoho, or returns a Promise comes in later steps.

**Switch:** App setting `AZURE_WRITE_THROUGH=off` → those Saves answer "not on Azure yet" again.

**Security:** the bridge secret (Key Vault + Script Property) now also authorises running these 11 functions for an APS
account. Azure sends only its verified session e-mail; Apps Script re-checks the domain and works out the role itself;
every function keeps its own Admin / Access Control / read-only checks and writes its audit with the person's e-mail.

**Tests:** `test/live.test.ts` — real Code.gs + PortalBridge.gs + AzureBridge.gs: Admin's Save written by the real
function; a teacher whose Azure session claims "admin" is refused by Apps Script; validation messages reach the page;
unlisted functions and non-APS accounts refused at the bridge; no temporary session left; switch off → old answer; no
session → nothing sent; lists identical. `npm test` 49/49, `npm run e2e` 10/10.

**Deploy:** Apps Script `AzureBridge.gs` r132 → Deploy → New version; Azure v0.10.0 via GitHub Actions.


## Step 2 — teacher class-card actions + Special Classes owner (v0.13.0, Apps Script r134, 2026-11-18)

**Teacher class-card actions (write-through):** `setLiveStatus`, `setTeacherNotInClassStage`, `setNeedsTechSupportStage`,
`setTeacherAvailabilityStatus` and `setClassStatusManual` were added to `WRITE_THROUGH` and `AZURE_BRIDGE_CALLS_` (the
two lists are tested to be identical). A teacher's **Mark Live**, **Teacher NOT in Class**, **Needs Tech Support**,
availability or class status pressed on Azure runs the real Code.gs function in Apps Script. Apps Script works out the
teacher's role itself, so a teacher can change only their own classes, exactly as before. Azure's live snapshot is then
refreshed, so the card changes at once.

**Special Classes:** `saveSpecialClass` and `setSpecialClassActive` are also on both lists. While Apps Script owns them,
they are forwarded like the others. With `SC_OWNER=azure` they run on Azure against Azure SQL; see
`docs/DATABASE.md` "Stage 3".

**Deploy:** Apps Script `AzureBridge.gs` + `Code.gs` r134 → Deploy → New version. Azure v0.13.0 is deployed through
GitHub Actions.


## Step 3 — every remaining dashboard action (v0.14.0, Apps Script r135, 2026-11-19)

**Result:** every function the dashboard page calls is now answered on Azure. There are no more "not on Azure yet"
messages, and a test checks this against `Dashboard.html` and `Code.gs`. 73 functions were added: 69 to `WRITE_THROUGH`
and 4 to `READ_THROUGH` (`getChatMessages`, `getMyExamQuestionPapers`, `getWeeklyPanelData`, `resolveTicketStudent`).
Each one runs the real Code.gs function in Apps Script for the signed-in person, with the same rules as before: Apps
Script decides the role, the function's own checks apply, and its audit carries the person's e-mail.

**One function is kept on Azure on purpose:** `saveDashboardRolePermissions`. Azure enforces role permissions from Key
Vault (`ROLE_PERMISSIONS_JSON`), so a save in Apps Script would not change what Azure enforces. Azure refuses this save
and tells the Admin how to change role permissions.

**New in the bridge:**

- **Promise answers** (question paper preview, download, Teacher Copy and send; PDF stamping):
  - Apps Script answers `{ pending: job }` straight away and finishes the work in the same execution. Its time-driven
    trigger already depends on Apps Script doing this.
  - It keeps the result for 10 minutes in CacheService, in 90 000-character pieces (up to about 27 MB).
  - Azure collects the result every 1.5 s with the signed action `result`. Only the same person can collect a result,
    and only once.
  - The temporary session stays valid until the Promise finishes.
- **Uploads:**
  - Ticket attachments and question paper PDFs travel as base64.
  - Size limits:
    - Azure `/api/run`: 25 MB.
    - Upload actions (`UPLOAD_FNS`): 24 MB.
    - Other actions: 1 MB.
    - A call to Apps Script: 25 MB. Every other bridge action stays at 100 000 characters.
  - `PortalBridge.gs` `doPost` accepts large bodies only when they start with `{"azure":1`. The Parent Portal limit
    stays at 200 000.
- **Long actions:** backups, syncs, batch sends and Zoho steps. Azure's front door ends a browser request after about
  230 s, so Azure stops waiting at 220 s and tells the person the action is still running in the APS Dashboard. Apps
  Script continues for up to 6 minutes and completes the action. Temporary sessions now last 7 minutes.
- **Cache refresh:** after an action, Azure refreshes its live snapshot. It also refreshes its Sheets cache, except
  after light, frequent actions (`LIGHT_FNS`: country, Meet join click, review prompt, login notice, chat post, PDF
  downloads and similar).

**Deploy:** Apps Script `AzureBridge.gs` + `PortalBridge.gs` r135 → Deploy → New version. Then Azure v0.14.0 through
GitHub Actions.

**Tests** (`test/live.test.ts`, real Code.gs + PortalBridge.gs + AzureBridge.gs):

- A Promise result is collected through pieces (1.2 MB) and the function still has its session when it finishes.
- A rejected Promise gives its message.
- `result`: someone else's job is refused, a result can be collected only once, and a malformed job id is refused.
- A 3 MB ticket attachment arrives intact; a 1.1 MB non-upload action is refused; large non-call bodies are refused.
- Role permissions are refused with the message; the time-out message is shown.
- Every function the page calls is registered.

`npm test` 62/62.

**Not executed:** real PDF stamping inside a doPost on Google's servers (only the Promise mechanism is tested), and real
uploads close to the size limits.

## Step 3 — Email sent by Azure (v0.19.0, 2026-11-21)

Azure now has its own mail sender, From donotreply@, using the Gmail API and the service account of the Google Cloud
project **APS Dashboard Azure** (domain-wide delegation, `gmail.send` only). It is the same transport, MIME and TEST
guard as Code.gs `apsGmailSend_` (the test runs the real Code.gs function and compares the message byte for byte).
Switched on with `AZURE_MAIL=on`; the start-up check signs in without sending; `MAIL_TEST_TO` sends one test email.
**No job sends from Azure yet** — Apps Script still sends every email. Set-up and log lines: `docs/MAIL.md`.
`npm test` 88/88 (6 new in `test/mail.test.ts`).


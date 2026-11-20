# Phase 3 — Live data from Apps Script's Script / User Properties

**Decision 2026-11-11:** "Apps Script read export". Apps Script stays production and keeps writing its live data; the
Azure dashboard reads the SAME data through one signed, read-only request to the live Apps Script web app. Both
dashboards therefore always show the same online dots, last logins, class status and banners.

## Step 1 — Apps Script live-data bridge (v0.8.0, 2026-11-11)

### How it works

```
Azure request ──► AppsScriptLiveSource (src/live/liveSource.ts)
                     │  cached 20 s, one fetch shared by concurrent requests,
                     │  last good snapshot kept up to 5 min if a refresh fails, then empty
                     ▼
   POST https://script.google.com/macros/s/…/exec   { azure:1, p, ts, nonce, sig }
                     │  sig = HMAC-SHA256(secret, ts.nonce.p) — Key Vault apps-script-bridge-secret
                     ▼        = Script Property AZURE_BRIDGE_SECRET
   PortalBridge.gs doPost ──► AzureBridge.gs azureBridgeDoPost_ (r122)
                     │  verify signature / 5-min window / single-use nonce
                     ▼
   allow-listed Script Properties + User Properties (deploying account's second store)
                     │
                     ▼
   filtered AGAIN on Azure (src/live/allowlist.ts) ──► runtime PropertiesService
```

- **Runtime** (`src/gas/runtime.ts`): Script Properties = Apps Script's live Script Properties *under* the App Service
  settings (a value set on Azure always wins); User Properties = the deploying account's User Properties.
  A write by the copied code (best-effort caches such as the onboarded list or the class "started" mark) stays in that
  request only — nothing is sent back to Apps Script or Google.
- **The Code.gs passes themselves now run on Azure** (copied by `gen-gas-scope`, feature `live`):
  `applyRosterHiddenStaffFilter_`, `applyLivePresence_`, `applyLastLogin_`, `applyStudentOnboardedFlag_`,
  `applyClassStatus_`, `getOnCallTeachers_`, `getRosterHiddenStaffVisible_` and the realtime poll
  `getRealtimeStatusSnapshot`. The Phase 2 stand-ins (`liveEmptyPasses`) are gone.
- **Generator:** property writes are now allowed in copied code (request-local, see above); a top-level var is copied
  with the statements that fill it in (`var APC_KEYS_ = {}; APC_KEYS_[…] = 'll';` — without them compact last-login
  data could not be read).

### What is now on Azure

| Part | Source (Apps Script) |
|---|---|
| Online now (green dot), online since | `presenceMap` (User / Script Properties) |
| Last login (GC / GM / DB) | `lastLoginMap` |
| Onboarded students (Student Onboarding Status) | `onboardedStudents` |
| Manual class status (Cancelled / Rescheduled) and the "started" mark | `classStatusMap`, `classStartedMarkMap` |
| On-call teacher banner | `onCallTeachers_v1` |
| Hide / Show staff toggle (roster filter) | `rosterHiddenStaffVisible_v1` |
| Realtime poll: live / Teacher NOT in Class / Needs Tech Support flags, weekly availability, Meet / Classroom activity | `liveMap`, `teacherNotInClassMap`, `needsTechSupportMap`, `teacherAvailabilityRealtimeMap`, `externalActivityRealtimeMap` |
| Attendance sync status / diagnostics, last sync / error | `attendanceLastSyncSummary_v1`, `attendanceSyncDiagnostic_v1`, `lastSync`, `lastSyncError` |
| Settings admins save from the dashboard (Assignment Monitoring, Missing Grading, Zoho job status, approver lists, …) | their Script Properties |

### Never sent / Azure's own

- **Secrets** — refused by exact name (`NEVER_KEYS`) and by pattern (`NEVER_RE`: SECRET, TOKEN, PASSWORD, PRIVATE,
  CREDENTIAL, SERVICE_ACCOUNT, API_KEY, CLIENT_ID, OAUTH, REFRESH, NONCE, SESSION), on both sides.
- **Azure's own values** (`AZURE_SETTING_KEYS`): role lists, `dashboardRolePermissions_v1` (Key Vault
  `role-permissions-json`), `APS_ENVIRONMENT`, spreadsheet IDs. Fixed in this step: the copied code now also gets
  `TARGET_SPREADSHEET_ID` and the role permissions from Azure's settings (before, `getCacheSheetUrl` returned nothing
  and copied screens used default role permissions).
- **Unlisted keys** are never sent. `test/classes.parity.test.ts` records every property the copied code reads in the
  parity tests and fails if one is in no list; `test/live.test.ts` fails if the Apps Script and Azure lists differ.

### Still not on Azure

| Part | Why | When |
|---|---|---|
| Live Google Meet status on class cards ("In class now" from Meet), class-card live box | Meet REST / Admin Reports APIs under a script lock, kept in Apps Script's cache | with the Google API phase |
| Chat | Gmail / chat store | later (chat version is a constant on Azure, so the page never reloads it) |
| `mailReady` flags on Coverage / Removal screens | mail credentials never leave Apps Script; Azure sends no email | write phase |

### Settings to add (once)

1. **Apps Script** (live project): add file `AzureBridge.gs`, apply the one-line `doPost` change in `PortalBridge.gs`,
   Script Property `AZURE_BRIDGE_SECRET`, then **Deploy → Manage deployments → edit → New version** (same /exec URL).
2. **Azure:** Key Vault secret `apps-script-bridge-secret` (same value), App settings `APPS_SCRIPT_BRIDGE_URL` (the
   /exec address) and `APPS_SCRIPT_BRIDGE_SECRET` (Key Vault reference). Commands: guide §3.
3. Log on start: `[Live] Apps Script bridge OK — N Script + M User Properties (allow-listed).`

### Tests

- `test/live.test.ts` (5): the real Code.gs + PortalBridge.gs + AzureBridge.gs in the Apps Script mock, called through
  Azure's live source: only allow-listed keys from both stores (secrets, role lists, sessions, unlisted keys absent —
  also in the raw Apps Script answer); replay / wrong secret / stale / malformed / unknown action refused; short or
  unset secret → NOT_CONFIGURED; Parent Portal path unchanged; no Portal log row; nothing changed in Apps Script; lists
  identical. Live source: one shared fetch, 20-s cache, 5-min fallback, then empty; no secret or response body in logs.
- Parity (`test/classes.parity.test.ts`): Classes view and Active Directory with real live data (people online, last
  logins, an onboarded student, a cancelled class, an on-call teacher) and the realtime poll for 7 viewers — each part
  asserted to appear; all earlier Phase 2 parity tests now run with realistic settings (plain APS_… names only) plus
  the live snapshot. Property classification test.
- Browser: the page shows the teacher who is online in the live snapshot, and the realtime poll answers from Azure.
- `npm test` 41 pass; browser 10 pass.

## Step 1b — Apps Script r123–r126 copied (v0.8.1, 2026-11-16)

- `npm run sync-gas` from the Apps Script project (r126) → `gas-source/` (Code.gs, Dashboard.html; `SNAPSHOT.json`), `npm run sync-dashboard` → `public/Dashboard.html`, `npm run gen-gas` → `src/gas/scope.generated.ts`. `gas-source/test/` refreshed with the r126 regression suite; `docs/reference/` Help Guide + architecture doc refreshed.
- Generator (`tools/gen-gas-scope.js`): `examQpTeacherCopyLeadOk_` removed (gone in r123); added `examQpTeacherCopyOpenMinutes_`, `examQpTeacherCopyEmailEnabled_`, `examQpSendOpenMinutes_`, `examQpMinutesLabel_` and the constant `EXAM_QP_BATCH_`; `examQpDownloadKey_` is now Azure-provided.
- **Download Key of emailed students (r125):** an HMAC with Script Property `EXAM_QP_DOWNLOAD_KEY_SECRET` (NEVER list — never leaves Apps Script). `src/gas/runtime.ts` provides `examQpDownloadKey_ → ''`, so Azure's Students list shows no key for a student who was only emailed (keys of Dashboard downloads come from the download log and still show). Sharing the secret through Key Vault would be a separate, explicit decision.
- **Allow-lists (both copies):** `EXAM_QP_TEACHER_COPY_OPEN_MINUTES`, `EXAM_QP_TEACHER_COPY_EMAIL_ENABLED`, `EXAM_QP_SEND_TO_STUDENT_OPEN_MINUTES` (r123 Admin settings — the copied monitoring reads them). `EXAM_QP_BATCH_EMAIL_REQUESTS` (r125) is not exported: Azure sends no email. ⚠️ Apps Script must deploy the updated `AzureBridge.gs` (**r127**) — until then Azure uses the defaults (3 h / ON), which is what the school uses today.
- Not on Azure (unchanged): the student download (r126 one-click), Teacher Copy, Send to Student, Send to all Eligible and every email — they stay on Apps Script.
- Tests: `npm test` 42/42 (new: emailed key never computed on Azure; r123 settings live, secret and batch queue never exported); `npm run e2e` 10/10; `npm run test:gas` exam suites (qp 32, qp_autoemail 12, teachercopy 18, exam, ui_qp 17, ui_exam 21, e2e) pass on the new `gas-source/`.

## Step 2 — Heartbeat from the Azure dashboard (v0.9.0, 2026-11-17)

**Goal:** a person using the Azure dashboard shows 🟢 online and gets a Last Login (DB) exactly as on Apps Script — needed before anyone can switch.

- **Same triggers as Code.gs:** `getDashboardData` (page load + 5-minute refresh) and `recordDashboardSignOff` (tab hidden / closed; now registered on Azure). Only the **session** e-mail is used, never a browser argument.
- **Azure (`src/live/heartbeat.ts`, `BridgeHeartbeat`):** queues e-mails, sends one signed batch every 15 s (`bridgeCall`, shared with the snapshot), each person at most once a minute (sign-off always); up to 200 per call, 2 000 queued; a failed batch is kept and sent with the next one; `BAD_REQUEST` (Apps Script older than r131) pauses heartbeats 10 minutes with one log line. App setting **`AZURE_HEARTBEAT=off`** disables it (`NoopHeartbeat`); also off when the bridge is not configured or in fixture mode.
- **Apps Script (`AzureBridge.gs` r131):** second action `heartbeat` — the ONLY write through the bridge. `azureBridgeHeartbeats_`: APS-domain e-mails only (`isApsEmailAllowed_`), de-duplicated, ≤ 200; one script lock (5 s; busy → `{busy:true}`, Azure retries) and one write per store for the batch — the same records as `recordHeartbeat_`: `presenceMap` (lastSeen; loginAt kept within `PRESENCE_ONLINE_WINDOW_MINUTES`; entries older than 24 h dropped) and the Last Login `db` slot (only moved forward). Request size limit 2 000 → 20 000 characters (`AZURE_BRIDGE_MAX_P_`).
- **Seen on Azure:** the person's own dot appears after the next batch (≤ 15 s) and snapshot refresh (≤ 20 s) — the next realtime poll; Apps Script shows them at once on its next read.
- **Deploy:** Apps Script `AzureBridge.gs` r131 → Deploy → New version (same /exec). Azure v0.9.0 via GitHub Actions. Either order works (Azure pauses heartbeats until r131 answers).
- **Tests:** `test/live.test.ts` — real Code.gs + PortalBridge.gs + AzureBridge.gs: signed batch records presence + Last Login (APS only; same spell keeps login time; >24 h dropped; nothing else written; wrong secret refused; ≤ 200); sender: throttle, sign-off forced, retry, pause on old Apps Script, no e-mail / secret in logs. `test/api.test.ts` — `getDashboardData` / `recordDashboardSignOff` use the session e-mail only. `npm test` 47/47, `npm run e2e` 10/10.



## Step 3 — lasting sign-ins: sessions in Azure SQL (v0.15.0, 2026-11-19)

**Why:** sessions used to live only in the app's memory. Every restart or deploy signed everyone out of the Azure
dashboard, and a second App Service instance could not see the first instance's sign-ins. The plan said "Redis";
Azure SQL (already set up, free) does the same job at this size, at no extra cost.

**How** (`src/auth/sqlSessions.ts`, used when `SQL_SERVER` and `SQL_DATABASE` are set):

- Table `dbo.app_session`, created by the app: `token_hash CHAR(64) PK, email, role, issued_at, expires_at`. It holds
  only the **SHA-256 of the token**, so someone who can read the table cannot sign in as anyone.
- The model is unchanged and matches Code.gs: random token → { email, role, issuedAt }, valid
  `SESSION_TTL_SECONDS` (6 h) from sign-in. The browser still holds only the token.
- Reads are served from memory. A token this instance hasn't seen (after a restart, or created on the other instance)
  is looked up in the database once. A token the database doesn't know is not looked up again for 30 s.
- **The database never blocks a sign-in.** A write waits at most 3 s and otherwise finishes in the background. If the
  database is down, the session still works on this server, and the log shows one line per minute:
  `[Sessions] a sign-in could not be … in Azure SQL …`. It never contains e-mails or tokens. A failed look-up means
  "sign in again", never an error page.
- Sign-out deletes the session from memory and from the database. Expired rows are deleted every hour.
- Start-up log: `[Sessions] sign-ins are kept in Azure SQL (dbo.app_session) — restarts and deploys no longer sign
  people out.`
- App setting `AZURE_SESSION_STORE=memory` goes back to memory-only sessions.

**Permissions:** none new. The app already has `db_datawriter` and `db_ddladmin` from the database pilot.

**Tests:** `test/sessions.test.ts`, 5 tests:

- Survives a restart and reaches a second instance; only the hash is stored; looked up once; expires after 6 h.
- Sign-out works everywhere; unknown tokens are throttled.
- Slow or failing database: sign-in is not delayed, the session works locally, and the log line has no e-mail or token.
- Hourly clean-up deletes expired rows.
- SQL: the table is created once; queries are parameterised only.

`npm test` 67/67, `npm run e2e` 10/10. The e2e example of a function that isn't on Azure is now an imaginary name,
because since v0.14.0 every real function is on Azure.

**Not executed here:** against the real Azure SQL. The start-up log line above, and staying signed in across the next
Restart, prove it.


## Step 4 — chat owned by Azure SQL (v0.16.0, Apps Script r136, 2026-11-19)

**What changes when you switch it on.** The chat lives in Azure SQL table `dbo.chat_message` instead of the
`Dashboard_Chat_Window` sheet. Both dashboards read and post there, so everyone sees one conversation. The switches are
Azure app setting `CHAT_OWNER=azure` and Apps Script Script Property `CHAT_OWNER=azure`. Leave both unset to keep the
chat exactly as before.

**Azure** (`src/db/chatOwner.ts`, `src/db/chatStore.ts`):

- `getChatMessages` and `postChatMessage` answer like Code.gs:
  - The same message fields: timestamp, email, role, name, message, className.
  - The newest 200 messages of the last 10 days.
  - Messages are trimmed and cut at 2 000 characters, and the error messages are the same.
  - The display name and class name come from the copied `chatDisplayName_` / `findClassNamesForViewer_`.
- **Chat version** (what makes open pages reload the chat): `v<newest id>.<oldest id>`.
  - It's refreshed every 10 s and straight after a post.
  - Azure's realtime poll now carries it, so on Azure the chat badge and new messages update by themselves. Until now
    Azure's version was always empty.
- After a post on Azure, Azure tells Apps Script with the signed forward action `chatChanged`. Apps Script then clears
  its chat cache and mints a new version straight away.
- Messages older than 10 days are deleted hourly.
- **First start:** the sheet's messages from the last 10 days are copied in once, and only when the table is empty.
  The log shows `[Chat] chat is now OWNED by Azure SQL … N message(s) … copied`.

**Reverse bridge** (`/api/bridge`, same signing as Special Classes):

- New action `chatList` `{ email }`, and `call` now also accepts `postChatMessage`.
- Azure works out the person's role itself, and only an APS e-mail is accepted.
- Each module has its own owner check: `NOT_OWNER` comes back when Azure isn't the owner of **that** module.

**Apps Script** (`AzureBridge.gs` r136, plus two guarded hooks in Code.gs `getChatMessages` / `postChatMessage`):

- `chatAzureList_` asks Azure for the list and keeps it in the usual `CHAT_CACHE_KEY_` cache.
- `chatAzurePost_` posts through Azure, then calls `chatChanged_()`.
- The forward action `chatChanged` is accepted only when signed.
- Loop guard: a post that arrived from Azure is refused ("owner settings disagree").
- `ONE_TIME_chatCopyAzureToSheet` is the roll-back helper.

### Switch on (both together)

1. Azure App settings: `CHAT_OWNER` = `azure` → Apply → Restart. The log shows `[Chat] chat is now OWNED by Azure SQL …`.
2. Apps Script: deploy `Code.gs` + `AzureBridge.gs` r136 (Deploy → New version), then Script Property `CHAT_OWNER` = `azure`.
   `AZURE_DASHBOARD_URL` is already set from Special Classes.
3. Check: post on one dashboard and see the message on the other. On Apps Script it can take until its next realtime
   poll (about 45–90 s).

**Switch back:**

1. Run `ONE_TIME_chatCopyAzureToSheet`.
2. Delete Script Property `CHAT_OWNER`.
3. Clear Azure `CHAT_OWNER` and Restart.

**Tests:**

- `test/classes.parity.test.ts` "Phase 3 step 4" (real Code.gs in the mock):
  - The same post through Code.gs and through Azure gives the same name, class name, role and trimmed message, for an
    Admin and for a student.
  - The list has the same fields; the copy is made once and only the last 10 days are copied.
  - The version changes after a post, Apps Script is told after each post, and the realtime snapshot carries the version.
  - The empty-message and 2 000-character rules match.
  - Reverse bridge: `chatList` and `postChatMessage` work; a non-APS e-mail is refused; `NOT_OWNER` when switched off;
    Special Classes ownership stays separate.
- `test/chat.test.ts`:
  - The import runs only when the table is empty; the newest 200 are shown; pruning works; the version changes.
  - Database down shows "not available".
  - SQL: the table is created once and values only go in as parameters.
- Apps Script `test/chatazure.js`, 6 checks:
  - Owner unset: unchanged behaviour.
  - Owner `azure`: the list and posts go to Azure (e-mail only) and the sheet is untouched; Azure's messages pass through.
  - A signed `chatChanged` clears the cache and changes the version; an unsigned one is refused.
  - Loop guard; Azure down shows the message; the secret is never logged; roll-back helper.

`npm test` 70/70.

**Not executed:** the real Azure SQL and a real Apps Script ↔ Azure call. The `[Chat]` log line and a test post prove them.


## Step 5 — live Google Meet class status on Azure (v0.17.0, Apps Script r137)

**Why:** class cards on Azure only showed the schedule-based status. The live status needs the Meet audit log and Meet
REST APIs, which the Azure service account isn't approved for yet.

**How:**

- Azure asks Apps Script for the **result**: signed bridge action `classLive`, about once every 30 s for the whole app,
  not per person (`src/live/classLive.ts`).
- For each class whose live status applies right now, Apps Script returns the `{ code, detail }` that its own
  `classMeetApplyLive_` produces, plus who is in that class's Meet.
- The copied Code.gs `applyClassStatus_` uses this exactly where Code.gs uses its own (runtime `classMeetApplyLive_`).
  So the label, colour, "Teacher joined 6:31 PM · 12 students joined" and the green "in Meet" dots match the Apps Script
  dashboard.
- Manual Cancelled / Rescheduled still win, as in Code.gs.
- If the bridge fails, Azure keeps the last answer for up to 5 minutes, then falls back to the schedule-based status
  (as before). It logs `[Live] live Google Meet status not available …` at most every 5 minutes.
- App setting `AZURE_CLASS_LIVE=off` turns this off.
- Native later: when the service account gets the Meet / Admin Reports scopes, `classMeetLiveSnapshot_` can run on Azure
  itself (same runtime hook).

**Tests:** `test/classlive.test.ts`:

- The source asks once per 30 s, keeps a stale answer for at most 5 minutes, drops bad entries, and logs at most every
  5 minutes.
- `applyClassLive` follows the same contract as Code.gs.
- The copied `applyClassStatus_` with Apps Script's result gives the code, detail, label, colour and in-Meet dots; without
  it, the result is as before.
- The real AzureBridge.gs `classLive` action is signed, skips manual Cancelled, and never forces a refresh.

## Step 6 — settings copy in Azure SQL (v0.17.0)

**Decision: Apps Script keeps owning the live settings until go-live.** These are the Script / User Properties: online
now, last login, Live / TNIC / NTS, class status overrides and toggles. Apps Script reads and writes them on every
dashboard visit. Moving the owner now would mean an Apps Script → Azure call per visit, far over Apps Script's daily
UrlFetch quota. The owner moves in Phase 6, when Apps Script stops serving people.

**What v0.17.0 adds** (`src/db/liveMirror.ts`, table `dbo.live_props`): Azure keeps a **copy**.

- After a good bridge snapshot, at most once a minute, it stores the allow-listed snapshot: only what the bridge already
  sends, never a secret.
- After a restart while Apps Script isn't answering, Azure starts from that copy (up to 30 minutes old) instead of showing
  nobody online. The log says
  `[Live] Apps Script bridge failed after a restart — using the settings copy from Azure SQL (N min old)`.
- At go-live, this copy is the starting data of the Azure-owned settings.

**Tests:** `test/classlive.test.ts`, "settings copy":

- Saved at most once a minute; only allow-listed keys are stored.
- Used after a restart only when 30 minutes old or less.
- SQL: the table is created once; values are parameters.

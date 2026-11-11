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
| Heartbeat from Azure page loads (Azure users appear online / last login "DB") | a write | write phase |
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

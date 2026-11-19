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

# Phase 2 — Read-only screens over the Sheets API

**Plan:** move the read-only screens one at a time; Google Sheets stay the source; Apps Script stays live.
**Decision 2026-11-11:** "Sheets only now" — data Apps Script keeps in Script / User Properties (live presence,
last login, class status overrides, live Meet status, onboarded flags, on-call directory, Hide/Show toggle) is sent
empty on Azure until Phase 3 moves those stores.

## Step 1 — Classes view (v0.2.0, 2026-11-11)

| Function (same name as Code.gs) | What Azure returns |
|---|---|
| `getDashboardData` | Class cards and rosters for the signed-in viewer: who sees which classes (Admin/HM/BOD all; teacher own + VP/HM classes with the "Class Support" label; student own), hidden-staff filter, APSIDs, class schedule and **automatic** class status (Scheduled / Yet to Start / Class Ended), card Status box, Nilai and class-time filters, name order, header fields (badge name, APSID, Class Support role, On-Call Coordinator label, Access Control tab switches, permissions, environment). Read-only — Azure writes nothing (no heartbeat, no marks). |
| `getMyCountryPreference` | Same answer as Code.gs ("has a default"), so the sign-in **Continue** button works on Azure. |

**Same rules, not retyped:** `tools/gen-gas-helpers.js` copies 23 pure helper functions and 13 constants word for
word from `gas-source/Code.gs` into `src/gas/classes.generated.ts` (it refuses any function that calls an Apps
Script service). `npm test` fails if the generated file is out of date → after `npm run sync-gas` run `npm run gen-gas`.

**Tests:** `test/classes.parity.test.ts` runs Code.gs `getDashboardData` in the Apps Script mock (r58 coverage
fixture: 7 classes, 75 people) and compares the full Azure payload for 7 viewers (Admin, HM, BOD, VP teacher,
teacher, student, authorized) — same classes, same order, every card field, minus the parts listed below.
Browser check: the real Dashboard.html signs in on Azure, passes Continue, and shows the class cards.

**Optional app settings** (same names as the Script Properties; unset = Code.gs default):
`ROSTER_HIDDEN_STAFF_ADDITIONAL_EMAILS`, `APS_GRADING_TEAM_EMAILS`, `APS_CLASSES_ALWAYS_SHOW_EMAILS`,
`APS_ENVIRONMENT`, `APS_COUNTRY_FEATURE`.

### Not on Azure yet (Code.gs "nothing set" values meanwhile)

| Part | Source | When |
|---|---|---|
| Teacher availability on the card (`teacherAvailabilityStatus`) | Teacher_Weekly_Availability sheet | next step |
| WhatsApp group links, Google Meet links | WhatsApp_Group_Links, Course_Meet_Link_Map sheets | next step |
| School Leave banner | APS_SCHOOL_LEAVES sheet | next step |
| Temporary Class Coverage banner, Temp Teacher note, those tabs' access | Temporary_Class_Coverage, TEMP_TEACHER_ASSIGNMENTS sheets | next step |
| Country flags | USER_COUNTRY sheet | next step |
| Assignment Monitoring tab access; Examination / Grading access | their modules | later in Phase 2 |
| Online now, last login, onboarded, manual class status, live Meet status, card Status box during class, on-call banner, Hide/Show | Script / User Properties | Phase 3 |
| Admin / HM badge name from the Google profile | Admin Directory API | later (scope not approved yet) |

### Still Apps Script only

Everything that changes data, and every other tab — the page shows "not on Azure yet" for those calls.

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

## Step 2 — Classes view: Sheet-based parts (v0.3.0, 2026-11-11)

Now on the cards and in the header, exactly as Code.gs: **teacher availability** (Teacher_Weekly_Availability),
**WhatsApp group links** (WhatsApp_Group_Links), **Google Meet links** (Course_Meet_Link_Map + detected links in the
Attendance spreadsheet, else the Classroom link), **country flags** + sign-in country preference (USER_COUNTRY),
**Temporary Class Coverage** banner and tab access (Temporary_Class_Coverage), **Temp Teacher** card note and tab access
(TEMP_TEACHER_ASSIGNMENTS), **School Leave** banner (APS_SCHOOL_LEAVES).

**How — the Code.gs readers themselves, read-only:** `tools/gen-gas-scope.js` copies 58 Code.gs reader functions
(+ 27 constants) word for word into `src/gas/scope.generated.ts`; they run in `src/gas/runtime.ts`, a **read-only
Apps Script runtime**: each sheet is read whole through the Sheets API (one call per sheet, cached 60 s) and given
to the copied code with Apps Script's value types (numbers, text, true/false, `''`, and **Date** for date cells, in the
spreadsheet's time zone). Any write to an existing sheet or to a setting fails (`READ_ONLY`); a sheet that does not
exist is only "created" in memory for that request. The generator stops if the copied code uses any name that is
neither copied nor provided, or calls Classroom / Gmail / Drive / triggers / locks / setProperty.

**Setting to add on Azure (once):** `ATTENDANCE_SPREADSHEET_ID` = the Script Property of the same name (without it
the Meet links come from Google Classroom only). The account in `GOOGLE_IMPERSONATE_USER` must be able to open it.

**Tests:** the parity test now fills the Sheets with real rows (availability, WhatsApp, USER_COUNTRY, approved school
leave with date cells, coverage merged today, temp teacher active now) and checks every card field and the header
against Code.gs for 7 viewers — and that each of those parts really appeared. `test/runtime.test.ts`: no writes,
date conversion (EST/EDT/India), settings never include secrets.

## Step 3 — Teacher Availability (v0.4.0, 2026-11-11)

`getClassTeacherAvailabilityView` — Classes → Teacher Availability: the teacher's own week (Nilai, times, status,
classrooms) and the Admin / HM / BOD weekly report, built by the Code.gs function itself (98 functions + 58 constants
copied by `gen-gas-scope`; new sheets in the snapshot: Teacher_Availability_Selection, Dashboard_User_Roles).
**Read-only on Azure:** `canSubmit` and `canSendTest` are false (Save / Send test email stay in Apps Script).
The copied code's school-leave audit row is not written on Azure (Code.gs already treats it as best effort).

Also: the generator now indexes top-level `const` / `let` (a `const` used by the copied code was missed before —
caught by the parity test); the date shim supports every Java pattern the copied code uses (tested); the runtime
refuses to read a sheet that exists but was not in the snapshot list, so a reader can never silently see "empty".

Tests: parity for teacher (own saved week), Admin, HM, BOD reports and the student refusal (same message); browser
check calls the endpoint through the page's `google.script.run`. `npm test` 30 pass; browser 6 pass.

## Step 4 — Active Directory (v0.5.0, 2026-11-11)

`getDirectoryIndex` — Active Directory → Directory Search: every class's teachers and students, **role-tiered on the
server** exactly as Code.gs (copied function): FULL tier (Admin, Super Admin, HM, BOD, Teacher) gets name, APSID,
APS email, Classroom link, online, last login, onboarded; BASIC tier (Student, Authorized) gets names, grades and
classes, teachers' emails, only their OWN email / APSID, Classroom links only for their own classes.
**Student Onboarding Status** needs no server call of its own (built in the browser from the Classes data).

The Code.gs live-data passes (`applyRosterHiddenStaffFilter_`, `applyLivePresence_`, `applyLastLogin_`,
`applyStudentOnboardedFlag_`) are now ONE shared Azure implementation (`liveEmptyPasses` in `classes.ts`) used by the
Classes view and by every copied endpoint, so both screens always agree. Onboarded on Azure = online now (what Code.gs
marks on a fresh map); the stored onboarded list arrives with Phase 3.

Tests: parity for Admin, HM, BOD, teacher (full tier) and student, authorized (basic tier; no other student's email
appears). `npm test` 31 pass; browser 7 pass.

## Step 5 — Attendance tab (v0.6.0, 2026-11-11)

The seven Attendance reads, each the copied Code.gs function with its own role checks (148 functions now copied):
`getAttendanceWeekOptions`, `getAttendanceCourseAwkMap`, `getAttendanceRecordsForViewer`, `getOnCallTeacherAttendance`,
`getAttendanceAuditLog`, `getAttendanceSyncDiagnostics`, `getAttendanceLastSyncInfo`.

**Read-only:** every record comes back `editable: false` (editing stays in Apps Script; the edit / sync calls are not on
Azure). Sync status and sync diagnostics are kept by Apps Script in Script Properties → empty on Azure until Phase 3.

**Sheets loaded on demand** (`src/gas/run.ts`): weekly attendance lives in one sheet per week (`AWKnnATT`), so a fixed
sheet list cannot work. The runner starts with the usual sheets; when the copied code opens a sheet, or calls the
**Sheets advanced service** (`Sheets.Spreadsheets.Values.batchGet`, which Code.gs uses for the week sheets), the need
is recorded — even when Code.gs catches the error and falls back — the first need is loaded, and the code runs again
(safe: it only reads; at most 30 loads). `Sheets.batchGet` is answered by the real Sheets API `values:batchGet` with
the same options (UNFORMATTED_VALUE, SERIAL_NUMBER), only for the two APS spreadsheets. The generator now also refuses
any Apps Script service the runtime does not provide, and parses regex literals correctly.

Tests: two real weekly sheets (some Date cells), Attendance_Summary and Attendance_Audit_Log; 10 calls × 7 viewers
compared with Code.gs (records, filters by week / class / "mine", on-call teachers, audit log, refusals); the week
sheets were fetched through batchGet with Code.gs's exact ranges. Loader tests: a swallowed need is still loaded;
a source that never delivers fails clearly. `npm test` 33 pass; browser 8 pass.

**Performance note:** each request reads the needed sheets (cached 60 s per sheet). A week sheet read through
`values:batchGet` is light; whole-sheet snapshots (`includeGridData`) are heavier — fine for now, to revisit with
Azure SQL in Phase 5.

### Not on Azure yet (Code.gs "nothing set" values meanwhile)

| Part | Source | When |
|---|---|---|
| Assignment Monitoring tab access; Examination / Grading access | their modules | later in Phase 2 |
| Attendance sync status / diagnostics; editing attendance | Script Properties / writes | Phase 3 / write phase |
| Online now (heartbeat), last login, stored onboarded list, manual class status, live Meet status, card Status box during class, on-call banner, Hide/Show | Script / User Properties | Phase 3 |
| Admin / HM badge name from the Google profile | Admin Directory API | later (scope not approved yet) |

### Still Apps Script only

Everything that changes data, and every other tab — the page shows "not on Azure yet" for those calls.

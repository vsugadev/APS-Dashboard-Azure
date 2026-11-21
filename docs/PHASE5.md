# Phase 5: data to Azure SQL

## Step 1: verified copy of the spreadsheets, with a per-book read switch (v0.18.0, 2026-11-21)

**Why this step first.** Most saves do more than write rows: tickets and leave send emails, question papers live in
Drive, and coverage and roster changes touch Google Classroom. Azure can't do those itself until the Phase 4 step 3
permissions exist, so Azure SQL can't be the *owner* of those tables yet. This step builds the plan's dual-write stage:
an exact copy of every table in Azure SQL, checked after every copy, with a daily record of clean and differing checks.
That record is the plan's gate, "two clean weeks per table". Reads move to the copy book by book.

**What it does** (`src/db/start.ts` `startCopies`, `src/db/sync.ts`, `src/db/dbData.ts`):

- **What is copied:** for the books in `DB_COPY` (`main` and/or `attendance`), every tab is copied into
  `dbo.sheet_snapshot` every `DB_SYNC_MINUTES` (default 5). New tabs are picked up automatically; tabs matching
  `DB_COPY_EXCLUDE` (a regular expression) are skipped.
- **How each copy is checked:** each copy is **read back and compared with the sheet** by a content hash of the whole tab,
  including dates (until v0.17: row count only). Every check is counted per day in `dbo.sheet_sync_log` (day, book, sheet,
  copies, mismatches, rows).
- **Reads:** only for the books in `DB_READS`.
  - A tab that exists but isn't copied, a copy older than 15 minutes, or a database error → the read goes to Google
    Sheets, as before.
  - A tab that doesn't exist is answered from the stored tab list, as Google would answer it.
- **Saves:**
  - Any save through Azure marks the copies **dirty**. Reads go to Google until a copy that *started after* the save has
    finished, so nobody sees old data after saving. A fresh copy starts at once (at most one every 20 s).
  - Saves made on the Apps Script dashboard reach the copy within `DB_SYNC_MINUTES`. Keep `DB_READS` off for books where
    that delay matters, until Apps Script stops serving people (Phase 6).
- **Start-up log:** `[DB] Spreadsheet "main" copied to Azure SQL — N sheets, M rows; checked identical.` and
  `[DB] Spreadsheet "main": copied … every 5 min and checked; reads …`.
- **A failed check:** `[DB] Spreadsheet "main" copy FAILED: copy differs from the sheet after reading it back: <tabs> —
  reads stay on Google Sheets.`

**Also in v0.18.0: live status when Azure has no live result.** When `AZURE_CLASS_LIVE` is off or Apps Script isn't
answering, class cards now show what Apps Script shows when its own Meet check can't see a class: "Live Google Meet
status not available". This uses Code.gs's `classMeetApplyLive_`, copied as `classMeetApplyLiveCopied_`, on an empty
snapshot. Until now Azure fell back to the schedule and said "Teacher not in Meet · 0 of N", with an alert colour. Apps
Script r138 adds `classMeetEndedMarkMap` to the bridge export list, so the "class ended" mark matches too.

### Switch on

1. Azure App settings: `DB_COPY` = `main,attendance` → Apply. Log: `[DB] Spreadsheet "main" copied to Azure SQL — …
   checked identical`.
2. Let it run for two weeks, then check the record:
   ```sql
   -- tables with any difference in the last 14 days (should be empty)
   SELECT book, sheet, SUM(copies) AS copies, SUM(mismatches) AS mismatches
   FROM dbo.sheet_sync_log WHERE day > DATEADD(day, -14, CAST(SYSUTCDATETIME() AS date))
   GROUP BY book, sheet HAVING SUM(mismatches) > 0;
   -- days checked per book
   SELECT book, COUNT(DISTINCT day) AS days, SUM(copies) AS checks, SUM(mismatches) AS mismatches
   FROM dbo.sheet_sync_log GROUP BY book;
   ```
3. Then `DB_READS` = `main` (and later `attendance`) → Apply. Azure screens read from Azure SQL instead of Google Sheets.
   This is faster and uses fewer Sheets API calls. Changes made on the Apps Script dashboard appear on Azure within
   `DB_SYNC_MINUTES`.

**Switch back:** remove the book from `DB_READS` (reads go to Google at once), or remove `DB_COPY` (copying stops).

### Tests

- `test/db.test.ts`:
  - Every tab is discovered, including a new tab; excluded tabs are skipped.
  - A copy that reads back different is caught and counted.
  - Dirty after a save: reads go to Google; a copy that started before the save doesn't count; a later one does.
  - A tab that doesn't exist is answered from the copy; an excluded tab goes to Google.
- `test/classes.parity.test.ts`, "Phase 5 step 1" (real Code.gs fixture):
  - Directory (Admin, teacher) and Classes (Admin, student) answered **from the copy are identical to Google Sheets**, with
    no Google read.
  - A save sends reads to Google until a fresh copy is made; `DB_READS` off means Google.
  - Every tab is checked with no mismatch.
- `test/classlive.test.ts`: the "not known" fallback.

`npm test` 82/82, `npm run e2e` 10/10.

**Not executed here:** copying the real spreadsheets. The start-up line and `dbo.sheet_sync_log` prove it on the first
start.

## Next steps of Phase 5

- **Step 2:** tables whose saves only write rows become Azure-owned, the same way as Special Classes and chat.
  Candidates: user country, dashboard user roles, Teacher Availability selections, Meet link mapping.
- **Step 3**, after the Phase 4 step 3 permissions: tickets, leave, coverage, exams, letters and attendance.

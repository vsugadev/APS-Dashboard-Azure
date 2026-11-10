# APS Classroom Dashboard — Help Guide & Help-Video Script

| | |
|---|---|
| **Product** | Avvaiyar Padasalai (APS) Tamil Virtual School — Classroom Dashboard |
| **Academic year** | AY26-27 (only Google Classrooms whose name ends with `AY26-27` and are ACTIVE) |
| **Help guide version** | 2.74 — matches dashboard release r121 |
| **Last updated** | 2026-11-06 |
| **Time zone** | All times are America/New_York, shown as **EST** |

---

## 0. About this file (read first)

This is the single, maintained help document for the APS Classroom Dashboard. It is written so it can be used **directly as the prompt / script for a help video**, and as the reference for the in-app help (the **ⓘ Help** button on every screen and the tooltips that appear when you hover, focus or long-press a control).

### 0.1 How to make the help video from this file

Give this whole file to the video tool / video editor with this brief:

- **Audience:** APS Admins, Head Masters (HM), Vice Principals (VP), Board members (BOD), Teachers, Students and parents helping students.
- **Goal:** a viewer can sign in and do their everyday tasks without asking for help.
- **Tone:** friendly, calm, plain English, short sentences. Explain *what* the control does and *why*, never internal technical words.
- **Style:** real dashboard screen recordings or clean mock-ups of the dashboard; highlight the control being described (soft circle or arrow); show a caption line with the narration. No loud music or flashy effects. APS colours: white cards, Google blue buttons, green for good / available, amber for attention, red for problems.
- **Structure:** one chapter per section below. Every feature section ends with a **🎬 Video scene** block: *Narration* = what the narrator says; *On screen* = what the viewer sees, in order. Use them as-is.
- **Length:** full video ≈ 15–20 minutes; or cut one short video (1–3 minutes) per chapter, e.g. "Classes for Teachers", "Attendance for Admins", "Grades for Students".
- **Privacy:** use the sample names in this guide (e.g. *Teacher Priya*, *Student Arun*, `teacher_aps123@avvaiyarpadasalai.org`) — never real student data.

### 0.2 How to maintain this file

- Update this file **in the same release** as any dashboard change that adds, removes or changes a feature, a role permission, a schedule or a screen label.
- Keep wording identical to the in-app help where possible. In-app wording lives in `Dashboard.html` → `APS_HELP_TEXT` (screens, tooltips, column headers, status meanings). If you change one, change the other.
- Bump the **Help guide version** and **Last updated** at the top and add a line to the **Change log** (section 15).
- Every new feature section must have: *What it is · Who can use it · How to use it · Good to know · 🎬 Video scene*.

---

## 1. Getting started

### 1.1 Signing in
1. Open the dashboard link (APS Dashboard button in school emails, or https://www.namaps.org/dashboard).
2. Click **Sign in with Google** and choose your **APS Google account** (`…@avvaiyarpadasalai.org`).
3. The dashboard recognises your role automatically and shows only the tabs and buttons you may use.
4. Students may be asked to accept a short **notice** the first time — tick the box and press **Accept**.
   Once a month, students may also see a small **Google Review** window: *“Avvaiyar Padasalai America would love your feedback. Post a review.”* **⭐ Write a Google Review** opens the school's Google Review page in a new tab; **Maybe Later** or **✕** (or Esc) closes it. It appears at most once per calendar month.
5. *(No country step at sign-in.)* If you are **outside the United States**, a small flag of your country appears next to your name (detected by your browser). If it is wrong, click the flag and choose your country — choosing **United States** removes the flag.

**Good to know:** if you see "Access denied", you probably signed in with a personal Gmail — sign out and use your APS account. Your name, APSID and role are shown at the top right, e.g. `Priya · APS123 (Teacher)` or `(HM)` / `(VP)` when you are a class VP or HM.

🎬 **Video scene — Signing in**
- *Narration:* "Welcome to the APS Classroom Dashboard. Sign in with your APS Google account — the one ending in avvaiyarpadasalai dot org. The dashboard knows your role and shows only what you need."
- *On screen:* sign-in page → Google account chooser (APS account highlighted) → dashboard loads → zoom on the name badge top right.

### 1.2 The screen at a glance
- **Header buttons (everyone):** 📅 School Calendar · 📚 Syllabus · 📹 Live Tech Support (Zoom) · 🎫 Raise Service Request · 💡 Share Your Idea. Students also have **⭐ Google Review** (opens the review page in a new tab; your review is posted on Google, not in the dashboard).
- **Tabs:** Classes (with sub-tabs *Classes* and *Teacher Availability Report*) · Active Directory (sub-tabs *Directory Search* and *Student Onboarding Status*) · Knowledge Base – Videos · Assign Classroom (sub-tabs *Re-Map Student*, *Add/Remove Student*, *Class Change Requests*, *Reference Letter Approvals* — each shown only to the people who can use it) · Letters · Attendance · Examination · and, for Admins, Admin Control. You only see the tabs your role allows.
- **ⓘ Help** (top right of every screen): explains the screen **for your role**.
- **Tooltips:** hover (desktop), focus with the keyboard, or **long-press** (phone/tablet) any button, filter, column header, badge or status to see what it means. Small **ⓘ** icons next to some fields can be tapped.
- **Auto-refresh:** data refreshes on its own every minute; filters and searches update the list as you type — there is no "Apply" button.

🎬 **Video scene — Finding your way**
- *Narration:* "At the top are quick links: the school calendar, the syllabus, live tech support on Zoom, service requests and ideas. Below are the tabs. Not sure what something does? Hover over it — or press and hold on your phone — and a short explanation appears. Every screen also has a Help button that explains it for your role."
- *On screen:* pan across header buttons → tabs → hover a filter (tooltip appears) → open ⓘ Help panel → close.

### 1.3 Roles

| Dashboard role | Who | What they can do |
|---|---|---|
| **Super Admin** | Dashboard owner | Everything, plus User Roles & Permissions |
| **Admin** | School administrators | Every class and every tool; all "Sync Now" buttons (they use Google API quota) |
| **Head Master (HM)** | School-wide HMs | Every class; monitoring filters; corrections; reports. No Sync Now |
| **BOD** | Board members | Read-only view of everything they may see |
| **On-Call Coordinator** | tcs_asvika_aps8112 (Script Property `ON_CALL_COORDINATOR_EMAILS`) | Read-only view of **every** class, Live status and On-Call Teacher Attendance — same read-only rights as BOD, no Google Classroom needed; badge shows *(On-Call Coordinator)* |
| **Teacher** | Class teachers | Their own classes and teacher tools |
| **Student** | Students | Their own class, attendance, question papers and grades |

**Class roles (per class, from Google Classroom):**
- **Primary Teacher** — the APS email written in the class's **Google Classroom Course Description**. This is the class's teacher, whatever the email looks like (also `tts_` / `tcs_` accounts). Teacher-level access to that class.
- **VP / HM of a class** — APS emails written in the class's **Room** field after `VP Email:` / `HM Email:` (any number, separated by `;` `,` or `|`). They see that class and can use the Head Master actions on **that class only**. Shown on the card as **(VP)** / **(HM)**.
- One person can hold several roles in one class, e.g. **Primary Teacher + HM**.

---

## 2. Classes tab → Google Classroom

### What it is
One card per Google Classroom class you may see: class name, day and time (EST), **Primary Teacher** (green tag), **(VP)** / **(HM)**, students, live status, class status, this week's teacher availability, and the class links.

### Who can use it
Everyone (each role sees its own set of classes: Admin / HM / BOD all classes; Teacher their classes; Student their class).

### How to use it
- **Find a class:** type in **Search class or teacher by name, email, or APSID** (class or teacher name in English or Tamil, a teacher's APS email, or their APSID); use **Nilai**, **Class Time**, **Teacher Availability** and **Status** filters; Admin/HM also get **Live**, **No students**, **Teacher NOT in Class** and **Needs Tech Support** filters. **Clear filters** resets everything.
- **Find a student's class:** type the student's name, APS email or APSID in **Find student by name, email, or APSID** — the classes filter as you type (no button). *No student found …* means nothing matched; **✕ Clear** shows every class again. On a computer both search boxes sit on one line; on a phone they stack.
- **Status box (during class time only):** from the class start time until it ends, each card shows a **Status** section under the class name with the same two lines as GCM - Preview, e.g. "👩‍🏫 Teacher in Meet · 👥 5 of 5 students" / "Class Started — Teacher joined 12:00 PM · 5 students joined".
  - **Green** when the teacher is in the Google Meet; **red** when the status says **Teacher not in Meet** (students waiting) or **Google Meet not started yet**.
  - **Grey — "Live status not available"** means the dashboard cannot see this class's Google Meet right now (it shows "Teacher: not known · Students: not known"). It is not an alarm: the class may well be running. GCM - Preview shows the same.
  - **Admin:** GCM - Preview shows a **Live Meet check** line under the title — how many classes are in session, how many Meets are readable / refused / have no Meet code, and the last refusal message. Refused Meets are re-checked every 45 seconds, only during that class's time.
  - It **refreshes every 45 seconds** on its own (the box shows the last update time); Google Meet itself is checked every 45 seconds **during class time** (scheduled start to end), so a change shows within about 1–1½ minutes. No section is shown before or after class time.
- **Join the class — the Resources box** (one per class card, below the students):
  - **WhatsApp → Join to WhatsApp** opens the class WhatsApp group.
  - **Google Meet → Join to Google Meet** opens the class Meet; **Copy** copies the Meet link.
  - **Google Classroom → Join to Google Classroom** opens the class in Google Classroom; **Copy** copies the Classroom link.
  - After **Copy** the button shows **Copied ✓** and a message such as "✓ Google Meet link copied" appears. If your browser blocks copying, a box opens with the link selected — press Ctrl+C / ⌘+C.
  - A link the class doesn't have shows **Not available**.
- **Your role on each class** (teacher accounts): the card shows **Role: Primary Teacher**, **Role: VP**, **Role: HM** or **Role: Primary Teacher + HM**.
- **Live status:** turns on automatically when the teacher or students are in Google Meet ("Live via Meet") or active in Google Classroom; Admin/HM can **Mark Live / Mark Ended**.
- **Class status (live from Google Meet):** Scheduled · Yet to Start · **Class Started** · **Class Ended** · Cancelled · Rescheduled. The **Cancel Class** / **Reschedule Class** buttons are no longer on the class cards; a class already marked Cancelled / Rescheduled shows **Restore Automatic Status** to Admin / HM (and the class's VP / HM).
  - **Class Started** — the class's teacher **and** at least one student have joined the class's Google Meet (from 30 minutes before the class time, so an early start shows too).
  - **Class Ended** — the class started and then the Meet ended (or nobody was active for 10 minutes after the class time).
  - Under the status, Admins, HMs and teachers see one line saying what is happening, for example "Teacher joined 6:28 PM · 12 students joined", "Meet started — teacher joined 6:25 PM, waiting for students" or "No Google Meet activity was detected for this class today". Hover it to see where the information came from and when it was last checked. Students see the status only.
  - The status refreshes by itself about every 2 minutes during class time.
- **Help during class:**
  - **Report Teacher Not in Class** → the Tech Team is alerted → **Mark Tech Team Engaged** → **Confirm Teacher Back**.
  - **Request Tech Support** → **Mark Tech Team Joining** → **Mark Resolved**.
- **📅 Class Teacher Availability** box on each card: the class teacher answers for the upcoming week — **Click to Confirm – I’m Available** (with the Tamil line *கிளிக் செய்து உறுதிப்படுத்தவும்*) or **Click to Confirm – I’m Not Available** with an arrangement (Parent-Teacher Arranged, Sub-Teacher Arranged, Need HM Support, Alternative: On-Call Assigned).
  - **Teacher, I’m Not Available (r102):** a short message opens first, showing how many students are in the class and asking you to check whether a parent could help as Parent Teacher (for example through WhatsApp). This is a suggestion only; no proof is needed. **Go Back** saves nothing. **Confirm – I’m Not Available** opens the usual arrangement choices, and your answer is saved when you pick one.
  - **After you answer (teachers):** the card shows only **Reset the Availability**. This stays the same after a refresh or a new sign-in. **Reset the Availability** clears this week's answer and brings back both buttons, so you can choose again. If a save or reset fails, the buttons stay as they were and the error message is shown.
  - **Admin / Super Admin / Head Master:** no message window. You can still switch a class directly between Available and Not Available. **Reset the Availability** shows only when the class has an answer.
- **On-Call Teachers** are no longer listed on the class cards (r45). A `tcs_` / `tts_` account named as the class's Primary Teacher still appears under Teacher; On-Call Teacher Attendance is unchanged (Attendance tab).

### Good to know
- **Teachers and students are shown on two lines:** line 1 is the name on one line (teachers also show **Primary Teacher** / **(VP)** / **(HM)**); line 2 is the APSID, the (Meet / Classroom) marker and the last login, e.g. `[APS9009]  09/26 23:02 (GM/DB)`. A very long name ends with “…” — hover it to read it in full. On-call teachers use the same layout.
- **Email addresses are never shown** on class cards. Room text is shown without the VP/HM emails.
- A Primary Teacher named in the Description who is not yet a teacher in that Google Classroom is shown with "(not yet in Google Classroom)" — an Admin can add them there; the next sync usually adds them automatically.
- Admin: **Hide / Show staff** hides HM/Admin/support accounts on rosters; **Force Sync** pulls fresh data from Google Classroom (uses quota — normally not needed; it runs automatically).
- The Meet link appears automatically. It comes from, in order: (1) a link saved by an Admin/HM in Course ↔ Meet Link Mapping; (2) a meet.google.com link in the class's Description / Room / Section; (3) the **automatic fill from Google Classroom** — every day at 5:00 PM EST the dashboard reads each class's newest announcements, materials and classwork for a Meet link (Google Classroom's own `meet.google.com/lookup/…` join links work too); (4) the Meet the class actually used (learned by the attendance sync). A class with no known Meet shows no Meet link.

🎬 **Video scene — Classes for teachers and students**
- *Narration:* "The Classes tab shows a card for each of your classes. You'll see the Primary Teacher with a green tag, any Vice Principal or Head Master of the class, and the students. To start class, open the Resources box and press Join to Google Meet — or Copy to share the link. Join to WhatsApp and Join to Google Classroom are in the same box. If the teacher hasn't joined, press Report Teacher Not in Class and the Tech Team is alerted."
- *On screen:* one class card → highlight "Primary Teacher" tag → (VP)/(HM) tags → Resources box: Join to WhatsApp, Join to Google Meet + Copy ("Copied ✓"), Join to Google Classroom + Copy → Report Teacher Not in Class button.

🎬 **Video scene — Classes for Admin / HM**
- *Narration:* "Admins and Head Masters see every class. Use the filters to spot problems: classes that are live, have no students, have no teacher, or need tech support. You can acknowledge support requests."
- *On screen:* filter bar → select "Needs Tech Support" → card with alert → Mark Tech Team Joining.

---

## 3. Classes tab → Teacher Availability Report

### What it is
The weekly Class Teacher Availability for the **upcoming class week (Fri–Sun)**, for all active AY26-27 classes. It is also **emailed Tuesday–Friday at 6:00 PM EST** from **attendance@avvaiyarpadasalai.org** to teachers@ with **admin@ in CC** (replies go to attendance@).

### Who can use it
- **Teachers:** fill in their availability (Status, Nilai, class times) and confirm each class on its card.
- **Admin / HM:** see the full report and follow-up lists. **BOD:** read-only.

### How to use it
- **Teachers:** choose **Status** (Available / Not Available / Pending), tick the **Nilai** and **class times** you can teach → **Submit**. Also confirm each of your classes in the 📅 box on the class card — that is what the report counts.
- **Admin / HM:**
  - **Summary cards:** Total Classes · Available to Take Class · Not Available to Take Class · Availability Not Set.
  - **Grade-level Status** table: per Nilai, classes and how many are covered.
  - **Teachers Requiring Follow-Up:** two tabs, 🔴 Not Available and ⚪ Availability Not Set, listing Nilai, teacher name, teacher email, class and status.
  - Other views: **Complete List**, **Grade-wise**, **Time-wise** (teachers' form answers); search and filters update instantly.
  - **Send Test Email** (Admin) sends a [TEST] copy to you only. **Refresh** reloads answers.

### Good to know
- The class teacher is **always the Primary Teacher named in the class's Google Classroom Course Description** — whatever their email looks like — so a class with a named Primary Teacher is never shown as "Not Assigned". Their real answer (Available / Not Available / Not Set) is shown.
- Admin, HM, hidden staff, `tts_` and excluded accounts are not listed as teachers unless they are a class's Primary Teacher.
- **The weekly email** (sent to teachers) lists **Not Available** teachers by name, but shows **Availability Not Set only as numbers** (how many classes and teachers) — no names or classes. Every teacher is asked to set their own weekly preference. The full Not Set list stays on the dashboard for Admin / HM.

🎬 **Video scene — Weekly availability**
- *Narration:* "Every week, teachers confirm whether they can take their classes. Open the Teacher Availability Report under Classes. Admins see at a glance how many classes are covered and who still needs to answer."
- *On screen:* sub-tab → summary cards → Grade-level table → Not Set tab → teacher card box "Click to Confirm – I’m Available".

### Live Google Meet status — how it works (Admin)
- The dashboard checks today's classes every ~2 minutes during class time (30 minutes before the start until 1 hour after the end), using three sources:
  1. **Google Meet itself (live)** — when the school's dashboard account is allowed to read that class's Meet, it sees who is in the call right now and when the call ends.
  2. **The Google Meet audit log** — Google records each person when they **leave** a call, with when they joined. This is exact but arrives only after someone leaves or drops.
  3. **Join to Google Meet clicks** on the dashboard by the class's own teacher and students — instant.
- Admin, HM and support accounts (for example the Tech Team) never count as the class's teacher or students.
- If a running class still shows **Yet to Start**, the teacher and students probably joined from a saved link instead of the dashboard and nobody has left the call yet. Ask them to join from **Join to Google Meet** next time, or check **🎥 GCM - Preview → Refresh**.

---

## 3A. Classes tab → 🔀 Temporary Class Coverage (Admin, Super Admin, Head Master, class VP / HM)

**What:** a **One-Time Class Merge** — when a teacher is unavailable, their class joins another class of the **same Nilai, day and time** for **one session only**. Nothing permanent changes: rosters, teachers, course names, Meet links and future classes stay as they are.
**Who:** Admin, Super Admin and Head Masters (any class); a teacher who is **VP / HM of a class** (Room label) only for the classes they support. Everyone else never sees it, and the server refuses it.
**How:**
1. **① Original Class — Teacher Unavailable**: pick the class (it shows the Primary Teacher, email and student count).
2. **② Session date**: the next six class days are offered (or pick another date of the same weekday). Past sessions cannot be chosen. Times are Eastern Time and show EDT / EST correctly.
3. **③ Destination Class — Coverage Class**: only classes with the same Nilai, day and start / end time are listed. ✅ = Meet link verified (Admin mapping or class description). ⚠ = link found in the class stream — tick the box to confirm it. ✖ = no usable Meet link (add it in Attendance → Course ↔ Meet Link Mapping).
4. Check **📋 Coverage Session Details**, **👥 Notification Recipients** and the **👁️ Notification Preview** (the exact announcement; **Preview** shows the student and staff emails).
5. Tick the confirmation box → **✅ Confirm & Apply Coverage**.
**What happens:** one announcement *Class Merge Notice – <date>* is posted in the **original** Google Classroom only; the original class's students get the email (BCC — nobody sees another student's address) and the teachers, VP and HM of both classes get a staff email — all **from attendance@avvaiyarpadasalai.org**, **admin@ CC**. The announcement is **deleted automatically** after the class ends (+30 minutes). On the session day both class cards show a 🔀 banner, and the students' attendance is credited to their **own** class from the coverage class's Meet.
**📜 Merge History:** every merge with its announcement / email / cleanup status. **Retry** re-runs only what failed — it never posts a second announcement. The same class and date can be merged only once.
- *Narration:* "Teacher unavailable? Open Classes, Temporary Class Coverage, pick the class and date, choose a matching class, preview, confirm — students, teachers and leaders are told, and the notice tidies itself up after class."

### Destination Class — decision support (r77)
Each class in **③ Destination Class** now shows, without opening another screen:
- **Badges:** ✅ Meet verified · 🟢 Teacher Available / 🔴 Teacher Not Available / 🟡 Availability Not Submitted · 👩‍🏫 APS Teacher · ⚠️ Existing Coverage.
- **👩‍🏫 Teacher · APSID · 👥 students · Combined** (shows "APSID unavailable" when the email has no APSID).
- **📅 Teacher Availability** for the session's class week only:
  - the class card answer for that class ("Friday 6:30–8:00 PM — Available", or "❌ Not Available (arrangement)");
  - plus any times the teacher entered in the Teacher Availability form.
  - If there is nothing: "⚠️ No availability submitted for this week". Older weeks are never shown, and nothing is guessed from the class schedule.
- **👩‍🏫 APS Teacher** badge when the teacher has an APSID and is the Primary Teacher of an active AY26-27 class. "Newer" / "Experienced" are not shown, because the dashboard has no reliable start-date data.
- **⭐ Recommended** (r78), on **one** class at most. Only teachers available this week count, never a Not Available teacher even if their APSID is lower. Among those, only Existing APS Teachers, then the **lowest numeric APSID** (APS8051 before APS8056). Missing or invalid APSIDs and classes that can't be selected are never recommended. That class shows "💡 Recommended APS Teacher — Available this week and has the lowest eligible APSID among the available teachers" ("…the only eligible available teacher" when there is just one). If nobody is available: "⚠️ No Destination Class Teacher is currently available this week". The recommendation is worked out again for every class / date you pick.
- **⚠️ Existing Coverage:** how many classes are already merged into that class on the same date, and which ones.

The list is ordered best match first: selectable, Meet verified, teacher available, APS teacher, fewer merged classes, smaller class. Nothing is selected for you.

If the chosen class already hosts coverage that session, a warning lists the existing coverage (source class, date, teacher). With 2 or more, it says how many classes will be combined. **Confirm & Apply** stays disabled until you also tick **"I understand that another class is already assigned to this Destination Class"**. The server checks this tick too.

Selecting a class responds at once ("Loading the coverage summary…"). The server now reads the merge sheet once per request instead of twice for every candidate class.

## 3A.1 📧 Parent-Teacher Arranged classes — "START GOOGLE MEET" emails (automatic)

### What it is
If a class card's status for the week is **exactly** *Not Available to Take Classes - Parent-Teacher Arranged*, the parent-teacher who takes that class **cannot start the class Google Meet**. The dashboard emails the class's **Primary Class Teacher, HM and VP** (admin@ in CC) so that one of them, or Admin, starts the Meet. Other statuses (Sub-Teacher Arranged, Need HM Support, On-Call Assigned) never trigger this email.

### When (America/New_York)
| Email | Classes included |
|---|---|
| Friday ~5:30 PM | Friday, Saturday and Sunday classes |
| Saturday ~11:30 AM | Saturday and Sunday classes |
| Sunday ~6:30 PM | Sunday classes |

- **One consolidated email per run**, not one per class. Each person gets it once, even if they are on several classes.
- From **donotreply@avvaiyarpadasalai.org**. Only ACTIVE classes ending with AY26-27 are included, and classes that have already ended are left out.
- Each class has its own green **▶ START GOOGLE MEET** button with that class's own Meet link, and the raw link below the button.
- The card also shows the class date and time, Primary Teacher, HM, VP, status, Google Classroom link and any Class Coverage Tracking note.
- The name of the Parent-Teacher Arranged teacher isn't recorded in the dashboard yet, so the email says "Not recorded in the dashboard".
- A missing Meet link, Primary Teacher, HM or VP is listed under **⚠️ Action Required / Missing Information**; the class is never silently dropped.
- Safe to run again: a class is sent at most once per email time. If a class is set to Parent-Teacher Arranged later, the next run sends only that class.
- Every run and every class is logged in the sheet **Parent_Teacher_Arranged_Notify_Log**.

### Setup (Admin, once)
In the Apps Script editor run **createParentTeacherArrangedCoverageTriggers** (safe to run again; it never creates duplicates).
- **previewParentTeacherArrangedCoverage('FRIDAY')** shows what would be sent, without sending.
- **removeParentTeacherArrangedCoverageTriggers** stops the emails.
- Switch off without removing the triggers: Script Property `PTA_COVERAGE_NOTIFY_ENABLED=false`.
- Email sign-in uses the existing **TICKET_MAIL_*** Script Properties (the same as Tickets).

## 3A.2 🎨 Class Teacher Availability colours (Google Classroom cards, r77)
Each "Not Available to Take Classes" badge now starts with a colour chip. The existing wording, name, time and arrangement are still shown, and the saved values are never changed.

| Chip | Meaning |
|---|---|
| 🔴 NEED HM SUPPORT | Action Required |
| 🟢 SUB-TEACHER ARRANGED | Covered |
| 🔵 PARENT-TEACHER ARRANGED | Covered by Parent/Teacher |
| 🟣 ON-CALL ASSIGNED | Alternative Coverage |
| 🟠 Temporary Class Coverage | shown when the class is merged today |
| 🟡 NEEDS REVIEW | Not Available with no arrangement |

Quick filters were added to the existing **Teacher Availability** filter (Admin / HM): 🔴 Need Action, 🟢 Covered, 🔵 Parent-Teacher, 🟣 On-Call.

## 3B. Classes tab → 🧾 Class Coverage Tracking (Admin, Super Admin, Head Master, class VP / HM)

### What it is
An operational record of how each class was covered when its teacher or parent volunteer was unavailable. Each class can have one record per class week. A record has a **Coverage Status** and a short **Class Coverage / Action Taken** note. Classes with no coverage issue need no record.

### Who can use it
- **Admin, Super Admin and Head Master** see and update every class.
- **A class VP / HM** sees and updates only the classes they support.
- **Teachers, students and BOD** do not see this sub-tab, and the server refuses them too.

### How to use it
1. Classes → **🧾 Class Coverage Tracking**. Pick the **Class week**: this week, the next 2 weeks or the last 12.
2. By default you see **classes with a coverage issue**: the teacher answered **Not Available** in Teacher Availability, or a record already exists. A Not Available class with no record shows **Not recorded**.
3. Press **➕ Add** or **✏️ Update**. Choose the Coverage Status and write the action taken (an example button fills a sample text). Press **Save**.
   - Pending Coverage needs no text. Every other status needs a short action note (up to 300 characters).
   - Choose "— No coverage issue —" to remove the record. The history stays.
4. Use **Show** or the summary chips to filter:
   - Needs a substitute
   - Pending coverage
   - Not available — no record
   - Covered
   - Rescheduled
   - Cancelled / not covered
   - Any single status
   **Search** looks in class, teacher, status and action.
5. **🕘 History** lists every change: when (EST), who, previous → new status and action.

**Coverage Status values:**
- Pending Coverage
- Substitute Assigned
- HM Covered
- VP Covered
- Parent Volunteer Assigned
- On-Call Teacher Assigned
- Original Teacher Covered
- Class Rescheduled
- Class Cancelled
- Class Not Covered

### Good to know
- Nothing here changes teacher or classroom assignment, Google Classroom, attendance, scheduling, Teacher Availability or Temporary Class Coverage. Teacher availability is shown read-only.
- The records are kept in two sheets of the main workbook:
  - `Class_Coverage_Tracking` holds one row per class per week.
  - `Class_Coverage_Tracking_Audit` holds every change.


## 3C. Classes tab → 👩‍🏫 Temp Teacher (Admin, Super Admin, Head Master, On-Call Coordinator, class VP / HM, Teacher)
**Temporary Teacher Assignment – TCS/TTS.** When a Primary Teacher is unavailable, add another APS teacher (usually a TCS / TTS On-Call teacher) to **one** Google Classroom as a **Teacher** for a set period. The teacher is removed automatically on the Removal Date. The Primary Teacher never changes.

**Who can assign:**
- Admin, Super Admin, Head Master and the **On-Call Coordinator** can assign for every class.
- A teacher (including a class VP / HM) can assign only for the classes they teach or support.
- Students, other BOD members and Authorized users do not see this sub-tab.
- **The temporary teacher cannot manage the class they cover (r100).** While their assignment is open, that class is not in their Temp Teacher list, even though Google Classroom lists them as a Teacher there.
- A class VP / HM can type any APS email **only for the classes they support**. For their other classes they pick from the list, like a teacher.

### Assign a temp teacher
1. Classes → **👩‍🏫 Temp Teacher** → **+ Assign Temp Teacher**.
2. **Google Classroom:** search by name, course ID or section. The panel shows the Primary Teacher, HM / VP, number of students and status.
3. **Temporary Teacher:** search by name, APSID or APS email. The list has two groups:
   - **TCS On-Call Teachers** (first): every teacher in the **TCS_ONCALL_TEACHER_LIST** tab of the dashboard workbook, column E (APS email), in sheet order. They are listed even if they are not in any Google Classroom yet; they are added to the class as a Teacher when the cover starts. The name comes from the sheet's name column. Edits to the sheet show within about 5 minutes, or press Refresh.
   - **Primary Teachers**: every class's Primary Teacher (from the Course Description), A–Z.
   
   **Any APS email (Admin, Super Admin, Head Master, On-Call Coordinator, class VP / HM):** type the full email address in the search box. If it is not in the list, it appears under **Entered email** and is selected. It must be a valid email on an APS domain (avvaiyarpadasalai.org, amchats.org, namaps.org, apsamerica.org); other domains are shown greyed out. When you assign, the APS Google account must exist, be active and not be a student account. A class VP / HM can still assign only for their own classes. A regular Teacher picks from the list only.

   VP / HM and other co-teacher accounts are not listed (they can be typed as an email by the roles above). The panel shows the classes the teacher already teaches and any other cover in the same dates. Teachers already in the class cannot be picked.
4. **Start Date** (today or later) and **Removal Date** (required, not before the Start Date). The effective period is shown under the form.
5. **Reason:** 5–200 words. A live counter shows the word count.
6. **Assign Temp Teacher.**
   - If the cover starts today, the teacher is added to Google Classroom right away.
   - Otherwise the status is **Scheduled** and the teacher is added on the Start Date.

### What happens next
- **Emails** from donotreply@:
  - When the teacher is added, an email goes to the temp teacher, CC the Primary Teacher, HM, VP and admin@.
  - When the teacher is removed, the same people get an email.
- **Removal:** automatic on the Removal Date at 11 PM Eastern Time, so the teacher covers the whole last day.
- **If the removal fails:** the status becomes **Failed**, admin@ gets an "ACTION REQUIRED – Temp Teacher Removal Failed" email (once), and the dashboard retries every hour.
  - **r100:** the hourly retry stops after about a day of failures, or at once when the teacher has become the class's Primary Teacher. The record stays **Failed**, and an Admin uses **Remove Temp Teacher Now** once Google Classroom allows it.
- **Class card note:** every class card, for every role including students, shows **"👩‍🏫 On-Call Teacher Assigned: Name (APSID) · dates"** from the day the cover is scheduled. Before the Start Date it says "(upcoming)". The note shows the name, APSID and dates only, never the email or the reason.

### Statuses
- **Scheduled:** waiting for the Start Date.
- **Active:** the teacher is in the class.
- **Removal Due:** the removal time is reached; the hourly check removes the teacher.
- **Removed:** the cover has ended.
- **Failed:** the add or remove did not work; admin@ has been told.
- **Cancelled:** cancelled before the start; the record is kept.

### Actions
- **View Details:** the full record (who, when, emails, last processing).
- **Remove Temp Teacher Now:** asks "Are you sure you want to remove this temporary teacher from the Google Classroom now?"
- **Cancel Assignment:** available only before the teacher is added. The record is kept.

### Good to know
- One temporary teacher per classroom at a time: overlapping dates for the same classroom are refused, and the message shows the existing assignment.
- A teacher who was already in the class is never removed by this feature.
- Records are kept in `TEMP_TEACHER_ASSIGNMENTS`, and every action is logged in `TEMP_TEACHER_AUDIT`.

## 3D. 🎓 சிறப்பு வகுப்புகள் (Special Classes)

### What it is
Special classes, training programs and workshops outside the weekly curriculum (for example பண்ணிசை சிறப்பு வகுப்புகள், or ஆசிரியர் பயிற்சி — தமிழ் இலக்கணமும் எழுத்துப்பிழையும்).

### Who sees it
- **The tab:** Admin Control → 🔐 Access Control, row "🎓 சிறப்பு வகுப்புகள்". It starts **on** for Student, Admin and Super Admin, and **off** for HM, Teacher (including a class VP / HM), BOD and Authorized until an Admin switches it on.
- **Each program:** its **Audience** decides who sees it.

  | Audience | Shown to |
  |---|---|
  | Students Only | students |
  | Teacher Only | teachers and HMs |
  | Both Student and Teachers | students, teachers and HMs |
  | All | everyone who has the tab |

- Admin / Super Admin see every active program. Inactive programs are hidden from users.

### Program cards
Each card shows the title, description (Tamil kept, line breaks kept), 👥 Audience, 💻 Mode, 📅 Program dates, 📝 Enrollment dates, 🕒 Time (ET, or "To Be Announced") and 💰 Fees. Optional extras: instructor, seats, options and a More info link.

The status is worked out from the dates every time:

| Status | Meaning |
|---|---|
| 🟢 Registration Open | **Register Now** opens the registration page in a new tab |
| 🕐 Registration Opens *date* | Enrollment hasn't started yet |
| 🔴 Registration Closed | The enrollment window has passed |
| ⚫ Program Completed | The program has ended. Hidden from users unless Admin turns it on in settings |

**View details** shows everything. The list is ordered Open → Opening soon → Running → Future.

### ⭐ My Special Classes
Programs you are enrolled in appear at the top, grouped **Current / Upcoming / Past**. Each card shows your option (batch) and status. Current and upcoming programs show **Join / Open Class** when the program has a Class Link. Only you, and Admin, can see your enrollment.

### Manage Special Classes (Admin / Super Admin)
- **＋ Add Special Class:** Title*, Description*, Audience*, Mode* (plus Mode Details for "Others"), program and enrollment dates, class day and time, Fees (free text), Registration Link (https only), Status, Display Order.
  - **✨ Customise & future enrollment:** card icon, instructor, More Info Link, Class Link (shown to enrolled people only), maximum seats, Google Classroom ID, and **Enrollment Options**. Options are batches or preferences, each with its own Google Classroom ID and seats; they are used later to place enrolled students in the right Google Classroom automatically.
- **Per program:** 👁️ View · 🖼️ Preview (exactly as users see it) · ✏️ Edit · 👥 Enrollments · ⏸️ Deactivate / ▶️ Activate. There is no delete, because enrollments and history refer to the program.
- **👥 Enrollments:** add people by APS email or APSID (one per line), choose the option, status (Enrolled / Waitlisted / Cancelled) and payment (Not required / Pending / Paid / Waived). Each row can be changed later.
- **Filters:** All, Active, Inactive, Upcoming, Enrollment Open, Completed.
- **⚙️ Module settings:** the introduction text, the "nothing available" message, and whether completed programs are shown to users.
- **Where it is saved:** the spreadsheet tab **APS_SPECIAL_CLASSES_LIVE**. You never need to edit the sheet by hand. Every change goes to **APS_SPECIAL_CLASSES_AUDIT**, and enrollments go to **APS_SPECIAL_CLASSES_ENROLLMENTS**.

## 11C. 🔄 Zoho CRM Sync – Student Contact (Admin / Super Admin only)

### What it is
This screen updates each student's **existing** Zoho CRM Student Contact with four values from the dashboard: their current **Google Classroom** (full name), **Teacher Name**, **Teacher Email Address** and **Grade** (Nilai).

### Who can use it
Admin and Super Admin only. Every other role is refused by the server as well as the screen.

### How to use it
1. **🔌 Check Zoho Connection & Fields.** Confirms the sign-in, finds the *Student Contacts* module and lists the Zoho field each value goes to. Missing fields are listed, and those values are skipped.
2. **📥 Load Students.** Lists the students of the active classes from the dashboard. This does not call Zoho.
3. **👁️ Preview Changes.** Reads Zoho and shows each student's status and proposed changes (old → new). Nothing is sent to Zoho. The statuses are:
   - **READY TO UPDATE**
   - **NO CHANGE**
   - **NOT FOUND**: nothing is created.
   - **DUPLICATE MATCH**: not updated.
   - **MULTIPLE CLASSES**: the student is in two active classes; fix the roster first.
   - **ERROR**
4. **✅ Sync Selected** (tick students) or **✅ Sync All**. Confirm in the box. When the sync finishes, the summary shows Updated, No Change, Not Found, Duplicate Match and Errors.
5. **🕘 Sync History** shows the audit log.

The tab has three sub-tabs: **🔄 Sync** (the steps above), **🧩 Field Mapping** and **⏰ Daily Schedule**.

### Large syncs run in batches
- **Sync Selected** and **Sync All** run in **batches**. Choose the **Batch size** next to the buttons; **75 is recommended**, because each batch then needs at most two Zoho calls (one read, one update).
- A progress bar shows students done, the current batch, Updated / No change / Not found / Errors, and the Zoho API calls used.
- You can close the page and the sync carries on by itself on the server. Open the tab again to see where it is, or press **▶ Continue here** to watch it.
- **⏹ Cancel after this batch** stops it. Students already updated stay updated.
- Only one sync runs at a time. A sync that stops responding for 30 minutes is closed automatically.
- Zoho calls are kept to a minimum:
  - One sign-in per hour.
  - One full list read, shared with a Preview made in the last 20 minutes.
  - No call at all for a batch where nothing changed.
  - Zoho search only for students missing from the list, with a limit per run.

### 🧩 Field Mapping
Each row sends one dashboard value to one Zoho Student Contact field. The dashboard values you can send are:
- **Student:** email, name, APSID.
- **Class:** Google Classroom full or short name, Grade / Nilai, section, class day, time, day + time, academic year, course ID, Classroom link.
- **People:** Class Teacher, VP and HM name and email.
- **Other:** the date of the sync, or a **Fixed value**.

For each row choose:
- **Transform:** As is, lowercase, UPPERCASE or Title Case.
- **If Zoho already has a value:** **Overwrite** replaces it; **Fill only if blank** keeps an existing Zoho value.
- **Default value:** sent when the dashboard value is blank. With "Fixed value" it is always sent.

Values are checked against the Zoho field type: picklist values in Zoho's own spelling, email, number, date and length. A value that doesn't fit is skipped with a note, never sent. Lookup, read-only and system fields are listed but can't be selected.

- The **Preview** column shows the value for a sample student.
- **🧪 Test with Zoho** reads one student's Zoho record and shows exactly what would change. It writes nothing.
- **💾 Save mapping** stores the mapping. Every change is logged in `ZOHO_FIELD_MAPPING_AUDIT` and shown under "Recent mapping changes".
- **↺ Recommended mapping** restores the five standard rows: Student APS Email (lowercase), Google Classroom, Teacher Name, Teacher Email, Grade.

**Matching:**
- Emails are compared without capitals, spaces or invisible characters, so `AADHAN_APS3319@…` in Zoho matches `aadhan_aps3319@…`.
- **Same values are always ignored.** If the Zoho value and the dashboard value differ only in capitals, extra spaces or invisible characters (for example `AADHAN_APS3319@…` and `aadhan_aps3319@…`, or `Nilai 4` and `NILAI 4`), the field counts as unchanged and nothing is sent. This applies to every mapped field.
- A student who is missing from Zoho's full list is looked up with Zoho search. Optionally, the search also checks any other Zoho email field, such as Email, and then fills Student APS Email Address.
- The Sync summary shows how many Zoho records were read and how many were found by search.

### ⏰ Daily Schedule
1. Tick **Run the Zoho sync every day**, pick the time (Eastern), and choose whether to get a summary email from attendance@.
2. Press **Save schedule**.

It runs **Sync All** with the saved mapping, in batches of the size last chosen on the Sync tab, under the same rules as the button. Google starts it within about 15 minutes of the chosen time. The last scheduled run's result is shown on the page and in Sync History. Untick the box and save to stop it.

### Good to know
- Students are matched by **Student APS Email Address**, trimmed and lowercase. A record is updated only when **exactly one** Zoho record matches.
- Only changed fields are sent, a blank dashboard value never clears Zoho, and no Zoho record is ever created.
- A Grade that is not one of the Zoho picklist values is skipped with a note.
- Results are kept in the Zoho sync spreadsheet:
  - `ZOHO_STUDENT_CONTACT_SYNC` holds the latest result per student.
  - `ZOHO_STUDENT_CONTACT_SYNC_LOG` holds every run and change.
- Setup: the Zoho connection values live only in Script Properties and are never shown on screen. See the architecture file, Round 70.

## 3C. 👣 தமிழ்த் தடம் (Tamil Thadam) — students (Admin / Super Admin read-only)

### What it is
Each student's own Tamil learning journey: **Learning Points**, **Achievements** (badges), a **Level**, a **Learning Streak**, their progress, "This Week", a month-by-month journey with milestones, and, at the end of the academic year, a **Tamil Thadam Achievement Certificate**. It is about personal progress only: there is no ranking and no comparison, and the wording is always positive.

### Who can see it
**Students, each seeing only their own journey.** HM, VP, Teachers and BOD do not see the tab and the server refuses them.
**Admin / Super Admin (r75): read-only look-up for support.** Open the tab, type a student's name, APS email or APSID (at least 2 characters) and pick the student. You see that student's journey exactly as the student sees it, under a **👁️ Read-only view** banner. There is nothing to edit, and every look-up is logged (sheet `TAMIL_THADAM_VIEW_AUDIT`: who, when, which student).
Nobody, Admin included, can add, change or remove points, badges, levels or streaks; everything is calculated automatically. A short note (முக்கிய குறிப்பு) explains this when the tab is opened.

### How points are earned (automatic)
| Activity | Points | From |
|---|---:|---|
| Joined Tamil class (per class week) | +10 | Attendance |
| Stayed for the whole class | +25 | Attendance |
| Homework completed | +10 | Google Classroom (HW_) |
| Homework submitted on time | +5 | Google Classroom |
| Quiz completed | +10 | Google Classroom (QUZ_) |
| Quiz score of 80 % or more | +10 | Google Classroom |
| Project completed | +20 | Google Classroom (TRMST) |
| Examination completed | +10 | Google Classroom (MODEL_EXAM / EXAM) |
| Appreciation certificate from the teacher | +20 | Appreciation Certificate |
| Learning-streak milestone (4, 6, 10 weeks in a row) | +25 | Attendance |

- Speaking, reading, cultural activities and class participation show **Coming Soon**. APS doesn't record them yet, so no number is ever invented.
- **Levels:**
  - 🌱 தமிழ் தொடக்கம்: 0–199
  - 🌿 தமிழ் வளர்ச்சி: 200–499
  - ⭐ தமிழ் திறமை: 500–999
  - 🏆 தமிழ் சாதனை: 1,000–1,999
  - 👑 தமிழ் சிறப்பு: 2,000+
- Each academic year (Aug–Jul) is separate.

### Good to know
- The data is kept in its own spreadsheet (Script Property `TAMIL_THADAM_SPREADSHEET_ID`, created automatically). Do not share that spreadsheet.
- Badges are defined in its `TAMIL_THADAM_BADGES` sheet, so new badges can be added there later.
- The certificate appears after the academic year ends. The school can open it earlier by listing the year in Script Property `TAMIL_THADAM_CERTIFICATE_YEARS` (for example `2026-2027`).

## 3E. 📚 Assignment Monitoring (Admin, Super Admin, HM, class VP / HM)
Shows which **ATT / HW / QUIZ** work in Google Classroom is **missing**, which is **submitted but not graded yet**, and how each class is doing. The data comes from Google Classroom (daily ~5 PM sync, or Admin **Sync now**).

- **Who sees it:** Admin, Super Admin and HM see every class. A class **VP / HM** sees their own classes. Teachers, students and BOD do not see it unless an Admin switches it on in **Admin Control → Access Control → 📚 Assignment Monitoring**. If it is switched on, teachers see their own classes and students see only their own work.
- **Statuses** (the same as the Classroom Grades tab):
  - **Missing:** past due and not turned in. This includes "0 · Missing" and a draft grade only.
  - **Submitted, not graded:** the student turned it in and the teacher has not graded it. This is **never** counted as missing.
  - **Graded / Returned:** done.
  - **Not started:** not due yet, or no due date.
- **Sections:**
  - **Overview:** classes on track 🟢 / needing attention 🟡 / requiring action 🔴, submission rate, grading completion, and escalation levels.
  - **Student Issues:** every missing or ungraded item, with its escalation level (1 Student → 2 Teacher → 3 VP / HM → 4 Admin).
  - **Teacher Grading:** grading completion for each teacher.
  - **Class Monitoring:** each class with its assignments (🟢 Complete · 🟡 some missing / ungraded · 🔴 many). Click an assignment or **Student list** to see the students.
  - **Email / Notification History:** every email that was sent.
- **Filters:** Nilai, section, teacher, class, type, assignment, status and due dates. **Search** by student name, APSID, APS email, assignment or class. They update instantly.
- **🎓 How to Grade Google Classroom Assignments:** the steps are Open Classroom → class → Classwork → assignment → Student Work → review → enter grade → **Return**.
- **Home card:** *📚 Assignment Health — this week* on the Classes screen.
- **⚙️ Admin Control (Admin / Super Admin):**
  - the **ON / OFF switch**;
  - email switches, which are all OFF until you turn them on: student reminders (about 48 h, 24 h and on the due day, plus a missing notice), the teacher "Action Required" summary, and the weekly teacher and Admin summaries. All are sent from donotreply@, and each one only once;
  - timings and escalation thresholds;
  - assignment types, and "Monitor as" for unclassified coursework;
  - excluding an assignment or a student (a reason is required);
  - **Sync now** and send reminders now;
  - the audit log;
  - **📌 ATT_ / QUZ_ — Mark as complete:** a sliding **ON / OFF** switch, *Send weekly reminder to teachers for ATT_ and QUZ_ assignments*, plus **Remind every (days)** (default 7). When ON, each class teacher gets one email every week (CC the class VP / HM and admin@) listing ATT_ / QUZ_ assignments at least 10 days old that students still need **marked as complete** in Google Classroom, with the steps. It is OFF until an Admin turns it on.

  Anything that sends email asks first.

## 3F. 📨 Apply Leave (every role)
Apply for leave **for yourself** and see your leave history. Every role has this tab: Student, Teacher, VP / HM, Head Master, Admin, Super Admin, BOD and Authorized. Admin can switch it off per role in Admin Control → Access Control.

### Apply for leave
1. Open **📨 Apply Leave**.
2. **Leave Start Date:** today by default. It can be up to 14 days in the past.
3. **Leave End Date:** follows the start date and cannot be earlier.
4. **Reason (required)**.
5. Press **Apply Leave**. The message **"Your leave request has been submitted successfully."** appears, and the leave is added to **My Leave History**.

APS has no approval step, so a submitted leave is recorded as **Approved** straight away. A leave that overlaps one you already applied for is refused with "A leave request already exists for this date range." Pressing the button twice never creates two leaves.

### Students
- **Attendance:** every class date in the leave period is marked **Excused – 70%** automatically, with a comment that quotes the leave.
  - Class dates already captured are marked as soon as you apply. Later class dates are marked when that week's attendance is captured.
  - An attendance correction a teacher or Admin already made is **never** changed.
- **Email:** from donotreply@, one email **To** your class teacher, **CC** the HM, the VP, you and admin@. It covers the dates, the reason, Excused – 70%, the teacher action and a note for parents.

### Teachers (including a class VP / HM) and other staff
- **Notice:** one email from donotreply@, **To** the HM(s) of the classes you teach or support, **CC** the VP(s) and admin@. It lists every affected class with its day and time. If no HM is named for your classes, it goes to admin@.
- **Confirmation:** a separate confirmation email to you.
- **Class coverage:** **please arrange class coverage in advance.** Arrange a Parent Teacher. If you cannot, update your weekly teacher availability (Classes → Google Classroom → 📅 Class Teacher Availability) and inform your HM in advance.
- **Attendance:** staff attendance is not changed by a leave.

### Admin / Super Admin
- **All Leave Requests:** search by name, APSID, email, reason or Leave ID, and filter by role or notification status. Each row shows the email status and the attendance result:
  - `APPLIED n`: rows marked Excused;
  - `MANUAL_KEPT n`: corrections left as they were;
  - `AUTO_AT_CAPTURE`: future dates, marked when captured.
- **Email failures:** a leave is **never lost because an email failed**. The person sees "Your leave request was saved successfully, but notification could not be sent." **Resend email** sends only the emails that failed. Two Admins pressing Resend at the same time send it only once (r100). A leave whose emails never finished (still **PENDING** after 10 minutes, for example because the run was interrupted) also shows **Resend email**.
- **Where it is stored:** `APS_LEAVE_REQUESTS` (one row per leave) and `APS_LEAVE_AUDIT` (every step). The attendance changes are also in the Attendance audit log (action `LEAVE_EXCUSED`).

## 4. 📇 Active Directory
Two sub-tabs: **🔎 Directory Search** (opens first) and **🎓 Student Onboarding Status**.

### 4.1 Directory Search
**What:** find **any** APS student or teacher in **every AY26-27 class**, in any grade. **Who:** everyone (Admin can switch it off per role in Admin Control → Access Control).
**What you see depends on your role (decided by the server):**
| | Student / Authorized | Teacher, Headmaster, Admin, BOD |
|---|---|---|
| Name, grade / Nilai, class, class teacher | ✓ | ✓ |
| A teacher's APS email | ✓ | ✓ |
| Another student's APS email, APSID, last login, online, NOT ONBOARDED | — (privacy) | ✓ |
| Google Classroom link | your own classes only | ✓ |
**How:** type at least 2 characters — a **name** (English or Tamil), an **APSID** (`APS1234` or just `1234`) or an **APS email**. Nobody is listed until you search. Each result shows a **🎒 STUDENT** or **🧑‍🏫 TEACHER** badge (plus **HEAD MASTER**), the name, APSID, APS email (with **Copy**), the current Google Classroom name(s) and, when known, last login, online dot and **NOT ONBOARDED** for students who have not signed in yet.
**Filters:** All / Students / Teachers, Grade (Nilai), **Clear** (or **Esc**). Exact APSID / email matches come first; large result sets show 60 at a time (**Show more**).
**Good to know:** the directory loads once when you open the tab (one small server call, refreshed every 10 minutes, no Google Classroom calls); after that the search runs in your browser and is instant. Students search by name (or a teacher's APS email).

### 4.2 Student Onboarding Status (unchanged)
**What:** which students have signed in to Google Classroom / the dashboard, by grade. **Who:** Admin, HM, BOD (read-only), Teachers (their students), Students (themselves).
**How:** pick a grade, search by name (English or Tamil) or email; follow up with families who have not signed in.

🎬 *Narration:* "Use Student Onboarding Status to see which students have signed in, grade by grade, so you can help families who haven't." *On screen:* grade filter → table → search a name.

---

## 5. Knowledge Base – Videos
**What:** short how-to videos for students, parents and teachers. **How:** search by title or pick a category, then press play.

🎬 *Narration:* "Need a quick how-to? Open Knowledge Base, search or pick a category, and play the video right on the page." *On screen:* search box → category → play.

---

## 6. Class Change Requests (Assign Classroom → Class Change Requests)
**Where:** since r61 it is a sub-tab of **Assign Classroom** (students and approvers see the Assign Classroom tab with just the sub-tabs they can use). Nothing else changed.
**What:** request a move to a different class or class timing. **Who:** Students raise requests; approvers (Admin / assigned HMs) approve grade by grade; the final approver completes the move. BOD read-only.
**How (student):** **Request Class / Timing Change** → choose the requested grade / class / timing → parent email → reason → tick the acknowledgement → **Submit**. Follow the status on the same screen.
**Statuses:** Request Submitted → Pending Grade Approval → Awaiting Final Approval → Approved / Rejected.

🎬 *Narration:* "To change your class or timing, open Assign Classroom → Class Change Requests and press Request Class or Timing Change. Fill in the details and submit — you can follow the status here." *On screen:* button → form → Submit → status pill.

---

## 7. Assign Classroom
Up to four sub-tabs — each person sees only the ones they may use: **Re-Map Student** and **Add/Remove Student** (below), **Class Change Requests** (section 6) and **Reference Letter Approvals** (section 9).

- **🔁 Re-Map Student** — move a student from one Google Classroom to another. Search by name, APS email or APSID → pick the target classroom → give a reason → **Re-map Student**. The **Class / Grade Change Audit Log** sits beside the form (stacked on a phone). BOD read-only.
  - The **"APS Classroom Assignment Updated"** email goes to the student, with admin@ **and the old and the new class teacher** in CC. It lists both teachers and ends with an **Important** note: the parent makes sure missed classwork and homework are completed and submitted in the new Google Classroom; the APS Grading Policy applies; for a grade change a new set of books for the new grade can NOT be guaranteed.
  - **Grades are kept (r111).** Google Classroom cannot move grades between classrooms, and after a Re-Map the old class's work is hidden. So the dashboard first saves the student's grades from the old classroom, then moves the student.
    - **What is saved:** every approved assignment (ATT_ / HW_ / QUZ_ / project / exam), with grade, maximum points, status (Completed, Turned in, Late, Missing…), and assigned / due / turned-in / graded dates.
    - **Where:** the tab **STUDENT_GRADE_TRANSFER**. The confirmation shows how many were saved, for example *"Grades saved from the previous class: 12 assignment(s), 9 graded"*.
    - **If the grades can't be read** (a Google error), the Re-Map **stops and nothing changes**; try again a minute later. (Admin can allow the move anyway with Script Property `GRADE_TRANSFER_REQUIRED` = `false`. The message then says the grades were not saved.)
    - **Nothing changes in Google Classroom** apart from the move itself. Students see nothing new there.
    - **Where to see them:** in **Examination → Grading → Grades**, a **📦 Grades carried over from a previous class** panel (view only) shows them to:
      - the student's current class teacher and class VP / HM;
      - Admin / HM / BOD who have all-classes Grading access;
      - the student (their own).
      The panel follows the classroom, assignment, status, date and search filters. If the new class has also graded the same lesson for the student, the old one is greyed out ("replaced by … in this class") and left out of the total.
    - **In the Grades table and Overall % (r113):** the old grades also appear in the student's row of the **current** class, marked **📦 Previous class: <old class>** (grey cell, view only).
      - A lesson the new class has no assignment for gets its own column.
      - If the new class has the same lesson but has not graded it yet, the old grade is shown under the current cell (*📦 Previous class: 9 / 10*).
      - **Overall %** counts these old grades too, and says so (*incl. 2 📦 from previous class*). Once the new class grades the same lesson (same category and lesson number), only the new grade counts.
      - The class average in a column header and **Export CSV** stay current-class only.
      - **Teacher's step:** use the old grade as reference and enter it in the new Google Classroom if it should carry over. After the next grade refresh, the current-class grade counts instead.
    - **Audit log (r112):** the Re-Map row in **Class / Grade Change Audit Log** shows the result under the status:
      - **📦 Grades saved: 12 assignment(s), 9 graded**;
      - or **📦 Grades NOT saved**, in red.
      Hover over the line for the full text and the **Transfer ID** (it matches the rows in STUDENT_GRADE_TRANSFER). The result is also stored in the new **Grade Transfer** column of the audit sheet; older rows stay empty.
- **➕➖ Add/Remove Student** (Admin / Super Admin; BOD sees the audit logs read-only). Two buttons at the top: **➕ Add Student** (shown first) and **➖ Remove Student**.
- **➕ Add Student** — add a student to **one more** Google Classroom. Nothing is ever removed.
  1. Type the student's **APS email** and press **Look up** (or Enter). A wrong address shows *“Please enter a valid APS email address”*; an unknown account shows *“Student not found. Please verify the APS email address.”*
  2. You see **every Google Classroom the student is in now**, each labelled **Regular Academic**, **Special Class** or **Other**.
  3. Pick the classroom to add (active AY26-27 classes; filter by Nilai, section, day, teacher or course ID). Each shows Nilai, section, day and time, teacher, course ID, number of students and status.
     - **Already in that classroom** → *“Student Already Enrolled … No changes were made.”*
     - **Regular + Special Class** or **Special + Special** → allowed.
     - **A second Regular Academic Classroom** → a red warning. Tick *“I understand this student will be enrolled in more than one Regular Academic Classroom.”* to continue (recorded as **ADMIN_OVERRIDE**).
  4. **Review & Confirm** shows the existing classrooms, the new classroom and the result. Press **Add Student** (or **Override & Add**), or **Cancel** (recorded as *Cancelled — no changes were made*). The button shows *Adding student...* and cannot be pressed twice.
  The dashboard re-checks everything on the server, adds the student in Google Classroom, checks the student is really on the roster, updates the dashboard at once, and emails the class's Primary Teacher, HM(s) and VP(s) **from donotreply@** (admin@ in CC; subject *“APS Dashboard – Student Added to Google Classroom – name”*). If the email fails the student stays added and you see a warning. If the dashboard update fails you see *“synchronization is pending … do not retry”* — the next sync fixes it. Every request, including refused and cancelled ones, is in the **Add Student Audit Log** (filter by action and status) and in the Re-Map audit log.
  - **Weekly report (automatic):** every **Monday ~7–8 AM** admin@ gets *“APS Dashboard – Weekly Report – Students Assigned to Multiple Google Classrooms”*: each student in more than one active classroom, with type, classroom, course ID, teacher, schedule and status. Students in more than one **Regular Academic** classroom are marked **Requires review**. The report never removes anyone.
- **➖ Remove Student** (Admin / Super Admin) — remove a student from **one** Google Classroom only:
  1. Search the student (name, APS email or APSID) and click them.
  2. Pick the Google Classroom (asked only when the student is in more than one).
  3. Type the reason — **5 to 200 words**, the counter shows *N / 200 words*.
  4. Check the summary (*“Remove Student from Google Classroom?”*) and warning, then **Confirm Remove** (or **Cancel**).
  The dashboard re-checks everything on the server, removes the student in Google Classroom, checks the student is really gone, and only then emails the class's Primary Teacher, HM(s) and VP(s) **from attendance@** (admin@ in CC; subject *“APS Dashboard – Student Removed from Google Classroom – name”*). If the email fails, press **Retry email** in the **Student Removal Audit Log** — the student is not removed again. If the student was already gone from Google Classroom, nothing is removed and no email is sent. The APS record, Google account, enrollment, payments, grades and other classes are never changed. A removed student disappears from the search until the next Classroom sync. BOD sees the audit log read-only.

---

## 8A. 🛡️ Admin Control (Admin / Super Admin)

Sub-tabs: **🔐 Access Control**, **👥 User Roles & Permissions** (Super Admin only) and **💾 Backup & Archive** — the last two used to be separate main tabs.

### 🔐 Access Control
**What:** a table with one row per tab / sub-tab and one column per role (Super Admin, Admin, Headmaster, Teacher, Student, BOD / On-Call Coordinator, Authorized). Each switch decides whether that role sees that tab.
**How:**
1. Click a switch to show or hide (the cell turns yellow — *changed, not saved*). Use **Search** to find a tab, or pick one role in the role filter.
2. **Undo** discards unsaved changes; **Reset role to default** (with a role picked) turns every available tab back on for that role.
3. **Save changes** → check the list → **Confirm & save**. Users see the change at their next refresh (within about 5 minutes).
4. **📜 Change history** shows who changed what and when.
**Rules (r91):**
- **Headmaster, Teacher, Student, BOD / On-Call Coordinator and Authorized:** Admin and Super Admin can switch **every** tab and sub-tab on or off. There is no 🔒 any more.
  - **Always-on cells** (such as Classes) can now be switched by Admin too, not only Super Admin.
  - **Dashed switch:** the tab is not built for that role yet. It starts **OFF**. Switching it on saves the setting, but it never grants extra access: the tab's own rules still decide what the role can open, and the server still refuses anything the role is not allowed to use.
- **Admin and Super Admin columns:** unchanged.
  - A pale OFF switch means not available for that role, for example User Roles & Permissions for Admin.
  - A pale ON switch means always on.
  - Super Admin can switch the always-on cells (gold ring), except Super Admin's own **Admin Control → Access Control**, so nobody is ever locked out.
- **Classes switched off:** if Classes is switched off for a role, those users get a short "turned off for your role" notice, or the first Classes sub-tab they can use, instead of the class list.
- **Sub-tabs and server checks:** turning a tab off also turns off its sub-tabs. A hidden tab is **also refused by the server**, so typing its address or calling it directly does not work.
- **Day one:** every role sees what it saw before.
- *Narration:* "Admins decide exactly which tabs every role sees. Open Admin Control, flip the switches, confirm, and every user sees the change at their next refresh — the server enforces it too."

## 8. User Roles & Permissions (Super Admin)
**What:** give users a dashboard role (Admin, HM, Teacher, Student, BOD) and switch tabs / buttons / filters on or off per role. **How:** enter the APS email, pick the role, keep **Active** ticked → **Save Role**. Takes effect at the user's next refresh. Also: **Generate / Copy** the Google Group email list that shares the data spreadsheet.

### 8.1 🛡️ Backup & Archive tab (Admin / Super Admin)
Open the **🛡️ Backup & Archive** tab in the main tab bar (shown to Admin and Super Admin; the User Roles tab stays Super Admin only).
- **Weekly automatic jobs (r117):** the card's **⏱️ Weekly automatic jobs** table lists each weekly job with its time, last run, result and next date, and shows **Apps Script triggers used: N of 20** (Google allows 20 per project; shown in red near the limit). *set up* means the job was installed this week and runs from next week.
- **Automatic, every Sunday ~2 AM:** a full **backup** — a copy of the dashboard's Apps Script project (code) and of every dashboard spreadsheet (main, Attendance, Exam Question Paper) plus a `MANIFEST.txt` with restore steps — in a dated folder inside the Drive folder **APS-DASHBOAD-SYSTEM-BACKUP-CLAUDE**. The newest 8 backups are kept; older ones go to Drive Trash (recoverable for 30 days).
- **Then the 3-month audit archive:** rows older than **90 days** in the audit / log sheets (Attendance, Class Access, Examination, Roster, Roster Sync, Assign Classroom, Teacher Availability email log, Exam Question Paper admin audit) are **copied** to the yearly *APS Dashboard Audit Archive* spreadsheet in the same folder and only then removed from the live sheets. **Never archived:** Exam Question Paper downloads, letters, grade-change requests, rosters, grades and attendance weeks.
- **On the card:** last backup / archive, rows ready to archive, a per-sheet preview, **💾 Back up now**, **🗂️ Archive old audit rows…** (asks to confirm; backs up first) and **📁 Open backup folder**.
- **Restore:** open the dated backup folder → use the spreadsheet copy (or *File → Make a copy*) and point the matching Script Property at it; for code, open the *APS Dashboard SCRIPT (code)* copy and copy the files back into the live project, then deploy a new version. Archived audit rows can be copied back from the archive spreadsheet.

---

## 9. Letters
The **📄 Letters** tab (formerly "Reference Letter") shows letter-type cards: **Reference/Volunteer Letter** (teachers), **Student Appreciation Letter** (teachers) and **Teacher Appreciation Letter** (Admin, Super Admin, Head Master).
- **Teachers — Reference/Volunteer Letter:** enter your full name and reason (20–150 words) → **Submit**. Follow approval; the finished letter is emailed.
- **Teachers — 🏅 Student Appreciation Letter** (APS Appreciation Certificate):
  1. **Student:** type in the search box, then pick the student from the list. Only students in your own AY26-27 Google Classroom classes are listed (each student once; the class is shown next to the name).
  2. **Student Name:** filled in from Google Classroom — change it if the certificate should show a different spelling. Google Classroom is not changed.
  3. **Student Email:** shown for checking; it can't be changed. The certificate always goes to the student's APS email on the class roster.
  4. **Teacher Appreciation:** 5 to 15 words (the counter shows e.g. "8 / 15 words").
  5. Press **Generate & Email Certificate**. The button shows "Generating Certificate…"; when done you see "APS Appreciation Certificate generated and emailed successfully to …".
  - The PDF is emailed **to the student**, with a copy **to you** and to **admin@avvaiyarpadasalai.org**. The date on the certificate is today's date as MM-DD-YYYY (e.g. 10-06-2026).
  - The same student can't be sent two certificates within 2 minutes (protects against double clicks).
  - Messages you may see: "Please select a student.", "Please enter the student name.", "Appreciation must contain at least 5 words.", "Appreciation must contain no more than 15 words.", "The selected student does not have a valid APS email address.", "The certificate was generated, but the email could not be sent." 
- **Filters:** Student Appreciation Letter has a **Google Classroom** filter; Teacher Appreciation Letter has a **Nilai** filter (MUNMAZHALAI, MAZHALAI, NILAI 1 … NILAI 8, THULIR).
- **Admin / Super Admin / Head Master** also see the **Student Appreciation Letter** with **every** AY26-27 class and student (teachers see only their own classes).
- **Not in the list?** Tick "… not in the list? Type the name and APS email instead", type the full name and the person's **APS** email (outside addresses are refused). Teachers can do this for students; Admin / Super Admin / Head Master for students and teachers. The letter is still copied to you and admin@, and the history marks it "Typed (manual)".
- **🗂️ Appreciation Letter History** (below the form): when (EST), letter type, recipient, recipient email, class, who sent it (and their role), how the recipient was chosen (from roster / typed) and the result. Admin / Super Admin / Head Master see every letter; teachers see the letters they sent. Press **🔄 Refresh** to reload. The appreciation text itself is not stored.
- **Admin / Super Admin / Head Master — 🌟 Teacher Appreciation Letter:** the Letters tab shows this choice to school leaders. Pick any AY26-27 class teacher (search by name or class), check the name printed on the letter, write a 5–15 word appreciation and press **Generate & Email Letter**. It uses the same certificate design; the PDF goes **to the teacher's APS email**, with a copy to you and to **admin@avvaiyarpadasalai.org**. (Admin / HM / Tech Team accounts are not in the list.)
- **Approvers — Reference Letter Approvals** (since r61: **Assign Classroom → Reference Letter Approvals**): approve or reject each request; the final approver generates and emails the letter. Admins can also raise a letter on a teacher's behalf.

---

## 10. Attendance

### What it is
Weekly attendance for students and teachers, captured automatically from **Google Meet** join/leave times. One sheet per school week (`AWK01ATT` = Week 1, …). School weeks run Friday–Sunday (Monday–Thursday belong to the coming weekend's week).

### Who can use it
Admin / HM: every class, corrections, bulk override, audit log. BOD: read-only. Teachers: their students (can correct) and their own attendance (view). Students: their own attendance.

### How the score works
- **Class length** = teacher's first join to last leave (or the whole class if the teacher was absent). 90 minutes or more counts as 95 minutes.
- **Attended %** = minutes in the Meet ÷ class minutes.
- **Week score:** above 75% = 100 · 60–75 = 90 · 50–59 = 80 · 40–49 = 70 · 30–39 = 60 · 20–29 = 50 · below 20 = 0.
- **Overrides:** Present 100 · Partial 70 · Excused 70 · Absent 0.
- **Overall** = all weeks, weighted by class time.

### How to use it
- **Filters:** Week, Class, Date, Role, Teacher, Status and Search (name, APSID, email) — the list updates automatically.
- **Correct a record (Override):** click **Override** → choose the status → reason (5–25 words) → **Save**. Every change is in the **Override Audit Log**.
- **Bulk Override (Admin):** pick week, class(es), roles, current status and new status → reason → **Preview** → **Apply**.
- **Sync Attendance Now (Admin):** refreshes the **current week** from Google Meet.
- **Course ↔ Meet Link Mapping (Admin/HM):** filled **automatically from Google Classroom** every day at 5:00 PM EST (Source = AUTO). Admins can press **Auto-fill from Google Classroom** to do it now. A link saved by hand (Source = MANUAL) is never replaced.
- **Teachers:** "My Students' Attendance" (correct with a reason) and "My Attendance" (view only).

### Good to know
- **Only the current week is captured from Google Meet. Past weeks are never overwritten**, so corrections made by teachers after the week stay final. (The Monday 5 AM automatic run can still finish the weekend that just ended — until Monday 8 AM.)
- A **weekly report email** per class is sent Monday 7:00 AM EST from **attendance@avvaiyarpadasalai.org** to the teacher and students, with **admin@ in CC**. **Reply** goes to the class teacher(s). If attendance@ cannot sign in, sending **pauses** (nothing is sent from any other address), admin@ gets an *ACTION NEEDED* email, and the remaining classes go out on the next daily run (Tue/Wed) once it is fixed.
- Admin, HM and support accounts are never included.
- **Students who moved class (r108):** a class teacher, or the class's VP / HM, also sees the **earlier weeks** of every student now in their class, even when those weeks were recorded in a **previous or closed class**. Examples: Aadhya (APS3352), moved from NILAI 5 - SA (closed) to NILAI 5 - EB; Ananya and Prathika, moved from NILAI 5 - PD to NILAI 5 - PC.
  - Those rows are marked **Previous / other class** and are **View only** (no Override). Only that class's teacher / HM, or an Admin, can change them.
  - Other students of the old class, and its teacher, are never shown.
  - Admin, school-wide Head Master, BOD and student views are unchanged.

### On-Call Teacher Attendance
- **What:** attendance of on-call teachers — every account whose email starts with **TCS_** or **TTS_** (any capitals).
- **Who:** Admin, Super Admin, HM, BOD.
- **How:** **On-Call Teacher Attendance** opens a separate window. Default: classes they joined. Tick "Include rostered classes not joined" to also see classes they are rostered on but did not join. Filter by week, search, **Export CSV**, **Print**.

🎬 **Video scene — Attendance for teachers**
- *Narration:* "Attendance is taken automatically from Google Meet. Open the Attendance tab to see your students for the week. If something is wrong — for example a student's internet failed — press Override, choose the right status and write a short reason. The change is saved in the audit log."
- *On screen:* Attendance tab → week filter → student row → Override → status + reason → Save → "ADJUSTED".

🎬 **Video scene — Attendance for Admins**
- *Narration:* "Admins can refresh the current week with Sync Attendance Now, correct a whole week with Bulk Override, and review every change in the audit log. Past weeks are protected — a later sync never overwrites them."
- *On screen:* Sync Attendance Now → status line → Bulk Override Preview → Apply → Audit Log → On-Call Teacher Attendance window.

---

## 11. Examination

### 11.1 Announcements (Admin / HM)
Post, modify or delete an announcement in every (or selected) AY26-27 classroom. Each announcement gets an **ANNOUNCEMENT_ID** and signature automatically; use the ID to modify or delete it everywhere. Per-classroom results: Success / Failed / Skipped / Already exists; **Retry Failed** repeats only failures.

### 11.2 Classwork (Admin / HM)
Schedule an Assignment, Quiz Assignment, Question or Material into every or selected classroom, at a future date and time (EST). Duplicate protection; **Retry Failed**.

### 11.3 Exam Question Paper
- **Admin:**
  1. Create a paper per class (title, exam week or custom date / time).
  2. Attach the PDF from a Google Drive link (or the LIVE_QUESTION_PAPER_DOWNLOAD_LINK sheet).
  3. **Publish**.
  4. The paper opens **15 minutes before class start** (configurable) and closes at class start (or class end, if allowed).
  5. Other actions: Lock / Unlock / Cancel / Republish, Preview (watermarked), Export CSV.
- **Students:** the paper appears with a **countdown**. When it opens, confirm your name, APSID and the non-sharing pledge → **Download** your personal copy. Each copy carries your personal **DOWNLOAD KEY** in red at the top and bottom of every page. If you write on plain paper, write that key on every answer sheet before uploading to Google Classroom.
- **Teachers / HM:** monitor downloads (who downloaded / who did not), release times, and suspicious activity. To verify an uploaded answer sheet, type its DOWNLOAD KEY into Search.
- **Teacher / VP / HM / Admin — when a student cannot download the paper:**
  - **🔒 Download Teacher Copy — CONFIDENTIAL** (Question Papers list, r104): the official paper, marked **TEACHER COPY** on every page, with no student download key.
    - **Who:** only the class's own teachers (Primary Teacher and co-teachers on the Google Classroom), plus Admin and Super Admin. Head Masters, VPs and the support accounts that sit in many classes do not get it unless they teach that class. Students, parents and BOD never see it, and the server refuses them even if they try another way.
    - **When:** only if the paper was **published at least 24 hours before the exam start** (for example, Saturday 12:00 PM exam → published by Friday 12:00 PM), and from **60 minutes before the start**. Not for cancelled, locked or unpublished papers.
    - **Every time** you click it, a red **CONFIDENTIAL** warning asks you to confirm. **Cancel** downloads nothing.
    - **Email 60 minutes before the exam:** each assigned teacher gets an email from donotreply@, with the subject *CONFIDENTIAL - [Exam] - [Google Classroom] - [Teacher]*. It holds a link to the Dashboard, not the PDF. Each teacher gets it once.
    - Students still download only from the Dashboard with their **UNIQUE DOWNLOAD KEY**; the Teacher Copy is for reference if a student has trouble.
  - **📧 Send to Student** (Students list, after **View**): a confirmation shows the student's name, APSID, APS email, the examination and class / grade. **Send Question Paper** emails the student's **own** copy (with their download key) as a PDF attachment, from attendance@ to their APS email; the email gives your name and email for questions. The row then shows **Emailed <date time>**, and sending again first warns that it was already emailed.
  - **Send to Student** is available **only for your own classes** (Teacher, class VP / HM) or every class (Head Master, Admin), only once the paper is **published**, **not locked or cancelled**, and **from its release time**, the same moment students get it (unchanged). BOD and students do not see these buttons.
  - A student without a valid APS email (…@avvaiyarpadasalai.org) cannot be emailed — the button explains why. Every send (SENT or FAILED, with the error) is recorded in **EXAM_QUESTION_PAPER_EMAIL_AUDIT**.
- **📧 Automatic Question Paper Email — "Send Email to Student After [X] Minutes" (r99):** a backup for students who are in the exam's Google Meet but have not downloaded the paper.
  - **Where:** Exam Question Paper → the **Automatic Question Paper Email** box (Admin; a Head Master too when `EXAM_QUESTION_PAPER_HM_CAN_MANAGE=true`). Teachers, students and BOD do not see it.
  - **How:** pick the **exam**, switch **ON**, enter the minutes (a whole number from **1 to 120**; default 20), then **Save**. The setting applies to every class of that exam; other exams keep their own setting. It is **OFF** for every exam until someone switches it on. An invalid number shows "Please enter a valid number of minutes."
  - **What happens:** from **exam start + X minutes** (Eastern Time) until the class end time, the dashboard checks every 5 minutes. For each enrolled student it looks at:
    - **Downloaded** from the Dashboard → nothing is sent.
    - **Marked ABSENT by staff** for that class date (Unreported Absence) → never sent. Attendance is not changed.
    - **In the class Google Meet** (a live participant, or a Meet session in this class's Meet since the exam started) → the student's **own** copy, with **their own download key**, is emailed **once** to their **APS email only** (from attendance@, subject "APS Examination – Question Paper"). Parents, teachers, HM and VP are not emailed.
    - **Not seen in the Meet** → not sent now. The student is checked again on the next run, so someone who joins later still gets it before the class ends.
    - **Meet status unknown** (r100) → not sent; shown as "Meet Status Unknown – Email Not Sent". This happens when there is no Google Meet data for the class at the exam time, typically for an exam on a **custom date / time** outside the class's regular time. Saving the setting for such an exam shows a warning.
  - A failed email is retried at most 3 times. A Dashboard download after the email is recorded as usual; both records are kept.
  - **Never twice (r100):** a student who downloaded on the Dashboard is never emailed, even when the dashboard was busy at that moment. If the log cannot be read, the check sends nothing that run. A class added to the exam later takes the exam's setting. If the classes of one exam have different settings, the box shows **Mixed**, and Save applies one setting to all.
  - **Where to see it:** in the papers list ("📧 Auto email after X min"), under each student's Download Status ("📧 Auto Email Sent", "Not Online – Email Not Sent", "Unreported Absence – Email Not Sent", "Auto Email Failed"), and in the **Automatic Emails Sent / Not Sent / Not Online / Unreported Absence** tiles, which you can click to filter the student list.
  - **Records:** every decision is logged in **EXAM_QUESTION_PAPER_AUTO_EMAIL_LOG**, with the exam, student, configured minutes, download, Meet and attendance status, the result and the reason. Only a masked key reference is stored there. Sent emails also appear in EXAM_QUESTION_PAPER_EMAIL_AUDIT ("Automatic fallback") and the Audit Log.
  - The Script Property `EXAM_QP_AUTO_EMAIL_ENABLED=false` turns the whole feature off.
- **Monitoring tiles:** Total Exams, Today's Exams, Classes, Students, Published, Pending, Eligible, Downloaded, Not Downloaded, Download %, Failed, Unauthorized, Repeated, and (r99) Automatic Emails Sent, Automatic Emails Not Sent, Not Online, Unreported Absence.
- **Display Past Exams (r92):** a switch next to the Question Papers / Students / Download Activity buttons, and above the student's list.
  - **OFF (default):** only papers whose **Exam Date is today or later** (Eastern Time) are listed in **Question Papers** and **Students**, and in the student's own list. Today's exam stays listed all day.
  - **ON:** completed (past) exams are listed too, exactly as before, including View, Download Teacher Copy, Send to Student and the student's own download record and key.
  - The switch filters what is already loaded (no extra loading), works the same for every role that can open Exam Question Paper, and resets to OFF when the page is reloaded.
  - **The statistics follow the switch (r95):**
    - **OFF:** every tile (Total Exams, Today's Exams, Total Classes, Total Students, Published / Pending Papers, Students Eligible, Downloaded, Not Downloaded, Download Rate, Failed Downloads, Unauthorized Attempts, Repeated Downloads) counts only exams dated **today or later**.
    - **ON:** the tiles count the full exam history.
    - **Download Activity** and **Suspicious Activity** follow the switch too. The **Audit Log** always shows everything.

### 11.4 Grading (Google Classroom Grades)
- **What:** the Google Classroom **Grades** of the classrooms you are assigned to, from the last sync (searching and filtering never calls Google Classroom).
- **Which assignments:** only approved ones, by title prefix:

  | Prefix | Category |
  |---|---|
  | `ATT_` | ATTENDANCE |
  | `HW_` | HOMEWORK |
  | `QUZ_` | QUIZ |
  | `TRMST` | PROJECT WORK |
  | `MODEL_EXAM` / `EXAM` | EXAMINATION |

  Everything else (WELCOME, NOTES, materials …) is ignored.
- **Grades view:**
  - One row per student. **Student Name · Student Email Address · Google Classroom Name · Overall** stay **frozen on the left** while you scroll sideways; on a phone only Student Name stays frozen.
  - Assignments run **newest lesson first** (LSN_10 … LSN_2, LSN_1), with HW, ATT, QUZ, TRMST, MODEL_EXAM, EXAM inside a lesson.
  - For each assignment: **Graded Mark**, **Graded Type** (GRADED / UNGRADED) and **Dates** (assigned, due, turned in, graded — MM/DD).
- **Assignment Report view:** one row per student and assignment with dates, mark, graded type and status.
- **Statuses:** Assigned · Turned in · Turned in · Late · COMPLETED (returned) · Missing (past due) · Reclaimed.
- **Filters:** Search, Nilai, Classroom, Assignment, Status, Graded Type, Assigned from / to, Active / Inactive students. **Export CSV** downloads exactly what you see.
- **Sync Now (Admin):** 2 Google API calls per classroom; optional roster refresh. Runs automatically every day at 5:00 PM EST.
- **Students:** "My Grades" and "My Assignments" show only your own marks.
- **Changing a grade:** the Class Teacher / Head Master changes it in Google Classroom (Grades tab); it appears here after the next refresh.

🎬 **Video scene — Grades**
- *Narration:* "The Grading tab shows Google Classroom grades for your classes. Student name, email, class and overall percentage stay fixed on the left while you scroll through assignments — newest lesson first. Each assignment shows the mark, whether it's graded, and the key dates. Use the filters to find missing work, and export to Excel."
- *On screen:* Examination → Grading → Grades matrix → scroll right (frozen columns stay) → Status filter "Missing" → Export CSV.

---

## 11A. 🎥 GCM - Preview (Admin only)

### What it is
One page that shows the Google Meet of every active AY26-27 class, so an Admin can see which classes are running right now.

### Who can use it
**Admins and Super Admins only.** HM, VP, teachers, students and BOD do not see the tab, and the server refuses them even if they try to open it directly.

### How to use it
1. Open the **🎥 GCM - Preview** tab.
2. **🟢 Current Google Meets** shows the classes in session now as small 16:9 cards. Classes that have really started in Google Meet come first. Each card shows: the LIVE badge, **🔇 MUTED**, whether the teacher is in the Meet, how many students are in it, the live status line (for example "Class Started — Teacher joined 6:28 PM · 12 students joined") and the class time in EST. Every class (cards and rows) lists **Primary Teacher**, **Head Master** and **Vice Principal** in small type ("Not set" when the class has none).
3. **🟡 Upcoming Google Meets** lists the classes still to come this week, sorted by start time, then grade, then section. **⚪ Completed this week** is folded away; click it to open it.
4. Filter by **Grade**, **All Class Timing**, **Status** or **Search** (class, teacher or section). Filtering happens on the page, so it is instant.
   - **All Class Timing** lists every class time currently in use, for example *FRI 6:30 – 8:00 PM EST* or *SAT 12:00 – 1:30 PM EST*, sorted by day and then start time.
   - Picking one shows only the classes with exactly that day, start and end time.
   - The list is built from the classes on the page. A new class time (for example *SUN 7:30 – 9:00 PM EST*) appears after the next refresh, and a time no class uses any more disappears.
5. Every class (cards and rows) has three buttons, each with its own **Copy link**:
   - **🎥 Open Meet** opens that class's Google Meet in a new tab. On Google Meet's own "Ready to join?" screen, turn your microphone and camera **off** before you join.
   - **🏫 Open Classroom** opens the class in Google Classroom.
   - **💬 Join WhatsApp** opens the class WhatsApp group (from the WhatsApp_Group_Links sheet).
   A class without that link shows "No Meet link", "No Classroom link" or "No WhatsApp link".
6. Press **🔄 Refresh** to check Google Meet again right now. The page also refreshes by itself every minute.

### Good to know
- **Why there's no video:** Google Meet does not allow other websites to show its video inside a page. Each card shows "Preview unavailable — Google Meet does not allow embedding" and the class's Meet status instead.
- The page is always silent. It never uses your microphone or camera, never joins a Meet and never opens one by itself.
- "No Google Meet link available" means the class has no Meet link yet (see section 14). "Meet unavailable" means the saved link is not a valid Google Meet link.
- If the page can't load, it says "Unable to retrieve Meet information. Please try Refresh."

🎬 **Video scene — GCM - Preview (Admin)**
- *Narration:* "Admins have a GCM Preview tab. It shows every class's Google Meet, with the classes running right now at the top: who is in the Meet, how many students have joined, and the class time. The page is always silent. Google Meet can't be shown inside the dashboard, so press Open Meet to look in, and turn your microphone and camera off on Meet's join screen."
- *On screen:* GCM - Preview tab → LIVE cards with 🔇 MUTED → status filter → Open Meet button → Meet pre-join screen with the mic/camera off.

---

## 11B. 🎫 Tickets
**What:** a helpdesk inside the dashboard. Every ticket gets a number like **APS-20261007-0001**, an owner, a full conversation and a permanent audit history. **Who:** everyone signed in (BOD is read-only).

**Sub-tabs:** 🙋 **My Tickets** (ones you raised) · 📥 **Assigned to Me** (staff; teachers / HM can also tick *Include my classes' tickets*) · ➕ **Create Ticket** · Admin only: 🗂️ **All Tickets**, 📊 **Ticket Reports**, ⚙️ **Ticket Settings**.

**Types and who gets them automatically**
| Type | Student | Assigned to |
|---|---|---|
| 📚 BOOKS | optional | simplysuga_aps501@ |
| 🛠️ TECH SUPPORT | optional | info@ and info1@ |
| 📅 ATTENDANCE · 📝 LEAVE | required | the student's Primary Teacher + Headmaster + VP |
| 📝 EXAMINATION | required | Teacher + HM + VP + examinations_aps9021@ |
| 🏫 CLASS ROOM | required | Teacher + HM + VP + info@ + info1@ |
| 🎮 KAHOOT | required | Teacher + HM + VP + games_aps9020@ |
| 🎉 EVENTS | required | Teacher + HM + VP + events_aps9018@ + competitions_aps9019@ |
| 📌 OTHERS | optional | an Admin assigns it |
Teacher / HM / VP come from the class's own data (Course Description = Primary Teacher, Room "VP Email / HM Email") — the same data that gives class access. If one is missing the ticket is still saved and flagged **⚠️ Needs Admin**.

**Create:** choose the type → (students: you are selected automatically; staff: search the student by name, APSID or APS email and pick the class) → check the Student / APSID / Classroom / Primary Teacher / HM / VP panel → subject, description, priority (LOW / NORMAL / HIGH; Admin can also set URGENT), up to 3 attachments (5 MB each) → **Submit**. Double clicks never create two tickets.

**Status:** NEW → ASSIGNED → IN PROGRESS → WAITING FOR USER → RESOLVED → CLOSED. Teachers / HM / VP on a ticket can set In Progress, Waiting for User and Resolved; only Admin can Close and **Reopen** (back to In Progress). A staff reply moves a new ticket to In Progress; the requester's reply moves Waiting / Resolved back to In Progress.

**Conversation:** requester (blue), staff (green) and 🔒 **internal notes** (yellow, staff only — never shown or emailed to students / the requester).

**Admin:** All Tickets search (number, student, APSID, email, requester, subject, description, assignee) and filters (type, status, priority, assignee, student, dates, created by) with paging; change type (optionally re-apply its rules), priority and status; **Assign / Reassign** — replacing automatic assignees is recorded as **ADMIN OVERRIDE** (previous and new assignees, admin, time, reason); add / remove participants; full audit history; reports; settings.

**Email:** every ticket email comes from **donotreply@avvaiyarpadasalai.org**, always copies **admin@avvaiyarpadasalai.org**, never sends anyone the same email twice, and links straight to the ticket (sign-in first). Emails use the **standard APS email layout** (APS logo header, ticket number, colour badges for status / priority / type, a short details table, the message, an **OPEN TICKET IN APS DASHBOARD** button, the APS footer) and read well on a phone and a laptop. Subjects keep the ticket tag first and then say what happened: `[APS Ticket #APS-…] Type - Student` for a new ticket, `[APS Ticket #APS-…] New Reply - Books - Student`, `… Ticket Resolved - …`, `… Status Updated: In Progress - …` (one line, at most 120 characters). A failed email never loses a ticket (it is logged as EMAIL_FAILED).

**Email setup (Admin, once):** Google Apps Script cannot sign in with a username and password, so the donotreply@ password is **never** stored anywhere. Use one of these, entered only as **Script Properties** (Apps Script → Project Settings → Script Properties):
1. **Service account (recommended):** a Google Cloud service account with *domain-wide delegation* for scope `https://www.googleapis.com/auth/gmail.send` (Workspace Admin console → Security → API controls). Paste its JSON key as `TICKET_MAIL_SERVICE_ACCOUNT_JSON`.
2. **Or a refresh token for donotreply@:** `TICKET_MAIL_OAUTH_CLIENT_ID`, `TICKET_MAIL_OAUTH_CLIENT_SECRET`, `TICKET_MAIL_REFRESH_TOKEN` (generated once while signed in as donotreply@ with the `gmail.send` scope).
Optional: `TICKET_MAIL_FROM` (default donotreply@…), `TICKET_MAIL_ALLOW_MAILAPP_FALLBACK=true` (temporary: sends from the dashboard account with Reply-To donotreply@). Ticket Settings shows the mode — never the secret.

---

## 11D. 👪 APS Parent Portal (Admin)

The **APS Parent Portal** is a separate website for parents, with its own link. The Dashboard does not change for parents: they never sign in here.

**What parents do in the Portal:**

1. **Sign in** with their personal email and a 6-digit code from donotreply@.
2. **Fill in family details** and confirm their **timezone**.
3. **Add a child.** A new APS student, or an existing one found by their APS email.
4. **Choose a real class.** Each class shows **APS CLASS TIME (Eastern Time)** next to **YOUR LOCAL TIME**.
5. **Tick the timezone confirmation** to reserve a seat for 15 minutes.
6. **Confirm again** on the **Final Class Confirmation** screen, then **pay with PayPal**.

After payment the enrollment waits for the **student evaluation** and Admin approval. The approval screens come in the next release.

**What changed in the Dashboard (r80):**

- Classes now hold up to **8 students** (was 7). The Assign Classroom warning and the Class Change checks use 8.
- Behind the scenes the Dashboard answers the Portal's signed requests:
  - it sends Portal emails from donotreply@;
  - it saves parents, students and enrollments to Zoho;
  - it checks whether an APS email belongs to a current student;
  - it lists this year's classes for the Portal's class list.

  Every request is logged in the **Portal_Bridge_Log** sheet.

**Admin tasks (phase 1, in the Parent Portal script editor):**

- **Open a class for registration:** run `ppAdminSetRegistration('<Class_ID>', true)`. New classes copied from Google Classroom arrive closed.
- **Decide a discount or fee waiver:** run `ppAdminSetFee('<Enrollment_ID>', amount, 'reason')`. Amount 0 means a full waiver. The parent's seat stays reserved for up to 60 days while you decide.
- **"Student link needs verification" email:** a parent tried to link an existing student, but their email does not match the APS record. Check with the family. Then set **Link_Status = LINKED** in the Portal's `PP_Students` sheet.
- **"Paid over capacity" email:** place the student in another section. Never ask the family to register again.

**Tips:**

- If a parent says the class time looked different, open `PP_TZ_Confirmations`. It shows exactly what they saw and confirmed, in both timezones.
- Payment is recorded only after PayPal confirms it. A parent who closed the page after paying is picked up automatically within 10 minutes.

🎬 **Video scene.** *Narration:* "Parents now enroll in the APS Parent Portal. Every class shows the APS time in Eastern Time and the family's own local time, and the parent confirms both before paying." *On screen:* the class card with the two time boxes, the tick box, the Final Class Confirmation screen, then the My Children card showing "Paid — student evaluation next".

## 12. Automatic schedules

| What | When (EST) |
|---|---|
| Google Classroom → dashboard data | daily 5:00 PM (plus Admin **Force Sync** anytime) |
| Daily Force Sync, Attendance sync, Grading sync and Meet-link auto-fill | every day 5:00 PM |
| Attendance sync (finishes the past weekend) | Monday 5:00 AM |
| Weekly attendance report email per class (from attendance@, CC admin@) | Monday 7:00 AM (unfinished classes resume Tue/Wed) |
| Weekly Class Teacher Availability report email (from attendance@, CC admin@) | Tuesday–Friday 6:00 PM |
| Parent-Teacher Arranged "START GOOGLE MEET" email (from donotreply@, CC admin@) | Friday ~5:30 PM, Saturday ~11:30 AM, Sunday ~6:30 PM |
| "New student added to your class" email to the class teacher (from donotreply@, CC class HM + admin@) | after every Google Classroom roster sync (daily ~5 PM + Admin Sync Now) |
| Weekly report — students in more than one Google Classroom (from donotreply@ to admin@) | Monday ~7–8 AM |
| “Mark as complete” reminder to the class teacher for ATT_ / QUZ_ work at least 10 days old (from donotreply@, CC VP / HM / admin@; weekly — only when an Admin has switched it ON in Assignment Monitoring → Admin Control) | checked nightly ~11 PM |
| Assignment Monitoring emails (from donotreply@; only the ones an Admin switched ON) | hourly check: student reminders ~48 h / 24 h / 6 h before the due time + missing notice; teacher summary after 7 PM (at most every 3 days); weekly teacher + Admin summary Monday from 7 AM |
| Weekly Teacher Appreciation — scores the Monday–Sunday week that just ended; Tamil appreciation emails to eligible teachers (from attendance@, only when switched ON) and the admin report (admin@; [PREVIEW] while emails are OFF); monthly “consistently outstanding” email in the first run of each month (👩‍🏫 Volunteer/Teacher Management) | Wednesday ~7–8 PM |
| Grading Help Team report — student work turned in more than 21 days ago and still not graded / returned (from donotreply@ To grading@, CC admin@; only when something is pending; switch in Assignment Monitoring → ⚙️ Admin) | Tuesday ~8–9 AM |
| Dashboard screen auto-refresh | every 5 minutes (while the tab is open) |
| Live / status flags (Live, Teacher NOT in class, Needs Tech Support) seen by others | within about 45 seconds |
| Online dot, last login and Meet / Classroom activity of people in your classes (r121) | with the same check — about every 45 s during class time, 90 s otherwise |
| Chat | every 15 seconds while the chat is open (unread badge every minute) |
| Live Google Meet class status (today's classes) | about every 2 minutes during class time |
| **System backup + 3-month audit archive** | **every Sunday ~2–3 AM** |
| Remove saved last-login / onboarded / Google Review prompt data of people in no active class and inactive 180+ days (see 12B) | Sunday ~3–4 AM |
| **How the weekly jobs run (r117):** one hourly trigger, `apsWeeklyJobs`, runs the weekly jobs above (backup + archive, multiple-classroom report, Grading Help Team report, student absence, class consolidation analysis + email, Teacher Appreciation) in the first hourly check at or after their hour, at most once a week. A missed run is caught up within 24 hours; a failed run is retried up to 3 times. Status: Admin Control → Backup & Archive → ⏱️ Weekly automatic jobs | hourly check |
| Teacher Copy email (CONFIDENTIAL, from donotreply@, Dashboard link only) to each assigned teacher, for papers published at least 24 h before the exam | 60 minutes before each exam start (checked every 5 minutes) |
| Weekly Class Consolidation Analysis — analysis, then email from donotreply@ to HM / VP + admin@ and the fixed review list (see 12A) | Wednesday ~7–8 PM (analysis), ~8–9 PM (email) |
| Daily Class Summary & Review (Tamil management report, from donotreply@ to board@amchats.org + admin@; see 12C) — **the morning after each class day** | attendance capture ~6:00 AM, report ~7:00 AM |
| Monthly Class Summary & Review (see 12C) | 1st of the next month ~8:00 AM |
| Continuous Student Absence check — admin report to admin@ + “We Miss You in Tamil Class!” email to each student (CC class teacher), from donotreply@ (see 12D; starts in DRY RUN) | Wednesday ~9–10 AM |

### 12B. Storage health (Admin) — r103

Apps Script keeps the dashboard's small settings in **Script Properties**, which has a limit of **500 KB**. On 10/30/2026 that store filled up, and every dashboard load failed with *"You have exceeded the property storage quota"*.

- **Where the large lists live now:** online status, last login, country and onboarded students, plus the monthly Google Review prompt flags, are kept in a **second store**: the User Properties of the account that deploys the web app. It has its own 500 KB limit. The data moves there automatically on first use, and nothing is lost.
- **Always deploy from the same Google account.** The second store belongs to the deploying account. If a different account deploys, last login, onboarded flags and countries start again from empty. Settings are not affected.
- **A full store no longer stops the dashboard.** If storage is ever full again, the dashboard still loads. Only the online dot, last login and similar display details stop updating, and a warning is logged.
- **Daily check (~5 PM EST, with the daily sync):**
  - Above 70%: removes technical diagnostics and old-week availability data.
  - Above 80%: emails admin@ once a day, from attendance@.
- **🧹 Clean up temporary data (r118, Admin / Super Admin):** Admin Control → Backup & Archive shows **Property storage** (both stores, KB and %; amber at 70%, red at 80%), how much temporary data can be cleaned now, and the last clean-up. The **🧹 Clean up temporary data…** button first lists what it will handle (key names and sizes only — never values), and nothing changes until you press **Yes, clean up**. It runs the same clean-up as the daily check, at any usage level:
  - moves per-person lists still in Script Properties (online status, last login, country, onboarded, Google Review prompt flags) to the second store — **kept, not deleted**;
  - deletes only the fixed list of technical diagnostics, which rebuild themselves;
  - removes old-week entries from the live availability overlay (this week and later are kept).
  - **Never touched:** settings, switches, email lists and anything else in Script Properties. Each run is a row in the **APS_STORAGE_CLEANUP_LOG** sheet (who, sizes before / after, key names handled; newest 500 rows kept). The button is greyed out when there is nothing to clean.
- **Second store diet (r119):**
  - **Country flags now come from a Google Sheet (r120):** the old property list (about 139 KB) is deleted by the next daily check (or at once with **🧹 Clean up temporary data…**) and never comes back. See **🌍 Users outside the USA** below.
  - **Last login and onboarded lists are stored compact** (about half the size). The dashboard shows exactly the same Last Login and Onboarded information. Existing data is compacted on its next save; to do it at once, run `compactPersonData()` in the editor. *Before rolling back to r118 or older,* run `expandPersonDataForRollback()` first.
  - **Weekly clean-up of people who left — every Sunday ~3–4 AM** (in the weekly-jobs table): last-login, onboarded and Google Review prompt entries are removed for people who are **not in any active AY26-27 class AND have had no activity for 180 days** (Script Property `APS_PERSON_DATA_KEEP_DAYS`, 30–3650). Anyone in a class, or active within 180 days (for example office staff who use the dashboard), is kept. Safety: if the roster can't be read nothing is removed, and if more than 40% of people would go at once it stops (SAFETY_STOP) for a check. Editor: `previewPersonDataPrune()` shows the counts without changing anything; `runPersonDataPruneNow()` runs it (`runPersonDataPruneNow(true)` overrides the 40% stop).
- **🌍 Users outside the USA (r120, Admin / Super Admin only — 👩‍🏫 Volunteer/Teacher Management → 🌍 Users outside the USA sub-tab; Access Control row *🌍 Users outside the USA*; BOD sees Teacher Appreciation but not this sub-tab):**
  - Country flags are shown **only for people outside the United States**. United States (or unknown) = no flag and no saved row. There is no country step at sign-in.
  - The list lives in the **USER_COUNTRY** sheet of the main workbook (Email, APSID, Name, Role, Country_Code, Country_Name, Source, First_Seen, Updated_At, Updated_By). It **started empty on the r120 deployment** and fills as people sign in.
  - Each person's own browser detects the country once per sign-in; the sheet is written **only when their country changes** (back in the USA → their row is removed).
  - **Source:** *Detected* (browser), *Chosen by person* (they clicked their flag) or *Set by Admin*. Detection never replaces a Chosen or Admin country (VPN / travel).
  - The card shows the count per country, a search box, **⬇️ Export (CSV)**, and **Set country** (email + country; picking United States removes the row). Chosen and Admin changes are recorded in **USER_COUNTRY_AUDIT**.
  - The dashboard reads the sheet through a 6-hour cache that is cleared on every change made by the dashboard. If you edit the sheet by hand, the change shows within 6 hours (or after any change from the card).
  - The weekly Sunday clean-up also removes rows of people in no active AY26-27 class and not updated for 180 days.
  - Script Property `APS_COUNTRY_FEATURE` = `off` switches the whole feature off (no flags, no detection, nothing saved).
- **Report:** run `apsStorageReport` in the Apps Script editor to see the size of both stores and their largest keys. It shows names and sizes only, never values.

### 12A. Weekly Class Consolidation Analysis (email only — nothing is changed)

Every **Wednesday**, the dashboard reviews the current AY26-27 classes, students and teachers from its synced data (~7–8 PM EST; the email follows at least 25 minutes later). It then emails one report (~7:30 PM EST) from **donotreply@avvaiyarpadasalai.org**.

- **Who gets it:** every current Head Master and VP (from the class data and the Head Master list), plus admin@avvaiyarpadasalai.org, Vasuki_APS999@avvaiyarpadasalai.org and tcs_asvika_aps8112@avvaiyarpadasalai.org. Each address appears once.
- **Subject:** `APS Class Consolidation Analysis – AY26-27 - MM/DD/YYYY` (the analysis date).
- **What's in it:**
  - Executive summary.
  - **High-priority merges:** same Nilai, same day, same start and end time, 7 or fewer students combined.
  - **Medium:** exactly 8 combined, for review.
  - **Low / explore:** same Nilai at a different time; not a direct merge.
  - Teachers with more than one class. Two classes at the same time are flagged in red.
  - Small classes: Critical 1–3, Review 4–5. Also the counts at 6 (Near Target), 7 (Target) and 8 (Maximum).
  - The current 7:1 and 8-student classes.
  - **Potential** impact.
- **Suggested Continuing Teacher:** shown when one teacher is clearly free at that time, with the reason. Otherwise the report says *Teacher Assignment: HM/VP review required.*
- **What is never recommended:** classes of different Nilai are never merged, a merge never goes above 8 students, and no class appears in two recommendations.
- **Read-only:** no class, student, teacher or schedule is ever changed. Every decision stays with HM/VP/Admin.
- **Send once:** the report is sent once per week (Report ID `CCW-AY26-27-yyyy-MM-dd`), and each run is logged in the **CLASS_CONSOLIDATION_WEEKLY** sheet.
- **If the analysis fails:** no partial report is sent. admin@ gets one short notice instead.
- **If only the email fails:** the result is kept and can be resent from the editor (`runClassConsolidationNow`) without analysing again.
- **One-time setup (Admin, Apps Script editor):** run `createClassConsolidationTriggers()` once. Running it again is safe; it never creates duplicates. `removeClassConsolidationTriggers()` turns the weekly report off.

### 12C. Daily & Monthly Class Summary & Review (management email — nothing is changed) — r105, schedule r106

Every morning at about **7:00 AM EST** the dashboard sends a Tamil management report on **the previous day's classes**, built from data it already has. The report goes out only if that day had at least one AY26-27 class (any weekday — Friday, Saturday, Sunday, Monday or Tuesday). **No class = no email and no report row.** For example, Friday's classes are reported on Saturday at about 7:00 AM.

- **Why the morning after:** Google Meet attendance can take a few hours to arrive. By morning the attendance capture (~6:00 AM) has collected the full record, including the late Friday class.
- **From / To:** donotreply@avvaiyarpadasalai.org → board@amchats.org and admin@avvaiyarpadasalai.org. Admin can change the list with the Script Property `DAILY_SUMMARY_RECIPIENTS` (comma-separated).
- **Subject:** `APS Daily Class Summary & Review - Friday, October 30, 2026 - Management Report` (the class day, not the sending day).
- **What's in it (in Tamil, only the sections that have something to say):**
  - greeting and executive summary;
  - the day's class status;
  - sessions by start time;
  - Teacher Availability (Available / Not Available / Not Set);
  - Temporary Teacher Assignment and coverage;
  - what went well and what needs attention;
  - student / teacher / class attention;
  - technical status;
  - improvements for next class;
  - actions for Management / HM / VP;
  - key notes and closing.
- **Where the numbers come from:** the synced Google Classroom data, the Google Meet attendance sheets, Teacher Availability, Class Coverage Tracking, Temporary Class Coverage, Temp Teacher, Leave and the exam records. NILAI 99 and On-Call classrooms are left out.
- **Careful wording:** a class with no Google Meet record is reported as *"பங்கேற்பு பதிவு கிடைக்கவில்லை"* (no participation record), and HM is asked to confirm. The report never says a class or teacher did not happen just because data is missing.
- **Saved:** every report is stored in the Google Sheet `12USIGS9TtQznvQRVy5YLtPXuLrAoftAqAPxIylUNU1Q`, tab **Daily Summary**. Each row has the counts, issue summaries, Email Sent / Sent At / Error, and the **Full Tamil Report** exactly as emailed.
- **Monthly report:** on the **1st of each month at about 8:00 AM**, `APS Monthly Class Summary & Review - October 2026 - Management Report` is built from the previous month's Daily Summary rows. It covers class days, sessions, attendance, availability, temporary teachers, and repeated and unresolved issues. It waits until the last class day of the month has its daily report, so it always includes that day. It is saved in the tab **Monthly Summary**.
- **Sent once:** there is one report per class day (key `2026-10-30 | DAILY`) and one per month (`2026-10 | MONTHLY`). Running again never sends a second email.
- **Missed reports are caught up automatically.** Each morning the dashboard checks the Daily Summary sheet for class days in the last **7 days** that have no sent report, and sends them oldest first. This covers a morning that didn't run, a run that was cut off, an email that failed (the same stored report is resent, with no new report), and a report that could not be built. A missed monthly report is sent on the next morning.
  - Catch-up never goes earlier than the first report in the sheet, so a fresh setup doesn't send old days.
  - If many days are missing, it sends what fits in one run (about 3.5 minutes) and the rest the next morning.
- **One-time setup (Admin, Apps Script editor, from the deploying account):**
  1. Share the summary spreadsheet with the deploying account (Editor).
  2. Run `createDailySummaryTriggers()` once. It creates three daily triggers: ~6:00 AM capture, ~7:00 AM daily report and ~8:00 AM monthly check. Running it again is safe and replaces the old ones. `removeDailySummaryTriggers()` stops it.
     - If the old r105 evening triggers (10:50 / 11 PM) are still installed, their next run moves them to the morning schedule automatically and sends nothing.
  3. Optional tools:
     - `previewDailySummary('2026-10-30')` logs a report without saving or sending it.
     - `runDailySummaryNow('2026-10-30')` and `runMonthlySummaryNow('2026-10')` send one now (still only once per date).
     - Manual runs accept **past dates only**. A report made while classes are still running would block the complete next-morning report.
- **Good to know:**
  - Apps Script runs daily triggers within about ±15 minutes of the set time.
  - Changes made later (for example an attendance override on Monday) are not added to a report that was already sent.
  - The report is never available from the Dashboard screen.

### 12D. Continuous Student Absence Monitoring (more than 4 consecutive weeks) — r107

Every **Wednesday between about 9 and 10 AM EST** the dashboard checks every student of the active AY26-27 classes. It looks for students who have **not attended their scheduled Tamil class for more than 4 consecutive class weeks**. Wednesday is used because the weekend is captured on Monday and teachers' attendance corrections are in by then, and families get two days before the next class.

**How the absence is counted (from the existing attendance data — nothing is changed):**

- **Only classes that were held count.** A class session counts only when at least one person of that class (teacher or student) joined, and it is not marked **Class Cancelled** in Class Coverage Tracking. Holidays and classes nobody held are skipped automatically.
- **Only the student's own attendance rows count.** A missing row is never treated as an absence; that week is simply not counted.
- **How each class week is classed:**
  - **attended**: Present or Partial in any session that week (a teacher's override wins);
  - **excused**: approved leave, or an EXCUSED override. These weeks are skipped; they neither count nor break the run;
  - **absent**: otherwise.
- **Consecutive Weeks Absent** = the absent weeks in a row back from the latest counted week. A student qualifies at **5 or more** (more than 4). Exactly 4, or attending last week, means no email. Fewer than 5 counted weeks means not enough history, so no email.
- **Not checked:**
  - students no longer on an active AY26-27 roster (withdrawn / removed);
  - test and on-call classrooms;
  - students on approved leave today.
  - Shared twin / sibling accounts are **not** excluded automatically. The email explains what those families should do.

**Emails (all from donotreply@):**

- **To each student** (APS email), **CC the class teacher**. Subject *APS – We Miss You in Tamil Class!* The text is the approved wording, including the *Important – Shared Student Accounts* note. If the class has no teacher email, admin@ is CC'd instead and this is recorded.
- **One admin report to admin@**, subject *APS – Students Not Attending Tamil Classes for More Than 4 Weeks*:
  - **Table:** Student Name, APS ID, Student APS Email, Nilai, Class Name, Class Schedule (EST), Teacher, HM, VP, Last Attended Date and Consecutive Weeks Absent. The table also shows whether each student's email was sent.
  - **Still absent:** a short section lists students already reported earlier.
  - **Action requested:** HM and VP contact the family and work with the teacher.
  - **No email when nobody is new:** the report goes out only when at least one student is newly identified.

**Never twice:**

- Each notification has a key: **APS ID + the first absent week of that run**. While the student stays absent, the key is the same, so no second email is sent; the weeks count in the log is updated.
- If the student attends and later misses more than 4 weeks again, that is a new cycle and a new email.
- **A failed student email** is retried on the next run (or with `runStudentAbsenceNow()`), and sent emails are never resent.
- **A failed admin report** is sent again on the next run with the same students.
- One student's failure never stops the others.

**Log:** the tab **STUDENT_ABSENCE_NOTIFICATIONS** in the dashboard workbook keeps one row per notification and one RUN row per check.
- **Notification rows:** key, student, class, teacher, HM, VP, last attended, weeks absent, student email status and time, teacher CC, admin-reported flag and time, and any error.
- **RUN rows:** totals evaluated, qualifying, sent / failed / duplicates skipped, missing teacher emails and the admin report status.

**Setup (Admin, Apps Script editor, deploying account):**

1. Run `createStudentAbsenceTrigger()` once (Wednesday ~9–10 AM EST). Running it again is safe.
2. It starts in **DRY RUN**: no student or teacher email is sent and no notification row is written. admin@ gets a **[DRY RUN]** preview of who would be emailed. `previewStudentAbsence()` logs the list at any time.
3. When the list looks right, run `enableStudentAbsenceEmails()` to go live. `disableStudentAbsenceEmails()` returns to dry run.
4. `runStudentAbsenceNow()` runs the check immediately. It still never resends a sent email.

### 12E. APS School Leave & Holiday Management (r109 + r110)

**Where:** **Admin Control → 🏖️ School Leave Management** (Admin and Super Admin only). The server refuses everyone else, even if the tab is switched on for them in Access Control.

**Add / manage a leave:**

- **➕ Add Leave:**
  - **Fields:** Leave Title, Start Date, End Date, Reason / Announcement, Leave Type (School / Festival / Emergency / Weather / Administrative Holiday, Other) and Status (Draft or Approved).
  - **Email Notification:** "Send notification immediately" or "Save without sending".
- **The list:** shows each leave as UPCOMING, ACTIVE or PAST (approved), DRAFT or CANCELLED, with the number of days, who created it, and the email status.
- **Actions:** **View** (details, notification history, audit log and the weekly activities that were skipped), **Edit**, **Approve**, **Cancel Leave**, **Delete Draft**, and **Send notification / Send update / Resend**.
- **Checks before saving:**
  - Start ≤ End, and every field is required.
  - The same title and dates can't be added twice.
  - An **overlap** with another approved leave asks for confirmation.
  - Changing the **dates or reason of an approved leave** asks for confirmation and marks the announcement **UPDATE_PENDING**, so you can send an **UPDATED** announcement.
- **Draft:** has no effect. **Approved:** takes effect immediately. **Cancelled:** weekly activities run again on those dates; missed days are not filled in.

**Announcement email:**

- **Recipients:** one message to each list: students@, teachers@, admin@ and allparents2026_2027@avvaiyarpadasalai.org. The lists can be changed with the Script Property `SCHOOL_LEAVE_EMAIL_LISTS`.
- **Sender:** attendance@ by default. Script Property `SCHOOL_LEAVE_EMAIL_PROFILE` = `TICKETS` sends from donotreply@ once that sender is approved.
- **Subject:** e.g. *APS Virtual School – Holiday Announcement – November 6–8, 2026*.
- **Sent once per list:**
  - "Send" only goes to lists that haven't received this version.
  - **Resend** to every list is a separate, explicit choice.
  - If one list fails (for example the daily email quota), it is logged as FAILED and retried with Send, and the lists that were delivered aren't sent again.
- **Cancellation notice:** cancelling an announced leave can also email a short notice.
- **Check first:** the Google Groups must allow posts from the sender address.

**What happens on approved leave dates:**

| Activity | During the leave |
|---|---|
| Attendance capture (daily 5 PM, Mon 5 AM, Sync Now) | No rows for those classes, so **no ABSENT marks**. Never filled in later. |
| Weekly attendance email (Mon 7 AM) | Leave dates left out |
| Teacher Availability: the email (Tue–Fri 6 PM) and the class card | Holiday-week classes left out. Teachers see "🏖️ School holiday this week — no availability response is needed" and can't respond; Admin / HM can still record a response. |
| START GOOGLE MEET emails (Fri / Sat / Sun) | Not sent for leave classes |
| Daily Class Summary | No report for a leave date |
| Assignment Monitoring, "Mark as complete" reminders, Class Consolidation, multiple-classroom report, absence check | Skipped when the scheduled run falls on a leave day. Running them from the editor still works. |
| Exams | **Never cancelled.** The exam list shows "🏖️ School leave: …" so you can reschedule if needed. |
| Classroom / grading / roster sync, Temp Teacher add / remove, backups, Zoho sync, system alerts | Keep running |

- **Banner:** while a leave is active, every signed-in user sees **APS VIRTUAL SCHOOL IS ON LEAVE**, with the period and reason.
- **Logs:**
  - **APS_SCHOOL_LEAVES**: the leave records;
  - **APS_SCHOOL_LEAVE_EMAIL_LOG**: every email;
  - **APS_SCHOOL_LEAVE_AUDIT_LOG**: every action, plus each skipped activity (SKIPPED_SCHOOL_LEAVE).
- **Emergency switch:** Script Property `APS_SCHOOL_LEAVE_ENABLED` = `false` ignores all leaves (old behaviour), without a redeploy.
- **Editor tools (still available):** `addSchoolLeaveNow(...)`, `listSchoolLeavesNow()`, `cancelSchoolLeaveNow(id)`.

### 🧑‍🏫 Grading Help Team report — work pending grading > 3 weeks (r116)
**Where:** 📚 Assignment Monitoring → ⚙️ Admin → *Grading Help Team report* (Admin / Super Admin).

**What:** every **Tuesday ~8–9 AM EST**, one email titled *APS Google Classroom – Homework Pending Grading > 3 Weeks – MM/DD/YYYY*:
- **From / to:** from **donotreply@**, **To grading@, CC admin@** (both can be changed).
- **Lists** every student submission that was **turned in more than 21 days ago** (22 days or older, counted from the student's latest turn-in, Eastern Time) and is still **not returned** in Google Classroom.
- **Default types:** Homework (HW_), Quiz (QUZ_) and Project (TRMST); each can be switched off.
- **Never listed:**
  - never-submitted or missing work;
  - returned work;
  - work the student un-submitted;
  - students removed from the class;
  - attendance (ATT_) and exam items;
  - test classes;
  - assignments or students excluded in Assignment Monitoring.

**The email:**
- **Summary:** classes / assignments / submissions affected; counts by age (22–28, 29–42, 43+ days); not graded vs. *only needs Return*; **new this week** and **cleared since the last report**.
- **One block per class** (oldest work first), with the teacher and an **Open Google Classroom** button.
- **Per assignment:** an **Open assignment** link, which opens that assignment directly.
- **Per student:** submitted date, pending days, status (*Not graded* / *Draft grade — needs Return* / *Grade entered — not returned*), and *on this list for N weeks*.
- **Warnings:** if the last Google Classroom sync is older than 30 hours, failed, or skipped some classes, a **⚠️ WARNING** names them. The report is never shown as complete when it isn't.
- **Long lists:** above 300 rows the email shows the oldest 300 and attaches the full list (CSV, opens in Excel).
- **Nothing pending:** no email.

**The card:**
- ON/OFF switch, days, rows in the email, To / CC, assignment types, **Save** (audited);
- **👁️ Preview list** (nothing sent), **⬇️ Export to Excel**, **📨 Send now** (once a day unless *Send again* is ticked);
- **Recent reports** (classes, assignments, submissions, new, cleared, email result, warnings).

**How it works:**
- It uses the daily 5 PM Google Classroom sync, so the report makes **no extra Google Classroom calls**.
- It **never** grades or returns work, and never emails students, parents or teachers.

**Grading Help Team account:** **grading@avvaiyarpadasalai.org** is a co-teacher in every class, but the dashboard treats it as support staff:
- never shown as a class teacher;
- never on class cards or rosters;
- never in attendance or Volunteer/Teacher Management scores.

More accounts can be added in the Script Property `APS_GRADING_TEAM_EMAILS` (JSON list).

**Sheets:** **MISSING_GRADING_LOG** (one row per pending item: first / last reported, cleared; cleared rows are removed after 180 days) and **MISSING_GRADING_RUNS** (one row per report).

**Editor tools:** `scanMissingHomeworkGrading()` (run now), `createMissingGradingTrigger()`.

### 👩‍🏫 Volunteer/Teacher Management → Weekly Teacher Appreciation (r114)
**Who:** Admin / Super Admin; BOD read-only. HMs, teachers and students don't see it (Access Control rows *👩‍🏫 Volunteer/Teacher Management* and *Weekly Teacher Appreciation*).

**What it does:** every **Wednesday ~7–8 PM EST** the dashboard scores each class teacher for the **Monday–Sunday week that just ended**. It uses only data the dashboard already has:
- attendance: the teacher's Google Meet join time and minutes, and student attendance;
- the daily Google Classroom grade sync: lesson work posted, and turned-in work graded.

No extra Google Classroom calls are made.

**The six measures** (weights can be changed in the settings):

| Measure | Default weight | How it is measured |
|---|---|---|
| Class completion | 25% | The teacher was in the Meet for at least 60% of the scheduled time = 100 (less = proportionally less). |
| Teacher punctuality | 15% | Joined ≤ 2 min after the start = 100, ≤ 5 min = 80, ≤ 10 min = 50, later = 0. |
| Student attendance | 20% | 80% or more students present = full credit; lower attendance lowers the score only gently. Excused students are left out. |
| Engagement (lesson work posted) | 20% | The week's ATT_, HW_ and QUZ_ posted with a due date (an item without a due date counts half). Exam weeks count HW and QUZ as done. The expected items can be set per Nilai. |
| Grading follow-up | 10% | Turned-in work (from the 4 weeks ending 7 days before the run) graded within 7 days. Work graded **before** the student turned it in is not counted and is flagged. |
| Classroom activity consistency | 10% | Lesson work posted in every week of the last 4 in which a class was held. |

**Missing data is never scored as zero:**
- Classes on school leave, the teacher's approved leave, cancelled classes and classes covered by another teacher are left out. The substitute gets credit for the covered class.
- A class with no Google Meet activity, or where the teacher isn't found in the Meet, is "not verified" and left out.
- If the grade sync is older than 30 hours, the Classroom measures are left out.
- A missing measure is skipped and the other weights are rescaled.
- A teacher is scored only when at least one class was held, completion and punctuality are known, and at least 70% of the weights have data. Otherwise they are **Insufficient data**, with the reason shown.
- Students not submitting work **never** lowers a teacher's score; a high submission rate is only mentioned as a positive.

**Bands:** 90–100 **Exceptional** · 85–89.9 **Outstanding** · 75–84.9 **Good** · below 75 **Support check-in suggested** (shown to admins only). Teachers with 85 or more and verified data are **eligible for appreciation**.

**The screen:**
- **Filters:** academic year, week (loads that week's saved scores), Nilai, teacher, band and search. The filters refresh the page at once.
- **📊 Weekly Performance Overview:** active teachers, evaluated, each band, eligible, classes held / scheduled, student attendance, and the Google Classroom summary.
- **🏅 Teacher Performance Rankings:** every teacher with the six measures, score and band. Click a column to sort. Click a name for the weekly history (trend, monthly averages) and how the score was calculated, class by class.
- **🌟 Outstanding Teachers:** Exceptional and Outstanding teachers with their highlights.
- **📨 Weekly Admin Reports:** every run (when, who, mode, counts, result).
- **⚙️ Configuration & Scoring Settings:** weights (must add up to 100), bands, appreciation threshold, data-coverage minimum, how each measure is measured, monthly rules, admin report recipients, expected items per Nilai. **Preview with these settings** scores the week in memory (nothing saved or sent); **Save settings** keeps them (versioned and audited).
- **Buttons (Admin):**
  - **👁️ Preview:** the selected week with the saved settings, nothing saved.
  - **▶ Run now:** score and save the selected week.
  - **⬇️ Export to Excel:** a CSV of the shown week, or of all weeks.
- Each section can be collapsed; the dashboard remembers it on this device.

**Sheets (main workbook):**
- **TEACHER_APPRECIATION_SCORES:** one row per teacher per week, updated in place on a re-run.
- **TEACHER_APPRECIATION_RUNS:** one row per run.
- **TEACHER_APPRECIATION_CONFIG** and **TEACHER_APPRECIATION_CONFIG_AUDIT:** the settings and who changed what.

**Editor tools:** `createTeacherAppreciationTrigger()` (also created automatically when an admin opens the tab), `removeTeacherAppreciationTrigger()`, `previewTeacherAppreciationFromEditor('WK-yyyy-mm-dd')`, `runTeacherAppreciationFromEditor('WK-yyyy-mm-dd')`.

**Emails (r115):**
- **Switch:** *Teacher emails are ON / OFF* at the top of the tab (Admin / Super Admin, with a confirmation, audited). **Default: OFF.**
  - **OFF = preview:** no teacher is emailed. Each run sends the admin report as **[PREVIEW]**, with a sample of the Tamil email, so the scores and settings can be checked first.
  - **ON:** eligible teachers get the email automatically every Wednesday, with no approval step.
- **Weekly Tamil email** (from **attendance@**, only to the teacher, no CC):
  - the teacher's name, the appreciation week (Monday–Sunday) and 2–4 highlights of the week, for example every class started on time, or lesson work posted on time;
  - the opening and closing lines vary from week to week;
  - **no score, band or ranking** is ever shown.
  - **View email** on an Outstanding teacher's card shows exactly what they receive.
- **Monthly “consistently outstanding” email:**
  - sent in the first Wednesday run of each month, for the previous month;
  - for teachers eligible in at least 75% of their scored weeks (at least 3 scored weeks) and never below Good;
  - a teacher who gets it doesn't also get that week's weekly email: its highlights are included.
- **Admin report** (English, to the recipients in the settings; default admin@), once per week, containing:
  - reporting week, active and evaluated teachers, each band, scores;
  - classes completed, student attendance, Google Classroom summary;
  - emails sent and failed;
  - *Support check-in suggested* (admin only);
  - *Insufficient data* with the reasons.

  **📨 View report** in *Weekly Admin Reports* shows it again. **Run now** can send it again (tick *Email the admin report again*).
- **Never twice:**
  - Each teacher gets at most one weekly email per week and one monthly email per month, even if the run is repeated.
  - A failed email is retried automatically (up to 3 attempts); **↻ Retry failed** sends the rest.
  - If a run stops in the middle of sending, that email is not sent again automatically; check the history.
  - Large weeks continue automatically 2 minutes later, and the admin report follows once all emails are done.
- **✉️ Teacher Appreciation Email History:** every email with its type, status (SENT / FAILED / PREVIEW / SKIPPED / SENDING), attempts, time and error.
- **Log sheet:** TEACHER_APPRECIATION_EMAIL_LOG.

**Known limits:**
- A teacher who is also listed as Admin / HM is not scored, because attendance doesn't record those accounts.
- Feedback comments can't be read from Google Classroom, so grading follow-up uses graded-and-returned instead.

---

## 13. Admin setup reference (Google Classroom conventions)

- **Class name:** `NILAI 1 - EG | FRI 6:30 - 8:00 PM EST | AY26-27` → Nilai and section | day and time | academic year. Only ACTIVE classes ending with `AY26-27` are used.
- **Course Description:** the APS email of the **Primary Teacher** (e.g. `teacher_aps123@avvaiyarpadasalai.org`). Add a meet.google.com link here if you want it shown as the class Meet link.
- **Room:** `VP Email: vp1@… ; vp2@… | HM Email: hm1@… ; hm2@…` (any number; `;` `,` `|` separators). Room emails without a label are ignored.
- **Section:** shown under the class name (e.g. teacher and HM contact).
- **WhatsApp links:** sheet `WhatsApp_Group_Links` (class name + link).
- **Meet links:** filled automatically from Google Classroom (Description / Room / Section, then the class stream); Attendance → Course ↔ Meet Link Mapping to set one by hand. Tip for teachers: post the class Meet link once in the class stream or put it in the Description.
- **Useful Script Properties:**

  | Property | Purpose |
  |---|---|
  | `APS_CLASS_SUPPORT_ENABLED` | VP/HM/Primary from Description/Room (default true) |
  | `APS_CLASS_SUPPORT_ADD_TO_CLASSROOM` | add named people as Classroom co-teachers |
  | `APS_CLASSES_ALWAYS_SHOW_EMAILS` | accounts always shown on cards |
  | `APS_CLASSES_PRIMARY_ONLY_PREFIXES` | default `tcs_,tts_` — shown on a card only as Primary Teacher |
  | `ATTENDANCE_PREVIOUS_WEEK_GRACE_HOURS` | default 8 |
  | `ATTENDANCE_EXCLUDED_EMAILS` | accounts never included in Attendance |
  | `APS_CLASS_TEACHER_AVAILABILITY_*` | availability report email settings |
  | `ATTENDANCE_MAIL_FROM`, `ATTENDANCE_MAIL_ADMIN_CC`, `ATTENDANCE_MAIL_DAILY_LIMIT` | sender (attendance@), always-CC (admin@) and daily recipient limit (1500) for both attendance emails |
  | `ATTENDANCE_OAUTH_CLIENT_ID`, `ATTENDANCE_OAUTH_CLIENT_SECRET`, `ATTENDANCE_REFRESH_TOKEN` | attendance@ Gmail API credentials — **Script Properties only**, never in code/Git |
  | `APS_GRADING_EXCLUDE_PREFIXES` | extra Grading exclusions; default none |

- **Audit sheets:** Class_Access_Map, Class_Access_Audit, attendance Override Audit Log, exam download audit.

---

## 14. FAQ / troubleshooting

- **I can't see my class.** Make sure you signed in with your APS account; your email must be in the class's Course Description (Primary Teacher) or the class roster. New changes appear after the next sync (≤15 minutes).
- **The Meet link is missing.** Post the class Meet link in the Google Classroom stream (or put it in the Description) — it is picked up at the next 5:00 PM auto-fill, or at once when an Admin presses **Auto-fill from Google Classroom**. It also appears after the class meets once.
- **Copy doesn't copy.** Your browser blocked it — the link opens in a box already selected; press Ctrl+C (⌘+C on Mac).
- **Attendance looks wrong.** Teachers can Override with a reason; past weeks keep your correction.
- **A grade is wrong.** Ask the Class Teacher / HM to change it in Google Classroom; it updates after the next refresh.
- **"Not Assigned" in the availability report.** Put the teacher's APS email in the class's Course Description.
- **Emails from the TEST dashboard.** The TEST copy of the dashboard (Script Property `APS_ENVIRONMENT = TESTING`) never emails teachers, HMs, admins, parents or students. Every email it would send goes **only to info@avvaiyarpadasalai.org**, with `[TEST ENVIRONMENT]` in the subject and a red banner showing who would have received it in LIVE (at most 30 a day). Set `TEST_EMAIL_MODE = OFF` on TEST to send nothing at all. LIVE sends normally.
- **My class is running but shows Yet to Start / Scheduled.** Class Started needs the class's teacher **and** a student in the Meet. Joining from **Join to Google Meet** on the dashboard is picked up at once; joining from a saved link is picked up when Google reports it (when someone leaves, or straight away if the dashboard can read that Meet). Admins can press **🔄 Refresh** on GCM - Preview.
- **Attendance / availability emails stopped (admin@ got "ACTION NEEDED: APS attendance emails paused").** attendance@ could not sign in. In Apps Script → Project Settings → Script Properties check `ATTENDANCE_OAUTH_CLIENT_ID`, `ATTENDANCE_OAUTH_CLIENT_SECRET`, `ATTENDANCE_REFRESH_TOKEN` (the refresh token must be created while signed in **as attendance@** with scope `gmail.send`; if the OAuth consent screen is in *Testing*, tokens expire after 7 days — set it to *Internal*). Then press **Send test email** on the Teacher Availability Report — it must arrive from attendance@.
- **An on-call coordinator sees no classes.** She is not a teacher in any Google Classroom. Add her email to `ON_CALL_COORDINATOR_EMAILS` (default: tcs_asvika_aps8112) — she then sees every class read-only after signing out and back in.
- **A button is grey.** Hover it — the tooltip explains why (role, missing fields, or read-only access).

---

- **How often does an open dashboard talk to the server? (r96)**
  - **Live status:** about every 45 seconds while a class is in its live window, and every 90 seconds otherwise.
  - **Full refresh:** every 5 minutes. Each tab uses a slightly different timing, so tabs opened at the same moment do not all call at once.
  - **Chat:** a closed chat is no longer polled. It reloads only when a new message is posted (within about a minute), and polls every 15 seconds only while it is open.
  - **Hidden tabs:** a tab in the background makes no calls.
  - **Why:** Google limits how many dashboard requests can run at the same moment. These changes keep the APS Dashboard well below that limit when many students sign in for class together.

## 15. Glossary
- **APSID:** your APS number from your email (e.g. `APS123`).
- **Nilai:** APS grade level.
- **AY26-27:** academic year 2026–27.
- **EST:** America/New_York time.
- **On-call teacher:** substitute teacher account starting `TCS_` / `TTS_`.
- **Primary Teacher:** the teacher named in the Course Description.
- **VP / HM (class):** Vice Principal / Head Master named in the class's Room field.
- **Override:** a manual attendance correction.
- **DOWNLOAD KEY:** personal code on each question paper copy.

## 16. Change log
- **2.74 (2026-11-06, r121):** Faster dashboard: the background status check that every open dashboard makes every 45–90 seconds now sends only the classes and people that viewer can see and only recent activity (about 237 KB → 13 KB for Admin and under 1 KB for teachers and students with production-sized data), and online dots / last login now update with that check instead of waiting for the 5-minute refresh. The page load sends about 25% less data. Nothing on screen changes.
- **2.73 (2026-11-06, r120):** Country flags are back, **only for people outside the USA**, kept in the new **USER_COUNTRY** Google Sheet (not in property storage): no country step at sign-in; detected by each person's browser and saved only when it changes; a country the person chooses (click the flag) or an Admin sets is never replaced. New **🌍 Users outside the USA** sub-tab under 👩‍🏫 Volunteer/Teacher Management, Admin / Super Admin only (list, search, export, set country). The sheet started empty and fills as people sign in (see 12B).
- **2.72 (2026-11-06, r119):** Second property store diet (was 345 KB / 69%): the **country feature is switched off** (no country step at sign-in, no flags, data deleted; can be turned back on with `APS_COUNTRY_FEATURE`), the last-login and onboarded lists are **stored compact** (same information on screen), and a new **weekly clean-up (Sunday ~3 AM)** removes data of people who are in no active class and have been inactive for 180 days (see 12B).
- **2.71 (2026-11-06, r118):** New **🧹 Clean up temporary data…** button and **Property storage** line in Admin Control → Backup & Archive (Admin / Super Admin): see usage of both property stores and free temporary data on demand, with a confirmation list first (names and sizes only). Settings are never touched; every run is logged (see 12B).
- **2.70 (2026-11-06, r117):** Fixes *“This script has too many triggers”*: the 7 weekly jobs (backup + archive, multiple-classroom report, Grading Help Team report, student absence, class consolidation analysis and email, Teacher Appreciation) now share **one hourly trigger** (`apsWeeklyJobs`) instead of one trigger each, freeing 6 of the 20 trigger slots. Each job still runs on its day, in the first hourly check at or after its hour (so times are now shown as ranges, e.g. Tuesday ~8–9 AM), at most once a week, with 24-hour catch-up and 3 retries. School-leave days are still skipped. New **⏱️ Weekly automatic jobs** table in Admin Control → Backup & Archive.
- **2.69 (2026-11-06, r116):** New **Grading Help Team report**: every Tuesday ~8:30 AM, one email (donotreply@ → grading@, CC admin@) of homework, quiz and project work turned in more than 21 days ago and still not returned, grouped by class with Open Google Classroom / Open assignment links, new / cleared counts and scan warnings. Settings, preview, export and Send now are in Assignment Monitoring → ⚙️ Admin. The grading@ co-teacher account is treated as support staff everywhere (see 12).
- **2.68 (2026-11-06, r115):** Weekly Teacher Appreciation emails: an ON/OFF switch (default OFF = admin [PREVIEW] report only); Tamil weekly appreciation email to eligible teachers from attendance@ (no score or ranking); monthly “consistently outstanding” email; English weekly admin report; email history; Retry failed; never two emails for the same week or month. The tab is named **👩‍🏫 Volunteer/Teacher Management** (see 12).
- **2.67 (2026-11-06, r114):** New **👩‍🏫 Volunteer/Teacher Management → Weekly Teacher Appreciation** (Admin / Super Admin; BOD read-only): weekly teacher scores from attendance and Google Classroom data (six configurable measures, missing data never scored as zero), rankings, history and calculation per teacher, settings with preview, export to Excel, Wednesday ~7 PM run (see 12).
- **2.66 (2026-11-05, r113):** Re-mapped students: grades carried over from the previous class now also appear in the **Grades** table (📦, view only) in the student's current-class row and are counted in their **Overall %**, unless the new class has graded the same lesson (see 7).
- **2.65 (2026-11-05, r112):** Re-Map Student: the grade-transfer result (*Grades saved: N assignment(s), G graded*, or *Grades NOT saved*) is now shown in the **Class / Grade Change Audit Log**, with the Transfer ID on hover, and stored in a new **Grade Transfer** column of the audit sheet (see 7).
- **2.64 (2026-11-05, r111):** **Re-Map Student keeps grades.** Before moving a student, the dashboard saves their grades from the old classroom, and stops the move if that fails. The new class teacher, VP / HM, Admin and the student see them in Examination → Grading under **📦 Grades carried over from a previous class** (view only). Nothing changes for students in Google Classroom (see 7).
- **2.63 (2026-11-04, r110):** **Admin Control → 🏖️ School Leave Management** to add, edit, approve, cancel and delete drafts, with notification history. The announcement email goes once to each of the 4 lists, and failed lists can be retried. Changing an approved leave's dates needs confirmation and offers an UPDATED announcement. More jobs are now paused on leave days, teachers see a holiday notice on the availability card, and exams on a leave date show a warning (see 12E).
- **2.62 (2026-11-04, r109):** **School Leave / Holiday (Phase 1).** On approved leave dates, the dashboard captures no attendance (students are not marked absent), and sends no attendance report, Teacher Availability email, START GOOGLE MEET email or Daily Summary for those classes. A leave banner shows for everyone. Activities resume automatically after the leave (see 12E).
- **2.61 (2026-11-02, r108):** Weekly Attendance: a class teacher, VP or HM now also sees the earlier weeks of students now in their class, when those weeks were recorded in a previous or closed class. These rows are marked **Previous / other class** and are view only (see 10).
- **2.60 (2026-11-02, r107):** New **Continuous Student Absence Monitoring**. Every Wednesday ~9:30 AM EST, students absent for more than 4 consecutive class weeks get a “We Miss You in Tamil Class!” email (CC the class teacher, with the shared-account note), and admin@ gets one report with HM and VP so they can contact families. Only classes that were held count (cancelled and not-held classes are skipped), and missing records are never treated as absences. Each student is emailed only once per absence period, and the feature starts in dry run (see 12D).
- **2.59 (2026-11-02, r106):** Daily Class Summary & Review moved to the **next morning ~7:00 AM EST** (attendance captured ~6:00 AM, so late classes are complete), and the Monthly report to the **1st of the next month ~8:00 AM**. Missed daily or monthly reports (for example Sunday Nov 1) are now **caught up automatically** the next morning. Manual runs accept past dates only. The report run no longer starts the attendance sync itself, which could stop it before it finished (see 12C).
- **2.58 (2026-10-31, r105):** New **Daily Class Summary & Review** — a Tamil management report emailed at ~11 PM EST from donotreply@ to board@amchats.org and admin@, only on days with classes. It covers class status, Teacher Availability, temporary teachers, what went well, what needs attention and actions for Management / HM / VP. Each report is saved in the Daily Summary sheet, and a **Monthly** report is sent on the last day of each month (see 12C). Nothing else changes.
- **2.57 (2026-10-31, r104):** Exam Question Paper — **🔒 Teacher Copy** rules. Only the class's own teachers and Admin can use it. The paper must be published at least 24 hours before the exam, and the download opens 60 minutes before. A red confidential warning comes up before every download, and each assigned teacher gets one email from donotreply@ 60 minutes before the exam (Dashboard link only). Send to Student and student downloads are unchanged.
- **2.56 (2026-10-30, r103):** Fix for *"You have exceeded the property storage quota"*, which had stopped the dashboard loading for everyone. The large per-person lists moved to a second store, and a full store can no longer stop the dashboard from loading. Old weeks of the availability live data are removed automatically. A daily storage check runs and emails admin@ when storage passes 80%. Also fixed: an automatically detected country no longer erases a person's chosen Default Country (see 12B).
- **2.55 (2026-10-30, r102):** Weekly Teacher Availability: a polite message window before a teacher confirms **I’m Not Available**. It shows the class student count and suggests asking parents to help as Parent Teacher, and **Go Back** saves nothing. After a teacher answers, only **Reset the Availability** shows (it was **↺ Reset**); after a reset, both buttons come back. The card updates right away, with no reload.
- **2.54 (2026-10-30, r101):** New **Weekly Class Consolidation Analysis** email every Wednesday ~7:30 PM EST from donotreply@ to HM / VP and the admin review list (see 12A). It shows merge opportunities (same Nilai, day and time; ≤7 high, 8 medium), teachers with more than one class, small classes and the potential impact. It is read-only and changes nothing.
- **2.53 (2026-10-29, r100):** Review and fixes for the recent features: no automatic exam email after a Dashboard download or a failed log read; "Meet Status Unknown" for custom-time exams; the temp teacher cannot manage the class they cover; transient Classroom errors and stuck removals are handled; Apply Leave resend can't send twice, and a stuck PENDING can be resent after 10 minutes; a chat message can no longer be hidden for 10 minutes; faster leave attendance updates and fewer reloads.
- **2.52 (2026-10-29, r99):** Exam Question Paper: new per-exam **Send Email to Student After [X] Minutes** setting (OFF by default; 1–120 minutes). Students who have not downloaded X minutes after the exam start and are in the class Google Meet get their own copy (own download key) by email, once. Students marked absent or not in the Meet are not emailed. There are four new tiles and per-student status lines (see 11.3).
- **2.51 (2026-10-29, r98):** Temp Teacher: Admin, Super Admin, Head Master, the On-Call Coordinator and a class VP / HM can type **any valid APS email** as the Temporary Teacher (not only the list). Student accounts are refused. The On-Call Coordinator now has the Temp Teacher sub-tab for every class (see 3C).
- **2.50 (2026-10-29, r97):** Temp Teacher: the Temporary Teacher list shows every teacher from **TCS_ONCALL_TEACHER_LIST** (column E) at the top, including teachers not yet in any Google Classroom, followed by every class's Primary Teacher.
- **2.49 (2026-10-26, r96):** Fewer and lighter background requests from every open dashboard, about 60 instead of about 170 per hour per tab when no class is live, so the dashboard stays below Google's limit on simultaneous runs. The chat refreshes only when a message is posted. Nothing changes on screen.
- **2.48 (2026-10-25, r95):** Exam Question Paper: **Display Past Exams** now also drives every statistics tile, plus Download Activity and Suspicious Activity. OFF (default) = today's and upcoming exams only; ON = full history. The tiles switch instantly, with no reload.
- **2.47 (2026-10-25, r94):** New **📨 Apply Leave** tab for every role (see 3F). Students' class dates in the leave are marked Excused – 70% automatically. Emails from donotreply@ go to the teacher, HM and VP (students) or the HM and VP plus a confirmation with class-coverage steps (staff). Admin sees every leave, with email and attendance status and Resend email.
- **2.46 (2026-10-23, r93):** GCM - Preview: the **All Days** filter is now **All Class Timing**. Its options are built from the actual class day + start + end times (for example FRI 6:30 – 8:00 PM EST), update on every refresh, and filter by the exact timing.
- **2.45 (2026-10-23, r92):** Exam Question Paper: new **Display Past Exams** switch (default OFF) for every role. When OFF, only today's and upcoming exams are listed (Question Papers, Students and the student's list); when ON, past exams show as before.
- **2.44 (2026-10-23, r91):** **Access Control:** Admin and Super Admin can switch every tab for Headmaster, Teacher, Student, BOD / On-Call Coordinator and Authorized. 🔒 is no longer shown. Tabs not built for a role start OFF and never grant extra access.
- **2.43 (2026-10-23, r90):** Class card availability buttons renamed (text only): **Click to Confirm – I’m Available** (with the small Tamil line *கிளிக் செய்து உறுதிப்படுத்தவும்*) and **Click to Confirm – I’m Not Available**. Nothing else changed.
- **2.42 (2026-10-23, r89):** New **Classes → 👩‍🏫 Temp Teacher** sub-tab (Temporary Teacher Assignment – TCS/TTS): add a teacher to one Google Classroom for a set period with automatic removal on the Removal Date, emails from donotreply@, and a **“On-Call Teacher Assigned”** note with the name and APSID on the class card for every role, including students (see 3C).
- **2.41 (2026-10-23, r88):** Assignment Monitoring → ⚙️ Admin Control has a new sliding **ON / OFF** switch: *Send weekly reminder to teachers for ATT_ and QUZ_ assignments* (Mark as complete). It is OFF until an Admin turns it on, and is weekly by default.
- **2.40 (2026-10-23, r87):** The ATT_ / QUZ_ “Mark as complete” email now uses only the dashboard's daily Google Classroom data (no extra Google calls). Student status is as of the last sync (~5 PM), and the email says so. Only the class email is sent: to the teacher, with the class VP / HM and admin@ in CC.
- **2.39 (2026-10-22, r86):** New nightly email to class teachers: ATT_ / QUZ_ assignments at least 10 days old where students still need **Return ▾ → Mark as complete** in Google Classroom. The class VP / HM and admin@ are CC'd. The email lists each student (name, APSID, status) with the Student Work link and the steps, and is repeated every 3 days until done. Students who turned in are never listed, and the dashboard never changes student work.
- **2.38 (2026-10-22, r85):** New **📚 Assignment Monitoring** tab: missing and ungraded ATT / HW / QUIZ work from Google Classroom, class health, teacher grading completion, the student list per class, escalation levels, notification history and an Admin Control with an ON / OFF switch. Emails (student reminders, teacher and weekly summaries) are optional and start OFF. There is also a home card, *Assignment Health*. By default the tab is visible to Admin, Super Admin, HM and class VP / HM.
- **2.37 (2026-10-21, r84):** **Assign Classroom → Add/Remove Student** (renamed from Remove Student): new **Add Student** adds a student to one more Google Classroom without removing any. It shows every current classroom with its type (Regular Academic / Special Class / Other), warns before a second Regular Academic Classroom, never adds the same classroom twice, audits every request and emails the class teacher, HM and VP from donotreply@. New Monday report to admin@ of students in more than one classroom. Removal emails have a new subject and the confirmation reads *Remove Student from Google Classroom? — Confirm Remove*. Students: a monthly **Google Review** request and a **⭐ Google Review** header button; some emails now end with a short *Post a Google Review* note.
- **2.36 (2026-10-20, r81):** After every Google Classroom roster sync, each class teacher gets **one email** listing the students newly added to their class: name, APSID, APS email, class and date added. It is sent from donotreply@ with the class HM and admin@ in CC. Existing students are never announced, and nobody is emailed twice.
- **2.35 (2026-10-19, r80):** New **APS Parent Portal** (separate parent website, phase 1: sign-in, family, children, class choice with APS time + local time, two confirmations, PayPal). The Dashboard now answers the Portal's signed requests (donotreply@ emails, Zoho saves, student check, class list; logged in **Portal_Bridge_Log**). Class size limit is now **8** (was 7). See section 11D.
- **2.34 (2026-10-17, r79):** New **🎓 சிறப்பு வகுப்புகள் (Special Classes)** tab.
  - Program cards, filtered by Audience, with a registration status worked out from the dates and **Register Now** (an external link).
  - **⭐ My Special Classes** shows enrolled people their current, upcoming and past programs.
  - **Manage Special Classes** (Admin / Super Admin): add / edit / preview / activate–deactivate, enrollments, module settings.
  - New Access Control row: Student, Admin and Super Admin on; other roles off until switched on.
- **2.33 (2026-10-17, r78):** Temporary Class Coverage shows **one** ⭐ Recommended destination teacher: available this week, Existing APS Teacher, lowest numeric APSID. The old "Existing APS Teacher" line no longer appears on every class.
- **2.32 (2026-10-17, r77):** **Temporary Class Coverage:** each destination class now shows the teacher's APSID, availability for the session week, an APS-teacher note and existing coverage. The list is ranked best match first. When the destination already hosts coverage, a warning appears and an extra "I understand" tick is required. Selecting a class is faster. **Google Classroom:** each Teacher Availability arrangement has its own colour chip (🔴 / 🟢 / 🔵 / 🟣), and new quick filters were added.
- **2.31 (2026-10-16, r76):** New automatic **Parent-Teacher Arranged** email on Friday ~5:30 PM, Saturday ~11:30 AM and Sunday ~6:30 PM. One consolidated email from donotreply@ goes to the Primary Teacher, HM and VP (admin@ CC), with a **START GOOGLE MEET** button for each class and a list of missing information. The parent-teacher cannot start the Meet, so one of them must.
- **2.30 (2026-10-14, r75):** **Tamil Thadam:** Admin and Super Admin can look up any student's journey, read-only. Every look-up is logged, and nobody can change the values. **Access Control:** Super Admin can switch every tab and sub-tab on or off for every role, including the "always on" ones. Only Super Admin's own Access Control stays on.
- **2.29 (2026-10-14, r74):** New **👣 தமிழ்த் தடம் (Tamil Thadam)** tab for students only: an automatic, positive Tamil learning journey (points, achievements, level, learning streak, progress, this week, yearly journey, end-of-year certificate). Nobody else can see or change it.
- **2.28 (2026-10-14, r73):** Zoho CRM Sync runs in batches (75 recommended) with a progress bar. It continues on its own if the page is closed, uses as few Zoho calls as possible, and fixes the "Limit Exceeded: URLFetch URL Length" error on large syncs.
- **2.27 (2026-10-14, r72):** Zoho CRM Sync ignores fields whose Zoho and dashboard values are the same apart from capitals or spaces, so they show NO CHANGE and nothing is sent.
- **2.26 (2026-10-13, r71):** Zoho CRM Sync: emails with capitals, spaces or invisible characters now match, and students missing from Zoho's list are found by Zoho search. New **🧩 Field Mapping** sub-tab: map any dashboard value to any Zoho field, with Overwrite or Fill only if blank, Default and Fixed values, transforms and Test with Zoho. New **⏰ Daily Schedule**: Sync All every day at a set time.
- **2.25 (2026-10-13, r70):** New **Classes → 🧾 Class Coverage Tracking** (Admin, Super Admin, HM, class VP / HM): record the Coverage Status and the action taken when a teacher or parent volunteer is unavailable, with filters, search and full history. New **🔄 Zoho CRM Sync** tab (Admin / Super Admin): preview, then update the Google Classroom, teacher and grade on existing Zoho Student Contacts, matched by Student APS Email Address.
- **2.24 (2026-10-13, r69):** Clean-up only — three unused behind-the-scenes functions and some leftover styling removed. Nothing you see or use changed. The "DONOTUSE($$)" Force Sync button stays, shown to Admin and Super Admin only.
- **2.23 (2026-10-13, r68):** Faster and tidier, same look. Classes page with many classes draws about 2–3× faster (cards far down the page are drawn only when you scroll to them); the 45-second live-status check does much less work on the server; on phones the header buttons, filters and quick-filter buttons sit two per row, so the first class appears about 250 px higher; keyboard focus is always visible. No buttons, tabs or permissions changed.
- **2.22 (2026-10-13, r67):** Exam Question Paper — **⬇️ Download Teacher Copy** and **📧 Send to Student** for Teacher / VP / HM / Admin (own classes; from the release time). Confirmation before sending, email from attendance@ with the student's own PDF attached, audit log of every send. Student downloads are unchanged.
- **2.21 (2026-10-12, r66):** Re-Map Student email ("APS Classroom Assignment Updated") now also copies the **old and new class teachers**, shows both teachers, and adds the **Important** note on missed work, the APS Grading Policy and books for a grade change.
- **2.20 (2026-10-10, r65):** Live Meet status no longer says **"Google Meet not started yet"** (red) when the dashboard simply cannot see a class's Meet — it shows a grey **"Live Google Meet status not available"** instead, on the class card Status box, the card's status text and GCM - Preview. "Not started" is shown only when Google Meet confirms no meeting is running. The live Meet check now runs every **45 seconds** (was 2 minutes), refused Meets are re-checked after 45 seconds (was 6 hours), and GCM - Preview shows a **Live Meet check** diagnostic line for Admins.
- **2.19 (2026-10-10, r64):** Class cards in **Classes → Google Classroom** show a **Status** box during class time — the same live Meet status as GCM - Preview — in green when the teacher is in the Meet and red when the teacher is not in the Meet or the Meet has not started; it refreshes every 45 seconds.
- **2.18 (2026-10-10, r63):** **TEST environment emails** now go only to info@avvaiyarpadasalai.org, marked `[TEST ENVIRONMENT]` with a banner listing the LIVE recipients (max 30 a day; `TEST_EMAIL_MODE = OFF` sends nothing). LIVE email is unchanged.
- **2.17 (2026-10-09, r62):** The weekly **Teacher Availability** email no longer names Availability Not Set teachers or their classes — it shows only the counts, and asks every teacher to set their weekly preference. Not Available teachers are still listed; the dashboard report is unchanged.
- **2.16 (2026-10-09, r61):** **Class Change Requests** and **Reference Letter Approvals** moved from the top bar into **Assign Classroom** as sub-tabs. Same people see them as before (students and approvers now see the Assign Classroom tab with only their sub-tab); the pages themselves are unchanged.
- **2.15 (2026-10-09, r60):** Classes sub-tab renamed **Google Classroom**. Both Classes searches on one line (stacked on phones) and both match **name, APS email or APSID**; the student search filters as you type with a clear *No student found* message. **Assign Classroom** gets sub-tabs **Re-Map Student** (existing screen; audit log side by side, equal size; APSID search; now also loads for Super Admin) and new **Remove Student** (Admin / Super Admin; 5–200 word reason; server-verified removal; email from attendance@ to the class teacher, HM and VP with admin@ CC; Retry email; **Student Removal Audit Log**, BOD read-only). New Access Control rows *Re-Map Student* and *Remove Student*.
- **2.14 (2026-10-09, r58):** New **Classes → 🔀 Temporary Class Coverage** (One-Time Class Merge) for Admin, Super Admin, Head Masters and class VP / HM: same Nilai / day / time matching, verified Meet link, announcement in the original class (auto-deleted after class), emails from attendance@ (students BCC, staff, admin@ CC), Merge History with safe Retry, attendance credit and a "merged today" banner on class cards. New Access Control row *Temporary Class Coverage*.
- **2.13 (2026-10-08, r57):** **Directory Search covers every AY26-27 class** for every role. Students and Authorized users see name, grade, class and class teacher (plus teachers' APS emails) — never another student's email, APSID, login or online status; Teachers / Headmasters / Admin / BOD see full details. Adds a **Class Teacher** line to student results.
- **2.12 (2026-10-08, r56):** New **🛡️ Admin Control** tab (Admin / Super Admin) with **🔐 Access Control** — per-role switches for every tab and sub-tab, enforced on the server, with confirmation and change history. **User Roles & Permissions** and **Backup & Archive** moved under Admin Control.
- **2.11 (2026-10-08, r55):** End-to-end validation release. Security hardening: the editor-only maintenance functions (`syncClassroomData`, `syncAttendanceForAllCourses`, `sendWeeklyAttendanceReports`, `sendAttendanceReportPreviewToMe`, `createSyncTrigger`, `createAttendanceSyncTrigger`, `apsOwnerReauthorizeAllScopes`, `checkExamQuestionPaperSetup`, `getUserCountryFlag`) can no longer be called from the web app by visitors — only by the script owner in the Apps Script editor or by their own trigger. Dashboard buttons (Force Sync, Sync Attendance Now) work exactly as before.
- **2.10 (2026-10-08, r54):** **Ticket emails** now use the standard APS email format (same header/footer as all APS emails), colour badges, a phone-friendly details table, clear "what happened" headline, plain-text version, and readable subjects (`[APS Ticket #…] New Reply - Books - Student`). **On-Call Coordinator** (tcs_asvika_aps8112): sees every class read-only (new `ON_CALL_COORDINATOR_EMAILS`).
- **2.9 (2026-10-08, r53):** The **weekly class attendance report** and the **Teacher Availability report** (and its test email) are now sent **from attendance@avvaiyarpadasalai.org** through the Gmail API with **admin@ always in CC** (info3@ removed; admin@ moved from To to CC on the availability report). Reply-To: the class teacher(s) for attendance reports, attendance@ for the availability report. If attendance@ cannot sign in, sending pauses and admin@ is alerted (no fallback sender). Daily limit is counted for attendance@ (`ATTENDANCE_MAIL_DAILY_LIMIT`, default 1500).
- **2.8 (2026-10-07, r52):** New **🎫 Tickets** tab — My Tickets, Assigned to Me, Create Ticket, and Admin-only All Tickets, Ticket Reports, Ticket Settings; automatic assignment per type (Teacher / HM / VP from the class data + departments), admin override with audit, internal notes, emails from donotreply@ with admin@ always CC.
- **2.7 (2026-10-07, r51):** "Student Onboarding Status" tab renamed **Active Directory**, with sub-tabs **Directory Search** (new — search students and teachers by name, APSID or APS email; see their Google Classroom) and **Student Onboarding Status** (unchanged).
- **2.6 (2026-10-07, r50):** The backup card moved to its own **🛡️ Backup & Archive** tab so Admins (not only Super Admin) can reach it.
- **2.5 (2026-10-07, r49):** Faster dashboard with far fewer server calls — live status flags refresh every ~45 s (was 2 s), chat every 15 s only while open, course list and WhatsApp links cached on the server, legacy 15-minute Classroom sync removed (daily 5 PM + Force Sync only). New **System Backup & Audit Archive**: weekly full backup to *APS-DASHBOAD-SYSTEM-BACKUP-CLAUDE* and 90-day audit archive.
- **2.4 (2026-10-07, r48):** `tcs_asvika_aps8112` is now included in On-Call Teacher Attendance (removed from the code exclusion list and from `ATTENDANCE_EXCLUDED_EMAILS` in ENV_VARIABLE_LIVE/TEST). Like every other TCS_/TTS_ account she also appears in the Teacher Availability report only where Google Classroom lists her as a class (Primary) teacher. Knowledge Base gains the three APS Dashboard videos (Overview, Examination Student Guide, Examination Teacher & Admin Guide).
- **2.3 (2026-10-07, r47):** On-Call Teacher Attendance now captures every `TCS_` and `TTS_` teacher of each class (they were only caught when named Primary Teacher or when found in the class Meet). Takes effect after the next Classroom sync + Attendance sync.
- **2.2 (2026-10-07, r46):** On-call teachers (`tcs_` / `tts_`) and every other Google Classroom teacher now sign in as **Teacher** and see the classes they are a teacher of in Google Classroom (after the next sync). They are still not listed on the class cards unless named as Primary Teacher.
- **2.1 (2026-10-07, r45):** The "On-Call Teachers" section is no longer shown on class cards (Classes tab → Classes).
- **2.0 (2026-10-06, r44):** New look for class cards (no behaviour change): coloured top bar (blue = normal, green = live now, amber = no students), tinted header with the class time as a 🕒 label, section headings with icons (👩‍🏫 Teacher, 🎓 Students, 🛟 On-call, 🔗 Resources), white people boxes, help buttons in a footer strip.
- **1.9 (2026-10-06, r43):** New look for navigation only (no behaviour change): main tabs are rounded cards in a "Dashboard Navigation" box, colour-coded by area (blue Classroom, green Student operations, amber Knowledge, purple Letters, teal Attendance/Examination, grey Settings); the open tab is tinted, outlined, underlined and bold; sub-tabs (Classes, Examination, Letters) are smaller and grouped under their section; on phones the tabs scroll sideways.
- **1.8 (2026-10-06, r42):** Student Appreciation Letter for Admin / Super Admin / Head Master (every class) with a **Google Classroom** filter; Teacher Appreciation Letter **Nilai** filter; **not in the list?** — type the name + APS email; **Appreciation Letter History** (who, when, to whom, result).
- **1.7 (2026-10-06, r40):** Letter-type cards renamed: Reference/Volunteer Letter, Student Appreciation Letter, Teacher Appreciation Letter.
- **1.6 (2026-10-06, r39):** "Reference Letter" tab renamed **Letters**; new **APS Appreciation Certificate Generator** for teachers and **Teacher Appreciation Letter** for Admin / Super Admin / Head Master (section 9).
- **1.5 (2026-10-05, r38):** Class cards have a **Resources** box (Join to WhatsApp; Join to Google Meet + Copy; Join to Google Classroom + Copy, with "Copied ✓" and a message). **Cancel Class / Reschedule Class** removed from the cards (Restore stays for classes already marked). Class time shown on its own line under the class name.
- **1.4 (2026-10-05, r37):** Students on class cards now use the same two-line layout as teachers (name, then APSID + Meet/Classroom marker + last login).
- **1.3 (2026-10-05, r36):** Teachers on class cards are shown on two lines (name + Primary Teacher / VP / HM, then APSID + last login). GCM - Preview: **Open Classroom** and **Join WhatsApp** buttons with Copy link next to Open Meet; Primary Teacher, Head Master and Vice Principal shown in small type for every class.
- **1.2 (2026-10-05, r35):** Class status is now live from Google Meet — **Class Started** when the teacher and a student have joined (early starts included), **Class Ended** when the Meet ends — with a one-line explanation for Admin / HM / teachers. New Admin-only **🎥 GCM - Preview** tab (section 11A). "Completed" is now called "Class Ended".
- **1.1 (2026-10-05, r34):** Meet links are filled automatically from Google Classroom (Description / Room / Section and the class stream; daily 5 PM + Admin "Auto-fill from Google Classroom" button); Google Classroom `lookup` join links supported.
- **1.0 (2026-10-05, r33):** first complete guide. Covers Primary Teacher from the Course Description, class VP/HM, Join to Google Meet / Copy meeting link, the Teacher Availability Report, current-week-only attendance, On-Call attendance, the Grading approved-prefix rule, frozen Grades columns, readable layout on every screen, and video scenes for every chapter.

# Phase 1 — Foundation: status and hand-over

**Goal (from the plan):** Node.js API, Google sign-in for the 4 APS domains, roles and Access Control, the
`google.script.run` replacement for Dashboard.html, CI/CD. **Gate:** every role signs in on Azure test; Access Control
suites pass.

## Done

- Express server for App Service; health check; security headers; Dashboard.html served unchanged (5 template values).
- Google sign-in: code flow, single-use 10-minute state, ID token verified by signature + audience; ticket deep links.
- Sessions: 6 h, server-side, opaque token; sign-out removes it.
- Roles: `getViewerRoleForEmail_` port; visible classes (`getViewerContext_`); permissions; read-only guard.
- Access Control: full 44-row catalog and rules; `requireTab` guard for every future endpoint.
- Registry + shim: same names/arguments; `{ok}`/`{err}`; user object; SESSION_EXPIRED; unported → `NOT_ON_AZURE_YET`.
- Google: service-account client (domain-wide delegation), Sheets batchGet reader with bounded retry and 60 s caches.
- Infrastructure (Bicep), CI/CD (GitHub Actions + OIDC), README deploy steps.
- Separate project `PycharmProjects\APS-Dashboard-Azure` (2026-11-10) with `gas-source/` (Apps Script r121 reference + regression suite) and `docs/reference/`.
- **v0.1.1 (2026-11-10, after the first real deployment):**
  - Sign-in state is now **signed** (HMAC, key derived from the OAuth client secret): a sign-in started just before a
    restart or deploy still completes. Still single-use and 10 minutes; forged/altered states refused; the ticket deep
    link rides inside it. (Code.gs fails open when its cache entry is gone; Azure keeps the check but survives restarts.)
  - The shim removes the one-time `code`/`state` from the address bar after the callback, so a reload no longer
    re-sends a used code ("sign-in expired") and the code is not kept in browser history. `?ticket=` is kept.
  - Start-up Google check: the log shows `[Google] Sheet check OK — N classes readable.` or
    `[Google] Sheet check FAILED: <kind> [<cause>] — <fix>`; failed sign-ins log the same cause/fix after `[SignIn]`.
    Google errors keep only Google's status/reason codes, never its free text (which can contain emails).
  - Sign-in help box shows Azure set-up wording instead of the Apps Script (Code.gs / redeploy) text — applied when the
    page is served; `Dashboard.html` itself stays identical to the Apps Script copy.
  - App Service's duplicate `APPSETTING_*` copies of each setting are ignored (no double warnings).
  - Node.js 22 LTS in `package.json`, `infra/main.bicep` and the deploy workflow (Node 20 reached end of life).

## Tests

v0.1.1 (2026-11-10): `npm test` 22 pass (adds signed state incl. restart, Google error explanations, start-up check,
Azure help wording, APPSETTING_ handling); browser check 4 pass (adds address-bar clean-up + Azure help text).

Earlier (2026-11-09):

- `npm test`: 17 tests pass — sign-in, sessions, roles, Access Control, API, renderer, Sheets reader, config.
- Parity with live Code.gs (r121): catalog identical; 300 random switch sets × 8 roles × 44 tabs × 2 viewers
  (over 90,000 checks); 21 role cases incl. case/space variants; visible classes; APSID; domains; permissions — all equal.
- Browser (Playwright, real Dashboard.html): sign-in screen + state nonce; page accepts the Azure session; shim calls,
  errors and user objects; sign-out ends the server session. No page errors besides not-yet-moved calls.
- On the real Azure deployment (by the APS admin): 2026-11-10 Bicep deployed, GitHub Actions deploy works, Google
  sign-in works; **2026-11-11 real Sheets read works — `[Google] Sheet check OK — 186 classes readable.`**
  (fix: the service-account key, not the OAuth client file, in `google-service-account-json`; then the Key Vault
  reference refresh — see docs/PHASE0_STATUS.md).
- **Phase 1 gate — open:** sign in once per role on Azure (Super Admin, Admin, Headmaster, BOD, teacher, student;
  personal Gmail refused) after the role-list secrets are saved. Tick here when done: ☐

## Deferred on purpose (listed in the user payload as safe "no access" values)

| Item | Why | Phase |
|---|---|---|
| `examinationAccess`, `gradingAccess`, `apsRole`, coverage / temp-teacher access | depend on those modules | 2 |
| Admin / HM badge name from Google profile | needs Admin Directory API (service account) | 2 |
| Saving Access Control / user roles / permissions on Azure | writes stay in Apps Script until Phase 3 | 3 |
| Sessions and caches in Redis | single instance is enough until then; a restart/deploy signs people out (6 h sessions) | 3 |
| Copying the Script Property `dashboardRolePermissions_v1` | Script Properties are only readable inside Apps Script; paste it into Key Vault `role-permissions-json` | 0/1 |

## Hand-over to Phase 2 (started 2026-11-11 — see docs/PHASE2.md)

Each module moves by: port its read functions into `src/api/endpoints/<module>.ts` (same names), start each with
`requireSession` / `requireTab`, read through `DataSource` (one bulk read, cached), port its Apps Script tests with
the same fixtures, add a parity test where the logic is pure, then shadow-compare against Apps Script for two weeks.
First up: `getDashboardData` (Classes), Active Directory, attendance views, Teacher Availability.

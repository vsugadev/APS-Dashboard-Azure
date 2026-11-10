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

## Tests (run on 2026-11-09)

- `npm test`: 17 tests pass — sign-in, sessions, roles, Access Control, API, renderer, Sheets reader, config.
- Parity with live Code.gs (r121): catalog identical; 300 random switch sets × 8 roles × 44 tabs × 2 viewers
  (over 90,000 checks); 21 role cases incl. case/space variants; visible classes; APSID; domains; permissions — all equal.
- Browser (Playwright, real Dashboard.html): sign-in screen + state nonce; page accepts the Azure session; shim calls,
  errors and user objects; sign-out ends the server session. No page errors besides not-yet-moved calls.
- **Not executed — environment/authorization required:** `az deployment` / Bicep compile, real Google sign-in,
  real Sheets API reads (no service account yet), GitHub Actions run.

## Deferred on purpose (listed in the user payload as safe "no access" values)

| Item | Why | Phase |
|---|---|---|
| `examinationAccess`, `gradingAccess`, `apsRole`, coverage / temp-teacher access | depend on those modules | 2 |
| Admin / HM badge name from Google profile | needs Admin Directory API (service account) | 2 |
| Saving Access Control / user roles / permissions on Azure | writes stay in Apps Script until Phase 3 | 3 |
| Sessions and caches in Redis | single instance is enough until then | 3 |
| Copying the Script Property `dashboardRolePermissions_v1` | Script Properties are only readable inside Apps Script; paste it into Key Vault `role-permissions-json` | 0/1 |

## Hand-over to Phase 2

Each module moves by: port its read functions into `src/api/endpoints/<module>.ts` (same names), start each with
`requireSession` / `requireTab`, read through `DataSource` (one bulk read, cached), port its Apps Script tests with
the same fixtures, add a parity test where the logic is pure, then shadow-compare against Apps Script for two weeks.
First up: `getDashboardData` (Classes), Active Directory, attendance views, Teacher Availability.

# APS Dashboard on Azure — Phase 1 (Foundation)

Location: `C:\Users\AmChaTS\PycharmProjects\APS-Dashboard-Azure` — a separate project beside the live Apps Script
project `APS-Classroom-Dashboard` (which is never changed by anything here).

## Folders

| Folder | What it holds |
|---|---|
| `src/` | Azure server code (TypeScript): sign-in, sessions, roles, Access Control, API, Google access, page renderer |
| `test/` | Azure tests, incl. parity tests against `gas-source/Code.gs` |
| `public/` | What the browser loads: `Dashboard.html` (copied from `gas-source/`) and `aps-gas-shim.js` |
| `infra/` | Azure infrastructure (Bicep) |
| `tools/` | `sync-gas`, `sync-dashboard`, `sync-prompt`, Apps Script regression runner, browser check |
| `gas-source/` | **Reference copy of the Apps Script project** (Code.gs, Dashboard.html, PdfLib.gs, PortalBridge.gs, appsscript.json, APS_PropertyQuota_Fix.gs) + its 119-file regression suite in `gas-source/test/`. Read-only: refresh it from the live project with `npm run sync-gas`. `SNAPSHOT.json` records the release and checksums. Secret files (`ENV_VARIABLE_*.gs`) are never copied. |
| `docs/` | Phase notes; `docs/reference/` = Help Guide, architecture reference, generic development prompt; `docs/prompt/azure_prompt_addendum.txt` = Azure migration rules |
| `aps_dashboard_Azure_prompt.txt` | **Generated** master prompt for Azure work = generic prompt (word for word) + Azure rules. Rebuilt automatically on `npm install`, `npm run build`, `npm test`, `npm run dev`; `npm run sync-prompt` for one update, `npm run watch-prompt` to keep it updating. Edit the generic prompt or the addendum, never this file. |
| `.github/workflows/` | Deploy pipeline (copy of it in `docs/azure-deploy.yml.txt`) |

The Azure version of the APS Classroom Dashboard, built in phases beside the live Google Apps Script dashboard
(see the plan "APS Dashboard — Code.gs to Azure Implementation Plan"). **Nothing here changes the live dashboard.**

Phase 1 delivers the foundation every later module plugs into:

| Part | What it does | Code |
|---|---|---|
| Web server | Node.js 20 + TypeScript on Azure App Service | `src/server.ts` |
| Same page | Serves the **same `Dashboard.html`** and fills its five Apps Script template values | `src/web/render.ts` |
| `google.script.run` shim | The page's calls go to the Azure API instead — no change to Dashboard.html | `public/aps-gas-shim.js` |
| Sign-in | Google sign-in (code flow, single-use state, verified ID token), 4 APS domains, ticket deep links | `src/auth/google.ts`, `src/app/context.ts` |
| Sessions | Server-side 6-hour sessions; the browser only holds an opaque token | `src/auth/sessions.ts` |
| Roles | Port of `getViewerRoleForEmail_` (same order, same results) and role permissions | `src/auth/roles.ts` |
| Access Control | Port of the 44-row Access Control matrix and every rule (r56–r120) | `src/auth/accessControl.ts` |
| API registry | Same function names and arguments as Code.gs; server-side checks; safe errors | `src/api/registry.ts`, `src/api/endpoints/core.ts` |
| Google access | One service account, domain-wide delegation, read-only Sheets in Phase 1 | `src/google/serviceAccount.ts`, `src/data/sources.ts` |
| Infrastructure | App Service, Key Vault (RBAC), App Insights, managed identity | `infra/main.bicep` |
| CI/CD | GitHub Actions: test → build → deploy → health check (OIDC, no stored passwords) | `.github/workflows/azure-deploy.yml` |

Endpoints on Azure in Phase 1: `getCurrentUser`, `getAccessControl` (read-only), `getStartupBundle`, `endSession`.
Every other function answers `NOT_ON_AZURE_YET: <name>` until its phase moves it.

## Run locally

```bash
npm install
cp .env.example .env          # APS_DATA_MODE=fixture + DEV_LOGIN=1: no Google account needed
npm run sync-gas              # refresh gas-source/ from ../APS-Classroom-Dashboard (optional)
npm run sync-dashboard        # copies gas-source/Dashboard.html to public/
npm run build
set -a; . ./.env; set +a; npm start   # Windows PowerShell: npm run start:local
# open http://localhost:8080/dev/login?email=admin@avvaiyarpadasalai.org  (add that email to ADMIN_EMAILS in .env)
```

## Tests

```bash
npm test                                   # unit + API + parity tests (node:test)
npm run test:gas                           # the Apps Script regression suite in gas-source/test (porting checklist)
npm run e2e                                # browser check of the real Dashboard.html through the shim (needs Playwright)
```

The parity tests load `gas-source/Code.gs` in the same mock the Apps Script regression uses and compare: the Access
Control catalog, 300 random switch sets × every role/tab/viewer, every role decision, visible classes, APSID, allowed
domains and default permissions.

## Deploy to Azure (subscription ready)

1. **Infrastructure** (Azure Cloud Shell or Azure CLI):
   ```bash
   az group create -n rg-aps-dashboard -l eastus
   az deployment group create -g rg-aps-dashboard -f infra/main.bicep -p appName=aps-dashboard
   ```
   Note the outputs `webAppUrl`, `keyVaultName` and `oauthRedirectUri`.
2. **Google sign-in client:** in the Google Cloud project that holds the dashboard's current OAuth client
   (Script Property `OAUTH_CLIENT_ID`), add the `oauthRedirectUri` (e.g. `https://aps-dashboard.azurewebsites.net/`)
   to *Authorized redirect URIs*. The same client ID and secret can be used.
3. **Key Vault secrets** (give yourself the *Key Vault Secrets Officer* role on the vault first):
   ```bash
   KV=<keyVaultName>
   az keyvault secret set --vault-name $KV -n google-oauth-client-id      --value "<client id>"
   az keyvault secret set --vault-name $KV -n google-oauth-client-secret  --value "<client secret>"
   az keyvault secret set --vault-name $KV -n superadmin-emails           --value '["…"]'   # same text as the Script Property
   az keyvault secret set --vault-name $KV -n admin-emails                --value '["…"]'
   az keyvault secret set --vault-name $KV -n headmaster-emails           --value '["…"]'
   az keyvault secret set --vault-name $KV -n bod-emails                  --value '["…"]'
   az keyvault secret set --vault-name $KV -n on-call-coordinator-emails  --value '["…"]'
   az keyvault secret set --vault-name $KV -n role-permissions-json       --value '{}'      # or the Script Property dashboardRolePermissions_v1
   ```
   `google-service-account-json` is added after Phase 0 (below). Never put these values in code, App settings or Git.
4. **GitHub deploy:** create an Entra ID app registration with a federated credential for this repository's `main`
   branch, give it *Website Contributor* on the web app, then add repository secrets `AZURE_CLIENT_ID`,
   `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` and the variable `AZURE_WEBAPP_NAME`. Push to `main`.
5. **Check:** `https://<app>/healthz` → `{"ok":true,"phase":1}`. Staff on the role lists can sign in and see the page;
   the dashboard content itself arrives with Phase 2.

### Still needed from Phase 0 — Google service account

Until it exists, Admin / Super Admin / HM / BOD (on the lists) can sign in; teachers and students get
"The dashboard cannot read class data right now". To finish:
1. Google Cloud console → *IAM & Admin → Service accounts* → create `aps-dashboard-azure`; create a JSON key
   (or, better, set up workload identity federation with Azure so no key file exists).
2. Google Admin console → *Security → API controls → Domain-wide delegation* → add the service account's client ID
   with the scopes listed in `src/google/serviceAccount.ts` (Phase 1 uses only `spreadsheets.readonly`).
3. `az keyvault secret set --vault-name $KV -n google-service-account-json --file key.json`, then delete `key.json`.
4. Set the App settings `TARGET_SPREADSHEET_ID` and `GOOGLE_IMPERSONATE_USER` (Bicep parameters) and restart.

## Security rules kept from Code.gs

- Every permission is checked on the server; the browser's role, email, hidden buttons and URL parameters are never trusted.
- Secrets live only in Key Vault (managed identity); unresolved references count as "not set"; values are never logged.
- Errors sent to the browser are one line, with tokens and keys masked; private helpers are not callable.
- `DEV_LOGIN` refuses to start in Azure.

See `docs/PHASE1.md` for what Phase 1 covers, what is deferred, and the hand-over to Phase 2.

# Phase 0 — Set-up status (updated 2026-11-11)

No secrets or passwords are in this file.

## Done

| Item | Value / result |
|---|---|
| Azure subscription | Azure subscription 1 (tenant: American Charitable Tamil Society, Inc) |
| Resource group | `rg-aps-dashboard` |
| Web app | `aps-dashboard-ap` → https://aps-dashboard-ap.azurewebsites.net |
| Key Vault | `kv-apsdashboardapu7zau2j` |
| Infrastructure | `infra/main.bicep` deployed |
| Your Azure roles on the resource group | Role Based Access Control Administrator, Key Vault Administrator (+ Contributor) |
| GitHub repository | `vsugadev/APS-Dashboard-Azure` |
| GitHub sign-in to Azure | Managed identity `id-aps-github` (no App registration needed), federated credential `github-production`, subject `repo:vsugadev@20652424/APS-Dashboard-Azure@1453001598:environment:production` |
| GitHub secrets / variable | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`; variable `AZURE_WEBAPP_NAME=aps-dashboard-ap` |
| Deploy | GitHub Actions deploys on push to `main`; app starts (`listening on 8080 — data: sheets`) |
| Key Vault secrets resolving | `google-oauth-client-id`, `google-oauth-client-secret`, `google-service-account-json` |
| Google sign-in | Works (redirect URI `https://aps-dashboard-ap.azurewebsites.net/` accepted) |
| Google service account + domain-wide delegation | **Works (2026-11-11 18:30 UTC): `[Google] Sheet check OK — 186 classes readable.`** |
| Runtime | Node 22 LTS (`appsvc/node:22-lts`) |
| Chrome "Dangerous" warning | Was shown on 2026-11-11 (Safe Browsing); gone later that day. If it returns: report at safebrowsing.google.com → Report an error, or verify the site in Google Search Console and request a review. Long term: own domain (e.g. dashboard.namaps.org). |

## Waiting / to do

1. ~~Domain-wide delegation~~ — done. Lesson learned: `google-service-account-json` must be the **service-account key**
   file (`{"type": "service_account", … "private_key": …}`), not the OAuth client file (`{"web": …}`); the delegation
   Client ID is the service account's numeric **Unique ID**.
2. **Role-list secrets** (red crosses): run
   `powershell -ExecutionPolicy Bypass -File tools\push-role-lists-to-keyvault.ps1 -FromFile C:\Temp\aps-roles.json -Restart`
   (JSON format: double quotes, `["a@x.org"]`), then delete the file.
   Secrets: `superadmin-emails`, `admin-emails`, `headmaster-emails`, `bod-emails`, `on-call-coordinator-emails`,
   optional `role-permissions-json`.
3. **Phase 1 gate — sign in once per role:** Super Admin, Admin, Headmaster, BOD, teacher, student, and a personal
   Gmail (must be refused). Then mark Phase 1 complete in docs/PHASE1.md.
4. **Retry test (if something fails):** open https://aps-dashboard-ap.azurewebsites.net/ fresh, sign in, and if it fails run
   `az webapp log tail -g rg-aps-dashboard -n aps-dashboard-ap` and read the `[Google] Sheet check` line (written at
   every start) or the `[SignIn] class data unavailable:` line — both name the cause and the fix.

## Code update v0.1.1 (done 2026-11-10)

Restart-safe sign-in link, address-bar clean-up after sign-in, start-up `[Google] Sheet check` with the fix in the log,
Azure wording in the sign-in help box, no duplicate `APPSETTING_` warnings, Node 22 LTS. See docs/PHASE1.md.
**Copy `docs\azure-deploy.yml.txt` over `.github\workflows\azure-deploy.yml`** (Node 22) before pushing.
Switch the web app to Node 22 (PowerShell needs `--%` because of the `|`):
`az --% webapp config set -g rg-aps-dashboard -n aps-dashboard-ap --linux-fx-version "NODE|22-lts"`

## Changing a Key Vault secret — make the app see it

The app's Key Vault references have no version, so App Service may keep the old value for up to 24 hours —
**a restart alone is not enough**. After changing any secret:

```powershell
az rest --method post --uri "https://management.azure.com/subscriptions/6a7feb18-766c-4257-b84c-8c920f499720/resourceGroups/rg-aps-dashboard/providers/Microsoft.Web/sites/aps-dashboard-ap/config/configreferences/appsettings/refresh?api-version=2022-03-01"
az webapp restart -g rg-aps-dashboard -n aps-dashboard-ap
```

Check what a secret holds without printing it (example: the service-account key):

```powershell
$raw = (az keyvault secret show --vault-name kv-apsdashboardapu7zau2j -n google-service-account-json --query value -o tsv) -join "`n"
$raw.Substring(0,12)   # must start with {"type": "se
```

## Useful commands

```powershell
az webapp log tail -g rg-aps-dashboard -n aps-dashboard-ap      # live log
az webapp restart  -g rg-aps-dashboard -n aps-dashboard-ap      # after changing secrets
```
Health check: https://aps-dashboard-ap.azurewebsites.net/healthz → `{"ok":true,"phase":1}`

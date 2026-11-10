# Phase 0 — Set-up status (saved 2026-11-10)

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

## Waiting / to do

1. **Domain-wide delegation (retry after 24 hours).** Google Admin console → Security → Access and data control →
   API controls → Manage Domain Wide Delegation. The Client ID must be the service account's **numeric Unique ID**;
   scope `https://www.googleapis.com/auth/spreadsheets.readonly`. Changes can take up to 24 hours.
   Symptom until then: sign-in shows "The dashboard cannot read class data right now".
2. **Role-list secrets** (red crosses): run
   `powershell -ExecutionPolicy Bypass -File tools\push-role-lists-to-keyvault.ps1 -FromFile C:\Temp\aps-roles.json -Restart`
   (JSON format: double quotes, `["a@x.org"]`), then delete the file.
   Secrets: `superadmin-emails`, `admin-emails`, `headmaster-emails`, `bod-emails`, `on-call-coordinator-emails`,
   optional `role-permissions-json`.
3. **Retry test:** open https://aps-dashboard-ap.azurewebsites.net/ fresh, sign in, and if it fails run
   `az webapp log tail -g rg-aps-dashboard -n aps-dashboard-ap` and read the `[Google] Sheet check` line (written at
   every start) or the `[SignIn] class data unavailable:` line — both name the cause and the fix.

## Code update v0.1.1 (done 2026-11-10)

Restart-safe sign-in link, address-bar clean-up after sign-in, start-up `[Google] Sheet check` with the fix in the log,
Azure wording in the sign-in help box, no duplicate `APPSETTING_` warnings, Node 22 LTS. See docs/PHASE1.md.
**Copy `docs\azure-deploy.yml.txt` over `.github\workflows\azure-deploy.yml`** (Node 22) before pushing.

## Useful commands

```powershell
az webapp log tail -g rg-aps-dashboard -n aps-dashboard-ap      # live log
az webapp restart  -g rg-aps-dashboard -n aps-dashboard-ap      # after changing secrets
```
Health check: https://aps-dashboard-ap.azurewebsites.net/healthz → `{"ok":true,"phase":1}`

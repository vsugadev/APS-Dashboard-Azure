// APS Dashboard on Azure — Phase 1 infrastructure.
// Creates: Log Analytics + Application Insights, Key Vault (RBAC), Linux App Service plan + Node 22 LTS web app with a
// system-assigned managed identity that can READ Key Vault secrets. Secrets themselves are added by an administrator
// afterwards (names below) — none are in this file or in source control.
//
// Deploy:  az deployment group create -g <resource-group> -f infra/main.bicep -p appName=aps-dashboard
targetScope = 'resourceGroup'

@description('Short name used for every resource (letters, digits, hyphens; globally unique for the web app and vault).')
@minLength(3)
@maxLength(20)
param appName string

param location string = resourceGroup().location

@description('App Service plan size. B1 is enough for Phase 1; move to S1/P1v3 before go-live for slots and scale-out.')
param planSku string = 'B1'

@description('Public https address users will open (the Google OAuth redirect URI is this + "/"). Defaults to the azurewebsites.net name.')
param publicBaseUrl string = 'https://${appName}.azurewebsites.net'

@description('Workspace account the Google service account impersonates (same account the Apps Script project runs as).')
param googleImpersonateUser string = ''

@description('ID of the main Google Sheet (same value as the Script Property TARGET_SPREADSHEET_ID).')
param targetSpreadsheetId string = ''

@description('ID of the Attendance spreadsheet (Script Property ATTENDANCE_SPREADSHEET_ID) — Meet link map sheets for the Classes view.')
param attendanceSpreadsheetId string = ''

var vaultName = take('kv-${replace(appName, '-', '')}${uniqueString(resourceGroup().id)}', 24)
var kvRef = 'https://${vaultName}${environment().suffixes.keyvaultDns}/secrets'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${appName}'
  location: location
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${appName}'
  location: location
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: logs.id, DisableIpMasking: false }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'plan-${appName}'
  location: location
  kind: 'linux'
  sku: { name: planSku }
  properties: { reserved: true }
}

resource web 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: true // Phase 1 keeps sessions in memory (one instance); Phase 3 moves them to Redis
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'node dist/src/server.js'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      healthCheckPath: '/healthz'
      appSettings: [
        { name: 'NODE_ENV', value: 'production' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'PUBLIC_BASE_URL', value: publicBaseUrl }
        { name: 'APS_DATA_MODE', value: 'sheets' }
        { name: 'TARGET_SPREADSHEET_ID', value: targetSpreadsheetId }
        { name: 'ATTENDANCE_SPREADSHEET_ID', value: attendanceSpreadsheetId }
        { name: 'GOOGLE_IMPERSONATE_USER', value: googleImpersonateUser }
        { name: 'DASHBOARD_HTML_PATH', value: 'public/Dashboard.html' }
        // Secrets — Key Vault references, resolved by the managed identity. Add the secrets with the names below.
        { name: 'GOOGLE_OAUTH_CLIENT_ID', value: '@Microsoft.KeyVault(SecretUri=${kvRef}/google-oauth-client-id/)' }
        { name: 'GOOGLE_OAUTH_CLIENT_SECRET', value: '@Microsoft.KeyVault(SecretUri=${kvRef}/google-oauth-client-secret/)' }
        { name: 'GOOGLE_SERVICE_ACCOUNT_JSON', value: '@Microsoft.KeyVault(SecretUri=${kvRef}/google-service-account-json/)' }
        // Role lists (JSON array text, same as the Script Properties). Kept in Key Vault because they hold staff emails.
        { name: 'SUPERADMIN_EMAILS', value: '@Microsoft.KeyVault(SecretUri=${kvRef}/superadmin-emails/)' }
        { name: 'ADMIN_EMAILS', value: '@Microsoft.KeyVault(SecretUri=${kvRef}/admin-emails/)' }
        { name: 'HEADMASTER_EMAILS', value: '@Microsoft.KeyVault(SecretUri=${kvRef}/headmaster-emails/)' }
        { name: 'VCFO_AMCHATS_BOD_EMAILS', value: '@Microsoft.KeyVault(SecretUri=${kvRef}/bod-emails/)' }
        { name: 'ON_CALL_COORDINATOR_EMAILS', value: '@Microsoft.KeyVault(SecretUri=${kvRef}/on-call-coordinator-emails/)' }
        { name: 'ROLE_PERMISSIONS_JSON', value: '@Microsoft.KeyVault(SecretUri=${kvRef}/role-permissions-json/)' }
      ]
    }
  }
}

// Key Vault Secrets User (read secret values) for the web app's managed identity only.
resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, web.id, 'kv-secrets-user')
  scope: vault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: web.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output webAppName string = web.name
output webAppUrl string = 'https://${web.properties.defaultHostName}'
output keyVaultName string = vault.name
output oauthRedirectUri string = '${publicBaseUrl}/'

<#
.SYNOPSIS
  Copies the APS role lists from the Apps Script Script Properties into the Azure Key Vault secrets
  the Azure web app reads (see infra/main.bicep).

.DESCRIPTION
  Apps Script has no API for reading Script Properties, so the values are copied by hand:
    Apps Script editor -> Project Settings (gear) -> Script Properties -> copy the value
  and pasted here when asked. The script checks each value (valid JSON, real email addresses),
  stores it in Key Vault through a temporary file (so PowerShell cannot break the quotes),
  deletes that file, and never prints a value.

  Or put all values in one local JSON file and pass -FromFile (delete the file afterwards):
    { "ADMIN_EMAILS": ["a@x.org"], "HEADMASTER_EMAILS": "[\"b@x.org\"]", ... }

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\push-role-lists-to-keyvault.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\push-role-lists-to-keyvault.ps1 -FromFile C:\Temp\aps-roles.json -Restart
#>
[CmdletBinding()]
param(
  [string]$ResourceGroup = 'rg-aps-dashboard',
  [string]$AppName = 'aps-dashboard-ap',
  [string]$VaultName = '',
  [string]$FromFile = '',
  [switch]$Restart
)

$ErrorActionPreference = 'Stop'

# Script Property name  ->  Key Vault secret name  (kind: list = JSON array of emails, object = JSON object)
$map = @(
  @{ prop = 'SUPERADMIN_EMAILS';          secret = 'superadmin-emails';          kind = 'list' },
  @{ prop = 'ADMIN_EMAILS';               secret = 'admin-emails';               kind = 'list' },
  @{ prop = 'HEADMASTER_EMAILS';          secret = 'headmaster-emails';          kind = 'list' },
  @{ prop = 'VCFO_AMCHATS_BOD_EMAILS';    secret = 'bod-emails';                 kind = 'list' },
  @{ prop = 'ON_CALL_COORDINATOR_EMAILS'; secret = 'on-call-coordinator-emails'; kind = 'list' },
  @{ prop = 'dashboardRolePermissions_v1'; secret = 'role-permissions-json';     kind = 'object'; optional = $true }
)

function Invoke-Az([string[]]$azArgs) {
  $out = & az @azArgs 2>&1
  if ($LASTEXITCODE -ne 0) { throw "az $($azArgs[0]) $($azArgs[1]) failed: $out" }
  return $out
}

# Returns @{ ok; text; msg }  — text is the compact value to store; never echoed.
function Test-Value([string]$raw, [string]$kind) {
  $t = ($raw -replace '^\uFEFF', '').Trim()
  if ($t -eq '') { return @{ ok = $false; msg = 'empty' } }
  try { $parsed = ConvertFrom-Json -InputObject $t } catch { return @{ ok = $false; msg = 'not valid JSON' } }
  if ($kind -eq 'list') {
    if (-not $t.StartsWith('[')) { return @{ ok = $false; msg = 'must be a JSON list like ["a@x.org","b@x.org"]' } }
    $items = @($parsed)
    foreach ($e in $items) {
      if (-not ($e -is [string]) -or $e -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
        return @{ ok = $false; msg = 'every item must be an email address' }
      }
    }
    return @{ ok = $true; text = $t; msg = "$($items.Count) email(s)" }
  }
  if (-not $t.StartsWith('{')) { return @{ ok = $false; msg = 'must be a JSON object { ... }' } }
  return @{ ok = $true; text = $t; msg = 'JSON object' }
}

# --- Find the vault ---------------------------------------------------------------------------
if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw 'Azure CLI (az) not found. Install it and run az login first.' }
if (-not $VaultName) {
  $VaultName = (Invoke-Az @('deployment', 'group', 'show', '-g', $ResourceGroup, '-n', 'main',
      '--query', 'properties.outputs.keyVaultName.value', '-o', 'tsv')).ToString().Trim()
}
Write-Host "Key Vault: $VaultName" -ForegroundColor Cyan
$existing = @(Invoke-Az @('keyvault', 'secret', 'list', '--vault-name', $VaultName, '--query', '[].name', '-o', 'tsv'))
$existing = $existing | ForEach-Object { $_.ToString().Trim() }

# --- Read values from a file (optional) -------------------------------------------------------
$fileValues = $null
if ($FromFile) {
  if (-not (Test-Path $FromFile)) { throw "File not found: $FromFile" }
  $fileValues = Get-Content -Raw -Encoding UTF8 $FromFile | ConvertFrom-Json
}

$saved = 0
foreach ($m in $map) {
  $state = if ($existing -contains $m.secret) { 'already set' } else { 'missing' }
  Write-Host ""
  Write-Host ("{0}  ->  {1}  ({2})" -f $m.prop, $m.secret, $state) -ForegroundColor Yellow

  if ($fileValues) {
    $v = $fileValues.($m.prop)
    if ($null -eq $v) { Write-Host '  not in file - skipped'; continue }
    $raw = if ($v -is [string]) { $v } else { ConvertTo-Json -InputObject $v -Compress -Depth 20 }
    if ($m.kind -eq 'list' -and -not $raw.Trim().StartsWith('[')) { $raw = "[$raw]" }  # one-item list
  } else {
    $hint = if ($m.optional) { ' (optional)' } else { '' }
    $raw = Read-Host "  Paste the value of Script Property $($m.prop)$hint, or press Enter to skip"
    if ($raw.Trim() -eq '') { Write-Host '  skipped'; continue }
  }

  $check = Test-Value $raw $m.kind
  if (-not $check.ok) { Write-Host "  NOT saved: $($check.msg)" -ForegroundColor Red; continue }

  $tmp = Join-Path $env:TEMP ("aps-kv-" + [guid]::NewGuid().ToString('N') + '.txt')
  try {
    [IO.File]::WriteAllText($tmp, $check.text, (New-Object System.Text.UTF8Encoding($false)))  # no BOM
    Invoke-Az @('keyvault', 'secret', 'set', '--vault-name', $VaultName, '-n', $m.secret,
        '--file', $tmp, '--encoding', 'utf-8', '--content-type', 'application/json', '--output', 'none') | Out-Null
    Write-Host "  saved ($($check.msg))" -ForegroundColor Green
    $saved++
  } finally {
    if (Test-Path $tmp) { Remove-Item $tmp -Force }
  }
}

Write-Host ""
Write-Host "$saved secret(s) saved." -ForegroundColor Cyan
if ($FromFile) { Write-Host "Delete $FromFile now - it contains staff email lists." -ForegroundColor Yellow }

if ($saved -gt 0) {
  $doRestart = $Restart -or ((Read-Host 'Restart the web app now so it reads the new values? (y/N)') -match '^[yY]')
  if ($doRestart) {
    Invoke-Az @('webapp', 'restart', '-g', $ResourceGroup, '-n', $AppName) | Out-Null
    Write-Host "Restarted $AppName. Check Settings -> Environment variables for green ticks in a few minutes." -ForegroundColor Green
  }
}

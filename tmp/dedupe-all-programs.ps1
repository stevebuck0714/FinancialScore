# Wrapper that runs `tmp/dedupe-infor-raw.ts --execute` for each Infor CSI
# program in descending order of duplicate volume. Run this AFTER you have
# already manually deduped SLArtrans (it's the biggest and you should monitor
# the first one yourself).
#
# Usage:
#   $env:DATABASE_URL = "<DIRECT prod URL — no -pooler>"
#   .\tmp\dedupe-all-programs.ps1
#
# Notes:
#   - Skips SLArtrans by default (assumed already done). Override with -IncludeSLArtrans.
#   - Stops on first error so you can investigate.
#   - Bumps Node heap to 4GB.
#   - Uses --batch 10000.
#   - Logs each program's start/finish time.

param(
  [switch]$IncludeSLArtrans,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$env:NODE_OPTIONS = "--max-old-space-size=4096"

if (-not $env:DATABASE_URL) {
  Write-Error "DATABASE_URL is not set. Set it to the DIRECT (non-pooler) prod URL first."
  exit 1
}

# Confirm host has no -pooler
$dbHost = ($env:DATABASE_URL -split "@")[1] -split "/" | Select-Object -First 1
if ($dbHost -match "-pooler") {
  Write-Error "DATABASE_URL points at a pooler endpoint ($dbHost). Use the DIRECT endpoint."
  exit 1
}
Write-Host "Target DB: $dbHost" -ForegroundColor Cyan

# Order: largest projected delete first (based on prod audit 2026-04-17).
# SLArtrans is intentionally first so you can choose to skip it via -IncludeSLArtrans:$false.
$programs = @(
  'SLArtrans',
  'SLCoitems',
  'SLCos',
  'SLAptrx',
  'SLVchHdrs',
  'SLChartAccts',
  'SLCustomers',
  'GLAcctPeriodBalances',
  'SLAPTRXPS',
  'SLAptrxps',
  'SLGLTRANS',
  'SLVendors',
  'SLLedgers',
  'SLVCHHDRS',
  'SLCharts',
  'SLBankHdrs',
  'SLItems',
  'SLInvHdrs',
  'SLItemlocs',
  'SLAPTRXS',
  'SLAPPMTS'
)

if (-not $IncludeSLArtrans) {
  $programs = $programs | Where-Object { $_ -ne 'SLArtrans' }
  Write-Host "Skipping SLArtrans (assumed already deduped). Pass -IncludeSLArtrans to include it." -ForegroundColor Yellow
}

$baseArgs = @('tsx', 'tmp/dedupe-staged.ts')
if (-not $DryRun) { $baseArgs += '--execute' }
$baseArgs += @('--batch', '10000')

$totalStart = Get-Date
foreach ($prog in $programs) {
  $progStart = Get-Date
  Write-Host ""
  Write-Host "=========================================================" -ForegroundColor Green
  Write-Host "[$($progStart.ToString('HH:mm:ss'))] Starting: $prog" -ForegroundColor Green
  Write-Host "=========================================================" -ForegroundColor Green

  $progArgs = $baseArgs + @('--program', $prog)
  & npx @progArgs

  if ($LASTEXITCODE -ne 0) {
    Write-Error "Dedup failed for program $prog with exit code $LASTEXITCODE. Stopping."
    exit $LASTEXITCODE
  }

  $progEnd = Get-Date
  $progElapsed = ($progEnd - $progStart).TotalMinutes
  Write-Host "[$($progEnd.ToString('HH:mm:ss'))] Finished $prog in $([math]::Round($progElapsed,1)) min" -ForegroundColor Green
}

$totalEnd = Get-Date
$totalElapsed = ($totalEnd - $totalStart).TotalMinutes
Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "ALL PROGRAMS DONE in $([math]::Round($totalElapsed,1)) min" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

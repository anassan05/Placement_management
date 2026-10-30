$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$hooks = @(
  @{ Name = "CAMPUSCONNECT_MAINTENANCE_HOOK"; Label = "enter maintenance mode / stop incoming traffic" },
  @{ Name = "CAMPUSCONNECT_STOP_WORKLOADS_HOOK"; Label = "stop application instances and workers" },
  @{ Name = "CAMPUSCONNECT_DRAIN_HOOK"; Label = "drain active requests" },
  @{ Name = "CAMPUSCONNECT_START_WORKLOADS_HOOK"; Label = "start application instances and workers" },
  @{ Name = "CAMPUSCONNECT_RESTORE_TRAFFIC_HOOK"; Label = "restore incoming traffic" }
)

foreach ($hook in $hooks) {
  $path = [Environment]::GetEnvironmentVariable($hook.Name)
  if ([string]::IsNullOrWhiteSpace($path) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing provider hook $($hook.Name). Deployment stopped before migration."
  }
}
if ([string]::IsNullOrWhiteSpace($env:CAMPUSCONNECT_HEALTHCHECK_URL)) {
  throw "CAMPUSCONNECT_HEALTHCHECK_URL is required. Deployment stopped before migration."
}

$nodeOutput = & node --version
if ($LASTEXITCODE -ne 0 -or $nodeOutput -notmatch '^v(\d+\.\d+\.\d+)$') {
  throw "Could not determine the normal Node.js version."
}
if ([version]$Matches[1] -lt [version]"22.18.0") {
  throw "Node.js 22.18.0 or newer is required for deployment."
}

function Invoke-Hook([string]$EnvironmentName, [string]$Label) {
  $path = [Environment]::GetEnvironmentVariable($EnvironmentName)
  Write-Output "Running deployment hook: $Label"
  & $path
  if (-not $?) { throw "Deployment hook failed: $Label. Traffic will remain blocked." }
  if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) {
    throw "Deployment hook exited with code $($LASTEXITCODE): $Label. Traffic will remain blocked."
  }
}

function Invoke-Guard([string]$Mode) {
  & node scripts/deploy-db-guard.mjs $Mode
  if ($LASTEXITCODE -ne 0) { throw "Database deployment guard failed in mode '$Mode'. Traffic will remain blocked." }
}

# Preflight uses the migration URL but does not change the database.
Invoke-Guard "preflight"
Invoke-Hook "CAMPUSCONNECT_MAINTENANCE_HOOK" "enter maintenance mode / stop incoming traffic"
Invoke-Hook "CAMPUSCONNECT_STOP_WORKLOADS_HOOK" "stop application instances and workers"
Invoke-Hook "CAMPUSCONNECT_DRAIN_HOOK" "drain active requests"

# This disables new runtime-role logins and terminates existing app sessions.
# The guard excludes its own privileged migration connection by PID.
Invoke-Guard "fence"

# Uses DATABASE_URL from the migration secret; never print the URL.
& npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "Prisma migration failed. Application logins and incoming traffic remain blocked." }
& npx prisma migrate status
if ($LASTEXITCODE -ne 0) { throw "Prisma migration status is unhealthy. Application logins and incoming traffic remain blocked." }
Invoke-Guard "verify"

Invoke-Guard "enable"
Invoke-Hook "CAMPUSCONNECT_START_WORKLOADS_HOOK" "start application instances and workers"

$healthy = $false
for ($attempt = 1; $attempt -le 12; $attempt++) {
  try {
    $response = Invoke-RestMethod -Uri $env:CAMPUSCONNECT_HEALTHCHECK_URL -TimeoutSec 5
    if ($response.status -eq "ok") { $healthy = $true; break }
  } catch {
    # Keep traffic blocked and retry the health check.
  }
  Start-Sleep -Seconds 5
}
if (-not $healthy) { throw "Application health check failed. Incoming traffic remains blocked." }

Invoke-Hook "CAMPUSCONNECT_RESTORE_TRAFFIC_HOOK" "restore incoming traffic"
Write-Output "Safe deployment completed; health check passed and traffic was restored."

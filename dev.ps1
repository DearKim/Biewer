#Requires -Version 5.1
<#
.SYNOPSIS
  Biewer monorepo dev launcher (Windows / PowerShell).

  Biewer has no backend — it is a front-end viewer package. This launcher:
    - always runs `pnpm install` (workspace) so deps stay in sync,
    - builds @deepnoid/biewer, then runs a chosen example's Vite dev server,
    - keeps a `tsup --watch` running so package edits hot-reload the example
      WITHOUT restarting the dev server,
    - or (`-Docker`) builds + serves the examples as static nginx containers
      for a production-like local test.

  The dev server stays up across edits (Vite HMR + tsup watch). Only a stale
  server on the SAME port is cleared; a healthy running server is left alone.

.EXAMPLE
  ./dev.ps1                     # docs example: install → build → watch + vite dev (HMR)
  ./dev.ps1 -Example react      # React adapter example
  ./dev.ps1 -Build              # install + build the package only, then exit
  ./dev.ps1 -Docker             # build + serve both examples via nginx (detached)
  ./dev.ps1 -Down               # stop the docker example containers
  ./dev.ps1 -NoInstall          # skip pnpm install (fast restart)
  ./dev.ps1 -NoWatch            # dev server without package watch rebuild
#>
[CmdletBinding()]
param(
  [ValidateSet('docs', 'react')][string]$Example = 'docs',
  [switch]$Docker,
  [switch]$Down,
  [switch]$Build,
  [switch]$NoInstall,
  [switch]$NoWatch
)

$ErrorActionPreference = 'Stop'

$root          = $PSScriptRoot
$compose       = Join-Path $root 'docker-compose.yml'
$pkgFilter     = '@deepnoid/biewer'
$exampleFilter = "@biewer/example-$Example"
$devPorts      = @{ docs = 5190; react = 5191 }
$devPort       = $devPorts[$Example]

function Say([string]$m, [string]$c = 'Cyan') { Write-Host $m -ForegroundColor $c }

function Ensure-Install {
  if ($NoInstall) { Say '==> skip pnpm install (-NoInstall)' 'DarkGray'; return }
  Say '==> pnpm install (workspace)...'
  & pnpm install
  if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed.' }
}

function Build-Package {
  Say '==> building @deepnoid/biewer (tsup)...'
  & pnpm --filter $pkgFilter build
  if ($LASTEXITCODE -ne 0) { throw 'package build failed.' }
}

function Stop-StalePort([int]$port) {
  $owners = @(Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq 'Listen' -and $_.OwningProcess -gt 0 } |
    Select-Object -ExpandProperty OwningProcess -Unique)
  foreach ($ownerPid in $owners) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction SilentlyContinue
    if (-not $proc) { continue }
    if ([string]$proc.CommandLine -notmatch 'vite') { continue }
    Say "    clearing stale vite dev server (pid $ownerPid) on port $port..." 'Yellow'
    Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
  }
}

# --- docker: production-like static serving of examples ---------------------
if ($Down) {
  Say '==> stopping example containers (docker compose down)...'
  & docker compose -f $compose down
  return
}

Ensure-Install

if ($Docker) {
  Say '==> docker: building + serving examples via nginx (detached)...'
  & docker compose -f $compose up -d --build
  if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed.' }
  Say ''
  Say '    example-docs   http://localhost:8080' 'Green'
  Say '    example-react  http://localhost:8081' 'Green'
  Say '    containers keep running across edits; ./dev.ps1 -Down to stop.' 'DarkGray'
  return
}

# --- native dev: build once, then watch + vite dev --------------------------
Build-Package
if ($Build) { Say 'done (package built, -Build).' 'Green'; return }

$watch = $null
try {
  if (-not $NoWatch) {
    Say '==> starting tsup --watch (package edits rebuild dist → Vite HMR)...'
    # pnpm on Windows is a .cmd shim, not a Win32 exe — Start-Process must go
    # through cmd.exe, otherwise "%1 is not a valid Win32 application".
    $watch = Start-Process -FilePath 'cmd.exe' `
      -ArgumentList @('/c', "pnpm --filter $pkgFilter build --watch") `
      -PassThru -NoNewWindow
  }

  Stop-StalePort $devPort
  Say ''
  Say "==> vite dev: $exampleFilter" 'Green'
  Say "    http://localhost:$devPort" 'Green'
  Say '    edits hot-reload; the dev server stays up. Ctrl+C to stop.' 'DarkGray'
  Say ''
  & pnpm --filter $exampleFilter dev
} finally {
  if ($watch -and -not $watch.HasExited) {
    Say '==> stopping tsup watch...' 'Yellow'
    # kill the whole process tree (pnpm → node/tsup children)
    & taskkill /PID $watch.Id /T /F 2>$null | Out-Null
  }
}

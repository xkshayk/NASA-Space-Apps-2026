param([switch]$Check, [switch]$Build)
$ErrorActionPreference = 'Stop'
if ($Check -and $Build) { throw 'Choose -Check or -Build, not both.' }
. (Join-Path $PSScriptRoot 'node-path.ps1')
$projectNode = Get-ProjectNode
$entry = 'scripts/dev.mjs'
if ($Check) { $entry = 'scripts/check.mjs' }
if ($Build) { $entry = 'scripts/build.mjs' }
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  & $projectNode $entry
  if ($LASTEXITCODE -ne 0) { throw "Command failed: $entry" }
} finally { Pop-Location }

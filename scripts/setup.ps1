param([string]$Python)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'node-path.ps1')
$projectNode = Get-ProjectNode
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  $bundledPnpm = Join-Path (Split-Path (Split-Path $projectNode -Parent) -Parent) 'node_modules\pnpm\bin\pnpm.cjs'
  if (Test-Path -LiteralPath $bundledPnpm) { & $projectNode $bundledPnpm install --frozen-lockfile }
  elseif (Get-Command pnpm.cmd -ErrorAction SilentlyContinue) { & pnpm.cmd install --frozen-lockfile }
  elseif (Get-Command npm.cmd -ErrorAction SilentlyContinue) { & npm.cmd exec --yes --package=pnpm@11.19.0 -- pnpm install --frozen-lockfile }
  else { throw 'Install Node 24 LTS with npm, reopen VS Code, and run setup again.' }
  if ($LASTEXITCODE -ne 0) { throw 'JavaScript dependency installation failed.' }
  if (-not $Python) {
    $bundledPython=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    if (Test-Path -LiteralPath $bundledPython) { $Python=$bundledPython } else { $Python='python' }
  }
  & $Python -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)'
  if ($LASTEXITCODE -ne 0) { throw 'Python 3.11+ is required. Pass -Python with the interpreter path.' }
  if (-not (Test-Path -LiteralPath '.venv')) { & $Python -m venv .venv; if ($LASTEXITCODE -ne 0) { throw 'venv failed.' } }
  & .\.venv\Scripts\python.exe -m pip install -r science/requirements.lock
  if ($LASTEXITCODE -ne 0) { throw 'Python dependencies failed.' }
  foreach ($script in @('science/download_data.py','science/import_regions.py','science/prepare_assets.py')) {
    & .\.venv\Scripts\python.exe $script
    if ($LASTEXITCODE -ne 0) { throw "Setup failed: $script" }
  }
  & $projectNode scripts/check.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Checks failed.' }
  & $projectNode scripts/build.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
  Write-Host 'Ready. Run scripts/dev.ps1 and visit http://127.0.0.1:5173'
} finally { Pop-Location }

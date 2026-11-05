param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  & $Python -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)'
  if ($LASTEXITCODE -ne 0) { throw 'A working Python 3.11+ interpreter is required; the Windows Store alias is not sufficient.' }
  if (-not (Test-Path -LiteralPath '.venv')) {
    & $Python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Virtual environment creation failed.' }
  }
  & .\.venv\Scripts\python.exe -m pip install -r science/requirements.lock
  if ($LASTEXITCODE -ne 0) { throw 'Science dependency installation failed.' }
  Write-Host 'Locked science dependencies installed. For complete data/assets setup, run scripts/setup.ps1.'
} finally { Pop-Location }

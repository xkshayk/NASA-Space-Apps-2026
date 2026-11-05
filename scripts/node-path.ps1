function Get-ProjectNode {
  $command = Get-Command node -ErrorAction SilentlyContinue
  $candidates = @()
  if ($command) { $candidates += $command.Source }
  $candidates += (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      $version = & $candidate --version
      if ($LASTEXITCODE -eq 0 -and $version -match '^v(\d+)\.(\d+)\.' -and ([int]$Matches[1] -gt 22 -or ([int]$Matches[1] -eq 22 -and [int]$Matches[2] -ge 12))) {
        return $candidate
      }
    }
  }
  throw 'Node.js 22.12+ is required. Install Node 24 from https://nodejs.org/en/download and reopen VS Code.'
}

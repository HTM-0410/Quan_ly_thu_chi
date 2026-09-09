$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../../..')).Path
$webPath = Join-Path $taskRoot 'Quan_ly_thu_chi/web'
$files = @(Get-ChildItem (Join-Path $webPath 'dist') -Recurse -File | Where-Object Extension -in '.js','.map')
if ($files.Count -eq 0) { throw 'Build artifacts missing.' }
$secretLine = Get-Content (Join-Path $webPath '.env.local') | Where-Object { $_ -match '^VITE_GEMINI_API_KEY=' } | Select-Object -First 1
$secret = if ($secretLine) { ($secretLine -split '=',2)[1].Trim().Trim('"').Trim("'") } else { '' }
$exactHits = 0
$patternHits = 0
foreach ($file in $files) {
  $content = [System.IO.File]::ReadAllText($file.FullName)
  if ($secret -and $content.Contains($secret)) { $exactHits++ }
  if ($content -match 'VITE_GEMINI_API_KEY|generativelanguage\.googleapis\.com|AIza[0-9A-Za-z_-]{30,}') { $patternHits++ }
}
[pscustomobject]@{ Files=$files.Count; ExactSecretCheckAvailable=[bool]$secret; ExactSecretFiles=$exactHits; ForbiddenPatternFiles=$patternHits } | ConvertTo-Json
if ($exactHits -gt 0 -or $patternHits -gt 0) { exit 1 }

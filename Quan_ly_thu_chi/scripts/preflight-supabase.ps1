param(
  [string]$ExpectedProjectRef = 'qphevhmaczuazsvhbwfb'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Get-RefFromUrl([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  try {
    $uri = [Uri]$Value.Trim().Trim('"').Trim("'")
    if ($uri.Host -match '^([a-z0-9]{20})\.supabase\.co$') { return $Matches[1] }
  } catch { return $null }
  return $null
}

function Read-Ref([string]$Path, [string]$Key) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $line = Get-Content -LiteralPath $Path |
    Where-Object { $_ -match ('^\s*' + [regex]::Escape($Key) + '\s*=') } |
    Select-Object -First 1
  if (-not $line) { return $null }
  $value = (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
  if ($Key -eq 'project_id') { return $value }
  return Get-RefFromUrl $value
}

if ($ExpectedProjectRef -notmatch '^[a-z0-9]{20}$') {
  throw 'ExpectedProjectRef must be a 20-character lowercase Supabase project ref.'
}

$sources = [ordered]@{
  'canonical config' = Read-Ref "$repoRoot\supabase\config.toml" 'project_id'
  'project env' = Read-Ref "$repoRoot\.env" 'SUPABASE_URL'
  'web env' = Read-Ref "$repoRoot\web\.env.local" 'VITE_SUPABASE_URL'
  'supabase cli state' = if (Test-Path -LiteralPath "$repoRoot\supabase\.temp\project-ref") { (Get-Content -Raw "$repoRoot\supabase\.temp\project-ref").Trim() } else { $null }
}

$mismatch = $false
foreach ($entry in $sources.GetEnumerator()) {
  $ref = [string]$entry.Value
  if ([string]::IsNullOrWhiteSpace($ref)) {
    Write-Output "$($entry.Key): MISSING"
    $mismatch = $true
    continue
  }
  Write-Output "$($entry.Key): $ref"
  if ($ref -ne $ExpectedProjectRef) { $mismatch = $true }
}

if ($mismatch) {
  throw 'Supabase project identity mismatch; refusing any migration, copy, or network operation.'
}
Write-Output "PREFLIGHT PASS: canonical project ref=$ExpectedProjectRef; migration root=$repoRoot\supabase\migrations"

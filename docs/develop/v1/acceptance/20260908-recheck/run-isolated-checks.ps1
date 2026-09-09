param([int]$Port = 55439)
$ErrorActionPreference = 'Stop'
if ($Port -ne 55439) { throw 'This fixture runner is restricted to the disposable acceptance cluster port 55439.' }
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../../..')).Path
$dbName = 'acceptance_' + (Get-Date -Format 'yyyyMMddHHmmss')
$logPath = Join-Path $PSScriptRoot "$dbName-results.txt"
function Run-Sql([string]$Sql, [string]$Name) {
  $output = $Sql | & psql -X -h 127.0.0.1 -p $Port -U postgres -d $dbName -v ON_ERROR_STOP=1 -f - 2>&1
  $exitCode = $LASTEXITCODE
  Add-Content -LiteralPath $logPath -Value "CHECK $Name exit=$exitCode"
  $output | Add-Content -LiteralPath $logPath
  if ($exitCode -ne 0) { throw "Failed $Name; see $logPath" }
  Write-Output "PASS $Name"
}
& createdb -h 127.0.0.1 -p $Port -U postgres $dbName
if ($LASTEXITCODE -ne 0) { throw 'Cannot create disposable fixture DB.' }
$bootstrap = Get-Content (Join-Path $PSScriptRoot 'postgres-bootstrap.sql') |
  Where-Object { $_ -notmatch '^CREATE ROLE ' }
Run-Sql ($bootstrap -join "`n") 'minimal-auth-bootstrap'
foreach ($migration in Get-ChildItem (Join-Path $taskRoot 'Quan_ly_thu_chi/supabase/migrations/*.sql') | Sort-Object Name) {
  Run-Sql ("BEGIN;`n" + (Get-Content $migration.FullName -Raw) + "`nCOMMIT;") $migration.Name
}
Run-Sql (Get-Content (Join-Path $PSScriptRoot 'accounting-fixture.sql') -Raw) 'accounting-fixture'
Run-Sql (Get-Content (Join-Path $PSScriptRoot 'recurring-fixture.sql') -Raw) 'recurring-fixture'
Run-Sql (Get-Content (Join-Path $PSScriptRoot 'financial-fixture.sql') -Raw) 'financial-fixture'
Run-Sql (Get-Content (Join-Path $PSScriptRoot '../../reports/20260908-ocr-atomic-fixture.sql') -Raw) 'ocr-atomic-fixture'
Write-Output "ISOLATED CHECKS PASS; database=$dbName; evidence=$logPath"

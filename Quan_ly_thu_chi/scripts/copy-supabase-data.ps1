param(
  [string]$TargetPassword,
  [string]$TargetServiceKey,
  [string]$TargetUserPassword,
  [string]$TargetProjectRef = 'qphevhmaczuazsvhbwfb',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Require-Secret([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required; refusing to run before any network or write operation."
  }
}

if ($TargetProjectRef -notmatch '^[a-z0-9]{20}$') {
  throw 'TargetProjectRef must be a 20-character lowercase Supabase project ref.'
}
$configLine = Get-Content -LiteralPath "$repoRoot\supabase\config.toml" |
  Where-Object { $_ -match '^\s*project_id\s*=' } | Select-Object -First 1
$canonicalRef = if ($configLine) { (($configLine -split '=', 2)[1]).Trim().Trim('"').Trim("'") } else { '' }
if ($canonicalRef -ne $TargetProjectRef) {
  throw "TargetProjectRef does not match canonical supabase/config.toml project identity ($canonicalRef)."
}

if ($DryRun) {
  Write-Output "DRY-RUN OK: canonical migrations=$repoRoot\supabase\migrations; target project ref=$TargetProjectRef"
  Write-Output 'DRY-RUN: no source request, target request, database write, or auth mutation performed.'
  exit 0
}

Require-Secret 'TargetPassword' $TargetPassword
Require-Secret 'TargetServiceKey' $TargetServiceKey
Require-Secret 'TargetUserPassword' $TargetUserPassword

# Refuse to read/use source credentials until every configured project identity
# agrees with the canonical target. The preflight prints refs only, never keys.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\preflight-supabase.ps1" -ExpectedProjectRef $TargetProjectRef
if ($LASTEXITCODE -ne 0) { throw 'Supabase identity preflight failed; no copy operation was started.' }

function Read-DotEnvValue([string]$Path, [string]$Key) {
  $line = Get-Content -LiteralPath $Path |
    Where-Object { $_ -match ('^\s*' + [regex]::Escape($Key) + '\s*=') } |
    Select-Object -First 1
  if (-not $line) { throw "Missing $Key in $Path" }
  ($line -replace ('^\s*' + [regex]::Escape($Key) + '\s*=\s*'), '').Trim().Trim('"').Trim("'")
}

function Q([string]$Name) { '"' + $Name.Replace('"', '""') + '"' }

$sourceUrl = Read-DotEnvValue "$repoRoot\.env" 'SUPABASE_URL'
$sourceServiceKey = Read-DotEnvValue "$repoRoot\.env" 'SUPABASE_SERVICE_ROLE_KEY'
$targetDbUrl = "postgresql://postgres@db.$TargetProjectRef.supabase.co:5432/postgres"
$targetRestUrl = "https://$TargetProjectRef.supabase.co"
$targetAdminHeaders = @{
  apikey = $TargetServiceKey
  Authorization = "Bearer $TargetServiceKey"
  'Content-Type' = 'application/json'
}
$script:userIdMap = @{}

$http = [System.Net.Http.HttpClient]::new()
$http.DefaultRequestHeaders.Add('apikey', $sourceServiceKey)
$http.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $sourceServiceKey)

function Get-SourceJson([string]$Path) {
  $response = $http.GetAsync("$sourceUrl$Path").GetAwaiter().GetResult()
  $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if (-not $response.IsSuccessStatusCode) {
    throw "Source request failed ($([int]$response.StatusCode)) ${Path}"
  }
  if ([string]::IsNullOrWhiteSpace($body)) { return $null }
  $body | ConvertFrom-Json -Depth 100
}

function Invoke-TargetPsql([string]$Sql, [switch]$TuplesOnly) {
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = 'psql'
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardInputEncoding = [System.Text.UTF8Encoding]::new($false)
  $psi.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $psi.StandardErrorEncoding = [System.Text.UTF8Encoding]::new($false)
  $psi.ArgumentList.Add('--dbname')
  $psi.ArgumentList.Add($targetDbUrl)
  $psi.ArgumentList.Add('--no-psqlrc')
  $psi.ArgumentList.Add('--set')
  $psi.ArgumentList.Add('ON_ERROR_STOP=1')
  if ($TuplesOnly) {
    $psi.ArgumentList.Add('--tuples-only')
    $psi.ArgumentList.Add('--no-align')
  }
  $psi.Environment['PGPASSWORD'] = $TargetPassword
  $psi.Environment['PGCLIENTENCODING'] = 'UTF8'
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $psi
  [void]$process.Start()
  $process.StandardInput.Write($Sql)
  $process.StandardInput.Close()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) { throw "Target psql failed ($($process.ExitCode))." }
  $stdout
}

function TargetColumns([string]$Schema, [string]$Table) {
  $s = $Schema.Replace("'", "''")
  $t = $Table.Replace("'", "''")
  $out = Invoke-TargetPsql "SELECT column_name FROM information_schema.columns WHERE table_schema='$s' AND table_name='$t' AND is_generated = 'NEVER' ORDER BY ordinal_position;" -TuplesOnly
  @($out -split "`r?`n" | Where-Object { $_ -ne '' })
}

function Import-Rows([string]$Schema, [string]$Table, [object[]]$Rows) {
  $rows = @($Rows)
  if ($rows.Count -eq 0) { Write-Output "SKIP $Schema.$Table (0 rows)"; return }
  $targetColumns = @(TargetColumns $Schema $Table)
  $sourceColumns = @($rows | ForEach-Object { $_.PSObject.Properties.Name } | Sort-Object -Unique)
  $columns = @($targetColumns | Where-Object { $sourceColumns -contains $_ })
  if ($columns.Count -eq 0) { throw "No shared columns for $Schema.$Table" }
  $json = ConvertTo-Json -InputObject $rows -Depth 100 -Compress
  $tableName = "$(Q $Schema).$(Q $Table)"
  $tableType = $tableName
  $insertColumns = [string]::Join(', ', ($columns | ForEach-Object { Q $_ }))
  $selectColumns = [string]::Join(', ', ($columns | ForEach-Object { "r.$(Q $_)" }))
  $updates = @($columns | Where-Object { $_ -ne 'id' } | ForEach-Object { $q = Q $_; "$q = EXCLUDED.$q" })
  if ($updates.Count -gt 0 -and $columns -contains 'id') {
    $conflict = 'ON CONFLICT ("id") DO UPDATE SET ' + [string]::Join(', ', $updates)
  } else {
    $conflict = 'ON CONFLICT DO NOTHING'
  }
  $sql = @"
BEGIN;
CREATE TEMP TABLE _import_payload(payload jsonb) ON COMMIT DROP;
\copy _import_payload(payload) FROM STDIN
$json
\.
INSERT INTO $tableName ($insertColumns)
SELECT $selectColumns
FROM jsonb_populate_recordset(NULL::$tableType, (SELECT payload FROM _import_payload)) AS r
$conflict;
COMMIT;
"@
  Invoke-TargetPsql $sql | Out-Null
  Write-Output "IMPORTED $Schema.$Table ($($rows.Count) rows)"
}

function Create-TargetAuthUsers([object[]]$Rows) {
  $rows = @($Rows)
  if ($rows.Count -eq 0) { throw 'Source has no auth users; refusing to copy public rows.' }
  foreach ($user in $rows) {
    $payload = @{
      email = [string]$user.email
      password = $TargetUserPassword
      email_confirm = $true
    }
    if ($user.PSObject.Properties.Name -contains 'phone' -and $user.phone) {
      $payload.phone = [string]$user.phone
      $payload.phone_confirm = $true
    }
    if ($user.PSObject.Properties.Name -contains 'user_metadata') { $payload.user_metadata = $user.user_metadata }
    if ($user.PSObject.Properties.Name -contains 'app_metadata') { $payload.app_metadata = $user.app_metadata }
    $body = ConvertTo-Json -InputObject $payload -Depth 100 -Compress
    try {
      $created = Invoke-RestMethod -Uri "$targetRestUrl/auth/v1/admin/users" -Headers $targetAdminHeaders -Method Post -Body $body
    } catch {
      throw "Target Auth user creation failed for source user $($user.id)."
    }
    if (-not $created.id) { throw "Target Auth did not return an id for source user $($user.id)" }
    $script:userIdMap[[string]$user.id] = [string]$created.id
  }
  Write-Output "IMPORTED auth.users ($($rows.Count) rows via Admin API; source user IDs remapped)"
}

$authEnvelope = Get-SourceJson '/auth/v1/admin/users?per_page=1000&page=1'
$authRows = @($authEnvelope.users)
# GoTrue exposes an empty string for an unset phone. The target enforces a
# unique phone index, so normalize empty values to SQL NULL before importing.
foreach ($user in $authRows) {
  if ($user.PSObject.Properties.Name -contains 'phone' -and [string]::IsNullOrWhiteSpace([string]$user.phone)) {
    $user.phone = $null
  }
}
$tableOrder = @('profiles','global_categories','categories','financial_accounts','people','saving_goals','transactions','transaction_entries','transaction_splits','budgets','budget_categories','goal_contributions','recurring_rules','bank_connections','bank_accounts','bank_events','debts','debt_payments','debt_audit_log','bills','bill_items','audit_logs')
$sourceRows = @{}
foreach ($table in $tableOrder) { $sourceRows[$table] = @(Get-SourceJson "/rest/v1/$table`?select=*`&limit=1000000") }

Write-Output "SOURCE auth.users = $($authRows.Count)"
foreach ($table in $tableOrder) { Write-Output "SOURCE $table = $($sourceRows[$table].Count)" }

Invoke-TargetPsql @"
BEGIN;
TRUNCATE TABLE public.global_categories, public.profiles, public.financial_accounts,
  public.categories, public.transactions, public.transaction_entries,
  public.transaction_splits, public.budgets, public.budget_categories,
  public.saving_goals, public.goal_contributions, public.recurring_rules,
  public.bank_connections, public.bank_accounts, public.bank_events,
  public.people, public.debts, public.debt_payments, public.debt_audit_log,
  public.bills, public.bill_items, public.audit_logs CASCADE;
DELETE FROM auth.users;
COMMIT;
"@ | Out-Null

Create-TargetAuthUsers $authRows

# Supabase-managed auth triggers may seed default categories for each new
# user. Remove only category IDs absent from the source snapshot.
$sourceCategoryIds = @($sourceRows['categories'] | ForEach-Object { [string]$_.id } | Where-Object { $_ -match '^[0-9a-fA-F-]{36}$' })
if ($sourceCategoryIds.Count -gt 0) {
  $quotedCategoryIds = [string]::Join(', ', ($sourceCategoryIds | ForEach-Object { "'$_'::uuid" }))
  Invoke-TargetPsql "DELETE FROM public.categories WHERE id NOT IN ($quotedCategoryIds);" | Out-Null
} else {
  Invoke-TargetPsql 'DELETE FROM public.categories;' | Out-Null
}

# Remap every owner/profile reference to the IDs created by target Auth.
foreach ($table in $tableOrder) {
  foreach ($row in @($sourceRows[$table])) {
    if ($table -eq 'profiles' -and $row.PSObject.Properties.Name -contains 'id' -and $script:userIdMap.ContainsKey([string]$row.id)) {
      $row.id = $script:userIdMap[[string]$row.id]
    }
    if ($row.PSObject.Properties.Name -contains 'user_id' -and $script:userIdMap.ContainsKey([string]$row.user_id)) {
      $row.user_id = $script:userIdMap[[string]$row.user_id]
    }
  }
}
Invoke-TargetPsql "ALTER TABLE public.categories DISABLE TRIGGER USER; ALTER TABLE public.debt_payments DISABLE TRIGGER USER;" | Out-Null
try {
  foreach ($table in $tableOrder) { Import-Rows 'public' $table $sourceRows[$table] }
} finally {
  Invoke-TargetPsql "ALTER TABLE public.categories ENABLE TRIGGER USER; ALTER TABLE public.debt_payments ENABLE TRIGGER USER;" | Out-Null
}

Write-Output '--- TARGET VERIFICATION ---'
Invoke-TargetPsql @"
SELECT 'auth.users', count(*) FROM auth.users
UNION ALL SELECT 'public.profiles', count(*) FROM public.profiles
UNION ALL SELECT 'public.financial_accounts', count(*) FROM public.financial_accounts
UNION ALL SELECT 'public.categories', count(*) FROM public.categories
UNION ALL SELECT 'public.global_categories', count(*) FROM public.global_categories
UNION ALL SELECT 'public.transactions', count(*) FROM public.transactions
UNION ALL SELECT 'public.transaction_entries', count(*) FROM public.transaction_entries
UNION ALL SELECT 'public.budgets', count(*) FROM public.budgets
UNION ALL SELECT 'public.saving_goals', count(*) FROM public.saving_goals
UNION ALL SELECT 'public.recurring_rules', count(*) FROM public.recurring_rules
UNION ALL SELECT 'public.people', count(*) FROM public.people
UNION ALL SELECT 'public.debts', count(*) FROM public.debts
UNION ALL SELECT 'public.debt_payments', count(*) FROM public.debt_payments
UNION ALL SELECT 'public.debt_audit_log', count(*) FROM public.debt_audit_log
UNION ALL SELECT 'public.bills', count(*) FROM public.bills
UNION ALL SELECT 'public.bill_items', count(*) FROM public.bill_items
ORDER BY 1;
SELECT 'orphan_profiles', count(*) FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
SELECT 'orphan_transactions', count(*) FROM public.transactions t WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id);
SELECT 'orphan_debts', count(*) FROM public.debts d WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = d.user_id);
"@ -TuplesOnly

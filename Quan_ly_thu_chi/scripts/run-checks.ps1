# Run Personal Finance Web App exit-criteria checks.
# Usage: .\run-checks.ps1

Write-Host "=== Personal Finance Web App - Exit Criteria Checks ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Supabase CLI + DB schema reset..." -ForegroundColor Yellow
if (Get-Command supabase -ErrorAction SilentlyContinue) {
    Write-Host "   Supabase CLI: $(supabase --version)" -ForegroundColor Green
    supabase db reset 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   DB Reset: PASS" -ForegroundColor Green
    } else {
        Write-Host "   DB Reset: FAIL" -ForegroundColor Red
    }
} else {
    Write-Host "   Supabase CLI not found. Install: npm install -g supabase" -ForegroundColor Red
}

Write-Host ""
Write-Host "2. Web bundle present..." -ForegroundColor Yellow
$webIndex = "apps\mobile\build\web\index.html"
if (Test-Path $webIndex) {
    Write-Host "   Web bundle: PRESENT (apps/mobile/build/web/index.html)" -ForegroundColor Green
} else {
    Write-Host "   Web bundle missing. Run 'flutter build web --release' to (re)build." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "3. Web server reachable on port 8080..." -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "http://localhost:8080/" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Host "   HTTP $($r.StatusCode) on /" -ForegroundColor Green
} catch {
    Write-Host "   No server running. Start: .\scripts\serve-web.ps1" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Check Complete ===" -ForegroundColor Cyan

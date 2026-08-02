# Install development dependencies for Personal Finance Web App.

Write-Host "=== Installing Development Dependencies ===" -ForegroundColor Cyan
Write-Host ""

# 1. Supabase CLI
Write-Host "1. Supabase CLI" -ForegroundColor Yellow
if (Get-Command supabase -ErrorAction SilentlyContinue) {
    Write-Host "   Supabase CLI: $(supabase --version)" -ForegroundColor Green
} else {
    Write-Host "   Supabase CLI not found. Install with:" -ForegroundColor Red
    Write-Host "   npm install -g supabase" -ForegroundColor Yellow
}

# 2. Python (for serving the Flutter Web bundle)
Write-Host ""
Write-Host "2. Python 3 (for serve-web.ps1)" -ForegroundColor Yellow
if (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "   Python: $(python --version)" -ForegroundColor Green
} else {
    Write-Host "   Python not found. Required by scripts/serve-web.ps1." -ForegroundColor Yellow
}

# 3. Flutter SDK (required to build the web bundle; the bundle is committed to build/web)
Write-Host ""
Write-Host "3. Flutter SDK (only needed to rebuild build/web)" -ForegroundColor Yellow
if (Get-Command flutter -ErrorAction SilentlyContinue) {
    Write-Host "   Flutter: $(flutter --version)" -ForegroundColor Green
} else {
    Write-Host "   Flutter not found. Pre-built bundle is at apps/mobile/build/web." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next:" -ForegroundColor Yellow
Write-Host "  1. Serve the web app:    .\scripts\serve-web.ps1" -ForegroundColor White
Write-Host "  2. Open in browser:      http://localhost:8080" -ForegroundColor White

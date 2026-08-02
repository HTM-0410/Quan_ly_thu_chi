# Serve Web (React SPA)
# Launches `npm run dev` against the React app and serves on http://localhost:8080
$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$webDir = Join-Path $root 'web'

if (-not (Test-Path $webDir)) {
    Write-Error "Khong tim thay thu muc web/ tai $webDir. Chay tu thu muc goc cua repo."
}

Set-Location $webDir

if (-not (Test-Path (Join-Path $webDir 'node_modules'))) {
    Write-Host "[serve-web] node_modules chua ton tai, dang chay npm install..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Error "npm install that bai"; exit 1 }
}

Write-Host ""
Write-Host "[serve-web] Dang khoi dong Vite dev server tai http://localhost:8080/" -ForegroundColor Cyan
Write-Host "[serve-web] Nhan Ctrl+C de dung." -ForegroundColor Cyan
Write-Host ""

npm run dev
# Ortak (takım) sunucusunu GitHub'daki main ile günceller. Sadece sunucu bilgisayarında çalıştırın.
# Kullanım:  powershell -ExecutionPolicy Bypass -File scripts\sunucu-guncelle.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)

git fetch origin
git checkout main
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "git pull başarısız. Sunucuda main'e elle değişiklik yapılmış olabilir:" -ForegroundColor Red
    Write-Host "  git status   (gerekirse: git reset --hard origin/main)" -ForegroundColor Yellow
    exit 1
}

docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Write-Host "Derleme başarısız, yukarıdaki hataya bakın." -ForegroundColor Red; exit 1 }

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
       Where-Object { $_.InterfaceAlias -match 'Tailscale' } | Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "Güncellendi: $(git log -1 --format='%h %s')" -ForegroundColor Green
if ($ip) { Write-Host "Takım adresi: http://${ip}:5173   (e-postalar: http://${ip}:5173/mail/)" -ForegroundColor Green }
Write-Host "2-3 dakika sonra kontrol: docker compose exec rag python scripts/smoke_test.py"

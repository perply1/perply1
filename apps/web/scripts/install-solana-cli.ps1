# Install Solana CLI for Windows
# This script downloads and installs Solana CLI tools

Write-Host "=========================================="
Write-Host "Solana CLI Installation"
Write-Host "=========================================="
Write-Host ""

# Check if WSL is available (recommended for Windows)
if (Get-Command wsl -ErrorAction SilentlyContinue) {
    Write-Host "Detected WSL. Installing via WSL (recommended)..." -ForegroundColor Green
    Write-Host ""
    Write-Host "Run in WSL:" -ForegroundColor Cyan
    Write-Host "  sh -c `"`$(curl -sSfL https://release.solana.com/stable/install)`"" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Then add to PATH in PowerShell:" -ForegroundColor Cyan
    Write-Host '  $env:PATH += ";$env:USERPROFILE\.local\share\solana\install\active_release\bin"' -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or restart PowerShell after WSL installation." -ForegroundColor Yellow
} else {
    Write-Host "WSL not detected. Installing via direct download..." -ForegroundColor Yellow
    Write-Host ""
    
    # Download installer
    $installerUrl = "https://github.com/solana-labs/solana/releases/latest/download/solana-install-init-x86_64-pc-windows-msvc.exe"
    $installerPath = Join-Path $env:TEMP "solana-install.exe"
    
    Write-Host "Downloading Solana installer..." -ForegroundColor Cyan
    try {
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
        Write-Host "  ✓ Download complete" -ForegroundColor Green
        Write-Host ""
        Write-Host "Run installer:" -ForegroundColor Cyan
        Write-Host "  Start-Process $installerPath" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "After installation, restart PowerShell and verify:" -ForegroundColor Cyan
        Write-Host "  solana --version" -ForegroundColor Yellow
    } catch {
        Write-Host "ERROR: Failed to download installer" -ForegroundColor Red
        Write-Host $_.Exception.Message
        Write-Host ""
        Write-Host "Manual installation:" -ForegroundColor Yellow
        Write-Host "1. Download: https://github.com/solana-labs/solana/releases" -ForegroundColor Cyan
        Write-Host "2. Install Solana CLI tools"
        Write-Host "3. Add to PATH: C:\Users\$env:USERNAME\.local\share\solana\install\active_release\bin"
    }
}

Write-Host ""
Write-Host "Alternative: Use WSL (Windows Subsystem for Linux)" -ForegroundColor Yellow
Write-Host "  wsl --install" -ForegroundColor Cyan
Write-Host "  Then install Solana CLI in WSL"
Write-Host ""

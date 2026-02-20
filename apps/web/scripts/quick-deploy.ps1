# Quick PropAMM Deployment (after Solana CLI is installed)
# This script assumes Solana CLI is already installed and configured

$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host "Quick PropAMM Deployment"
Write-Host "=========================================="
Write-Host ""

# Check Solana CLI
if (-not (Get-Command solana -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Solana CLI not found!" -ForegroundColor Red
    Write-Host "Run: .\scripts\install-solana-cli.ps1" -ForegroundColor Yellow
    exit 1
}

# Set devnet
solana config set --url devnet

# Check wallet
$walletPubkey = solana address 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: No wallet configured!" -ForegroundColor Red
    Write-Host "Run: solana-keygen new" -ForegroundColor Yellow
    exit 1
}

# Check balance
$balance = solana balance --output json 2>&1 | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or [double]$balance -lt 2) {
    Write-Host "Getting devnet SOL..." -ForegroundColor Yellow
    solana airdrop 2
    Start-Sleep -Seconds 2
}

# Build
Write-Host "Building program..." -ForegroundColor Cyan
$matcherDir = Join-Path $PSScriptRoot "..\src\sdk\vendor\percolator\percolator-match"
Push-Location $matcherDir

cargo build-sbf --release
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Create keypair if needed
$programKeypair = Join-Path $matcherDir "target\deploy\percolator_match-keypair.json"
if (-not (Test-Path $programKeypair)) {
    solana-keygen new --outfile $programKeypair --no-bip39-passphrase --force
}

$programId = solana address -k $programKeypair

# Deploy
Write-Host "Deploying program..." -ForegroundColor Cyan
solana program deploy `
  --program-id $programKeypair `
  target\deploy\percolator_match.so `
  --url devnet

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Deployment successful!" -ForegroundColor Green
    Write-Host "Program ID: $programId" -ForegroundColor Cyan
    
    # Update config
    $configFile = Join-Path $PSScriptRoot "..\src\sdk\config\devnet.ts"
    $config = Get-Content $configFile -Raw
    $config = $config -replace 'matcherProgramId: "[^"]*"', "matcherProgramId: `"$programId`""
    Set-Content -Path $configFile -Value $config -NoNewline
    Write-Host "✓ Config updated" -ForegroundColor Green
} else {
    Write-Host "ERROR: Deployment failed" -ForegroundColor Red
}

Pop-Location

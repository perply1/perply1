# PropAMM Deployment Script
# Deploys the PropAMM-enabled matcher program to devnet

$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host "PropAMM Matcher Deployment"
Write-Host "=========================================="
Write-Host ""

# Check prerequisites
Write-Host "1. Checking prerequisites..."

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Cargo not found. Install Rust: https://rustup.rs/" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Cargo found: $(cargo --version)" -ForegroundColor Green

if (-not (Get-Command solana -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Solana CLI not found. Install: https://docs.solana.com/cli/install-solana-cli-tools" -ForegroundColor Red
    Write-Host ""
    Write-Host "Quick install (PowerShell):" -ForegroundColor Yellow
    Write-Host '  sh -c "$(curl -sSfL https://release.solana.com/stable/install)"' -ForegroundColor Cyan
    Write-Host "  Then restart PowerShell and run this script again."
    exit 1
}
Write-Host "  ✓ Solana CLI found: $(solana --version)" -ForegroundColor Green

# Set devnet
Write-Host ""
Write-Host "2. Configuring Solana CLI for devnet..."
solana config set --url devnet
Write-Host "  ✓ Set to devnet" -ForegroundColor Green

# Check balance
Write-Host ""
Write-Host "3. Checking devnet balance..."
$balance = solana balance --output json 2>&1 | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠️  No wallet configured or insufficient balance" -ForegroundColor Yellow
    Write-Host "  Run: solana-keygen new (or solana-keygen recover)" -ForegroundColor Cyan
    exit 1
}
$balanceNum = [double]$balance
Write-Host "  Balance: $balance SOL" -ForegroundColor Green
if ($balanceNum -lt 2) {
    Write-Host "  ⚠️  Low balance. Need ~2-3 SOL for deployment." -ForegroundColor Yellow
    Write-Host "  Airdrop: solana airdrop 2" -ForegroundColor Cyan
}

# Navigate to matcher directory
$matcherDir = Join-Path $PSScriptRoot "..\src\sdk\vendor\percolator\percolator-match"
if (-not (Test-Path $matcherDir)) {
    Write-Host "ERROR: Matcher directory not found: $matcherDir" -ForegroundColor Red
    exit 1
}
Push-Location $matcherDir

# Build program
Write-Host ""
Write-Host "4. Building matcher program..."
cargo build-sbf --release
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "  ✓ Build successful" -ForegroundColor Green

# Check if program keypair exists
$programKeypair = Join-Path $matcherDir "target\deploy\percolator_match-keypair.json"
if (-not (Test-Path $programKeypair)) {
    Write-Host ""
    Write-Host "5. Creating program keypair..."
    solana-keygen new --outfile $programKeypair --no-bip39-passphrase --force
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create keypair" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Write-Host "  ✓ Program keypair created" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "5. Using existing program keypair..."
    Write-Host "  ✓ Found keypair: $programKeypair" -ForegroundColor Green
}

# Get program ID
$programId = solana address -k $programKeypair
Write-Host ""
Write-Host "6. Program ID: $programId" -ForegroundColor Cyan

# Deploy program
Write-Host ""
Write-Host "7. Deploying program to devnet..."
$soFile = Join-Path $matcherDir "target\deploy\percolator_match.so"
if (-not (Test-Path $soFile)) {
    Write-Host "ERROR: Program .so file not found: $soFile" -ForegroundColor Red
    Pop-Location
    exit 1
}

solana program deploy `
  --program-id $programKeypair `
  $soFile `
  --url devnet `
  --max-signatures 1

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Deployment failed" -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "  ✓ Deployment successful!" -ForegroundColor Green

# Verify deployment
Write-Host ""
Write-Host "8. Verifying deployment..."
$programInfo = solana program show $programId --url devnet 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Program verified on devnet" -ForegroundColor Green
    Write-Host ""
    Write-Host $programInfo
} else {
    Write-Host "  ⚠️  Could not verify program (may need a moment to propagate)" -ForegroundColor Yellow
}

Pop-Location

# Update config
Write-Host ""
Write-Host "9. Updating devnet config..."
$configFile = Join-Path $PSScriptRoot "..\src\sdk\config\devnet.ts"
if (Test-Path $configFile) {
    $configContent = Get-Content $configFile -Raw
    $newConfig = $configContent -replace 'matcherProgramId: "[^"]*"', "matcherProgramId: `"$programId`""
    Set-Content -Path $configFile -Value $newConfig -NoNewline
    Write-Host "  ✓ Updated config: $configFile" -ForegroundColor Green
    Write-Host "  New matcher program ID: $programId" -ForegroundColor Cyan
} else {
    Write-Host "  ⚠️  Config file not found: $configFile" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=========================================="
Write-Host "Deployment Complete!"
Write-Host "=========================================="
Write-Host ""
Write-Host "Program ID: $programId" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Restart your dev server (npm run dev)"
Write-Host "2. Launch a PropAMM market (kind=2)"
Write-Host "3. Verify guardrails work on-chain"
Write-Host ""

# Execute PropAMM Deployment and Collect Proof
# This script deploys PropAMM and collects all proof artifacts

$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host "PropAMM Deployment Proof Execution"
Write-Host "=========================================="
Write-Host ""

# Create proof directory
$proofDir = Join-Path $PSScriptRoot "..\deployment-proof"
if (-not (Test-Path $proofDir)) {
    New-Item -ItemType Directory -Path $proofDir | Out-Null
}

# Step 1: Deploy program
Write-Host "Step 1: Deploying PropAMM program..." -ForegroundColor Cyan
& "$PSScriptRoot\deploy-propamm.ps1"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Deployment failed" -ForegroundColor Red
    exit 1
}

# Get program ID from config
$configFile = Join-Path $PSScriptRoot "..\src\sdk\config\devnet.ts"
$configContent = Get-Content $configFile -Raw
if ($configContent -match 'matcherProgramId: "([^"]+)"') {
    $programId = $matches[1]
    Write-Host "Program ID: $programId" -ForegroundColor Green
    
    # Get program info
    Write-Host ""
    Write-Host "Step 2: Collecting program information..." -ForegroundColor Cyan
    $programInfo = solana program show $programId --url devnet 2>&1
    $programInfo | Out-File -FilePath "$proofDir\program-info.txt" -Encoding utf8
    Write-Host $programInfo
    
    # Get commit hash
    $gitDir = Join-Path $PSScriptRoot "..\..\.."
    Push-Location $gitDir
    $commitHash = git rev-parse HEAD 2>&1
    Pop-Location
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Commit Hash: $commitHash" -ForegroundColor Green
        $commitHash | Out-File -FilePath "$proofDir\commit-hash.txt" -Encoding utf8
    }
    
    # Create proof summary
    $proofSummary = @"
PropAMM Deployment Proof
========================

Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Program ID: $programId
Commit Hash: $commitHash

Program Information:
$programInfo

Next Steps:
1. Launch PropAMM market via UI
2. Execute end-to-end test (Init → Deposit → Crank → Trade)
3. Collect transaction signatures
4. Export receipts
5. Test guardrails
"@
    
    $proofSummary | Out-File -FilePath "$proofDir\deployment-summary.txt" -Encoding utf8
    
    Write-Host ""
    Write-Host "✓ Deployment proof collected in: $proofDir" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next: Launch PropAMM market and collect end-to-end proof" -ForegroundColor Yellow
} else {
    Write-Host "ERROR: Could not extract program ID from config" -ForegroundColor Red
    exit 1
}

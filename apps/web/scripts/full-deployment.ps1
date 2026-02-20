# Full PropAMM Deployment Script - Does Everything Possible
# This script attempts to install, build, deploy, and test PropAMM

$ErrorActionPreference = "Continue"
$script:Errors = @()
$script:Proof = @{}

function Log-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Log-Success { Write-Host "[OK] $args" -ForegroundColor Green }
function Log-Error { Write-Host "[ERROR] $args" -ForegroundColor Red; $script:Errors += $args }
function Log-Warning { Write-Host "[WARN] $args" -ForegroundColor Yellow }

Write-Host "=========================================="
Write-Host "PropAMM Full Deployment and Testing"
Write-Host "=========================================="
Write-Host ""

# Step 1: Check Prerequisites
Log-Info "Step 1: Checking prerequisites..."

$hasCargo = Get-Command cargo -ErrorAction SilentlyContinue
$hasSolana = Get-Command solana -ErrorAction SilentlyContinue
$hasRustc = Get-Command rustc -ErrorAction SilentlyContinue

if ($hasCargo) {
    $cargoVer = cargo --version
    Log-Success "Cargo: $cargoVer"
} else {
    Log-Error "Cargo not found - Rust toolchain required"
}

if ($hasSolana) {
    $solanaVer = solana --version
    Log-Success "Solana CLI: $solanaVer"
} else {
    Log-Warning "Solana CLI not found - will attempt installation"
}

if ($hasRustc) {
    $rustVer = rustc --version
    Log-Success "Rust: $rustVer"
} else {
    Log-Error "Rust compiler not found"
}

# Step 2: Install Solana CLI if missing
if (-not $hasSolana) {
    Log-Info "Step 2: Attempting to install Solana CLI..."
    
    # Try WSL method
    if (Get-Command wsl -ErrorAction SilentlyContinue) {
        Log-Info "WSL detected - installing Solana CLI via WSL..."
        wsl bash -c "sh -c `"`$(curl -sSfL https://release.solana.com/stable/install)`""
        if ($LASTEXITCODE -eq 0) {
            # Add to PATH
            $solanaPath = "$env:USERPROFILE\.local\share\solana\install\active_release\bin"
            if (Test-Path $solanaPath) {
                $env:PATH = "$env:PATH;$solanaPath"
                Log-Success "Solana CLI installed via WSL"
                $hasSolana = $true
            }
        }
    }
    
    # Try direct download
    if (-not $hasSolana) {
        Log-Info "Attempting direct download..."
        $installerUrl = "https://github.com/solana-labs/solana/releases/latest/download/solana-install-init-x86_64-pc-windows-msvc.exe"
        $installerPath = "$env:TEMP\solana-install.exe"
        
        try {
            Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing -ErrorAction Stop
            Log-Info "Downloaded installer to: $installerPath"
            Log-Warning "Run manually: Start-Process $installerPath"
            Log-Warning "After installation, restart PowerShell and run this script again"
            exit 1
        } catch {
            Log-Error "Failed to download Solana CLI installer: $_"
        }
    }
}

# Step 3: Configure Solana
if ($hasSolana) {
    Log-Info "Step 3: Configuring Solana for devnet..."
    solana config set --url devnet 2>&1 | Out-Null
    
    # Check wallet
    $wallet = solana address 2>&1
    if ($LASTEXITCODE -eq 0) {
        Log-Success "Wallet: $wallet"
        
        # Check balance
        $balance = solana balance --output json 2>&1 | ConvertFrom-Json
        if ([double]$balance -lt 2) {
            Log-Info "Getting devnet SOL..."
            solana airdrop 2 2>&1 | Out-Null
            Start-Sleep -Seconds 3
        }
        Log-Success "Balance: $balance SOL"
    } else {
        Log-Warning "No wallet configured - creating new one..."
        solana-keygen new --no-bip39-passphrase --force 2>&1 | Out-Null
        solana airdrop 2 2>&1 | Out-Null
        Start-Sleep -Seconds 3
    }
}

# Step 4: Build Program
if ($hasCargo) {
    Log-Info "Step 4: Building PropAMM program..."
    $matcherDir = Join-Path $PSScriptRoot "..\src\sdk\vendor\percolator\percolator-match"
    Push-Location $matcherDir
    
    # Check if build-sbf is available
    $hasBuildSbf = Get-Command cargo-build-sbf -ErrorAction SilentlyContinue
    if (-not $hasBuildSbf) {
        # Try installing cargo-build-sbf
        Log-Info "Installing cargo-build-sbf..."
        cargo install cargo-build-sbf 2>&1 | Out-Null
    }
    
    if (Get-Command cargo-build-sbf -ErrorAction SilentlyContinue) {
        Log-Info "Building with cargo-build-sbf..."
        cargo build-sbf --release 2>&1 | Tee-Object -Variable buildOutput
        
        if ($LASTEXITCODE -eq 0 -and (Test-Path "target\deploy\percolator_match.so")) {
            Log-Success "Build successful!"
            $script:Proof["BuildStatus"] = "Success"
        } else {
            Log-Error "Build failed"
            $script:Proof["BuildStatus"] = "Failed"
            $script:Proof["BuildOutput"] = $buildOutput
        }
    } else {
        Log-Warning "cargo-build-sbf not available - cannot build Solana program"
        Log-Warning "Install Solana CLI to get cargo-build-sbf"
        $script:Proof["BuildStatus"] = "Skipped - cargo-build-sbf not available"
    }
    
    Pop-Location
} else {
    Log-Error "Cannot build - Cargo not available"
}

# Step 5: Deploy Program
if ($hasSolana -and $script:Proof["BuildStatus"] -eq "Success") {
    Log-Info "Step 5: Deploying program..."
    $matcherDir = Join-Path $PSScriptRoot "..\src\sdk\vendor\percolator\percolator-match"
    Push-Location $matcherDir
    
    # Create keypair if needed
    $keypairPath = "target\deploy\percolator_match-keypair.json"
    if (-not (Test-Path $keypairPath)) {
        solana-keygen new --outfile $keypairPath --no-bip39-passphrase --force 2>&1 | Out-Null
    }
    
    $programId = solana address -k $keypairPath 2>&1
    Log-Info "Program ID: $programId"
    
    # Deploy
    $soFile = "target\deploy\percolator_match.so"
    if (Test-Path $soFile) {
        Log-Info "Deploying to devnet..."
        solana program deploy --program-id $keypairPath $soFile --url devnet 2>&1 | Tee-Object -Variable deployOutput
        
        if ($LASTEXITCODE -eq 0) {
            Log-Success "Deployment successful!"
            $script:Proof["ProgramID"] = $programId
            $script:Proof["DeploymentStatus"] = "Success"
            
            # Get program info
            $programInfo = solana program show $programId --url devnet 2>&1
            $script:Proof["ProgramInfo"] = $programInfo
            Log-Info "Program Info:`n$programInfo"
            
            # Update config
            $configFile = Join-Path $PSScriptRoot "..\src\sdk\config\devnet.ts"
            if (Test-Path $configFile) {
                $config = Get-Content $configFile -Raw
                $config = $config -replace 'matcherProgramId: "[^"]*"', "matcherProgramId: `"$programId`""
                Set-Content -Path $configFile -Value $config -NoNewline
                Log-Success "Config updated with program ID: $programId"
            }
        } else {
            Log-Error "Deployment failed"
            $script:Proof["DeploymentStatus"] = "Failed"
            $script:Proof["DeployOutput"] = $deployOutput
        }
    } else {
        Log-Error "Program .so file not found: $soFile"
    }
    
    Pop-Location
}

# Step 6: Get Commit Hash
Log-Info "Step 6: Recording commit hash..."
$gitDir = Join-Path $PSScriptRoot "..\..\.."
Push-Location $gitDir
$commitHash = git rev-parse HEAD 2>&1
if ($LASTEXITCODE -eq 0) {
    $script:Proof["CommitHash"] = $commitHash
    Log-Success "Commit Hash: $commitHash"
} else {
    $timestamp = Get-Date -Format "yyyyMMddHHmmss"
    $script:Proof["CommitHash"] = "not-git-$timestamp"
    Log-Warning "Not a git repo - using timestamp: $timestamp"
}
Pop-Location

# Step 7: Save Proof
Log-Info "Step 7: Saving proof artifacts..."
$proofDir = Join-Path $PSScriptRoot "..\deployment-proof"
if (-not (Test-Path $proofDir)) {
    New-Item -ItemType Directory -Path $proofDir | Out-Null
}

$proofJson = $script:Proof | ConvertTo-Json -Depth 10
$proofJson | Out-File -FilePath "$proofDir\deployment-proof.json" -Encoding utf8

$proofSummary = @"
PropAMM Deployment Proof
========================
Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

Program ID: $($script:Proof["ProgramID"])
Commit Hash: $($script:Proof["CommitHash"])
Build Status: $($script:Proof["BuildStatus"])
Deployment Status: $($script:Proof["DeploymentStatus"])

Program Info:
$($script:Proof["ProgramInfo"])

Errors:
$($script:Errors -join "`n")
"@

$proofSummary | Out-File -FilePath "$proofDir\deployment-summary.txt" -Encoding utf8

Log-Success "Proof saved to: $proofDir"

# Summary
Write-Host ""
Write-Host "=========================================="
Write-Host "Deployment Summary"
Write-Host "=========================================="
Write-Host ""
Write-Host "Program ID: $($script:Proof["ProgramID"])"
Write-Host "Commit Hash: $($script:Proof["CommitHash"])"
Write-Host "Build Status: $($script:Proof["BuildStatus"])"
Write-Host "Deployment Status: $($script:Proof["DeploymentStatus"])"
Write-Host ""

if ($script:Errors.Count -gt 0) {
    Write-Host "Errors encountered:" -ForegroundColor Yellow
    $script:Errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Start dev server: npm run dev"
Write-Host "2. Launch PropAMM market via UI"
Write-Host "3. Execute end-to-end test"
Write-Host "4. Collect transaction signatures and receipts"
Write-Host ""

# ============================================================
#  IDS Workshop — Bootstrap (Windows PowerShell)
#
#  What this does:
#    1. Enables winget (if not present, prompts to install App Installer)
#    2. Installs Git for Windows (includes Git Bash)
#    3. Installs NVM for Windows
#    4. Installs Node 24 LTS via nvm
#    5. Installs Claude Code CLI  (npm i -g @anthropic-ai/claude-code)
#
#  Run this in PowerShell (as your user, NOT as Administrator):
#    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
#    .\scripts\bootstrap.ps1
#
#  After it completes:
#    • Close and reopen PowerShell (to reload PATH)
#    • Navigate to the workshop repo folder
#    • Run: claude
#    • Type: /setup-workshop
#
#  The /setup-workshop skill handles everything else:
#    Docker Desktop, VS Code, Git Bash config, repo clone, full reset.
# ============================================================

$ErrorActionPreference = 'Stop'

function Write-Step($msg)  { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Skip($msg)  { Write-Host "  [--] $msg - already installed, skipping" -ForegroundColor Yellow }
function Write-Info($msg)  { Write-Host "  ... $msg" -ForegroundColor Gray }

Write-Host "`nIDS Workshop Bootstrap  (Windows)" -ForegroundColor White
Write-Host "----------------------------------------"

# ── 1. Winget ─────────────────────────────────────────────────────────────────
Write-Step "winget"
if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Skip "winget"
} else {
    Write-Host "  winget (App Installer) is not installed." -ForegroundColor Red
    Write-Host "  Please install it from the Microsoft Store: 'App Installer'"
    Write-Host "  Then re-run this script."
    Start-Process "ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1"
    exit 1
}

# ── 2. Git for Windows (includes Git Bash) ────────────────────────────────────
Write-Step "Git for Windows"
if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Skip "Git ($(git --version))"
} else {
    Write-Info "Installing Git for Windows via winget..."
    winget install --id Git.Git --source winget --silent --accept-package-agreements --accept-source-agreements
    # Reload PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH', 'User')
    Write-Ok "Git installed"
}

# ── 3. NVM for Windows ─────────────────────────────────────────────────────────
Write-Step "NVM for Windows"
if (Get-Command nvm -ErrorAction SilentlyContinue) {
    Write-Skip "nvm"
} else {
    Write-Info "Installing NVM for Windows via winget..."
    winget install --id CoreyButler.NVMforWindows --source winget --silent --accept-package-agreements --accept-source-agreements
    # Reload PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH', 'User')
    Write-Ok "NVM for Windows installed"
    Write-Host "  NOTE: Close and reopen this terminal once if nvm is not found below." -ForegroundColor Yellow
}

# ── 4. Node 24 LTS ────────────────────────────────────────────────────────────
Write-Step "Node 24 LTS"
$nodeVersion = (node --version 2>$null)
if ($nodeVersion -and $nodeVersion -match '^v24') {
    Write-Skip "Node $nodeVersion"
} else {
    Write-Info "Installing Node 24 LTS..."
    nvm install 24
    nvm use 24
    # Reload PATH after nvm install
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH', 'User')
    Write-Ok "Node $(node --version) active"
}

# ── 5. Claude Code CLI ─────────────────────────────────────────────────────────
Write-Step "Claude Code CLI"
if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-Skip "Claude Code"
} else {
    Write-Info "Installing @anthropic-ai/claude-code..."
    npm install -g @anthropic-ai/claude-code
    Write-Ok "Claude Code CLI installed"
}

# ── Done ───────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Bootstrap complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Close and reopen PowerShell (to reload PATH)"
Write-Host "  2. Navigate to the workshop repo folder (or clone it first)"
Write-Host "  3. Run: claude"
Write-Host "  4. Type: /setup-workshop"
Write-Host ""
Write-Host "  The /setup-workshop skill will handle:" -ForegroundColor Gray
Write-Host "  Docker Desktop, VS Code, Git Bash config, and the full environment reset." -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to close this window"

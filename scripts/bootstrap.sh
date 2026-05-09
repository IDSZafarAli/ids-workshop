#!/usr/bin/env bash
# ============================================================
#  IDS Workshop — Bootstrap (macOS / WSL / Linux)
#
#  What this does:
#    1. Installs Homebrew (macOS only)
#    2. Installs Git
#    3. Installs NVM + Node 24 LTS
#    4. Installs Claude Code CLI  (npm i -g @anthropic-ai/claude-code)
#
#  After it completes:
#    • Restart your terminal  (or run: source ~/.bashrc / ~/.zshrc)
#    • Run: claude
#    • Type: /setup-workshop
#
#  The /setup-workshop skill handles everything else:
#    Docker Desktop, VS Code, Git Bash config, repo clone, full reset.
# ============================================================
set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${BOLD}${BLUE}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
skip() { echo -e "${YELLOW}  ⊳ $1 — already installed, skipping${NC}"; }

# ── Detect OS ─────────────────────────────────────────────────────────────────
if grep -qi microsoft /proc/version 2>/dev/null; then
  OS="WSL"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  OS="macOS"
else
  OS="Linux"
fi
echo -e "\n${BOLD}IDS Workshop Bootstrap${NC}  (detected: ${OS})"
echo "────────────────────────────────────────"

# ── 1. Homebrew (macOS only) ──────────────────────────────────────────────────
if [[ "$OS" == "macOS" ]]; then
  step "Homebrew"
  if command -v brew &>/dev/null; then
    skip "Homebrew"
  else
    echo "  Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add to PATH for Apple Silicon
    if [[ -f /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
      echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    fi
    ok "Homebrew installed"
  fi
fi

# ── 2. Git ─────────────────────────────────────────────────────────────────────
step "Git"
if command -v git &>/dev/null; then
  skip "Git ($(git --version))"
else
  if [[ "$OS" == "macOS" ]]; then
    brew install git
  else
    sudo apt-get update -qq && sudo apt-get install -y git
  fi
  ok "Git installed"
fi

# ── 3. NVM + Node 24 LTS ──────────────────────────────────────────────────────
step "NVM"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  skip "NVM"
  source "$NVM_DIR/nvm.sh"
else
  echo "  Installing NVM..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  source "$NVM_DIR/nvm.sh"
  ok "NVM installed"
fi

step "Node 24 LTS"
if node --version 2>/dev/null | grep -q "^v24"; then
  skip "Node $(node --version)"
else
  echo "  Installing Node 24 LTS..."
  nvm install 24
  nvm use 24
  nvm alias default 24
  ok "Node $(node --version) set as default"
fi

# ── 4. Claude Code CLI ─────────────────────────────────────────────────────────
step "Claude Code CLI"
if command -v claude &>/dev/null; then
  skip "Claude Code ($(claude --version 2>/dev/null || echo 'installed'))"
else
  echo "  Installing @anthropic-ai/claude-code..."
  npm install -g @anthropic-ai/claude-code
  ok "Claude Code CLI installed"
fi

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Bootstrap complete!${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo "  1. Restart your terminal (or run: source ~/.bashrc  /  source ~/.zshrc)"
echo "  2. Navigate to the workshop repo folder (or clone it first)"
echo "  3. Run: claude"
echo "  4. Type: /setup-workshop"
echo ""
echo -e "  The /setup-workshop skill will handle:"
echo "  Docker Desktop, VS Code, Git Bash config, and the full environment reset."
echo ""

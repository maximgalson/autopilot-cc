#!/usr/bin/env bash
# Autopilot Updater
# Pulls latest from GitHub, preserves config, updates hooks/lib/skills

set -euo pipefail

AUTOPILOT_DIR="$HOME/.claude/autopilot"
REPO_URL="https://github.com/maximgalson/autopilot-cc.git"
TMP_DIR=$(mktemp -d)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

info() { echo -e "${CYAN}[autopilot]${NC} $1"; }
ok() { echo -e "${GREEN}[autopilot]${NC} $1"; }
warn() { echo -e "${YELLOW}[autopilot]${NC} $1"; }
fail() { echo -e "${RED}[autopilot]${NC} $1"; exit 1; }

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

# --- Pre-checks ---

if [ ! -d "$AUTOPILOT_DIR" ]; then
  fail "Autopilot not installed. Run install.sh first."
fi

CURRENT_VER=$(cat "$AUTOPILOT_DIR/VERSION" 2>/dev/null || echo "unknown")

echo ""
echo -e "${BOLD}Autopilot Update${NC}"
echo -e "${DIM}Current version: ${CURRENT_VER}${NC}"
echo ""

# --- Download latest ---

info "Downloading latest version..."
git clone --depth 1 --quiet "$REPO_URL" "$TMP_DIR/autopilot-cc" 2>/dev/null || fail "Failed to download from GitHub"

NEW_VER=$(cat "$TMP_DIR/autopilot-cc/VERSION" 2>/dev/null || echo "unknown")

if [ "$CURRENT_VER" = "$NEW_VER" ]; then
  ok "Already on latest version ($CURRENT_VER)"
  echo ""

  # Still offer to force-update in case files are out of sync
  read -p "Force update anyway? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
  fi
else
  echo -e "  ${DIM}Current:${NC} ${CURRENT_VER}"
  echo -e "  ${DIM}Latest:${NC}  ${GREEN}${NEW_VER}${NC}"
  echo ""
fi

# --- Show changelog (commits between versions) ---

info "Changes:"
cd "$TMP_DIR/autopilot-cc"
git log --oneline -10 2>/dev/null | while read -r line; do
  echo -e "  ${DIM}${line}${NC}"
done
cd - > /dev/null
echo ""

# --- Backup ---

info "Backing up current installation..."
cp "$AUTOPILOT_DIR/config.json" "$AUTOPILOT_DIR/config.json.bak" 2>/dev/null || true
ok "Config backed up to config.json.bak"

# --- Update files ---

SRC="$TMP_DIR/autopilot-cc"

info "Updating hooks..."
cp "$SRC/hooks/ap-dashboard.js" "$AUTOPILOT_DIR/hooks/"
cp "$SRC/hooks/ap-statusline.js" "$AUTOPILOT_DIR/hooks/"
cp "$SRC/hooks/ap-context-monitor.js" "$AUTOPILOT_DIR/hooks/"
cp "$SRC/hooks/ap-autosave.js" "$AUTOPILOT_DIR/hooks/"

info "Updating lib..."
cp "$SRC/lib/backlog.js" "$AUTOPILOT_DIR/lib/"
cp "$SRC/lib/repos.js" "$AUTOPILOT_DIR/lib/"
cp "$SRC/lib/format.js" "$AUTOPILOT_DIR/lib/"
cp "$SRC/lib/memory.js" "$AUTOPILOT_DIR/lib/"

info "Updating skills..."
if [ -d "$SRC/skills" ]; then
  CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
  if [ -d "$CLAUDE_SKILLS_DIR" ]; then
    cp -r "$SRC/skills/"* "$CLAUDE_SKILLS_DIR/" 2>/dev/null || true
  fi
fi

info "Updating docs..."
cp "$SRC/README.md" "$AUTOPILOT_DIR/" 2>/dev/null || true
cp "$SRC/ADHD-METHOD.md" "$AUTOPILOT_DIR/" 2>/dev/null || true

# Copy updater itself so future updates use latest version
cp "$SRC/update.sh" "$AUTOPILOT_DIR/" 2>/dev/null || true
chmod +x "$AUTOPILOT_DIR/update.sh" 2>/dev/null || true

# Update version
echo "$NEW_VER" > "$AUTOPILOT_DIR/VERSION"

# --- Verify ---

ERRORS=0
for f in hooks/ap-dashboard.js hooks/ap-statusline.js hooks/ap-context-monitor.js hooks/ap-autosave.js lib/backlog.js lib/repos.js lib/format.js lib/memory.js config.json VERSION; do
  if [ ! -f "$AUTOPILOT_DIR/$f" ]; then
    warn "Missing: $f"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ $ERRORS -eq 0 ]; then
  echo ""
  echo -e "${GREEN}${BOLD}Updated to v${NEW_VER}!${NC}"
  echo ""
  echo -e "  ${DIM}Config preserved:${NC} ~/.claude/autopilot/config.json"
  echo -e "  ${DIM}Backup:${NC}           ~/.claude/autopilot/config.json.bak"
  echo ""
  echo -e "  ${CYAN}Restart Claude Code to apply changes.${NC}"
  echo ""
else
  fail "Update incomplete ($ERRORS files missing)"
fi

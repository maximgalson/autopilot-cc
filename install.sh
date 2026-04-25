#!/usr/bin/env bash
# Autopilot Installer v1.0.0
# Installs ADHD Terminal Copilot for Claude Code

set -euo pipefail

AUTOPILOT_DIR="$HOME/.claude/autopilot"
SETTINGS_FILE="$HOME/.claude/settings.json"
VERSION="2.0.0-beta2"

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

echo ""
echo -e "${BOLD}Autopilot v${VERSION}${NC} — ADHD Terminal Copilot for Claude Code"
echo -e "${DIM}Your brain doesn't hold context. Autopilot does.${NC}"
echo ""

# --- Pre-checks ---

if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install Node.js 18+ first."
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  fail "Node.js 18+ required (found v$NODE_VER)"
fi

if [ ! -d "$HOME/.claude" ]; then
  fail "~/.claude not found. Install Claude Code first."
fi

# --- Check for existing installation ---

if [ -d "$AUTOPILOT_DIR" ]; then
  EXISTING_VER=$(cat "$AUTOPILOT_DIR/VERSION" 2>/dev/null || echo "unknown")
  warn "Existing installation found (v${EXISTING_VER})"
  read -p "Overwrite? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    info "Aborted."
    exit 0
  fi
  # Backup config
  if [ -f "$AUTOPILOT_DIR/config.json" ]; then
    cp "$AUTOPILOT_DIR/config.json" "$AUTOPILOT_DIR/config.json.bak"
    ok "Config backed up to config.json.bak"
  fi
fi

# --- Determine source ---

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$SCRIPT_DIR/hooks/ap-dashboard.js" ]; then
  SOURCE_DIR="$SCRIPT_DIR"
  info "Installing from local directory: $SOURCE_DIR"
else
  fail "Run this script from the autopilot directory containing hooks/ and lib/"
fi

# --- Create structure ---

mkdir -p "$AUTOPILOT_DIR/hooks"
mkdir -p "$AUTOPILOT_DIR/lib"
mkdir -p "$AUTOPILOT_DIR/backlog"

# --- Copy files ---

info "Copying hooks..."
cp "$SOURCE_DIR/hooks/ap-dashboard.js" "$AUTOPILOT_DIR/hooks/"
cp "$SOURCE_DIR/hooks/ap-statusline.js" "$AUTOPILOT_DIR/hooks/"
cp "$SOURCE_DIR/hooks/ap-context-monitor.js" "$AUTOPILOT_DIR/hooks/"
cp "$SOURCE_DIR/hooks/ap-autosave.js" "$AUTOPILOT_DIR/hooks/"
cp "$SOURCE_DIR/hooks/ap-userprompt.js" "$AUTOPILOT_DIR/hooks/" 2>/dev/null || true

info "Copying lib..."
cp "$SOURCE_DIR/lib/backlog.js" "$AUTOPILOT_DIR/lib/"
cp "$SOURCE_DIR/lib/repos.js" "$AUTOPILOT_DIR/lib/"
cp "$SOURCE_DIR/lib/format.js" "$AUTOPILOT_DIR/lib/"
cp "$SOURCE_DIR/lib/memory.js" "$AUTOPILOT_DIR/lib/"
cp "$SOURCE_DIR/lib/lightrag.js" "$AUTOPILOT_DIR/lib/" 2>/dev/null || true
cp "$SOURCE_DIR/lib/wiki.js" "$AUTOPILOT_DIR/lib/" 2>/dev/null || true
cp "$SOURCE_DIR/lib/env.js" "$AUTOPILOT_DIR/lib/" 2>/dev/null || true
cp "$SOURCE_DIR/lib/notion.js" "$AUTOPILOT_DIR/lib/" 2>/dev/null || true
cp "$SOURCE_DIR/lib/errors.js" "$AUTOPILOT_DIR/lib/" 2>/dev/null || true

if [ -d "$SOURCE_DIR/cli" ]; then
  info "Copying CLI..."
  mkdir -p "$AUTOPILOT_DIR/cli"
  cp "$SOURCE_DIR/cli/autopilot.js" "$AUTOPILOT_DIR/cli/" 2>/dev/null || true
  chmod +x "$AUTOPILOT_DIR/cli/autopilot.js" 2>/dev/null || true
  # Symlink to ~/.local/bin (no sudo). Add to PATH if missing.
  mkdir -p "$HOME/.local/bin"
  ln -sf "$AUTOPILOT_DIR/cli/autopilot.js" "$HOME/.local/bin/autopilot"
  if ! echo ":$PATH:" | grep -q ":$HOME/.local/bin:"; then
    warn "~/.local/bin is not on your PATH."
    info "Add this to your shell rc (~/.bashrc or ~/.zshrc):"
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi
fi

if [ -d "$SOURCE_DIR/scripts" ]; then
  info "Copying maintenance scripts..."
  mkdir -p "$AUTOPILOT_DIR/scripts"
  cp "$SOURCE_DIR/scripts/"*.sh "$AUTOPILOT_DIR/scripts/" 2>/dev/null || true
  chmod +x "$AUTOPILOT_DIR/scripts/"*.sh 2>/dev/null || true
fi

info "Copying skills..."
if [ -d "$SOURCE_DIR/skills" ]; then
  # Install skills to Claude Code's skill directory
  CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
  if [ -d "$CLAUDE_SKILLS_DIR" ]; then
    cp -r "$SOURCE_DIR/skills/"* "$CLAUDE_SKILLS_DIR/" 2>/dev/null || true
    ok "Skills installed to $CLAUDE_SKILLS_DIR"
  else
    # Fallback: copy to autopilot dir
    mkdir -p "$AUTOPILOT_DIR/skills"
    cp -r "$SOURCE_DIR/skills/"* "$AUTOPILOT_DIR/skills/" 2>/dev/null || true
  fi
fi

info "Copying docs and updater..."
cp "$SOURCE_DIR/README.md" "$AUTOPILOT_DIR/" 2>/dev/null || true
cp "$SOURCE_DIR/ADHD-METHOD.md" "$AUTOPILOT_DIR/" 2>/dev/null || true
cp "$SOURCE_DIR/update.sh" "$AUTOPILOT_DIR/" 2>/dev/null || true
chmod +x "$AUTOPILOT_DIR/update.sh" 2>/dev/null || true

echo "$VERSION" > "$AUTOPILOT_DIR/VERSION"

# --- Generate config if not exists ---

if [ ! -f "$AUTOPILOT_DIR/config.json" ]; then
  info "Generating config.json..."

  # Detect language
  LANG_PREF="en"
  read -p "Language / Язык (en/ru): " -r LANG_INPUT
  [[ "$LANG_INPUT" == "ru" ]] && LANG_PREF="ru"

  # Ask for working directory instead of auto-scanning
  echo ""
  info "Where is your main working directory?"
  if [ "$LANG_PREF" == "ru" ]; then
    echo -e "  ${DIM}Укажи папку, в которой ты работаешь с Claude Code.${NC}"
    echo -e "  ${DIM}Можно нажать Enter чтобы использовать текущую: $(pwd)${NC}"
  else
    echo -e "  ${DIM}Enter the folder where you work with Claude Code.${NC}"
    echo -e "  ${DIM}Press Enter to use current directory: $(pwd)${NC}"
  fi
  read -p "Path: " -r WORK_DIR
  [[ -z "$WORK_DIR" ]] && WORK_DIR="$(pwd)"
  # Expand ~ to $HOME
  WORK_DIR="${WORK_DIR/#\~/$HOME}"

  if [ ! -d "$WORK_DIR" ]; then
    fail "Directory not found: $WORK_DIR"
  fi

  WORK_NAME="$(basename "$WORK_DIR")"
  REPOS_JSON="{\"$WORK_NAME\":{\"path\":\"$WORK_DIR\",\"keywords\":[\"$WORK_NAME\"]}}"
  REPO_COUNT=1

  ok "Working directory: $WORK_NAME ($WORK_DIR)"

  # Write config
  cat > "$AUTOPILOT_DIR/config.json" <<CONFIGEOF
{
  "version": "$VERSION",
  "user": {
    "name": "$(whoami)",
    "language": "$LANG_PREF"
  },
  "repos": $REPOS_JSON,
  "global_agents": {},
  "capture_triggers": $([ "$LANG_PREF" == "ru" ] && echo '["todo", "потом надо", "не забыть", "позже сделать", "задача на потом", "в очередь"]' || echo '["todo", "don'\''t forget", "later", "backlog", "remind me"]'),
  "focus": {
    "current": null,
    "why": null,
    "roadmap": []
  },
  "notion_sync": {
    "enabled": false,
    "database_id": null
  }
}
CONFIGEOF

  ok "Config created. Edit ~/.claude/autopilot/config.json to customize."
else
  ok "Config preserved (existing)"
fi

# --- .env: optional integrations (LightRAG, Notion) ---

ENV_FILE="$AUTOPILOT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  info "Optional integrations (skip any, press Enter)"

  if [ "${LANG_PREF:-en}" == "ru" ]; then
    ASK_NOTION_TOKEN="Notion токен (с https://www.notion.so/my-integrations, или Enter): "
    ASK_NOTION_DB="Notion Tasks DB ID (32-символьный hex, или Enter): "
    ASK_LR_PASS="LightRAG пароль (если используешь LightRAG локально, иначе Enter): "
  else
    ASK_NOTION_TOKEN="Notion token (from https://www.notion.so/my-integrations, or Enter to skip): "
    ASK_NOTION_DB="Notion Tasks DB ID (32-char hex, or Enter to skip): "
    ASK_LR_PASS="LightRAG password (if running LightRAG locally, else Enter): "
  fi

  read -p "$ASK_NOTION_TOKEN" -r NOTION_TOKEN_INPUT
  read -p "$ASK_NOTION_DB" -r NOTION_DB_INPUT
  read -p "$ASK_LR_PASS" -r LR_PASS_INPUT

  {
    echo "# Autopilot environment — generated $(date -Iseconds)"
    echo "# Edit anytime: $ENV_FILE"
    echo ""
    echo "# Notion sync (optional)"
    echo "NOTION_TOKEN=${NOTION_TOKEN_INPUT}"
    echo "NOTION_DB_ID=${NOTION_DB_INPUT}"
    echo ""
    echo "# LightRAG (optional)"
    echo "LIGHTRAG_URL=http://localhost:9621"
    echo "LIGHTRAG_USER=admin"
    echo "LIGHTRAG_PASS=${LR_PASS_INPUT}"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok ".env written ($ENV_FILE)"

  if [ -n "$NOTION_TOKEN_INPUT" ] && [ -n "$NOTION_DB_INPUT" ]; then
    info "Enabling Notion sync in config.json..."
    node -e "
      const fs = require('fs');
      const p = '$AUTOPILOT_DIR/config.json';
      const c = JSON.parse(fs.readFileSync(p, 'utf8'));
      c.notion_sync = c.notion_sync || {};
      c.notion_sync.enabled = true;
      c.notion_sync.database_id = '$NOTION_DB_INPUT';
      fs.writeFileSync(p, JSON.stringify(c, null, 2));
    " && ok "Notion sync enabled"
  fi
else
  ok ".env preserved (existing)"
fi

# --- Patch settings.json ---

info "Patching settings.json..."

if [ ! -f "$SETTINGS_FILE" ]; then
  cat > "$SETTINGS_FILE" <<SETTINGSEOF
{
  "hooks": {},
  "statusLine": {}
}
SETTINGSEOF
fi

# Use node to safely patch JSON
node -e "
const fs = require('fs');
const settingsPath = '$SETTINGS_FILE';
const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

// Ensure hooks structure
if (!s.hooks) s.hooks = {};

// Helper: add hook if not already present
function addHook(event, matcher, command, timeout) {
  if (!s.hooks[event]) s.hooks[event] = [];
  const hookCmd = 'node \"$HOME/.claude/autopilot/hooks/' + command + '\"';
  const exists = s.hooks[event].some(h =>
    h.hooks?.some(hh => hh.command?.includes(command))
  );
  if (exists) return false;

  const entry = { hooks: [{ type: 'command', command: hookCmd }] };
  if (matcher) entry.matcher = matcher;
  if (timeout) entry.hooks[0].timeout = timeout;
  s.hooks[event].push(entry);
  return true;
}

let changed = false;

// SessionStart — dashboard
changed = addHook('SessionStart', null, 'ap-dashboard.js') || changed;

// PostToolUse — context monitor
changed = addHook('PostToolUse', 'Bash|Edit|Write|MultiEdit|Agent|Task', 'ap-context-monitor.js', 10) || changed;

// Stop — autosave
changed = addHook('Stop', '.*', 'ap-autosave.js') || changed;

// UserPromptSubmit — capture triggers
changed = addHook('UserPromptSubmit', null, 'ap-userprompt.js') || changed;

// StatusLine
if (!s.statusLine?.command?.includes('ap-statusline')) {
  s.statusLine = {
    type: 'command',
    command: 'node \"$HOME/.claude/autopilot/hooks/ap-statusline.js\"'
  };
  changed = true;
}

if (changed) {
  fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
  console.log('PATCHED');
} else {
  console.log('ALREADY_CONFIGURED');
}
" 2>&1 | while read -r line; do
  if [ "$line" == "PATCHED" ]; then
    ok "settings.json patched with 4 hooks"
  elif [ "$line" == "ALREADY_CONFIGURED" ]; then
    ok "settings.json already configured"
  fi
done

# --- Verify ---

echo ""
info "Verifying installation..."

ERRORS=0

for f in hooks/ap-dashboard.js hooks/ap-statusline.js hooks/ap-context-monitor.js hooks/ap-autosave.js hooks/ap-userprompt.js lib/backlog.js lib/repos.js lib/format.js lib/env.js lib/notion.js lib/lightrag.js lib/wiki.js lib/errors.js cli/autopilot.js config.json VERSION; do
  if [ ! -f "$AUTOPILOT_DIR/$f" ]; then
    warn "Missing: $f"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ $ERRORS -eq 0 ]; then
  echo ""
  echo -e "${GREEN}${BOLD}Autopilot v${VERSION} installed successfully!${NC}"
  echo ""
  echo -e "  ${DIM}Config:${NC}    ~/.claude/autopilot/config.json"
  echo -e "  ${DIM}Env:${NC}       ~/.claude/autopilot/.env"
  echo -e "  ${DIM}Tasks:${NC}     ~/.claude/autopilot/backlog/"
  echo -e "  ${DIM}CLI:${NC}       autopilot status | list | focus | stats | inbox | doctor"
  echo -e "  ${DIM}Errors:${NC}    ~/.claude/autopilot/errors.log"
  echo -e "  ${DIM}Docs:${NC}      ~/.claude/autopilot/README.md"
  echo ""
  echo -e "  ${CYAN}Next:${NC} Restart Claude Code. The dashboard will appear automatically."
  echo -e "  ${CYAN}Try:${NC}   type \"todo first capture test\" in any session — it will be captured automatically."
  echo -e "  ${CYAN}Focus:${NC} Edit config.json or run \`autopilot focus set \"...\"\` to set your current focus."
  if [ -f "$AUTOPILOT_DIR/scripts/cleanup-pixel-agents.sh" ]; then
    if grep -q "pixel-agents" "$SETTINGS_FILE" 2>/dev/null; then
      echo ""
      echo -e "  ${YELLOW}Heads up:${NC} pixel-agents hooks detected in settings.json — they add ~5s timeout per event."
      echo -e "  ${YELLOW}Cleanup:${NC} bash ~/.claude/autopilot/scripts/cleanup-pixel-agents.sh"
    fi
  fi
  echo ""
else
  fail "Installation incomplete ($ERRORS files missing)"
fi

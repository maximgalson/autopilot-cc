#!/usr/bin/env bash
# Autopilot Installer v1.0.0
# Installs ADHD Terminal Copilot for Claude Code

set -euo pipefail

AUTOPILOT_DIR="$HOME/.claude/autopilot"
SETTINGS_FILE="$HOME/.claude/settings.json"
VERSION="1.0.0"

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

info "Copying lib..."
cp "$SOURCE_DIR/lib/backlog.js" "$AUTOPILOT_DIR/lib/"
cp "$SOURCE_DIR/lib/repos.js" "$AUTOPILOT_DIR/lib/"
cp "$SOURCE_DIR/lib/format.js" "$AUTOPILOT_DIR/lib/"
cp "$SOURCE_DIR/lib/memory.js" "$AUTOPILOT_DIR/lib/"

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

info "Copying docs..."
cp "$SOURCE_DIR/README.md" "$AUTOPILOT_DIR/" 2>/dev/null || true
cp "$SOURCE_DIR/ADHD-METHOD.md" "$AUTOPILOT_DIR/" 2>/dev/null || true

echo "$VERSION" > "$AUTOPILOT_DIR/VERSION"

# --- Generate config if not exists ---

if [ ! -f "$AUTOPILOT_DIR/config.json" ]; then
  info "Generating config.json..."

  # Detect language
  LANG_PREF="en"
  read -p "Language / Язык (en/ru): " -r LANG_INPUT
  [[ "$LANG_INPUT" == "ru" ]] && LANG_PREF="ru"

  # Detect repos
  info "Scanning for git repos in ~/ ..."
  REPOS_JSON="{"
  REPO_COUNT=0

  while IFS= read -r gitdir; do
    repo_path="$(dirname "$gitdir")"
    repo_name="$(basename "$repo_path")"

    # Skip hidden, node_modules, etc
    [[ "$repo_name" == .* ]] && continue
    [[ "$repo_path" == *node_modules* ]] && continue
    [[ "$repo_path" == */.* ]] && continue

    if [ $REPO_COUNT -gt 0 ]; then
      REPOS_JSON+=","
    fi
    REPOS_JSON+="\"$repo_name\":{\"path\":\"$repo_path\",\"keywords\":[\"$repo_name\"]}"
    REPO_COUNT=$((REPO_COUNT + 1))
    echo -e "  ${DIM}Found: $repo_name ($repo_path)${NC}"

    # Limit to 10 repos
    [ $REPO_COUNT -ge 10 ] && break
  done < <(find "$HOME" -maxdepth 3 -name ".git" -type d 2>/dev/null | head -20)

  REPOS_JSON+="}"

  ok "Found $REPO_COUNT repos"

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

for f in hooks/ap-dashboard.js hooks/ap-statusline.js hooks/ap-context-monitor.js hooks/ap-autosave.js lib/backlog.js lib/repos.js lib/format.js config.json VERSION; do
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
  echo -e "  ${DIM}Tasks:${NC}     ~/.claude/autopilot/backlog/"
  echo -e "  ${DIM}Docs:${NC}      ~/.claude/autopilot/README.md"
  echo ""
  echo -e "  ${CYAN}Next:${NC} Restart Claude Code. The dashboard will appear automatically."
  echo -e "  ${CYAN}Focus:${NC} Edit config.json to set your current focus and roadmap."
  echo ""
else
  fail "Installation incomplete ($ERRORS files missing)"
fi

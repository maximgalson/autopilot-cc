#!/usr/bin/env bash
# Autopilot for Codex CLI — installer v1.0.0
#
# Idempotent. Re-running upgrades binaries and plugin without touching config/env.
#
# What it does:
#   1. Creates ~/.codex/autopilot/{backlog,memory,sessions} structure.
#   2. Symlinks lib/ from the repo so backlog/memory/notion logic is shared.
#   3. Copies config.example.json → config.json if missing (preserves existing).
#   4. Copies env.example → .env (chmod 600) if missing.
#   5. Registers MCP server `autopilot` via `codex mcp add` (or appends to config.toml as fallback).
#   6. Installs workflow plugin into ~/.codex/.agents/plugins/autopilot-cc.
#   7. Symlinks codex-autopilot into a PATH directory.
#
# Usage:
#   ./codex/install-codex.sh
#   ./codex/install-codex.sh --dry-run    # show what would be done
#   ./codex/install-codex.sh --uninstall  # remove links, keep data
#
# Env overrides:
#   AUTOPILOT_HOME       (default: ~/.codex/autopilot)
#   CODEX_CONFIG_DIR     (default: ~/.codex)
#   AUTOPILOT_BIN_DIR    (default: $HOME/.local/bin, fallback to /usr/local/bin)

set -euo pipefail

DRY_RUN=0
UNINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help)
      sed -n '2,22p' "$0" | sed 's/^# //;s/^#//'
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME="${CODEX_CONFIG_DIR:-$HOME/.codex}"
AP_HOME="${AUTOPILOT_HOME:-$CODEX_HOME/autopilot}"
PLUGINS_DIR="$CODEX_HOME/.agents/plugins"
BIN_TARGET=""

choose_bin_dir() {
  if [ -n "${AUTOPILOT_BIN_DIR:-}" ]; then BIN_TARGET="$AUTOPILOT_BIN_DIR"; return; fi
  for cand in "$HOME/.local/bin" "/usr/local/bin" "/opt/homebrew/bin"; do
    if [ -d "$cand" ] && [ -w "$cand" ]; then BIN_TARGET="$cand"; return; fi
  done
  BIN_TARGET="$HOME/.local/bin"
}

say() { printf '%s\n' "$*"; }
run() {
  if [ "$DRY_RUN" = "1" ]; then
    printf '  [dry] %s\n' "$*"
  else
    eval "$@"
  fi
}

append_mcp_toml() {
  local toml="$CODEX_HOME/config.toml"
  if [ ! -f "$toml" ]; then
    run "mkdir -p '$CODEX_HOME'"
    run "touch '$toml'"
  fi
  if grep -q '\[mcp_servers.autopilot\]' "$toml" 2>/dev/null; then
    say "  ✓ [mcp_servers.autopilot] block already present in config.toml"
    return
  fi
  if [ "$DRY_RUN" = "1" ]; then
    say "  [dry] append [mcp_servers.autopilot] to $toml"
    return
  fi
  cat >> "$toml" <<EOF

[mcp_servers.autopilot]
command = "node"
args = ["$AP_HOME/mcp/autopilot-mcp.js"]
EOF
  say "  ✓ appended [mcp_servers.autopilot] to $toml"
}

link_replace() {
  local src="$1" dst="$2"
  if [ -L "$dst" ] || [ -e "$dst" ]; then run "rm -rf '$dst'"; fi
  run "ln -s '$src' '$dst'"
}

uninstall() {
  say "→ Uninstalling Autopilot Codex integration (data preserved at $AP_HOME)"
  for f in "$AP_HOME/lib" "$AP_HOME/bin" "$AP_HOME/mcp"; do
    [ -L "$f" ] && run "rm '$f'" || true
  done
  [ -L "$PLUGINS_DIR/autopilot-cc" ] && run "rm '$PLUGINS_DIR/autopilot-cc'" || true
  choose_bin_dir
  [ -L "$BIN_TARGET/codex-autopilot" ] && run "rm '$BIN_TARGET/codex-autopilot'" || true
  if command -v codex >/dev/null 2>&1; then
    run "codex mcp remove autopilot >/dev/null 2>&1 || true"
  fi
  say "✓ Uninstalled. Data left at $AP_HOME."
}

if [ "$UNINSTALL" = "1" ]; then
  uninstall
  exit 0
fi

say "Autopilot for Codex — install"
say "  repo:        $REPO_ROOT"
say "  autopilot:   $AP_HOME"
say "  codex home:  $CODEX_HOME"
say "  dry-run:     $DRY_RUN"
say ""

# --- 1. Structure ---
say "→ creating $AP_HOME structure"
for d in backlog memory sessions; do
  run "mkdir -p '$AP_HOME/$d'"
done

# --- 2. Symlinks: lib, bin, mcp from repo ---
say "→ linking lib/, bin/, mcp/ from $REPO_ROOT"
link_replace "$REPO_ROOT/lib" "$AP_HOME/lib"
link_replace "$REPO_ROOT/codex/bin" "$AP_HOME/bin"
link_replace "$REPO_ROOT/codex/mcp" "$AP_HOME/mcp"

# --- 3. Config / env ---
if [ ! -f "$AP_HOME/config.json" ]; then
  say "→ seeding config.json from template"
  run "cp '$REPO_ROOT/codex/config.example.json' '$AP_HOME/config.json'"
else
  say "✓ config.json exists (kept)"
fi

if [ ! -f "$AP_HOME/.env" ]; then
  say "→ seeding .env from template (chmod 600)"
  run "cp '$REPO_ROOT/codex/env.example' '$AP_HOME/.env'"
  run "chmod 600 '$AP_HOME/.env'"
else
  say "✓ .env exists (kept)"
fi

# --- 4. MCP server registration ---
say "→ registering MCP server 'autopilot'"
if command -v codex >/dev/null 2>&1; then
  # Try CLI first
  if codex mcp list 2>/dev/null | grep -q '^autopilot\b'; then
    say "✓ autopilot MCP already registered"
  else
    if [ "$DRY_RUN" = "0" ]; then
      if ! codex mcp add autopilot -- node "$AP_HOME/mcp/autopilot-mcp.js" 2>/dev/null; then
        say "  codex mcp add failed — falling back to config.toml edit"
        append_mcp_toml
      fi
    else
      say "  [dry] codex mcp add autopilot -- node $AP_HOME/mcp/autopilot-mcp.js"
    fi
  fi
else
  say "  codex CLI not on PATH — writing config.toml directly"
  append_mcp_toml
fi

# --- 5. Workflow plugin ---
say "→ installing workflow plugin"
run "mkdir -p '$PLUGINS_DIR'"
link_replace "$REPO_ROOT/codex/plugin" "$PLUGINS_DIR/autopilot-cc"

# --- 6. Wrapper into PATH ---
choose_bin_dir
say "→ installing codex-autopilot symlink → $BIN_TARGET/codex-autopilot"
run "mkdir -p '$BIN_TARGET'"
link_replace "$REPO_ROOT/codex/bin/codex-autopilot" "$BIN_TARGET/codex-autopilot"

# --- 7. Sanity check ---
say ""
say "Sanity check:"
for p in "$AP_HOME/lib/backlog.js" "$AP_HOME/bin/codex-autopilot" "$AP_HOME/mcp/autopilot-mcp.js" "$PLUGINS_DIR/autopilot-cc/plugin.json"; do
  if [ -e "$p" ] || [ -L "$p" ]; then
    say "  ✓ $p"
  else
    say "  ✗ MISSING: $p" >&2
  fi
done

say ""
say "Done."
say ""
say "Try it:"
say "  $BIN_TARGET/codex-autopilot"
say ""
say "If $BIN_TARGET is not in your PATH yet, add:"
say "  export PATH=\"$BIN_TARGET:\$PATH\""
say ""
say "Optional alias (zsh/bash):"
say "  alias codex='codex-autopilot'"

#!/usr/bin/env bash
# Autopilot — Cleanup pixel-agents from ~/.claude/settings.json
# v2.0 CC.0 sprint
#
# Purpose: Remove leftover pixel-agents hook entries (one per hook event)
# from a Claude Code settings.json. They are passthrough no-ops if you don't
# use the pixel-agents framework, and they add ~5s timeout per hook event.
#
# Safe: makes a timestamped backup first, uses jq for surgical edits.
#
# Usage:
#   bash scripts/cleanup-pixel-agents.sh
#   bash scripts/cleanup-pixel-agents.sh --dry-run    # show what would change
#   bash scripts/cleanup-pixel-agents.sh --remove-dir # also rm -rf ~/.pixel-agents
#
# Exit codes:
#   0  cleanup applied (or already clean)
#   1  prerequisite missing (jq, settings.json, etc.)
#   2  dry-run finished, no changes written

set -euo pipefail

SETTINGS="${HOME}/.claude/settings.json"
PIXEL_DIR="${HOME}/.pixel-agents"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="${SETTINGS}.bak.${TS}"

DRY_RUN=0
REMOVE_DIR=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --remove-dir) REMOVE_DIR=1 ;;
    -h|--help)
      grep '^# ' "$0" | sed 's/^# //'
      exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

# Pre-checks
[[ -f "$SETTINGS" ]] || { echo "settings.json not found at $SETTINGS" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq required (apt install jq)" >&2; exit 1; }

# Count pixel-agents references before
BEFORE=$(grep -c "pixel-agents" "$SETTINGS" || true)
if [[ "$BEFORE" -eq 0 ]]; then
  echo "✓ settings.json already clean (no pixel-agents references)"
  if [[ $REMOVE_DIR -eq 1 && -d "$PIXEL_DIR" ]]; then
    echo "→ removing $PIXEL_DIR"
    rm -rf "$PIXEL_DIR"
    echo "✓ $PIXEL_DIR removed"
  fi
  exit 0
fi

echo "Found $BEFORE pixel-agents references in $SETTINGS"

# Build cleaned JSON: in every hook event, strip commands containing pixel-agents,
# drop entries whose hook list became empty, then drop events that became empty.
CLEAN=$(jq '
  .hooks |= (
    to_entries
    | map(
        .value |= map(
          .hooks |= map(select(.command | test("pixel-agents") | not))
        )
        | .value |= map(select((.hooks | length) > 0))
      )
    | map(select((.value | length) > 0))
    | from_entries
  )
' "$SETTINGS")

# Sanity: result must be valid JSON and no longer contain pixel-agents
echo "$CLEAN" | jq . >/dev/null || { echo "✗ jq produced invalid JSON, aborting" >&2; exit 1; }
AFTER=$(echo "$CLEAN" | grep -c "pixel-agents" || true)

if [[ "$AFTER" -ne 0 ]]; then
  echo "✗ result still contains $AFTER pixel-agents references — refusing to write" >&2
  exit 1
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "--- DRY RUN diff ---"
  diff <(jq . "$SETTINGS") <(echo "$CLEAN") || true
  echo "--- end dry run (no changes written) ---"
  exit 2
fi

# Backup and write
cp "$SETTINGS" "$BACKUP"
echo "$CLEAN" | jq . > "$SETTINGS"

echo "✓ Removed $BEFORE pixel-agents references"
echo "✓ Backup: $BACKUP"
echo "✓ Settings clean: $SETTINGS"

if [[ $REMOVE_DIR -eq 1 && -d "$PIXEL_DIR" ]]; then
  echo "→ removing $PIXEL_DIR"
  rm -rf "$PIXEL_DIR"
  echo "✓ $PIXEL_DIR removed"
fi

echo ""
echo "Restart Claude Code to apply."

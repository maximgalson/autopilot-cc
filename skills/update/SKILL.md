---
name: update
description: Update Autopilot to the latest version from GitHub. Use when user says /update.
user_invocable: true
---

# /update — Update Autopilot

Updates Autopilot hooks, lib, and skills from GitHub while preserving config and tasks.

## What To Do

### 1. Check current version

```bash
cat ~/.claude/autopilot/VERSION 2>/dev/null || echo "unknown"
```

### 2. Run updater

```bash
bash ~/.claude/autopilot/update.sh
```

If `update.sh` doesn't exist (old installation), download and run it:

```bash
curl -fsSL https://raw.githubusercontent.com/maximgalson/autopilot-cc/main/update.sh | bash
```

### 3. Report result

Show the user:
- Previous version → new version
- Key changes (from git log)
- Remind to restart Claude Code

```
Updated: v{old} → v{new}
Config preserved. Restart Claude Code to apply.
```

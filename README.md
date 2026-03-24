# Autopilot — ADHD Terminal Copilot for Claude Code

Your brain doesn't hold context between sessions. Autopilot does.

## What It Does

4 hooks that run silently inside Claude Code:

| Hook | When | What |
|------|------|------|
| **Dashboard** | Session start | Shows repos, tasks, focus, suggests next step |
| **Statusline** | Always | Model + active task + context usage bar |
| **Context Monitor** | After each tool | Warns when context is running low |
| **Autosave** | Session end | Saves current work as suspended task |

## ADHD Protocol (built-in)

- Detects topic switches and asks: "conscious switch or defocus?"
- No guilt-tripping. Defocus is normal. Just notes it and offers to return.
- Tracks session count per task. After 3+ sessions: "Is this done enough?"
- One best option, not five. Reduces decision fatigue.
- Compact output. No walls of text.

## Install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/maximgalson/autopilot-cc/main/install.sh)
```

Or manually:

```bash
git clone https://github.com/maximgalson/autopilot-cc.git /tmp/autopilot-cc
cd /tmp/autopilot-cc && bash install.sh
```

## Structure

```
~/.claude/autopilot/
  config.json          # Your repos, keywords, routing, focus
  VERSION              # Current version
  ADHD-METHOD.md       # Full ADHD methodology reference
  backlog/             # Tasks (1 JSON = 1 task)
    task-{id}.json
  hooks/               # 4 hooks
    ap-dashboard.js    # SessionStart
    ap-statusline.js   # StatusLine
    ap-context-monitor.js  # PostToolUse
    ap-autosave.js     # Stop
  lib/                 # Shared logic
    backlog.js         # Task CRUD, 3-char IDs
    repos.js           # Git status across repos
    format.js          # ADHD-friendly formatting
```

## Task Flow

```
pending → active → suspended → active → done
                  ↑                    |
                  └────────────────────┘
```

- **pending** — queued, not started
- **active** — max 1 at a time
- **suspended** — paused with context snapshot (auto on session end)
- **done** — completed

## Task Schema

```json
{
  "id": "a7x",
  "title": "Fix Prodamus webhook",
  "project": "galsonpro-bot",
  "status": "suspended",
  "priority": "high",
  "sessions_count": 2,
  "context_snapshot": {
    "cwd": "/Users/user/galsonpro-bot",
    "files_touched": ["server.js"],
    "summary": "Debugging HMAC verification",
    "next_step": "Add express.raw() before line 897"
  }
}
```

## Config

Edit `~/.claude/autopilot/config.json`:

- `repos` — your projects with paths, keywords, agents/skills
- `focus` — current focus, why, roadmap (shown in dashboard)
- `capture_triggers` — phrases that auto-create tasks ("todo X", "don't forget X")
- `global_agents` — cross-project agents with keyword routing

## Commands (natural language)

| Say | What happens |
|-----|-------------|
| `todo fix the webhook` | Creates pending task |
| `continue #a7x` | Activates suspended task |
| `done #a7x` | Completes task |
| `defocus` / `unfocus` | Saves idea to backlog, returns to focus |
| `where am I?` | Shows focus + roadmap |

## Requirements

- Claude Code (claude.ai CLI)
- Node.js 18+
- Git repos you want to track

## Version

1.0.0

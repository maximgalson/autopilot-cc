# Autopilot — ADHD Terminal Copilot for Claude Code

![autopilot-cc-banner-v4](https://github.com/user-attachments/assets/ee825c39-0b4f-446c-bbd4-00bb3ad60a40)

> Your brain doesn't hold context between sessions. Autopilot does.

[![Version](https://img.shields.io/badge/version-1.3.0-blue)](https://github.com/maximgalson/autopilot-cc/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-purple)](https://claude.ai)

---

## The Problem

You close a Claude Code session. Next day you open a new one. Claude has no idea what you were doing. You waste 10 minutes explaining context. Repeat daily.

**Autopilot fixes this.** 4 hooks run silently inside Claude Code, capturing your work, saving context, and restoring it when you return.

## What It Does

| Hook | When | What |
|------|------|------|
| **Dashboard** | Session start | Shows your repos, tasks, focus, suggests next step |
| **Statusline** | Always visible | Model + active task + context usage bar |
| **Context Monitor** | Every 30 tool calls | Saves session checkpoint automatically |
| **Autosave** | Session end | Captures summary + next step for tomorrow |

Plus:
- **Memory layer** that grows over time and surfaces relevant context
- **ADHD Protocol** that detects defocus and helps you return
- **4 slash commands**: `/save`, `/back`, `/todo`, `/update`

## Quick Start

### Install

```bash
git clone https://github.com/maximgalson/autopilot-cc.git /tmp/autopilot-cc
cd /tmp/autopilot-cc && bash install.sh
```

The installer will:
1. Ask your language (en/ru)
2. Ask your working directory
3. Set up hooks in `~/.claude/settings.json`
4. Generate your personal `config.json`

**Restart Claude Code after installation.**

### Update

```bash
bash ~/.claude/autopilot/update.sh
```

Or type `/update` inside Claude Code. Config and tasks are preserved.

### Works With

- **Claude Code CLI** (terminal)
- **Claude Code in VS Code** (extension uses the same `~/.claude/` config)
- **Claude Code Desktop App**

No extra setup needed for VS Code. If hooks are in `~/.claude/settings.json`, they work everywhere.

## How It Works

```
Session start
  |
  Dashboard shows: repos, tasks, focus, recent sessions
  |
You work normally
  |
Every 30 tool calls --> checkpoint saves context silently
  |
Session ends --> autosave captures what you did + next step
  |
Next session --> dashboard restores your context in 3 lines
```

## Slash Commands

### `/save` + `/back` — Session Memory

```
Working on dashboard fixes...
> /save dashboard        # saves 8-line snapshot

Next day:
> /back                  # shows all saved sessions
> /back dashboard        # restores context instantly
```

`/save` captures what you did, what's next, and blockers. Max 8 lines, overwrites each time.

`/back` shows a table of all sessions. Pick one and continue.

| | `claude --resume` | `/save` + `/back` |
|---|---|---|
| Saves | Entire chat | 8-line essence |
| Sessions | Last one | Any number, named |
| Context cost | Heavy | Minimal |
| Cross-project | No | Yes |

### `/todo` — Task Creation

```
/todo Fix the webhook verification
/todo [high] Deploy new version
/todo [my-project] Refactor auth
```

Creates a markdown file with context, next step, and work log. When you return, Claude reads it and picks up where you left off.

### `/update` — Self-Update

Pulls the latest version from GitHub. Preserves your config and tasks.

## ADHD Protocol

Built-in, runs silently:

- **Defocus detection** — switches topics mid-session? Asks: "conscious switch or defocus?"
- **No guilt** — defocus is normal. Notes it and offers to return.
- **Session tracking** — task active for 3+ sessions? "Is this done enough?"
- **One option** — not five. Reduces decision fatigue.
- **Compact output** — no walls of text.

## Configuration

Edit `~/.claude/autopilot/config.json`:

```json
{
  "user": { "name": "You", "language": "en" },
  "repos": {
    "my-project": {
      "path": "/path/to/project",
      "keywords": ["project", "main"]
    }
  },
  "focus": {
    "current": "Launch v2",
    "why": "Deadline next week",
    "roadmap": ["Backend", "Frontend", "Deploy"]
  },
  "capture_triggers": ["todo", "don't forget", "later"]
}
```

| Field | What |
|-------|------|
| `repos` | Your projects with paths and keywords for routing |
| `focus` | Current focus shown in dashboard (optional) |
| `capture_triggers` | Phrases that auto-create tasks |
| `global_agents` | Cross-project agents with keyword routing |

## File Structure

```
~/.claude/autopilot/
  config.json              # Your config (preserved on update)
  update.sh                # Self-updater
  VERSION                  # Current version
  hooks/
    ap-dashboard.js        # SessionStart — shows context
    ap-statusline.js       # StatusLine — always visible
    ap-context-monitor.js  # PostToolUse — checkpoints
    ap-autosave.js         # Stop — saves session
  lib/
    backlog.js             # Task CRUD
    repos.js               # Git status
    format.js              # ADHD-friendly output
    memory.js              # Memory layer
  backlog/                 # Tasks (JSON)
  sessions/                # Session logs (auto)
  memory/                  # Long-term memory
```

## Task Lifecycle

```
pending --> active --> suspended --> active --> done
                         ^                      |
                         +----------------------+
```

Tasks are created explicitly via `/todo`. Sessions are logged automatically. No backlog spam.

## Requirements

- [Claude Code](https://claude.ai/code) (CLI, VS Code extension, or Desktop)
- Node.js 18+

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Author

**Max Galson** — [galson.pro](https://galson.pro)

Built from managing 6 projects with ADHD. Now it's the external brain I always needed.

- Blog: [galson.pro/blog](https://galson.pro/blog)
- Telegram: [@galsonpro](https://t.me/galsonproai)
- GitHub: [@maximgalson](https://github.com/maximgalson)

## License

MIT

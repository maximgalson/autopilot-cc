# Autopilot — ADHD Terminal Copilot for Claude Code

![autopilot-cc-banner-v4](https://github.com/user-attachments/assets/ee825c39-0b4f-446c-bbd4-00bb3ad60a40)

Your brain doesn't hold context between sessions. Autopilot does.

**Built by [Max Galson](https://galson.pro)** — AI automation architect, creator of [Content Factory](https://galson.pro) and [Claude Code tools](https://galson.pro/blog).

## What It Does

4 hooks that run silently inside Claude Code:

| Hook | When | What |
|------|------|------|
| **Dashboard** | Session start | Shows repos, tasks, focus, suggests next step |
| **Statusline** | Always | Model + active task + context usage bar |
| **Context Monitor** | After each tool | Periodic checkpoints + low-context warnings |
| **Autosave** | Session end | Saves current work as suspended task |

Plus a **memory layer** that captures every session, detects recurring topics, and surfaces relevant context automatically.

## ADHD Protocol (built-in)

- Detects topic switches and asks: "conscious switch or defocus?"
- No guilt-tripping. Defocus is normal. Just notes it and offers to return.
- Tracks session count per task. After 3+ sessions: "Is this done enough?"
- One best option, not five. Reduces decision fatigue.
- Compact output. No walls of text.

## Install

```bash
git clone https://github.com/maximgalson/autopilot-cc.git /tmp/autopilot-cc
cd /tmp/autopilot-cc && bash install.sh
```

## Update

```bash
bash ~/.claude/autopilot/update.sh
```

Or from within Claude Code, type `/update`.

Updates preserve your `config.json` and task backlog.

## How It Works

```
You work normally in Claude Code
        |
Every 20 tool calls → silent checkpoint → Claude saves context
        |
Session ends → autosave captures summary + next step
        |
Next session → dashboard shows what you were doing
        |
Same topic 2+ times → "Create a task or one-off?"
        |
Topic switch detected → "Intentional or defocus?"
```

## Structure

```
~/.claude/autopilot/
  config.json            # Your repos, keywords, routing, focus
  VERSION                # Current version
  ADHD-METHOD.md         # Full ADHD methodology reference
  backlog/               # Tasks (1 JSON = 1 task)
  sessions/              # Daily session logs (auto-captured)
  memory/                # Long-term memory (JSON + tags + search)
  hooks/                 # 4 hooks
    ap-dashboard.js      # SessionStart
    ap-statusline.js     # StatusLine
    ap-context-monitor.js  # PostToolUse (checkpoints + warnings)
    ap-autosave.js       # Stop (session capture)
  lib/                   # Shared logic
    backlog.js           # Task CRUD, 3-char IDs
    repos.js             # Git status across repos
    format.js            # ADHD-friendly formatting
    memory.js            # Memory layer: save, search, sessions
  skills/                # Slash commands
    save/SKILL.md        # /save — save session snapshot
    back/SKILL.md        # /back — return to saved session
    todo/SKILL.md        # /todo — create task with context
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

## Config

Edit `~/.claude/autopilot/config.json`:

- `repos` — your projects with paths, keywords, agents/skills
- `focus` — current focus, why, roadmap (shown in dashboard)
- `capture_triggers` — phrases that auto-create tasks ("todo X", "don't forget X")
- `global_agents` — cross-project agents with keyword routing

## /save + /back — Session Memory

Your brain forgets what you were doing. Sessions remember.

```
Working on dashboard fixes...
> /save dashboard          # saves 8-line snapshot
# close terminal, go to sleep

Next day:
> /back                    # shows all sessions
> /back dashboard          # jumps straight back
```

**`/save`** captures what you did, what's next, and any blockers — max 8 lines. Overwrites every time (no bloat).

**`/back`** shows a table of all sessions. Pick one and continue where you left off.

Sessions live in `~/.claude/autopilot/sessions/` — visible from any project.

**How it's different from `claude --resume`:**

| | `claude --resume` | `/save` + `/back` |
|---|---|---|
| Saves | Entire chat (all messages) | 8-line snapshot (essence + next step) |
| Sessions | Last one only | Any number, named |
| Context cost | Heavy — full conversation | Minimal — 8 lines |
| Cross-project | No | Yes |

`claude --resume` restores the **chat**. `/back` restores the **meaning** — what you did, what's next, where you stopped.

Optional: sync sessions to Notion (set `notion_sync.enabled: true` in config).

## /todo — Task Creation

Slash command that creates a task as a markdown file with full context:

```
/todo Fix the webhook verification
/todo [high] Deploy new version
/todo [my-project] Refactor auth
```

Creates `~/.claude/autopilot/tasks/fix-the-webhook.md` with context, next step, and work log. When you return to this task later, Claude reads the file and picks up where you left off.

Optional: connect to Notion for a human-friendly task board (see config).

## Commands (natural language)

| Say | What happens |
|-----|-------------|
| `/save dashboard` | Saves session snapshot |
| `/back` | Shows all sessions, pick one |
| `/back dashboard` | Returns to specific session |
| `/todo fix the webhook` | Creates MD task file + backlog entry |
| `continue #a7x` | Activates suspended task |
| `done #a7x` | Completes task |
| `defocus` / `unfocus` | Saves idea to backlog, returns to focus |
| `where am I?` | Shows focus + roadmap |

## Requirements

- Claude Code (claude.ai CLI)
- Node.js 18+
- Git repos you want to track

## Author

**Max Galson** — [galson.pro](https://galson.pro)

Building AI-powered content systems and developer tools. Autopilot was born from managing 6 projects with ADHD — now it's the external brain I always needed.

- Blog: [galson.pro/blog](https://galson.pro/blog)
- Telegram: [@galsonpro](https://t.me/galsonproai)
- GitHub: [@maximgalson](https://github.com/maximgalson)

## License

MIT

---

*Part of the [Galson Pro](https://galson.pro) ecosystem.*

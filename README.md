# Autopilot — ADHD Terminal Copilot for Claude Code

> Your brain doesn't hold context between sessions. Autopilot does.

[![Version](https://img.shields.io/badge/version-2.0.0--beta1-blue)](https://github.com/maximgalson/autopilot-cc/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-purple)](https://claude.ai)

---

## What you get in 60 seconds

```bash
git clone https://github.com/maximgalson/autopilot-cc.git /tmp/autopilot-cc
cd /tmp/autopilot-cc && bash install.sh
# answers 3 prompts (language, working dir, optional Notion/LightRAG creds)
# restart Claude Code
```

Now in any Claude Code session:

```
You:    todo проверить вебхук в боте [high]
Claude: Captured #abc — задача создана и синкнута в Notion ✓
```

```
You:    /save dashboard-fix
You:    *closes terminal, sleeps, opens it next morning*
You:    /back dashboard-fix
Claude: ← restored 8-line context: what you did, what's next, what's blocking
```

```
$ autopilot status
Focus:    ship v2.0
Active:   #abc "проверить вебхук"
Pending:  3
Suspended:1
Stale:    1 (>14d, no sessions)
```

That's it. No accounts, no SaaS, all local files.

---

## Why it exists

You close a Claude Code session. Next day you open a new one. Claude has no idea what you were doing. You waste 10 minutes explaining context. Repeat daily.

If you have ADHD: you also have a backlog of "todo" items you said but never wrote down, an inbox of half-thought notes, and three started-but-never-finished tasks for every one you ship.

**Autopilot fixes both.** Five hooks run silently inside Claude Code, capturing context, saving sessions, catching capture triggers in your prompts, and bumping stale tasks onto your phone via Notion. A small CLI lets you check status without opening Claude.

---

## What's inside

| Hook | When | What |
|------|------|------|
| **Dashboard** | Session start | Repos, tasks, focus, knowledge graph, memory, **Stale block**, suggestion |
| **StatusLine** | Always visible | Model + active task + context-usage bar |
| **Context Monitor** | Every 30 tool calls | Auto-checkpoint, crash-safe snapshot of files/commands |
| **Autosave** | Session end | Captures summary + next step, writes wiki + LightRAG |
| **UserPromptSubmit** *(new in 2.0)* | Every user prompt | Catches `todo`, `не забыть`, `later`, ... → creates task + Notion |

Plus:
- **Memory layer** — full-text search, recency + frequency boost, recurring topics
- **Notion sync** *(new in 2.0)* — bi-directional, schema-aware, no npm dep
- **CLI tool** *(new in 2.0)* — `autopilot status | list | focus | stats | inbox | doctor`
- **Slash commands** — `/save`, `/back`, `/todo`, `/inbox` *(new)*, `/review` *(new)*, `/update`
- **ADHD Protocol** — defocus detection, "good enough?" check after 3+ sessions, no guilt

---

## Quick start

See **[docs/QUICKSTART.md](docs/QUICKSTART.md)** for a 5-minute walkthrough.

### Install

```bash
git clone https://github.com/maximgalson/autopilot-cc.git /tmp/autopilot-cc
cd /tmp/autopilot-cc && bash install.sh
```

The installer asks:
1. Language (en/ru)
2. Your main working directory
3. Optional: Notion token + DB ID, LightRAG password

It writes:
- `~/.claude/autopilot/config.json` (your repos, focus, capture triggers)
- `~/.claude/autopilot/.env` (secrets, chmod 600)
- 5 hooks into `~/.claude/settings.json`
- `~/.local/bin/autopilot` symlink (tells you to add it to PATH if missing)

**Restart Claude Code** after installation.

### Update

```bash
bash ~/.claude/autopilot/update.sh
# or type `/update` inside Claude Code
```

Pulls the latest from GitHub. Your `config.json`, `.env`, and `backlog/` are preserved.

### Cleanup leftover hooks (one-time, if upgrading from v1.x)

```bash
bash ~/.claude/autopilot/scripts/cleanup-pixel-agents.sh --dry-run
bash ~/.claude/autopilot/scripts/cleanup-pixel-agents.sh
```

Removes orphan pixel-agents passthrough hooks that add ~5s per event.

---

## Slash commands

### `/save` + `/back` — session memory

```
> /save dashboard
Saved: ~/.claude/autopilot/sessions/dashboard.md (8 lines)

[next morning]
> /back dashboard
Done: fixed Stale block, added markStaleTasksOverdue.
Result: 6/7 smoke tests pass.
Next step: wire env.load() into ap-autosave.
Blockers: none.
```

`/save` overwrites; `/back` lists all sessions. Cross-project, cross-machine.

### `/todo` — explicit task creation

```
/todo Fix the webhook verification
/todo [high] Deploy new version
/todo [my-project] Refactor auth
```

Creates a task locally, syncs to Notion if enabled. Stores `notion.url` back into the task JSON for idempotent updates.

### `/inbox` — wiki inbox processor *(new in 2.0)*

```
/inbox            # list with suggested destinations
/inbox process    # interactive: Move / Different folder / Skip / Delete
```

Routes loose notes from `~/claudecode/wiki/inbox/` into the right folder.

### `/review` — post-session review *(new in 2.0)*

```
/review           # last 5 sessions: what you said you'd do next, decide done/todo/ignore
/review weekly    # 7-day digest: active days, sessions, tasks, stale, top project
```

Pulls "next_step" from each session and lets you convert them into real tasks (with Notion sync).

### `/update` — self-update

```
/update
```

Pulls latest. Preserves config, env, tasks.

---

## Capture triggers (new in 2.0)

Configured in `config.json` under `capture_triggers`. Defaults:

```json
"capture_triggers": ["todo", "потом надо", "не забыть", "позже сделать", "задача на потом", "в очередь"]
```

When you type one of these in chat:

```
You: не забыть [high] [my-project] обновить депенденси в проде
Hook: AUTOPILOT CAPTURED:
  #xyz "обновить депенденси в проде" [my-project] [high] → Notion ✓
Claude: понял, задача в бэклоге.
```

False-positive guards:
- Lines starting with `git`, `npm`, `node`, `bash`, `curl`, ... are skipped (commands, not intent).
- Triggers inside backticks, fenced code blocks, or quotes are skipped.
- Lines with no real text after the trigger are skipped.

Add or remove triggers in `config.json` — the hook reads it on every prompt.

---

## Notion sync (new in 2.0)

Set `notion_sync.enabled: true` and `notion_sync.database_id: "<32-char hex>"` in `config.json`. Put `NOTION_TOKEN=secret_…` in `~/.claude/autopilot/.env`.

`lib/notion.js` does **schema discovery** on first call: it queries your DB and only writes properties that actually exist there. Required: a `title` property (any name). Optional: `Status`, `Priority`, `Project`, `Due`, `Tags`, `Autopilot ID`. Missing properties are silently skipped — no schema migration required.

**Stale-task reminders.** Tasks aged >14 days with no sessions get their Notion `Due` bumped to today during the SessionStart hook. Notion mobile then pushes a notification. This replaces the never-built in-process scheduler — Notion already does it better.

---

## CLI tool (new in 2.0)

```
autopilot status        # one-screen summary
autopilot list          # all open tasks (or: list pending, list active, list all)
autopilot focus set "ship v2.0"
autopilot focus why "deadline next week"
autopilot focus clear
autopilot stats 7       # 7-day digest
autopilot inbox         # list wiki inbox with suggested folders
autopilot doctor        # health check: hooks, env, Notion, LightRAG, recent errors
```

Useful from cron (`autopilot stats 7 | mail -s "weekly autopilot" me@…`) or from non-Claude terminals.

---

## ADHD protocol

Built-in, runs silently:

- **No guilt** — defocus is normal. Note it, offer to return.
- **Defocus detection** — only mid-session, not at session start (starting on any project is intentional).
- **"Good enough?" check** — after 3+ sessions on the same task: "is this done enough to ship?"
- **One option** — not five. Reduces decision fatigue.
- **Compact output** — no walls of text.
- **Stale flag** — tasks aging without sessions get nudged in dashboard + Notion mobile push.

Full philosophy: [ADHD-METHOD.md](ADHD-METHOD.md).

---

## Privacy

Everything is local files. No SaaS, no telemetry.

Optional integrations:
- **Notion** — opt-in. Reads/writes one database you control. Token in `.env` (chmod 600), never in source.
- **LightRAG** — opt-in. Self-hosted. Token in `.env`.
- **qmd** — local MCP for wiki search. No network.

---

## File layout

```
~/.claude/autopilot/
  config.json              # Your config (preserved on update)
  .env                     # Secrets (chmod 600, gitignored)
  errors.log               # Rotating error log (10 MB max)
  VERSION                  # Current version
  hooks/
    ap-dashboard.js        # SessionStart
    ap-statusline.js       # StatusLine
    ap-context-monitor.js  # PostToolUse
    ap-autosave.js         # Stop
    ap-userprompt.js       # UserPromptSubmit (new)
  lib/
    backlog.js             # Task CRUD
    repos.js               # Git status
    format.js              # Output formatting
    memory.js              # Memory layer + sessions
    lightrag.js            # Optional LightRAG client
    wiki.js                # Wiki appender
    env.js                 # .env loader (new)
    notion.js              # Notion REST client (new)
    errors.js              # Central error log (new)
  cli/
    autopilot.js           # CLI binary (new)
  scripts/
    cleanup-pixel-agents.sh # One-time cleanup (new)
  backlog/                 # Tasks (JSON)
  sessions/                # Session digests (auto)
  memory/                  # Long-term memory
```

---

## Task lifecycle

```
pending --> active --> suspended --> active --> done
                          ^                       |
                          +-----------------------+
```

Tasks are created **explicitly** — via `/todo`, capture triggers, or `/review`. Sessions are logged automatically. No backlog spam (this was a bug in pre-1.2 — fixed).

---

## Requirements

- [Claude Code](https://claude.ai/code) (CLI, VS Code extension, or Desktop)
- Node.js 18+
- `jq` (only if you run `scripts/cleanup-pixel-agents.sh`)

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Author

**Max Galson** — [galson.pro](https://galson.pro)

Built from running 6 projects with ADHD. Now it's the external brain I always needed.

- Blog: [galson.pro/blog](https://galson.pro/blog)
- Telegram: [@galsonproai](https://t.me/galsonproai)
- GitHub: [@maximgalson](https://github.com/maximgalson)

## License

MIT

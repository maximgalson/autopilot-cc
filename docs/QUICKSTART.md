# Quickstart — 5 minutes from zero to working Autopilot

This walks you from a fresh clone to your first captured task. Total time ≈ 5 minutes.

---

## 0. Prerequisites

```bash
node --version    # 18 or higher
which jq          # required only for the cleanup script
```

If you don't have `jq`: `sudo apt install jq` (Debian/Ubuntu) or `brew install jq` (Mac).

You'll also need **[Claude Code](https://claude.ai/code)** installed — Autopilot is a set of hooks and skills that plug into it.

---

## 1. Install (~60 seconds)

```bash
git clone https://github.com/maximgalson/autopilot-cc.git /tmp/autopilot-cc
cd /tmp/autopilot-cc
bash install.sh
```

The installer asks **three questions**:

1. **Language** — `en` or `ru`. Affects default capture triggers and prompts.
2. **Working directory** — the folder you usually open Claude Code in. Used to detect which project you're in.
3. **Optional integrations** — Notion token, Notion DB ID, LightRAG password. Press Enter to skip; you can set these later in `~/.claude/autopilot/.env`.

If you have leftover hooks from a previous setup, the installer prints a heads-up:

```
Heads up: pixel-agents hooks detected in settings.json — they add ~5s timeout per event.
Cleanup: bash ~/.claude/autopilot/scripts/cleanup-pixel-agents.sh
```

Run the cleanup script (it backs up first):

```bash
bash ~/.claude/autopilot/scripts/cleanup-pixel-agents.sh --dry-run    # preview
bash ~/.claude/autopilot/scripts/cleanup-pixel-agents.sh              # apply
```

---

## 2. Restart Claude Code

Close and reopen it (CLI, VS Code, or Desktop). The first prompt of your first new session will show the Autopilot dashboard:

```
AUTOPILOT SESSION START
========================
Repos: my-project[ok]

No tasks in backlog. Ready for new work.

Routing:
  my-project: [project, main] -> direct

Instructions: ...
```

If you don't see this, your hooks aren't firing. Run `autopilot doctor` (next step) to find out why.

---

## 3. Verify with the CLI

```bash
autopilot doctor
```

Expected output (after install + cleanup):

```
✓ config.json          /home/you/.claude/autopilot/config.json
✓ hook ap-dashboard
✓ hook ap-context-monitor
✓ hook ap-autosave
✓ hook ap-statusline
✓ hook ap-userprompt
✓ pixel-agents clean
✓ .env                 /home/you/.claude/autopilot/.env
✓ Notion sync          config + token ok       (only if you entered Notion creds)
✓ Notion schema        title="Name"            (only if Notion enabled)
✓ LightRAG             LIGHTRAG_PASS set       (only if you entered the password)
✓ errors.log           empty
```

Anything red means that feature is off. Most are optional — only the five `hook ap-*` rows and `pixel-agents clean` matter for the core experience.

---

## 4. Try the four killer features

### A. Capture trigger

In any Claude Code session, type:

```
todo обновить readme в проекте
```

Claude responds:

```
Captured #abc "обновить readme в проекте" — задача в бэклоге.
```

Check it:

```bash
autopilot list
```

```
#abc pending   0d   обновить readme в проекте
```

### B. /save and /back — context across sessions

```
> /save quickstart-test
Saved: ~/.claude/autopilot/sessions/quickstart-test.md
```

Close Claude Code. Open it again. New session:

```
> /back quickstart-test
Done: trying out Autopilot quickstart.
Result: capture trigger works.
Next step: try /review and /inbox.
Blockers: none.
```

Eight lines, restored instantly.

### C. /todo with priority and project

```
/todo [high] [my-project] деплой нового релиза
```

Creates a `pending` task in `~/.claude/autopilot/backlog/task-xyz.json`, syncs to your Notion DB if enabled, and includes both attributes:

```bash
$ autopilot list
#xyz pending   0d   деплой нового релиза [my-project] [high]
#abc pending   2m   обновить readme в проекте
```

### D. autopilot stats — weekly digest

After a week of normal use:

```bash
autopilot stats 7
```

```
Last 7 days
  Active days:        4 / 7
  Sessions:           23
  Tasks created:      6
  Tasks completed:    2
  Stale tasks:        1 (#m4k)
  Top project:        my-project (15)
  Recurring topics:   1
  Inbox notes:        3
```

Convert stale tasks into action: open Claude Code and type `/review`.

---

## 5. Optional: enable Notion sync

If you skipped Notion during install, enable it later:

1. Create a Notion database with at least one `Title` property. Recommended additional properties: `Status` (status type), `Priority` (select), `Project` (select), `Due` (date), `Tags` (multi-select).
2. Create a Notion integration: <https://www.notion.so/my-integrations>. Copy the `Internal Integration Token`.
3. Share your DB with the integration: open the DB → Share → Add connections → pick yours.
4. Copy the DB ID from the URL: `https://notion.so/your-workspace/<DB_ID>?v=…` — the 32-char hex string before `?`.
5. Edit `~/.claude/autopilot/.env`:
   ```
   NOTION_TOKEN=secret_…
   NOTION_DB_ID=2d06ad1acb598047afa9fbf6113a4758
   ```
6. Edit `~/.claude/autopilot/config.json`:
   ```json
   "notion_sync": { "enabled": true, "database_id": "2d06ad1acb598047afa9fbf6113a4758" }
   ```
7. Verify: `autopilot doctor` should show ✓ Notion sync and ✓ Notion schema.
8. Test: `/todo Notion sync test` → page appears in your Notion DB. Mark it Done in Notion → on next SessionStart it propagates back locally.

**Stale-task reminders:** any task aged >14 days with no sessions gets its Notion `Due` bumped to today. Notion mobile then pushes a notification. No extra setup required.

---

## 6. Where things live

| Path | What |
|------|------|
| `~/.claude/autopilot/config.json` | Repos, focus, capture triggers, notion_sync flag |
| `~/.claude/autopilot/.env` | Secrets (NOTION_TOKEN, LIGHTRAG_PASS) |
| `~/.claude/autopilot/backlog/` | Pending/active/suspended tasks (JSON) |
| `~/.claude/autopilot/sessions/` | Auto-logged session digests |
| `~/.claude/autopilot/memory/` | Long-term memory (auto-captured) |
| `~/.claude/autopilot/errors.log` | Rotating error log (10 MB max) |
| `~/.claude/settings.json` | Hook registration (managed by `install.sh`) |

---

## 7. Updating

```bash
bash ~/.claude/autopilot/update.sh
# or, inside Claude Code:
/update
```

Pulls the latest. Preserves config, env, backlog, sessions, memory.

---

## 8. Troubleshooting

| Problem | Fix |
|---------|-----|
| No dashboard on session start | `autopilot doctor` — check hook rows |
| `autopilot: command not found` | Add `~/.local/bin` to your PATH and restart shell |
| Capture trigger doesn't fire | Check trigger spelling in `config.json`; lines starting with `git`/`npm`/etc are intentionally skipped |
| Notion sync silent fail | `tail ~/.claude/autopilot/errors.log` |
| LightRAG warns "disabled" | Set `LIGHTRAG_PASS` in `.env`, or remove LightRAG calls from your config |
| Slow session start (>3s) | Run `cleanup-pixel-agents.sh`; check `git -C ~/claudecode pull` is in `settings.json` SessionStart |

For anything else: open an issue at <https://github.com/maximgalson/autopilot-cc/issues>.

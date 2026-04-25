# Changelog

## v2.0.0-beta2 (2026-04-25)

**Inbox + review skills, CLI tool, error log, smoke tests, README v2.**

- **`/inbox` skill** — sweeps `~/claudecode/wiki/inbox/`, suggests a destination folder per file (`decisions/`, `feedback/`, `references/`, `clients/`, or `projects/`) based on filename + first-line heuristics. `/inbox process` walks files interactively (Move / Different folder / Skip / Delete with explicit confirm).
- **`/review` skill** — pulls `next_step` from the last 5 sessions and lets the user convert each into a real task (with Notion sync) or mark it done/ignored. `/review weekly` shows a 7-day digest: active days, sessions, tasks created/completed, stale list, top project, recurring topics, inbox count.
- **`lib/errors.js`** — append-only error log at `~/.claude/autopilot/errors.log`, rotating at 10 MB. Replaces silent `} catch {}` blocks in `ap-dashboard.js`, `ap-autosave.js`, `ap-userprompt.js`. `autopilot doctor` reads the tail.
- **`cli/autopilot.js`** — standalone CLI with `status`, `list [pending|active|suspended|all]`, `focus set/clear/why`, `stats [days]`, `inbox`, `doctor`, `help`. Symlinked to `~/.local/bin/autopilot` by `install.sh`. Reads installed lib so it works even outside Claude Code (cron-friendly).
- **`test/` + `npm test`** — 38 smoke tests across 4 files (env loader, backlog CRUD, notion property mapping + isEnabled gating, capture-trigger parser including unicode + false-positive guards). All green.
- **README v2** — hero block "what you get in 60 seconds", three killer-feature demos, full slash-command reference, capture-trigger explanation, Notion sync walkthrough, CLI reference, file layout. Old README archived to git history.
- **`docs/QUICKSTART.md`** — five-minute install-to-first-capture walkthrough including Notion enablement and a troubleshooting table.
- **Installer** — copies `lib/errors.js` and `cli/autopilot.js`, creates the `~/.local/bin/autopilot` symlink, prints PATH hint when `~/.local/bin` is missing from `$PATH`, plus a "try `todo first capture test`" tip on success.
- **`package.json`** — proper `bin`, `scripts.test`, `engines.node>=18`. No runtime deps (Notion sync uses native `fetch`).

## v2.0.0-beta1 (2026-04-25)

**Capture triggers, Notion sync, secrets out of code, pixel-agents cleanup.**

- **UserPromptSubmit hook (`hooks/ap-userprompt.js`)** — `todo X`, `не забыть X`, etc. now create pending tasks automatically. Parses `[high]` / `[low]` / `[normal]` priority and `[project-name]` tags inline. Skips shell prefixes (`git`, `npm`, ...) and quoted/backticked occurrences.
- **Notion sync (`lib/notion.js`)** — bi-directional task sync via Notion REST API (no npm dep). Schema discovery: only properties present in the target DB are written; missing ones silently skipped. Stores `notion.page_id` on each task for idempotent updates.
- **Stale-task reminders via Notion** — dashboard now flags tasks aged >14d with no sessions and best-effort bumps `Due = today` in Notion so mobile pushes a notification. Replaces the never-implemented in-process scheduler.
- **`/todo` skill rewired** — creates locally + upserts into Notion in one step, persists `notion.url` back into the task JSON.
- **Secrets out of source** — `lib/lightrag.js` no longer hardcodes a fallback password. Added `lib/env.js`, a zero-dep loader for `~/.claude/autopilot/.env`, and `.env.example`. `install.sh` prompts for `NOTION_TOKEN`, `NOTION_DB_ID`, `LIGHTRAG_PASS` and writes `.env` (chmod 600). `notion_sync.enabled` auto-flips to true if both Notion fields were entered.
- **Wiki path cleanup** — `lib/wiki.js` resolves `WIKI_DIR` to `$HOME/claudecode/wiki` (Galson hub convention) or `$HOME/.claude/autopilot/wiki` instead of the legacy `/root/...` fallback.
- **`scripts/cleanup-pixel-agents.sh`** — surgical jq-based remover for orphan pixel-agents hook entries in `~/.claude/settings.json`. Backs up before writing, refuses to write if any reference remains. Has `--dry-run` and `--remove-dir` flags.
- **Installer** — copies the new lib files (`lightrag.js`, `wiki.js`, `env.js`, `notion.js`) and hook (`ap-userprompt.js`), copies `scripts/` into the install dir, registers UserPromptSubmit in `settings.json`, and prints a heads-up when leftover pixel-agents references are detected.
- **Doc** — `skills/todo/SKILL.md` documents the Notion integration end-to-end (token, DB ID, schema discovery, mobile push reminders).

## v1.3.0 (2026-04-11)

**Mandatory checkpoints, clean summaries, self-updater.**

- **Checkpoint is now mandatory** — Claude writes session summary every 30 tool calls instead of "optionally". This fixes empty/low-quality summaries that made `/back` useless.
- **Git diff filter** — auto-summary no longer includes noise from large uncommitted repos ("621 files changed" is gone). Only diffs with <20 files are included.
- **Self-updater** — `bash ~/.claude/autopilot/update.sh` or `/update` inside Claude Code. Pulls latest from GitHub, preserves config and tasks.
- **Install.sh ships updater** — update.sh is copied during installation.

## v1.2.0 (2026-04-11)

**Memory v2, merged autosave v5, installer fix.**

- **Memory layer v2** — memories are now captured from any substantial session (not just after 3+ sessions). Recurring topic detection matches by project name. Relevant context shows recent memories by creation date instead of requiring access_count >= 2.
- **Autosave v5.1** — merged v5 philosophy (no auto-task creation, tasks only via `/todo`) with memory v2 fixes. No more backlog spam.
- **Installer fix** — replaced blind `find $HOME` repo scan with interactive prompt. Users choose their working directory instead of auto-detecting random repos.
- **Config protection** — dashboard now instructs Claude to never auto-modify config.json.
- **VERSION synced** — install.sh and VERSION file now match.

## v1.1.0 (2026-04-07)

**Cross-host project detection.**

- **Git remote fallback** — `detectProject()` now tries git remote URL when path-based matching fails. Works across different hosts and clones.
- **Autosave v4** — self-accumulating context via `/tmp/autopilot-context-{sessionId}.json`. No longer depends on Claude writing a bridge file.

## v1.0.0 (2026-03-24)

**Initial release.**

- 4 hooks: Dashboard, Statusline, Context Monitor, Autosave
- Memory layer with JSON storage, tags, full-text search
- Session capture with recurring topic detection
- Task backlog with 3-char IDs
- ADHD Protocol: defocus detection, one option, compact output
- `/save` + `/back` session memory
- `/todo` task creation
- Multi-language support (en/ru)
- Internationalized: all code in English, responses in user's language

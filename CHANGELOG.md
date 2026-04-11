# Changelog

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

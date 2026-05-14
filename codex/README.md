# Autopilot for Codex CLI

ADHD Terminal Copilot — Codex port. Same backlog/memory/sessions surface as the Claude Code edition, adapted to a CLI that has no hooks.

## What it is

Codex doesn't expose `SessionStart`, `PostToolUse`, `Stop`, or `StatusLine` hooks. So we replace them with a tripod:

| Layer            | Responsibility                                                  | Lives in                          |
|------------------|-----------------------------------------------------------------|-----------------------------------|
| **Wrapper**      | Cold-open dashboard, heartbeat daemon, trap autosave, orphan recovery | `codex-autopilot` bash            |
| **MCP server**   | Invokable state mid-session — dashboard, save, backlog_add, todo_add, inbox_capture, back, review, update | `autopilot-mcp.js` stdio          |
| **Workflow plugin** | Slash-command UX → expand prompt → call MCP tool             | `~/.codex/.agents/plugins/autopilot-cc/` |

Storage is fully separate from the CC edition: `~/.codex/autopilot/` instead of `~/.claude/autopilot/`. The `lib/` core is shared via symlink — both editions read/write the same modules but with different `AUTOPILOT_HOME`.

## Install

```bash
git clone https://github.com/maximgalson/autopilot-cc ~/projects/autopilot-cc
cd ~/projects/autopilot-cc
./codex/install-codex.sh
```

The installer is idempotent. Re-run it after a `git pull` and it will refresh symlinks, never touch `config.json` or `.env`.

Optional dry-run:

```bash
./codex/install-codex.sh --dry-run
```

After install, edit `~/.codex/autopilot/config.json` (your repos, focus, capture triggers) and optionally `~/.codex/autopilot/.env` (Notion token, LightRAG creds).

## Use

Cold open with dashboard:

```bash
codex-autopilot
```

Same flags as `codex`:

```bash
codex-autopilot exec "review the diff"
codex-autopilot resume
```

If you want every `codex` invocation to go through autopilot:

```bash
# ~/.zshrc or ~/.bashrc
alias codex='codex-autopilot'
```

Inside a Codex session, slash commands work via the workflow plugin:

| Command            | What it does                                                       |
|--------------------|--------------------------------------------------------------------|
| `/save [name]`     | Save current session digest under `~/.codex/autopilot/sessions/`   |
| `/back [name]`     | List saved sessions, or restore one                                |
| `/todo <text>`     | Add a backlog task. Inline `[high]` / `[project-slug]` supported   |
| `/inbox`           | List unprocessed notes in `wiki/inbox/`                            |
| `/review [scope]`  | Surface next_step from recent sessions (`recent` / `weekly`)       |
| `/update`          | `git pull` autopilot-cc repo                                        |

Each slash command resolves to a tool call on the `autopilot` MCP server.

## Storage

```
~/.codex/autopilot/
├── config.json                 # repos, focus, capture_triggers, notion_sync
├── .env                        # NOTION_TOKEN, LIGHTRAG_*  (chmod 600)
├── backlog/task-*.json         # tasks
├── memory/mem-*.json           # long-term memory
├── sessions/                   # session digests
│   ├── current.json            # heartbeat snapshot (live during a session)
│   └── {name}.md               # saved sessions
├── lib/  → ~/projects/autopilot-cc/lib/   (symlink)
├── bin/  → ~/projects/autopilot-cc/codex/bin/   (symlink)
└── mcp/  → ~/projects/autopilot-cc/codex/mcp/   (symlink)
```

## Heartbeat

The wrapper detaches `ap-heartbeat.js` as a background process. Every 6 minutes (configurable via `AUTOPILOT_HEARTBEAT`) it writes an atomic snapshot to `sessions/current.json` — cwd, git branch, dirty count, last activity timestamp.

On clean exit (trap), the wrapper marks `current.json` with `status: "exited"`. If you `kill -9` the wrapper or close the terminal hard, the next session start sees `status: "running"` and offers `codex resume --last`.

## Differences from the Claude Code edition

| Claude Code                            | Codex                                                   |
|----------------------------------------|---------------------------------------------------------|
| SessionStart hook prints dashboard     | Wrapper prints dashboard before `exec codex`            |
| StatusLine (always visible)            | **Not available** in Codex CLI; skip                    |
| PostToolUse → 30-call ContextMonitor   | Time-based heartbeat (6 min, configurable)              |
| Stop hook → autosave                   | `trap EXIT` + heartbeat + manual `/save`                |
| UserPromptSubmit → capture trigger     | Wrapper only; mid-session use `/todo` plugin            |
| `~/.claude/autopilot/`                  | `~/.codex/autopilot/`                                    |

## Uninstall

```bash
./codex/install-codex.sh --uninstall
```

Removes the symlinks, the workflow plugin link, and the MCP server registration. **Data in `~/.codex/autopilot/` is preserved.** Delete it manually if you also want to wipe state.

## Troubleshooting

- **`codex-autopilot: codex CLI not found in PATH`** — install Codex first: `npm i -g @openai/codex` (or the appropriate channel).
- **Dashboard prints but no MCP tools available in session** — re-run installer and check `codex mcp list | grep autopilot`. If empty, the fallback config.toml edit may have skipped — add the `[mcp_servers.autopilot]` block manually (see `install-codex.sh` for the template).
- **Slash commands not registered** — workflow plugin must live at `~/.codex/.agents/plugins/autopilot-cc/`. Check the symlink target and that Codex picks up your local plugin marketplace.
- **Notion sync silent** — verify `NOTION_TOKEN` is set in `~/.codex/autopilot/.env` and `notion_sync.enabled=true` in config.

## License

MIT, same as the Claude Code edition.

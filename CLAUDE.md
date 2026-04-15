# Autopilot CC

> ADHD Terminal Copilot for Claude Code — hooks for session context, memory, and focus management.

## Stack

- **Language:** Bash + Node.js
- **Platform:** Claude Code hooks system
- **License:** MIT (public repo)

## Architecture

4 hooks run inside Claude Code sessions:

| Hook | When | What |
|------|------|------|
| Dashboard | Session start | Shows repos, tasks, focus, suggests next step |
| Statusline | Always visible | Model + active task + context usage bar |
| Context Monitor | Every 30 tool calls | Saves session checkpoint |
| Autosave | Session end | Captures summary + next step |

Plus: memory layer, ADHD Protocol (defocus detection).

## Key Files

| File | Description |
|------|-------------|
| hooks/ | Hook scripts (dashboard, statusline, monitor, autosave) |
| lib/ | Shared utilities |
| install.sh | Installer script |
| config.example.json | Configuration template |
| memory/ | Persistent memory storage |
| backlog/ | Task backlog |
| sessions/ | Session logs |

## Deploy

Not deployed to VPS. Installed locally via:
```bash
bash install.sh
```

## Rules

1. **Never auto-create tasks** — only via explicit /todo or user request
2. **Session summaries are memory, not tasks** — goes to memory logs only
3. **ADHD Protocol is silent** — do not announce defocus detection to user

## Wiki

Project page: [[projects/autopilot-cc]]

Related:
- [[feedback/one-task-one-window]]
- [[decisions/no-auto-tasks]]

> Wiki: ~/claudecode/.wiki/ | Update wiki page after significant changes.

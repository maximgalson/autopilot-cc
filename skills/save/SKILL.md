---
name: save
description: "Save current session before closing terminal. /save or /save dashboard"
$ARGUMENTS: "Optional: session name. If omitted, auto-detect from conversation context."
---

# /save -- Save Session

One command -- and you can close the terminal.

## Algorithm

### 1. Determine session name

**If `$ARGUMENTS` provided** -- use as filename (e.g. `dashboard` -> `~/.claude/autopilot/sessions/dashboard.md`).

**If not** -- detect from conversation context:

| Keywords | Session name |
|----------|-------------|
| bot, webhook, deploy | `bot` |
| site, article, SEO, landing | `site` |
| course, lesson, module | `course` |
| skill, agent, constructor | `factory` |
| launch, warmup, webinar | `launch` |
| dashboard, CRM, panel | `dashboard` |

If unclear -- ask: "Session name?"

### 2. Collect snapshot

Analyze conversation and extract:
- **summary**: what was done (1-2 lines)
- **result**: concrete result (files, decisions, outputs)
- **next_step**: what to do next
- **blockers**: what's blocking (if any)

### 3. Write file

Overwrite `~/.claude/autopilot/sessions/{name}.md`:

```markdown
---
session: {name}
updated: {YYYY-MM-DD}
---
Done: {summary}
Result: {result}
Next step: {next_step}
Blockers: {blockers or "none"}
```

**CRITICAL: Max 8 lines of content.** Full overwrite. No history -- it lives in git.

### 4. Notion sync (optional)

Read `~/.claude/autopilot/config.json`. If `notion_sync.enabled` is true and `notion_sync.sessions_page_id` exists:
- Fetch the Notion page
- Find or add row in the sessions table
- Format: `| {name} | {summary short} |`

If Notion is not configured -- skip silently.

### 5. Confirm (3 lines max)

```
Session "{name}" saved.
Next step: {next_step}
Close the terminal.
```

## Rules

- Don't ask for confirmation -- just save
- Keep it brief
- Session file = snapshot, not a log
- Old data is overwritten, not accumulated

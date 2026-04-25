---
name: todo
description: Create a task with full context in a local MD file. Use when user says /todo followed by a task description.
user_invocable: true
---

# /todo — Create Task

Creates a task as a markdown file in `~/.claude/autopilot/tasks/`. AI-friendly format with context, next steps, and work log.

## Usage

```
/todo Fix the webhook verification
/todo [high] Deploy new version to VPS
/todo [my-project] Refactor auth module
```

## Parsing

- Text after /todo = task title
- `[high]` or `[low]` = priority (default: normal)
- `[project-name]` = project (auto-detected from cwd if not given)

## What To Do

### 1. Generate ID and slug

- ID: 3 random chars (a-z0-9)
- Slug: title → lowercase, spaces to dashes, max 40 chars

### 2. Create MD file

Write `~/.claude/autopilot/tasks/{slug}.md`:

```markdown
---
id: {id}
title: {title}
status: backlog
priority: {priority}
project: {project}
created: {YYYY-MM-DD}
---

# {title}

## Context
{What needs to be done — use current conversation context}

## Next Step
{First concrete action}

## Log
- {YYYY-MM-DD} — Created
```

### 3. Create backlog entry + sync to Notion (if enabled)

```bash
node -e "
(async () => {
  try { require('$HOME/.claude/autopilot/lib/env').load(); } catch {}
  const bl = require('$HOME/.claude/autopilot/lib/backlog.js');
  const notion = require('$HOME/.claude/autopilot/lib/notion.js');
  const task = bl.createTask({ title: 'TITLE', project: 'PROJECT', priority: 'PRIORITY', source: 'manual' });
  if (notion.isEnabled()) {
    const res = await notion.upsertTask(task);
    if (res?.page_id) bl.updateTask(task.id, { notion: { page_id: res.id || res.page_id, url: res.url, last_synced: new Date().toISOString() } });
    console.log(JSON.stringify({ id: task.id, notion: res?.url || null }));
  } else {
    console.log(JSON.stringify({ id: task.id, notion: null }));
  }
})();
"
```

### 4. Confirm

```
Task #{id}: {title}
  File: ~/.claude/autopilot/tasks/{slug}.md
  Priority: {priority}
  Project: {project}
  Notion: {url}                  # only if notion_sync.enabled
```

If `notion.isEnabled()` returned false, omit the Notion line. If sync failed
(stderr line starting with `[autopilot:notion]`), still confirm task creation
locally — Notion sync is best-effort.

## Updating Tasks

When returning to a task:
- Read the MD file for context
- Update Status (backlog → active → done)
- Append to Log section
- Update Next Step

## Notion Integration

Auto-enabled when `config.notion_sync.enabled: true` and `NOTION_TOKEN`/`NOTION_DB_ID`
are present in `~/.claude/autopilot/.env`. Set both during `bash install.sh`, or
edit the files manually and restart Claude Code.

`lib/notion.js` performs schema discovery against the target Notion database
on first use, so the integration only requires a `title` property — every
other field (Status, Priority, Project, Due, Tags) is mapped if present and
silently skipped otherwise. The `notion.page_id` returned by Notion is stored
back into the task JSON so subsequent updates patch the same page.

For stale-task reminders, dashboard's SessionStart hook calls
`notion.markStaleTasksOverdue()` which sets `Due = today` on tasks older than
14 days — Notion mobile then pushes a notification.

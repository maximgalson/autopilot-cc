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

### 3. Create backlog entry

```bash
node -e "
const bl = require('$HOME/.claude/autopilot/lib/backlog.js');
bl.createTask({ title: 'TITLE', project: 'PROJECT', priority: 'PRIORITY', source: 'manual' });
"
```

### 4. Confirm

```
Task #{id}: {title}
  File: ~/.claude/autopilot/tasks/{slug}.md
  Priority: {priority}
  Project: {project}
```

## Updating Tasks

When returning to a task:
- Read the MD file for context
- Update Status (backlog → active → done)
- Append to Log section
- Update Next Step

## Notion Integration (optional)

If `notion_sync.enabled: true` in config.json, also create a page in your Notion database. See config.json for database_id and API setup.

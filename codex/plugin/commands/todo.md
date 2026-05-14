---
name: todo
description: Create a backlog task and sync to Notion. Supports inline [priority] and [project] tags in the title.
arguments:
  - name: text
    description: Task title (free-form). Use [high|low|normal] for priority, [project-slug] to pin to a repo.
    required: true
---

Call the `autopilot.todo_add` MCP tool with `text: "$1"`.

The tool will:
- Parse inline `[high|low|normal]` priority tags
- Parse inline `[project-slug]` to bind the task to a repo
- Fall back to detecting the project from the current working directory
- Create the task in `~/.codex/autopilot/backlog/`
- Sync to Notion if `notion_sync.enabled=true` and `NOTION_TOKEN` is set

Acknowledge in one short line ("Created #<id> '<title>'…"). Do not invent extra fields.

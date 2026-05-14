---
name: review
description: Surface next_step from recent sessions so you can pick what to do next.
arguments:
  - name: scope
    description: "recent" (default, last 5 sessions) or "weekly" (7-day digest)
    required: false
---

Call the `autopilot.review` MCP tool.

- If "$1" is "weekly", pass `scope: "weekly"`.
- Otherwise, omit the argument (the server defaults to `recent`).

Present the tool output as-is. If any session has a `next:` line, ask the user whether they want to resume that thread or start something new.

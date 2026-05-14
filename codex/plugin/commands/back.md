---
name: back
description: Return to a saved Codex session. With no name → list recent sessions. With name → restore that session's context.
arguments:
  - name: name
    description: Session name to restore (omit to list)
    required: false
---

Call the `autopilot.back` MCP tool.

- If "$1" is provided and non-empty, pass `name: "$1"`. The tool returns the full session digest — present it verbatim to the user and ask if they want to resume that work.
- Otherwise, call with no arguments. The tool returns a list of saved sessions. Show the list and ask the user which one to restore.

Do not paraphrase or summarize the tool output — return it directly.

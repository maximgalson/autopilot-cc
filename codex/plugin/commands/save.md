---
name: save
description: Save the current Codex session as a digest in ~/.codex/autopilot/sessions/. Optional name for the snapshot.
arguments:
  - name: name
    description: Optional label for the saved session
    required: false
---

You must save the current session NOW. Do not skip this step.

Call the `autopilot.save` MCP tool with these arguments:
- `name`: "$1" if provided, otherwise omit (server will auto-generate a timestamp label)
- `summary`: a one-line summary of what was accomplished in THIS session, written by you based on the conversation
- `next_step`: a concrete next action the user should take when they return

Return only the saved file path that the tool reports — no extra commentary.

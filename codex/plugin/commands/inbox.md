---
name: inbox
description: List unprocessed notes in the wiki inbox (Telegram/voice/quick-capture).
---

Call the `autopilot.inbox_capture` MCP tool with no arguments.

The tool returns a listing of files in `wiki/inbox/`. Present the list verbatim and, for each note, briefly suggest a destination (a project page, a decision/feedback/reference, or skip). Do not move files yourself unless the user asks.

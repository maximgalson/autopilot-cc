---
name: update
description: Self-update autopilot-cc — git pull in the repo, preserves config and env.
---

Call the `autopilot.update` MCP tool with no arguments.

The tool runs `git pull --ff-only` in the autopilot-cc repository. Report the git output verbatim. If it fails, surface the error message so the user can investigate — do not retry silently and do not run other git commands on their behalf.

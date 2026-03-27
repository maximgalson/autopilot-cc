---
name: back
description: "Return to a saved session. /back or /back dashboard"
$ARGUMENTS: "Optional: session name for direct return"
---

# /back -- Return to Session

## Algorithm

### 1. With argument

Read `~/.claude/autopilot/sessions/{$ARGUMENTS}.md`.

If found:
```
Last time ({date}): {summary}
Next step: {next_step}
Continue?
```

If not found: "Session '{$ARGUMENTS}' not found. Run /back to see all sessions."

### 2. Without argument

Glob `~/.claude/autopilot/sessions/*.md`
Read each file (they're small, max 8 lines).

Show table:

```
| Session | Updated | Next step |
|---------|---------|-----------|
```

Sorted by date (newest first).

Ask: "Which one?"

### 3. Continue work

After selection -- show the context and continue working. No automatic skill invocation.

## Rules

- Max 1 screen of output
- If no sessions: "No saved sessions. Work on something and run /save."

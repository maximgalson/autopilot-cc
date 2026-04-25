---
name: inbox
description: "Sweep wiki/inbox/ — list pending notes, suggest a destination folder per file, optionally process them interactively. /inbox or /inbox process."
$ARGUMENTS: "Optional: 'process' to walk files interactively. Default: list-only."
user_invocable: true
---

# /inbox — Wiki Inbox Processor

Wiki inbox (`~/claudecode/wiki/inbox/`) collects loose notes from Telegram, brain dumps, links. They drift if nobody routes them. This skill walks the inbox and helps you triage.

## Default mode: list

```
/inbox
```

For each `.md` file in `~/claudecode/wiki/inbox/`:
1. Read the first 5 lines (title + start of body) so you can recognize what it is.
2. Compute age in days (`now - mtime`).
3. Suggest a destination based on filename / first line:

| Filename or first line contains            | Suggested folder      |
|--------------------------------------------|-----------------------|
| `decision`, `решил`, `выбрал`              | `wiki/decisions/`     |
| `feedback`, `правило`, `правка`            | `wiki/feedback/`      |
| `client`, `клиент`                         | `wiki/clients/`       |
| `tool`, `mcp`, `api`, `скрипт`             | `wiki/references/`    |
| anything else                              | `wiki/projects/`      |

Output (one per file, ADHD-compact):
```
inbox/2026-04-16-karpathy-llm-wiki.md (9d) → projects/
inbox/dream-report-20260416.md (9d) → references/
inbox/links.md (9d) → references/
```

End with: "Run `/inbox process` to triage interactively, or move them yourself."

## Interactive mode: process

```
/inbox process
```

Walk files **one by one**. For each:

1. Show: filename, age, first 5 lines, suggested folder.
2. Ask the user (compact, one question, four choices):
   ```
   Move to {suggested}? (y) | Different folder (d) | Skip (s) | Delete (x)
   ```
3. Apply the action:
   - **y** → `mv ~/claudecode/wiki/inbox/{file} ~/claudecode/wiki/{folder}/{file}`. Touch the file's `updated:` frontmatter to today.
   - **d** → ask the user which folder, then move there.
   - **s** → leave in inbox, continue.
   - **x** → delete (confirm with explicit "yes"). This is destructive — never default to it.
4. After all files: report `Moved N, skipped M, deleted K. Inbox now has Q files.`

If the inbox is empty: `Inbox is clean.`

## Implementation notes

- Inbox path: `${WIKI_DIR:-$HOME/claudecode/wiki}/inbox/` — respect `WIKI_DIR` env, same convention as `lib/wiki.js`.
- Use `Bash` with `ls -1t` to get newest-first ordering.
- Use `Read` for the file head, not `cat`.
- Use `Bash mv` for moves; never overwrite a same-name file in destination — append `-1`, `-2` if collision.
- Don't auto-create folders; if the suggested folder doesn't exist, ask the user.

## ADHD guardrails

- **Compact output, one option recommended.** The four-choice prompt has the suggested action first.
- **Never auto-move** in default mode — only suggest. The user decides.
- **Destructive (delete) requires explicit confirm.** No silent rm.
- **Don't lecture.** If the user always picks "skip", just keep going. No "you should really process these" guilt.

## Example

```
> /inbox

inbox/2026-04-16-karpathy-llm-wiki.md (9d) → projects/
inbox/2026-04-16-trendforest.md (9d) → projects/
inbox/dream-report-20260416.md (9d) → references/
inbox/links.md (9d) → references/
inbox/mac-obsidian-setup.md (9d) → references/

5 files in inbox. Run `/inbox process` to triage.
```

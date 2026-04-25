---
name: review
description: "Post-session review: list last N session digests with their next_step and turn surviving next_steps into tasks. /review or /review weekly."
$ARGUMENTS: "Optional: 'weekly' for a 7-day digest with stats. Default: last 5 sessions."
user_invocable: true
---

# /review — Post-Session Review

Each session writes a `next_step` field via the autosave hook. Without review, those next_steps die in JSON. This skill resurrects them: scan the last N sessions, ask which still matter, and convert the survivors into proper tasks.

## Default mode: last 5 sessions

```
/review
```

1. Read `~/.claude/autopilot/sessions/` — the most recent files (one per day, JSON arrays).
2. Flatten and take the **last 5 entries** (newest first).
3. For each entry, render:
   ```
   {date} #{session_id_short}: {summary} [{project}]
     → next: {next_step or "—"}
   ```
4. After the list, ask the user (one prompt, ADHD-compact):
   ```
   For each next_step above: done (d) / convert to /todo (t) / ignore (i)
   Reply with row numbers or "all done" / "all ignore".
   ```
5. Convert chosen rows:
   - **t** → call `lib/backlog.createTask({ title: <next_step>, project, source: 'review' })` and, if Notion enabled, `lib/notion.upsertTask`.
   - **d** / **i** → no-op (just stop showing them again — store reviewed timestamp on the session entry).

Skip sessions where `next_step` is empty or "—".

## Weekly mode

```
/review weekly
```

Show a 7-day digest (ADHD-friendly metrics, no shaming):

```
Last 7 days
  Active days:        4 / 7   (normal for ADHD: anything above 50% is fine)
  Sessions:           18
  Tasks created:      6 (3 manual + 3 captured)
  Tasks completed:    2
  Stale tasks:        2 (#m4k 31d, #blotato-research 20d) — see /todo dashboard
  Top project:        claudecode (8 sessions)
  Recurring topics:   3 (mark via [RECURRING] in dashboard)
  Inbox notes:        5 (run /inbox to triage)
```

Then ask: "Anything to convert into a task or focus on next week?"

Stats source:
- Active days, Sessions, Top project: scan `~/.claude/autopilot/sessions/*.json`.
- Tasks created/completed: scan `~/.claude/autopilot/backlog/*.json` (filter by `created` and `status`).
- Stale: same logic as `ap-dashboard.js` Stale block (created > 14d, sessions_count == 0, status != done).
- Recurring: count sessions where `_recurring: true` in the last 7 days.
- Inbox: count of `.md` files in `${WIKI_DIR}/inbox/`.

## Implementation

Use this Node snippet to gather stats (run via `Bash`):

```bash
node -e "
(async () => {
  try { require('$HOME/.claude/autopilot/lib/env').load(); } catch {}
  const fs = require('fs'); const path = require('path');
  const memory = require('$HOME/.claude/autopilot/lib/memory.js');
  const backlog = require('$HOME/.claude/autopilot/lib/backlog.js');

  const days = parseInt(process.argv[1] || '7', 10);
  const sessions = memory.getRecentSessions(days);
  const tasks = backlog.getAllTasks();
  const now = Date.now();
  const cutoffMs = now - 14 * 86400000;

  const active = new Set(sessions.map(s => (s.timestamp || '').slice(0, 10))).size;
  const created = tasks.filter(t => Date.parse(t.created) > now - days*86400000).length;
  const completed = tasks.filter(t => t.status === 'done' && Date.parse(t.updated) > now - days*86400000).length;
  const stale = tasks.filter(t =>
    t.status !== 'done' && (t.sessions_count || 0) === 0 && Date.parse(t.created) < cutoffMs
  );
  const projCounts = {};
  for (const s of sessions) projCounts[s.project || '?'] = (projCounts[s.project || '?'] || 0) + 1;
  const topProj = Object.entries(projCounts).sort((a,b) => b[1] - a[1])[0];
  const recurring = sessions.filter(s => s._recurring).length;

  console.log(JSON.stringify({
    active_days: active,
    sessions: sessions.length,
    tasks_created: created,
    tasks_completed: completed,
    stale: stale.map(t => ({ id: t.id, title: t.title, age_days: Math.floor((now - Date.parse(t.created)) / 86400000) })),
    top_project: topProj ? { name: topProj[0], count: topProj[1] } : null,
    recurring
  }));
})();
" 7
```

## ADHD guardrails

- **Past 7 days only by default.** Don't dump a year of sessions.
- **Done/Convert/Ignore — three options, no fourth.** "Maybe" is just `i` (ignore).
- **No shaming on stale/incomplete.** Just report and offer to act.
- **Compact output** — one line per session in default mode, one number per metric in weekly.
- **The user, not the skill, decides what's worth keeping.** No auto-archive.

#!/usr/bin/env node
// Autopilot Autosave v3.0.0
// Stop hook — smart capture: update existing tasks, create only when needed

const fs = require('fs');
const os = require('os');
const path = require('path');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 5000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const sessionId = data.session_id || '';
    const cwd = data.cwd || process.cwd();
    const tmpDir = os.tmpdir();

    const backlog = require('../lib/backlog');
    const memory = require('../lib/memory');

    // Read bridge file
    let workContext = null;
    const workPath = path.join(tmpDir, `autopilot-work-${sessionId}.json`);
    if (fs.existsSync(workPath)) {
      try { workContext = JSON.parse(fs.readFileSync(workPath, 'utf8')); } catch {}
    }

    const project = detectProject(cwd);
    const active = backlog.getActive();

    // --- Case 1: Active task exists → update it ---
    if (active) {
      const snapshot = active.context_snapshot || {};
      if (workContext) {
        snapshot.summary = workContext.summary || snapshot.summary;
        snapshot.next_step = workContext.next_step || snapshot.next_step;
        snapshot.files_touched = workContext.files_touched || snapshot.files_touched;
      }
      snapshot.cwd = cwd;
      const sessions = (active.sessions_count || 0) + 1;
      backlog.updateTask(active.id, { sessions_count: sessions });
      backlog.suspendTask(active.id, snapshot);

      // Long-term memory after 3+ sessions
      if (sessions >= 3) {
        try { memory.captureFromTask({ ...active, sessions_count: sessions, context_snapshot: snapshot }); } catch {}
      }

      // Always log session
      if (workContext?.summary) {
        memory.saveSession({ summary: workContext.summary, project, details: snapshot, session_id: sessionId });
      }
      cleanup(workPath);
      return;
    }

    // No active task — need to decide what to do with this session
    if (!workContext?.summary) { cleanup(workPath); return; }

    const summary = workContext.summary;
    const snapshot = {
      cwd,
      summary,
      next_step: workContext.next_step || '',
      files_touched: workContext.files_touched || []
    };

    // Always log to sessions
    const sessionEntry = memory.saveSession({ summary, project, details: snapshot, session_id: sessionId });

    // --- Case 2: Matches existing suspended/pending task → update it ---
    const match = findMatchingTask(summary, project, backlog);
    if (match) {
      const sessions = (match.sessions_count || 0) + 1;
      backlog.updateTask(match.id, {
        sessions_count: sessions,
        context_snapshot: snapshot
      });
      // Keep its current status (suspended/pending), don't change
      cleanup(workPath);
      return;
    }

    // --- Case 3: Recurring topic (2+ similar sessions in 7 days) → create task ---
    if (sessionEntry?._recurring) {
      backlog.createTask({
        title: summary.slice(0, 80),
        project,
        source: 'auto-recurring',
        priority: 'normal',
        tags: ['recurring'],
        context_snapshot: snapshot
      });
      cleanup(workPath);
      return;
    }

    // --- Case 4: Substantial session (has next_step = unfinished work) → create task ---
    if (workContext.next_step && workContext.next_step.length > 10) {
      backlog.createTask({
        title: summary.slice(0, 80),
        project,
        source: 'auto',
        priority: 'normal',
        context_snapshot: snapshot
      });
      cleanup(workPath);
      return;
    }

    // --- Case 5: Small session (no next_step) → sessions log only, no task ---
    // Already saved to sessions above, nothing more to do.
    cleanup(workPath);

  } catch (e) {
    // Silent fail
  }
});

function cleanup(workPath) {
  try { if (fs.existsSync(workPath)) fs.unlinkSync(workPath); } catch {}
}

function detectProject(cwd) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
    for (const [name, repo] of Object.entries(config.repos || {})) {
      if (cwd.startsWith(repo.path)) return name;
    }
  } catch {}
  return null;
}

function findMatchingTask(summary, project, backlog) {
  const tasks = backlog.getAllTasks().filter(t => t.status !== 'done');
  if (!tasks.length) return null;

  const words = summary.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  let best = null;
  let bestScore = 0;

  for (const task of tasks) {
    const text = [
      task.title || '',
      task.context_snapshot?.summary || '',
      task.project || ''
    ].join(' ').toLowerCase();

    let score = 0;
    for (const w of words) {
      if (text.includes(w)) score++;
    }
    // Boost same project
    if (project && task.project === project) score += 2;

    if (score > bestScore) {
      bestScore = score;
      best = task;
    }
  }

  // Need at least 30% word overlap or 3 matches + same project
  const threshold = Math.max(2, Math.floor(words.length * 0.3));
  return bestScore >= threshold ? best : null;
}

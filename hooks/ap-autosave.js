#!/usr/bin/env node
// Autopilot Autosave v2.0.0
// Stop hook — captures every session, promotes recurring ones to long-term memory

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

    // Read bridge file with work context (written by Claude during session)
    let workContext = null;
    const workPath = path.join(tmpDir, `autopilot-work-${sessionId}.json`);
    if (fs.existsSync(workPath)) {
      try {
        workContext = JSON.parse(fs.readFileSync(workPath, 'utf8'));
      } catch (e) {}
    }

    // Check for active task
    const active = backlog.getActive();

    if (active) {
      // Suspend active task with context
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

      // Auto-capture to long-term memory if recurring (3+ sessions)
      if (sessions >= 3) {
        try {
          memory.captureFromTask({ ...active, sessions_count: sessions, context_snapshot: snapshot });
        } catch (e) {}
      }
    } else if (workContext && workContext.summary) {
      // No active task but work was done — always capture as session log
      const project = detectProject(cwd);
      const snapshot = {
        cwd,
        summary: workContext.summary,
        next_step: workContext.next_step || '',
        files_touched: workContext.files_touched || []
      };

      // Save to session log (lightweight, always)
      memory.saveSession({
        summary: workContext.summary,
        project,
        details: snapshot,
        session_id: sessionId
      });

      // Also create suspended task so dashboard picks it up
      const task = backlog.createTask({
        title: workContext.summary.slice(0, 80),
        project,
        source: 'auto',
        context_snapshot: snapshot
      });
      if (task) backlog.updateTask(task.id, { status: 'suspended' });
    }

    // Cleanup temp files
    try { if (fs.existsSync(workPath)) fs.unlinkSync(workPath); } catch (e) {}

  } catch (e) {
    // Silent fail — never block session end
  }
});

function detectProject(cwd) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
    for (const [name, repo] of Object.entries(config.repos || {})) {
      if (cwd.startsWith(repo.path)) return name;
    }
  } catch (e) {}
  return null;
}

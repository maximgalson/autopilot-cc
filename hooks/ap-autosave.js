#!/usr/bin/env node
// Autopilot Autosave v4.0.0
// Stop hook — reads self-accumulated context + optional Claude bridge + git diff
// v4.0 change: no longer depends on Claude writing the bridge file.
// Primary source: /tmp/autopilot-context-{sessionId}.json (written by PostToolUse hook)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

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

    // --- Primary source: self-accumulated context ---
    let accumulated = null;
    const ctxPath = path.join(tmpDir, `autopilot-context-${sessionId}.json`);
    if (fs.existsSync(ctxPath)) {
      try { accumulated = JSON.parse(fs.readFileSync(ctxPath, 'utf8')); } catch {}
    }

    // --- Bonus source: Claude-written bridge file ---
    let workContext = null;
    const workPath = path.join(tmpDir, `autopilot-work-${sessionId}.json`);
    if (fs.existsSync(workPath)) {
      try { workContext = JSON.parse(fs.readFileSync(workPath, 'utf8')); } catch {}
    }

    // --- Bonus source: git diff ---
    let gitSummary = '';
    try {
      gitSummary = execSync('git diff --stat HEAD 2>/dev/null | tail -1', {
        cwd, timeout: 3000, encoding: 'utf8'
      }).trim();
    } catch {}

    // If truly nothing happened, bail
    if (!accumulated && !workContext && !gitSummary) {
      cleanup(ctxPath, workPath);
      return;
    }

    // --- Build merged snapshot ---
    const files = unique([
      ...(workContext?.files_touched || []),
      ...(accumulated?.files_touched || [])
    ]);

    const summary = workContext?.summary || buildAutoSummary(accumulated, files, gitSummary);
    const nextStep = workContext?.next_step || '';

    const snapshot = {
      cwd,
      summary,
      next_step: nextStep,
      files_touched: files,
      commands_run: accumulated?.commands_run || [],
      git_summary: gitSummary,
      tool_count: accumulated?.tool_count || 0
    };

    const project = detectProject(cwd);
    const active = backlog.getActive();

    // --- Case 1: Active task exists → update it ---
    if (active) {
      const existing = active.context_snapshot || {};
      const mergedSnapshot = {
        ...existing,
        ...snapshot,
        summary: workContext?.summary || snapshot.summary || existing.summary,
        next_step: nextStep || existing.next_step || ''
      };
      const sessions = (active.sessions_count || 0) + 1;
      backlog.updateTask(active.id, { sessions_count: sessions });
      backlog.suspendTask(active.id, mergedSnapshot);

      // Long-term memory after 3+ sessions
      if (sessions >= 3) {
        try { memory.captureFromTask({ ...active, sessions_count: sessions, context_snapshot: mergedSnapshot }); } catch {}
      }

      memory.saveSession({ summary: mergedSnapshot.summary, project, details: mergedSnapshot, session_id: sessionId });
      cleanup(ctxPath, workPath);
      return;
    }

    // Skip creating trivial sessions (no files touched, no substantial commands)
    if (files.length === 0 && (accumulated?.commands_run?.length || 0) < 2 && !workContext?.summary) {
      cleanup(ctxPath, workPath);
      return;
    }

    // Always log to sessions
    const sessionEntry = memory.saveSession({ summary, project, details: snapshot, session_id: sessionId });

    // --- Case 2: Matches existing suspended/pending task → update it ---
    const match = findMatchingTask(summary, project, files, backlog);
    if (match) {
      const sessions = (match.sessions_count || 0) + 1;
      backlog.updateTask(match.id, {
        sessions_count: sessions,
        context_snapshot: snapshot
      });
      cleanup(ctxPath, workPath);
      return;
    }

    // --- Case 3: Recurring topic → create task ---
    if (sessionEntry?._recurring) {
      backlog.createTask({
        title: summary.slice(0, 80),
        project,
        source: 'auto-recurring',
        priority: 'normal',
        tags: ['recurring'],
        context_snapshot: snapshot
      });
      cleanup(ctxPath, workPath);
      return;
    }

    // --- Case 4: Substantial session (Claude gave next_step OR many files) → create task ---
    if ((nextStep && nextStep.length > 10) || files.length >= 3) {
      backlog.createTask({
        title: summary.slice(0, 80),
        project,
        source: 'auto',
        priority: 'normal',
        context_snapshot: snapshot
      });
      cleanup(ctxPath, workPath);
      return;
    }

    // --- Case 5: Small session → sessions log only ---
    cleanup(ctxPath, workPath);

  } catch (e) {
    // Silent fail
  }
});

function cleanup(...paths) {
  for (const p of paths) {
    try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch {}
  }
}

function unique(arr) {
  return [...new Set(arr)];
}

function buildAutoSummary(acc, files, gitSummary) {
  if (!acc && !gitSummary) return 'Session (no activity captured)';
  const parts = [];
  if (files.length > 0) {
    const basenames = files.slice(0, 3).map(f => path.basename(f));
    const more = files.length > 3 ? ` +${files.length - 3} more` : '';
    parts.push(`Edited ${files.length} file${files.length > 1 ? 's' : ''} (${basenames.join(', ')}${more})`);
  }
  if (acc?.commands_run?.length > 0) {
    parts.push(`${acc.commands_run.length} commands`);
  }
  if (acc?.tool_count) {
    parts.push(`${acc.tool_count} tool calls`);
  }
  if (gitSummary) {
    parts.push(gitSummary);
  }
  return parts.join(' · ') || 'Session';
}

function detectProject(cwd) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
    const repos = config.repos || {};

    // 1. Try path match (fast, host-specific)
    for (const [name, repo] of Object.entries(repos)) {
      if (repo.path && cwd.startsWith(repo.path)) return name;
    }

    // 2. Try git remote match (works on any host/clone)
    let remote = '';
    try {
      remote = execSync('git remote get-url origin 2>/dev/null', {
        cwd, timeout: 2000, encoding: 'utf8'
      }).trim().toLowerCase();
    } catch {}

    if (remote) {
      for (const [name, repo] of Object.entries(repos)) {
        if (repo.remote && remote.includes(repo.remote.toLowerCase())) return name;
      }
    }
  } catch {}
  return null;
}

function findMatchingTask(summary, project, files, backlog) {
  const tasks = backlog.getAllTasks().filter(t => t.status !== 'done');
  if (!tasks.length) return null;

  const words = summary.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const basenames = files.map(f => path.basename(f).toLowerCase());
  let best = null;
  let bestScore = 0;

  for (const task of tasks) {
    const text = [
      task.title || '',
      task.context_snapshot?.summary || '',
      (task.context_snapshot?.files_touched || []).join(' '),
      task.project || ''
    ].join(' ').toLowerCase();

    let score = 0;
    for (const w of words) if (text.includes(w)) score++;
    for (const b of basenames) if (text.includes(b)) score += 2;
    if (project && task.project === project) score += 2;

    if (score > bestScore) {
      bestScore = score;
      best = task;
    }
  }

  const threshold = Math.max(3, Math.floor(words.length * 0.3));
  return bestScore >= threshold ? best : null;
}

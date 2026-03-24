#!/usr/bin/env node
// Autopilot Statusline v1.0.0
// Shows: model | active task or dir | context usage bar

const fs = require('fs');
const path = require('path');
const os = require('os');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const model = data.model?.display_name || 'Claude';
    const dir = data.workspace?.current_dir || process.cwd();
    const session = data.session_id || '';
    const remaining = data.context_window?.remaining_percentage;

    // Context window display
    // Claude Code reserves ~16.5% for autocompact buffer
    const AUTO_COMPACT_BUFFER_PCT = 16.5;
    let ctx = '';
    if (remaining != null) {
      const usableRemaining = Math.max(0, ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100);
      const used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));

      // Write bridge file for context-monitor
      if (session) {
        try {
          const bridgePath = path.join(os.tmpdir(), `claude-ctx-${session}.json`);
          fs.writeFileSync(bridgePath, JSON.stringify({
            session_id: session,
            remaining_percentage: remaining,
            used_pct: used,
            timestamp: Math.floor(Date.now() / 1000)
          }));
        } catch (e) {}
      }

      const filled = Math.floor(used / 10);
      const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);

      if (used < 50) {
        ctx = ` \x1b[32m${bar} ${used}%\x1b[0m`;
      } else if (used < 65) {
        ctx = ` \x1b[33m${bar} ${used}%\x1b[0m`;
      } else if (used < 80) {
        ctx = ` \x1b[38;5;208m${bar} ${used}%\x1b[0m`;
      } else {
        ctx = ` \x1b[5;31m${bar} ${used}%\x1b[0m`;
      }
    }

    // Active task from autopilot backlog
    let task = '';
    try {
      const backlog = require('../lib/backlog');
      const active = backlog.getActive();
      if (active) task = `#${active.id} ${active.title}`;
    } catch (e) {}

    // Fallback: check Claude Code todos
    if (!task) {
      const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
      const todosDir = path.join(claudeDir, 'todos');
      if (session && fs.existsSync(todosDir)) {
        try {
          const files = fs.readdirSync(todosDir)
            .filter(f => f.startsWith(session) && f.includes('-agent-') && f.endsWith('.json'))
            .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir, f)).mtime }))
            .sort((a, b) => b.mtime - a.mtime);
          if (files.length > 0) {
            const todos = JSON.parse(fs.readFileSync(path.join(todosDir, files[0].name), 'utf8'));
            const inProgress = todos.find(t => t.status === 'in_progress');
            if (inProgress) task = inProgress.activeForm || '';
          }
        } catch (e) {}
      }
    }

    // Truncate task to fit
    if (task.length > 40) task = task.slice(0, 37) + '...';

    const dirname = path.basename(dir);
    if (task) {
      process.stdout.write(`\x1b[2m${model}\x1b[0m \x1b[2m|\x1b[0m \x1b[1m${task}\x1b[0m \x1b[2m|\x1b[0m \x1b[2m${dirname}\x1b[0m${ctx}`);
    } else {
      process.stdout.write(`\x1b[2m${model}\x1b[0m \x1b[2m|\x1b[0m \x1b[2m${dirname}\x1b[0m${ctx}`);
    }
  } catch (e) {
    // Silent fail
  }
});

#!/usr/bin/env node
// Autopilot Dashboard v1.2.0
// SessionStart hook — shows repo status, pending tasks, suggests next action.
// v1.2 adds: Notion stale-task reminders (Due=today on Notion mobile),
// and a local Stale block for tasks aged >14d so the user sees them in chat.

const fs = require('fs');
const path = require('path');
try { require('../lib/env').load(); } catch {}

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 8000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', async () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);

    const configPath = path.join(__dirname, '..', 'config.json');
    if (!fs.existsSync(configPath)) process.exit(0);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const repos = require('../lib/repos');
    const backlog = require('../lib/backlog');
    const format = require('../lib/format');

    // Get all repo statuses
    const repoStatuses = repos.getAllRepoStatuses(config);

    // Get all non-done tasks
    const allTasks = backlog.getAllTasks().filter(t => t.status !== 'done');

    // Build dashboard
    const dashboard = format.formatDashboard(repoStatuses, allTasks, config);

    // Build routing summary
    const routingLines = [];
    for (const [name, repo] of Object.entries(config.repos)) {
      const kw = (repo.keywords || []).slice(0, 4).join(', ');
      const targets = [];
      if (repo.agents?.length) targets.push(`agents: ${repo.agents.join(', ')}`);
      if (repo.skills?.length) targets.push(`skills: ${repo.skills.join(', ')}`);
      routingLines.push(`  ${name}: [${kw}] -> ${targets.join(', ') || 'direct'}`);
    }

    // Focus block — only show as context, never impose on current work
    const focusLines = [];
    if (config.focus?.current) {
      // Detect current project from cwd
      const cwd = data.cwd || process.cwd();
      let currentProject = null;
      for (const [name, repo] of Object.entries(config.repos || {})) {
        if (cwd.startsWith(repo.path)) { currentProject = name; break; }
      }

      // Show focus as FYI, not as directive
      focusLines.push('Global focus (FYI): ' + config.focus.current + (config.focus.why ? ' (' + config.focus.why + ')' : ''));
      if (currentProject) {
        focusLines.push('Current project (from cwd): ' + currentProject);
      }
    }

    // No tasks in backlog message
    const noTasksMsg = allTasks.length === 0 ? '\nNo tasks in backlog. Ready for new work.\n' : '';

    // LightRAG context — knowledge graph insights for current project
    const graphLines = [];
    try {
      const lightrag = require('../lib/lightrag');
      const cwd = data.cwd || process.cwd();
      // Detect project name for targeted query
      let projectName = 'current work';
      for (const [name, repo] of Object.entries(config.repos || {})) {
        if (repo.path && cwd.startsWith(repo.path)) { projectName = name; break; }
      }
      // Try git remote match if path didn't work
      if (projectName === 'current work') {
        try {
          const { execFileSync } = require('child_process');
          const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd, timeout: 2000, encoding: 'utf8' }).trim().toLowerCase();
          for (const [name, repo] of Object.entries(config.repos || {})) {
            if (repo.remote && remote.includes(repo.remote.toLowerCase())) { projectName = name; break; }
          }
        } catch {}
      }

      const query = `${projectName}: recent decisions, problems, important context`;
      const result = await lightrag.query(query, 'local');
      if (result) {
        // Extract entity descriptions from JSON response
        const descriptions = [];
        const entityRegex = /"description":\s*"([^"]+)"/g;
        let match;
        while ((match = entityRegex.exec(result)) !== null) {
          const desc = match[1].split('<SEP>')[0].trim();
          if (desc.length > 30 && !desc.startsWith('Конкретный путь')) {
            descriptions.push(desc);
          }
        }
        if (descriptions.length > 0) {
          graphLines.push('');
          graphLines.push('Knowledge Graph (' + projectName + '):');
          for (const d of descriptions.slice(0, 5)) {
            graphLines.push('  - ' + d.slice(0, 150));
          }
        }
      }
    } catch {}

    // Memory context — relevant memories for current state
    const memoryLines = [];
    try {
      const memory = require('../lib/memory');
      const active = backlog.getActive();
      const relevant = memory.getRelevantContext(active, config);
      if (relevant.length > 0) {
        memoryLines.push('');
        memoryLines.push('Memory (' + relevant.length + ' relevant):');
        for (const m of relevant.slice(0, 3)) {
          const proj = m.project ? ` [${m.project}]` : '';
          memoryLines.push(`  ${m.summary}${proj}`);
        }
      }

      // Recent sessions — show what was worked on
      const recent = memory.getRecentSessions(3);
      if (recent.length > 0) {
        memoryLines.push('');
        memoryLines.push('Recent sessions (' + recent.length + '):');
        for (const s of recent.slice(0, 3)) {
          const proj = s.project ? ` [${s.project}]` : '';
          const recurring = s._recurring ? ' [RECURRING]' : '';
          memoryLines.push(`  ${s.summary}${proj}${recurring}`);
        }
      }
    } catch (e) { try { require('../lib/errors').log(e, 'dashboard:memory'); } catch {} }

    // Stale tasks (>14d, no sessions) — local block + best-effort Notion
    // Due=today bump so Notion mobile pushes a reminder.
    const staleLines = [];
    const STALE_DAYS = 14;
    const now = Date.now();
    const stale = allTasks.filter(t => {
      if (t.status === 'done') return false;
      if ((t.sessions_count || 0) > 0) return false;
      const created = Date.parse(t.created || '');
      if (!created) return false;
      return (now - created) > STALE_DAYS * 86400000;
    });
    if (stale.length > 0) {
      staleLines.push('');
      staleLines.push(`Stale (${stale.length}, >${STALE_DAYS}d, no sessions):`);
      for (const t of stale.slice(0, 5)) {
        const ageDays = Math.floor((now - Date.parse(t.created)) / 86400000);
        const proj = t.project ? ` [${t.project}]` : '';
        staleLines.push(`  #${t.id} "${t.title}"${proj} — ${ageDays}d old`);
      }
      staleLines.push('  → ask the user: archive, snooze, or activate? Do not auto-act.');
    }

    // Best-effort: bump Notion Due=today on stale tasks so mobile pushes a notif.
    // Fire-and-forget; we cap it at 8s via the hook timeout itself.
    try {
      const notion = require('../lib/notion');
      if (notion.isEnabled() && stale.length > 0) {
        notion.markStaleTasksOverdue(stale, { thresholdDays: STALE_DAYS }).catch(() => {});
      }
    } catch {}

    const contextMessage = [
      'AUTOPILOT SESSION START',
      '========================',
      dashboard,
      ...focusLines,
      ...staleLines,
      ...graphLines,
      ...memoryLines,
      noTasksMsg,
      'Routing:',
      ...routingLines,
      '',
      'Instructions: Respond in the user\'s language (detect from their messages or config.user.language). Present a brief 3-4 line summary. ' +
      'If there are suspended tasks, ask if they want to resume the top one. ' +
      'If user gives a command, route it using the routing table above. ' +
      'If user says "todo X" or uses capture triggers, save as pending task via: ' +
      'echo \'{"title":"X","project":"...","status":"pending","priority":"normal",...}\' to ~/.claude/autopilot/backlog/task-{id}.json',
      '',
      'IMPORTANT: NEVER auto-modify ~/.claude/autopilot/config.json. ' +
      'Do NOT fill in focus, roadmap, repos, or any config fields automatically. ' +
      'The user sets their own config. If config fields are empty, that is intentional — do not "help" by guessing values.',
      '',
      'ADHD Protocol (follow silently, do not announce):',
      '- IMPORTANT: "Global focus" is just context, NOT a directive. The user decides what to work on. Do NOT push them back to global focus if they are clearly working on something else.',
      '- Only ask about defocus if the user switches topics MID-SESSION (not at session start). Starting a session on any project is intentional by definition.',
      '- No guilt-tripping. Losing focus is normal. Just note it and offer to return.',
      '- If user says "defocus", "unfocus", or any equivalent in their language (e.g. Russian: "расфокус") — save current idea to backlog, remind current focus, offer to return.',
      '- Keep responses concise — walls of text cause ADHD overwhelm.',
      '- One best option, not five. Reduce decision fatigue.',
      '- If task has been active >3 sessions, consider asking: "Is this good enough to ship?"',
      '- Session context is auto-captured by hooks. Optionally write a high-quality summary to $TMPDIR/autopilot-work-$SESSION_ID.json if checkpoint asks.',
      '- If a session topic appears as [RECURRING] in recent sessions, ask the user: "This topic keeps coming up. Should I create a dedicated task for it, or is this a one-off?"'
    ].join('\n');

    const output = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: contextMessage
      }
    };

    process.stdout.write(JSON.stringify(output));
  } catch (e) {
    try { require('../lib/errors').log(e, 'dashboard:fatal'); } catch {}
    process.exit(0);
  }
});

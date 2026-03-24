#!/usr/bin/env node
// Autopilot Dashboard v1.0.0
// SessionStart hook — shows repo status, pending tasks, suggests next action

const fs = require('fs');
const path = require('path');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 8000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
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

    // Focus block from config
    const focusLines = [];
    if (config.focus?.current) {
      focusLines.push('Focus: ' + config.focus.current + (config.focus.why ? ' (' + config.focus.why + ')' : ''));
      if (config.focus.roadmap?.length) {
        focusLines.push('Roadmap: ' + config.focus.roadmap.map((r, i) => i === 0 ? '[*] ' + r : '[ ] ' + r).join(' -> '));
      }
    }

    // No tasks in backlog message
    const noTasksMsg = allTasks.length === 0 ? '\nNo tasks in backlog. Ready for new work.\n' : '';

    const contextMessage = [
      'AUTOPILOT SESSION START',
      '========================',
      dashboard,
      ...focusLines,
      noTasksMsg,
      'Routing:',
      ...routingLines,
      '',
      'Instructions: Present a brief 3-4 line summary to the user in Russian. ' +
      'If there are suspended tasks, ask if they want to resume the top one. ' +
      'If user gives a command, route it using the routing table above. ' +
      'If user says "todo X" or uses capture triggers, save as pending task via: ' +
      'echo \'{"title":"X","project":"...","status":"pending","priority":"normal",...}\' to ~/.claude/autopilot/backlog/task-{id}.json',
      '',
      'ADHD Protocol (follow silently, do not announce):',
      '- Track conversation topic vs active task. If user switches topic to unrelated project, gently ask: "This is a conscious switch or расфокус?"',
      '- No guilt-tripping. Расфокус is normal. Just note it and offer to return.',
      '- If user says "расфокус" — save current idea to backlog, remind current focus, offer to return.',
      '- Keep responses concise — walls of text cause ADHD overwhelm.',
      '- One best option, not five. Reduce decision fatigue.',
      '- If task has been active >3 sessions, consider asking: "Is this достаточно done?"'
    ].join('\n');

    const output = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: contextMessage
      }
    };

    process.stdout.write(JSON.stringify(output));
  } catch (e) {
    // Silent fail — never block session start
    process.exit(0);
  }
});

#!/usr/bin/env node
// Autopilot dashboard for Codex v1.0.0
//
// Standalone variant of hooks/ap-dashboard.js — prints directly to stdout
// (no SessionStart hook envelope, no stdin JSON contract). Called by the
// codex-autopilot wrapper as a cold open.

const fs = require('fs');
const path = require('path');
const os = require('os');

try { require('../../lib/env').load(); } catch {}

const HOME = process.env.AUTOPILOT_HOME || path.join(os.homedir(), '.codex', 'autopilot');

(async () => {
  try {
    const configPath = path.join(HOME, 'config.json');
    if (!fs.existsSync(configPath)) {
      process.stdout.write(`\nautopilot: no config at ${configPath} — run install-codex.sh first.\n\n`);
      return;
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const repos = require('../../lib/repos');
    const backlog = require('../../lib/backlog');
    const format = require('../../lib/format');
    const memory = require('../../lib/memory');

    const repoStatuses = repos.getAllRepoStatuses(config);
    const allTasks = backlog.getAllTasks().filter((t) => t.status !== 'done');
    const dashboard = format.formatDashboard(repoStatuses, allTasks, config);

    const lines = [
      'AUTOPILOT (Codex) — SESSION START',
      '='.repeat(34),
      dashboard
    ];

    if (config.repos && Object.keys(config.repos).length) {
      lines.push('', 'Routing:');
      for (const [name, repo] of Object.entries(config.repos)) {
        const kw = (repo.keywords || []).slice(0, 4).join(', ');
        const tgt = [];
        if (repo.agents?.length) tgt.push(`agents: ${repo.agents.join(', ')}`);
        if (repo.skills?.length) tgt.push(`skills: ${repo.skills.join(', ')}`);
        lines.push(`  ${name}: [${kw}] -> ${tgt.join(', ') || 'direct'}`);
      }
    }

    if (config.focus?.current) {
      lines.push('', `Global focus (FYI): ${config.focus.current}${config.focus.why ? ' (' + config.focus.why + ')' : ''}`);
    }

    try {
      const recent = memory.getRecentSessions(3);
      if (recent.length) {
        lines.push('', 'Recent sessions:');
        for (const s of recent.slice(0, 3)) {
          const proj = s.project ? ` [${s.project}]` : '';
          const recurring = s._recurring ? ' [RECURRING]' : '';
          lines.push(`  ${s.summary}${proj}${recurring}`);
        }
      }
    } catch {}

    // Stale tasks (>14d, no sessions)
    const STALE_DAYS = 14;
    const now = Date.now();
    const stale = allTasks.filter((t) => {
      if (t.status === 'done') return false;
      if ((t.sessions_count || 0) > 0) return false;
      const created = Date.parse(t.created || '');
      if (!created) return false;
      return (now - created) > STALE_DAYS * 86400000;
    });
    if (stale.length) {
      lines.push('', `Stale (${stale.length}, >${STALE_DAYS}d, no sessions):`);
      for (const t of stale.slice(0, 5)) {
        const ageDays = Math.floor((now - Date.parse(t.created)) / 86400000);
        const proj = t.project ? ` [${t.project}]` : '';
        lines.push(`  #${t.id} "${t.title}"${proj} — ${ageDays}d old`);
      }
      lines.push('  Ask Max: archive, snooze, or activate? Do not auto-act.');
    }

    lines.push('');
    lines.push('Slash-commands inside Codex (workflow plugin):');
    lines.push('  /save [name]    /back [name]    /todo [text]');
    lines.push('  /inbox          /review         /update');
    lines.push('');
    lines.push('Tip: every /-command resolves to a tool call on the `autopilot` MCP server.');
    lines.push('');

    process.stdout.write(lines.join('\n') + '\n');
  } catch (err) {
    try { require('../../lib/errors').log(err, 'dashboard-codex:fatal'); } catch {}
    process.stdout.write(`\nautopilot dashboard failed: ${err.message}\n\n`);
  }
})();

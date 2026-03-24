// ADHD-friendly formatting — compact, scannable, zero noise

function formatDashboard(repoStatuses, tasks, config) {
  const lines = [];

  // Repos line — compact
  const repoLine = Object.entries(repoStatuses)
    .map(([name, s]) => {
      if (!s.exists) return `${name}[?]`;
      if (!s.git) return `${name}[-]`;
      if (s.clean) return `${name}[ok]`;
      const p = [];
      if (s.modified) p.push(`${s.modified}M`);
      if (s.untracked) p.push(`${s.untracked}U`);
      return `${name}[${p.join(',')}]`;
    })
    .join(' ');

  lines.push(`Repos: ${repoLine}`);

  // Tasks
  const suspended = tasks.filter(t => t.status === 'suspended')
    .sort((a, b) => new Date(b.updated) - new Date(a.updated));
  const pending = tasks.filter(t => t.status === 'pending')
    .sort((a, b) => {
      const order = { high: 0, normal: 1, low: 2 };
      return (order[a.priority] || 1) - (order[b.priority] || 1);
    });

  if (suspended.length > 0) {
    lines.push('');
    lines.push(`Suspended (${suspended.length}):`);
    for (const t of suspended.slice(0, 3)) {
      const age = formatAge(t.updated);
      const proj = t.project ? ` [${t.project}]` : '';
      const enough = (t.sessions_count || 0) >= 3 ? ' [достаточно?]' : '';
      lines.push(`  #${t.id} "${t.title}"${proj} paused ${age}${enough}`);
      if (t.context_snapshot?.next_step) {
        lines.push(`    Next: ${t.context_snapshot.next_step}`);
      }
    }
  }

  if (pending.length > 0) {
    lines.push('');
    lines.push(`Pending (${pending.length}):`);
    for (const t of pending.slice(0, 5)) {
      const proj = t.project ? ` [${t.project}]` : '';
      const pri = t.priority !== 'normal' ? ` pri:${t.priority}` : '';
      lines.push(`  #${t.id} "${t.title}"${proj}${pri}`);
    }
  }

  // Suggestion
  const top = suspended[0] || pending[0];
  if (top) {
    lines.push('');
    if (top.status === 'suspended') {
      lines.push(`Suggested: resume #${top.id} "${top.title}"`);
      if (top.context_snapshot?.summary) {
        lines.push(`  Context: ${top.context_snapshot.summary}`);
      }
    } else {
      lines.push(`Suggested: start #${top.id} "${top.title}"`);
    }
  }

  if (suspended.length === 0 && pending.length === 0) {
    lines.push('');
    lines.push('No tasks in backlog. Ready for new work.');
  }

  return lines.join('\n');
}

function formatAge(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

module.exports = { formatDashboard, formatAge };

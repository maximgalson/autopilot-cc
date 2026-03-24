// Autopilot Memory Layer v1.0.0
// JSON + tags + full-text search across all projects

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '..', 'memory');
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(require('os').homedir(), '.claude');

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function memPath(id) {
  return path.join(MEMORY_DIR, `mem-${id}.json`);
}

// Generate 4-char ID
function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id;
  do {
    id = '';
    for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  } while (fs.existsSync(memPath(id)));
  return id;
}

// --- CRUD ---

function save({ summary, project, tags = [], type = 'work', details = null, related_tasks = [] }) {
  ensureDir();
  const now = new Date().toISOString();
  const mem = {
    id: generateId(),
    summary,
    project: project || null,
    type, // work | decision | insight | pattern | error
    tags,
    details: details || {},
    related_tasks,
    created: now,
    accessed: now,
    access_count: 0
  };
  fs.writeFileSync(memPath(mem.id), JSON.stringify(mem, null, 2));
  return mem;
}

function get(id) {
  const p = memPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    const mem = JSON.parse(fs.readFileSync(p, 'utf8'));
    // Track access
    mem.accessed = new Date().toISOString();
    mem.access_count = (mem.access_count || 0) + 1;
    fs.writeFileSync(p, JSON.stringify(mem, null, 2));
    return mem;
  } catch { return null; }
}

function getAll() {
  ensureDir();
  return fs.readdirSync(MEMORY_DIR)
    .filter(f => f.startsWith('mem-') && f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(MEMORY_DIR, f), 'utf8')); } catch { return null; }
    })
    .filter(Boolean);
}

function remove(id) {
  const p = memPath(id);
  if (fs.existsSync(p)) { fs.unlinkSync(p); return true; }
  return false;
}

// --- Search ---

function search(query, { project = null, type = null, tags = null, limit = 10 } = {}) {
  const all = getAll();
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);

  return all
    .filter(m => {
      // Filter by project
      if (project && m.project !== project) return false;
      // Filter by type
      if (type && m.type !== type) return false;
      // Filter by tags
      if (tags && !tags.some(t => (m.tags || []).includes(t))) return false;
      return true;
    })
    .map(m => {
      // Score by keyword match
      const text = [
        m.summary || '',
        (m.tags || []).join(' '),
        m.project || '',
        m.type || '',
        JSON.stringify(m.details || {})
      ].join(' ').toLowerCase();

      let score = 0;
      for (const w of words) {
        if (text.includes(w)) score += 1;
        // Boost exact matches in summary
        if ((m.summary || '').toLowerCase().includes(w)) score += 2;
        // Boost tag matches
        if ((m.tags || []).some(t => t.toLowerCase().includes(w))) score += 3;
      }

      // Recency boost: memories from last 7 days get +1
      const age = Date.now() - new Date(m.created).getTime();
      if (age < 7 * 86400000) score += 1;

      // Frequency boost: often-accessed memories get +1
      if ((m.access_count || 0) >= 3) score += 1;

      return { ...m, _score: score };
    })
    .filter(m => m._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}

// --- Cross-project: scan Claude Code memory files ---

function scanClaudeMemory(project = null) {
  const results = [];
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) return results;

  try {
    const dirs = fs.readdirSync(projectsDir).filter(d => {
      const memDir = path.join(projectsDir, d, 'memory');
      return fs.existsSync(memDir);
    });

    for (const d of dirs) {
      const memDir = path.join(projectsDir, d, 'memory');
      const files = fs.readdirSync(memDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');

      for (const f of files) {
        try {
          const content = fs.readFileSync(path.join(memDir, f), 'utf8');
          // Extract frontmatter
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          let name = '', description = '', type = '';
          if (fmMatch) {
            const fm = fmMatch[1];
            name = (fm.match(/name:\s*(.+)/) || [])[1] || '';
            description = (fm.match(/description:\s*(.+)/) || [])[1] || '';
            type = (fm.match(/type:\s*(.+)/) || [])[1] || '';
          }
          results.push({
            source: 'claude-memory',
            project_dir: d,
            file: f,
            name: name.trim(),
            description: description.trim(),
            type: type.trim(),
            path: path.join(memDir, f)
          });
        } catch {}
      }
    }
  } catch {}

  return results;
}

// --- Session log: capture every session ---

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');

function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function saveSession({ summary, project, details = {}, session_id = '' }) {
  ensureSessionsDir();
  const now = new Date().toISOString();
  const dateStr = now.slice(0, 10); // 2026-03-24
  const entry = {
    timestamp: now,
    session_id,
    summary,
    project: project || null,
    details
  };

  // Append to daily log file
  const logPath = path.join(SESSIONS_DIR, `${dateStr}.json`);
  let log = [];
  if (fs.existsSync(logPath)) {
    try { log = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch {}
  }
  log.push(entry);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));

  // Check if this topic is recurring — search in recent sessions
  const recurring = findRecurringTopic(summary, project);
  if (recurring) {
    entry._recurring = true;
    entry._similar_count = recurring.count;
  }

  return entry;
}

function findRecurringTopic(summary, project) {
  ensureSessionsDir();
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .slice(-7); // last 7 days

  const words = summary.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  let matchCount = 0;

  for (const f of files) {
    try {
      const log = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
      for (const entry of log) {
        const text = (entry.summary || '').toLowerCase();
        const overlap = words.filter(w => text.includes(w)).length;
        if (overlap >= Math.min(2, words.length * 0.3)) {
          matchCount++;
        }
      }
    } catch {}
  }

  // 3+ similar sessions in 7 days = recurring
  if (matchCount >= 2) return { count: matchCount };
  return null;
}

function getRecentSessions(days = 3) {
  ensureSessionsDir();
  const results = [];
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .slice(-days);

  for (const f of files) {
    try {
      const log = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
      results.push(...log);
    } catch {}
  }

  return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// --- Auto-capture from task context ---

function captureFromTask(task) {
  if (!task || !task.context_snapshot?.summary) return null;

  // Don't duplicate — check if similar memory exists
  const existing = search(task.title, { project: task.project, limit: 1 });
  if (existing.length > 0 && existing[0]._score >= 3) return null;

  return save({
    summary: task.context_snapshot.summary,
    project: task.project,
    type: 'work',
    tags: task.tags || [],
    details: {
      next_step: task.context_snapshot.next_step,
      files_touched: task.context_snapshot.files_touched,
      sessions: task.sessions_count || 1
    },
    related_tasks: [task.id]
  });
}

// --- Context for dashboard: relevant memories for current state ---

function getRelevantContext(activeTask, config) {
  const results = [];

  // 1. Memories related to active task
  if (activeTask) {
    const taskMemories = search(activeTask.title, {
      project: activeTask.project,
      limit: 3
    });
    results.push(...taskMemories);
  }

  // 2. Memories related to current focus
  if (config?.focus?.current) {
    const focusMemories = search(config.focus.current, { limit: 2 });
    for (const m of focusMemories) {
      if (!results.find(r => r.id === m.id)) results.push(m);
    }
  }

  // 3. Recent high-access memories
  const recent = getAll()
    .filter(m => (m.access_count || 0) >= 2)
    .sort((a, b) => new Date(b.accessed) - new Date(a.accessed))
    .slice(0, 2);
  for (const m of recent) {
    if (!results.find(r => r.id === m.id)) results.push(m);
  }

  return results.slice(0, 5);
}

module.exports = {
  save, get, getAll, remove, search,
  scanClaudeMemory, captureFromTask, getRelevantContext,
  saveSession, getRecentSessions, findRecurringTopic,
  MEMORY_DIR, SESSIONS_DIR
};

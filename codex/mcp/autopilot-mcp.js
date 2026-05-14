#!/usr/bin/env node
// Autopilot MCP server v1.0.0 (Codex port)
// Stdio MCP server exposing autopilot operations as invokable tools.
// Used by Codex CLI workflow plugin and by the wrapper for mid-session actions.
//
// Protocol: MCP over stdio (line-delimited JSON-RPC 2.0).
// Spec: https://modelcontextprotocol.io/
//
// Tools:
//   - dashboard()
//   - save({name?})
//   - backlog_add({title, project?, priority?, status?, tags?})
//   - todo_add({text})           // applies capture-trigger logic + Notion sync
//   - inbox_capture()            // list wiki/inbox/*.md
//   - back({name?})              // list sessions or restore one
//   - review({scope?})           // last N sessions, surfacing next_steps
//   - update()                   // git pull autopilot-cc repo
//
// Env (set by wrapper before exec):
//   AUTOPILOT_HOME=~/.codex/autopilot     // libs read backlog/memory/sessions from here
//   AUTOPILOT_ENV_FILE=...                // optional override
//   NOTION_TOKEN, LIGHTRAG_*               // forwarded from .env

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync, spawnSync } = require('child_process');

try { require('../../lib/env').load(); } catch {}

const HOME = process.env.AUTOPILOT_HOME || path.join(os.homedir(), '.codex', 'autopilot');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SERVER_INFO = { name: 'autopilot', version: '1.0.0' };

// ---- stdio JSON-RPC loop ----------------------------------------------------

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    handle(line).catch((err) => logErr('handle', err));
  }
});
process.stdin.on('end', () => process.exit(0));

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function logErr(where, err) {
  const msg = err && err.message ? err.message : String(err);
  process.stderr.write(`[autopilot-mcp:${where}] ${msg}\n`);
  try { require('../../lib/errors').log(err, `mcp:${where}`); } catch {}
}

async function handle(line) {
  let msg;
  try { msg = JSON.parse(line); }
  catch { return; } // ignore non-JSON
  const { id, method, params } = msg;
  try {
    const result = await dispatch(method, params || {});
    if (id !== undefined && id !== null) send({ jsonrpc: '2.0', id, result });
  } catch (err) {
    logErr(method, err);
    if (id !== undefined && id !== null) {
      send({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message || String(err) } });
    }
  }
}

async function dispatch(method, params) {
  switch (method) {
    case 'initialize':       return onInitialize(params);
    case 'notifications/initialized': return {};
    case 'tools/list':       return { tools: TOOLS };
    case 'tools/call':       return onToolCall(params);
    case 'ping':             return {};
    case 'shutdown':         return {};
    default:                 throw new Error(`unknown method: ${method}`);
  }
}

function onInitialize(_params) {
  return {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO
  };
}

async function onToolCall({ name, arguments: args = {} }) {
  const fn = TOOL_HANDLERS[name];
  if (!fn) throw new Error(`unknown tool: ${name}`);
  const text = await fn(args);
  return { content: [{ type: 'text', text: String(text ?? '') }] };
}

// ---- Tools schema -----------------------------------------------------------

const TOOLS = [
  {
    name: 'dashboard',
    description: 'Return Autopilot dashboard: repos status, suspended/pending tasks, suggested next action, recent sessions, routing table.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'save',
    description: 'Save current session as a digest. Closes the heartbeat. Pass `name` to label the snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'optional session label (defaults to timestamp)' },
        summary: { type: 'string', description: 'optional one-line summary of what was accomplished' },
        next_step: { type: 'string', description: 'optional concrete next step' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'backlog_add',
    description: 'Create a backlog task and optionally sync to Notion.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title:    { type: 'string' },
        project:  { type: 'string' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'] },
        status:   { type: 'string', enum: ['pending', 'active', 'suspended', 'done'] },
        tags:     { type: 'array', items: { type: 'string' } }
      },
      additionalProperties: false
    }
  },
  {
    name: 'todo_add',
    description: 'Add a todo via natural-language capture (same triggers as UserPromptSubmit hook). Use this when the user types "/todo X" or says "не забыть X". Inline [project] or [priority] tags supported.',
    inputSchema: {
      type: 'object',
      required: ['text'],
      properties: { text: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    name: 'inbox_capture',
    description: 'List unprocessed notes in wiki/inbox/ for routing.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'back',
    description: 'Return saved sessions. With no name → list recent. With name → return that session digest content.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      additionalProperties: false
    }
  },
  {
    name: 'review',
    description: 'Surface next_step from recent sessions so the user can pick what to do next.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['recent', 'weekly'], description: 'recent=last 5 sessions, weekly=7-day digest' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'update',
    description: 'Self-update: git pull in autopilot-cc repo, refresh symlinks. Preserves config and env.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
];

// ---- Handlers --------------------------------------------------------------

const TOOL_HANDLERS = {
  dashboard:     toolDashboard,
  save:          toolSave,
  backlog_add:   toolBacklogAdd,
  todo_add:      toolTodoAdd,
  inbox_capture: toolInboxCapture,
  back:          toolBack,
  review:        toolReview,
  update:        toolUpdate
};

function loadConfig() {
  const p = path.join(HOME, 'config.json');
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

async function toolDashboard() {
  const config = loadConfig();
  const repos = require('../../lib/repos');
  const backlog = require('../../lib/backlog');
  const format = require('../../lib/format');
  const memory = require('../../lib/memory');

  const repoStatuses = repos.getAllRepoStatuses(config);
  const allTasks = backlog.getAllTasks().filter((t) => t.status !== 'done');
  const dashboard = format.formatDashboard(repoStatuses, allTasks, config);

  const lines = ['AUTOPILOT (Codex) — DASHBOARD', '='.repeat(32), dashboard];

  // Routing
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

  // Recent sessions
  try {
    const recent = memory.getRecentSessions(3);
    if (recent.length) {
      lines.push('', 'Recent sessions:');
      for (const s of recent.slice(0, 3)) {
        const proj = s.project ? ` [${s.project}]` : '';
        lines.push(`  ${s.summary}${proj}`);
      }
    }
  } catch {}

  // Focus
  if (config.focus?.current) {
    lines.push('', `Global focus (FYI): ${config.focus.current}${config.focus.why ? ' (' + config.focus.why + ')' : ''}`);
  }

  return lines.join('\n');
}

async function toolSave({ name, summary, next_step } = {}) {
  const memory = require('../../lib/memory');
  const backlog = require('../../lib/backlog');
  const wiki = require('../../lib/wiki');
  const sessionsDir = path.join(HOME, 'sessions');
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

  const now = new Date().toISOString();
  const label = (name && name.trim()) || `auto-${now.replace(/[:.]/g, '-').slice(0, 19)}`;
  const safe = label.replace(/[^a-z0-9._-]+/gi, '-');
  const mdPath = path.join(sessionsDir, `${safe}.md`);

  // Pull current heartbeat for context, if present
  const currentPath = path.join(sessionsDir, 'current.json');
  let current = {};
  if (fs.existsSync(currentPath)) {
    try { current = JSON.parse(fs.readFileSync(currentPath, 'utf8')); } catch {}
  }

  const active = (() => { try { return backlog.getActive(); } catch { return null; } })();
  const project = current.project || active?.project || null;

  const body = [
    '---',
    `name: ${safe}`,
    `timestamp: ${now}`,
    project ? `project: ${project}` : '',
    'engine: codex',
    '---',
    '',
    `# ${safe}`,
    '',
    summary ? `**Summary:** ${summary}` : '',
    next_step ? `**Next step:** ${next_step}` : '',
    '',
    current.last_activity ? `Last heartbeat: ${current.last_activity}` : '',
    current.cwd ? `Cwd: ${current.cwd}` : '',
    active ? `Active task: #${active.id} "${active.title}"` : ''
  ].filter(Boolean).join('\n') + '\n';

  fs.writeFileSync(mdPath, body);

  // Also record in sessions log + wiki
  try {
    memory.saveSession({
      summary: summary || current.last_activity || `Saved snapshot: ${safe}`,
      project,
      details: { manual_save: true, file: mdPath, next_step: next_step || null },
      session_id: current.session_id || ''
    });
  } catch (err) { logErr('save:memory', err); }

  try {
    if (project) wiki.appendSessionToProject(project, {
      summary: summary || `Manual save: ${safe}`,
      next_step: next_step || '',
      files_touched: current.files_touched || []
    });
  } catch (err) { logErr('save:wiki', err); }

  // Mark exit on heartbeat (this is a clean save)
  try {
    fs.writeFileSync(currentPath, JSON.stringify({ ...current, saved: now, status: 'saved' }, null, 2));
  } catch {}

  return `saved: ${mdPath}`;
}

async function toolBacklogAdd({ title, project, priority = 'normal', status = 'pending', tags = [] } = {}) {
  if (!title || !title.trim()) throw new Error('title is required');
  const backlog = require('../../lib/backlog');
  const task = backlog.createTask({ title: title.trim(), project: project || null, priority, tags, source: 'mcp' });
  if (status && status !== 'pending') backlog.updateTask(task.id, { status });

  let notionUrl = null;
  try {
    const notion = require('../../lib/notion');
    if (notion.isEnabled()) {
      const res = await notion.upsertTask(task);
      if (res?.page_id) {
        backlog.updateTask(task.id, { notion: { page_id: res.page_id, url: res.url, last_synced: new Date().toISOString() } });
        notionUrl = res.url;
      }
    }
  } catch (err) { logErr('backlog_add:notion', err); }

  return `created #${task.id} "${task.title}"${task.project ? ' [' + task.project + ']' : ''}${notionUrl ? ' → Notion ✓' : ''}`;
}

// Mirror of hooks/ap-userprompt.js capture logic, simplified for explicit calls.
async function toolTodoAdd({ text } = {}) {
  if (!text || !text.trim()) throw new Error('text is required');
  const PRIORITY_RE = /\[(high|low|normal|urgent|высокий|низкий|обычный)\]/i;
  const PRIORITY_MAP = { 'высокий': 'high', 'низкий': 'low', 'обычный': 'normal', 'urgent': 'high' };
  const PROJECT_RE = /\[([a-z][a-z0-9_-]{2,})\]/i;

  let cleanTitle = text.trim();
  let priority = 'normal';
  let project = null;

  const pri = cleanTitle.match(PRIORITY_RE);
  if (pri) {
    priority = PRIORITY_MAP[pri[1].toLowerCase()] || pri[1].toLowerCase();
    cleanTitle = cleanTitle.replace(pri[0], '').trim();
  }
  const proj = cleanTitle.match(PROJECT_RE);
  if (proj && !['high','low','normal','urgent','высокий','низкий','обычный'].includes(proj[1].toLowerCase())) {
    project = proj[1].toLowerCase();
    cleanTitle = cleanTitle.replace(proj[0], '').trim();
  }
  if (!project) {
    const cwd = process.cwd();
    const cfg = loadConfig();
    for (const [name, repo] of Object.entries(cfg.repos || {})) {
      if (repo.path && cwd.startsWith(repo.path)) { project = name; break; }
    }
  }

  return toolBacklogAdd({ title: cleanTitle, project, priority, status: 'pending' });
}

async function toolInboxCapture() {
  const candidates = [
    process.env.WIKI_DIR && path.join(process.env.WIKI_DIR, 'inbox'),
    path.join(os.homedir(), 'claudecode', 'wiki', 'inbox'),
    path.join(HOME, 'wiki', 'inbox')
  ].filter(Boolean);

  const dir = candidates.find((d) => fs.existsSync(d));
  if (!dir) return 'no inbox dir found (expected ~/claudecode/wiki/inbox/)';

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('.'));
  if (!files.length) return `inbox empty: ${dir}`;

  const lines = [`inbox: ${dir}`, ''];
  for (const f of files.slice(0, 20)) {
    const p = path.join(dir, f);
    let firstLine = '';
    try {
      const content = fs.readFileSync(p, 'utf8');
      firstLine = content.split('\n').find((l) => l.trim() && !l.startsWith('---')) || '';
    } catch {}
    lines.push(`- ${f}${firstLine ? ` — ${firstLine.slice(0, 80)}` : ''}`);
  }
  if (files.length > 20) lines.push(`...and ${files.length - 20} more`);
  return lines.join('\n');
}

async function toolBack({ name } = {}) {
  const sessionsDir = path.join(HOME, 'sessions');
  if (!fs.existsSync(sessionsDir)) return 'no sessions saved yet';

  if (name && name.trim()) {
    const safe = name.replace(/[^a-z0-9._-]+/gi, '-');
    const p = path.join(sessionsDir, safe.endsWith('.md') ? safe : `${safe}.md`);
    if (!fs.existsSync(p)) return `session not found: ${safe}`;
    return fs.readFileSync(p, 'utf8');
  }

  const files = fs.readdirSync(sessionsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ f, mtime: fs.statSync(path.join(sessionsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 10);

  if (!files.length) return 'no sessions saved yet';

  const lines = ['Saved sessions (newest first):', ''];
  for (const { f, mtime } of files) {
    const age = Math.floor((Date.now() - mtime) / 60000);
    const ageStr = age < 60 ? `${age}m ago` : age < 1440 ? `${Math.floor(age / 60)}h ago` : `${Math.floor(age / 1440)}d ago`;
    lines.push(`- ${f.replace(/\.md$/, '')} (${ageStr})`);
  }
  lines.push('', 'Call autopilot.back with name=<session-name> to restore one.');
  return lines.join('\n');
}

async function toolReview({ scope = 'recent' } = {}) {
  const memory = require('../../lib/memory');
  const days = scope === 'weekly' ? 7 : 3;
  const recent = memory.getRecentSessions(days);
  if (!recent.length) return 'no recent sessions';

  const top = recent.slice(0, scope === 'weekly' ? 20 : 5);
  const lines = [`Review (${scope}): ${top.length} sessions`, ''];
  for (const s of top) {
    const date = (s.timestamp || '').slice(0, 16).replace('T', ' ');
    const proj = s.project ? ` [${s.project}]` : '';
    lines.push(`- ${date}${proj} — ${s.summary}`);
    if (s.details?.next_step) lines.push(`    next: ${s.details.next_step}`);
  }
  return lines.join('\n');
}

async function toolUpdate() {
  const out = [];
  try {
    const r = spawnSync('git', ['-C', REPO_ROOT, 'pull', '--ff-only'], { encoding: 'utf8', timeout: 30000 });
    out.push('git pull:', (r.stdout || '').trim(), (r.stderr || '').trim());
    if (r.status !== 0) throw new Error('git pull failed');
  } catch (err) {
    return `update failed: ${err.message}\n${out.join('\n')}`;
  }
  return out.filter(Boolean).join('\n') || 'updated';
}

// keep the process alive (stdio mode)

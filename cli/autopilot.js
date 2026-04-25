#!/usr/bin/env node
// Autopilot CLI v2.0.0-beta1
// Use outside Claude Code: status, list, focus, stats, inbox, doctor.
//
// Resolves library paths in this order:
//   1. ./lib relative to this file (dev — running from the source repo)
//   2. ~/.claude/autopilot/lib (installed location)

const fs = require('fs');
const os = require('os');
const path = require('path');

// Library directory: prefer the installed copy because lib/backlog.js + lib/memory.js
// resolve their data paths relative to __dirname (../backlog, ../sessions, ...).
// Falling back to the source repo only matters when the user has not run install.sh yet.
function libDir() {
  const installed = path.join(os.homedir(), '.claude', 'autopilot', 'lib');
  if (fs.existsSync(path.join(installed, 'backlog.js'))) return installed;
  return path.join(__dirname, '..', 'lib');
}
const LIB = libDir();
const ROOT = path.dirname(LIB);
process.env.AUTOPILOT_ROOT = ROOT;

try { require(path.join(LIB, 'env.js')).load(); } catch {}

const COMMANDS = {
  status:  cmdStatus,
  list:    cmdList,
  focus:   cmdFocus,
  stats:   cmdStats,
  inbox:   cmdInbox,
  doctor:  cmdDoctor,
  help:    cmdHelp,
  '--help': cmdHelp,
  '-h':    cmdHelp
};

const cmd = process.argv[2] || 'status';
const args = process.argv.slice(3);

if (!COMMANDS[cmd]) {
  process.stderr.write(`Unknown command: ${cmd}\n`);
  cmdHelp();
  process.exit(1);
}

Promise.resolve(COMMANDS[cmd](args)).catch(err => {
  process.stderr.write(`autopilot: ${err.message}\n`);
  process.exit(1);
});

// ---- commands ----------------------------------------------------------------

function cmdHelp() {
  console.log(`autopilot — ADHD Terminal Copilot for Claude Code

Usage:
  autopilot <command> [args]

Commands:
  status                  Compact dashboard (focus, active task, pending count, stale count)
  list [pending|active|suspended|all]
                          List tasks; default = pending+active+suspended (no done)
  focus set "<text>"      Set config.focus.current
  focus clear             Clear focus
  focus why "<text>"      Set config.focus.why
  stats [days]            7-day digest (default 7) — sessions, tasks, stale, top project
  inbox                   List wiki/inbox/ files with suggested destinations
  doctor                  Health check: hooks, config, env, LightRAG, Notion, recent errors
  help                    This screen

Config:    ${path.join(ROOT, 'config.json')}
Env file:  ~/.claude/autopilot/.env
Errors:    ~/.claude/autopilot/errors.log
`);
}

function loadConfig() {
  const p = path.join(ROOT, 'config.json');
  if (!fs.existsSync(p)) throw new Error(`config.json not found at ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveConfig(cfg) {
  fs.writeFileSync(path.join(ROOT, 'config.json'), JSON.stringify(cfg, null, 2));
}

function cmdStatus() {
  const cfg = loadConfig();
  const backlog = require(path.join(LIB, 'backlog.js'));
  const tasks = backlog.getAllTasks().filter(t => t.status !== 'done');
  const active = backlog.getActive();
  const pending = tasks.filter(t => t.status === 'pending');
  const suspended = tasks.filter(t => t.status === 'suspended');
  const now = Date.now();
  const stale = tasks.filter(t => {
    if ((t.sessions_count || 0) > 0) return false;
    const c = Date.parse(t.created || '');
    return c && (now - c) > 14 * 86400000;
  });

  const focus = cfg.focus?.current ? `Focus:    ${cfg.focus.current}${cfg.focus.why ? ' (' + cfg.focus.why + ')' : ''}` : 'Focus:    (none)';
  const activeLine = active ? `Active:   #${active.id} "${active.title}"` : 'Active:   (none)';
  console.log([
    focus,
    activeLine,
    `Pending:  ${pending.length}`,
    `Suspended:${suspended.length}`,
    `Stale:    ${stale.length}${stale.length ? ' (>14d, no sessions)' : ''}`
  ].join('\n'));
}

function cmdList(args) {
  const filter = args[0] || 'open';
  const backlog = require(path.join(LIB, 'backlog.js'));
  const all = backlog.getAllTasks();
  const matchSet = filter === 'all'
    ? new Set(['pending', 'active', 'suspended', 'done'])
    : filter === 'open'
      ? new Set(['pending', 'active', 'suspended'])
      : new Set([filter]);
  const rows = all.filter(t => matchSet.has(t.status));
  if (rows.length === 0) { console.log('(no tasks)'); return; }
  const now = Date.now();
  for (const t of rows) {
    const age = t.created ? Math.floor((now - Date.parse(t.created)) / 86400000) : 0;
    const proj = t.project ? ` [${t.project}]` : '';
    const prio = t.priority && t.priority !== 'normal' ? ` [${t.priority}]` : '';
    console.log(`#${t.id} ${t.status.padEnd(9)} ${age}d  ${t.title}${proj}${prio}`);
  }
}

function cmdFocus(args) {
  const cfg = loadConfig();
  cfg.focus = cfg.focus || { current: null, why: null, roadmap: [] };
  const sub = args[0];
  if (sub === 'set') {
    const text = args.slice(1).join(' ').trim();
    if (!text) throw new Error('focus set requires text');
    cfg.focus.current = text;
    saveConfig(cfg);
    console.log(`focus: ${text}`);
  } else if (sub === 'clear') {
    cfg.focus.current = null;
    cfg.focus.why = null;
    saveConfig(cfg);
    console.log('focus cleared');
  } else if (sub === 'why') {
    const text = args.slice(1).join(' ').trim();
    if (!text) throw new Error('focus why requires text');
    cfg.focus.why = text;
    saveConfig(cfg);
    console.log(`why: ${text}`);
  } else {
    console.log(cfg.focus.current
      ? `${cfg.focus.current}${cfg.focus.why ? ' — ' + cfg.focus.why : ''}`
      : '(no focus set)');
  }
}

async function cmdStats(args) {
  const days = parseInt(args[0] || '7', 10);
  const memory = require(path.join(LIB, 'memory.js'));
  const backlog = require(path.join(LIB, 'backlog.js'));
  const sessions = memory.getRecentSessions(days);
  const tasks = backlog.getAllTasks();
  const now = Date.now();
  const cutoff = now - days * 86400000;

  const activeDays = new Set(sessions.map(s => (s.timestamp || '').slice(0, 10))).size;
  const created = tasks.filter(t => Date.parse(t.created || '') > cutoff).length;
  const completed = tasks.filter(t => t.status === 'done' && Date.parse(t.updated || '') > cutoff).length;
  const stale = tasks.filter(t =>
    t.status !== 'done'
    && (t.sessions_count || 0) === 0
    && Date.parse(t.created || '') < (now - 14 * 86400000)
  );
  const projCounts = {};
  for (const s of sessions) projCounts[s.project || '?'] = (projCounts[s.project || '?'] || 0) + 1;
  const top = Object.entries(projCounts).sort((a, b) => b[1] - a[1])[0];
  const recurring = sessions.filter(s => s._recurring).length;

  let inboxCount = 0;
  try {
    const wikiDir = process.env.WIKI_DIR
      || (fs.existsSync(path.join(os.homedir(), 'claudecode', 'wiki'))
          ? path.join(os.homedir(), 'claudecode', 'wiki')
          : path.join(os.homedir(), '.claude', 'autopilot', 'wiki'));
    inboxCount = fs.readdirSync(path.join(wikiDir, 'inbox')).filter(f => f.endsWith('.md')).length;
  } catch {}

  console.log(`Last ${days} days
  Active days:        ${activeDays} / ${days}
  Sessions:           ${sessions.length}
  Tasks created:      ${created}
  Tasks completed:    ${completed}
  Stale tasks:        ${stale.length}${stale.length ? ' (' + stale.slice(0, 3).map(t => '#' + t.id).join(', ') + (stale.length > 3 ? ', …' : '') + ')' : ''}
  Top project:        ${top ? top[0] + ' (' + top[1] + ')' : '—'}
  Recurring topics:   ${recurring}
  Inbox notes:        ${inboxCount}`);
}

function cmdInbox() {
  const wikiDir = process.env.WIKI_DIR
    || (fs.existsSync(path.join(os.homedir(), 'claudecode', 'wiki'))
        ? path.join(os.homedir(), 'claudecode', 'wiki')
        : path.join(os.homedir(), '.claude', 'autopilot', 'wiki'));
  const inbox = path.join(wikiDir, 'inbox');
  if (!fs.existsSync(inbox)) { console.log(`inbox not found: ${inbox}`); return; }
  const files = fs.readdirSync(inbox).filter(f => f.endsWith('.md'));
  if (files.length === 0) { console.log('inbox is clean'); return; }
  const now = Date.now();
  for (const f of files.sort()) {
    const fp = path.join(inbox, f);
    const st = fs.statSync(fp);
    const ageDays = Math.floor((now - st.mtimeMs) / 86400000);
    const dest = suggestInboxDest(f, fp);
    console.log(`${f} (${ageDays}d) → ${dest}/`);
  }
}

function suggestInboxDest(name, fp) {
  let head = '';
  try { head = fs.readFileSync(fp, 'utf8').slice(0, 200).toLowerCase(); } catch {}
  const text = (name + ' ' + head).toLowerCase();
  if (/decision|решил|выбрал/.test(text)) return 'decisions';
  if (/feedback|правил|правк/.test(text)) return 'feedback';
  if (/client|клиент/.test(text)) return 'clients';
  if (/tool|mcp|api|скрипт/.test(text)) return 'references';
  return 'projects';
}

async function cmdDoctor() {
  const lines = [];
  function row(label, ok, detail) {
    lines.push(`${ok ? '✓' : '✗'} ${label.padEnd(20)} ${detail || ''}`);
  }

  // Config
  let cfg = null;
  try { cfg = loadConfig(); row('config.json', true, path.join(ROOT, 'config.json')); }
  catch (err) { row('config.json', false, err.message); }

  // hooks in settings.json
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  let settingsRaw = null;
  try {
    settingsRaw = fs.readFileSync(settingsPath, 'utf8');
    const expected = ['ap-dashboard', 'ap-context-monitor', 'ap-autosave', 'ap-statusline', 'ap-userprompt'];
    for (const h of expected) {
      row('hook ' + h, settingsRaw.includes(h));
    }
    const hasPixel = settingsRaw.includes('pixel-agents');
    row('pixel-agents clean', !hasPixel, hasPixel ? 'run scripts/cleanup-pixel-agents.sh' : '');
  } catch (err) {
    row('settings.json', false, err.message);
  }

  // env file
  const envFile = path.join(os.homedir(), '.claude', 'autopilot', '.env');
  row('.env', fs.existsSync(envFile), envFile);

  // Notion
  if (cfg) {
    const notionEnabled = !!(cfg.notion_sync?.enabled && cfg.notion_sync?.database_id && process.env.NOTION_TOKEN);
    row('Notion sync', notionEnabled, notionEnabled ? 'config + token ok' : 'disabled or missing creds');
    if (notionEnabled) {
      try {
        const notion = require(path.join(LIB, 'notion.js'));
        const schema = await notion.discoverSchema();
        row('Notion schema', !!schema?.titleProp, schema?.titleProp ? `title="${schema.titleProp.name}"` : 'no title property');
      } catch (err) {
        row('Notion schema', false, err.message);
      }
    }
  }

  // LightRAG
  try {
    const lr = require(path.join(LIB, 'lightrag.js'));
    row('LightRAG', lr.isEnabled(), lr.isEnabled() ? 'LIGHTRAG_PASS set' : 'no password — disabled');
  } catch { row('LightRAG', false, 'lib/lightrag.js missing'); }

  // Errors log tail
  try {
    const errors = require(path.join(LIB, 'errors.js'));
    const tail = errors.readTail(5);
    if (tail.length === 0) {
      row('errors.log', true, 'empty');
    } else {
      row('errors.log', false, `${tail.length} recent error(s) — see ${errors.LOG_FILE}`);
      for (const t of tail.slice(-3)) lines.push('    ' + t.slice(0, 120));
    }
  } catch { row('errors.log', true, 'no log yet'); }

  console.log(lines.join('\n'));
}

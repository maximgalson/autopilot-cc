#!/usr/bin/env node
// Autopilot UserPromptSubmit hook v1.0.0
// Watches user prompts for capture triggers ("todo X", "не забыть Y", ...)
// and creates pending tasks automatically. Optionally syncs each task to Notion.
//
// Input  (stdin JSON):  { prompt: "...", session_id: "...", cwd: "..." }
// Output (stdout JSON): { hookSpecificOutput: { additionalContext: "Captured: ..." } }
//   or empty object when nothing matched (Claude is unaffected).
//
// False-positive guard:
//   - Skip lines starting with shell-ish prefixes (git, npm, node, bash, sh,
//     curl, wget, docker, python, pip, kubectl, gh, http) — those are commands.
//   - Skip text inside backticks/fenced code blocks.
//   - Skip lines that *quote* the trigger (single or double quotes around it).

const fs = require('fs');
const path = require('path');
try { require('../lib/env').load(); } catch {}

const SHELL_PREFIX = /^\s*(git|npm|npx|node|bash|sh|curl|wget|docker|python|pip|kubectl|gh|http|ls|cat|grep|sed|awk|cd|cp|mv|rm)\b/i;
const PRIORITY_RE = /\[(high|low|normal|urgent|высокий|низкий|обычный)\]/i;
const PRIORITY_MAP = { 'высокий': 'high', 'низкий': 'low', 'обычный': 'normal', 'urgent': 'high' };
const PROJECT_RE = /\[([a-z][a-z0-9_-]{2,})\]/i;

let input = '';
const tmout = setTimeout(() => process.exit(0), 4000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => input += c);
process.stdin.on('end', async () => {
  clearTimeout(tmout);
  try {
    const data = JSON.parse(input || '{}');
    const prompt = String(data.prompt || data.user_message || '').trim();
    if (!prompt) return process.exit(0);

    const cfg = readConfig();
    const triggers = (cfg.capture_triggers || []).filter(Boolean);
    if (triggers.length === 0) return process.exit(0);

    const stripped = stripCodeBlocks(prompt);
    const matches = findTriggers(stripped, triggers);
    if (matches.length === 0) return process.exit(0);

    const created = await createTasks(matches, cfg, data.cwd);
    if (created.length === 0) return process.exit(0);

    const lines = ['AUTOPILOT CAPTURED:'];
    for (const t of created) {
      const proj = t.project ? ` [${t.project}]` : '';
      const prio = t.priority && t.priority !== 'normal' ? ` [${t.priority}]` : '';
      const link = t.notion_url ? ` → Notion ✓` : '';
      lines.push(`  #${t.id} "${t.title}"${proj}${prio}${link}`);
    }
    lines.push('Acknowledge briefly to the user; the task is already saved.');

    const out = {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: lines.join('\n')
      }
    };
    process.stdout.write(JSON.stringify(out));
  } catch {
    // Silent fail — never block prompt submission
  }
});

function readConfig() {
  try {
    const p = path.join(__dirname, '..', 'config.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return {}; }
}

// Remove fenced code blocks and inline backticks so triggers inside code
// don't fire ("todo: implement X" in a code snippet should be ignored).
function stripCodeBlocks(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
}

// For each trigger, find lines containing it (word-bounded, case-insensitive),
// extract the captured task text, and return [{ trigger, title, raw_line }].
function findTriggers(text, triggers) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (SHELL_PREFIX.test(line)) continue;

    for (const trig of triggers) {
      const re = new RegExp(`(^|\\s|[,;:!?(])${escapeRegex(trig)}(?=\\s|[,;:!?)]|$)`, 'i');
      const m = line.match(re);
      if (!m || m.index === undefined) continue;
      if (isQuoted(line, m.index, trig)) continue;

      const tail = line.slice(m.index + m[0].length).trim();
      const title = extractTitle(tail);
      if (!title) continue;
      if (out.some(o => o.title.toLowerCase() === title.toLowerCase())) continue;
      out.push({ trigger: trig, title, raw_line: line });
      break;
    }
  }
  return out;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isQuoted(line, idx, trig) {
  const before = line.slice(0, idx);
  const after = line.slice(idx + trig.length);
  const openers = (before.match(/["']/g) || []).length;
  const closersAfter = (after.match(/["']/g) || []).length;
  return openers % 2 === 1 && closersAfter > 0;
}

function extractTitle(tail) {
  let t = tail.split(/[.!?\n]/)[0];
  t = t.replace(/^[:\-—\s]+/, '').trim();
  if (!t) return null;
  if (t.length < 4) return null;
  if (t.length > 200) t = t.slice(0, 200) + '…';
  return t;
}

function parseAttributes(title) {
  const attrs = { priority: 'normal', project: null };
  let cleanTitle = title;
  const pri = cleanTitle.match(PRIORITY_RE);
  if (pri) {
    const k = pri[1].toLowerCase();
    attrs.priority = PRIORITY_MAP[k] || k;
    cleanTitle = cleanTitle.replace(pri[0], '').trim();
  }
  const proj = cleanTitle.match(PROJECT_RE);
  if (proj) {
    const candidate = proj[1].toLowerCase();
    if (!['high', 'low', 'normal', 'urgent', 'высокий', 'низкий', 'обычный'].includes(candidate)) {
      attrs.project = candidate;
      cleanTitle = cleanTitle.replace(proj[0], '').trim();
    }
  }
  return { ...attrs, title: cleanTitle };
}

function detectProjectFromCwd(cwd, cfg) {
  if (!cwd) return null;
  for (const [name, repo] of Object.entries(cfg.repos || {})) {
    if (repo.path && cwd.startsWith(repo.path)) return name;
  }
  return null;
}

async function createTasks(matches, cfg, cwd) {
  const backlog = require('../lib/backlog');
  let notion = null;
  try { notion = require('../lib/notion'); } catch {}

  const created = [];
  for (const m of matches) {
    const parsed = parseAttributes(m.title);
    const project = parsed.project || detectProjectFromCwd(cwd, cfg);

    let task;
    try {
      task = backlog.createTask({
        title: parsed.title,
        project,
        priority: parsed.priority,
        source: 'capture'
      });
    } catch (err) {
      try { require('../lib/errors').log(err, 'userprompt:createTask'); } catch {}
      continue;
    }

    let notionUrl = null;
    if (notion && notion.isEnabled()) {
      try {
        const res = await notion.upsertTask(task);
        if (res?.page_id) {
          backlog.updateTask(task.id, {
            notion: { page_id: res.page_id, url: res.url, last_synced: new Date().toISOString() }
          });
          notionUrl = res.url;
        }
      } catch (err) {
        try { require('../lib/errors').log(err, 'userprompt:notion'); } catch {}
      }
    }

    created.push({
      id: task.id,
      title: task.title,
      project: task.project,
      priority: task.priority,
      notion_url: notionUrl
    });
  }
  return created;
}

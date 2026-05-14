#!/usr/bin/env node
// Autopilot autosave for Codex v1.0.0
//
// Standalone variant of hooks/ap-autosave.js — runs after `codex` exits
// (triggered by the wrapper's trap). No stdin contract; reads everything
// it needs from $AUTOPILOT_HOME/sessions/current.json + optional git diff.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

try { require('../../lib/env').load(); } catch {}

const HOME = process.env.AUTOPILOT_HOME || path.join(os.homedir(), '.codex', 'autopilot');
const SESSIONS_DIR = path.join(HOME, 'sessions');
const CURRENT_FILE = path.join(SESSIONS_DIR, 'current.json');
const SESSION_ID = process.env.AUTOPILOT_SESSION_ID || '';
const EXIT_CODE = parseInt(process.env.AUTOPILOT_EXIT_CODE || '0', 10);

(async () => {
  if (!fs.existsSync(CURRENT_FILE)) return;
  let current;
  try { current = JSON.parse(fs.readFileSync(CURRENT_FILE, 'utf8')); } catch { return; }

  // If user already called /save (status=saved), don't overwrite their snapshot.
  if (current.status === 'saved') return;

  const cwd = current.cwd || process.cwd();
  const project = current.project || detectProject(cwd);
  const gitSummary = readGitSummary(cwd);

  const summary = buildSummary(current, gitSummary, EXIT_CODE);
  const snapshot = {
    cwd,
    summary,
    next_step: '',
    files_touched: [],
    commands_run: [],
    git_summary: gitSummary,
    exit_code: EXIT_CODE,
    last_activity: current.last_activity || null,
    started: current.started || null
  };

  const memory = require('../../lib/memory');
  const wiki = require('../../lib/wiki');
  try {
    memory.saveSession({ summary, project, details: snapshot, session_id: SESSION_ID });
  } catch (err) { logErr('autosave:memory', err); }

  try {
    if (project) wiki.appendSessionToProject(project, snapshot);
  } catch (err) { logErr('autosave:wiki', err); }

  // Mark heartbeat file as exited so next session doesn't think we orphaned.
  try {
    fs.writeFileSync(CURRENT_FILE, JSON.stringify({
      ...current,
      status: 'exited',
      exited: new Date().toISOString(),
      exit_code: EXIT_CODE,
      autosave_summary: summary
    }, null, 2));
  } catch {}
})();

function detectProject(cwd) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(HOME, 'config.json'), 'utf8'));
    for (const [name, repo] of Object.entries(cfg.repos || {})) {
      if (repo.path && cwd.startsWith(repo.path)) return name;
    }
  } catch {}
  return null;
}

function readGitSummary(cwd) {
  try {
    const out = execFileSync('git', ['diff', '--shortstat', 'HEAD'], { cwd, timeout: 2500, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out || '';
  } catch {
    return '';
  }
}

function buildSummary(current, gitSummary, exitCode) {
  const parts = [];
  const started = current.started ? new Date(current.started) : null;
  const ended = new Date();
  if (started) {
    const mins = Math.floor((ended - started) / 60000);
    parts.push(`Codex session ${mins}m`);
  } else {
    parts.push('Codex session');
  }
  if (current.git?.branch) parts.push(`on ${current.git.branch}`);
  if (gitSummary) parts.push(`(${gitSummary})`);
  if (exitCode) parts.push(`exit=${exitCode}`);
  return parts.join(' ');
}

function logErr(where, err) {
  try { require('../../lib/errors').log(err, where); } catch {}
}

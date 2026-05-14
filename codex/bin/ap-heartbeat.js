#!/usr/bin/env node
// Autopilot heartbeat daemon v1.0.0 (Codex port)
//
// Replacement for Claude Code's PostToolUse ContextMonitor.
// Periodically writes an atomic snapshot to:
//   $AUTOPILOT_HOME/sessions/current.json
//
// On clean exit (SIGTERM from wrapper) it sets status="exited" so the
// next wrapper start can distinguish a clean stop from an orphan crash.
//
// Probes attempted on each tick:
//   - cwd                                       (always)
//   - active git branch + uncommitted line count (if cwd is a git repo)
//   - last write time inside ~/.codex/sessions/* (if such dir exists)
//
// Intentionally minimal: no MCP, no Codex internals, no network.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

try { require('../../lib/env').load(); } catch {}

const HOME = process.env.AUTOPILOT_HOME || path.join(os.homedir(), '.codex', 'autopilot');
const SESSIONS_DIR = path.join(HOME, 'sessions');
const CURRENT_FILE = path.join(SESSIONS_DIR, 'current.json');
const SESSION_ID = process.env.AUTOPILOT_SESSION_ID || `codex-${Date.now()}-${process.pid}`;
const INTERVAL_S = Math.max(60, parseInt(process.env.AUTOPILOT_HEARTBEAT_INTERVAL || '360', 10));

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

let lastCodexMtime = 0;
const startedAt = new Date().toISOString();

function detectProject(cwd) {
  try {
    const configPath = path.join(HOME, 'config.json');
    if (!fs.existsSync(configPath)) return null;
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    for (const [name, repo] of Object.entries(cfg.repos || {})) {
      if (repo.path && cwd.startsWith(repo.path)) return name;
    }
  } catch {}
  return null;
}

function gitInfo(cwd) {
  const opts = { cwd, timeout: 1500, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], opts).trim();
    const dirtyLines = dirty ? dirty.split('\n').length : 0;
    return { branch, dirty_lines: dirtyLines };
  } catch {
    return null;
  }
}

function probeCodexActivity() {
  try {
    const codexSessions = path.join(os.homedir(), '.codex', 'sessions');
    if (!fs.existsSync(codexSessions)) return null;
    const files = fs.readdirSync(codexSessions);
    let max = 0;
    for (const f of files) {
      try {
        const st = fs.statSync(path.join(codexSessions, f));
        if (st.mtimeMs > max) max = st.mtimeMs;
      } catch {}
    }
    return max || null;
  } catch {
    return null;
  }
}

function atomicWrite(file, data) {
  const tmp = file + '.tmp';
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmp, json);
  try {
    const fd = fs.openSync(tmp, 'r+');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  } catch {}
  fs.renameSync(tmp, file);
}

function tick() {
  const cwd = process.cwd();
  const now = new Date().toISOString();
  const codexMtime = probeCodexActivity();
  if (codexMtime && codexMtime > lastCodexMtime) lastCodexMtime = codexMtime;

  const snapshot = {
    session_id: SESSION_ID,
    started: startedAt,
    last_activity: now,
    status: 'running',
    pid: process.pid,
    parent_pid: process.ppid,
    cwd,
    project: detectProject(cwd),
    git: gitInfo(cwd),
    codex_last_activity_ms: lastCodexMtime || null,
    interval_s: INTERVAL_S
  };

  try {
    atomicWrite(CURRENT_FILE, snapshot);
  } catch (err) {
    try { require('../../lib/errors').log(err, 'heartbeat:write'); } catch {}
  }
}

function farewell(status) {
  try {
    let cur = {};
    if (fs.existsSync(CURRENT_FILE)) {
      try { cur = JSON.parse(fs.readFileSync(CURRENT_FILE, 'utf8')); } catch {}
    }
    atomicWrite(CURRENT_FILE, { ...cur, status, exited: new Date().toISOString() });
  } catch {}
  process.exit(0);
}

tick();
const timer = setInterval(tick, INTERVAL_S * 1000);
timer.unref?.();

for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => farewell('exited'));
}
process.on('exit', () => {
  try {
    if (fs.existsSync(CURRENT_FILE)) {
      const cur = JSON.parse(fs.readFileSync(CURRENT_FILE, 'utf8'));
      if (cur.status === 'running') atomicWrite(CURRENT_FILE, { ...cur, status: 'exited', exited: new Date().toISOString() });
    }
  } catch {}
});

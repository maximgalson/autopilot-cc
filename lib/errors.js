// Autopilot error logger v1.0.0
// Append-only error log at ~/.claude/autopilot/errors.log.
// Rotates when file exceeds MAX_BYTES (10 MB) — keeps one .1 backup.
// Drop-in replacement for silent `} catch {}` blocks: `errors.log(err, 'where')`.

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_FILE = process.env.AUTOPILOT_ERRORS_LOG
  || path.join(os.homedir(), '.claude', 'autopilot', 'errors.log');
const MAX_BYTES = 10 * 1024 * 1024;

function ensureDir() {
  try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); } catch {}
}

function rotateIfNeeded() {
  try {
    const st = fs.statSync(LOG_FILE);
    if (st.size > MAX_BYTES) {
      try { fs.renameSync(LOG_FILE, LOG_FILE + '.1'); } catch {}
    }
  } catch {
    // file doesn't exist yet — nothing to rotate
  }
}

function log(err, where) {
  ensureDir();
  rotateIfNeeded();
  const ts = new Date().toISOString();
  const msg = (err && err.message) ? err.message : String(err);
  const stack = (err && err.stack) ? err.stack.split('\n').slice(1, 4).join(' | ') : '';
  const line = `${ts} [${where || 'autopilot'}] ${msg}${stack ? '  ' + stack : ''}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

function readTail(n = 20) {
  try {
    const text = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = text.trim().split('\n');
    return lines.slice(-n);
  } catch {
    return [];
  }
}

module.exports = { log, readTail, LOG_FILE };

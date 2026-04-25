// Autopilot env loader v1.0.0
// Reads ~/.claude/autopilot/.env and merges KEY=VALUE pairs into process.env.
// No npm dependency. Idempotent: existing process.env values win over .env.
// Hooks call this once at the top: require('./env').load();

const fs = require('fs');
const path = require('path');
const os = require('os');

const ENV_FILE = process.env.AUTOPILOT_ENV_FILE
  || path.join(os.homedir(), '.claude', 'autopilot', '.env');

let loaded = false;

function parse(text) {
  const out = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function load() {
  if (loaded) return;
  loaded = true;
  if (!fs.existsSync(ENV_FILE)) return;
  try {
    const text = fs.readFileSync(ENV_FILE, 'utf8');
    const vars = parse(text);
    for (const [key, val] of Object.entries(vars)) {
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env unreadable — silent skip; hooks will see env-disabled features
  }
}

module.exports = { load, ENV_FILE };

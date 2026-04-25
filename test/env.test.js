// Smoke tests for lib/env.js — .env parsing and idempotent merging.
// Run: node test/env.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-env-'));
const envFile = path.join(tmp, '.env');
fs.writeFileSync(envFile, [
  '# comment line',
  'PLAIN=value',
  'QUOTED="with spaces"',
  "SINGLE='also fine'",
  'EMPTY=',
  'WITH_EQ=foo=bar',
  '',
  'NOT_A_LINE',
  'TRIM_ME =  trimmed  '
].join('\n'));

process.env.AUTOPILOT_ENV_FILE = envFile;
delete require.cache[require.resolve('../lib/env.js')];
delete process.env.PLAIN;
delete process.env.QUOTED;
delete process.env.SINGLE;
delete process.env.EMPTY;
delete process.env.WITH_EQ;
delete process.env.TRIM_ME;

// pre-existing var should NOT be overwritten
process.env.PRESET = 'kept';
fs.appendFileSync(envFile, '\nPRESET=overridden_should_not_apply\n');

const env = require('../lib/env.js');
env.load();

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('ok', label); }
  else      { fail++; console.log('FAIL', label, extra || ''); }
}

check('plain value', process.env.PLAIN === 'value');
check('double-quoted', process.env.QUOTED === 'with spaces');
check('single-quoted', process.env.SINGLE === 'also fine');
check('empty string', process.env.EMPTY === '');
check('value with =', process.env.WITH_EQ === 'foo=bar');
check('trimmed key/value', process.env.TRIM_ME === 'trimmed');
check('comment skipped', !('# comment line' in process.env));
check('non-line skipped', !('NOT_A_LINE' in process.env));
check('preset env not overwritten', process.env.PRESET === 'kept');

// idempotency
delete process.env.PLAIN;
process.env.PLAIN = 'manual';
env.load(); // already loaded once — should be a no-op now
check('load is idempotent (no re-read)', process.env.PLAIN === 'manual');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

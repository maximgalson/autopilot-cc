// Smoke tests for the capture-trigger parser inside hooks/ap-userprompt.js.
// Run: node test/triggers.test.js
// We exec the hook with a fake stdin and a fake config.json, then assert
// the JSON output (or empty exit) matches expectations.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const HOOK = path.resolve(__dirname, '..', 'hooks', 'ap-userprompt.js');
const REPO = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(REPO, 'config.json');

// Backup any pre-existing config.json so we don't clobber it.
let restoreConfig = null;
if (fs.existsSync(CONFIG_PATH)) {
  restoreConfig = fs.readFileSync(CONFIG_PATH, 'utf8');
}

const TEST_CONFIG = {
  user: { name: 'test', language: 'ru' },
  repos: { demo: { path: '/tmp/demo', keywords: ['demo'] } },
  capture_triggers: ['todo', 'не забыть', 'позже сделать'],
  notion_sync: { enabled: false }
};
fs.writeFileSync(CONFIG_PATH, JSON.stringify(TEST_CONFIG, null, 2));

// Use a scratch backlog so we don't pollute the repo
const scratchBacklog = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-trig-'));
const realBacklog = path.join(REPO, 'backlog');
let restoreBacklog = false;
if (fs.existsSync(realBacklog)) {
  fs.renameSync(realBacklog, realBacklog + '.test-bak');
  restoreBacklog = true;
}
fs.symlinkSync(scratchBacklog, realBacklog);

function runHook(prompt) {
  return new Promise((resolve) => {
    const p = spawn('node', [HOOK], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('close', code => resolve({ out, err, code }));
    p.stdin.end(JSON.stringify({ prompt, session_id: 'test', cwd: '/tmp' }));
  });
}

(async () => {
  let pass = 0, fail = 0;
  function check(label, cond, extra) {
    if (cond) { pass++; console.log('ok', label); }
    else      { fail++; console.log('FAIL', label, extra || ''); }
  }

  // T1 — basic ru
  const r1 = await runHook('todo проверить вебхук в боте');
  check('T1 simple ru trigger captured', r1.out.includes('AUTOPILOT CAPTURED') && r1.out.includes('проверить вебхук'));

  // T2 — priority + project parsing
  const r2 = await runHook('не забыть [high] [demo] выложить статью про autopilot');
  check('T2 priority+project parsed', r2.out.includes('[demo]') && r2.out.includes('[high]') && r2.out.includes('выложить статью'));

  // T3 — shell prefix skip
  const r3 = await runHook('git todo branch -d feature');
  check('T3 shell prefix skipped', !r3.out.includes('AUTOPILOT CAPTURED'));

  // T4 — backticks skip
  const r4 = await runHook('inline code: `todo implement X`');
  check('T4 backticks skipped', !r4.out.includes('AUTOPILOT CAPTURED'));

  // T5 — no trigger present
  const r5 = await runHook('обычный вопрос про код');
  check('T5 no-trigger no-output', !r5.out.includes('AUTOPILOT CAPTURED'));

  // T6 — quoted trigger skip
  const r6 = await runHook('he said "todo this" but I disagree');
  check('T6 quoted skipped', !r6.out.includes('AUTOPILOT CAPTURED'));

  // T7 — empty prompt
  const r7 = await runHook('');
  check('T7 empty prompt no-output', !r7.out.includes('AUTOPILOT CAPTURED'));

  // T8 — unicode word boundary (cyrillic surrounding)
  const r8 = await runHook('Срочно: позже сделать рефакторинг auth');
  check('T8 cyrillic trigger captured', r8.out.includes('AUTOPILOT CAPTURED') && r8.out.includes('рефакторинг'));

  // Cleanup
  fs.rmSync(scratchBacklog, { recursive: true, force: true });
  fs.unlinkSync(realBacklog);
  if (restoreBacklog) fs.renameSync(realBacklog + '.test-bak', realBacklog);
  if (restoreConfig !== null) fs.writeFileSync(CONFIG_PATH, restoreConfig);
  else fs.unlinkSync(CONFIG_PATH);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();

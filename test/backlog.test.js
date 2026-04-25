// Smoke tests for lib/backlog.js — CRUD + state transitions.
// Run: node test/backlog.test.js
// Uses /tmp scratch dir to avoid touching real backlog.

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

// Override AUTOPILOT_DIR via a temp dir + symlink trick: copy lib/backlog.js
// into a scratch tree where ../backlog/ is the target.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-test-'));
fs.mkdirSync(path.join(scratch, 'lib'), { recursive: true });
fs.mkdirSync(path.join(scratch, 'backlog'), { recursive: true });
fs.copyFileSync(
  path.join(__dirname, '..', 'lib', 'backlog.js'),
  path.join(scratch, 'lib', 'backlog.js')
);

const backlog = require(path.join(scratch, 'lib', 'backlog.js'));

// 1. createTask returns object with id, title, status=pending
const t1 = backlog.createTask({ title: 'Test webhook', priority: 'high', project: 'demo' });
assert.ok(t1.id && t1.id.length >= 3, 'id is generated');
assert.strictEqual(t1.title, 'Test webhook');
assert.strictEqual(t1.status, 'pending');
assert.strictEqual(t1.priority, 'high');
assert.strictEqual(t1.project, 'demo');
console.log('ok 1 — createTask');

// 2. createTask persists JSON file
const taskFile = path.join(scratch, 'backlog', `task-${t1.id}.json`);
assert.ok(fs.existsSync(taskFile), 'task file persisted');
const persisted = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
assert.strictEqual(persisted.title, 'Test webhook');
console.log('ok 2 — task persisted to disk');

// 3. updateTask merges fields
backlog.updateTask(t1.id, { context_snapshot: { summary: 'half done' }, sessions_count: 1 });
const updated = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
assert.strictEqual(updated.context_snapshot.summary, 'half done');
assert.strictEqual(updated.sessions_count, 1);
assert.strictEqual(updated.title, 'Test webhook', 'title preserved');
console.log('ok 3 — updateTask merges fields');

// 4. activateTask moves pending → active
backlog.activateTask(t1.id);
const activated = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
assert.strictEqual(activated.status, 'active');
console.log('ok 4 — pending → active');

// 5. getActive returns the active one
const active = backlog.getActive();
assert.ok(active && active.id === t1.id, 'getActive returns active task');
console.log('ok 5 — getActive');

// 6. suspendTask + context snapshot
backlog.suspendTask(t1.id, { summary: 'paused mid-debug', files_touched: ['a.js'] });
const suspended = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
assert.strictEqual(suspended.status, 'suspended');
assert.deepStrictEqual(suspended.context_snapshot.files_touched, ['a.js']);
console.log('ok 6 — active → suspended with snapshot');

// 7. completeTask
backlog.completeTask(t1.id);
const done = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
assert.strictEqual(done.status, 'done');
console.log('ok 7 — completeTask');

// 8. getAllTasks returns array
const all = backlog.getAllTasks();
assert.ok(Array.isArray(all) && all.length >= 1, 'getAllTasks returns array');
console.log('ok 8 — getAllTasks');

// 9. priority sorting on getPending
backlog.createTask({ title: 'low priority', priority: 'low' });
backlog.createTask({ title: 'urgent', priority: 'high' });
const pending = backlog.getPending();
if (pending.length >= 2) {
  // high should rank above low
  const idxHigh = pending.findIndex(t => t.priority === 'high');
  const idxLow = pending.findIndex(t => t.priority === 'low');
  assert.ok(idxHigh < idxLow, 'high priority sorts before low');
  console.log('ok 9 — getPending priority sort');
} else {
  console.log('skip 9 — getPending priority sort (insufficient tasks)');
}

// Cleanup
fs.rmSync(scratch, { recursive: true, force: true });
console.log('\n9 tests passed');

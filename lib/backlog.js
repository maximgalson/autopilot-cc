const fs = require('fs');
const path = require('path');

const BACKLOG_DIR = path.join(__dirname, '..', 'backlog');

// Generate short 3-char ID (base36)
function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id;
  do {
    id = '';
    for (let i = 0; i < 3; i++) id += chars[Math.floor(Math.random() * chars.length)];
  } while (getTask(id)); // avoid collisions
  return id;
}

function ensureDir() {
  if (!fs.existsSync(BACKLOG_DIR)) fs.mkdirSync(BACKLOG_DIR, { recursive: true });
}

function taskPath(id) {
  return path.join(BACKLOG_DIR, `task-${id}.json`);
}

function getTask(id) {
  const p = taskPath(id);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function getAllTasks() {
  ensureDir();
  const files = fs.readdirSync(BACKLOG_DIR).filter(f => f.startsWith('task-') && f.endsWith('.json'));
  return files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(BACKLOG_DIR, f), 'utf8')); } catch { return null; }
  }).filter(Boolean);
}

function getByStatus(status) {
  return getAllTasks().filter(t => t.status === status);
}

function getActive() {
  return getByStatus('active')[0] || null;
}

function getSuspended() {
  return getByStatus('suspended').sort((a, b) => new Date(b.updated) - new Date(a.updated));
}

function getPending() {
  const order = { high: 0, normal: 1, low: 2 };
  return getByStatus('pending').sort((a, b) => (order[a.priority] || 1) - (order[b.priority] || 1));
}

function createTask({ title, project, priority = 'normal', tags = [], source = 'manual', context_snapshot = null }) {
  ensureDir();
  const now = new Date().toISOString();
  const task = {
    id: generateId(),
    title,
    project: project || null,
    status: 'pending',
    priority,
    created: now,
    updated: now,
    context_snapshot: context_snapshot || {},
    tags,
    source
  };
  fs.writeFileSync(taskPath(task.id), JSON.stringify(task, null, 2));
  return task;
}

function updateTask(id, updates) {
  const task = getTask(id);
  if (!task) return null;
  Object.assign(task, updates, { updated: new Date().toISOString() });
  fs.writeFileSync(taskPath(id), JSON.stringify(task, null, 2));
  return task;
}

function activateTask(id) {
  // Deactivate any current active task first
  const current = getActive();
  if (current && current.id !== id) {
    updateTask(current.id, { status: 'suspended' });
  }
  return updateTask(id, { status: 'active' });
}

function suspendTask(id, context_snapshot) {
  const updates = { status: 'suspended' };
  if (context_snapshot) updates.context_snapshot = context_snapshot;
  return updateTask(id, updates);
}

function completeTask(id) {
  return updateTask(id, { status: 'done' });
}

module.exports = {
  generateId, getTask, getAllTasks, getByStatus,
  getActive, getSuspended, getPending,
  createTask, updateTask, activateTask, suspendTask, completeTask,
  BACKLOG_DIR
};

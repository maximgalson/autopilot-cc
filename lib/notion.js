// Autopilot Notion sync v1.0.0
// Bi-directional sync between autopilot backlog and a Notion database.
// No npm dependency — direct REST calls (https://developers.notion.com).
//
// Required env: NOTION_TOKEN (integration secret).
// Required config: notion_sync.enabled = true, notion_sync.database_id = "<32-char hex>".
//
// Schema discovery: on first call, queries the DB schema and remembers which
// properties exist + their type. Only fields present in the target DB are
// synced; missing ones are silently dropped. The integration only requires
// the database to have a `title` property — everything else is optional.

const fs = require('fs');
const path = require('path');

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// ---- Config / state ----------------------------------------------------------

let configCache = null;
let schemaCache = null; // { propsByName, titleProp }

function loadConfig() {
  if (configCache) return configCache;
  try {
    const p = path.join(__dirname, '..', 'config.json');
    configCache = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    configCache = {};
  }
  return configCache;
}

function isEnabled() {
  const cfg = loadConfig();
  return Boolean(
    cfg.notion_sync?.enabled
    && cfg.notion_sync?.database_id
    && process.env.NOTION_TOKEN
  );
}

function dbId() {
  return loadConfig().notion_sync?.database_id || process.env.NOTION_DB_ID || null;
}

// ---- HTTP helpers ------------------------------------------------------------

async function notionFetch(method, urlPath, body) {
  const res = await fetch(`${NOTION_API}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Notion ${method} ${urlPath} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function warn(msg) {
  process.stderr.write(`[autopilot:notion] ${msg}\n`);
}

// ---- Schema discovery --------------------------------------------------------

async function discoverSchema() {
  if (schemaCache) return schemaCache;
  const id = dbId();
  if (!id) return null;
  try {
    const db = await notionFetch('GET', `/databases/${id}`);
    const propsByName = {};
    let titleProp = null;
    for (const [name, prop] of Object.entries(db.properties || {})) {
      propsByName[name.toLowerCase()] = { name, type: prop.type };
      if (prop.type === 'title') titleProp = { name, type: 'title' };
    }
    schemaCache = { propsByName, titleProp };
    return schemaCache;
  } catch (err) {
    warn(`schema discovery failed: ${err.message}`);
    return null;
  }
}

// ---- Property builders -------------------------------------------------------
// Try a few common names; return null if nothing matches.

function findProp(schema, candidates) {
  for (const c of candidates) {
    const key = c.toLowerCase();
    if (schema.propsByName[key]) return schema.propsByName[key];
  }
  return null;
}

function buildPropertyValue(prop, value) {
  if (value === null || value === undefined) return null;
  switch (prop.type) {
    case 'title':
      return { title: [{ text: { content: String(value) } }] };
    case 'rich_text':
      return { rich_text: [{ text: { content: String(value) } }] };
    case 'select':
      return { select: { name: String(value) } };
    case 'status':
      return { status: { name: String(value) } };
    case 'multi_select':
      return { multi_select: (Array.isArray(value) ? value : [value]).map(v => ({ name: String(v) })) };
    case 'date':
      return { date: { start: String(value) } };
    case 'url':
      return { url: String(value) };
    case 'number':
      return { number: Number(value) };
    case 'checkbox':
      return { checkbox: Boolean(value) };
    default:
      return null;
  }
}

function buildProperties(schema, task) {
  const out = {};
  if (schema.titleProp) {
    const v = buildPropertyValue(schema.titleProp, task.title || '(untitled)');
    if (v) out[schema.titleProp.name] = v;
  }
  const fields = [
    { keys: ['status', 'статус'],          value: task.status },
    { keys: ['priority', 'приоритет'],     value: task.priority },
    { keys: ['project', 'проект'],         value: task.project },
    { keys: ['due', 'due date', 'дедлайн'], value: task.due },
    { keys: ['tags', 'теги'],              value: task.tags },
    { keys: ['autopilot id', 'task id'],   value: task.id }
  ];
  for (const { keys, value } of fields) {
    if (value === undefined || value === null) continue;
    const prop = findProp(schema, keys);
    if (!prop) continue;
    const v = buildPropertyValue(prop, value);
    if (v) out[prop.name] = v;
  }
  return out;
}

// ---- Public API --------------------------------------------------------------

// Create or update a Notion page for the given autopilot task.
// Returns { page_id, url } on success, null on failure (silent).
async function upsertTask(task) {
  if (!isEnabled()) return null;
  const schema = await discoverSchema();
  if (!schema || !schema.titleProp) {
    warn('database has no title property or schema unavailable — skip sync');
    return null;
  }
  const properties = buildProperties(schema, task);
  try {
    if (task.notion?.page_id) {
      const res = await notionFetch('PATCH', `/pages/${task.notion.page_id}`, { properties });
      return { page_id: res.id, url: res.url };
    }
    const res = await notionFetch('POST', '/pages', {
      parent: { database_id: dbId() },
      properties
    });
    return { page_id: res.id, url: res.url };
  } catch (err) {
    warn(`upsert failed for #${task.id}: ${err.message}`);
    return null;
  }
}

// Pull pages from Notion that were edited since `sinceISO`.
// Returns array of raw Notion pages. Caller maps them to local tasks.
async function pullChanges(sinceISO) {
  if (!isEnabled()) return [];
  try {
    const filter = sinceISO
      ? { timestamp: 'last_edited_time', last_edited_time: { on_or_after: sinceISO } }
      : undefined;
    const body = { page_size: 50 };
    if (filter) body.filter = filter;
    const res = await notionFetch('POST', `/databases/${dbId()}/query`, body);
    return res.results || [];
  } catch (err) {
    warn(`pullChanges failed: ${err.message}`);
    return [];
  }
}

// Read a property value from a Notion page in a normalized form.
// Returns string | null.
function readProp(page, propName) {
  const p = page.properties?.[propName];
  if (!p) return null;
  switch (p.type) {
    case 'title':       return (p.title || []).map(t => t.plain_text || '').join('');
    case 'rich_text':   return (p.rich_text || []).map(t => t.plain_text || '').join('');
    case 'select':      return p.select?.name || null;
    case 'status':      return p.status?.name || null;
    case 'multi_select':return (p.multi_select || []).map(s => s.name);
    case 'date':        return p.date?.start || null;
    case 'url':         return p.url || null;
    case 'number':      return p.number ?? null;
    case 'checkbox':    return p.checkbox;
    default:            return null;
  }
}

// Find local-overdue tasks (created > 14 days ago, status pending/active)
// and bump their Notion `Due` to today so Notion mobile pushes a reminder.
// Returns count of pages updated.
async function markStaleTasksOverdue(localTasks, { thresholdDays = 14, today = null } = {}) {
  if (!isEnabled()) return 0;
  const schema = await discoverSchema();
  if (!schema) return 0;
  const dueProp = findProp(schema, ['due', 'due date', 'дедлайн']);
  if (!dueProp) return 0;
  const todayStr = today || new Date().toISOString().slice(0, 10);
  const cutoff = Date.now() - thresholdDays * 86400000;

  let updated = 0;
  for (const t of localTasks) {
    if (t.status === 'done') continue;
    if (!t.notion?.page_id) continue;
    const created = Date.parse(t.created || '');
    if (!created || created > cutoff) continue;
    try {
      await notionFetch('PATCH', `/pages/${t.notion.page_id}`, {
        properties: { [dueProp.name]: { date: { start: todayStr } } }
      });
      updated++;
    } catch (err) {
      warn(`markOverdue failed for #${t.id}: ${err.message}`);
    }
  }
  return updated;
}

module.exports = {
  isEnabled,
  upsertTask,
  pullChanges,
  readProp,
  discoverSchema,
  markStaleTasksOverdue
};

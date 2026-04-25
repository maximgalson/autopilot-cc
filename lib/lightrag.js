// Autopilot LightRAG client v1.1.0
// Lightweight HTTP client for hooks (no MCP, direct API).
//
// Credentials come from env vars only. If LIGHTRAG_PASS is missing, every
// call returns null and logs a single warning to stderr — hooks treat that
// as "LightRAG disabled" and skip silently.

const BASE_URL = process.env.LIGHTRAG_URL || 'http://localhost:9621';
const USER = process.env.LIGHTRAG_USER || 'admin';
const PASS = process.env.LIGHTRAG_PASS || '';

let token = null;
let warned = false;

function warnDisabled() {
  if (!warned) {
    process.stderr.write('[autopilot:lightrag] LIGHTRAG_PASS not set — LightRAG calls disabled\n');
    warned = true;
  }
  return null;
}

async function login() {
  if (!PASS) return false;
  try {
    const res = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}`
    });
    if (!res.ok) return false;
    const data = await res.json();
    token = data.access_token;
    return true;
  } catch (err) {
    process.stderr.write(`[autopilot:lightrag] login failed: ${err.message}\n`);
    return false;
  }
}

async function call(path, body) {
  if (!PASS) return warnDisabled();
  if (!token && !(await login())) return null;
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  };
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, opts);
    if (res.status === 401) {
      if (!(await login())) return null;
      opts.headers.Authorization = `Bearer ${token}`;
      res = await fetch(`${BASE_URL}${path}`, opts);
    }
  } catch (err) {
    process.stderr.write(`[autopilot:lightrag] ${path} failed: ${err.message}\n`);
    return null;
  }
  if (!res.ok) return null;
  return res.json();
}

async function insertText(text, source) {
  const body = { text };
  if (source) body.file_source = source;
  return call('/documents/text', body);
}

async function query(queryText, mode = 'local') {
  const data = await call('/query', { query: queryText, mode, only_need_context: true, stream: false });
  return data ? (data.response || null) : null;
}

module.exports = { insertText, query, login, isEnabled: () => Boolean(PASS) };

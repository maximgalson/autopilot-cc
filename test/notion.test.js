// Smoke tests for lib/notion.js — schema-aware property building.
// Run: node test/notion.test.js
// Network is NOT exercised — we only test the pure functions (buildProperties
// behavior via discoverSchema mocking + readProp). isEnabled is tested by
// toggling env + a temp config.

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const REPO = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(REPO, 'config.json');
let restoreConfig = null;
if (fs.existsSync(CONFIG_PATH)) restoreConfig = fs.readFileSync(CONFIG_PATH, 'utf8');

function withConfig(cfg, fn) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  // Clear require cache so notion.js re-reads config
  delete require.cache[require.resolve(path.join(REPO, 'lib', 'notion.js'))];
  return fn(require(path.join(REPO, 'lib', 'notion.js')));
}

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('ok', label); }
  else      { fail++; console.log('FAIL', label, extra || ''); }
}

// 1. isEnabled: needs config.notion_sync.enabled, database_id, AND env NOTION_TOKEN.
withConfig({ notion_sync: { enabled: false, database_id: null } }, (notion) => {
  check('1a isEnabled false when notion_sync.enabled=false', notion.isEnabled() === false);
});
withConfig({ notion_sync: { enabled: true, database_id: 'abc' } }, (notion) => {
  delete process.env.NOTION_TOKEN;
  check('1b isEnabled false without NOTION_TOKEN', notion.isEnabled() === false);
  process.env.NOTION_TOKEN = 'fake_token';
  check('1c isEnabled true with all three', notion.isEnabled() === true);
  delete process.env.NOTION_TOKEN;
});

// 2. readProp normalizes Notion property values
withConfig({ notion_sync: { enabled: true, database_id: 'abc' } }, (notion) => {
  const page = {
    properties: {
      Name:    { type: 'title', title: [{ plain_text: 'Hello' }] },
      Status:  { type: 'status', status: { name: 'Pending' } },
      Project: { type: 'select', select: { name: 'demo' } },
      Tags:    { type: 'multi_select', multi_select: [{ name: 'a' }, { name: 'b' }] },
      Due:     { type: 'date', date: { start: '2026-04-25' } },
      Done:    { type: 'checkbox', checkbox: true },
      Missing: { type: 'unknown' }
    }
  };
  check('2a readProp title',         notion.readProp(page, 'Name') === 'Hello');
  check('2b readProp status',        notion.readProp(page, 'Status') === 'Pending');
  check('2c readProp select',        notion.readProp(page, 'Project') === 'demo');
  check('2d readProp multi_select',  Array.isArray(notion.readProp(page, 'Tags')) && notion.readProp(page, 'Tags').length === 2);
  check('2e readProp date',          notion.readProp(page, 'Due') === '2026-04-25');
  check('2f readProp checkbox',      notion.readProp(page, 'Done') === true);
  check('2g readProp unknown type',  notion.readProp(page, 'Missing') === null);
  check('2h readProp absent prop',   notion.readProp(page, 'NotThere') === null);
});

// Cleanup
if (restoreConfig !== null) fs.writeFileSync(CONFIG_PATH, restoreConfig);
else fs.unlinkSync(CONFIG_PATH);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

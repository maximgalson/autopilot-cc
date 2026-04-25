// Autopilot Wiki Writer v1.1.0
// Append session digests to {WIKI_DIR}/projects/{project}.md.
//
// WIKI_DIR resolution order:
//   1. process.env.WIKI_DIR (explicit override)
//   2. ~/claudecode/wiki (Galson hub convention)
//   3. ~/.claude/autopilot/wiki (fallback inside autopilot data dir)

const fs = require('fs');
const path = require('path');
const os = require('os');

function resolveWikiDir() {
  if (process.env.WIKI_DIR) return process.env.WIKI_DIR;
  const hub = path.join(os.homedir(), 'claudecode', 'wiki');
  if (fs.existsSync(hub)) return hub;
  return path.join(os.homedir(), '.claude', 'autopilot', 'wiki');
}

const WIKI_DIR = resolveWikiDir();

function appendSessionToProject(project, sessionData) {
  if (!project) return false;
  const projectsDir = path.join(WIKI_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) fs.mkdirSync(projectsDir, { recursive: true });

  const filePath = path.join(projectsDir, `${project}.md`);
  const date = new Date().toISOString().slice(0, 10);
  const time = new Date().toISOString().slice(11, 16);

  // Build digest line
  const files = (sessionData.files_touched || []).map(f => path.basename(f)).slice(0, 5);
  const filesStr = files.length > 0 ? ` | files: ${files.join(', ')}` : '';
  const line = `- ${date} ${time} — ${sessionData.summary}${filesStr}`;

  if (!fs.existsSync(filePath)) {
    // Create new wiki page with frontmatter
    const content = `---\nname: ${project}\ndescription: Project activity log\ntype: project\nupdated: ${date}\n---\n\n## Activity\n\n${line}\n`;
    fs.writeFileSync(filePath, content);
    return true;
  }

  // Update existing file
  let content = fs.readFileSync(filePath, 'utf8');

  // Update "updated:" in frontmatter
  content = content.replace(/updated:\s*\d{4}-\d{2}-\d{2}/, `updated: ${date}`);

  // Append to Activity section (newest on top)
  if (content.includes('## Activity')) {
    content = content.replace('## Activity\n', `## Activity\n\n${line}`);
  } else {
    content += `\n## Activity\n\n${line}\n`;
  }

  // Keep only last 30 activity lines to prevent bloat
  const lines = content.split('\n');
  let activityCount = 0;
  const filtered = [];
  let inActivity = false;
  for (const l of lines) {
    if (l.startsWith('## Activity')) inActivity = true;
    if (inActivity && l.startsWith('- 20')) {
      activityCount++;
      if (activityCount > 30) continue;
    }
    if (inActivity && l.startsWith('## ') && l !== '## Activity') inActivity = false;
    filtered.push(l);
  }

  fs.writeFileSync(filePath, filtered.join('\n'));
  return true;
}

module.exports = { appendSessionToProject, WIKI_DIR };

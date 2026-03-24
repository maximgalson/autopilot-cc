const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getRepoStatus(repoPath) {
  if (!fs.existsSync(repoPath)) return { exists: false };

  try {
    const isGit = fs.existsSync(path.join(repoPath, '.git'));
    if (!isGit) return { exists: true, git: false };

    const status = execSync('git status --porcelain', { cwd: repoPath, timeout: 5000, encoding: 'utf8' }).trim();
    const log = execSync('git log --oneline -1 --format="%h %s" 2>/dev/null', { cwd: repoPath, timeout: 3000, encoding: 'utf8' }).trim();
    const branch = execSync('git branch --show-current 2>/dev/null', { cwd: repoPath, timeout: 3000, encoding: 'utf8' }).trim();

    const lines = status ? status.split('\n') : [];
    const modified = lines.filter(l => l.startsWith(' M') || l.startsWith('M ')).length;
    const untracked = lines.filter(l => l.startsWith('??')).length;
    const staged = lines.filter(l => /^[MADRC]/.test(l) && !l.startsWith('??')).length;

    return {
      exists: true,
      git: true,
      branch,
      lastCommit: log,
      modified,
      untracked,
      staged,
      clean: lines.length === 0
    };
  } catch (e) {
    return { exists: true, git: true, error: e.message };
  }
}

function getAllRepoStatuses(config) {
  const results = {};
  for (const [name, repo] of Object.entries(config.repos || {})) {
    results[name] = getRepoStatus(repo.path);
  }
  return results;
}

function formatRepoLine(name, status) {
  if (!status.exists) return `${name}[missing]`;
  if (!status.git) return `${name}[no-git]`;
  if (status.clean) return `${name}[ok]`;

  const parts = [];
  if (status.modified) parts.push(`${status.modified}M`);
  if (status.untracked) parts.push(`${status.untracked}U`);
  if (status.staged) parts.push(`${status.staged}S`);
  return `${name}[${parts.join(',')}]`;
}

module.exports = { getRepoStatus, getAllRepoStatuses, formatRepoLine };

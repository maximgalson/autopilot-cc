#!/usr/bin/env node
// Autopilot Context Monitor v1.0.0
// PostToolUse hook — warns agent when context is getting low

const fs = require('fs');
const os = require('os');
const path = require('path');

const WARNING_THRESHOLD = 35;
const CRITICAL_THRESHOLD = 25;
const STALE_SECONDS = 60;
const DEBOUNCE_CALLS = 5;

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const sessionId = data.session_id;
    if (!sessionId) process.exit(0);

    const tmpDir = os.tmpdir();
    const metricsPath = path.join(tmpDir, `claude-ctx-${sessionId}.json`);

    if (!fs.existsSync(metricsPath)) process.exit(0);

    const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    const now = Math.floor(Date.now() / 1000);

    if (metrics.timestamp && (now - metrics.timestamp) > STALE_SECONDS) process.exit(0);

    const remaining = metrics.remaining_percentage;
    const usedPct = metrics.used_pct;

    if (remaining > WARNING_THRESHOLD) process.exit(0);

    // Debounce
    const warnPath = path.join(tmpDir, `claude-ctx-${sessionId}-warned.json`);
    let warnData = { callsSinceWarn: 0, lastLevel: null };
    let firstWarn = true;

    if (fs.existsSync(warnPath)) {
      try {
        warnData = JSON.parse(fs.readFileSync(warnPath, 'utf8'));
        firstWarn = false;
      } catch (e) {}
    }

    warnData.callsSinceWarn = (warnData.callsSinceWarn || 0) + 1;

    const isCritical = remaining <= CRITICAL_THRESHOLD;
    const currentLevel = isCritical ? 'critical' : 'warning';
    const severityEscalated = currentLevel === 'critical' && warnData.lastLevel === 'warning';

    if (!firstWarn && warnData.callsSinceWarn < DEBOUNCE_CALLS && !severityEscalated) {
      fs.writeFileSync(warnPath, JSON.stringify(warnData));
      process.exit(0);
    }

    warnData.callsSinceWarn = 0;
    warnData.lastLevel = currentLevel;
    fs.writeFileSync(warnPath, JSON.stringify(warnData));

    // Build message — use $TMPDIR for correct macOS temp path
    const savePath = path.join(tmpDir, `autopilot-work-${sessionId}.json`);
    let message;
    if (isCritical) {
      message = `CONTEXT CRITICAL: Usage at ${usedPct}%. Remaining: ${remaining}%. ` +
        'Context is nearly exhausted. Save your current work context by running: ' +
        `echo '{"summary":"...","next_step":"...","files_touched":["..."]}' > ${savePath} ` +
        'Then inform the user that context is low.';
    } else {
      message = `CONTEXT WARNING: Usage at ${usedPct}%. Remaining: ${remaining}%. ` +
        'Context is getting limited. Avoid starting new complex work. ' +
        'Consider saving work context: ' +
        `echo '{"summary":"...","next_step":"...","files_touched":["..."]}' > ${savePath}`;
    }

    const output = {
      hookSpecificOutput: {
        hookEventName: process.env.GEMINI_API_KEY ? 'AfterTool' : 'PostToolUse',
        additionalContext: message
      }
    };

    process.stdout.write(JSON.stringify(output));
  } catch (e) {
    process.exit(0);
  }
});

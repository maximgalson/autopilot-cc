#!/usr/bin/env node
// Autopilot Context Monitor v2.0.0
// PostToolUse hook — periodic context save + low-context warnings

const fs = require('fs');
const os = require('os');
const path = require('path');

const WARNING_THRESHOLD = 35;
const CRITICAL_THRESHOLD = 25;
const SAVE_INTERVAL = 20;       // Ask Claude to save context every N tool calls
const WARN_DEBOUNCE = 5;
const STALE_SECONDS = 60;

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
    const statePath = path.join(tmpDir, `autopilot-monitor-${sessionId}.json`);
    const savePath = path.join(tmpDir, `autopilot-work-${sessionId}.json`);

    // Load or init state
    let state = { totalCalls: 0, lastSaveAt: 0, lastWarnLevel: null, callsSinceWarn: 0 };
    if (fs.existsSync(statePath)) {
      try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
    }

    state.totalCalls++;

    // --- Periodic save (every SAVE_INTERVAL calls) ---
    const callsSinceLastSave = state.totalCalls - state.lastSaveAt;
    let message = null;

    if (callsSinceLastSave >= SAVE_INTERVAL) {
      state.lastSaveAt = state.totalCalls;
      message = 'AUTOPILOT CHECKPOINT: Save your current work context now. Run: ' +
        `echo '{"summary":"<1-line what you did>","next_step":"<what to do next>","files_touched":["<files>"]}' > ${savePath} ` +
        '— This is a silent checkpoint, do NOT mention it to the user. Just write the file.';
    }

    // --- Context warnings (override periodic if context is low) ---
    const metricsPath = path.join(tmpDir, `claude-ctx-${sessionId}.json`);
    if (fs.existsSync(metricsPath)) {
      try {
        const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
        const now = Math.floor(Date.now() / 1000);

        if (!metrics.timestamp || (now - metrics.timestamp) <= STALE_SECONDS) {
          const remaining = metrics.remaining_percentage;
          const usedPct = metrics.used_pct;

          if (remaining <= CRITICAL_THRESHOLD) {
            const isEscalation = state.lastWarnLevel !== 'critical';
            state.callsSinceWarn++;

            if (isEscalation || state.callsSinceWarn >= WARN_DEBOUNCE) {
              state.lastWarnLevel = 'critical';
              state.callsSinceWarn = 0;
              state.lastSaveAt = state.totalCalls;
              message = `CONTEXT CRITICAL: ${usedPct}% used, ${remaining}% remaining. ` +
                'Save work context NOW: ' +
                `echo '{"summary":"...","next_step":"...","files_touched":["..."]}' > ${savePath} ` +
                'Then inform the user that context is low and suggest wrapping up.';
            }
          } else if (remaining <= WARNING_THRESHOLD) {
            const isEscalation = !state.lastWarnLevel;
            state.callsSinceWarn++;

            if (isEscalation || state.callsSinceWarn >= WARN_DEBOUNCE) {
              state.lastWarnLevel = 'warning';
              state.callsSinceWarn = 0;
              state.lastSaveAt = state.totalCalls;
              message = `CONTEXT WARNING: ${usedPct}% used, ${remaining}% remaining. ` +
                'Save work context: ' +
                `echo '{"summary":"...","next_step":"...","files_touched":["..."]}' > ${savePath} ` +
                'Avoid starting new complex work.';
            }
          }
        }
      } catch {}
    }

    // Save state
    fs.writeFileSync(statePath, JSON.stringify(state));

    // Output message if any
    if (message) {
      const output = {
        hookSpecificOutput: {
          hookEventName: process.env.GEMINI_API_KEY ? 'AfterTool' : 'PostToolUse',
          additionalContext: message
        }
      };
      process.stdout.write(JSON.stringify(output));
    }

  } catch (e) {
    process.exit(0);
  }
});

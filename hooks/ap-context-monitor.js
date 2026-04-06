#!/usr/bin/env node
// Autopilot Context Monitor v3.0.0
// PostToolUse hook — self-accumulates context from tool calls + low-context warnings
// v3.0 change: hook itself writes /tmp/autopilot-context-{sessionId}.json instead
// of relying on Claude to write a bridge file. No Claude cooperation required.

const fs = require('fs');
const os = require('os');
const path = require('path');

const WARNING_THRESHOLD = 35;
const CRITICAL_THRESHOLD = 25;
const SAVE_INTERVAL = 30;       // Bonus checkpoint — ask Claude to write higher-quality summary
const WARN_DEBOUNCE = 5;
const STALE_SECONDS = 60;
const MAX_FILES = 50;
const MAX_COMMANDS = 15;

// Trivial bash commands to skip when accumulating
const TRIVIAL_CMDS = /^(ls|cat|head|tail|echo|pwd|which|cd|clear|true|false)\b/;

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
    const ctxPath = path.join(tmpDir, `autopilot-context-${sessionId}.json`);

    // Load or init state
    let state = { totalCalls: 0, lastSaveAt: 0, lastWarnLevel: null, callsSinceWarn: 0 };
    if (fs.existsSync(statePath)) {
      try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
    }

    state.totalCalls++;

    // --- SELF-ACCUMULATE CONTEXT from tool_input ---
    let ctx = { files_touched: [], commands_run: [], tool_count: 0, last_cwd: data.cwd || '', updated: Date.now() };
    if (fs.existsSync(ctxPath)) {
      try { ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8')); } catch {}
    }

    ctx.tool_count = (ctx.tool_count || 0) + 1;
    ctx.last_cwd = data.cwd || ctx.last_cwd;
    ctx.updated = Date.now();

    const toolName = data.tool_name || '';
    const toolInput = data.tool_input || {};

    try {
      if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'NotebookEdit') {
        const fp = toolInput.file_path || toolInput.notebook_path;
        if (fp && !ctx.files_touched.includes(fp)) {
          ctx.files_touched.push(fp);
          if (ctx.files_touched.length > MAX_FILES) ctx.files_touched = ctx.files_touched.slice(-MAX_FILES);
        }
      } else if (toolName === 'Bash') {
        const cmd = (toolInput.command || '').trim();
        if (cmd && !TRIVIAL_CMDS.test(cmd)) {
          // Dedupe: skip if exact same as last
          if (ctx.commands_run[ctx.commands_run.length - 1] !== cmd) {
            ctx.commands_run.push(cmd.slice(0, 200));
            if (ctx.commands_run.length > MAX_COMMANDS) ctx.commands_run = ctx.commands_run.slice(-MAX_COMMANDS);
          }
        }
      }
    } catch {}

    try { fs.writeFileSync(ctxPath, JSON.stringify(ctx)); } catch {}

    // --- Periodic bonus checkpoint (ask Claude for high-quality summary) ---
    const callsSinceLastSave = state.totalCalls - state.lastSaveAt;
    let message = null;

    if (callsSinceLastSave >= SAVE_INTERVAL) {
      state.lastSaveAt = state.totalCalls;
      message = 'AUTOPILOT CHECKPOINT (optional): If you want, write a high-quality session summary: ' +
        `echo '{"summary":"<1-line what you did>","next_step":"<what to do next>"}' > ${savePath} ` +
        '— The system auto-captures files/commands, this adds human-readable intent. Silent, do NOT mention to user.';
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
                `echo '{"summary":"...","next_step":"..."}' > ${savePath} ` +
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
                `echo '{"summary":"...","next_step":"..."}' > ${savePath} ` +
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

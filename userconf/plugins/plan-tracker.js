/**
 * Plan Tracker Gate Plugin
 * 
 * Blocks git push if plan has pending TODO items.
 * Blocks cd + git mixing (use workdir instead of cd).
 * Blocks git -C (use workdir instead of git -C <path>).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findRepoRoot(startDir) {
  let current = startDir;
  while (true) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

const REPO_ROOT = findRepoRoot(__dirname);
const PLAN_TRACKER_PATH = REPO_ROOT ? join(REPO_ROOT, "shared", "hooks", "plan-tracker.py") : null;

// Split command by && and ;, respecting quotes
function splitCommands(command) {
  const segments = [];
  let current = "";
  let quote = null;
  let i = 0;
  
  while (i < command.length) {
    const ch = command[i];
    
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === "&" && command[i + 1] === "&") {
      // Found &&
      if (current.trim()) segments.push(current.trim());
      current = "";
      i++; // skip second &
    } else if (ch === ";") {
      // Found ;
      if (current.trim()) segments.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
    i++;
  }
  
  if (current.trim()) segments.push(current.trim());
  return segments;
}

const SHELL_WRAPPERS = new Set(["exec", "command", "sudo", "nohup", "env"]);

function isGitCommand(segment) {
  const parts = segment.trim().split(/\s+/);
  let idx = 0;
  while (idx < parts.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(parts[idx])) {
    idx++;
  }
  while (idx < parts.length && SHELL_WRAPPERS.has(parts[idx])) {
    idx++;
  }
  const cmd = parts[idx];
  return basename(cmd || "") === "git";
}

function isCdCommand(segment) {
  const parts = segment.trim().split(/\s+/);
  let idx = 0;
  while (idx < parts.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(parts[idx])) {
    idx++;
  }
  while (idx < parts.length && SHELL_WRAPPERS.has(parts[idx])) {
    idx++;
  }
  return parts[idx] === "cd";
}

function hasGitC(command) {
  return /\bgit\s+(?:\S+\s+)*-C\b/.test(command);
}

// Log warning once if script not found
let warningLogged = false;
function logScriptWarning() {
  if (!warningLogged && !PLAN_TRACKER_PATH) {
    console.error("[PlanTracker] Warning: cannot find repo root or plan-tracker.py");
    warningLogged = true;
  }
}

export const PlanTrackerGate = async (ctx) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return;

      const command = output.args?.command;
      if (typeof command !== "string" || !command.trim()) return;

      // Split by && and ;
      const segments = splitCommands(command);

      // Block cd + git mixing
      const hasCd = segments.some(isCdCommand);
      const hasGit = segments.some(isGitCommand);

      if (hasCd && hasGit) {
        throw new Error(
          "禁止 cd 与 git 命令组合使用。\n" +
          "- 切换目录：用 bash tool 的 workdir 参数，不要 cd\n" +
          "- 混合 git 与非 git 命令（如 npm test && git push）是允许的"
        );
      }

      // Block git -C (always)
      if (hasGitC(command)) {
        throw new Error(
          "禁止 git -C 方式。\n" +
          "- 切换目录：用 bash tool 的 workdir 参数，不要 git -C <path>"
        );
      }

      // If command doesn't contain 'git push', we're done
      // Pattern limits to 5 tokens between git and push to avoid ReDoS
      if (!/\bgit\s+(?:\S+\s+){0,5}push(?=\s|$)/.test(command)) return;

      // Skip dry-run, mirror, etc.
      if (/(?:--dry-run|--mirror|-n)\b/.test(command)) return;

      // Scan the actual repo
      // git -C is already blocked above, so only workdir or cwd
      const repoRoot = output.args?.workdir || process.cwd();
      
      try {
        await runPlanTracker(repoRoot);
      } catch (error) {
        if (error.message.startsWith("[tool]")) {
          throw new Error(`[tool] Plan tracker error: ${error.message}`);
        }
        throw new Error(
          `Git push blocked: Plan has pending TODO items.\n\n` +
          `${error.message}\n\n` +
          `Please complete all TODOs or mark them as DONE before pushing.\n` +
          `重新阅读 verification-before-completion skill，确认所有验证项已落实。`
        );
      }
    },
  };
};

function runPlanTracker(repoRoot) {
  if (!PLAN_TRACKER_PATH || !existsSync(PLAN_TRACKER_PATH)) {
    logScriptWarning();
    return Promise.resolve();
  }

  return new Promise((resolvePromise, reject) => {
    const proc = spawn("python3", [PLAN_TRACKER_PATH, repoRoot], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code, signal) => {
      if (signal === "SIGTERM") {
        console.error("[PlanTracker] Timeout (30s) exceeded");
        resolvePromise();
        return;
      }
      if (code === 0) {
        resolvePromise();
      } else if (code === 1) {
        const output = stdout.trim();
        reject(new Error(output || "Plan has pending TODO items"));
      } else {
        const errMsg = stderr.trim() || `exit code ${code}`;
        console.error("[PlanTracker] Python script error:", errMsg);
        reject(new Error(`[tool] Plan tracker failed: ${errMsg}`));
      }
    });

    proc.on("error", (err) => {
      console.error("[PlanTracker] Failed to run plan-tracker.py:", err.message);
      resolvePromise();
    });
  });
}

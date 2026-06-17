/**
 * Plan Tracker Gate Plugin
 * 
 * Blocks git push if plan has pending TODO items.
 * Also enforces rule: && cannot mix git and non-git commands.
 */

import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join, dirname, basename, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

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

// Allow temp dirs (aligned with rm-outside-workspace-guard)
const ALLOWED_DIRS = Array.from(new Set([
  REPO_ROOT,
  tmpdir(),
  realpathSync(tmpdir()),
  "/tmp",
  realpathSync("/tmp"),
  "/private/tmp",
].filter(Boolean))).map(d => realpathSync(d));
const PLAN_TRACKER_PATH = REPO_ROOT ? join(REPO_ROOT, "shared", "hooks", "plan-tracker.py") : null;

// Split command by &&, respecting quotes
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

function extractGitCPath(command) {
  const match = command.match(/\bgit\s+-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (match) {
    const rawPath = match[1] || match[2] || match[3];
    // Resolve to absolute path
    const resolved = resolvePath(rawPath);
    const realResolved = realpathSync(resolved);
    // Validate within workspace or temp dirs (aligned with rm guard)
    const isAllowed = ALLOWED_DIRS.some(d => realResolved.startsWith(d)) || 
                      realResolved.startsWith(realpathSync(process.cwd()));
    if (!isAllowed) {
      throw new Error(`Path ${resolved} is outside workspace (${REPO_ROOT || process.cwd()})`);
    }
    return resolved;
  }
  return null;
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

      // Split by &&
      const segments = splitCommands(command);
      
      // Check for git/non-git mixing
      const hasGit = segments.some(isGitCommand);
      const hasNonGit = segments.some(seg => !isGitCommand(seg));
      
      if (hasGit && hasNonGit) {
        throw new Error(
          "禁止 && 组合 git 与非 git 命令。\n\n" +
          "- 单个 git 命令（如 git push）：直接用\n" +
          "- 多个 git 命令（如 git add && git commit）：允许\n" +
          "- 切换目录：用 bash tool 的 workdir 参数，不要用 cd\n" +
          "- 测试/构建后再 push：分两次 bash 调用"
        );
      }

      // If command doesn't contain 'git push', we're done
      // Pattern limits to 5 tokens between git and push to avoid ReDoS
      if (!/\bgit\s+(?:\S+\s+){0,5}push\b/.test(command)) return;

      // Skip dry-run, mirror, etc.
      if (/(?:--dry-run|--mirror|-n)\b/.test(command)) return;

      // Scan the actual repo (from workdir or git -C or cwd)
      // Priority: workdir > git -C path > cwd
      // workdir is IDE/Agent explicit context (most trusted), git -C is user hint
      const repoRoot = output.args?.workdir || extractGitCPath(command) || process.cwd();
      
      try {
        await runPlanTracker(repoRoot);
      } catch (error) {
        if (error.message.startsWith("[tool]")) {
          throw new Error(`[tool] Plan tracker error: ${error.message}`);
        }
        throw new Error(
          `Git push blocked: Plan has pending TODO items.\n\n` +
          `${error.message}\n\n` +
          `Please complete all TODOs or mark them as DONE before pushing.`
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

/**
 * Plan Tracker Gate Plugin
 * 
 * Blocks git push if plan has pending TODO items.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Derive repo root from plugin location, walk up to find repo root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_DIR = __dirname;

// Walk up directory tree to find repo root
function findRepoRoot(startDir) {
  let current = startDir;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

const REPO_ROOT = findRepoRoot(PLUGIN_DIR);
const PLAN_TRACKER_PATH = REPO_ROOT ? join(REPO_ROOT, "shared", "hooks", "plan-tracker.py") : null;

// Log warning once if script not found
let warningLogged = false;
function logScriptWarning() {
  if (!warningLogged && !PLAN_TRACKER_PATH) {
    console.error("[PlanTracker] Warning: cannot find repo root or plan-tracker.py");
    warningLogged = true;
  }
}

export const PlanTrackerGate = async (ctx) => {
  const hooks = {
    before: async (input, output) => {
      // Only intercept bash tools
      if (input.tool !== "bash") {
        return;
      }

      // Get the command
      const command = output.args?.command;
      if (typeof command !== "string" || !command.trim()) {
        return;
      }

      // Only intercept real git push commands (exclude dry-run, mirror, etc.)
      if (!/^git(?:(\s+[\w-]+)*)\s+push(\s|$)/.test(command)) {
        return;
      }

      // Skip if this is a dry-run, mirror, or no-op push
      if (/(?:--dry-run|--mirror|-n)\b/.test(command)) {
        return;
      }

      // Run plan-tracker.py
      try {
        await runPlanTracker();
        // Exit code 0: no active plans or all TODOs done, allow push
        return;
      } catch (error) {
        // Exit code 1: has pending TODOs, block push
        throw new Error(
          `Git push blocked: Plan has pending TODO items.\n\n` +
          `${error.message}\n\n` +
          `Please complete all TODOs or mark them as DONE before pushing.`
        );
      }
    },
  };

  return hooks;
};

function runPlanTracker() {
  if (!PLAN_TRACKER_PATH || !REPO_ROOT) {
    logScriptWarning();
    return Promise.resolve();
  }

  if (!existsSync(PLAN_TRACKER_PATH)) {
    logScriptWarning();
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [PLAN_TRACKER_PATH, REPO_ROOT], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else if (code === 1) {
        // Has pending TODOs — stdout already contains the formatted message
        const output = stdout.trim();
        reject(new Error(output || "Plan has pending TODO items"));
      } else {
        // Unexpected error — include stderr for diagnosis
        const errMsg = stderr.trim() || `exit code ${code}`;
        console.error("[PlanTracker] Python script error:", errMsg);
        reject(new Error(`Plan tracker failed: ${errMsg}`));
      }
    });

    proc.on("error", (err) => {
      // Failed to spawn (e.g. python3 not found) — fail open
      console.error("[PlanTracker] Failed to run plan-tracker.py:", err.message);
      resolve();
    });
  });
}

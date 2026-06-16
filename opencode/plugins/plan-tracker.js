/**
 * Plan Tracker Gate Plugin
 * 
 * Blocks git push if plan has pending TODO items.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

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

      // Only intercept git push commands
      if (!/^git\s+push(\s|$)/.test(command)) {
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
  return new Promise((resolve, reject) => {
    // Find plan-tracker.py relative to the plugin
    const pluginDir = new URL(".", import.meta.url).pathname;
    const planTrackerPath = join(pluginDir, "..", "..", "shared", "hooks", "plan-tracker.py");
    const repoRoot = join(pluginDir, "..", "..");

    if (!existsSync(planTrackerPath)) {
      // Script not found, allow push (fail open)
      resolve();
      return;
    }

    const proc = spawn("python3", [planTrackerPath, repoRoot], {
      cwd: repoRoot,
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
        // Has pending TODOs
        reject(new Error(stdout.trim()));
      } else {
        // Unexpected error, block push to be safe
        reject(new Error(`plan-tracker.py failed with exit code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      // Failed to spawn, fail open
      console.error("[PlanTrackerGate] Failed to run plan-tracker.py:", err.message);
      resolve();
    });
  });
}

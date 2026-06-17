---
name: opencode-deepseek-worker
description: Use when dispatching OpenCode DeepSeek worker tasks, especially superpowers implementer or worker subagents, bounded implementation slices from natural-language prompts, isolated worktree candidate diffs, optional write-scope guarded edits, or opencode deepseekv4pro worker prompts.
---

# OpenCode DeepSeek Worker

Use `opencode + deepseekv4pro` as the default implementation producer for
Superpowers implementer / worker tasks. Treat it as a candidate-diff generator
running in an isolated git worktree, not as a reviewer, architect, validator, or
security sandbox.

The primary agent remains responsible for task decomposition, architecture,
review, integration, and final judgment.

## Use For

- Bounded module or feature slices with a concrete natural-language prompt.
- Localized bug fixes after the root cause is narrowed.
- Tests, docs, fixtures, or mechanical code generation for a specific subsystem.
- Superpowers `subagent-driven-development` implementer / worker tasks.

## Do Not Use For

- Broad architecture, product design, or migration decisions.
- Ambiguous bug hunts where the root cause is not narrowed.
- Final code review, final integration judgment, security-sensitive approval, or
  policy decisions.
- Unbounded repository-wide edits.

## Dispatch Flow

1. Write a short, concrete prompt with the objective, relevant context,
   constraints, expected tests when needed, and non-goals.
2. Run the bundled worker:

```bash
SKILL_HOME="${CLAUDE_CONFIG_HOME}/userconf/skills/opencode-deepseek-worker"

"$SKILL_HOME/bin/run.sh" \
  --repo /path/to/repo \
  --prompt "Implement the small auth helper described in the current plan."
```

3. Read the returned JSON. The worker writes code in the returned `worktree`,
   not in the main checkout.
4. Inspect `status`, `changed_files`, `diff`, `write_scope`, and `validation`.
   Treat the patch as untrusted even when `status=success`.
5. Integrate only approved changes into the main checkout, then rerun validation
   from the main checkout.

## Useful Knobs

- `--base <ref>`: base ref for the detached worker worktree. Default: `HEAD`.
- `--prompt <text>`: inline natural-language task prompt. Preferred input.
- `--task <file>`: read the prompt from a file for unusually long prompts;
  legacy-compatible with older task capsule usage.
- `--write-scope <paths>`: optional comma-separated files, directories, or glob
  patterns. Use it when edits must be constrained; omit it for a complete small
  module where the main agent wants the worker to choose the local file set.
- `--validation <cmd>`: optional worker-side validation. Prefer putting test
  expectations in the prompt and rerunning validation after integrating in the
  main checkout.
- `--model <id>`: override `OPENCODE_DEEPSEEK_MODEL`.
- `--keep`: keep the temporary worker root for debugging.
- `OPENCODE_DEEPSEEK_AUTH_FILE`: auth file copied into the isolated worker data
  dir.
- `OPENCODE_DEEPSEEK_IDLE_TIMEOUT_SECONDS`: kill the worker after no JSONL or
  stderr output for this many seconds.

## Result Fields

- `status`: `success`, `failed`, or `rejected`; treat `rejected` as a hard stop.
- `worktree`: detached worktree containing generated files.
- `changed_files`: files changed by the worker.
- `diff`: tracked and untracked diff.
- `write_scope`: guard status and violation output. Empty when no scope was
  passed.
- `validation`: command, exit code, and output tail. Empty when no validation
  command was passed.

## Common Mistakes

- Giving DeepSeek a vague product task instead of a bounded module slice.
- Letting DeepSeek choose the architecture.
- Trusting the worker summary without inspecting the diff.
- Skipping main-session validation after integration.
- Using DeepSeek for review or final approval.

---
name: opencode-deepseek-worker
description: Use when delegating a bounded coding subtask to an isolated OpenCode DeepSeek worker from a primary Claude/Codex/GPT orchestration session
---

# OpenCode DeepSeek Worker

## Overview

Use this skill to dispatch small, independent engineering tasks to the local
`opencode + deepseekv4pro` worker while the primary model stays responsible for
architecture, review, integration, and final judgment.

The worker is not a security sandbox. It uses the real machine environment and
project toolchains, but isolates OpenCode agent configuration with clean XDG
directories and `opencode run --pure --dangerously-skip-permissions`.

It intentionally shares only OpenCode authentication by copying
`~/.local/share/opencode/auth.json` into the temporary worker data directory.
Override this with `OPENCODE_DEEPSEEK_AUTH_FILE` when needed.

## When To Use

- Implement a bounded module or feature slice, such as a login module or a
  focused parser.
- Apply a localized bug fix where the likely edit area is known.
- Generate tests or docs for a specific subsystem.

Do not use it for broad architecture, cross-cutting bug hunts, large admin
systems, ambiguous product design, or final code review.

## Dispatch Checklist

1. Define the task capsule in a temporary Markdown file.
2. Choose a module-sized write scope, not a single-file micro-plan unless the
   task naturally requires one.
3. Include read context, constraints, validation, and non-goals in the capsule.
4. Run the worker.
5. Read the returned JSON. The worker writes code in the returned `worktree`,
   not in the main checkout.
6. Inspect `changed_files`, `diff`, and the files inside `worktree` before
   applying anything to the main checkout.
7. Integrate deliberately from the worker worktree into the main checkout.
8. Run local validation in the main session after integration.

## Operating Flow

The worker is a producer of a candidate diff, not an in-place editor of the
main checkout.

1. **Prepare a task capsule.** Put the objective, read context, allowed write
   scope, constraints, validation command, and non-goals in a temporary
   Markdown file.
2. **Run `bin/run.sh`.** Pass the target repo, task capsule, module-sized
   `--write-scope`, and validation command.
3. **Wait for JSON output.** The command exits after OpenCode finishes,
   write-scope checking runs, and optional validation completes.
4. **Locate the worker output.** The JSON field `worktree` is the detached git
   worktree where DeepSeek wrote files. The main repo is unchanged unless the
   primary session later integrates the diff.
5. **Review before integration.** Inspect `status`, `changed_files`, `diff`,
   `write_scope`, and `validation`. For `status=success`, still review the
   patch as untrusted code.
6. **Integrate only approved changes.** Apply the accepted diff to the main
   checkout or copy specific reviewed files from `worktree`; do not assume every
   generated file should be kept.
7. **Verify in the main session.** Re-run the relevant tests from the main
   checkout after integration. The primary model owns final correctness.

Useful inspection commands after a run:

```bash
git -C "$WORKTREE" status --short
git -C "$WORKTREE" diff
git -C "$WORKTREE" ls-files --others --exclude-standard
```

Typical integration options:

```bash
# Apply the whole reviewed worker diff to the main checkout.
git -C "$WORKTREE" diff > /tmp/worker.patch
git -C /path/to/main-checkout apply /tmp/worker.patch

# Or copy one reviewed file from the worker worktree.
cp "$WORKTREE/src/auth/login.py" /path/to/main-checkout/src/auth/login.py
```

After integrating, run the validation command again from the main checkout.

## Command

```bash
SKILL_HOME="${CLAUDE_CONFIG_HOME:-/Users/mhbzhy/claude-config}/claude-skills/opencode-deepseek-worker"

"$SKILL_HOME/bin/run.sh" \
  --repo /path/to/repo \
  --task /tmp/task-capsule.md \
  --write-scope src/auth,tests/auth \
  --validation "pytest tests/auth"
```

Optional flags:

- `--base <ref>`: base ref for the detached worker worktree. Default: `HEAD`.
- `--write-scope <paths>`: comma-separated files, directories, or glob patterns.
- `--model <id>`: override `OPENCODE_DEEPSEEK_MODEL`.
- `--keep`: keep the temporary worker root for debugging.

Useful environment variables:

- `OPENCODE_DEEPSEEK_AUTH_FILE`: auth file copied into the isolated worker data
  dir. Defaults to `~/.local/share/opencode/auth.json`.
- `OPENCODE_DEEPSEEK_IDLE_TIMEOUT_SECONDS`: seconds without OpenCode JSONL or
  stderr output before the worker is killed. Defaults to `180`.
- `OPENCODE_DEEPSEEK_MONITOR_INTERVAL_SECONDS`: watchdog polling interval.
  Defaults to `1`.

## Task Capsule Template

````markdown
# Objective

[One concrete outcome.]

# Read Context

- [Files/directories/specs the worker should inspect first.]

# Allowed Write Scope

- src/auth
- tests/auth

# Constraints

- Do not add dependencies unless explicitly necessary.
- Follow existing local style.
- Keep the change focused.

# Validation

```bash
pytest tests/auth
```

# Non-Goals

- [What the worker must not broaden into.]
````

## Result Handling

The runner prints JSON with:

- `status`: `success`, `failed`, or `rejected`.
- `worktree`: temporary detached worktree path.
- `changed_files`: files changed by the worker.
- `diff`: tracked and untracked diff.
- `write_scope`: guard status and violation output.
- `validation`: command, exit code, and output tail.

Treat `rejected` as a hard stop. For `failed`, inspect the diff only if the
failure is understandable and locally recoverable.

`worktree` is the source of truth for generated files. If the user asks "where
did the worker write the code?", answer with the exact `worktree` path from the
JSON and the files listed in `changed_files`.

## Common Mistakes

- Giving the worker a whole product or vague bug hunt instead of a bounded task.
- Over-constraining the write scope to exact files before the worker has enough
  room to plan a coherent module change.
- Trusting the worker summary without inspecting the diff.
- Skipping main-session validation after integrating worker output.

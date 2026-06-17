---
name: claude-code-worker
description: Use when dispatching isolated Claude Code worker tasks through a private Anthropic-compatible API endpoint from a skill-local .env file. Applies to bounded implementation slices, candidate diffs in detached git worktrees, clean Claude Code runs that must not inherit user/project Claude config, and workflows that must avoid official Anthropic/Claude service endpoints.
---

# Claude Code Worker

Run a clean `claude` CLI instance as a bounded patch worker. Treat the result as
an untrusted candidate diff generated in an isolated git worktree.

The primary agent remains responsible for task decomposition, architecture,
review, integration, and final judgment.

## Use For

- Bounded module or feature slices with a clear write scope.
- Localized fixes after the root cause is narrowed.
- Tests, docs, fixtures, or mechanical edits for a specific subsystem.
- Comparing candidate patches from Claude Code against other worker outputs.

## Do Not Use For

- Broad architecture, product decisions, or ambiguous bug hunts.
- Final review, security approval, or integration judgment.
- Unbounded repository-wide edits.
- Any project where source diffs must not leave the host or approved gateway.

## Endpoint Contract

This worker requires a skill-local `.env` file by default:

```bash
cp "${CLAUDE_CONFIG_HOME}/claude-skills/claude-code-worker/.env.example" \
   "${CLAUDE_CONFIG_HOME}/claude-skills/claude-code-worker/.env"
```

The `.env` file must set `ANTHROPIC_BASE_URL` to a private or third-party
Anthropic-compatible gateway. The runner rejects official Anthropic/Claude hosts
such as `api.anthropic.com` and `claude.ai`.

Set either `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`, depending on the
gateway. When only `ANTHROPIC_AUTH_TOKEN` is set, the runner creates a temporary
`apiKeyHelper` for Claude Code `--bare` mode without writing the token into
`settings.json`. Keep `.env` uncommitted.

## Dispatch Flow

1. Create a task capsule with objective, read context, allowed write scope,
   constraints, validation command, and non-goals.
2. Run the bundled worker:

```bash
SKILL_HOME="${CLAUDE_CONFIG_HOME:-/Users/zhanghaiyang/claude-personal-config}/claude-skills/claude-code-worker"

"${SKILL_HOME}/bin/run.sh" \
  --repo /path/to/repo \
  --task /tmp/task-capsule.md \
  --write-scope src/auth,tests/auth \
  --validation "pytest tests/auth"
```

3. Read the returned JSON. The worker writes in the returned `worktree`, not in
   the main checkout.
4. Inspect `status`, `changed_files`, `diff`, `write_scope`, `validation`, and
   `claude_exit_code`. Treat the patch as untrusted even when `status=success`.
5. Integrate only approved changes into the main checkout, then rerun validation
   from the main checkout.

## Useful Knobs

- `--base <ref>`: base ref for the detached worker worktree. Default: `HEAD`.
- `--env <file>`: dotenv file to source. Default:
  `CLAUDE_CODE_WORKER_ENV_FILE` or skill-local `.env`.
- `--write-scope <paths>`: comma-separated files, directories, or glob patterns.
- `--model <id>`: override `CLAUDE_CODE_WORKER_MODEL` / `ANTHROPIC_MODEL`.
- `--keep`: keep the temporary worker root for debugging.
- `CLAUDE_CODE_WORKER_IDLE_TIMEOUT_SECONDS`: kill the worker after no output for
  this many seconds.
- `CLAUDE_CODE_WORKER_ALLOW_NO_AUTH=1`: allow local gateways with no auth.

## Result Fields

- `status`: `success`, `failed`, or `rejected`; treat `rejected` as a hard stop.
- `worktree`: detached worktree containing generated files.
- `changed_files`: files changed by the worker.
- `diff`: tracked and untracked diff.
- `summary`: stderr tail from `claude`.
- `claude_output_tail`: JSONL/text output tail from `claude`.
- `write_scope`: guard status and violation output.
- `validation`: command, exit code, and output tail.

## Common Mistakes

- Running without a private `ANTHROPIC_BASE_URL`.
- Letting the worker inherit the user's normal `~/.claude` config.
- Trusting the worker summary without inspecting the diff.
- Skipping main-session validation after integration.
- Using this worker as a reviewer or final approver.

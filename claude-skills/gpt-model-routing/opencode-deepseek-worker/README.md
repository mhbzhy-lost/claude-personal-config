# OpenCode DeepSeek Worker

Isolated `opencode + deepseekv4pro` worker runtime for Codex/GPT-5.5 orchestration.

The worker is not a sandbox. It runs on the same machine and can use the same
Python, Node, uv, pnpm, and project toolchains as the host. Its isolation target
is agent configuration: it must not inherit the user's main OpenCode config,
plugins, skills, sessions, or Superpowers context.

## Flow

```text
Codex / GPT-5.5
  -> task capsule
  -> claude-skills/gpt-model-routing/opencode-deepseek-worker/bin/run.sh
  -> clean OpenCode XDG dirs + isolated git worktree
  -> opencode run
  -> diff + write-scope guard + validation result
```

## Usage

```bash
claude-skills/gpt-model-routing/opencode-deepseek-worker/bin/run.sh \
  --repo /path/to/repo \
  --task /tmp/task-capsule.md \
  --write-scope src/auth,tests/auth \
  --validation "pytest tests/auth"
```

Optional:

- `--base <ref>`: base commit/ref for the worker branch. Defaults to `HEAD`.
- `--write-scope <paths>`: comma-separated files, directories, or glob patterns
  the worker may modify. This is deliberately module-sized rather than
  file-only. Examples: `src/auth,tests/auth`, `src/**/*.py`, `package.json`.
  `--write-set` remains as a backward-compatible alias.
- `--model <provider/model>`: defaults to `$OPENCODE_DEEPSEEK_MODEL`, then
  `deepseek/deepseek-v4-pro`.
- `--keep`: keep the temporary worker root for debugging.

Environment:

- `OPENCODE_DEEPSEEK_AUTH_FILE`: auth file copied into the isolated worker data
  dir. Defaults to `~/.local/share/opencode/auth.json`.
- `OPENCODE_DEEPSEEK_IDLE_TIMEOUT_SECONDS`: seconds without OpenCode JSONL or
  stderr output before the worker is killed. Defaults to `180`.
- `OPENCODE_DEEPSEEK_MONITOR_INTERVAL_SECONDS`: watchdog polling interval.
  Defaults to `1`.

## Result

The command prints JSON:

```json
{
  "status": "success",
  "worktree": "...",
  "changed_files": [],
  "diff": "...",
  "summary": "...",
  "validation": {
    "command": "...",
    "exit_code": 0,
    "output_tail": "..."
  }
}
```

`status` is `rejected` when the worker edits files outside the allowed write
scope.

## Isolation

The runner redirects XDG directories:

- `XDG_CONFIG_HOME`
- `XDG_DATA_HOME`
- `XDG_CACHE_HOME`
- `XDG_STATE_HOME`

It also sets OpenCode disable flags:

- `OPENCODE_DISABLE_PROJECT_CONFIG=true`
- `OPENCODE_DISABLE_CLAUDE_CODE=true`
- `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=true`
- `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=true`
- `OPENCODE_DISABLE_EXTERNAL_SKILLS=true`
- `OPENCODE_DISABLE_DEFAULT_PLUGINS=true`

The worker uses `opencode run --pure --format json --dangerously-skip-permissions`
so local plugins are not loaded by default and the one-shot task can run without
interactive approval prompts. The detached worktree and write-scope guard remain
the enforcement boundary.

Authentication is the one intentional shared secret. By default the runner
copies `~/.local/share/opencode/auth.json` into the temporary worker data
directory. Override with `OPENCODE_DEEPSEEK_AUTH_FILE=/path/to/auth.json`.
It does not copy the main OpenCode config, plugins, sessions, or project
instructions.

# Codex Resources

This directory contains Codex shared agent runtime resources derived from
`claude-config`.

## What lives here

- `hooks.json`
  Template for Codex lifecycle hooks. `init_codex.sh` renders it into
  `~/.codex/hooks.json` with the local repository path substituted in place of
  `__CLAUDE_CONFIG_HOME__`.
- `skills.list`
  Whitelist of `claude-skills/` entries that are safe to expose directly as
  native Codex skills under `$HOME/.agents/skills`.
- `superpowers-bootstrap.md`
  Handwritten Codex-side bootstrap prompt for using Superpowers workflows
  without relying on plugin `SessionStart` injection.

## Shared links created by `init_codex.sh`

- `~/.codex/agents.md`
  Links directly to `claude/CLAUDE.md` after that file was made host-neutral
  enough for shared use.
- `~/.codex/memory.md`
  Links to the repo-root `memory.md` so the shared global instructions can
  reference a real Codex-side memory file.

## Deliberate non-goals

- `skills/` is not mirrored into native Codex skills. It stays behind the
  `skill-catalog` MCP server because the source tree is organized by tech stack
  and contains far more material than should be injected directly into the
  model's skill list.
- `vendor/superpowers` is not registered as a Codex marketplace. Superpowers
  runs through the native-skill fallback:
  `vendor/superpowers/skills/* -> $HOME/.agents/skills/*`.
- Codex hook scripts live under `codex/hooks/`, separate from Claude Code
  hooks under `claude/hooks/`; hook registration is rendered into Codex's own
  configuration surface.
- App-only preferences are not managed here. That includes appearance,
  notifications, browser-use allowlists, and other GUI-only settings.

## Entry point

Run:

```bash
bash init_codex.sh
```

The script installs or verifies Codex CLI, links global resources, renders
hooks, initializes the MCP server virtual environments, and merges a managed
shared MCP block into `~/.codex/config.toml`.

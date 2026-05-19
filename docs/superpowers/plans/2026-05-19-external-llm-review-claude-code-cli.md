# External LLM Review Claude Code CLI Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit opt-in Claude Code CLI backend to `external-llm-review` while keeping all non-Claude models on the existing raw API request path.

**Architecture:** `reviewer.py` keeps one prompt/diff pipeline and dispatches to either the default raw API backend or a new isolated Claude Code CLI backend. The CLI backend builds a fresh process environment with temporary HOME/XDG/Claude config paths and passes only selected endpoint/auth variables from the skill-local `.env` or explicit shell exports.

**Tech Stack:** Python `unittest`, `subprocess`, `tempfile`, `python-dotenv`, Claude Code CLI.

---

### Task 1: Backend Contract Tests

**Files:**
- Modify: `claude-skills/external-llm-review/tests/test_reviewer_cache.py`

- [x] Add tests that prove `EXTERNAL_LLM_REVIEW_BACKEND` defaults to `api`.
- [x] Add tests that prove `claude-code-cli` is only selected by explicit arg/env.
- [x] Add tests that reject non-Claude model IDs for the CLI backend.
- [x] Add tests that inspect the isolated CLI command and environment without invoking `claude`.

### Task 2: CLI Backend Implementation

**Files:**
- Modify: `claude-skills/external-llm-review/reviewer.py`

- [x] Add `--backend api|claude-code-cli`.
- [x] Keep the raw API branch as the default path.
- [x] Resolve Claude CLI config from `ANTHROPIC_*`, with guarded fallback from `EXTERNAL_LLM_*` only for Anthropic-format review config.
- [x] Build a clean runtime environment with temporary HOME/XDG/Claude config directories.
- [x] Invoke `claude --print --bare --no-session-persistence --disable-slash-commands --strict-mcp-config --mcp-config '{}' --permission-mode plan --tools ''`.

### Task 3: Skill Documentation

**Files:**
- Modify: `claude-skills/external-llm-review/SKILL.md`
- Modify: `claude-skills/external-llm-review/.env.example`

- [x] Document Claude Code installation initialization.
- [x] Document that CLI mode is explicit opt-in and Claude-only.
- [x] Document that DeepSeek/Qwen/GLM/Ollama and other non-Claude models continue using raw API requests.

### Task 4: Verification

**Files:**
- No additional edits expected.

- [x] Run focused tests from `claude-skills/external-llm-review`.
- [x] Run relevant repository checks.
- [ ] Commit the completed change.

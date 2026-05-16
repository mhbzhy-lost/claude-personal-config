---
name: gpt-model-routing
description: Use when choosing model tiers for coding workflows, especially Codex/GPT usage, GPT-5.5 review gates, OpenCode DeepSeek worker delegation, plan review, root-cause review, code review, implementation, or token/credit conservation decisions.
---

# GPT Model Routing

## Core Principle

Use GPT-5.5 as the senior reviewer, not the default implementer. Spend the expensive model on irreversible judgment: plans, root causes, architecture tradeoffs, high-risk reviews, and stuck-state diagnosis. Use lower tiers for reading, editing, command output, and routine implementation.

## Tier Mapping

| Tier | Model | Use for | Avoid using for |
|---|---|---|---|
| High | GPT-5.5 | Plan review, root-cause review, final code review, architecture decisions, security/payment/auth/concurrency review, second opinion after repeated failure | Bulk file reading, log digestion, mechanical edits, routine test fixing |
| Main | GPT-5.4 | Normal implementation, regular bugfixes after root cause is confirmed, single-module refactors, writing tests, applying review feedback | Open-ended high-risk design without review |
| Light | GPT-5.4-mini | File lookup, simple edits, docs/config, formatting, summarizing test output, scaffolding obvious tests | Ambiguous root cause, cross-module architecture, high-risk final approval |

## Workflow

1. Classify the task before choosing a model: Light, Main, or High.
2. Default to GPT-5.4 for coding work and GPT-5.4-mini for mechanical support.
3. Ask GPT-5.5 only at review gates:
   - before implementation: review the plan and missing risks
   - before bugfix implementation: review the confirmed root cause and impact range
   - after implementation: review the diff, tests, and regression risk
   - after two failed attempts or no new progress: reassess direction
4. Keep GPT-5.5 inputs narrow: provide the plan, root-cause note, diff, test summary, and specific questions. Do not ask it to reread the whole repository unless required.
5. After GPT-5.5 makes the key judgment, return execution to GPT-5.4 or GPT-5.4-mini.

## Dispatch Compatibility

This skill is a model-tier overlay. It must not replace more specific dispatch workflows. When another skill defines how work is delegated, keep that workflow and add model-tier choices to each role.

### Superpowers Subagent-Driven Development

When `subagent-driven-development` is active:

- Keep its task flow intact: implementer -> spec compliance reviewer -> code quality reviewer -> final reviewer.
- Implementer subagents should usually run as Light or Main tier: GPT-5.4-mini for mechanical slices, GPT-5.4 for integration-heavy slices.
- Spec compliance reviewers can usually run as Main tier because they compare implementation to a written plan/spec.
- Code quality reviewers and final reviewers are High-tier candidates. Use GPT-5.5 when the diff is broad, risky, security-sensitive, or when policy requires high-confidence review; otherwise GPT-5.4 is acceptable.
- If a reviewer says implementation is blocked by design ambiguity, escalate the next judgment turn to GPT-5.5, then route fixes back to GPT-5.4 or GPT-5.4-mini.

When `dispatching-parallel-agents` is active, apply the same tiering per independent domain. Parallel implementers/investigators should be Light/Main unless the task itself is a High-tier diagnosis; consolidate results before sending a narrow GPT-5.5 review.

### OpenCode DeepSeek Worker

OpenCode DeepSeek is part of this routing policy, not a separate decision system. Treat `opencode + deepseekv4pro` as a Light/Main implementation producer that creates candidate diffs in an isolated worktree. It is not a security sandbox: it uses the real machine environment and project toolchains, while isolating OpenCode agent configuration with clean XDG directories. The primary GPT/Codex session remains responsible for architecture, review, integration, and final judgment.

Use DeepSeek for:

- Bounded module or feature slices with a clear write scope.
- Localized bug fixes where the likely edit area is known and root cause is already narrowed.
- Tests, docs, fixtures, or mechanical code generation for a specific subsystem.

Do not use DeepSeek for:

- Broad architecture, product design, or migration decisions.
- Ambiguous bug hunts or cross-cutting debugging where the root cause is not narrowed.
- Final code review, final integration judgment, security-sensitive approval, or policy decisions.
- Unbounded repository-wide edits.

Dispatch flow:

1. Create a task capsule with objective, read context, allowed write scope, constraints, validation command, and non-goals.
2. Run the worker from the assets kept in `claude-skills/gpt-model-routing/opencode-deepseek-worker`:

```bash
SKILL_HOME="${CLAUDE_CONFIG_HOME:-/Users/mhbzhy/claude-config}/claude-skills/gpt-model-routing/opencode-deepseek-worker"

"$SKILL_HOME/bin/run.sh" \
  --repo /path/to/repo \
  --task /tmp/task-capsule.md \
  --write-scope src/auth,tests/auth \
  --validation "pytest tests/auth"
```

3. Read the returned JSON. The worker writes code in the returned `worktree`, not in the main checkout.
4. Inspect `status`, `changed_files`, `diff`, `write_scope`, and `validation`; treat the patch as untrusted even when `status=success`.
5. If the diff is risky, broad, or touches critical paths, send only the worker diff and validation summary to a GPT-5.5 reviewer before integration.
6. Integrate only approved changes into the main checkout, then rerun validation from the main checkout.

Useful worker knobs:

- `--base <ref>`: base ref for the detached worker worktree. Default: `HEAD`.
- `--write-scope <paths>`: comma-separated files, directories, or glob patterns.
- `--model <id>`: override `OPENCODE_DEEPSEEK_MODEL`.
- `--keep`: keep the temporary worker root for debugging.
- `OPENCODE_DEEPSEEK_AUTH_FILE`: auth file copied into the isolated worker data dir.
- `OPENCODE_DEEPSEEK_IDLE_TIMEOUT_SECONDS`: kill the worker after no JSONL/stderr output for this many seconds.

Worker JSON fields to inspect:

- `status`: `success`, `failed`, or `rejected`; treat `rejected` as a hard stop.
- `worktree`: detached worktree containing generated files.
- `changed_files`: files changed by the worker.
- `diff`: tracked and untracked diff.
- `write_scope`: guard status and violation output.
- `validation`: command, exit code, and output tail.

Common mistakes:

- Giving DeepSeek a vague product task instead of a bounded module slice.
- Letting DeepSeek choose the architecture.
- Trusting the worker summary without inspecting the diff.
- Skipping main-session validation after integration.
- Sending the entire worker worktree to GPT-5.5 instead of a narrow diff/test summary.

### Generic Subagents And Model Overrides

When the host supports subagents, delegated reviewers, or explicit model overrides, use that mechanism to enforce this policy:

- Keep the main implementation agent on GPT-5.4 or GPT-5.4-mini.
- At review gates, dispatch a narrow GPT-5.5 reviewer subagent with only the plan, root-cause note, diff, test summary, and specific review questions.
- Do not ask the GPT-5.5 reviewer subagent to implement changes unless the review explicitly says GPT-5.5 execution is required and the user/workflow approves the escalation.
- After the GPT-5.5 reviewer returns, route implementation back to GPT-5.4 or GPT-5.4-mini.

If the host does not support subagents or model overrides from the current session, stop at the review gate and ask the user to switch/open a GPT-5.5 review context. Do not pretend the current agent can silently downgrade or upgrade its own runtime model.

## Review Prompt Shape

For GPT-5.5 review requests, ask for only decision-critical output:

```text
Review this plan/diff/root cause. Answer:
1. Approved or blocked?
2. Biggest missed risk?
3. Missing tests or verification?
4. Does this require GPT-5.5 execution, or can GPT-5.4 implement it?
```

Default answer should be “GPT-5.4 can implement” unless the task is ambiguous, high-risk, or repeatedly failing.

## Escalation Triggers

Upgrade to GPT-5.5 when any of these is true:

- Cross-module architecture or migration decisions
- Authentication, authorization, payments, data deletion, encryption, concurrency, or public API contracts
- Root cause remains unclear after investigation
- Two implementation attempts fail without new information
- Final review before merging a risky or broad diff
- The user explicitly asks for the strongest model or deep review

## Conservation Rules

- Start new sessions for unrelated tasks to avoid dragging stale context into expensive turns.
- Summarize logs before sending them to GPT-5.5.
- Send diffs instead of whole files when reviewing completed work.
- Prefer “review and decide” prompts over “continue implementing” prompts for GPT-5.5.
- If the task is pure docs/config/spelling or under a tiny isolated scope, do not use GPT-5.5 unless requested.

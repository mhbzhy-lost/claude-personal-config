# Codex Superpowers Bootstrap

Use this repository's Superpowers skills as workflow guidance when their trigger
conditions match the task.

At the start of coding, debugging, planning, review, or delivery work:

- Check the available skills list for relevant `superpowers:*` skills.
- When a Superpowers skill applies, read its `SKILL.md` before acting and follow
  the workflow there.
- Prefer these common mappings:
  - new feature or behavior change: `superpowers:brainstorming`, then
    `superpowers:writing-plans` for multi-step work
  - bug, failing test, or unexpected behavior:
    `superpowers:systematic-debugging`
  - implementation work: `superpowers:test-driven-development` unless the
    repository explicitly exempts the change
  - parallelizable implementation plan:
    `superpowers:subagent-driven-development`
  - before claiming completion:
    `superpowers:verification-before-completion`
  - requesting or handling review:
    `superpowers:requesting-code-review` or
    `superpowers:receiving-code-review`
- Do not assume a skill was followed just because it is installed. The observable
  action is reading the relevant skill file and applying its checklist.
- If Codex plugin loading is broken, keep using the native skills fallback under
  `$HOME/.agents/skills`; do not simulate marketplace plugin installation.


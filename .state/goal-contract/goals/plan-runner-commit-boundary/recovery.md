# Recovery: plan-runner commit boundary

Read order after compaction:

1. `.state/goal-contract/registry.json`
2. `.state/goal-contract/goals/plan-runner-commit-boundary/state.json`
3. `.state/goal-contract/goals/plan-runner-commit-boundary/goal-contract.md`
4. `.state/goal-contract/goals/plan-runner-commit-boundary/feature-list.json`
5. `.state/goal-contract/goals/plan-runner-commit-boundary/evidence.jsonl`
6. `docs/plans/plan-runner-commit-boundary.md`

Current next action: none for implementation. Goal state is completed; restart long-running OpenCode processes before relying on updated plugin/agent behavior.

Architectural red line: external review scope must be Git commit range only; no custom snapshot/patch cache.

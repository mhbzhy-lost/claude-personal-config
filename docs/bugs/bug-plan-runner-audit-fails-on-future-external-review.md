# bug: plan-runner 审计因未来 external review gate 失败

## 现象

重启并包含 audit text part 修复后，docs-only live smoke 不再出现
`audit review did not return valid JSON`。task-state 成功记录 audit JSON，但最终仍停在
`repairing`：

```json
{
  "result": "fail",
  "required_fixes": [
    "external-llm-review or reviewer.py must still run against the current diff before completion can be final."
  ]
}
```

## 根因 (6 要素)

1. **触发条件**：deterministic check 通过后，harness 先派发 `plan-runner-audit`，external review 设计上在 audit pass 后才运行。
2. **期望链路**：audit 只检查 plan/todo/modified files/实现完整性；audit pass 后由 harness 自动运行 external review。
3. **实际链路**：audit prompt 要求 `Check whether external-llm-review or reviewer.py still needs to run against the current diff`，audit agent 把尚未运行的未来 gate 当作当前未完成项返回 fail。
4. **关键假设失效**：把“external review 是后续 harness gate”写进 audit prompt 时，没有明确 audit 不应因此 fail；LLM 选择保守阻断。
5. **旁证**：DB 中 audit prompt 包含该检查语句，audit 输出的唯一 required fix 正是 external review 未运行；task-state 中 `reviews.external` 为空符合预期顺序，不是执行遗漏。
6. **影响范围**：任何 audit agent 严格遵守该提示时，terminal gate 都会在 audit 阶段自我阻塞，永远到不了 external review 和 `validated`。

## 修复方向

移除 audit prompt 中所有 external review / reviewer 相关信息。External review 是 harness
内部后续 gate，不应暴露给 audit agent；audit 只审 plan/todo/modified files/实现完整性。

## 验证

- RED：audit prompt 测试断言不包含 `external review`、`external-llm-review`、`reviewer.py`；旧 prompt 失败。
- GREEN：删除 audit prompt 中所有 external review 相关上下文后同一测试通过。
- Live smoke：重启后 docs-only smoke 应能在 audit pass 后进入 external review。

已执行：

- `node --test "userconf/plugins/test/plan-runner-harness.test.mjs"`：RED 时 `dispatches an audit subagent...` 失败，GREEN 后 43/43 pass。

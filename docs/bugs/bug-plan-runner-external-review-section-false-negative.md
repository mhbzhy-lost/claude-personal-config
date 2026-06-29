# bug: external review section 首行 None 导致漏报

## 现象

`runExternalReviewCommand` 用 `markdownSectionHasIssues()` 判断 reviewer 输出是否包含 Critical / Important。该函数只检查 section 第一条非空文本；如果 reviewer 在 section 第一行写 `None`，随后又列出实际问题，harness 会误判为 pass。

## 根因 (6 要素)

1. **触发条件**：外源 reviewer 在 `### Critical` 或 `### Important` section 中先输出 `None` / `No issues`，后续又输出列表项问题。
2. **期望链路**：只要 Critical / Important section 中存在实质性问题文本或列表项，external review 就应返回 `issues` 并回流 repair。
3. **实际链路**：`markdownSectionHasIssues()` 找到 section 后只读取第一条非空行，第一行是 `None` 时直接返回 false。
4. **关键假设失效**：代码假设 reviewer 输出严格规范且 section 内只有一个结论行；LLM markdown 实际可能自相矛盾或先写占位再列问题。
5. **旁证**：外源 review 明确指出该 false negative；现有测试只覆盖全 section 无问题和 injected issues，没有覆盖同 section 混合 `None` 与问题。
6. **影响范围**：严重问题可能被标为 `pass`，最终 task 进入 `validated`，削弱 external review gate 的兜底价值。

## 修复方向

检查整个 section：过滤空行和 `None` / `No issues` 等无问题占位行，只要剩余实质行存在就判定为 issues。

## 验证

- RED：fake reviewer 在 Important section 第一行输出 `None`，第二行输出 `- actual issue`，当前 harness 误判 `validated`。
- GREEN：同一输出被判为 `issues`，state 进入 `repairing`。

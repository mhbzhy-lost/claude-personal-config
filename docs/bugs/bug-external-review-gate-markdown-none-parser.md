# Bug: external-review-gate 将 Markdown `*无*` 误判为 blocking issue

## 现象

`git push` 时 external-review-gate 调用外源 review，review 输出显示：

```text
#### Critical (Must Fix)
*无*

#### Important (Should Fix)
*无*

### Assessment
Ready to merge? Yes
```

但 hook 仍返回 deny，提示“异源 Review 发现需要修复的问题”。

## 根因 (6 要素)

1. **触发条件**：reviewer 在 Critical/Important section 中用 Markdown emphasis
   表达无问题，例如 `*无*`。
2. **期望链路**：`parse_section()` 应识别该 section 没有真实问题，`has_critical` /
   `has_important` 为 false，hook 允许 push。
3. **实际链路**：`parse_section()` 对 section body 直接执行 `_NEGATIVE.match(body)`。
4. **关键假设失效**：`_NEGATIVE` 只识别裸 `无`、`none`、`n/a` 等文本，没有剥离
   Markdown bullet/emphasis 前缀。`*无*` 的首字符是 `*`，因此不匹配。
5. **旁证**：被拦截的 review 明确显示 Critical/Important 都是 `*无*`，只有 Minor；
   Assessment 也是 `Ready to merge? Yes`，但 hook 仍 deny。
6. **影响范围**：所有 reviewer 用 `*无*` / `- 无` / `* None` 等 Markdown 格式表示
   无问题的输出，都可能被误判为 blocking。

## 修复方案

- 在 `parse_section()` 中只检查 section 首个非空行。
- 判断 `_NEGATIVE` 前，剥离常见 Markdown 列表符号和 emphasis 包裹符。
- 增加回归测试：fake reviewer 输出 Critical/Important 为 `*无*`，Minor 有建议，
  hook 必须 allow。

## 修复记录

- `parse_section()` 现在会提取首个非空行，并剥离 `-` / `*` / `+` 列表符以及
  `*` / `_` / 反引号 emphasis 包裹，再判断是否为“无问题”。
- 新增回归测试 `test_external_review_gate_treats_markdown_none_as_no_blocking_issues`，
  覆盖 Critical/Important 为 `*无*`、Minor 有建议时仍应 allow。

# plan-runner external review Chinese none punctuation

## 现象

commit-boundary live smoke 中，external review 输出的 Critical / Important 段均为“无。”，但 harness 把 Important 段误判为存在 blocking issue，导致 `finish_plan` 返回 `repair_required`。

## 影响

- external review 明确给出 `Ready to merge? Yes` 时，plan-runner 仍会进入 repair loop。
- 中文评审结果中常见的“无。”、“无。”等无问题表达会造成误报。
- live smoke 无法到达 `validated`，掩盖真实 commit-boundary 验证结果。

## 复现

1. reviewer 输出：`#### Critical (Must Fix)\n无。`。
2. reviewer 输出：`#### Important (Should Fix)\n无。`。
3. 当前 `reviewTextHasBlockingIssues()` 只把 `无` 识别为空问题表达，没有处理中文句号。
4. harness 将 Important 段的 `无。` 当作 meaningful line，归一为 `issues`。

## 根因

`markdownSectionHasIssues()` 的无问题行过滤正则只覆盖 `无`，没有覆盖中文/英文句号等尾随标点。中文 external reviewer 常输出“无。”，因此被误判为 blocking issue。

## 修复方案

- 在 meaningful line 归一化中去除尾随中英文句号等常见标点。
- 或扩展 no-issue 正则，覆盖 `无。`、`无.`、`None。` 等表达。
- 先补 RED 测试，确保 Critical / Important 段为 `无。` 时 external review pass。

## 验证

- 新增 harness 单测：fake reviewer 输出中文 `无。` 时，task 最终 `validated`。
- 运行 `node --test userconf/plugins/test/plan-runner-harness.test.mjs`。
- 重新运行 commit-boundary live smoke，确认 `external_review_passed` 和 `task_validated`。

## 预防

- external review parser 处理“无问题”表达时必须兼容中英文标点。
- 以后新增 reviewer 输出格式时，先用 fixture 覆盖 Critical / Important 空问题段。

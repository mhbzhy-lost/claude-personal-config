# Bug: external-review-gate 在 Round 2 后改动会重置为 Round 1

## 现象

一次 `git push` 触发异源 review 后，按设计最多应执行两轮：

1. Round 1：发现问题并阻断。
2. 修复并 commit/amend 后，Round 2：复核一次。
3. Round 2 后不应继续自动触发新的异源 review。

实际本次流程已经触发三次：

- 第一次 push：Round 1。
- 修复并 amend 后第二次 push：Round 2。
- 再次修复并 amend 后第三次 push：又回到 Round 1。

当前 marker 也显示最新一次已被覆盖成 Round 1：

```json
{
  "round": 1,
  "diff_hash": "841b221679f77e4b",
  "head_sha": "5b5d50f4440e024b3e4a906abed77826b4fdb336"
}
```

## 根因 (6 要素)

1. **触发条件**：Round 2 review 仍返回 Critical/Important；开发者继续修复并
   amend，导致 `origin/main..HEAD` diff hash 再次变化。
2. **期望链路**：状态机应识别“这个逻辑 push 已经用完两轮 review 预算”，不再自动
   发起第三次异源 review。
3. **实际链路**：`determine_action()` 只保存一个 marker。diff hash 变化时：
   - 上一轮是 `round == 1` 且 denied → 执行 Round 2；
   - 其他情况，包括上一轮是 `round == 2` 且 denied → 回到 Round 1。
4. **关键假设失效**：代码把“diff 变化”当成新 review 周期，但本场景中 diff 变化只是
   Round 2 后继续修复，并不代表用户想重开一个新的两轮预算。
5. **旁证**：第三次 push 的提示明确写着 `异源 Review Round 1`；marker 被覆盖为
   `round: 1`，说明 Round 2 历史被单 marker 覆盖掉了。
6. **实现偏差**：marker 只记录当前 diff 的单轮结果，没有记录逻辑 push 周期的
   `rounds_used` / `max_round_reached`，因此无法强制“两轮上限”。

## 影响范围

- 每次 Round 2 后继续修复都会重新触发 Round 1，外源 review 可能无限循环。
- push hook 成本和等待时间不可控。
- 用户会误以为“两轮机制”生效，实际只是在 diff hash 改变后重开周期。

## 修复原则

两轮 review 是预算上限，不是阻断上限。用完两轮后，hook 不再执行 review，也不再
阻断；第三次 push 直接放行。

review 策略完全由 harness 脚本控制，不能泄漏给 agent。hook 返回给 agent 的 deny
文案不得出现 Round 1 / Round 2、review 预算、marker 路径、escape hatch 等策略性
信息；只说明“外源 Review 发现问题，需要修复”以及具体 review 内容。

状态机应为：

- 无 marker：视为未做过外源 review，push 前执行 Round 1，写 marker。
- marker 表示 Round 1 且 review 未通过：下一次有效 push 执行 Round 2，写 marker。
- marker 表示 Round 2 已执行：第三次 push 直接 allow，并删除 marker。
- marker 被删除后，后续新的 push 重新进入“无 marker → Round 1”状态。
- 增加回归测试：Round 1 denied → diff 变更 → Round 2 denied → diff 再变更时，
  `determine_action()` 不能返回 `run Round 1`，应 allow 且删除 marker。

## 修复记录

- `external-review-gate.sh` 在读取到 `round >= 2` 且上一轮仍有
  Critical/Important 时，不再发起新的 review，直接 allow。
- allow 前删除对应 review marker，保证后续新的 push 从“无 marker → Round 1”重新
  开始。
- 新增回归测试用 fake `uv` 确认第三轮不会调用 reviewer，且 marker 会被删除。
- deny reason 已收敛为 agent 可见的业务文案，不暴露 round、marker、escape hatch
  等 harness 策略。

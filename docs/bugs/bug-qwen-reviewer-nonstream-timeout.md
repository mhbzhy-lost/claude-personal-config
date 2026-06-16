# Bug: Qwen Reviewer 大 diff 非流式调用返回空 content

## 现象

`reviewer.py` 使用 `backend=api` + `qwen3.7-max` 对 ~40k 字符的 diff 做 code review 时，
API 返回 `content=""` + `reasoning_content=""` + `finish_reason=None`，`completion_tokens≈2166`。
小/中规模 prompt（≤35k）正常。

## 根因分析（6 要素）

### 1. 触发条件
- `backend=api`（httpx 直连百炼 OpenAI 兼容端点）
- `model=qwen3.7-max`（混合思考模式，默认 enable_thinking=true，reviewer 已传 enable_thinking=false）
- diff 字符数 ~40k + system_prompt + user_prompt 总计 > 40k chars（约 10k+ tokens）
- **非流式调用**（`stream` 参数未设，默认 false）

### 2. 根因
百炼文档明确：
> 非流式调用若超过 300 秒未完成，服务将中断请求并返回已生成的内容（而非报错）。

qwen3.7-max 处理大型 code review 时，即使 `enable_thinking=false`，模型内部推理
仍可能耗时超过 300s。服务端截断后返回已生成的部分——此时模型尚在"热身"阶段，
还未开始产出 content，因此 content="" + reasoning_content="" + finish_reason=None。

### 3. 影响
- 所有 > 30k 字符的 diff review 均失败（fail-open 放行，但 review 报告缺失）
- cache-proxy / 主仓评审报告已完成（diff 小），但 workflow v3 大 diff 评审无法完成
- 表现为"Qwen 空 content"反复出现

### 4. 为什么之前的修复无效
- `enable_thinking: False` 已传且生效（简单测试验证通过）
- `reasoning_content` fallback 逻辑正确但在此场景下 reasoning_content 也为空
- `max_output_tokens` 调大（16k/32k/100k）不解决超时问题
- 真正瓶颈是**服务端 300s 硬超时**，与 token 限制无关

### 5. 修复方案
非流式 → **流式调用**（`stream: true`），边生成边收集 chunk：
- 流式调用无 300s 服务端截断
- 推荐配合 `stream_options: {include_usage: true}` 获取 token 统计
- 可选：加 `thinking_budget` 限制思考长度作为额外保险
- 实现方式：httpx 流式读取 SSE，逐 chunk 拼接 content/reasoning_content，
  最后一个 chunk 含 usage

### 6. 验证方法
1. 小 diff 测试：确认流式路径正常返回 content
2. 大 diff 测试（≥40k）：确认流式路径不再超时空 content
3. 现有 28/28 单元测试不回归
4. 新增 unit test：mock SSE 流模拟多 chunk 拼接

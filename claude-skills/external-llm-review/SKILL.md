---
name: external-llm-review
description: 用 OpenAI / Responses / Anthropic Messages 三类兼容协议调用外部 LLM 做代码评审，作为 Claude 同族 review 的异源交叉验证。同族 code-quality ✅ 通过后跑此 skill，输出 Strengths / Critical / Important / Minor / Assessment，并按"综合判断 4 步"消化，避免误报和盲点。
---

# External LLM Cross-Model Code Review

## 用途

为 Claude 同族（Sonnet / Haiku / Opus）之外提供**异源模型交叉验证**。同族模型对自己生成的代码倾向于 normalize 通过；接入一个独立训练源的 LLM 复审，可抓出同族盲点（库 API deprecation / cross-cutting 并发风险 / 版本兼容 / 安全 / etc）。

## 触发时机

外源评审接入 superpowers `subagent-driven-development` 双轮评审，作为第三轮：

| superpowers 评审 | 是否需外源 | 理由 |
| - | - | - |
| spec-compliance reviewer | 否 | 评的是 plan 一致性，不需异源验证 |
| code-quality reviewer（每个 task） | **是** | 同族模型对自身生成代码倾向 normalize 通过；需异源抓盲点 |
| final code-reviewer（所有 task 完成时） | **是** | 整体合并面、跨 task 一致性问题更需异源 |

**外源必须在同族评审 ✅ Approved 之后跑**（同族 fix 没收敛前外源没意义）；`BASE_SHA..HEAD_SHA` 严格对齐同族评审区间，便于双源对照。

### 何时不必用

- 任务纯文档/配置（spec 评审、yaml 校验等）
- 模块作用域 < 50 行且没有外部依赖（同族模型已足够）
- 没配 `.env` 也没 export 凭据（API endpoint 缺失）
- 项目合规策略不允许把源码 diff 送到外部 endpoint

## 配置

skill 安装于 `~/claude-config/claude-skills/external-llm-review/`。首次使用前在 skill 目录建 `.env`（必须 git-ignore）：

```bash
cp ~/claude-config/claude-skills/external-llm-review/.env.example \
   ~/claude-config/claude-skills/external-llm-review/.env
# 编辑填 EXTERNAL_LLM_API_BASE / EXTERNAL_LLM_API_KEY / EXTERNAL_LLM_MODEL / EXTERNAL_LLM_API_FORMAT
```

或在 shell `export EXTERNAL_LLM_*=...` 然后直接调（reviewer.py 用 python-dotenv，`.env` 缺时不报错，env vars 优先）。

API 须兼容以下三种协议之一（`EXTERNAL_LLM_API_FORMAT` 切换）：

- `chat` — OpenAI Chat Completions（POST `<base>/chat/completions`）
- `responses` — OpenAI Responses API（POST `<base>/responses`）
- `anthropic` — Anthropic Messages（POST `<base>/v1/messages`，base **不**带 `/v1`）

**不同协议的 endpoint 可能分别计 quota**。某条路径触发 `Allocated quota exceeded` 或网关 4xx 时可切换协议重试。已配通 Claude Code 自定义网关（即 settings 已成功跑 sonnet/opus）的环境，本 skill 直接复用同一网关的 anthropic 路径通常即可工作。

兼容性要求：endpoint 实现以下任一协议即可：
- OpenAI Chat Completions schema（最常见，含本地 Ollama `http://localhost:11434/v1`）
- OpenAI Responses API schema
- Anthropic Messages API schema

## 用法

主代理 Bash 调用：

```bash
cd <repo-root>   # 工作树根
EXTERNAL_LLM_API_FORMAT=anthropic uv run --no-project \
    --with "openai>=1.50" --with "anthropic>=0.40" --with python-dotenv \
    python ~/claude-config/claude-skills/external-llm-review/reviewer.py \
    <BASE_SHA> <HEAD_SHA> \
    [--worktree PATH] \
    [--spec docs/superpowers/specs/foo.md] \
    [--max-diff 80000]
```

**参数：**
- `BASE_SHA` —— 同族评审看的同一个 base
- `HEAD_SHA` —— subagent 实施后的 HEAD
- `--worktree` —— 默认 `.`；评 worktree 时填 `.worktrees/<task>`
- `--spec` —— 把 spec 文件附给模型做"对契约"评审
- `--max-diff` —— diff 字符上限（默认 80000，防网关 413）

**stdout 输出**：模型返回的 review markdown（Strengths / Critical / Important / Minor / Assessment）。**stderr** 是诊断信息。

## 综合判断规则（拿到外源输出后必须做的）

外源评审**不能直接采信**。主代理须按下面 4 步消化：

1. **逐条比对**，列出三组：
   - (A) 双方都抓到
   - (B) 只外源抓到
   - (C) 只同族抓到

2. **对 (B) 外源独有项做 threat-model 校验**。外源倾向机械套用通用规则，常见误报：
   - 把开发者本机 CLI 工具的输入也当作不可信用户输入（路径校验 / 注入告警过严）
   - 一次性脚本的 subprocess 阻塞标 Critical（事件循环只有单 task 时无影响）
   - 误读累积 diff 把已修复的旧代码再标一次（要看 HEAD 实际状态）
   - 读 spec 后把未来 task 的代码（spec 提到但本 diff 没改）当成本 commit 范围问题打分

3. **对 (C) 同族独有项做"是不是同族盲点"反思**：是否涉及该模型族训练偏好（生态版本兼容、库 API 名）？

4. **综合后产出 fix dispatch**：把"双方都认可" + "任一方有真实 evidence" 的项打包给 fix subagent。

**严重度由证据决定，不由谁说了算**。不接受"仅外源说 Critical 就降级到 Important"或反之。

## Sandbox 与许可

⚠️ Claude Code 默认 sandbox 可能拦截 `reviewer.py` 的执行，**理由是源码被 POST 到外部 endpoint 属于潜在 data exfiltration**。这是合理保护。绕过方式：

**A. 用户在终端直接跑**（最稳）：
```bash
EXTERNAL_LLM_API_FORMAT=anthropic uv run --no-project \
    --with "openai>=1.50" --with "anthropic>=0.40" --with python-dotenv \
    python ~/claude-config/claude-skills/external-llm-review/reviewer.py main HEAD
```
把输出粘回主代理。

**B. 给 sandbox 显式授权**：在 `~/.claude/settings.local.json`（或项目级 `.claude/settings.local.json`）加：
```json
{
  "permissions": {
    "allow": [
      "Bash(uv run --no-project * python ~/claude-config/claude-skills/external-llm-review/reviewer.py:*)"
    ]
  }
}
```
之后主代理可直接调用。

**只有当评审上下文允许把代码 diff 送出网关时才授权 B**。把这个 skill 用到任何新项目前，请确认目标 endpoint 与项目合规要求一致。

## reviewer.py 实现要点

- 使用 `openai.AsyncOpenAI` / `anthropic.AsyncAnthropic`：`base_url` 切换到任意兼容端点，`api_key` 从环境变量读
- 系统提示固化在脚本里：要求输出 Strengths / Critical / Important / Minor / Assessment
- 用户提示包含 git diff 文本 + 可选 spec 文本
- temperature=0.2（评审任务希望稳定）
- 失败时打印 stderr 并退出非零

## 不要每个 task 都用

只用于：高风险任务 / 你对结论不放心 / 项目策略强制要求。Token 成本和迭代时间都不可忽略。

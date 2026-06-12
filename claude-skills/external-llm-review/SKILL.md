---
name: external-llm-review
description: 调外部 LLM 做代码评审，作为 Claude 同族 review 的异源交叉验证。两条路径——裸请求 deepseek（OpenAI Chat Completions）或裸请求 Anthropic（带 claude-cli UA 欺骗直连 Idealab 网关）。同族 code-quality ✅ 通过后跑此 skill，输出 Strengths / Critical / Important / Minor / Assessment，并按"综合判断 4 步"消化。
---

# External LLM Cross-Model Code Review

## 用途

异源模型交叉验证。同族模型对自己生成的代码倾向于 normalize 通过，接入独立训练源的 reviewer 抓同族盲点（库 API deprecation / cross-cutting 并发风险 / 版本兼容 / 安全等）。

## 两种 backend

| backend | 协议 | 推荐用法 |
|---|---|---|
| `api` | OpenAI Chat Completions（裸 httpx POST `<base>/chat/completions`，无 openai SDK） | DeepSeek 系列（deepseek-chat / deepseek-reasoner / deepseek-v4-pro） |
| `anthropic` | Anthropic Messages API（裸 httpx POST `<base>/v1/messages`），`User-Agent: claude-cli/2.1.156 (external, sdk-cli)`（与 cache proxy 相同） | Idealab Anthropic 网关 + Claude 系列模型（Opus / Sonnet / Haiku） |

> 其他 OpenAI-compatible / Anthropic-compatible gateway 技术上能通过 `api` 后端跑通，但**不在 default 配置中**。

## 配置

skill 安装于 `${CLAUDE_CONFIG_HOME}/claude-skills/external-llm-review/`。首次使用前在 skill 目录建 `.env`（必须 git-ignore）：

```bash
cp ${CLAUDE_CONFIG_HOME}/claude-skills/external-llm-review/.env.example \
   ${CLAUDE_CONFIG_HOME}/claude-skills/external-llm-review/.env
```

`.env` 同时配两套 backend 的环境变量；切换通过 `EXTERNAL_LLM_REVIEW_BACKEND` 或 `--backend` 参数完成，互不干扰。

### `api` 后端（裸 deepseek）

```bash
EXTERNAL_LLM_REVIEW_BACKEND=api
EXTERNAL_LLM_API_BASE=https://api.deepseek.com
EXTERNAL_LLM_API_KEY=sk-...
EXTERNAL_LLM_MODEL=deepseek-v4-pro
```

### `anthropic` 后端

```bash
EXTERNAL_LLM_REVIEW_BACKEND=anthropic
ANTHROPIC_BASE_URL=https://idealab.alibaba-inc.com/anthropic
ANTHROPIC_API_KEY=...
# 或 ANTHROPIC_AUTH_TOKEN=...
ANTHROPIC_MODEL=claude-opus-4-7
```

`User-Agent` 硬编码为 `claude-cli/2.1.156 (external, sdk-cli)`，与 cache proxy 的 anthropic-idealab provider 一致——让 Idealab 网关把请求当作官方 Claude CLI 流量。

硬边界：

- 不会从 `EXTERNAL_LLM_*` fallback 任何字段——必须显式配 `ANTHROPIC_BASE_URL` / key / model
- 不走 cache proxy，裸 httpx 直连 Idealab upstream

## 用法

主代理 Bash 调用：

```bash
cd <repo-root>   # 工作树根
uv run --no-project \
    --with httpx --with python-dotenv \
    python ${CLAUDE_CONFIG_HOME}/claude-skills/external-llm-review/reviewer.py \
    <BASE_SHA> <HEAD_SHA> \
    [--worktree PATH] \
    [--backend api|anthropic] \
    [--spec docs/superpowers/specs/foo.md] \
    [--max-diff 80000] \
    [--review-depth standard|exhaustive] \
    [--review-round 1|2] \
    [--max-issues 25] \
    [--max-output-tokens 16000] \
    [--api-timeout-seconds 180]
```

**参数：**
- `BASE_SHA` —— 同族评审看的同一个 base
- `HEAD_SHA` —— subagent 实施后的 HEAD
- `--worktree` —— 默认 `.`；评 worktree 时填 `.worktrees/<task>`
- `--backend` —— 默认从 `EXTERNAL_LLM_REVIEW_BACKEND` 读，不设时退到 `api`
- `--spec` —— 把 spec 文件附给模型做"对契约"评审
- `--max-diff` —— diff 字符上限（默认 80000，防网关 413）
- `--review-depth` —— 评审深度；默认 `exhaustive`，要求单轮尽量暴露完整问题面；快速 smoke review 才设 `standard`
- `--review-round` —— 当前 diff 的评审轮次，只允许 `1` 或 `2`；默认 `1`
- `--max-issues` —— 单轮最多报告的问题数，默认 `25`；同类问题归并为模式级 issue
- `--max-output-tokens` —— 模型输出 token 上限，默认 `16000`，支撑 reasoning 模型和穷举式报告
- `--api-timeout-seconds` —— provider API 调用外层硬超时，默认 `180`。设 `<=0` 时**不**完全关闭，而是退回 OpenAI SDK 默认（约 600s）

**stdout 输出**：模型返回的 review markdown（Strengths / Critical / Important / Minor / Checklist Coverage / Assessment）。**stderr** 是诊断信息。

## 轮次上限与穷举机制

外源 review **同一 diff 最多 2 轮**，不得为了追求 `Ready to merge: Yes` 无限循环。

### Round 1：穷举式横扫

默认调用即 Round 1：

```bash
uv run --no-project \
  --with httpx --with python-dotenv \
  python ${CLAUDE_CONFIG_HOME}/claude-skills/external-llm-review/reviewer.py \
  main HEAD \
  --review-depth exhaustive \
  --review-round 1 \
  --max-issues 25 \
  --spec docs/superpowers/specs/foo.md
```

Round 1 prompt 强制 reviewer：

- 不只报告 top 3，先枚举候选风险、归并同类项、再分级
- 按 checklist 扫参数/help 副作用、stdin/trap/cleanup、shell 兼容、错误诊断、幂等/回滚、输入边界、并发/缓存、测试覆盖
- 输出 `Checklist Coverage`，明确哪些维度已检查但未发现问题

### Round 2：只验修复与新增风险

只有当 Round 1 发现需要修改的 Critical / Important，且修复后验证全部通过，才跑 Round 2：

```bash
python ${CLAUDE_CONFIG_HOME}/claude-skills/external-llm-review/reviewer.py \
  <BASE_SHA> <NEW_HEAD_SHA> \
  --review-depth exhaustive \
  --review-round 2 \
  --max-issues 25 \
  --spec bug-analysis.md
```

Round 2 只检查：

- Round 1 已修复项是否真正修好
- 修复本身新增的 diff 是否引入新失败模式
- 仍然直接阻断合并的 Critical / Important

Round 2 后如果仍有非 Critical 的 Important / Minor，由主代理按证据和项目上下文 triage；**不得默认跑第 3 轮**。只有用户明确要求继续外源 review 才允许第 3 次调用。

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
   - **只看 diff 没看完整源码**——看到 diff 里某集合"漏了"某项，就误报为 Critical

3. **对 (C) 同族独有项做"是不是同族盲点"反思**：是否涉及该模型族训练偏好（生态版本兼容、库 API 名）？

4. **综合后产出 fix dispatch**：把"双方都认可" + "任一方有真实 evidence" 的项打包给 fix subagent。

**严重度由证据决定，不由谁说了算**。不接受"仅外源说 Critical 就降级到 Important"或反之。

## Sandbox 与许可

⚠️ 代理 sandbox 可能拦截 `reviewer.py` 的执行——**理由是源码被 POST 到外部 endpoint 属于潜在 data exfiltration**。绕过方式：

### Claude Code

**A. 用户在终端直接跑**（最稳）：
```bash
uv run --no-project \
    --with httpx --with python-dotenv \
    python ${CLAUDE_CONFIG_HOME}/claude-skills/external-llm-review/reviewer.py main HEAD
```
把输出粘回主代理。

**B. 给 sandbox 显式授权**：在 `~/.claude/settings.local.json`（或项目级 `.claude/settings.local.json`）加：
```json
{
  "permissions": {
    "allow": [
      "Bash(uv run --no-project * python ${CLAUDE_CONFIG_HOME}/claude-skills/external-llm-review/reviewer.py:*)"
    ]
  }
}
```
之后主代理可直接调用。

**只有当评审上下文允许把代码 diff 送出网关时才授权 B**。把这个 skill 用到任何新项目前，请确认目标 endpoint 与项目合规要求一致。

### Codex

Codex 通过 `~/.codex/hooks.json` 的 `PermissionRequest` hook 自动放行 `reviewer.py`。为命中 hook，Bash 命令必须保持为**单条 reviewer 调用**；仓库目录用工具调用的 `workdir` 指定，不要在命令里写 `cd <repo-root> && ...`。

Codex 推荐调用形态：

```bash
uv run --no-project \
    --with httpx --with python-dotenv \
    python ${CLAUDE_CONFIG_HOME}/claude-skills/external-llm-review/reviewer.py \
    <BASE_SHA> <HEAD_SHA> \
    --worktree .
```

允许的 reviewer 路径形态：

- `${CLAUDE_CONFIG_HOME}/claude-skills/external-llm-review/reviewer.py`
- `$CLAUDE_CONFIG_HOME/claude-skills/external-llm-review/reviewer.py`
- `/Users/<user>/.../claude-config/claude-skills/external-llm-review/reviewer.py` 这类绝对路径
- 在 `workdir` 为 `claude-config` 仓库根时，`claude-skills/external-llm-review/reviewer.py` 相对路径

不要使用这些 shell 组合：`;`、`&&`、`||`、`|`、`&`、重定向、heredoc、`$()`、反引号、`eval`、`source`、`.`。这些形态会被 Codex hook 视为不安全命令，回落到普通审批或被拒。

如果确实需要一层 shell wrapper，只允许把完整 reviewer 调用作为单个 quoted 参数传入，例如：

```bash
/bin/zsh -lc 'uv run --no-project --with httpx --with python-dotenv python ${CLAUDE_CONFIG_HOME}/claude-skills/external-llm-review/reviewer.py main HEAD --worktree .'
```

## reviewer.py 实现要点

- `api` 后端用裸 `httpx.AsyncClient` POST 到 `<base>/chat/completions`，base/key/model 从 `EXTERNAL_LLM_API_*` 环境变量读
- `anthropic` 后端用裸 `httpx.AsyncClient` POST 到 `<base>/v1/messages`，`User-Agent: claude-cli/2.1.156 (external, sdk-cli)`（与 cache proxy 相同的欺骗 header），base/key/model 从 `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`（或 `ANTHROPIC_AUTH_TOKEN`） / `ANTHROPIC_MODEL` 读；**不**从 `EXTERNAL_LLM_*` fallback
- 两个后端都通过 `asyncio.timeout` 实施 `api_timeout_seconds` 的硬超时
- 依赖：`httpx` + `python-dotenv`（无 `openai`、无 `anthropic` SDK）
- 系统提示固化在脚本里：要求输出 Strengths / Critical / Important / Minor / Assessment
- 用户提示 = git diff + 可选 `--spec` 文本
- temperature=0.2（仅 api 后端；anthropic messages API 不设 temperature）
- 失败时 stderr 打印诊断并退出非零
- Chat Completions 返回空 `message.content` 时退出非零，并打印 `finish_reason` / `reasoning_tokens` / `reasoning_content_len`，避免 reasoning 模型把 token 预算耗在推理区被误判为 review 成功

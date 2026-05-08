# skill-distill

Intent-driven 蒸馏管线：把官方文档转成 `SKILL.md`（外加可选 sandbox 资产），
按 `tech_stack / language / capability / execution_mode` 标签存入
`<skills-base>/<tech>/<skill>/`。

## 调用

```bash
uv run skill-distill \
  --intent "为 mitmproxy CLI 蒸馏 executable_sandbox skill" \
  --skills-base /Users/me/claude-config/skills \
  --max-skills 1
```

主要参数：

| flag | 说明 |
|---|---|
| `--intent`（必填）| 一段自然语言，描述目标 tech_stack、execution_mode、约束 |
| `--skills-base` | SKILL.md 输出根目录 |
| `--max-skills` | 计划阶段最多产出多少个 skill（默认无限）|
| `--model` | 覆盖默认 LLM（`deepseek-v4-pro` / `qwen3.6-max-preview`）|
| `--runs-dir` | 蒸馏过程产物（log/transcript）落盘路径 |
| `--tool-budget-multiplier` | 微调每 stage 的 tool-call 预算 |

OpenAI / DeepSeek / Qwen 的 API key 走 `.env`（`OPENAI_API_KEY` 等）。

## 三阶段流程

1. **plan** —— LLM 读 intent + 当前 skill 库，产出 plan.json，列出本批
   要蒸馏的每个 skill 的 `name / tech_stack / language / capability /
   execution_mode / assets`。
2. **fetch** —— 按 plan 中的 source URL 抓取并清洗，落 `cleaned/`。
3. **build** —— 按 batch 逐个生成 SKILL.md 与可选可执行资产。

build 阶段对每个 skill 跑三步：
1. `step_1_preprocess`：让 LLM 翻 cleaned 源文档，确认锚点
2. `step_2_build`：写 SKILL.md
3. `step_3_mark`：标 capability 闭集

之后若 `execution_mode == "executable_sandbox"`，进入 **资产构建分支**。

## execution_mode

| 值 | 含义 | 产物 |
|---|---|---|
| `knowledge`（默认）| 纯 markdown 知识 | `SKILL.md` |
| `executable_sandbox` | 工具型 skill，附带可在 docker sandbox 内 `bash` 调用的脚本 | `SKILL.md` + `install.sh` + `run-impl.sh` + `runner.sh` + `_meta.json` |

可执行 skill 的入口约定：

```bash
bash <skills-base>/<tech>/<skill>/runner.sh <args>
```

`runner.sh` 由 `templates/runner.sh.tmpl` 自动渲染，负责：
- docker 容器（`claude-skill-sandbox`）懒创建（首次 ~10-30s）
- 工具懒装入（首次 ~30-120s，按工具体量）
- 二次调用幂等（< 2s）
- `$PWD` 在 `$HOME` 内时直接 bind-mount 翻译；否则走 `docker cp` 落回宿主机
- HTTP proxy 透传（host 的 `127.0.0.1` 自动改写为 `host.docker.internal`）

## 4 关验证 + agentic loop

`asset_builder.build_assets` 对 `install.sh` 走 `agentic_install_builder`
里的 LLM 工具循环（替代旧 3 轮 one-shot retry）：

- LLM 拿 `bash`（在 probe 容器里执行）+ `finalize`（提交 install.sh）两个
  工具，自己探明 `debian:12-slim` 缺什么、试装、再 finalize。
- finalize 触发四关验证（fresh 容器，跟 probe 隔离）：
  1. **Gate 1 first install** — 第一次执行 rc=0
  2. **Gate 2 second install** — idempotent guard 命中、rc=0
  3. **Gate 3 zero-delta** — 多跑一次 `docker diff` 不出现新路径
  4. **Gate 4 smoke tests** — `smoke_test` 列表全部 rc=0
- 任一关失败 → gate stderr 喂回对话，LLM 继续 bash 探或重新 finalize。
- 默认 budget：**10 个 bash 调用 + 3 次 finalize 提交**（见
  `agentic_install_builder.DEFAULT_BASH_BUDGET / DEFAULT_FINALIZE_BUDGET`）。
- 两个 budget 都用完 → `verified=false` 写到 `_meta.json`，附
  `abort_reason` 与最后一次 finalize 的内容，等主 agent 介入。

run-impl.sh 等非 install 资产仍走 one-shot 生成（无验证），但 prompt
仅在有 `idempotent_check` 时注入幂等行，并对空输出强制重试一次再
RuntimeError，避免落 0 字节文件。

## 主 agent 兜底约定

agentic loop 的 budget 故意定得保守（覆盖大多数工具的环境配置问题，
playwright python 等典型例子一次过即可）。某些复杂工具的初始化超出
budget 也属正常 —— 例如 maestro CLI 的 launcher 必须留在原始 `bin/`
目录下访问兄弟 `lib/jvm-version.jar`，要求 install.sh 复制整棵子树
而非单个二进制；LLM 在 10 个 bash 内可能没意识到这一点。

这种情况**不应该**继续抬 budget 或加针对性 prompt 工程。约定：

- pipeline 跑完，`_meta.json` 标 `verified=false` + `abort_reason`
- 主 agent（即调用 distill 的 Claude Code 会话）按现成 install.sh 草稿
  打开 sandbox 调试、补差异、自验通过
- 修完后将 `_meta.json` 的 `assets.<file>` 项改为：
  ```json
  {
    "verified": true,
    "rounds": 0,
    "verification_method": "main_agent_post_fix",
    "note": "<简述差异点>"
  }
  ```

主 agent 比 pipeline 内嵌 LLM 在两个维度上压倒性强：
1. 真正的 agentic loop（无 budget、可调度 superpowers / git / docker
   等 工具，能跨多步查文档 / 测命令 / 改代码 / 写测试）
2. 完整对话上下文 —— pipeline 内嵌 LLM 拿到的是一坨 SOURCE.md 摘要，
   主 agent 拿到的是用户意图 + 工程惯例 + 既有同类 skill 模式

所以 pipeline 的 budget 是一道**性价比闸**：覆盖容易的、把疑难外抛
给主 agent 一次性解决，不要让 pipeline 的 LLM 反复在自己看不见的
环境里盲改。

## 已知 caveat（来自 T6/T7 试点）

### colima 内存默认偏小

macOS 上 colima 默认 1.9GB，对 `apt-get install` 大包（如 openjdk）会
OOM 触发 SIGKILL（rc=137）。

```bash
colima start --memory 4   # 一次性提到 4GB
```

### 中国网络下默认 apt 源易超时

`debian:12-slim` 默认走 `deb.debian.org`，国内出口经常 timeout。
templates 里的 install.sh 范式做法是开头加：

```bash
if [ -f /etc/apt/sources.list.d/debian.sources ]; then
  sed -i "s|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g" \
    /etc/apt/sources.list.d/debian.sources
fi
```

idempotent，不影响二次调用。

### debian:12-slim 是最小镜像

不带 `python3 / unzip / curl / ca-certificates`，install.sh 必须显式补。
LLM 经常漏 `unzip` 这种隐式依赖（如 maestro 官方安装脚本依赖它），需要
手工在 install.sh 检查。

### LLM 3 轮 retry 容错有限

3 轮内若出现以下情形通常救不回来：
- 路径拼写错误（如 `/usr/local/bin/maestr` 缺尾字母 `o`）
- 严重的依赖遗漏需要重装多个包
- LLM 输出短截（生成的 install.sh 只剩 retry helper 头）

走 fallback 流程：手工补 install.sh，`_meta.json` 把
`verification_method` 标为 `manual_smoke_after_pilot`，附带 note。

### `runner.sh` 的 TOOL_CHECK 务必短促

避免 `cmd1 || cmd2 || echo "..."` 这种永真链 —— 这会让懒装入逻辑
永不触发。约定：

```bash
# good
which mitmdump

# good
command -v playwright && [ -d /root/.cache/ms-playwright ]

# bad — `|| echo` 永真，install.sh 永远不跑
python3 -c '...' || which chromium || echo 'check manually'
```

### state manifest

容器内的 `/state/manifests/usage.log` 记录每次 runner.sh 调用，
持久化在 `claude-skill-state` volume。可用：

```bash
bin/claude-skill-sandbox status        # 容器状态 + drift 警告
bin/claude-skill-sandbox shell         # 进容器调试
bin/claude-skill-sandbox validate <s>  # 重跑 4 关验证
bin/claude-skill-sandbox reset         # 推倒重来
```

## 目录布局

```
distill/
  pipeline.py         # 主入口（skill-distill）
  adapter.py          # OpenAI SDK 双适配器（DeepSeek / Qwen）
  asset_builder.py    # 4 关验证 + 3 轮 retry
  sandbox_runner.py   # docker 子进程包装
  persistence.py      # raw / cleaned / runs 落盘
  tools.py            # plan/build LLM 工具集
  templates/
    runner.sh.tmpl       # runner.sh 模板（占位 __SKILL_NAME__ / __TOOL_CHECK__ / __VALIDATED_DIGEST__）
    install_helpers.sh   # retry 辅助函数（自动 inject 到每个 install.sh 头部）
  tests/                 # asset_builder + sandbox_runner 单测
  runs/                  # 蒸馏运行落盘（gitignore）
```

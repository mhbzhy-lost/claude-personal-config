# 可执行 Skill + Docker Sandbox 设计

> **状态**：设计阶段
> **日期**：2026-05-07
> **关联**：distill 管线、skill-catalog、knowledge-retrieval 工作流

## 背景与目标

当前蒸馏管线产出**纯知识 SKILL.md**——markdown 文档说明工具用法，但每次 agent 实际执行机械操作（装 mitmproxy / 跑 playwright / 启 maestro 等）时都要按文档现写脚本，浪费 token。

需要支持**可执行 skill**：一个 skill 不仅说明用法，还携带 **可直接调用的脚本**，agent 通过 `bash <skill>/runner.sh <args>` 直接执行，不再消耗 token 编排 CLI。

**核心约束**：

1. 不污染用户主机环境——所有可执行 skill 都在共享 Docker sandbox 容器内运行
2. 不依赖云镜像——base image 仅一个（`debian:12-slim`），用户首次部署知识库时懒拉取
3. 工具按需懒装入 sandbox——首次调用某 skill 时跑 `install.sh`，后续从 `which` 命中跳过
4. 蒸馏阶段必须实跑验证脚本——`install.sh` 在 fresh 容器里跑两遍（验证幂等）+ smoke test 通过才入库

## 设计范围

### IN-SCOPE

- 新 skill 类型 **executable_sandbox**：bash + idempotent install + container-bound execution
- 共享 sandbox 容器的生命周期管理（懒创建 / 持久化 / 重置）
- runner.sh 模板（host.docker.internal / volume / network 默认值）
- distill 管线扩展：plan schema 加 `execution_mode` + `assets`，build 阶段加 asset 生成 + smoke 验证
- 试点 3 个 Tier A skill：mitmproxy / playwright-cli / maestro

### OUT-OF-SCOPE

- 设备绑定 skill（xcuitest / espresso / arkxtest）——继续走知识 skill
- Library/SDK skill（httpx / openai / sqlalchemy）——继续走知识 skill
- 跨 sandbox 联动（例如 mitmproxy 容器 ↔ playwright 容器）——本期单容器内联动即可
- 镜像构建 / 发布 / 拉取云端预制镜像——明确不做，懒拉 `debian:12-slim` 一次
- 多用户隔离 / 多账户 sandbox——单用户单 sandbox

### NON-GOALS

- 不追求"装一次什么都有"的便利打包（toolbox image）
- 不为非容器化工具（CLI 直装宿主机）兜底——这类继续保持知识 skill

## 架构概览

```
┌────────────────────────────────────────────────────────────────────┐
│  Host (macOS / Linux)                                              │
│                                                                    │
│  agent 调用 bash <skills>/<name>/runner.sh <args>                   │
│              │                                                     │
│              ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ runner.sh 模板逻辑                                            │  │
│  │   1. 容器不在 → docker run -d --name claude-skill-sandbox    │  │
│  │      --restart=unless-stopped -v claude-skill-state:/state   │  │
│  │      debian:12-slim sleep infinity                           │  │
│  │   2. which <tool> 失败 → docker exec sandbox bash install.sh │  │
│  │   3. docker exec sandbox bash run-impl.sh "$@"               │  │
│  └─────────────────────────────────────────────────────────────┘  │
│              │                                                     │
│              ▼                                                     │
│  ┌──────────────────────┐    ┌──────────────────────────────────┐ │
│  │  claude-skill-       │    │  named volume                    │ │
│  │  sandbox (持久容器)   │◀──▶│  claude-skill-state              │ │
│  │  base: debian:12-slim│    │  /state/cookies, /state/cert,    │ │
│  │  累积装入：mitmproxy/  │    │  /state/storage_state, etc.      │ │
│  │  playwright/maestro  │    │                                  │ │
│  └──────────────────────┘    └──────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

## 组件设计

### 1. Skill 目录结构（executable）

```
skills/<tech>/<skill-name>/
├── SKILL.md            # 用法说明（人/agent 读，不变）
├── _meta.json          # 元数据，新增 execution_mode 字段
├── install.sh          # 幂等装入脚本（apt-get / pip / curl 二进制）
├── run-impl.sh         # 实际工具调用（在 container 内执行）
├── runner.sh           # host-side 入口包装（agent bash 调这个）
└── templates/          # 可选：用户参数化模板（如 maestro flow.yaml 模板）
```

**SKILL.md frontmatter 新字段**：

```yaml
execution_mode: executable_sandbox  # 或 knowledge（默认/省略）
sandbox_required_tools: [mitmproxy] # which X 检测列表
```

### 2. 共享 sandbox 容器约定

| 项 | 值 | 理由 |
|---|---|---|
| 容器名 | `claude-skill-sandbox` | 全局唯一，所有 runner.sh 共用 |
| Base image | `debian:12-slim` | ~75MB，apt 完整，多架构原生支持 |
| 启动命令 | `sleep infinity` | 长跑空进程，等 `docker exec` |
| Restart 策略 | `unless-stopped` | 开机重启即用，崩溃自恢复 |
| Named volume | `claude-skill-state` → `/state` | 状态持久化（cookies / cert / 用户输入数据）|
| Bind mount | 默认 `$PWD:/work -w /work` | agent 工作目录，方便 IO |
| Network | `bridge`（默认）| `--network host` 在 macOS 无效，统一 bridge + `host.docker.internal` |

### 3. runner.sh 模板

```bash
#!/usr/bin/env bash
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
SANDBOX="${CLAUDE_SKILL_SANDBOX:-claude-skill-sandbox}"
BASE_IMAGE="${CLAUDE_SKILL_BASE:-debian:12-slim}"
STATE_VOL="${CLAUDE_SKILL_STATE_VOL:-claude-skill-state}"
NETWORK_MODE="${CLAUDE_SKILL_NETWORK:-bridge}"  # bridge | host (Linux only)

# 1. 容器懒创建
if ! docker ps -a --format '{{.Names}}' | grep -q "^${SANDBOX}$"; then
  docker volume create "$STATE_VOL" >/dev/null
  docker run -d --name "$SANDBOX" --restart=unless-stopped \
    --mount type=volume,source="$STATE_VOL",target=/state \
    "$BASE_IMAGE" sleep infinity
fi

# 2. 容器停止时启动
docker ps --format '{{.Names}}' | grep -q "^${SANDBOX}$" || \
  docker start "$SANDBOX" >/dev/null

# 3. 工具懒装入（idempotent_check 头由 distill 注入）
docker exec "$SANDBOX" bash -c "$(cat <<'IDEMPOTENT'
which mitmproxy >/dev/null 2>&1 && exit 0
IDEMPOTENT
)" 2>/dev/null || docker exec "$SANDBOX" bash "$SKILL_DIR/install.sh"

# 4. 实际执行（挂载工作目录）
docker exec -i \
  --mount type=bind,source="$PWD",target=/work \
  -w /work \
  "$SANDBOX" bash "$SKILL_DIR/run-impl.sh" "$@"
```

> 注意：`docker exec` 不支持 `--mount`。实际实现需改用 `docker run --rm` 一次性容器拿到 bind mount，或在持久容器启动时预挂载工作区。下一节重新审视。

### 3.1 bind mount 的工作目录处理（重要修正）

`docker exec` 进入已运行的容器，**继承容器启动时的 mount 配置，无法新增 bind mount**。两个方案：

**方案 X**：sandbox 启动时预挂载 `$HOME:/host_home:ro`，agent 把数据通过 `cp -r /host_home/<path> /work` 复制进容器
- 优点：runner.sh 简单，每次 exec 即可
- 缺点：大文件复制成本；用户的工作目录每次会话可能变

**方案 Y**：每个 skill 用 `docker run --rm` 起一次性容器（共享 named volume，base image 复用），bind mount 当前 `$PWD`
- 优点：bind mount 灵活，工作目录跟着 `$PWD` 走
- 缺点：每次 cold start 200-500ms；工具装入要走 named volume（`/usr/local/bin` 不在 volume 上则丢失）

**方案 Z**（推荐）：混合——sandbox 持久容器 + 工具装入 named volume `/state/bin` 路径，runner.sh 用 `docker run --rm --volumes-from $SANDBOX -v "$PWD:/work"` 起临时容器复用 sandbox 的 volumes
- 优点：bind mount 跟当前目录 + 工具状态共享
- 缺点：install.sh 必须把可执行文件装到 `/state/bin`（统一前缀），`/etc/profile.d/` 加 PATH

最终方案待 plan 阶段细化。**目前优先方案 Z**，因为它是唯一同时满足"工作目录灵活" + "工具一次安装多次复用"的形态。

### 4. install.sh 强约束

**幂等性强制**：所有 install.sh 第一行必须是 idempotent guard。

```bash
#!/usr/bin/env bash
# install.sh — sandbox 内安装 mitmproxy
set -euo pipefail
which mitmproxy >/dev/null 2>&1 && exit 0   # ← guard，distill 校验

apt-get update
apt-get install -y --no-install-recommends mitmproxy ca-certificates
apt-get clean && rm -rf /var/lib/apt/lists/*
mitmproxy --version >/dev/null  # 验证
```

distill build 阶段会**跑两次** install.sh：
- 第一次在 fresh `debian:12-slim`：必须装成功 + smoke test 通过
- 第二次紧接着：必须 `which` guard 命中、立即退出零退出码、零副作用

### 5. distill 管线扩展

#### Plan schema 演进

```json
{
  "name": "mitmproxy-tool",
  "primary": "https://docs.mitmproxy.org/stable/",
  "complements": ["..."],
  "execution_mode": "executable_sandbox",
  "assets": [
    {
      "filename": "install.sh",
      "role": "install",
      "language": "bash",
      "purpose": "Install mitmproxy + ca-certificates into Debian sandbox",
      "idempotent_check": "which mitmproxy",
      "smoke_test": [
        "mitmproxy --version",
        "ls /usr/lib/python3/dist-packages/mitmproxy"
      ]
    },
    {
      "filename": "run-impl.sh",
      "role": "runner",
      "language": "bash",
      "purpose": "Wrap mitmdump with sane defaults for capture-and-replay scenarios"
    }
  ]
}
```

#### Build 阶段新流程

```
plan
  → fetch (官方文档, 同前)
  → build:
      1. 生成 SKILL.md (同前)
      2. 对每个 asset:
         a. LLM 按 source + asset.purpose 生成脚本
         b. shellcheck (bash) / py_compile (python) 静态检查
         c. 临时 docker run --rm debian:12-slim 实跑：
            - bash install.sh     # 第一遍，必须成功
            - bash install.sh     # 第二遍，必须秒退（idempotent）
            - eval $smoke_test    # 必须全 0 退出码
         d. 失败 → 反馈 stderr 末 100 行 + 当前脚本给 LLM，重试（≤3 轮）
         e. 3 轮仍失败 → asset 标记 unverified，不入库，summary warn
      3. 生成 runner.sh (来自固定模板，参数化 sandbox name / state vol)
```

### 6. 数据流（agent 实际调用流）

```
agent: bash skills/web-scraping/mitmproxy-tool/runner.sh -p 8080 capture.flow
  │
  ▼
runner.sh:
  ├─ docker ps -a 检查 sandbox → 不存在则懒创建
  ├─ docker exec sandbox 'which mitmproxy' → 失败
  ├─ docker exec sandbox bash install.sh → 装入 mitmproxy
  │   └─ apt-get update + install + 缓存清理
  ├─ docker run --rm --volumes-from sandbox -v "$PWD:/work" -w /work \
  │     debian:12-slim bash run-impl.sh -p 8080 capture.flow
  │   └─ 在 /work 下生成 capture.flow，agent 用 ls 看得到
  ▼
agent 拿到产物
```

第二次同 skill 调用：步骤 ② idempotent guard 命中，跳过装入，直接到 ③。

## 错误处理

| 失败点 | 检测 | 策略 |
|---|---|---|
| sandbox 容器消失（用户 `docker rm` 了）| `docker ps -a` 找不到 | 懒重建（runner.sh 内置）|
| 容器停止但存在 | `docker ps` 找不到 | `docker start <sandbox>` |
| install.sh 执行失败 | 退出码非 0 | runner.sh 直接 fail，stderr 透传 |
| 网络问题导致 apt-get 失败 | apt 退出码 100 | install.sh 内部加 retry（3 次 + 指数退避）|
| 用户主机 docker daemon 未跑 | `docker ps` 报错 | runner.sh 头部 preflight check，提示用户 `open -a Docker` |
| named volume 损坏 | mount 失败 | 不自动重建（避免误删用户数据），提示 `claude-skill-sandbox-reset` 命令 |

## 测试策略

### Distill 侧测试

`tests/test_executable_skill_distill.py`：

1. 跑 plan 阶段，验证产出含 `execution_mode: executable_sandbox` + `assets` 数组
2. 给定 mock fetch 结果，验证 build 阶段确实调起 docker
3. 注入 install.sh 不幂等的 mock LLM 输出，验证 smoke 失败 → 重试 → 仍失败 → 标记 unverified

### Runtime 侧测试

`tests/test_runner_sh.bats`（用 [bats-core](https://github.com/bats-core/bats-core)）：

1. 干净宿主机首次跑 runner.sh，验证 sandbox 容器懒创建
2. 第二次跑同 runner.sh，验证容器复用、工具未重装（observable: 第二次 < 1s）
3. 断电模拟（容器 stop）后跑 runner.sh，验证自动 start
4. `docker rm -f sandbox` 后跑 runner.sh，验证重建

### 试点 skill smoke

3 个试点 skill 每个手动跑一次完整链路（distill → 落库 → agent 调用产生预期输出文件）。

## 实施阶段

| Phase | 内容 | 依赖 |
|---|---|---|
| **P0 基础设施** | runner.sh 模板 + sandbox 懒创建脚本 + docker preflight | — |
| **P1 Distill 扩展** | plan schema + asset 生成 + smoke 验证循环 | P0 |
| **P2 试点蒸馏** | mitmproxy / playwright-cli / maestro 三个 skill | P1 |
| **P3 工具化** | `claude-skill-sandbox-reset` / `-status` / `-shell` 命令 | P0, P2 |
| **P4 文档** | 更新 CLAUDE.md / knowledge-retrieval skill 说明 executable_sandbox 类型 | P2 |

## 关键决策记录

| 决策 | 选择 | 备选 | 理由 |
|---|---|---|---|
| Base image | `debian:12-slim` | python:3.12-slim / ubuntu:24.04 / alpine | 75MB 最小 + apt 完整 + 多架构原生 + 不锁死语言运行时 |
| 容器生命周期 | 持久 + named volume | 临时 + volume / 临时无状态 | 工具一次装入多次复用 + 状态共享 |
| 工作目录挂载 | `docker run --rm --volumes-from sandbox -v $PWD:/work` | bind 到持久容器（无法热挂）/ 复制进容器 | 灵活跟随 agent cwd + 复用工具 volume |
| 网络模式 | bridge 默认 + `host.docker.internal` | `--network host` | macOS 不支持 host 模式（VM 隔离）|
| Install 幂等 | 强制 `which X && exit 0` 头 + distill 跑两遍验证 | 包管理器隐式幂等 | 显式契约更安全，跨发行版可移植 |
| 镜像分发 | 用户首次懒拉 `debian:12-slim` | 我们打 toolbox image / 拉用户预制 | 零运维 + 75MB 一次拉取无感 |
| Plan schema | 加 `execution_mode` + `assets[]` | 单独 executable 管线 / 后处理增强 | 单管线最简，asset 是 SKILL.md 兄弟 artifact |
| 验证粒度 | 实跑 install + smoke + 二次跑测幂等 | 仅静态检查（shellcheck）| LLM 生成的脚本必须实跑过才可信 |

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| LLM 生成的 install.sh 在某主机版本失败（系统差异）| 验证通过但用户跑失败 | distill 验证容器 = 用户运行容器（同 base），降低差异；明确 base image 版本约束 |
| 用户 docker daemon 未跑 | runner.sh 整段失败 | 头部 preflight + 友好提示 |
| named volume 数据无意义膨胀 | 占用磁盘 | `claude-skill-sandbox-reset` 命令一键清空 + 文档指引 |
| `docker run --rm --volumes-from` 不能透传部分 mount type | 个别 skill 兼容性问题 | 试点 3 个 skill 时观察，必要时降级到方案 X |
| 跨 skill 工作流（mitmproxy + playwright）在不同 `--rm` 容器间数据隔离 | 联动场景失效 | 通过 named volume `/state` 持久化中间产物，下游 skill 主动读 |

## 开放问题（plan 阶段细化）

1. `--volumes-from` 与 idempotent install 的交互——install.sh 装到 `/usr/local/bin` 还是 `/state/bin`？关系到 PATH 配置策略
2. 蒸馏验证容器与运行容器同 base 但版本可能漂移（`debian:12-slim` 是 rolling tag）——是否要 pin 到 digest？
3. `claude-skill-sandbox-status` 的输出格式——纯文本 vs JSON？兼顾人 + agent 解析
4. install.sh 的 retry 是 distill 期间的还是 runtime 期间的？两者都要？

## 后续工作（不在本期范围）

- toolbox image opt-in：用户主动 `claude-skill-build-toolbox` 把所有装过的工具打包成 image 供其他设备 import
- 跨设备 sandbox 同步：通过 `docker save` / `load` 迁移 named volume
- non-Docker fallback：podman / nerdctl 兼容（接口相同，theoretically work，需测试）

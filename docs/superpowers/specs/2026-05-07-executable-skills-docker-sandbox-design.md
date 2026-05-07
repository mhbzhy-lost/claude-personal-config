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
| Base image | `debian:12-slim`（runtime tag）/ digest pinned at distill | runtime 跟随用户拿安全更新，distill 时 pin digest 以可重现验证 |
| 启动命令 | `sleep infinity` | 长跑空进程，等 `docker exec` |
| Restart 策略 | `unless-stopped` | 开机重启即用，崩溃自恢复 |
| Named volume | `claude-skill-state` → `/state` | manifests / cookies / cert / 用户中间数据 |
| Bind mount（创建时）| `$HOME:/host_home`（读写）| 允许 sandbox 访问 agent 工作目录；runner.sh 把 `$PWD` 翻译成 `/host_home/${PWD#$HOME/}` |
| Network | `bridge`（默认）| `--network host` 在 macOS 无效，统一 bridge + `host.docker.internal` |

**为什么不用 `docker run --rm --volumes-from`**：`--volumes-from` 只继承 named volume mount，**不继承容器可写层**。`apt-get install` 把文件落到 `/usr/bin/`（容器层），fresh 容器拿不到。用 `docker exec` 进持久 sandbox 才能复用工具。

**`$PWD` 不在 `$HOME` 下时的兜底**：runner.sh 检测后 `cp -r $PWD <sandbox-tmp>` 复制进 sandbox 临时目录执行；产物再 `docker cp` 拷回。覆盖率：日常开发场景 ≥95% 在 `$HOME` 下，兜底只为 `/tmp/...` 等少数情况。

### 3. runner.sh 模板

```bash
#!/usr/bin/env bash
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
SANDBOX="${CLAUDE_SKILL_SANDBOX:-claude-skill-sandbox}"
BASE_IMAGE="${CLAUDE_SKILL_BASE:-debian:12-slim}"
STATE_VOL="${CLAUDE_SKILL_STATE_VOL:-claude-skill-state}"

# Preflight: docker daemon 可达
docker info >/dev/null 2>&1 || {
  echo "[claude-skill] docker daemon not reachable. Start Docker Desktop and retry." >&2
  exit 2
}

# 1. 容器懒创建
if ! docker ps -a --format '{{.Names}}' | grep -q "^${SANDBOX}$"; then
  docker volume create "$STATE_VOL" >/dev/null
  docker run -d --name "$SANDBOX" --restart=unless-stopped \
    --mount type=volume,source="$STATE_VOL",target=/state \
    --mount type=bind,source="$HOME",target=/host_home \
    "$BASE_IMAGE" sleep infinity
fi

# 2. 容器停止时启动
docker ps --format '{{.Names}}' | grep -q "^${SANDBOX}$" || \
  docker start "$SANDBOX" >/dev/null

# 3. 工具懒装入（idempotent_check 由 _meta.json 提供，distill 注入）
TOOL_CHECK="${CLAUDE_SKILL_TOOL_CHECK:-which mitmproxy}"
docker exec "$SANDBOX" bash -c "$TOOL_CHECK" >/dev/null 2>&1 || \
  docker exec -e DEBIAN_FRONTEND=noninteractive "$SANDBOX" bash /host_home/${SKILL_DIR#$HOME/}/install.sh

# 4. 翻译 host $PWD 到 in-container 路径
if [[ "$PWD" == "$HOME"* ]]; then
  IN_CWD="/host_home/${PWD#$HOME/}"
else
  # Fallback: 复制到 sandbox tmp，执行后拷回
  echo "[claude-skill] \$PWD outside \$HOME, using copy-in fallback" >&2
  TMPID=$(uuidgen | tr -d -)
  docker exec "$SANDBOX" mkdir -p "/tmp/work-$TMPID"
  docker cp "$PWD/." "$SANDBOX:/tmp/work-$TMPID/"
  IN_CWD="/tmp/work-$TMPID"
  trap 'docker cp "$SANDBOX:$IN_CWD/." "$PWD/" 2>/dev/null; docker exec "$SANDBOX" rm -rf "$IN_CWD"' EXIT
fi

# 5. 执行
docker exec -i -w "$IN_CWD" "$SANDBOX" \
  bash "/host_home/${SKILL_DIR#$HOME/}/run-impl.sh" "$@"
```

### 3.1 工作目录映射：Path B（docker exec + $HOME mount）

**核心做法**：sandbox 启动时把 `$HOME` mount 到 `/host_home`，runner.sh 把 host `$PWD` 翻译成 `/host_home/${PWD#$HOME/}`，所有 `docker exec` 用这个 in-container 路径作为 cwd。

| 优点 | 缺点 |
|---|---|
| install.sh 用标准 apt/pip，无路径定制 | `$PWD` 必须在 `$HOME` 下（覆盖 ≥95% 实际场景）|
| 工具一次装入持久容器，多次复用 | `$HOME` 之外用 copy-in/copy-out 兜底，体验稍差 |
| 工具状态（cookies / cert）共享 named volume | macOS bind mount 大量小文件 IO 慢——但 skill 产物多为单文件（capture / screenshot），实测无感 |
| 逻辑简单，runner.sh 易维护 | sandbox 容器对 `$HOME` 有读写权限——隔离边界比 read-only 弱 |

**为什么不是其他方案**：
- ❌ `--volumes-from`：不继承容器可写层，apt 装的工具拿不到
- ❌ `docker run --rm`：每次 cold start 200-500ms 累积成本，且工具状态难持久
- ❌ 全 root mount（`/`）：暴露面过大，安全审计不友好

### 4. install.sh 强约束

**幂等性强制**：所有 install.sh 第一行（紧跟 set/shebang 后）必须是 idempotent guard。**网络敏感命令必须用 `retry` helper 包裹**，distill 注入 helper。

```bash
#!/usr/bin/env bash
# install.sh — sandbox 内安装 mitmproxy（distill 生成）
set -euo pipefail
which mitmproxy >/dev/null 2>&1 && exit 0   # ← idempotent guard

# distill 注入的 helper（所有 install.sh 头部统一）
retry() {
  local n=0 max=3
  until "$@"; do
    n=$((n+1))
    [ $n -ge $max ] && { echo "[claude-skill] retry $n/$max failed: $*" >&2; return 1; }
    sleep $((n*3))
  done
}

# LLM 生成的内容
retry apt-get update
apt-get install -y --no-install-recommends mitmproxy ca-certificates
apt-get clean && rm -rf /var/lib/apt/lists/*
mitmproxy --version >/dev/null  # 自验证
```

**distill build 阶段验证序列**：

1. **第一次在 fresh `debian:12-slim`**（pin digest）：跑 install.sh，必须装成功 + smoke 全过
2. **第二次紧接着**：必须 `which` guard 命中、秒退、零副作用（`docker diff` 检测无新增文件）
3. **smoke_test 序列**：从 plan 阶段声明的命令清单逐条执行，全 0 退出码
4. **任一步失败**：stderr 末 100 行 + 当前脚本反馈给 LLM 重生成（≤3 轮）；3 轮仍失败 → asset 标 `unverified: true`，runner.sh 拒绝执行除非 `--allow-unverified`

**为什么 install.sh 内做网络 retry**：

- distill 内的 R1（LLM 重生成）解决"脚本本身有 bug"
- install.sh 内的 R2（retry helper）解决"用户机器上的临时网络抖动"
- 两者正交，都需要
- runner.sh **不**再外加重试层，避免真实失败暴露被推迟到 18s 后

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
      2. 解析 base image digest:
         a. docker pull debian:12-slim
         b. docker inspect --format '{{index .RepoDigests 0}}' debian:12-slim
         c. 把 digest 记到 _meta.json.validated_against_digest
      3. 对每个 asset:
         a. LLM 按 source + asset.purpose 生成脚本
         b. shellcheck (bash) / py_compile (python) 静态检查
         c. 临时 docker run --rm <digest> 实跑（pin 到 digest，不是 tag）：
            - bash install.sh     # 第一遍，必须成功
            - bash install.sh     # 第二遍，必须秒退（idempotent）
            - docker diff <ctnr>  # 第二遍后 diff 必须为空（零副作用）
            - eval $smoke_test    # 必须全 0 退出码
         d. 失败 → 反馈 stderr 末 100 行 + 当前脚本给 LLM，重试（≤3 轮）
         e. 3 轮仍失败 → asset 标记 unverified，不入库，summary warn
      4. 生成 runner.sh (固定模板，参数化 sandbox name / state vol / TOOL_CHECK)
      5. _meta.json 记录: execution_mode, validated_against_digest, asset 验证状态
```

#### Drift 检测（runtime）

runner.sh 启动时对比当前 `debian:12-slim` 的 digest 与 `_meta.json.validated_against_digest`：

- 一致 → 静默
- 漂移 → stderr warn `[claude-skill] base image drifted from validated digest, run claude-skill-sandbox-validate <skill> if scripts misbehave`
- **不阻断执行**——多数场景 drift 无影响，强制阻断会让用户每次安全升级后无法工作

提供 `claude-skill-sandbox-validate <skill>` 命令在当前 base 上重跑 install + smoke + 更新 `_meta.json` 的 digest。

### 6. 数据流（agent 实际调用流）

```
agent: bash $HOME/proj/skills/web-scraping/mitmproxy-tool/runner.sh -p 8080 capture.flow
  │
  ▼
runner.sh:
  ├─ docker info → daemon 可达 ✓
  ├─ docker ps -a 检查 sandbox → 不存在
  ├─ docker volume create claude-skill-state
  ├─ docker run -d --name claude-skill-sandbox --restart=unless-stopped \
  │     -v claude-skill-state:/state -v $HOME:/host_home \
  │     debian:12-slim sleep infinity
  ├─ docker exec sandbox 'which mitmproxy' → 失败
  ├─ docker exec sandbox bash /host_home/proj/skills/.../install.sh
  │   └─ retry apt-get update + install + 缓存清理
  ├─ digest 比对 → 一致，静默
  ├─ $PWD=$HOME/proj 在 $HOME 下 → IN_CWD=/host_home/proj
  ├─ docker exec -w /host_home/proj sandbox \
  │     bash /host_home/proj/skills/.../run-impl.sh -p 8080 capture.flow
  │   └─ 在 /host_home/proj/ 下生成 capture.flow（host 侧 $HOME/proj/capture.flow 同一文件）
  ▼
agent 拿到产物（host 侧文件已就位）
```

第二次同 skill 调用：步骤 ④ idempotent guard 命中，秒退；后续直接到执行步骤。

### 7. 状态查询命令 `claude-skill-sandbox-status`

人机两用：默认彩色文本，`--json` 切机读。

**默认文本输出**：

```
Sandbox Container
  name        claude-skill-sandbox
  status      running (started 3h 42m ago)
  base image  debian:12-slim @ sha256:5f3e... (drifted from validated)
  uptime      14 days

Installed Tools (4)
  mitmproxy        10.1.5    skill: web-scraping/mitmproxy-tool
  playwright       1.40.0    skill: playwright/playwright-cli
  maestro          1.34.0    skill: maestro/maestro-cli
  ffmpeg           6.0       skill: ffmpeg/ffmpeg-encode

State Volume (claude-skill-state)
  size        128 MB
  paths       /state/manifests (4) /state/cookies (12) /state/cert (1)

Recent Skill Invocations (last 7d)
  mitmproxy-tool      8 calls
  playwright-cli      3 calls

Health
  ✓ docker daemon reachable
  ✓ container responsive
  ⚠ base digest drift (run validate to confirm install.sh still works)
```

**`--json` 输出 schema**（agent 解析）：

```json
{
  "sandbox": {"name": "...", "status": "running|stopped|missing", "container_id": "...",
              "started_at": "ISO8601", "uptime_seconds": 0},
  "base_image": {"ref": "debian:12-slim", "current_digest": "sha256:...",
                 "validated_digest": "sha256:...", "drifted": true},
  "tools": [{"name": "...", "version": "...", "skill": "...", "installed_at": "..."}],
  "state_volume": {"name": "...", "size_bytes": 0},
  "skills_recent": [{"name": "...", "invocations_7d": 0}],
  "health": {"docker_reachable": true, "container_responsive": true, "warnings": []}
}
```

**数据来源**：

- `docker inspect` 拿容器/镜像/volume 元数据
- `/state/manifests/<skill-name>.json` —— 每个 skill 第一次装入时由 install.sh 末尾 emit；status 命令读全部 manifests 聚合
- `/state/manifests/usage.log` —— runner.sh 每次成功执行追加一行 `<ISO8601> <skill-name>`，status 命令统计最近 7d

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
| **工作目录映射** | **Path B：`docker exec` + `$HOME → /host_home` mount + cwd 路径翻译** | --volumes-from（不继承容器层）/ 全 root mount（暴露面）| 标准 apt/pip 装入 + 95% 场景 cwd 在 $HOME 下；少数场景 docker cp 兜底 |
| 网络模式 | bridge 默认 + `host.docker.internal` | `--network host` | macOS 不支持 host 模式（VM 隔离）|
| Install 幂等 | 强制 `which X && exit 0` 头 + distill 跑两遍 + `docker diff` 校验零副作用 | 包管理器隐式幂等 | 显式契约更安全，跨发行版可移植 |
| **网络重试** | **install.sh 内 `retry()` helper（distill 注入），3 次指数退避** | runner.sh 外层 retry / 不重试 | 解决用户机器临时网络抖动；R1 分布式（distill 端 LLM 重生成）+ R2（runtime 内 retry）正交 |
| 镜像分发 | 用户首次懒拉 `debian:12-slim` | 我们打 toolbox image / 拉用户预制 | 零运维 + 75MB 一次拉取无感 |
| **Digest pin 策略** | **Distill pin digest（写入 `_meta.json`）+ runtime 用 tag + drift warning + `validate` 命令重跑** | 全程 pin（错过安全更新）/ 全程不 pin（不可重现）| 验证可重现 + 用户能拿到安全更新 |
| Plan schema | 加 `execution_mode` + `assets[]` + `validated_against_digest` | 单独 executable 管线 / 后处理增强 | 单管线最简 |
| 验证粒度 | 实跑 install + 二次跑测幂等 + `docker diff` 校验副作用 + smoke | 仅静态检查 / 仅一次 install | LLM 脚本必须实跑+幂等都过才入库 |
| **status 输出** | **默认彩色文本 + `--json` 开关；数据来源 `docker inspect` + `/state/manifests/*.json`** | 仅文本（agent 解析痛苦）/ 仅 JSON（人读痛苦）| 标准 `--format` 模式，人机两用 |

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| LLM 生成的 install.sh 在某主机版本失败（系统差异）| 验证通过但用户跑失败 | distill 验证容器 = 用户运行容器（同 base + digest 记录），drift 时 warn |
| 用户 docker daemon 未跑 | runner.sh 整段失败 | 头部 `docker info` preflight + 友好提示 |
| named volume 数据无意义膨胀 | 占用磁盘 | `claude-skill-sandbox-reset` 命令一键清空 + 文档指引 |
| 用户 `$PWD` 不在 `$HOME` 下 | 路径翻译失效 | runner.sh 切换 copy-in/cp-out fallback；warn 用户体验稍差 |
| sandbox 容器对 `$HOME` 有读写权限 | 容器内进程可写整个家目录 | 文档明示这是设计选择；敏感场景用 `:ro` 变体（需明确 trade-off）|
| 跨 skill 联动通过容器内 fs 共享 | 单容器持久 fs 累积工具状态 | 同容器持久即可，命名约定 `/state/<skill>/...` 隔离 |
| Base digest drift 后 install.sh 行为变 | 旧 skill 失效 | runner.sh drift warn + `validate` 命令重跑 + 自动更新 `_meta.json` digest |

## 已解决的设计问题（原 4 个开放问题）

1. ✅ **PATH 与 install 路径**：抛弃 `--volumes-from`（不继承容器层），改用 Path B（`docker exec` 进持久 sandbox + `$HOME` mount + cwd 翻译）。install.sh 用标准 apt/pip 装到 `/usr/local/bin`。详见 §3.1
2. ✅ **Digest pin**：Distill 时 pin digest 写入 `_meta.json.validated_against_digest`，runtime 用 tag 跟随安全更新，drift 时 warn 不阻断；`claude-skill-sandbox-validate <skill>` 命令在新 base 上重跑验证。详见 §5
3. ✅ **status 输出格式**：默认文本（人读）+ `--json` flag（agent 读），数据来源 `docker inspect` + `/state/manifests/<skill>.json`。详见 §7
4. ✅ **Retry 归属**：双层正交——R1 distill 内 LLM 重生成（脚本质量问题），R2 install.sh 内 `retry()` helper（运行时网络抖动）。runner.sh 不再外加重试避免延迟暴露真实失败。详见 §4

## 后续工作（不在本期范围）

- toolbox image opt-in：用户主动 `claude-skill-build-toolbox` 把所有装过的工具打包成 image 供其他设备 import
- 跨设备 sandbox 同步：通过 `docker save` / `load` 迁移 named volume
- non-Docker fallback：podman / nerdctl 兼容（接口相同，theoretically work，需测试）

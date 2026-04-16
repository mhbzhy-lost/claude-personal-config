---
name: docker-core
description: "Dockerfile 指令、多阶段构建、镜像层缓存优化与 BuildKit 特性"
tech_stack: [docker, backend]
---

# Dockerfile 核心（镜像构建）

> 来源：https://docs.docker.com/reference/dockerfile/ / https://docs.docker.com/build/building/best-practices/
> 版本基准：Docker 27+、BuildKit 默认启用

## 用途

编写 Dockerfile 构建容器镜像，涵盖指令语法、多阶段构建、层缓存优化与 BuildKit 高级特性。

## 何时使用

- 将应用打包为可移植的容器镜像
- 优化镜像体积（从 GB 级降到 MB 级）
- 加速 CI/CD 构建流水线
- 需要可复现、可审计的构建过程

## 核心指令速查

### FROM — 基础镜像

```dockerfile
# 固定版本，避免 latest 导致不可复现
FROM python:3.12-slim AS base

# scratch 是空镜像，适合静态编译语言
FROM scratch
```

- 每个 `FROM` 开启一个新的构建阶段
- 使用 `AS <name>` 命名阶段，便于后续 `COPY --from=<name>` 引用

### RUN — 执行命令

```dockerfile
# 合并命令减少层数，末尾清理缓存
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl git && \
    rm -rf /var/lib/apt/lists/*

# BuildKit heredoc 语法（Docker 23.0+）
RUN <<EOF
set -e
apt-get update
apt-get install -y --no-install-recommends curl
rm -rf /var/lib/apt/lists/*
EOF
```

- 每条 `RUN` 生成一个新层，合并相关命令可减小镜像体积
- heredoc 需要 BuildKit（Docker 23.0+ 默认启用）

### COPY vs ADD

```dockerfile
# 优先使用 COPY，语义清晰
COPY requirements.txt /app/
COPY . /app/

# ADD 仅在需要自动解压 tar 时使用
ADD archive.tar.gz /opt/

# --link 标志：独立于前层缓存，加速并行构建
COPY --link requirements.txt /app/
```

- `ADD` 会自动解压 tar 且支持 URL（不推荐下载 URL，用 `RUN curl` 替代）
- `COPY --link` 让该层不依赖前层内容，BuildKit 可并行构建

### WORKDIR — 工作目录

```dockerfile
WORKDIR /app
# 后续 RUN/COPY/CMD 的相对路径基于 /app
```

- 始终用 `WORKDIR` 而非 `RUN cd /app`，后者不会持久

### ARG vs ENV

```dockerfile
# ARG 仅在构建期可用
ARG PYTHON_VERSION=3.12

# ENV 在构建期和运行期均可用
ENV APP_ENV=production
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# ARG 在 FROM 前声明可跨阶段使用
ARG BASE_IMAGE=python:3.12-slim
FROM ${BASE_IMAGE}
```

| 对比 | ARG | ENV |
|------|-----|-----|
| 构建期可用 | 是 | 是 |
| 运行期可用 | 否 | 是 |
| 可被 `--build-arg` 覆盖 | 是 | 否 |
| 写入镜像元数据 | 否 | 是 |

### CMD vs ENTRYPOINT

```dockerfile
# exec 形式（推荐）：直接执行，PID 1 接收信号
ENTRYPOINT ["python", "-m", "uvicorn"]
CMD ["main:app", "--host", "0.0.0.0", "--port", "8000"]

# shell 形式：通过 /bin/sh -c 执行，信号无法传递
CMD python main.py  # 不推荐
```

组合规则：

| ENTRYPOINT | CMD | 实际执行 |
|------------|-----|----------|
| `["python"]` | `["app.py"]` | `python app.py` |
| `["python"]` | 无 | `python` |
| 无 | `["python", "app.py"]` | `python app.py` |

- `docker run <image> <args>` 会覆盖 CMD，不覆盖 ENTRYPOINT
- `docker run --entrypoint` 覆盖 ENTRYPOINT

### USER — 非 root 运行

```dockerfile
RUN groupadd -r appuser && useradd -r -g appuser appuser
USER appuser
```

### EXPOSE / HEALTHCHECK / LABEL

```dockerfile
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

LABEL maintainer="team@example.com" \
      version="1.0.0"
```

## 多阶段构建

多阶段构建是减小镜像体积的核心手段，可将构建工具排除在最终镜像之外。

```dockerfile
# === 阶段 1：构建 ===
FROM golang:1.22 AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app/server .

# === 阶段 2：运行（仅包含二进制） ===
FROM gcr.io/distroless/static-debian12
COPY --from=builder /app/server /app/server
EXPOSE 8080
ENTRYPOINT ["/app/server"]
```

效果：golang:1.22 镜像 ~1GB -> 最终镜像 ~10MB。

### 多阶段构建进阶

```dockerfile
# 共享基础阶段
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# 依赖安装阶段
FROM base AS deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 测试阶段（CI 中单独构建）
FROM deps AS test
COPY . .
RUN pytest

# 最终生产阶段
FROM base AS production
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY . .
USER nobody
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0"]
```

- 用 `docker build --target test .` 可单独运行测试阶段
- 各阶段可并行构建（BuildKit 自动分析依赖图）

## .dockerignore

```text
# 版本控制
.git
.gitignore

# 依赖与虚拟环境
node_modules
__pycache__
*.pyc
.venv
venv

# IDE 与系统文件
.vscode
.idea
*.swp
.DS_Store

# Docker 自身
Dockerfile
docker-compose*.yml
.dockerignore

# 敏感文件
.env
*.pem
*.key
```

- 放在 Dockerfile 同目录，语法类似 `.gitignore`
- 减小构建上下文体积，加速 `docker build`
- 防止敏感文件泄漏到镜像

## 层缓存优化

### 核心原则

1. **不变的层放前面**：系统依赖 -> 应用依赖 -> 应用代码
2. **频繁变化的层放后面**：每层变化会使后续所有层缓存失效

```dockerfile
FROM python:3.12-slim
WORKDIR /app

# 第 1 层：很少变化 — 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev && rm -rf /var/lib/apt/lists/*

# 第 2 层：偶尔变化 — Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 第 3 层：频繁变化 — 应用代码
COPY . .

CMD ["python", "main.py"]
```

### BuildKit 缓存挂载

```dockerfile
# pip 缓存持久化，避免重复下载
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# apt 缓存持久化
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends curl
```

### CI/CD 远程缓存

```bash
# 构建并推送缓存到 registry
docker build --cache-to type=registry,ref=myrepo/app:cache \
             --cache-from type=registry,ref=myrepo/app:cache \
             -t myrepo/app:latest .
```

## BuildKit 特性速查

| 特性 | 语法 | 用途 |
|------|------|------|
| 缓存挂载 | `RUN --mount=type=cache` | 持久化包管理器缓存 |
| Secret 挂载 | `RUN --mount=type=secret,id=mysecret` | 构建期安全传递密钥 |
| SSH 挂载 | `RUN --mount=type=ssh` | 构建期使用宿主 SSH key |
| Heredoc | `RUN <<EOF ... EOF` | 多行命令清晰编写 |
| `COPY --link` | `COPY --link file /dest` | 独立层缓存，并行构建 |
| 并行阶段 | 自动 | 无依赖的阶段并行执行 |
| SBOM / Provenance | `--sbom=true --provenance=true` | 软件物料清单与来源证明 |

### Secret 挂载示例

```dockerfile
# 构建时传入密钥，不写入任何层
RUN --mount=type=secret,id=gh_token \
    GH_TOKEN=$(cat /run/secrets/gh_token) && \
    pip install git+https://${GH_TOKEN}@github.com/org/private-repo.git
```

```bash
docker build --secret id=gh_token,src=./token.txt .
```

## 常见陷阱

- **使用 `latest` 标签**：构建不可复现，上游更新可能破坏构建；始终指定具体版本如 `python:3.12-slim`
- **`COPY . .` 放在依赖安装之前**：任何代码修改都会导致依赖重新安装，应先 COPY 依赖文件
- **RUN 指令不合并**：每条 `RUN` 产生一层，`apt-get update` 和 `apt-get install` 分开写会导致缓存问题（update 缓存但 install 拿到过期索引）
- **不清理包管理器缓存**：`rm -rf /var/lib/apt/lists/*` 必须在同一条 `RUN` 中执行
- **shell 形式的 CMD/ENTRYPOINT**：通过 `sh -c` 执行，PID 1 是 shell 进程，应用无法接收 SIGTERM，导致容器需要 10s 超时才能停止
- **构建上下文过大**：没有 `.dockerignore`，`.git`、`node_modules` 等被发送到 daemon，构建缓慢
- **ARG 中存放密钥**：ARG 值会写入镜像历史（`docker history`），应使用 `--mount=type=secret`
- **以 root 运行容器**：安全风险，容器逃逸后攻击者获得宿主 root 权限

## 组合提示

- 搭配 **docker-compose** 进行本地开发和服务编排
- 搭配 **docker-volumes** 处理构建产物的持久化
- 搭配 **docker-python** 获取 Python 项目的 Dockerfile 模板
- 搭配 **docker-networking** 配置构建后容器的网络通信

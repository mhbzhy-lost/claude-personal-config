---
name: docker-python
description: "Python 应用容器化最佳实践：基础镜像选择、依赖安装优化、uv 集成与多阶段构建"
tech_stack: [docker, backend]
language: [python]
---

# Docker Python（Python 容器化）

> 来源：https://docs.docker.com/build/building/best-practices/ / https://docs.astral.sh/uv/guides/integration/docker/
> 版本基准：Docker 27+、Python 3.12/3.13、uv 0.6+

## 用途

将 Python 应用打包为生产级容器镜像，涵盖基础镜像选型、依赖管理、安全加固、性能优化的完整实践。

## 何时使用

- Web 应用（FastAPI/Django/Flask）部署为容器
- 数据处理/ML 推理服务容器化
- CLI 工具分发
- CI/CD 流水线中构建 Python 镜像

## 基础镜像选择

| 镜像 | 基础系统 | 体积 | 适用场景 |
|------|---------|------|---------|
| `python:3.12` | Debian Bookworm | ~1GB | 需要完整编译工具链 |
| `python:3.12-slim` | Debian Bookworm (精简) | ~150MB | **生产首选**，兼容性好 |
| `python:3.12-alpine` | Alpine Linux (musl) | ~50MB | 体积极致优化，无 C 扩展需求 |
| `python:3.12-bookworm` | Debian Bookworm | ~1GB | 同 `python:3.12` |

### 选型建议

```
需要 numpy/pandas/scipy/cryptography 等 C 扩展？
  ├─ 是 → python:3.12-slim（推荐）
  │        Alpine 下需额外编译，构建慢且镜像反而更大
  └─ 否 → 纯 Python 项目？
           ├─ 是 → python:3.12-alpine（最小体积）
           └─ 否 → python:3.12-slim（安全选择）
```

**始终固定版本**：`python:3.12.7-slim` 优于 `python:3.12-slim`，保证构建可复现。

## 基础 Dockerfile（pip）

```dockerfile
FROM python:3.12-slim AS base

# 环境变量优化
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# 创建非 root 用户
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

# 系统依赖（如需要）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 依赖安装（利用层缓存，先复制依赖文件）
COPY requirements.txt .
RUN pip install -r requirements.txt

# 应用代码
COPY . .

# 切换到非 root 用户
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 多阶段构建（pip）

```dockerfile
# === 阶段 1：构建依赖 ===
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 安装编译工具（仅构建阶段需要）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 安装到虚拟环境（方便整体复制）
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install -r requirements.txt

# === 阶段 2：生产镜像 ===
FROM python:3.12-slim AS production

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 仅安装运行时系统库（不含 build-essential）
RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

# 从构建阶段复制虚拟环境
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY . .

RUN groupadd -r appuser && useradd -r -g appuser appuser
USER appuser

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

效果：构建阶段 ~800MB -> 最终镜像 ~200MB（不含 build-essential、头文件等）。

## uv 集成（推荐）

uv 是 Astral 出品的 Python 包管理器，比 pip 快 10-100 倍。

### 基础用法

```dockerfile
FROM python:3.12-slim

# 从官方 uv 镜像复制二进制（比 pip install uv 更高效）
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# 两阶段依赖安装：先锁文件，再项目代码
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### uv 多阶段构建（生产级）

```dockerfile
# === 阶段 1：构建 ===
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# 先安装依赖（利用缓存）
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# 再安装项目本身
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# === 阶段 2：运行 ===
FROM python:3.12-slim AS production

WORKDIR /app

# 仅复制虚拟环境和应用代码
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app /app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN groupadd -r appuser && useradd -r -g appuser appuser
USER appuser

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### uv 关键环境变量

| 变量 | 值 | 说明 |
|------|-----|------|
| `UV_LINK_MODE=copy` | copy | 避免硬链接跨文件系统警告 |
| `UV_COMPILE_BYTECODE=1` | 1 | 预编译 .pyc 加速启动 |
| `UV_PYTHON_DOWNLOADS=never` | never | 禁止自动下载 Python（使用镜像自带的） |
| `UV_CACHE_DIR` | 路径 | 自定义缓存目录 |

## 依赖安装优化

### BuildKit 缓存挂载

```dockerfile
# pip 缓存
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# uv 缓存
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# apt 缓存
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends libpq-dev
```

### 分层策略

```dockerfile
# 错误：任何代码改动都重新安装依赖
COPY . .
RUN pip install -r requirements.txt

# 正确：依赖文件先复制，利用缓存
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
```

## 安全加固

### 非 root 用户

```dockerfile
# 方式一：显式创建用户
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser
RUN chown -R appuser:appuser /app
USER appuser

# 方式二：使用 nobody（简单场景）
USER nobody
```

### Secret 处理

```dockerfile
# 错误：密钥写入镜像层
COPY .env /app/.env
ENV API_KEY=secret123

# 正确：构建期使用 secret mount
RUN --mount=type=secret,id=pip_conf,target=/etc/pip.conf \
    pip install -r requirements.txt

# 运行期通过环境变量或 secret 管理传入
```

### 最小权限原则

```dockerfile
FROM python:3.12-slim

# 只安装运行时必需的系统库
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libpq5 \          # 运行时库
    && rm -rf /var/lib/apt/lists/*
# 不安装 build-essential、gcc 等编译工具
```

## Health Check

```dockerfile
# 方式一：curl（需要安装 curl）
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD curl -f http://localhost:8000/health || exit 1

# 方式二：Python（无额外依赖，推荐）
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# 方式三：Compose 中配置
# 见 docker-compose skill
```

## 环境变量最佳实践

```dockerfile
# Python 运行时优化
ENV PYTHONDONTWRITEBYTECODE=1   # 不生成 .pyc 文件（减小镜像）
ENV PYTHONUNBUFFERED=1          # stdout/stderr 不缓冲（日志实时输出）
ENV PYTHONFAULTHANDLER=1        # 段错误时打印 traceback
ENV PYTHONHASHSEED=random       # 随机 hash seed（安全）

# pip 优化
ENV PIP_NO_CACHE_DIR=1          # 不缓存下载（减小镜像）
ENV PIP_DISABLE_PIP_VERSION_CHECK=1  # 跳过版本检查
```

## 完整生产示例：FastAPI + PostgreSQL

```dockerfile
# === Dockerfile ===
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# ---
FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 curl && \
    rm -rf /var/lib/apt/lists/*

RUN groupadd -r app && useradd -r -g app -d /app app

WORKDIR /app
COPY --from=builder --chown=app:app /app /app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

```yaml
# === compose.yaml ===
services:
  api:
    build:
      context: .
      target: ""  # 使用最终阶段
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://user:pass@db:5432/app
      REDIS_URL: redis://redis:6379/0
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: app
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d app"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 3

volumes:
  db-data:
```

## .dockerignore

```text
__pycache__
*.pyc
*.pyo
.venv
venv
.env
.git
.gitignore
.mypy_cache
.pytest_cache
.ruff_cache
.coverage
htmlcov
dist
build
*.egg-info
Dockerfile
docker-compose*.yml
.dockerignore
*.md
tests/
docs/
```

## 常见陷阱

- **使用 Alpine 安装 C 扩展包**：Alpine 使用 musl libc，numpy/pandas/cryptography 等需要从源码编译，构建慢且最终镜像可能比 slim 更大；除非项目纯 Python，否则首选 slim
- **不固定 Python 镜像版本**：`python:3.12` 会随 patch 更新变化，用 `python:3.12.7-slim` 保证可复现性
- **依赖安装在 COPY . . 之后**：任何代码改动都触发依赖重新安装；先 COPY requirements.txt 再安装
- **以 root 运行生产容器**：容器逃逸后攻击者获得宿主机 root 权限；始终创建并切换到非 root 用户
- **在镜像中存储密钥**：`ENV API_KEY=xxx` 或 `COPY .env .` 将密钥写入镜像层；使用 `--mount=type=secret` 或运行时环境变量
- **不设置 PYTHONUNBUFFERED**：容器中 Python 默认缓冲 stdout，日志不实时输出，crash 时丢失日志
- **虚拟环境路径错误**：多阶段构建复制 venv 后忘记设置 `PATH`，导致使用系统 Python
- **uv sync 未加 --frozen**：没有 `--frozen` 时 uv 可能更新 lock 文件，破坏可复现性

## 组合提示

- 搭配 **docker-core** 理解 Dockerfile 指令语义和 BuildKit 特性
- 搭配 **docker-compose** 编排 Python 应用 + 数据库 + 缓存
- 搭配 **docker-volumes** 管理数据持久化（上传文件、数据库数据）
- 搭配 **docker-networking** 配置服务间通信

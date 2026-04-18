---
name: docker-image-optimization
description: 通过多阶段构建、缓存优化与构建密钥管理打造更小更安全的 Docker 镜像
tech_stack: [docker, buildkit]
capability: [container]
version: "docker unversioned"
collected_at: 2026-04-18
---

# Docker 镜像优化（多阶段构建 / 缓存 / 构建密钥）

> 来源：https://docs.docker.com/build/building/best-practices/ · multi-stage · cache/optimize · secrets

## 用途
通过合理组织 Dockerfile、启用 BuildKit 特性，降低镜像体积、加速构建、避免将密钥泄漏进镜像。

## 何时使用
- 产出生产镜像时需要剔除编译器和调试工具
- CI 频繁重建导致依赖重复下载
- 构建过程中需要访问私有仓库或云凭证
- 需要把基础镜像锁定到不可变 digest 以保证供应链完整

## 基础用法

**多阶段构建 + 命名阶段**：
```dockerfile
# syntax=docker/dockerfile:1
FROM golang:1.25 AS build
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/root/.cache/go-build \
    go build -o /out/app .

FROM alpine:3.21@sha256:a8560b36e8b8210634f77d9f7f9efd7ffa463e380b75e2e74aff4511df3ef88c
COPY --from=build /out/app /app
USER 10001:10001
ENTRYPOINT ["/app"]
```

**层顺序（依赖先于源码）**：
```dockerfile
COPY package.json yarn.lock .
RUN npm install
COPY . .
RUN npm build
```

**只构建某个阶段**：`docker build --target build -t hello .`

## 关键 API（摘要）
- `FROM <image> AS <name>` — 命名阶段，`COPY --from=<name>` 引用
- `COPY --from=nginx:latest /etc/nginx/nginx.conf ./` — 从外部镜像复制
- `RUN --mount=type=cache,target=<path>` — 跨构建缓存依赖（npm/pip/go/apt/cargo）
- `RUN --mount=type=bind,target=.` — 临时挂载上下文，不落盘到最终层
- `RUN --mount=type=secret,id=<id>` — 构建时挂载密钥到 `/run/secrets/<id>`
- `RUN --mount=type=ssh` — 构建时转发 SSH agent，用于拉私有 git 仓库
- CLI: `docker build --secret id=aws,src=$HOME/.aws/credentials .`
- CLI: `docker build --pull --no-cache -t img:tag .` — 拉取新 base + 全量重建
- CLI: `--cache-to type=registry,ref=...,mode=max` / `--cache-from` — CI 远程缓存
- `.dockerignore` — 缩小构建上下文，降低缓存失效概率

## 注意事项
- **密钥绝不能走 `ARG` 或 `ENV`**——会持久化到镜像层；必须用 `--mount=type=secret`
- `apt-get update` 必须与 `apt-get install` 合并在同一 RUN 层，否则 update 层被缓存后 install 拿到过期索引；结尾清理 `rm -rf /var/lib/apt/lists/*`
- 使用 `--no-install-recommends` 与 digest 钉住基础镜像（`image@sha256:...`）
- BuildKit 只构建目标依赖的阶段，传统 builder 会顺序执行所有前置阶段
- 绑定挂载 `type=bind` 默认只读，不会留在最终镜像
- `USER` 指定显式 UID/GID 以非 root 身份运行服务
- 密钥挂载按间隔刷新（非实时），轮换时需保证 token 生命周期长于刷新间隔

## 组合提示
配合 `docker-security-scanning`（Scout / Trivy 扫描产出的优化镜像）、CI 中的 `buildx` + 远程缓存、Kubernetes 部署前的 SBOM 生成（`--sbom=true --provenance=true`）。

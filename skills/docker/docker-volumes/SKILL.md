---
name: docker-volumes
description: "Docker 卷类型、数据持久化策略、备份恢复与 volume driver"
tech_stack: [docker, backend]
---

# Docker Volumes（数据持久化）

> 来源：https://docs.docker.com/engine/storage/ / https://docs.docker.com/engine/storage/volumes/
> 版本基准：Docker 27+、Compose V2

## 用途

管理容器数据的持久化存储，包括 named volume、bind mount、tmpfs 三种挂载类型的选择与使用，以及数据备份恢复策略。

## 何时使用

- 数据库、缓存等有状态服务需要数据持久化
- 开发环境需要宿主机代码实时同步到容器
- 容器间需要共享文件
- 敏感临时数据需要内存存储（不落盘）
- 需要备份和迁移容器数据

## 三种挂载类型对比

| 特性 | Named Volume | Bind Mount | tmpfs |
|------|-------------|------------|-------|
| 存储位置 | Docker 管理 (`/var/lib/docker/volumes/`) | 宿主机任意路径 | 内存 |
| 数据持久化 | 是 | 是 | 否（容器停止即丢失） |
| 容器间共享 | 是 | 是 | 否 |
| Docker CLI 管理 | 是 (`docker volume`) | 否 | 否 |
| 可备份 | 方便 | 直接操作宿主机文件 | 不适用 |
| 性能 | 高 | 高（macOS 除外） | 最高 |
| 安全性 | 中 | 低（宿主机路径暴露） | 高 |
| 推荐场景 | 生产数据持久化 | 开发代码同步 | 敏感临时数据 |

## Named Volume（命名卷）

Docker 完全管理的存储，推荐用于所有持久化数据。

### 基本用法

```bash
# 创建卷
docker volume create my-data

# 挂载到容器
docker run -d --name db \
  -v my-data:/var/lib/postgresql/data \
  postgres:16

# 等效的 --mount 语法（更清晰，推荐）
docker run -d --name db \
  --mount source=my-data,target=/var/lib/postgresql/data \
  postgres:16
```

### Compose 中使用

```yaml
services:
  db:
    image: postgres:16
    volumes:
      - db-data:/var/lib/postgresql/data

  redis:
    image: redis:7
    volumes:
      - redis-data:/data

# 顶层声明命名卷
volumes:
  db-data:                    # 默认 local driver
  redis-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /data/redis     # 指定宿主机路径（类似 bind mount 但由 Docker 管理）
```

### 卷管理命令

```bash
# 列出所有卷
docker volume ls

# 查看卷详情
docker volume inspect my-data

# 删除卷（需先停止使用它的容器）
docker volume rm my-data

# 清理所有未被容器使用的卷（危险）
docker volume prune

# 仅清理匿名卷
docker volume prune --filter "label!=keep"
```

## Bind Mount（绑定挂载）

将宿主机目录直接挂载到容器，适合开发环境。

### 基本用法

```bash
# -v 语法
docker run -d --name dev \
  -v $(pwd)/src:/app/src \
  -v $(pwd)/config.yaml:/app/config.yaml:ro \
  myapp

# --mount 语法（推荐，路径不存在时报错而非自动创建）
docker run -d --name dev \
  --mount type=bind,source=$(pwd)/src,target=/app/src \
  --mount type=bind,source=$(pwd)/config.yaml,target=/app/config.yaml,readonly \
  myapp
```

### Compose 中使用

```yaml
services:
  app:
    build: .
    volumes:
      # 代码同步（开发用）
      - ./src:/app/src
      # 配置文件只读挂载
      - ./config:/app/config:ro
      # 排除 node_modules（使用匿名卷避免被宿主机覆盖）
      - /app/node_modules
```

### 只读挂载

```bash
# 命令行
docker run -v /host/config:/app/config:ro myapp

# Compose
volumes:
  - ./config:/app/config:ro
```

`:ro` 确保容器无法修改宿主机文件，适合配置文件、证书等。

## tmpfs Mount（临时文件系统）

数据存储在内存中，容器停止即丢失，不写入宿主机磁盘。

### 基本用法

```bash
docker run -d --name secure-app \
  --tmpfs /app/tmp:size=100m,noexec,nosuid \
  myapp

# --mount 语法
docker run -d --name secure-app \
  --mount type=tmpfs,target=/app/tmp,tmpfs-size=104857600 \
  myapp
```

### Compose 中使用

```yaml
services:
  app:
    volumes:
      - type: tmpfs
        target: /app/tmp
        tmpfs:
          size: 104857600     # 100MB，单位字节
          mode: 1777          # 权限

  # 简写形式（不支持设置 size）
  worker:
    tmpfs:
      - /app/tmp
      - /app/cache
```

适用场景：
- 会话数据、临时 token
- 编译中间产物
- 不应落盘的敏感数据（密钥处理中间态）

## 数据备份与恢复

### 方法一：使用临时容器备份

```bash
# 备份：创建临时容器挂载目标卷 + 宿主机目录，执行 tar
docker run --rm \
  -v db-data:/source:ro \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/db-backup-$(date +%Y%m%d).tar.gz -C /source .

# 恢复：反向操作
docker run --rm \
  -v db-data:/target \
  -v $(pwd)/backups:/backup:ro \
  alpine sh -c "cd /target && tar xzf /backup/db-backup-20240101.tar.gz"
```

### 方法二：docker cp

```bash
# 从容器复制文件
docker cp db:/var/lib/postgresql/data ./backup/

# 复制文件到容器
docker cp ./backup/data db:/var/lib/postgresql/
```

### 方法三：应用层备份（推荐用于数据库）

```bash
# PostgreSQL
docker exec db pg_dump -U user mydb > backup.sql
docker exec -i db psql -U user mydb < backup.sql

# MySQL
docker exec db mysqldump -u root -p mydb > backup.sql
docker exec -i db mysql -u root -p mydb < backup.sql

# MongoDB
docker exec db mongodump --out /backup
docker cp db:/backup ./mongo-backup/
```

### 自动化备份脚本

```bash
#!/bin/bash
# backup.sh — 定时备份 Docker 卷
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# PostgreSQL 逻辑备份
docker exec postgres pg_dumpall -U postgres | \
  gzip > "${BACKUP_DIR}/pg_${DATE}.sql.gz"

# 保留最近 7 天
find "${BACKUP_DIR}" -name "pg_*.sql.gz" -mtime +7 -delete

echo "Backup completed: pg_${DATE}.sql.gz"
```

配合 cron：
```bash
0 2 * * * /path/to/backup.sh >> /var/log/docker-backup.log 2>&1
```

## Volume Driver

### local driver（默认）

```yaml
volumes:
  nfs-data:
    driver: local
    driver_opts:
      type: nfs
      o: addr=192.168.1.100,rw,nfsvers=4
      device: ":/exported/path"

  cifs-data:
    driver: local
    driver_opts:
      type: cifs
      o: addr=192.168.1.100,username=user,password=pass
      device: "//192.168.1.100/share"
```

### 第三方 driver 示例

```bash
# 安装 volume plugin
docker plugin install rexray/s3fs

# 创建 S3 支持的卷
docker volume create -d rexray/s3fs my-s3-vol
```

## 权限管理

### 常见权限问题

容器内进程的 UID/GID 可能与宿主机不同，导致 bind mount 权限不匹配。

```dockerfile
# Dockerfile 中创建匹配宿主机 UID 的用户
ARG UID=1000
ARG GID=1000
RUN groupadd -g ${GID} appuser && \
    useradd -u ${UID} -g ${GID} -m appuser
USER appuser
```

```bash
# 构建时传入当前用户 ID
docker build --build-arg UID=$(id -u) --build-arg GID=$(id -g) -t myapp .
```

### Named Volume 初始化

当 named volume 首次挂载到容器时，如果容器镜像中目标路径已有文件，Docker 会将这些文件复制到新卷中。这是 named volume 独有的行为，bind mount 不会发生。

```dockerfile
# 镜像中预置数据
COPY default-config/ /app/config/
VOLUME /app/config
```

首次启动时 `/app/config/` 的内容会被复制到 named volume。

## 完整示例：开发 + 生产配置

```yaml
# compose.yaml — 基础配置
services:
  app:
    image: myapp:latest
    volumes:
      - app-uploads:/app/uploads     # 用户上传文件持久化

  db:
    image: postgres:16
    volumes:
      - db-data:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}

volumes:
  app-uploads:
  db-data:

---
# compose.override.yaml — 开发覆盖
services:
  app:
    build: .
    volumes:
      - .:/app                       # 代码热重载
      - /app/node_modules            # 排除依赖目录
      - type: tmpfs
        target: /app/tmp             # 临时文件不落盘

  db:
    ports:
      - "127.0.0.1:5432:5432"       # 本地可直接连接
```

## 常见陷阱

- **匿名卷累积**：`docker run -v /data` 创建匿名卷，容器删除后卷残留；用 `docker volume prune` 清理，但要确认无重要数据
- **bind mount 覆盖镜像内容**：bind mount 会完全遮盖容器内目标目录的原有内容；例如 `-v ./src:/app` 会覆盖镜像中 `/app` 的所有文件（包括 `node_modules`）
- **macOS bind mount 性能**：Docker Desktop for Mac 的 bind mount 通过 virtiofs 虚拟文件系统，大量小文件时 IO 性能显著下降；可用 `volumes` 替代频繁读取的目录，或在 `node_modules` 等目录使用匿名卷
- **`docker compose down -v` 意外删除数据**：`-v` 标志删除所有声明的 named volumes；误操作无法恢复，定期备份是必须的
- **volume 内数据不随镜像更新**：镜像更新后已有 volume 中的数据不会被覆盖；如需更新配置文件需手动操作或使用 init 脚本
- **root 权限问题**：容器内以 root 写入 bind mount 的文件在宿主机也是 root 所有，普通用户无法编辑
- **NFS volume 超时**：网络不稳定时 NFS volume 会导致容器挂起；设置合理的超时和重试参数
- **VOLUME 指令的副作用**：Dockerfile 中 `VOLUME` 指令之后对该路径的 `RUN` 修改不会被保存（因为该路径已是挂载点）

## 组合提示

- 搭配 **docker-compose** 在 compose.yaml 中声明卷和挂载
- 搭配 **docker-core** 理解 Dockerfile 中 VOLUME 指令的行为
- 搭配 **docker-networking** 配合服务发现实现有状态服务的高可用

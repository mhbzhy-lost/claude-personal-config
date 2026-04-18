---
name: docker-compose
description: "Docker Compose V2 服务编排：compose.yaml 语法、多环境配置与常用命令"
tech_stack: [docker, backend]
capability: [container, orchestration]
---

# Docker Compose（服务编排）

> 来源：https://docs.docker.com/compose/compose-file/ / https://docs.docker.com/compose/
> 版本基准：Docker Compose V2（`docker compose` 子命令，非独立 `docker-compose`）

## 用途

通过声明式 YAML 文件定义和运行多容器应用，管理服务间的网络、存储、依赖关系与启动顺序。

## 何时使用

- 本地开发环境搭建（应用 + 数据库 + 缓存一键启动）
- 集成测试环境编排
- 单机部署简单的多服务应用
- 需要统一管理环境变量、网络、卷等基础设施配置

## 基础结构

```yaml
# compose.yaml（推荐文件名，也支持 docker-compose.yml）
services:
  web:
    build: .
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/mydb
    volumes:
      - .:/app
    networks:
      - app-net

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - app-net

volumes:
  db-data:

networks:
  app-net:
```

## services 关键配置

### build — 构建配置

```yaml
services:
  app:
    # 简写
    build: ./backend

    # 完整形式
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
      args:
        PYTHON_VERSION: "3.12"
      target: production        # 多阶段构建目标
      cache_from:
        - myrepo/app:cache
```

### depends_on — 依赖与启动顺序

```yaml
services:
  app:
    depends_on:
      db:
        condition: service_healthy      # 等待 db 健康检查通过
      redis:
        condition: service_started      # 仅等待启动（默认）
      migration:
        condition: service_completed_successfully  # 等待完成
```

三种 condition：
- `service_started`：容器启动即满足（默认）
- `service_healthy`：需配合 healthcheck 使用
- `service_completed_successfully`：一次性任务（如数据库迁移）

### healthcheck — 健康检查

```yaml
services:
  db:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 10s       # 检查间隔
      timeout: 5s         # 单次超时
      retries: 5          # 连续失败几次判定 unhealthy
      start_period: 30s   # 启动宽限期，期间失败不计入 retries
      start_interval: 2s  # 启动期间检查间隔（更频繁）

  redis:
    image: redis:7
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  web:
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
```

### ports — 端口映射

```yaml
ports:
  - "8000:8000"            # HOST:CONTAINER
  - "127.0.0.1:8080:80"   # 仅绑定 localhost
  - "8443:443/udp"         # UDP 协议
  - target: 8000
    published: 8000
    protocol: tcp
```

### volumes — 挂载

```yaml
services:
  app:
    volumes:
      - .:/app                        # bind mount（开发用）
      - app-data:/app/data            # named volume
      - type: tmpfs                   # tmpfs（内存临时存储）
        target: /app/tmp
        tmpfs:
          size: 100m
```

### restart — 重启策略

```yaml
services:
  app:
    restart: unless-stopped  # 推荐：除非手动停止，否则总是重启
    # 其他选项：no | always | on-failure
```

## 环境变量管理

### 优先级（从高到低）

1. `docker compose run -e` 命令行
2. shell 环境变量
3. `environment` 字段
4. `env_file` 文件
5. Dockerfile 中的 `ENV`

### environment — 直接声明

```yaml
services:
  app:
    environment:
      # 键值对形式
      DATABASE_URL: postgresql://user:pass@db:5432/mydb
      DEBUG: "false"
      # 从宿主 shell 透传（不赋值则透传同名变量）
      - API_KEY
```

### env_file — 外部文件

```yaml
services:
  app:
    env_file:
      - .env                # 默认
      - .env.local          # 覆盖前面的同名变量
      - path: .env.prod
        required: false     # 文件不存在不报错
```

`.env` 文件格式：
```bash
# 注释
DATABASE_URL=postgresql://user:pass@db:5432/mydb
SECRET_KEY=your-secret-key
# 支持引号
APP_NAME="My Application"
```

### compose.yaml 中的变量插值

```yaml
services:
  db:
    image: postgres:${POSTGRES_VERSION:-16}  # 默认值
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD:?必须设置数据库密码}  # 未设置则报错
```

- `${VAR:-default}`：未设置或为空时使用默认值
- `${VAR:?error}`：未设置或为空时报错退出

## 多环境配置

### 方式一：profiles（推荐）

```yaml
services:
  web:
    build: .
    ports:
      - "8000:8000"
    # 无 profiles = 始终启动

  db:
    image: postgres:16
    # 无 profiles = 始终启动

  adminer:
    image: adminer
    ports:
      - "8080:8080"
    profiles:
      - debug              # 仅 debug profile 时启动

  prometheus:
    image: prom/prometheus
    profiles:
      - monitoring         # 仅 monitoring profile 时启动
```

```bash
# 启动默认服务
docker compose up

# 启动默认 + debug 服务
docker compose --profile debug up

# 启动多个 profile
docker compose --profile debug --profile monitoring up

# 环境变量方式
COMPOSE_PROFILES=debug,monitoring docker compose up
```

### 方式二：override 文件

```yaml
# compose.yaml — 基础配置
services:
  web:
    image: myapp:latest
    environment:
      APP_ENV: production

# compose.override.yaml — 自动合并，开发覆盖
services:
  web:
    build: .
    volumes:
      - .:/app
    environment:
      APP_ENV: development
      DEBUG: "true"
```

```bash
# 自动合并 compose.yaml + compose.override.yaml
docker compose up

# 指定生产配置
docker compose -f compose.yaml -f compose.prod.yaml up
```

### 合并规则

- 单值字段（image/command）：后者覆盖前者
- 列表字段（environment/volumes/ports）：合并，后者同名键覆盖前者

## networks — 网络配置

```yaml
services:
  frontend:
    networks:
      - frontend-net

  backend:
    networks:
      - frontend-net
      - backend-net

  db:
    networks:
      - backend-net

networks:
  frontend-net:
  backend-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

- 同一网络内的服务可通过服务名互相访问（DNS 自动解析）
- 不同网络的服务隔离，无法直接通信

## 常用命令

```bash
# 启动（前台）
docker compose up

# 启动（后台）
docker compose up -d

# 启动并重新构建
docker compose up -d --build

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f web          # 跟踪单个服务
docker compose logs --tail=100      # 最后 100 行

# 停止并删除容器/网络
docker compose down

# 停止并删除卷（危险：会删除数据）
docker compose down -v

# 进入容器
docker compose exec web bash

# 运行一次性命令
docker compose run --rm web python manage.py migrate

# 重启单个服务
docker compose restart web

# 查看配置（合并后的最终结果）
docker compose config

# 拉取最新镜像
docker compose pull

# 扩缩容
docker compose up -d --scale worker=3
```

## 完整生产示例

```yaml
services:
  web:
    build:
      context: .
      target: production
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/app
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M

  worker:
    build:
      context: .
      target: production
    command: celery -A tasks worker --loglevel=info
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/app
      - REDIS_URL=redis://redis:6379/0
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
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d app"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 3
    restart: unless-stopped

volumes:
  db-data:
  redis-data:
```

## 常见陷阱

- **depends_on 不等于 ready**：默认 `depends_on` 仅控制启动顺序，不等待服务就绪；必须配合 `condition: service_healthy` + `healthcheck`
- **`docker-compose` vs `docker compose`**：V1 是独立 Python 工具（已弃用），V2 是 Docker CLI 插件；始终使用 `docker compose`（空格）
- **`.env` 文件的作用域**：项目根目录的 `.env` 仅用于 compose.yaml 中的变量插值 `${VAR}`，不会自动注入到容器；需要 `env_file` 显式引入
- **`down -v` 删除数据卷**：`docker compose down -v` 会删除 named volumes 中的持久数据，生产环境慎用
- **端口冲突**：多个项目同时运行时，宿主机端口冲突导致启动失败；用 `127.0.0.1:PORT:PORT` 并错开端口
- **build cache 问题**：修改 Dockerfile 后 `docker compose up -d` 不会自动重新构建，需要加 `--build`
- **override 文件自动合并**：`compose.override.yaml` 存在时会自动合并，可能在生产环境引入开发配置
- **volumes 匿名挂载泄漏**：不命名的 volume 每次 `up` 都创建新卷，`docker volume ls` 中积累大量 dangling volumes

## 组合提示

- 搭配 **docker-core** 编写服务的 Dockerfile
- 搭配 **docker-networking** 理解 Compose 创建的网络拓扑
- 搭配 **docker-volumes** 管理数据持久化策略
- 搭配 **docker-python** 获取 Python 服务的完整配置模板

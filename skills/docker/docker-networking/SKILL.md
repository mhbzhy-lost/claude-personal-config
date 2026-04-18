---
name: docker-networking
description: "Docker 网络模式、自定义网络、DNS 服务发现与容器间通信"
tech_stack: [docker, backend]
capability: [container, orchestration]
---

# Docker Networking（容器网络）

> 来源：https://docs.docker.com/engine/network/ / https://docs.docker.com/engine/network/drivers/bridge/
> 版本基准：Docker 27+、Compose V2

## 用途

管理容器间通信、服务发现与外部访问，选择合适的网络驱动以满足不同场景的隔离、性能和安全需求。

## 何时使用

- 容器之间需要通过服务名互相访问
- 需要隔离不同服务组的网络通信
- 应用需要暴露端口供外部访问
- 跨主机容器通信（Swarm / overlay 网络）
- 需要优化网络性能（host 模式）

## 网络驱动总览

| 驱动 | 隔离性 | DNS 发现 | 跨主机 | 典型场景 |
|------|--------|----------|--------|----------|
| bridge | 容器级隔离 | 自定义网络支持 | 否 | 单机多容器通信（默认） |
| host | 无隔离 | 不适用 | 否 | 高性能网络、避免 NAT |
| none | 完全隔离 | 否 | 否 | 安全敏感、自定义网络栈 |
| overlay | 容器级隔离 | 支持 | 是 | Swarm 多节点集群 |
| macvlan | 容器级隔离 | 否 | 否 | 容器需要独立 MAC/IP |

## bridge 网络（最常用）

### 默认 bridge vs 自定义 bridge

```bash
# 默认 bridge — 不推荐用于生产
docker run -d --name web nginx
docker run -d --name api node
# 容器间只能通过 IP 访问，无 DNS 解析

# 自定义 bridge — 推荐
docker network create app-net
docker run -d --name web --network app-net nginx
docker run -d --name api --network app-net node
# 容器间可通过名称访问：ping api, curl http://web
```

**关键区别**：

| 特性 | 默认 bridge | 自定义 bridge |
|------|------------|---------------|
| DNS 解析 | 不支持（只能用 IP 或 `--link`） | 支持（容器名自动解析） |
| 隔离性 | 所有容器共享 | 仅同网络容器互通 |
| 运行时连接/断开 | 需停止容器 | 可动态操作 |
| 环境变量共享 | `--link` 可共享 | 不支持（更安全） |

### 创建自定义网络

```bash
# 基础创建
docker network create my-network

# 指定子网和网关
docker network create \
  --driver bridge \
  --subnet 172.20.0.0/16 \
  --gateway 172.20.0.1 \
  my-network

# 指定 IP 范围
docker network create \
  --subnet 172.20.0.0/16 \
  --ip-range 172.20.240.0/20 \
  my-network
```

### 容器连接到多个网络

```bash
# 创建时指定网络
docker run -d --name api --network frontend-net myapi

# 运行时追加网络
docker network connect backend-net api

# 断开网络
docker network disconnect frontend-net api
```

一个容器可以同时连接多个网络，在每个网络中拥有不同的 IP 和 DNS 名称。

## host 网络

容器直接使用宿主机网络栈，无网络隔离，无 NAT 开销。

```bash
docker run -d --network host nginx
# nginx 直接监听宿主机 80 端口，无需 -p 映射
```

适用场景：
- 高性能网络应用（避免 bridge NAT 开销）
- 容器需要访问宿主机上所有网络接口
- 网络监控/调试工具

限制：
- Linux 专属，macOS/Windows 上 Docker Desktop 不支持（因为 Docker 运行在 VM 中）
- 端口冲突需自行管理
- 无网络隔离，安全性较低

## none 网络

完全禁用网络，容器只有 loopback 接口。

```bash
docker run -d --network none my-secure-app
```

适用场景：
- 离线数据处理
- 安全敏感的计算任务
- 需要自定义网络栈的容器

## overlay 网络

跨主机容器通信，用于 Docker Swarm 集群。

```bash
# 初始化 Swarm
docker swarm init

# 创建 overlay 网络
docker network create -d overlay my-overlay

# 部署服务到 overlay 网络
docker service create --name web --network my-overlay --replicas 3 nginx
```

- 基于 VXLAN 隧道技术
- 内置加密支持：`docker network create -d overlay --opt encrypted my-overlay`
- 自动负载均衡与服务发现

## DNS 服务发现

Docker 内嵌 DNS 服务器（`127.0.0.11`），为自定义网络中的容器提供名称解析。

### 解析规则

```bash
# 容器名解析
# 在 app-net 网络中，容器 "db" 可通过以下方式访问
ping db              # 直接容器名
ping db.app-net      # 容器名.网络名
```

### Compose 中的服务发现

```yaml
services:
  web:
    image: nginx
    networks:
      - frontend

  api:
    image: myapi
    networks:
      - frontend
      - backend
    # 可直接访问 http://db:5432

  db:
    image: postgres:16
    networks:
      - backend
    # web 无法直接访问 db（不在同一网络）
    # api 可以访问 db（共享 backend 网络）

networks:
  frontend:
  backend:
```

Compose 中服务名即 DNS 名，同一网络的服务可直接通过服务名通信。

### DNS 轮询（多实例负载均衡）

```bash
# 扩展服务实例
docker compose up -d --scale api=3

# DNS 查询返回多个 IP，客户端轮询访问
nslookup api
# api -> 172.20.0.2, 172.20.0.3, 172.20.0.4
```

## 端口映射

### 映射语法

```bash
# 命令行
docker run -p 8080:80 nginx                    # HOST:CONTAINER
docker run -p 127.0.0.1:8080:80 nginx          # 仅本机访问
docker run -p 8080:80/udp nginx                 # UDP
docker run -p 8080-8090:80-90 nginx             # 端口范围

# 随机端口
docker run -p 80 nginx                          # 宿主机随机端口 -> 容器 80
docker port <container>                         # 查看映射结果
```

### Compose 中的端口映射

```yaml
services:
  web:
    ports:
      # 短格式
      - "8080:80"
      - "127.0.0.1:443:443"

      # 长格式（推荐）
      - target: 80
        published: 8080
        protocol: tcp
        mode: host          # host 或 ingress（Swarm）
```

### EXPOSE vs ports

- `EXPOSE`（Dockerfile）：文档性声明，不实际映射端口
- `ports`（Compose/run -p）：实际创建端口映射

## 网络隔离实战

### 前后端分离架构

```yaml
services:
  nginx:
    image: nginx
    ports:
      - "80:80"
    networks:
      - frontend          # 仅前端网络

  api:
    build: ./api
    networks:
      - frontend          # 接收 nginx 转发
      - backend           # 访问数据库

  db:
    image: postgres:16
    networks:
      - backend           # 仅后端网络
    # nginx 无法直接访问 db — 网络隔离

  redis:
    image: redis:7
    networks:
      - backend

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true        # 禁止外部访问，仅容器间通信
```

`internal: true` 创建仅容器间可达的内部网络，无法访问外网，适合数据库等敏感服务。

## 网络调试命令

```bash
# 列出所有网络
docker network ls

# 查看网络详情（子网、网关、连接的容器）
docker network inspect app-net

# 查看容器网络配置
docker inspect --format='{{json .NetworkSettings.Networks}}' <container>

# 容器内部网络调试
docker exec -it <container> sh -c "apt-get update && apt-get install -y iputils-ping curl dnsutils"
docker exec -it <container> ping api
docker exec -it <container> nslookup db

# 清理未使用网络
docker network prune
```

## 常见陷阱

- **使用默认 bridge 网络**：不支持 DNS 解析，容器重启后 IP 变化导致连接断开；始终使用自定义网络
- **host 网络在 macOS/Windows 无效**：Docker Desktop 在 VM 中运行，host 模式连接的是 VM 的网络栈而非宿主机
- **端口映射绑定 0.0.0.0**：默认 `-p 8080:80` 绑定所有接口，包括公网 IP；开发环境用 `127.0.0.1:8080:80`
- **Docker 修改 iptables**：Docker 端口映射会绕过 UFW/firewalld 规则，直接暴露端口到公网；需要在 Docker daemon 配置 `"iptables": false` 或使用 `127.0.0.1` 绑定
- **容器 DNS 失效**：宿主机 DNS 配置异常会传递到容器；可在 daemon.json 中指定 `"dns": ["8.8.8.8"]`
- **网络命名空间残留**：`docker compose down` 会清理网络，但手动创建的网络需手动删除或 `docker network prune`
- **overlay 网络要求 Swarm**：standalone 容器使用 overlay 需要 `--attachable` 标志

## 组合提示

- 搭配 **docker-compose** 在 compose.yaml 中声明网络拓扑
- 搭配 **docker-volumes** 理解 volume 与 network 的服务发现配合
- 搭配 **docker-core** 了解 EXPOSE 指令的作用

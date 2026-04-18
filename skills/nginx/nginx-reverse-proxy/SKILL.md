---
name: nginx-reverse-proxy
description: "Nginx 反向代理与负载均衡：proxy_pass、upstream、负载算法、WebSocket 代理与缓冲超时配置"
tech_stack: [nginx, backend]
capability: [reverse-proxy]
---

# Nginx 反向代理与负载均衡

> 来源：https://nginx.org/en/docs/http/ngx_http_proxy_module.html / https://nginx.org/en/docs/http/load_balancing.html
> 版本基准：Nginx 1.26+（mainline）

## 用途

将 Nginx 配置为反向代理，将客户端请求转发到后端应用服务器，同时提供负载均衡、故障转移、请求头透传和 WebSocket 代理能力。

## 何时使用

- 前端 Nginx 代理后端 Node.js / Python / Java 等应用
- 多实例部署需要负载均衡
- 需要在代理层做 SSL 终止、缓冲、限流
- 应用需要 WebSocket 长连接支持
- 需要向后端透传客户端真实 IP

## 基础反向代理配置

### 最小配置

```nginx
server {
    listen 80;
    server_name app.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### proxy_pass 路径拼接规则

```nginx
# 情况 1：proxy_pass 不带 URI 后缀 -> 原始 URI 完整转发
location /api/ {
    proxy_pass http://backend;
    # 请求 /api/users -> 后端收到 /api/users
}

# 情况 2：proxy_pass 带 URI 后缀 -> location 匹配部分被替换
location /api/ {
    proxy_pass http://backend/v2/;
    # 请求 /api/users -> 后端收到 /v2/users
}

# 情况 3：精确匹配 + 带 URI
location = /api {
    proxy_pass http://backend/gateway;
    # 请求 /api -> 后端收到 /gateway
}
```

**核心规则**：proxy_pass 末尾有无 `/` 影响路径拼接。带 URI（即使只是 `/`）会触发路径替换，不带则完整转发。

## proxy_set_header 详解

```nginx
location / {
    proxy_pass http://backend;

    # 必须设置的头（Nginx 默认不转发这些）
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 可选：转发原始 Host 头（包含端口）
    # proxy_set_header Host $http_host;
}
```

| 头字段 | 值 | 用途 |
|--------|-----|------|
| `Host` | `$host` | 后端识别请求的目标域名 |
| `X-Real-IP` | `$remote_addr` | 客户端真实 IP（单层代理） |
| `X-Forwarded-For` | `$proxy_add_x_forwarded_for` | 客户端 IP 链（多层代理追加） |
| `X-Forwarded-Proto` | `$scheme` | 原始协议（http/https），后端据此判断是否安全连接 |

## upstream 后端池

### 基本配置

```nginx
http {
    upstream backend {
        server 10.0.0.1:8080;
        server 10.0.0.2:8080;
        server 10.0.0.3:8080;
    }

    server {
        listen 80;
        location / {
            proxy_pass http://backend;
        }
    }
}
```

### 服务器参数

```nginx
upstream backend {
    server 10.0.0.1:8080 weight=5;              # 权重（默认 1）
    server 10.0.0.2:8080 max_fails=3 fail_timeout=30s;  # 健康检查阈值
    server 10.0.0.3:8080 backup;                # 备份节点（仅当主节点全挂时启用）
    server 10.0.0.4:8080 down;                  # 标记为下线，不接受流量
    server 10.0.0.5:8080 max_conns=100;         # 最大并发连接数
}
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `weight` | 1 | 轮询权重，越大分配越多请求 |
| `max_fails` | 1 | 在 fail_timeout 内允许的失败次数 |
| `fail_timeout` | 10s | 失败计数窗口 + 被标记不可用的时长 |
| `backup` | - | 备用服务器 |
| `down` | - | 永久离线 |
| `max_conns` | 0(不限) | 到该后端的最大并发连接 |

## 负载均衡算法

### Round Robin（默认）

```nginx
upstream backend {
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
}
# 按权重轮询分配，无需额外指令
```

### Least Connections

```nginx
upstream backend {
    least_conn;
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
}
# 优先将请求发给当前活跃连接最少的后端
# 适合：请求处理时间差异较大的场景
```

### IP Hash

```nginx
upstream backend {
    ip_hash;
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
}
# 同一客户端 IP 始终路由到同一后端
# 适合：需要简单会话保持的场景
# 注意：客户端在 NAT 后会导致分布不均
```

### Generic Hash

```nginx
upstream backend {
    hash $request_uri consistent;
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
}
# 基于指定变量做哈希，consistent 参数启用 ketama 一致性哈希
# 适合：基于 URI 的缓存分片
```

### Random

```nginx
upstream backend {
    random two least_conn;
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
    server 10.0.0.3:8080;
}
# 随机选两个，再从中选连接数少的（Power of Two Choices）
# 适合：分布式环境中无法共享状态的场景
```

## 健康检查（被动）

Nginx 开源版使用被动健康检查：通过实际请求的响应来判断后端状态。

```nginx
upstream backend {
    server 10.0.0.1:8080 max_fails=3 fail_timeout=30s;
    server 10.0.0.2:8080 max_fails=3 fail_timeout=30s;
}
```

**工作机制**：在 30 秒内连续失败 3 次，该后端被标记为不可用 30 秒。30 秒后 Nginx 重新尝试向其发送请求。

可通过 `proxy_next_upstream` 定义哪些错误触发故障转移：

```nginx
location / {
    proxy_pass http://backend;
    proxy_next_upstream error timeout http_502 http_503 http_504;
    proxy_next_upstream_tries 3;      # 最多重试 3 个后端
    proxy_next_upstream_timeout 10s;  # 重试总超时
}
```

## WebSocket 代理

```nginx
# 关键：使用 map 动态设置 Connection 头
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name ws.example.com;

    location /ws/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        # WebSocket 必须的两个头
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # 标准头
        proxy_set_header Host       $host;
        proxy_set_header X-Real-IP  $remote_addr;

        # 长连接超时（默认 60s，WebSocket 需要加大）
        proxy_read_timeout  3600s;
        proxy_send_timeout  3600s;
    }
}
```

**关键点**：WebSocket 依赖 HTTP/1.1 的 Upgrade 机制，必须设置 `proxy_http_version 1.1` 和转发 Upgrade/Connection 头。

## 缓冲与超时配置

### 超时参数

```nginx
location / {
    proxy_pass http://backend;

    proxy_connect_timeout 5s;    # 与后端建立连接的超时（默认 60s）
    proxy_send_timeout    10s;   # 向后端发送请求体的超时（默认 60s）
    proxy_read_timeout    30s;   # 从后端读取响应的超时（默认 60s）
}
```

### 缓冲配置

```nginx
location / {
    proxy_pass http://backend;

    proxy_buffering on;                # 默认开启
    proxy_buffer_size 4k;              # 响应头缓冲（第一部分）
    proxy_buffers 8 8k;                # 响应体缓冲（数量 x 大小）
    proxy_busy_buffers_size 16k;       # 正在发送给客户端的缓冲上限
}

# 流式响应场景（SSE / 大文件下载）关闭缓冲
location /events/ {
    proxy_pass http://backend;
    proxy_buffering off;               # 关闭缓冲，实时转发
    proxy_cache off;
}
```

**缓冲工作原理**：Nginx 先从后端完整接收响应到缓冲区，再统一发送给客户端。好处是快速释放后端连接；坏处是增加内存占用和首字节延迟。

### upstream keepalive（连接复用）

```nginx
upstream backend {
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
    keepalive 32;              # 每个 worker 保持的空闲连接数
    keepalive_timeout 60s;     # 空闲连接超时
    keepalive_requests 1000;   # 单连接最大请求数
}

server {
    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;           # keepalive 需要 HTTP/1.1
        proxy_set_header Connection "";   # 清除 Connection: close
    }
}
```

## 完整生产配置示例

```nginx
upstream api_servers {
    least_conn;
    server 10.0.0.1:8080 weight=3 max_fails=3 fail_timeout=30s;
    server 10.0.0.2:8080 weight=2 max_fails=3 fail_timeout=30s;
    server 10.0.0.3:8080 backup;
    keepalive 32;
}

server {
    listen 80;
    server_name api.example.com;

    # 通用代理设置
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    # API 接口
    location /api/ {
        proxy_pass http://api_servers;
        proxy_connect_timeout 5s;
        proxy_read_timeout    30s;
        proxy_next_upstream error timeout http_502 http_503;
    }

    # WebSocket 端点
    location /ws/ {
        proxy_pass http://api_servers;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 3600s;
    }

    # 健康检查端点（不记日志）
    location = /health {
        proxy_pass http://api_servers;
        access_log off;
    }
}
```

## 常见陷阱

- **proxy_pass 尾部斜线**：`proxy_pass http://backend` 和 `proxy_pass http://backend/` 行为完全不同，前者保留原始 URI，后者触发路径替换。务必理解并测试
- **丢失客户端 IP**：不设置 `X-Real-IP` 和 `X-Forwarded-For`，后端只能看到 Nginx 的 IP
- **WebSocket 超时断连**：默认 `proxy_read_timeout` 是 60s，空闲 WebSocket 连接会被断开，必须加大到 3600s 或更高
- **upstream keepalive 未生效**：必须同时设置 `proxy_http_version 1.1` 和 `proxy_set_header Connection ""`，否则每次请求都会新建连接
- **proxy_set_header 继承覆盖**：在 location 中设置任何一个 `proxy_set_header`，该 location 将**不再继承**上级（server/http）的所有 proxy_set_header 指令，需要全部重新声明
- **DNS 缓存问题**：upstream 中使用域名时，Nginx 仅在启动/reload 时解析。动态域名需在 location 中用变量 + resolver 指令
- **fail_timeout 双重含义**：既是失败计数的时间窗口，也是标记不可用后的等待恢复时长，容易混淆

## 组合提示

- 搭配 **nginx-core**：理解 server/location 匹配机制是正确配置代理的基础
- 搭配 **nginx-ssl**：在反向代理层做 SSL 终止，后端走 HTTP 明文
- 搭配 **nginx-performance**：为代理响应启用 proxy_cache 缓存和 gzip 压缩

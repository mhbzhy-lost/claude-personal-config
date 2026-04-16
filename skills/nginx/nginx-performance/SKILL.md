---
name: nginx-performance
description: "Nginx 性能优化：Gzip/Brotli 压缩、proxy_cache 缓存、worker 调优、keepalive 与限流配置"
tech_stack: [nginx]
---

# Nginx 性能优化

> 来源：https://nginx.org/en/docs/http/ngx_http_gzip_module.html / https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cache_path
> 版本基准：Nginx 1.26+（mainline）

## 用途

通过压缩、缓存、连接调优和限流等手段优化 Nginx 的吞吐量、响应速度和资源利用率，使其在高并发场景下稳定运行。

## 何时使用

- 需要减少带宽消耗和提升页面加载速度（压缩）
- 后端响应可被缓存以减少计算开销（proxy_cache）
- 高并发场景下需要调优 worker 进程和连接参数
- 需要防止恶意请求或突发流量压垮后端（限流）
- 保持与后端的长连接减少 TCP 握手开销（keepalive）

## Gzip 压缩

### 完整配置

```nginx
http {
    gzip on;
    gzip_vary on;                    # 添加 Vary: Accept-Encoding 头
    gzip_proxied any;               # 对代理请求也启用压缩
    gzip_comp_level 6;              # 压缩级别 1-9（6 为性价比最优）
    gzip_min_length 256;            # 小于 256 字节不压缩（压缩收益低）
    gzip_buffers 16 8k;             # 压缩缓冲区
    gzip_http_version 1.1;          # 对 HTTP/1.1+ 启用

    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/xml+rss
        application/atom+xml
        application/vnd.ms-fontobject
        font/opentype
        font/ttf
        image/svg+xml
        image/x-icon;
    # 注意：text/html 默认启用，不需要列出，重复列出会报 warning
}
```

### 关键参数说明

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `gzip_comp_level` | 4-6 | 级别越高压缩率越好但 CPU 开销越大，6 是平衡点 |
| `gzip_min_length` | 256 | 基于 Content-Length 判断，过小的响应压缩后可能更大 |
| `gzip_proxied` | any | 对所有代理响应启用，或用 `expired no-cache no-store private auth` 细粒度控制 |
| `gzip_vary` | on | 必须开启，否则 CDN/代理可能缓存错误的压缩版本 |

## Brotli 压缩

Brotli 比 Gzip 压缩率高 15-25%，现代浏览器均已支持。需要安装 ngx_brotli 模块。

### 安装模块

```bash
# 方式 1：通过包管理器（如有发行版支持）
sudo apt install libnginx-mod-brotli    # Ubuntu/Debian（部分发行版）

# 方式 2：动态模块编译
git clone --depth=1 https://github.com/google/ngx_brotli.git
cd ngx_brotli && git submodule update --init
# 使用与当前 nginx 相同的 ./configure 参数 + --add-dynamic-module
```

### 配置

```nginx
# 加载动态模块（放在 nginx.conf 顶部，main 上下文）
load_module modules/ngx_http_brotli_filter_module.so;
load_module modules/ngx_http_brotli_static_module.so;

http {
    # Brotli 动态压缩
    brotli on;
    brotli_comp_level 6;          # 压缩级别 0-11（6 为推荐值）
    brotli_min_length 256;
    brotli_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/xml+rss
        application/atom+xml
        font/opentype
        font/ttf
        image/svg+xml
        image/x-icon;

    # Brotli 静态预压缩（优先提供 .br 预压缩文件）
    brotli_static on;

    # 同时保留 Gzip 作为回退
    gzip on;
    gzip_vary on;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
}
```

**Brotli + Gzip 共存策略**：浏览器 Accept-Encoding 同时包含 br 和 gzip 时，Nginx 优先返回 Brotli。不支持 Brotli 的客户端自动回退到 Gzip。

## proxy_cache 缓存

### 缓存配置

```nginx
http {
    # 定义缓存区域（放在 http 上下文）
    proxy_cache_path /var/cache/nginx/proxy
        levels=1:2                 # 两级目录结构（避免单目录文件过多）
        keys_zone=my_cache:10m     # 共享内存区域 10MB（约存 80000 个 key）
        max_size=10g               # 磁盘缓存上限
        inactive=60m               # 无访问 60 分钟后自动清理
        use_temp_path=off;         # 直接写入缓存目录，避免跨磁盘复制

    server {
        listen 80;
        server_name example.com;

        location / {
            proxy_pass http://backend;

            # 启用缓存
            proxy_cache my_cache;
            proxy_cache_valid 200 301 302 10m;   # 成功响应缓存 10 分钟
            proxy_cache_valid 404          1m;   # 404 缓存 1 分钟
            proxy_cache_use_stale error timeout updating
                                  http_500 http_502 http_503 http_504;
            proxy_cache_lock on;                 # 防止缓存穿透（缓存雷群）
            proxy_cache_lock_timeout 5s;

            # 缓存 key
            proxy_cache_key "$scheme$request_method$host$request_uri";

            # 添加调试头（查看缓存命中状态）
            add_header X-Cache-Status $upstream_cache_status always;
        }
    }
}
```

### proxy_cache_path 参数详解

| 参数 | 说明 |
|------|------|
| `levels=1:2` | 目录层级，1:2 表示第一层 1 字符、第二层 2 字符目录名 |
| `keys_zone=name:size` | 共享内存区名称和大小，1MB 约存 8000 个 key |
| `max_size` | 磁盘缓存总大小上限，超出后 LRU 淘汰 |
| `inactive` | 指定时间内未被访问的缓存条目被删除（不论是否过期） |
| `use_temp_path=off` | 推荐关闭，直接写入缓存路径 |

### $upstream_cache_status 值

| 状态 | 含义 |
|------|------|
| `HIT` | 从缓存返回 |
| `MISS` | 缓存未命中，从后端获取 |
| `EXPIRED` | 缓存已过期，从后端刷新 |
| `STALE` | 缓存过期但因后端不可用返回旧缓存 |
| `UPDATING` | 缓存正在后台更新，返回旧版本 |
| `BYPASS` | 由 proxy_cache_bypass 条件触发跳过缓存 |

### 按条件跳过缓存

```nginx
# 不缓存带 cookie 的请求和 POST 请求
proxy_cache_bypass $cookie_nocache $arg_nocache;
proxy_no_cache     $cookie_nocache $arg_nocache;

# 不缓存后端设置了 Set-Cookie 的响应
map $upstream_http_set_cookie $no_cache {
    ""      0;
    default 1;
}
proxy_no_cache $no_cache;
```

### Microcaching（微缓存）

适合高并发 API 场景，缓存 1 秒即可大幅降低后端压力：

```nginx
proxy_cache_path /var/cache/nginx/micro
    levels=1:2 keys_zone=micro:5m max_size=1g inactive=1m;

location /api/ {
    proxy_pass http://backend;
    proxy_cache micro;
    proxy_cache_valid 200 1s;       # 仅缓存 1 秒
    proxy_cache_lock on;
    proxy_cache_use_stale updating;
}
```

## worker 进程与连接调优

### worker_processes

```nginx
# 自动匹配 CPU 核心数（推荐）
worker_processes auto;

# 手动设置（需要精确控制时）
worker_processes 4;
```

### worker_connections

```nginx
events {
    worker_connections 4096;     # 每个 worker 的最大并发连接数
    multi_accept on;             # 一次接受所有待处理连接
    # use epoll;                 # Linux 自动选择，通常无需指定
}
```

**最大并发计算**：`worker_processes x worker_connections = 理论最大并发连接`。注意每个代理连接会占用两个连接（客户端 + 后端），实际并发约为一半。

### 系统级调优（配合）

```bash
# 查看当前文件描述符限制
ulimit -n

# /etc/security/limits.conf
nginx soft nofile 65535
nginx hard nofile 65535

# Nginx 配置中设置
worker_rlimit_nofile 65535;
```

### 推荐的 worker 配置

```nginx
worker_processes auto;
worker_rlimit_nofile 65535;
worker_cpu_affinity auto;       # 自动绑定 CPU 核心

events {
    worker_connections 4096;
    multi_accept on;
}
```

## keepalive 连接

### 客户端 keepalive

```nginx
http {
    keepalive_timeout 65;       # 空闲连接保持时间（秒）
    keepalive_requests 1000;    # 单连接最大请求数（默认 1000）
}
```

### upstream keepalive（与后端的连接复用）

```nginx
upstream backend {
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
    keepalive 32;               # 每个 worker 保持 32 个空闲连接
    keepalive_timeout 60s;
    keepalive_requests 1000;
}

server {
    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;           # 必须为 1.1
        proxy_set_header Connection "";   # 必须清除 Connection 头
    }
}
```

**关键**：不设置 `proxy_http_version 1.1` 和清除 Connection 头，upstream keepalive 不会生效。

## 限流

### limit_req（请求速率限制）

基于漏桶算法，限制单位时间内的请求数量。

```nginx
http {
    # 定义限流区域（http 上下文）
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    # $binary_remote_addr: 按客户端 IP 限流（IPv4 占 4 字节，IPv6 占 16 字节）
    # zone=api_limit:10m:  10MB 共享内存（约可追踪 160000 个 IPv4 地址）
    # rate=10r/s:          每秒 10 个请求（即每 100ms 一个请求）

    # 自定义限流返回状态码（默认 503）
    limit_req_status 429;

    server {
        # 对 API 接口限流
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;
            # burst=20:  允许突发 20 个请求的队列
            # nodelay:   突发请求立即处理，不排队等待
            proxy_pass http://backend;
        }

        # 对登录接口更严格限流
        location /api/login {
            limit_req zone=api_limit burst=5 nodelay;
            proxy_pass http://backend;
        }
    }
}
```

### burst 与 nodelay/delay 详解

| 配置 | 行为 |
|------|------|
| `burst=20` | 超速请求进入队列（最多 20 个），按 rate 速率逐个释放，队列满则拒绝 |
| `burst=20 nodelay` | 队列中的请求立即处理，不等待，但仍按 rate 速率释放队列槽位 |
| `burst=20 delay=8` | 前 8 个突发请求立即处理，第 9-20 个请求排队延迟处理 |

### limit_conn（并发连接数限制）

```nginx
http {
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
    limit_conn_status 429;

    server {
        # 每个 IP 最多 50 个并发连接
        limit_conn conn_limit 50;

        # 下载目录限速
        location /downloads/ {
            limit_conn conn_limit 5;       # 每个 IP 最多 5 个并发下载
            limit_rate 500k;               # 每个连接限速 500KB/s
            limit_rate_after 10m;          # 前 10MB 不限速
        }
    }
}
```

## 其他性能指令

### sendfile 与 tcp_nopush

```nginx
http {
    sendfile on;          # 使用内核 sendfile() 系统调用，避免用户空间拷贝
    tcp_nopush on;        # 配合 sendfile，在一个包中发送 HTTP 头和文件开头
    tcp_nodelay on;       # 小数据包立即发送（keepalive 连接中默认开启）
}
```

### open_file_cache

```nginx
http {
    open_file_cache max=10000 inactive=20s;  # 缓存文件描述符和元数据
    open_file_cache_valid 30s;               # 每 30 秒检查缓存有效性
    open_file_cache_min_uses 2;              # 至少被访问 2 次才缓存
    open_file_cache_errors on;               # 缓存文件不存在的结果
}
```

## 完整性能优化配置模板

```nginx
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    multi_accept on;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # --- 基础性能 ---
    sendfile    on;
    tcp_nopush  on;
    tcp_nodelay on;

    # --- 客户端连接 ---
    keepalive_timeout  65;
    keepalive_requests 1000;
    client_max_body_size 10m;

    # --- 文件缓存 ---
    open_file_cache max=10000 inactive=20s;
    open_file_cache_valid 30s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;

    # --- Gzip 压缩 ---
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types text/plain text/css text/xml text/javascript
               application/json application/javascript application/xml
               application/xml+rss image/svg+xml font/opentype font/ttf;

    # --- 代理缓存 ---
    proxy_cache_path /var/cache/nginx
        levels=1:2 keys_zone=default_cache:10m
        max_size=5g inactive=60m use_temp_path=off;

    # --- 限流 ---
    limit_req_zone $binary_remote_addr zone=general:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_conn_zone $binary_remote_addr zone=conn:10m;
    limit_req_status 429;
    limit_conn_status 429;

    # --- 日志 ---
    log_format main '$remote_addr - [$time_local] "$request" '
                    '$status $body_bytes_sent $request_time '
                    '"$http_user_agent" $upstream_cache_status';
    access_log /var/log/nginx/access.log main;

    include /etc/nginx/conf.d/*.conf;
}
```

## 常见陷阱

- **gzip_types 中重复 text/html**：text/html 默认启用，显式列出会触发 warning `duplicate MIME type "text/html"`
- **gzip_proxied 默认 off**：不设置 `gzip_proxied` 时，通过代理的响应不会被压缩，反向代理场景必须设为 `any` 或精细条件
- **proxy_cache_path 只能在 http 上下文**：不能放在 server 或 location 中，否则报配置错误
- **缓存穿透（Cache Stampede）**：高并发下缓存过期瞬间大量请求打到后端，必须启用 `proxy_cache_lock on`
- **worker_connections 计算误区**：反向代理场景中每个客户端连接占用 2 个连接（到客户端 + 到后端），实际最大并发约为 worker_connections / 2
- **limit_req 没有 burst**：不设 burst 时请求严格按 rate 速率通过，超出立即拒绝，容易误杀正常突发流量
- **Brotli 与 CDN**：部分 CDN 不支持转发 Brotli 压缩内容，需确认 CDN 配置或在 CDN 后端仅使用 Gzip
- **limit_rate 影响范围**：`limit_rate` 是针对单个连接的限速，不是针对单个 IP，需配合 `limit_conn` 使用
- **proxy_cache_use_stale 未配置**：不设置时后端故障会直接返回错误给客户端，配置 `error timeout http_500 http_502 http_503 http_504` 可返回旧缓存兜底

## 组合提示

- 搭配 **nginx-core**：理解 http/server/location 层级结构，在正确的上下文放置性能指令
- 搭配 **nginx-reverse-proxy**：缓存和压缩主要用于反向代理场景，与 upstream/proxy_pass 配合使用
- 搭配 **nginx-ssl**：HTTP/2 + TLS + Brotli/Gzip 是现代 Web 性能的最佳组合

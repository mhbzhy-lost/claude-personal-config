---
name: nginx-ssl
description: "Nginx SSL/TLS 配置：证书部署、Let's Encrypt 集成、HTTPS 重定向、HSTS、OCSP Stapling 与 HTTP/2"
tech_stack: [nginx, backend]
capability: [reverse-proxy, encryption]
---

# Nginx SSL/TLS 配置

> 来源：https://nginx.org/en/docs/http/ngx_http_ssl_module.html / https://ssl-config.mozilla.org/
> 版本基准：Nginx 1.26+（mainline）

## 用途

为 Nginx 站点配置 HTTPS，包括证书部署、协议与密码套件选择、安全加固（HSTS/OCSP）以及 HTTP/2 启用，达到 SSL Labs A+ 评级。

## 何时使用

- 任何面向公网的 Web 服务（HTTPS 已成为基准要求）
- 需要部署 Let's Encrypt 免费证书并自动续期
- 要求 SSL Labs A+ 评级的安全合规场景
- 启用 HTTP/2 提升传输性能
- 配置 HSTS 防止协议降级攻击

## SSL 证书基础

### 证书文件说明

| 文件 | 说明 | Nginx 指令 |
|------|------|-----------|
| 证书链（fullchain） | 服务器证书 + 中间证书 | `ssl_certificate` |
| 私钥 | 与证书匹配的私钥 | `ssl_certificate_key` |
| 信任链（可选） | CA 根证书链（用于 OCSP） | `ssl_trusted_certificate` |

### 最小 HTTPS 配置

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate     /etc/ssl/certs/example.com.fullchain.pem;
    ssl_certificate_key /etc/ssl/private/example.com.key;

    root /var/www/example.com;
    index index.html;
}
```

## Let's Encrypt + Certbot 集成

### 安装 Certbot

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install -y certbot python3-certbot-nginx

# RHEL/CentOS
sudo dnf install -y certbot python3-certbot-nginx
```

### 获取证书

```bash
# 方式 1：Certbot 自动修改 Nginx 配置（推荐新手）
sudo certbot --nginx -d example.com -d www.example.com

# 方式 2：仅获取证书，手动配置 Nginx（推荐生产）
sudo certbot certonly --webroot -w /var/www/example.com -d example.com -d www.example.com

# 方式 3：独立模式（Nginx 尚未运行时）
sudo certbot certonly --standalone -d example.com
```

### 证书文件位置

```
/etc/letsencrypt/live/example.com/
├── fullchain.pem   # ssl_certificate（证书 + 中间证书）
├── privkey.pem     # ssl_certificate_key
├── chain.pem       # 中间证书（OCSP stapling 用）
└── cert.pem        # 仅服务器证书
```

### 自动续期

```bash
# 验证续期流程（不实际续期）
sudo certbot renew --dry-run

# 自动续期已由 certbot 安装时配置：
# - systemd timer: /etc/systemd/system/certbot.timer
# - 或 cron: /etc/cron.d/certbot
# 默认每天检查两次，到期前 30 天自动续期

# 续期后自动 reload Nginx（添加 deploy hook）
sudo certbot renew --deploy-hook "systemctl reload nginx"
```

### ACME 验证路径配置

使用 webroot 方式时，Nginx 需要放行 ACME 验证路径：

```nginx
server {
    listen 80;
    server_name example.com;

    # Let's Encrypt ACME 验证
    location /.well-known/acme-challenge/ {
        root /var/www/example.com;
    }

    # 其余请求重定向到 HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}
```

## HTTP -> HTTPS 重定向

```nginx
# 推荐：独立 server 块做重定向
server {
    listen 80;
    server_name example.com www.example.com;

    # ACME 验证放行
    location /.well-known/acme-challenge/ {
        root /var/www/example.com;
    }

    # 301 永久重定向
    location / {
        return 301 https://$host$request_uri;
    }
}
```

**注意**：使用 `return 301` 而非 `rewrite`，性能更好且语义更清晰。

## 推荐 SSL/TLS 配置

### 中间兼容配置（Intermediate，推荐大多数场景）

基于 Mozilla SSL Configuration Generator，兼容 Android 4.4+、Firefox 27+、Chrome 31+、Safari 9+ 等。

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name example.com;

    # --- 证书 ---
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # --- 协议与密码套件 ---
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384:DHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;

    # --- DH 参数（提升 DHE 密钥交换安全性）---
    # 生成：openssl dhparam -out /etc/ssl/certs/dhparam.pem 2048
    ssl_dhparam /etc/ssl/certs/dhparam.pem;

    # --- 会话管理 ---
    ssl_session_cache   shared:SSL:10m;   # 10MB 共享缓存，约 40000 个会话
    ssl_session_timeout 1d;               # 会话有效期 1 天
    ssl_session_tickets off;              # 关闭 session tickets（前向保密考虑）

    # --- OCSP Stapling ---
    # 注意：Let's Encrypt 自 2025 年起已停止 OCSP 支持
    # 以下配置仅对商业 CA（DigiCert/Sectigo 等）生效
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # --- 安全头 ---
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    root /var/www/example.com;
    index index.html;
}
```

### 现代配置（Modern，仅 TLS 1.3）

适合对兼容性要求不高、追求极致安全的场景。

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # 仅 TLS 1.3 —— 内置安全密码套件，无需指定 ssl_ciphers
    ssl_protocols TLSv1.3;
    ssl_prefer_server_ciphers off;

    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    root /var/www/example.com;
}
```

## HSTS（HTTP Strict Transport Security）

```nginx
# 基本 HSTS（2 年有效期）
add_header Strict-Transport-Security "max-age=63072000" always;

# 包含子域名
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

# 申请加入浏览器预加载列表（不可逆，谨慎启用）
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

**HSTS 工作原理**：浏览器首次通过 HTTPS 访问后缓存该头，后续即使用户输入 http:// 也会在浏览器端自动转为 https://，无需服务端重定向。

**preload 注意事项**：
- 提交到 https://hstspreload.org 后，所有主流浏览器内置该域名的 HSTS 策略
- 移除 preload 需要较长时间（浏览器发版周期），务必在所有子域名都支持 HTTPS 后再启用

## OCSP Stapling

OCSP Stapling 允许服务器主动向客户端提供证书吊销状态，避免客户端单独查询 CA 的 OCSP 响应器（减少延迟、保护隐私）。

```nginx
ssl_stapling on;
ssl_stapling_verify on;

# 提供完整信任链用于验证
ssl_trusted_certificate /etc/ssl/certs/ca-chain.pem;

# 指定 DNS 解析器（用于查询 OCSP 响应器域名）
resolver 8.8.8.8 8.8.4.4 valid=300s;
resolver_timeout 5s;
```

**重要更新（2025）**：Let's Encrypt 已于 2025 年停止 OCSP 服务，其新签发的证书不再包含 OCSP URL。使用 Let's Encrypt 证书时 `ssl_stapling` 指令无效果。商业 CA（DigiCert、Sectigo、GlobalSign）仍然支持 OCSP。

## HTTP/2 启用

```nginx
server {
    listen 443 ssl;
    http2 on;     # Nginx 1.25.1+ 的新语法
    server_name example.com;
    # ...
}
```

**旧语法**（Nginx 1.25.0 及更早）：
```nginx
listen 443 ssl http2;  # 已废弃，但仍可用
```

**HTTP/2 优势**：
- 多路复用（单连接并行传输多个请求/响应）
- 头部压缩（HPACK）
- 服务端推送（已被多数浏览器废弃，不推荐使用）
- 必须搭配 TLS 使用（浏览器要求）

## 可复用的 SSL 配置片段

将通用 SSL 参数抽为独立文件，多个 server 块 include：

```nginx
# /etc/nginx/snippets/ssl-params.conf
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;

ssl_session_cache   shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;

add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

```nginx
# 在 server 块中使用
server {
    listen 443 ssl;
    http2 on;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    include /etc/nginx/snippets/ssl-params.conf;

    # ... 其余配置
}
```

## 完整生产配置示例

```nginx
# HTTP -> HTTPS 重定向
server {
    listen 80;
    server_name example.com www.example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/example.com;
    }

    location / {
        return 301 https://example.com$request_uri;
    }
}

# www -> 裸域重定向
server {
    listen 443 ssl;
    http2 on;
    server_name www.example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    include /etc/nginx/snippets/ssl-params.conf;

    return 301 https://example.com$request_uri;
}

# 主站
server {
    listen 443 ssl;
    http2 on;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    include /etc/nginx/snippets/ssl-params.conf;

    root /var/www/example.com;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## SSL 验证命令

```bash
# 测试 SSL 配置是否正确
nginx -t

# 查看证书信息
openssl x509 -in /etc/letsencrypt/live/example.com/fullchain.pem -text -noout

# 查看证书过期时间
openssl x509 -in /etc/letsencrypt/live/example.com/fullchain.pem -enddate -noout

# 测试远程服务器 SSL 配置
openssl s_client -connect example.com:443 -servername example.com

# 验证 OCSP Stapling 是否工作
openssl s_client -connect example.com:443 -status -servername example.com 2>/dev/null | grep -A 5 "OCSP Response"

# 生成 DH 参数
openssl dhparam -out /etc/ssl/certs/dhparam.pem 2048
```

## 常见陷阱

- **ssl_certificate 用 fullchain 而非 cert**：仅使用服务器证书（cert.pem）而不包含中间证书链，部分客户端（尤其是 Android）会报证书不可信
- **Let's Encrypt OCSP 已停用**：2025 年起 Let's Encrypt 不再提供 OCSP 服务，`ssl_stapling` 对其证书无效，不必为此报错排查
- **HSTS preload 不可逆**：一旦提交 preload 列表且被收录，撤回需要等待浏览器发版周期（数月），确保所有子域名都支持 HTTPS 后再提交
- **add_header 继承覆盖**：在 location 中写任何 `add_header` 会导致上级 server 块中的所有 `add_header`（包括 HSTS）失效，需要在 location 中重新声明
- **http2 on 语法变更**：Nginx 1.25.1 起 `http2 on` 为独立指令，旧的 `listen 443 ssl http2` 仍可用但已废弃
- **ssl_session_tickets 与前向保密**：开启 session tickets 需要妥善管理 ticket key 的轮换，否则会破坏前向保密，生产环境推荐关闭
- **resolver 必须配置**：OCSP Stapling 需要 resolver 指令指向可用的 DNS 服务器，否则 stapling 静默失败
- **多证书共存**：Nginx 支持同一 server 块配置 RSA + ECDSA 双证书，客户端协商时自动选择

## 组合提示

- 搭配 **nginx-core**：理解 server 块和 listen 指令是配置 HTTPS 的前提
- 搭配 **nginx-reverse-proxy**：在代理层做 SSL 终止，后端用 HTTP，配合 `X-Forwarded-Proto` 头
- 搭配 **nginx-performance**：HTTP/2 多路复用 + Brotli/Gzip 压缩实现最佳传输效率

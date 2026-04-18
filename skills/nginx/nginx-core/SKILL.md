---
name: nginx-core
description: "Nginx 核心配置：文件结构、指令继承、虚拟主机、静态文件服务、日志与命令行操作"
tech_stack: [nginx, backend]
capability: [reverse-proxy]
---

# Nginx 核心配置

> 来源：https://nginx.org/en/docs/beginners_guide.html / https://nginx.org/en/docs/http/server_names.html
> 版本基准：Nginx 1.26+（mainline）

## 用途

掌握 Nginx 配置文件的层级结构、指令继承机制、虚拟主机匹配、静态文件服务和日志系统，是所有 Nginx 运维与开发的基础。

## 何时使用

- 从零搭建 Web 服务器或反向代理
- 配置多域名虚拟主机
- 部署前端 SPA 或静态站点
- 排查请求路由问题（location 匹配不符合预期）
- 配置访问日志与错误日志用于监控和排障

## 配置文件结构

### 层级上下文（Context Hierarchy）

```
main（全局上下文）
├── worker_processes, pid, error_log ...
├── events { }
│   └── worker_connections, multi_accept ...
└── http { }
    ├── 全局 HTTP 指令（gzip, log_format, include ...）
    ├── server { }           # 虚拟主机
    │   ├── listen, server_name
    │   ├── location / { }   # URI 路由
    │   │   └── root, alias, try_files, proxy_pass ...
    │   └── location /api/ { }
    └── server { }           # 另一个虚拟主机
```

### 指令类型

- **简单指令**：名称 + 参数 + 分号，如 `worker_processes auto;`
- **块指令**：花括号包裹的上下文，如 `server { ... }`

### 指令继承规则

子上下文**继承**父上下文中的指令值。若子上下文重新声明同一指令，则**覆盖**父级值。例如在 http 中设置 `gzip on;`，所有 server/location 默认启用 gzip，某个 location 可用 `gzip off;` 单独关闭。

### 典型文件布局

```
/etc/nginx/
├── nginx.conf              # 主配置（通常只含全局指令 + include）
├── conf.d/                 # 按功能拆分的配置片段
│   ├── default.conf
│   └── example.com.conf
├── sites-available/        # Debian/Ubuntu 风格（可选）
├── sites-enabled/          # 符号链接到 sites-available
├── mime.types              # MIME 类型映射
└── snippets/               # 可复用的配置片段
    └── ssl-params.conf
```

### 最小可运行主配置

```nginx
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid       /run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent"';

    access_log /var/log/nginx/access.log main;

    sendfile    on;
    tcp_nopush  on;

    keepalive_timeout 65;

    include /etc/nginx/conf.d/*.conf;
}
```

## 虚拟主机（server_name）

### server_name 匹配优先级（从高到低）

| 优先级 | 类型 | 示例 |
|--------|------|------|
| 1 | 精确匹配 | `server_name example.com;` |
| 2 | 前缀通配符 | `server_name *.example.com;` |
| 3 | 后缀通配符 | `server_name www.example.*;` |
| 4 | 正则表达式 | `server_name ~^(?<subdomain>.+)\.example\.com$;` |
| 5 | default_server | `listen 80 default_server;` |

### 多域名虚拟主机示例

```nginx
# 主站
server {
    listen 80;
    server_name example.com www.example.com;
    root /var/www/example.com/public;
    index index.html;
}

# API 子域名
server {
    listen 80;
    server_name api.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}

# 兜底：未匹配的域名返回 444（直接关闭连接）
server {
    listen 80 default_server;
    server_name _;
    return 444;
}
```

## location 匹配

### 匹配优先级（从高到低）

| 修饰符 | 含义 | 示例 | 说明 |
|--------|------|------|------|
| `=` | 精确匹配 | `location = /favicon.ico` | 完全相等才命中，命中即停止 |
| `^~` | 前缀匹配（跳过正则） | `location ^~ /static/` | 最长前缀命中后不再检查正则 |
| `~` | 正则匹配（区分大小写） | `location ~ \.php$` | 按配置顺序，首个命中生效 |
| `~*` | 正则匹配（不区分大小写） | `location ~* \.(jpg\|png)$` | 同上 |
| 无 | 普通前缀匹配 | `location /api/` | 记住最长前缀，若无正则命中则使用 |

### 匹配流程

1. 检查所有前缀 location，记住最长匹配
2. 若最长匹配带 `=`（精确）或 `^~`，直接使用，停止搜索
3. 按配置顺序检查正则 location，首个命中即生效
4. 若无正则命中，使用第 1 步记住的最长前缀匹配

## 静态文件服务

### root 与 alias 的区别

```nginx
# root：将 URI 追加到路径后
location /images/ {
    root /var/www;
    # 请求 /images/photo.jpg -> /var/www/images/photo.jpg
}

# alias：用指定路径替换 location 匹配部分
location /images/ {
    alias /var/www/media/;
    # 请求 /images/photo.jpg -> /var/www/media/photo.jpg
}
```

**关键区别**：root 会保留 location 路径拼接，alias 会替换掉 location 路径。

### try_files 指令

按顺序检查文件/目录是否存在，最后一个参数为兜底项（URI 或状态码）。

```nginx
# SPA 应用（前端路由）
location / {
    root /var/www/app/dist;
    try_files $uri $uri/ /index.html;
}

# 返回 404 而非兜底页面
location /assets/ {
    root /var/www/app;
    try_files $uri =404;
}

# PHP 应用
location / {
    root /var/www/html;
    try_files $uri $uri/ /index.php?$query_string;
}
```

### 完整静态站点配置

```nginx
server {
    listen 80;
    server_name static.example.com;

    root /var/www/static-site;
    index index.html index.htm;

    # 精确匹配首页，减少查找开销
    location = / {
        index index.html;
    }

    # SPA 路由兜底
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源长缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # 禁止访问隐藏文件
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

## 日志配置

### log_format 自定义格式

```nginx
http {
    # 标准格式
    log_format main '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent"';

    # JSON 格式（便于 ELK/Loki 解析）
    log_format json_combined escape=json
        '{'
            '"time":"$time_iso8601",'
            '"remote_addr":"$remote_addr",'
            '"request":"$request",'
            '"status":$status,'
            '"body_bytes_sent":$body_bytes_sent,'
            '"request_time":$request_time,'
            '"upstream_response_time":"$upstream_response_time",'
            '"http_referer":"$http_referer",'
            '"http_user_agent":"$http_user_agent"'
        '}';
}
```

### access_log 与 error_log

```nginx
# 全局默认
access_log /var/log/nginx/access.log main;
error_log  /var/log/nginx/error.log warn;

server {
    # 每个虚拟主机可独立设置
    access_log /var/log/nginx/example.com.access.log json_combined;
    error_log  /var/log/nginx/example.com.error.log;

    # 静态资源关闭访问日志减少 I/O
    location ~* \.(js|css|png|jpg|ico)$ {
        access_log off;
    }
}
```

### error_log 级别

`debug | info | notice | warn | error | crit | alert | emerg`

生产环境推荐 `warn` 或 `error`。`debug` 级别需要编译时开启 `--with-debug`。

### 条件日志

```nginx
# 不记录健康检查请求
map $request_uri $loggable {
    ~^/health  0;
    default    1;
}
access_log /var/log/nginx/access.log main if=$loggable;
```

## Nginx 命令行操作

### 常用命令

```bash
# 启动
nginx                          # 使用默认配置启动
nginx -c /path/to/nginx.conf  # 指定配置文件

# 配置检查（上线前必做）
nginx -t                       # 检查语法并验证配置
nginx -T                       # 检查并输出完整合并后的配置

# 信号控制
nginx -s reload                # 平滑重载配置（不中断服务）
nginx -s quit                  # 优雅停止（处理完当前请求）
nginx -s stop                  # 立即停止
nginx -s reopen                # 重新打开日志文件（日志切割用）

# 查看版本与编译参数
nginx -v                       # 版本号
nginx -V                       # 版本 + 编译配置参数
```

### reload 工作原理

1. master 进程读取并验证新配置
2. 验证成功：启动新 worker 进程，向旧 worker 发送优雅退出信号
3. 旧 worker 不再接受新连接，处理完已有请求后退出
4. 验证失败：回滚，继续使用旧配置，无任何中断

### 日志切割脚本

```bash
#!/bin/bash
LOG_DIR=/var/log/nginx
DATE=$(date +%Y%m%d)
mv ${LOG_DIR}/access.log ${LOG_DIR}/access.log.${DATE}
mv ${LOG_DIR}/error.log  ${LOG_DIR}/error.log.${DATE}
nginx -s reopen
# 配合 crontab: 0 0 * * * /path/to/rotate.sh
```

## 常见陷阱

- **alias 尾部斜线遗漏**：`location /img/` 搭配 `alias /var/www/media`（无尾部 `/`）会导致路径拼接为 `/var/www/mediaphoto.jpg`，必须写成 `alias /var/www/media/;`
- **location 正则顺序敏感**：正则 location 按配置文件中的顺序匹配，将更具体的规则放在前面
- **忘记 nginx -t**：直接 `nginx -s reload` 而不先 `-t` 检查，若配置有误不会重载但容易遗漏告警
- **try_files 性能**：每个请求都会执行 stat() 系统调用检查文件，高并发场景配合 `open_file_cache` 使用
- **server_name 遗漏 default_server**：没有 default_server 时，第一个 server 块成为默认虚拟主机，可能暴露意外的内容
- **root 放在 location 内还是 server 内**：推荐放在 server 级别作为默认值，仅在特殊 location 中覆盖
- **sendfile 与容器/挂载卷**：在 Docker 等环境中使用挂载卷时，`sendfile on` 可能导致文件更新后仍返回旧内容，调试时可临时关闭

## 组合提示

- 搭配 **nginx-reverse-proxy**：在 location 块中使用 proxy_pass 替代 root/alias
- 搭配 **nginx-ssl**：为虚拟主机添加 HTTPS 和安全头
- 搭配 **nginx-performance**：在 http/server 级别添加 gzip、缓存和限流配置

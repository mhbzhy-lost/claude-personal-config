---
name: httpx-session-cookies
description: HTTPX Cookie 会话持久化、跨进程共享与 Playwright cookies 双向互转
tech_stack: [httpx]
language: [python]
capability: [auth, http-client]
version: "httpx unversioned / Playwright unversioned"
collected_at: 2025-01-01
---

# HTTPX Session Cookies

> Source: https://www.python-httpx.org/quickstart/, https://www.python-httpx.org/api/, https://playwright.dev/python/docs/api/class-browsercontext

## Purpose
掌握 HTTPX 的 Cookie 管理：使用 `Cookies` 类进行 domain/path 级过滤、利用 `Client`/`AsyncClient` 自动维持会话状态、跨进程序列化共享 cookie jar，以及 Playwright 浏览器 cookies 与 httpx 之间的双向转换。

## When to Use
- 需要跨多次 HTTP 请求维持登录会话状态
- 希望 cookies 自动持久化而无需手动管理
- 从浏览器（Playwright/Selenium）迁移 cookies 到 HTTPX 进行 API 访问
- 多个 Python 进程/服务间共享认证会话
- 编写爬虫需要维持跨请求状态

## Basic Usage

### 读取响应 Cookies

```python
r = httpx.get('https://httpbin.org/cookies/set?chocolate=chip')
r.cookies['chocolate']  # 'chip'
```

### 发送请求时携带 Cookies

```python
cookies = {"peanut": "butter"}
r = httpx.get('https://httpbin.org/cookies', cookies=cookies)
r.json()  # {'cookies': {'peanut': 'butter'}}
```

### Client 级别自动持久化

```python
with httpx.Client() as client:
    client.get('https://httpbin.org/cookies/set?session=abc123')
    r = client.get('https://httpbin.org/cookies')
    print(r.json())  # {'cookies': {'session': 'abc123'}}
```

**只有 `Client`/`AsyncClient` 实例会自动维持 cookie 状态**——顶层 API（`httpx.get()` 等）不持久化 cookies。

## Key APIs (Summary)

### Cookies 类

| 方法 | 说明 |
|------|------|
| `Cookies()` | 构造，接受 dict / Cookies / CookieJar |
| `.set(name, value, domain=, path=)` | 设置 cookie，支持 domain/path 过滤 |
| `.get(name, domain=, path=)` | 按名称+域名+路径获取 |
| `.delete(name, domain=, path=)` | 按名称+域名+路径删除 |
| `.clear(domain=, path=)` | 清空，可选按 domain/path 过滤 |
| `.jar` | 底层 `CookieJar` 实例 |
| `.extract_cookies(response)` | 从响应提取 Set-Cookie |
| `.set_cookie_header(request)` | 将 cookies 写入请求头 |

支持标准 dict 接口：`c['key']`、`c['key'] = val`、`del c['key']`、`for k in c`、`len(c)`。

### Domain/Path 过滤示例

```python
cookies = httpx.Cookies()
cookies.set('token', 'abc', domain='api.example.com', path='/v1')
cookies.set('token', 'xyz', domain='api.example.com', path='/v2')

# 只发往匹配 domain+path 的请求
r = httpx.get('https://api.example.com/v1/data', cookies=cookies)
```

### Client 构造函数

```python
httpx.Client(cookies={'init': 'val'})
httpx.AsyncClient(cookies=existing_cookies_jar)
```

Client 级 cookies 与请求级 cookies **合并**（不是覆盖）。需要覆盖时先 `.delete()`。

## Examples

### 跨进程 Cookie 共享（pickle）

```python
import pickle, httpx

# 进程 A：导出
with httpx.Client() as client:
    client.get('https://example.com/login?user=me')
    with open('/tmp/shared_cookies.pkl', 'wb') as f:
        pickle.dump(client.cookies.jar, f)

# 进程 B：导入
with open('/tmp/shared_cookies.pkl', 'rb') as f:
    jar = pickle.load(f)
with httpx.Client(cookies=jar) as client:
    r = client.get('https://example.com/protected')
```

### 跨进程 Cookie 共享（JSON，可移植）

```python
import json

# 导出
def export_cookies(client, path):
    data = [{'name': c.name, 'value': c.value, 'domain': c.domain,
             'path': c.path, 'expires': c.expires, 'secure': c.secure}
            for c in client.cookies.jar]
    with open(path, 'w') as f:
        json.dump(data, f)

# 导入
def import_cookies(client, path):
    with open(path) as f:
        for c in json.load(f):
            client.cookies.set(c['name'], c['value'],
                               domain=c.get('domain'), path=c.get('path'))
```

### Playwright → httpx Cookie 转换

```python
from playwright.sync_api import sync_playwright
import httpx

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context()
    page = context.new_page()
    page.goto('https://example.com/login')
    # ... 浏览器登录操作 ...

    pw_cookies = context.cookies()
    httpx_cookies = httpx.Cookies()
    for c in pw_cookies:
        httpx_cookies.set(
            c['name'], c['value'],
            domain=c['domain'].lstrip('.'),   # ⚠️ 去掉前导点
            path=c.get('path', '/')
        )

    with httpx.Client(cookies=httpx_cookies) as client:
        r = client.get('https://example.com/api/data')
        print(r.json())

    browser.close()
```

### httpx → Playwright Cookie 转换

```python
def httpx_to_playwright_cookies(httpx_cookies):
    """转换为 Playwright add_cookies 接受的格式。"""
    return [{
        'name': c.name,
        'value': c.value,
        'domain': c.domain,
        'path': c.path,
        'expires': c.expires,
        'secure': c.secure,
        'httpOnly': False,       # httpx 不跟踪此字段
        'sameSite': 'Lax',       # 默认值
    } for c in httpx_cookies.jar]

context.add_cookies(httpx_to_playwright_cookies(client.cookies))
```

## Caveats
- **httpx 不跟踪 `httpOnly` / `sameSite`**——Playwright→httpx→Playwright 往返会丢失这些字段，需手动保留。
- **Domain 前导点**：Playwright 可能返回 `.example.com`，httpx 不接受前导点，用 `.lstrip('.')` 去除。
- **`expires` 格式**：Playwright 用 Unix 时间戳（float），httpx CookieJar 内部表示可能不同，往返时注意转换。
- **Pickle 绑定内部实现**——JSON 序列化更可移植，适合长期存储或跨语言共享。
- **顶层 API 不持久化 cookies**——只有 `Client`/`AsyncClient` 实例维持 cookie 状态。
- **Cookies 合并而非覆盖**——要覆盖 client 级 cookie，先 `client.cookies.delete()` 再设新的。

## Composition Hints
- 配合 `httpx-async-client` 使用 `AsyncClient` 的 cookie 持久化能力
- 配合 `httpx-retries-tenacity` 在重试时维持 cookie 会话
- 配合 `httpx-proxy` 通过代理发送带 cookies 的请求
- 从 Playwright 浏览器登录后提取 cookies 给 httpx 做 API 调用，是反爬/自动化常见模式

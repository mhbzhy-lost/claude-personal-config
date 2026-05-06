---
name: httpx-proxy
description: Configure HTTP, HTTPS, and SOCKS proxies for httpx clients — simple proxy URLs, per-domain routing via mounts, authentication, and third-party SOCKS transports.
tech_stack: ["http"]
language: ["python"]
capability: ["http-client"]
version: "httpx unversioned / httpx-socks 0.11.0"
collected_at: 2025-01-01
---

# httpx Proxy

> Source: https://www.python-httpx.org/advanced/proxies/, https://www.python-httpx.org/advanced/transports/, https://pypi.org/project/httpx-socks/

## Purpose

HTTPX supports outbound HTTP and SOCKS proxying via a simple `proxy` parameter
or a powerful `mounts` routing system. The `mounts` dictionary maps URL patterns
to transports, enabling per-scheme, per-domain, and per-port proxy selection —
including no-proxy exclusions.

## When to Use

- Routing outbound requests through an HTTP forward proxy
- Using a SOCKS5 proxy (built-in or via `httpx-socks` for SOCKS4/HTTP CONNECT)
- Per-domain proxy configuration (some domains proxied, others direct)
- Proxy authentication with credentials in the proxy URL
- Environment-variable-driven proxy configuration (`HTTP_PROXY`, `NO_PROXY`, etc.)

## Basic Usage

### Simple HTTP proxy

```python
import httpx

with httpx.Client(proxy="http://localhost:8030") as client:
    response = client.get("https://example.com")
```

Also works with top-level functions:

```python
response = httpx.get("https://example.com", proxy="http://localhost:8030")
```

### Proxy with authentication

```python
with httpx.Client(proxy="http://username:password@proxy:8080") as client:
    response = client.get("https://api.example.com/data")
```

### Per-scheme proxies via mounts

```python
mounts = {
    "http://": httpx.HTTPTransport(proxy="http://proxy:8030"),
    "https://": httpx.HTTPTransport(proxy="http://proxy:8031"),
}
with httpx.Client(mounts=mounts) as client:
    ...
```

### SOCKS proxy (built-in)

```python
# Requires: pip install httpx[socks]
with httpx.Client(proxy="socks5://user:pass@host:1080") as client:
    response = client.get("https://example.com")
```

### SOCKS via httpx-socks (third-party, richer support)

```python
# pip install httpx-socks
from httpx_socks import SyncProxyTransport

transport = SyncProxyTransport.from_url("socks5://localhost:1080")
with httpx.Client(transport=transport) as client:
    response = client.get("https://example.com")
```

## Key APIs (Summary)

| Feature | API | Notes |
|---|---|---|
| **Simple proxy** | `Client(proxy="http://host:port")` | Routes all HTTP+HTTPS through one proxy |
| **Authenticated proxy** | `proxy="http://user:pass@host:port"` | Credentials in URL userinfo |
| **Per-scheme routing** | `mounts={"http://": ..., "https://": ...}` | Different proxies or transports per scheme |
| **Domain routing** | `mounts={"all://example.com": ...}` | Proxy only matching domains |
| **Subdomain wildcard** | `mounts={"all://*example.com": ...}` | Includes subdomains |
| **Strict subdomain** | `mounts={"all://*.example.com": ...}` | Subdomains only, not the apex |
| **Port routing** | `mounts={"all://*:1234": ...}` | Proxy by port |
| **No-proxy exclusion** | `mounts={"all://example.com": None}` | Pass `None` to bypass proxy |
| **SOCKS (built-in)** | `proxy="socks5://host:port"` | Requires `pip install httpx[socks]` |
| **SOCKS (httpx-socks)** | `SyncProxyTransport.from_url("socks5://...")` | SOCKS4, SOCKS5, HTTP CONNECT, async support |
| **Async SOCKS** | `AsyncProxyTransport.from_url(...)` | Works with `httpx.AsyncClient` |
| **Environment vars** | `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` | Standard proxy env vars respected |

### Mounts pattern reference

```
all://              → match everything
http://             → match HTTP scheme only
https://            → match HTTPS scheme only
all://example.com   → match domain exactly
all://*example.com  → match domain + subdomains
all://*.example.com → match subdomains only (not apex)
all://*:1234        → match any host on port 1234
https://example.com:1234 → match scheme + domain + port
```

## Caveats

- **FORWARD vs TUNNEL**: HTTP proxying uses *forwarding* (proxy makes the
  request) for plain HTTP, and *tunnelling* (proxy opens a TCP tunnel, client
  does TLS) for HTTPS. This is transparent to httpx users but explains why...
- **HTTPS proxy URL uses `http://` scheme**: The proxy connection itself is
  plain HTTP. Write `mounts={"https://": httpx.HTTPTransport(proxy="http://...")}`
  — not `https://` for the proxy URL.
- **Built-in SOCKS is limited**: `httpx[socks]` supports basic SOCKS5 only.
  Use `httpx-socks` for SOCKS4(a), HTTP CONNECT proxy, or async proxy support.
- **httpx-socks version constraint**: v0.11.0 pins `httpx>=0.28.0,<0.29.0`.
  Verify compatibility before upgrading httpx.
- **Credentials in cleartext**: HTTP proxy URLs send credentials unencrypted
  over the proxy connection. Use `proxy_ssl` with `httpx-socks` for encrypted
  proxy connections when available.
- **Mounts match most-specific-first**: When multiple patterns could match
  a URL, the most specific one wins (e.g. `https://example.com:1234` beats
  `all://example.com`).

## Composition Hints

- **Start simple, then add mounts**: Use the top-level `proxy=` parameter for
  uniform proxying. Graduate to `mounts=` when you need per-domain exclusions
  or multiple proxies.
- **No-proxy with a default**: Set `"all://"` to your proxy and `"all://<internal>"`
  to `None` for internal services that should bypass the proxy.
- **Round-robin proxy pool**: Subclass `httpx.BaseTransport` and rotate through
  multiple `httpx.HTTPTransport(proxy=...)` instances for load distribution.
- **Async proxy**: Use `httpx-socks`'s `AsyncProxyTransport` with `AsyncClient`,
  or the built-in `proxy="socks5://..."` which also works with `AsyncClient`.
- **Environment-variable-driven**: httpx reads `HTTP_PROXY`/`HTTPS_PROXY`/
  `ALL_PROXY`/`NO_PROXY` automatically — useful for 12-factor apps where proxy
  config comes from the environment.

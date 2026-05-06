---
name: openai-async-client
description: Configure AsyncOpenAI client with api_key auth, base_url switching for DeepSeek/Qwen/Zhipu, custom HTTP backends, timeout/retry, and connection pooling.
tech_stack: [openai]
language: [python]
capability: [llm-client, http-client, auth]
version: "openai-python unversioned"
collected_at: 2026-01-12
---

# AsyncOpenAI Client Configuration

> Source: https://developers.openai.com/api/reference/python, https://github.com/openai/openai-python/blob/main/README.md?plain=1, https://deepwiki.com/openai/openai-python/2.1-client-configuration, https://api-docs.deepseek.com/

## Purpose

Configure and instantiate the `AsyncOpenAI` (and `OpenAI`) client with authentication, network settings, retry behavior, custom HTTP backends, and cross-provider compatibility. The `AsyncOpenAI` client uses `httpx.AsyncClient` internally; all API methods are `async`.

## When to Use

- Building async Python applications (FastAPI, asyncio services) that call OpenAI or compatible APIs
- Switching between OpenAI-compatible providers (DeepSeek, Qwen, Zhipu) via `base_url`
- Fine-tuning HTTP behavior: custom timeouts, retry policies, headers, proxies
- Managing connection lifecycle with context managers for proper resource cleanup
- Using `aiohttp` as an alternative HTTP backend for higher concurrency

## Basic Usage

```python
import os
import asyncio
from openai import AsyncOpenAI

client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

async def main() -> None:
    completion = await client.chat.completions.create(
        model="gpt-5.2",
        messages=[{"role": "user", "content": "Hello"}],
    )
    print(completion.choices[0].message.content)

asyncio.run(main())
```

### API Key — Three Mechanisms

| Priority | Method | Example |
|----------|--------|---------|
| 1 (highest) | Constructor string | `AsyncOpenAI(api_key="sk-...")` |
| 1 (highest) | Constructor callable | `AsyncOpenAI(api_key=lambda: get_key())` |
| 2 | Environment variable | `OPENAI_API_KEY=sk-...` |

Callable keys are invoked before every request — use for dynamic credential refresh.

### Cross-Provider base_url

Switch providers by changing `base_url`. Resolution: constructor arg → `OPENAI_BASE_URL` env var → `https://api.openai.com/v1`.

```python
# DeepSeek
client = AsyncOpenAI(
    api_key=os.environ["DEEPSEEK_API_KEY"],
    base_url="https://api.deepseek.com"
)

# Qwen
client = AsyncOpenAI(
    api_key=os.environ["QWEN_API_KEY"],
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
)

# Zhipu (智谱)
client = AsyncOpenAI(
    api_key=os.environ["ZHIPU_API_KEY"],
    base_url="https://open.bigmodel.cn/api/paas/v4"
)
```

Provider-specific parameters (DeepSeek `thinking`, Qwen `enable_search`) go through `extra_body`:

```python
response = await client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={"thinking": {"type": "enabled"}},
)
```

### Connection Lifecycle — Context Manager

```python
async with AsyncOpenAI() as client:
    response = await client.chat.completions.create(
        model="gpt-5.2",
        messages=[{"role": "user", "content": "Hello"}],
    )
# Connections properly closed after the block
```

Without a context manager, connections close on garbage collection.

### Per-Request Overrides — with_options()

Creates a **new** client instance (does not mutate the original):

```python
# Override timeout per-request
await client.with_options(timeout=5.0).chat.completions.create(...)

# Override retries per-request
await client.with_options(max_retries=0).chat.completions.create(...)

# Add custom headers per-request
await client.with_options(
    default_headers={"X-Request-Id": str(uuid4())}
).chat.completions.create(...)
```

## Key APIs (Summary)

```python
class AsyncOpenAI(
    api_key: str | Callable[[], str] | None = None,       # Auth key
    base_url: str | httpx.URL | None = None,               # Provider endpoint
    timeout: float | httpx.Timeout | None = None,          # Default: 600s
    max_retries: int = 2,                                  # 0 to disable
    default_headers: Mapping[str, str] | None = None,      # Added to every request
    default_query: Mapping[str, object] | None = None,     # Added to every request URL
    http_client: httpx.AsyncClient | None = None,          # Custom HTTP backend
    organization: str | None = None,                       # Org ID header
    project: str | None = None,                            # Project ID header
)
```

### aiohttp Backend

```bash
pip install openai[aiohttp]
```

```python
from openai import AsyncOpenAI, DefaultAioHttpClient

async with AsyncOpenAI(http_client=DefaultAioHttpClient()) as client:
    completion = await client.chat.completions.create(
        model="gpt-5.2",
        messages=[{"role": "user", "content": "Say this is a test"}],
    )
```

### Timeout Configuration

```python
# Simple float
client = AsyncOpenAI(timeout=20.0)

# Granular httpx.Timeout
import httpx
client = AsyncOpenAI(timeout=httpx.Timeout(60.0, read=5.0, write=10.0, connect=2.0))
```

Default is 10 minutes. On timeout, `APITimeoutError` is raised (and retried 2× by default).

### Workload Identity (Kubernetes / Azure / GCP)

```python
from openai.auth import k8s_service_account_token_provider

client = AsyncOpenAI(
    workload_identity={
        "client_id": "your-client-id",
        "identity_provider_id": "idp-123",
        "service_account_id": "sa-456",
        "provider": k8s_service_account_token_provider("/var/run/secrets/.../token"),
    },
)
```

Also: `azure_managed_identity_token_provider`, `gcp_id_token_provider`, or custom JWT providers.

## Caveats

- **`AsyncOpenAI` requires `asyncio.run()` or an existing event loop.** Cannot be used in synchronous code directly.
- **`with_options()` returns a new instance** — always capture the return value. The original client is unchanged.
- **Callable `api_key` is called before every request** — keep it lightweight; avoid network I/O inside.
- **Retries × timeouts compound**: a 10-minute timeout with 2 retries = up to 30 minutes before failure.
- **Environment variables are read at instantiation time**, not per-request. Use a callable for dynamic rotation.
- **`aiohttp` requires opt-in**: `pip install openai[aiohttp]`. Default async backend is `httpx`.
- **`extra_body` is the escape hatch** for provider-specific parameters (DeepSeek `thinking`, Qwen `enable_search`).
- **`base_url` path handling**: OpenAI default includes `/v1`. For DeepSeek, `https://api.deepseek.com` (no `/v1`) works correctly.

## Composition Hints

- Pair with `openai-chat-completions` for the full request lifecycle after client setup.
- Use `openai-streaming` with the async client for SSE iteration (`async for chunk in stream`).
- For structured outputs, use `openai-structured-outputs` — the client configuration here applies identically.
- Module-level config (`openai.api_key = ...`) is a shortcut for single-client scripts; prefer explicit `AsyncOpenAI()` in production services.

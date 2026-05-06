---
name: litellm-routing-fallback
description: Router class for load balancing, automatic fallback chains, retries, cooldowns, and budget-aware routing across LLM deployments.
tech_stack: [litellm]
language: [python]
capability: [llm-client, observability]
version: "litellm unversioned"
collected_at: 2025-07-16
---

# LiteLLM Router — Load Balancing & Fallback

> Source: https://docs.litellm.ai/docs/routing, https://docs.litellm.ai/docs/proxy/provider_budget_routing

## Purpose

The `Router` class wraps `litellm.completion()` with production reliability: load balancing across multiple deployments of the same model, automatic fallback when deployments fail, retry with exponential backoff, cooldowns for failing endpoints, and budget-aware routing. Redis is used in multi-instance deployments to share cooldown and usage state.

## When to Use

- You have multiple deployments of the same model (e.g., Azure in 3 regions + OpenAI) and need load balancing
- Automatic failover when a provider returns errors or hits rate limits
- Budget-controlled routing — stop using a provider/deployment once daily spend is exceeded
- Multi-instance deployments (cooldown/usage state shared via Redis)

## Basic Usage

### Router Initialization

```python
from litellm import Router
import os

model_list = [
    {
        "model_name": "gpt-3.5-turbo",           # alias your app uses
        "litellm_params": {
            "model": "azure/chatgpt-v-2",         # actual deployment
            "api_key": os.getenv("AZURE_API_KEY"),
            "api_base": os.getenv("AZURE_API_BASE"),
            "api_version": os.getenv("AZURE_API_VERSION"),
            "rpm": 900,                           # optional rate limit
        }
    },
    {
        "model_name": "gpt-3.5-turbo",
        "litellm_params": {
            "model": "gpt-3.5-turbo",
            "api_key": os.getenv("OPENAI_API_KEY"),
            "rpm": 100,
        }
    },
]

router = Router(
    model_list=model_list,
    routing_strategy="simple-shuffle",  # default, recommended
    num_retries=3,                      # total retries across all deployments
    allowed_fails=3,                    # failures before cooldown
    cooldown_time=30,                   # seconds in cooldown
    enable_pre_call_checks=True,        # enforce rpm/tpm before calling
    # For multi-instance: add Redis
    # redis_host=os.environ["REDIS_HOST"],
    # redis_password=os.environ["REDIS_PASSWORD"],
    # redis_port=os.environ["REDIS_PORT"],
)

# Drop-in replacement for litellm.completion()
response = await router.acompletion(
    model="gpt-3.5-turbo",              # matches model_name in model_list
    messages=[{"role": "user", "content": "Hello"}],
)
```

### Router Endpoints

All mirror the base `litellm` API: `router.completion()` / `.acompletion()`, `router.embedding()` / `.aembedding()`, `router.text_completion()` / `.atext_completion()`, `router.image_generation()` / `.aimage_generation()`.

## Key APIs — Routing Strategies

### `simple-shuffle` (Default — Recommended for Production)

Picks a deployment considering rpm/tpm limits and optional weight. Best performance with minimal latency.

```python
# RPM-based: deployment with rpm=900 gets 90x more traffic than rpm=10
model_list = [
    {"model_name": "gpt-3.5-turbo", "litellm_params": {"model": "azure/chatgpt-v-2", ..., "rpm": 900}},
    {"model_name": "gpt-3.5-turbo", "litellm_params": {"model": "azure/chatgpt-fc", ..., "rpm": 10}},
]

# Weight-based: weight=9 means 90% of traffic
model_list = [
    {"model_name": "gpt-3.5-turbo", "litellm_params": {"model": "azure/chatgpt-v-2", ..., "weight": 9}},
    {"model_name": "gpt-3.5-turbo", "litellm_params": {"model": "gpt-3.5-turbo", ..., "weight": 1}},
]
```

### Other Strategies (not recommended for high-traffic production)

| Strategy | Key | Behavior | Notes |
|----------|-----|----------|-------|
| `usage-based-routing-v2` | `"usage-based-routing-v2"` | Lowest TPM usage | Async, needs Redis |
| `latency-based-routing` | `"latency-based-routing"` | Lowest response time | Caches timings; add `lowest_latency_buffer` to spread load |
| `least-busy` | `"least-busy"` | Fewest concurrent calls | |
| Custom | `set_custom_routing_strategy()` | Your logic | Subclass `CustomRoutingStrategyBase` |

## Key APIs — Fallback, Retry, Cooldown

### Fallback Chain

Deployments with the same `model_name` form the fallback chain, tried **in order** when the selected deployment fails. Deployments in cooldown are skipped.

```python
# Azure (primary) → OpenAI (fallback)
model_list = [
    {"model_name": "gpt-4", "litellm_params": {"model": "azure/gpt-4", ...}},
    {"model_name": "gpt-4", "litellm_params": {"model": "openai/gpt-4o", ...}},   # fallback
]
```

### Retry Logic

- `num_retries` (Router default: 3) — total retries across all deployments before failing
- Per-call override: `router.completion(..., num_retries=5)`
- Exponential backoff is automatic
- Triggers: `APIError`, `TimeoutError`, `ServiceUnavailableError`

### Cooldowns

| Param | Default | Description |
|-------|---------|-------------|
| `allowed_fails` | 3 | Consecutive failures before cooldown |
| `cooldown_time` | 30 | Seconds deployment is excluded from routing |

### Pre-Call Checks (`enable_pre_call_checks=True`)

Before each call, the Router validates: deployment not in cooldown, rpm/tpm not exceeded, context window sufficient, EU region constraints (if configured).

## Key APIs — Budget Routing

### Provider Budgets (Proxy YAML only)

```yaml
router_settings:
  provider_budget_config:
    openai:
      budget_limit: 100.0     # $100 USD
      time_period: 1d         # "Xs"|"Xm"|"Xh"|"Xd"|"Xmo"
    azure:
      budget_limit: 500.0
      time_period: 30d
```

When exceeded: 429 error — `"No deployments available - crossed budget for provider"`.

### Model Budgets (per deployment in model_list)

```yaml
- model_name: gpt-4o
  litellm_params:
    model: openai/gpt-4o
    max_budget: 100           # USD
    budget_duration: 1d       # 1s|1m|1h|1d|1mo
```

### Monitoring

```bash
curl -X GET http://localhost:4000/provider/budgets -H "Authorization: Bearer sk-1234"
# → { "providers": { "openai": { "budget_limit": 100, "spend": 42, "budget_reset_at": "..." } } }
```

Prometheus metric: `litellm_provider_remaining_budget_metric{api_provider="openai"}`.

## Caveats

- **`simple-shuffle` is the only strategy recommended for production.** All usage-aware strategies add Redis latency.
- **Redis is required for multi-instance.** Without it, each instance tracks cooldowns/usage independently.
- **`rpm`/`tpm` are per-deployment, not global.** Enforced only when `enable_pre_call_checks=True`.
- **Fallback order = model_list order.** Place primary deployments first.
- **`num_retries` is across ALL deployments.** With 3 deployments and `num_retries=3`, each deployment gets ~1 attempt, not 3 each.
- **Cooldown is per-deployment.** A single bad endpoint doesn't blacklist the whole model group.
- **Provider budget names must match litellm provider names exactly** (e.g., `openai`, `azure`, `anthropic`).
- **Azure RPM ≈ TPM/6** — plan limits accordingly.

## Composition Hints

- **Pair with `litellm-completion`**: Router wraps the same `completion()` API — any code written for bare `litellm.completion()` works with `router.completion()`.
- **Pair with `litellm-caching`**: Caching reduces duplicate calls; Router handles availability.
- **For proxy deployments**: Budget routing and virtual-key management are proxy-only features; use the proxy config YAML rather than the SDK Router.

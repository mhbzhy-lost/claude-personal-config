---
name: litellm-cost-tracking
description: Per-request cost tracking, budget enforcement, and rate limiting with LiteLLM — SDK callbacks, BudgetManager, and proxy-level virtual key/user/team budgets.
tech_stack: [litellm]
language: [python]
capability: [observability, payment-reconcile]
version: "LiteLLM unversioned"
collected_at: 2025-01-01
---

# LiteLLM Cost Tracking & Budget Management

> Source: https://docs.litellm.ai/docs/observability/custom_callback, https://docs.litellm.ai/docs/budget_manager, https://docs.litellm.ai/docs/proxy/users

## Purpose

Track per-request LLM costs, enforce hard budget caps, and set rate limits across SDK and proxy modes. Three layers: (1) callback hooks for cost observation at the SDK level, (2) `BudgetManager` for programmatic per-user spend tracking, (3) proxy-level budget and rate-limit enforcement on virtual keys, users, teams, and end customers.

## When to Use

- Log per-request LLM cost to analytics, billing, or monitoring systems
- Cap spend to prevent runaway bills — globally, per key, per user, or per team
- Implement quotas with automatic reset on daily/weekly/monthly/yearly schedules
- Set rate limits: tokens per minute (tpm), requests per minute (rpm), max parallel requests
- Layer multiple budget windows on the same key (e.g. $10/day AND $100/month)
- Budget end customers by `user` parameter without creating individual API keys

## Basic Usage

### Track Cost in a Callback (SDK)

```python
import litellm
from litellm import completion

def track_cost_callback(kwargs, completion_response, start_time, end_time):
    cost = kwargs["response_cost"]  # automatically calculated
    print(f"Request cost: ${cost}")

litellm.success_callback = [track_cost_callback]

response = completion(model="gpt-3.5-turbo", messages=[{"role": "user", "content": "Hello"}])
```

### Global Budget Cap (SDK)

```python
litellm.max_budget = 0.001  # $0.001 — raises BudgetExceededError when exceeded
```

### BudgetManager with Auto-Reset (SDK)

```python
from litellm import BudgetManager, completion

bm = BudgetManager(project_name="my-project", client_type="hosted")

if not bm.is_valid_user("user-123"):
    bm.create_budget(total_budget=10, user="user-123", duration="monthly")

if bm.get_current_cost(user="user-123") <= bm.get_total_budget(user="user-123"):
    response = completion(model="gpt-3.5-turbo", messages=[{"role": "user", "content": "Hey"}])
    bm.update_cost(completion_obj=response, user="user-123")
```

### Proxy: Global Budget in config.yaml

```yaml
litellm_settings:
  max_budget: 10            # $10
  budget_duration: 30d      # reset every 30 days
  max_end_user_budget: 0.0001  # per 'user' param
```

### Proxy: Virtual Key with Budget

```bash
curl 'http://0.0.0.0:4000/key/generate' \
  -H 'Authorization: Bearer <master-key>' \
  -H 'Content-Type: application/json' \
  -d '{"max_budget": 10, "budget_duration": "30d"}'
```

### Proxy: Multiple Budget Windows

```bash
curl 'http://0.0.0.0:4000/key/generate' \
  -H 'Authorization: Bearer <master-key>' \
  -H 'Content-Type: application/json' \
  -d '{"budget_limits": [
    {"budget_duration": "24h", "max_budget": 10},
    {"budget_duration": "30d", "max_budget": 100}
  ]}'
```

## Key APIs (Summary)

### Callback Registration

| Mechanism | Registration | Best For |
|-----------|-------------|----------|
| CustomLogger class | `litellm.callbacks = [MyHandler()]` | Full lifecycle hooks (pre, post, success, failure) |
| Success callback fn | `litellm.success_callback = [fn]` | Logging successful calls |
| Failure callback fn | `litellm.failure_callback = [fn]` | Error alerting |
| Input callback fn | `litellm.input_callback = [fn]` | Logging/modifying inputs |

### Key `kwargs` Fields in Callbacks

- `kwargs["response_cost"]` — calculated cost (float), the primary field for cost tracking
- `kwargs["model"]` — model name
- `kwargs["cache_hit"]` — whether response was served from cache
- `kwargs["litellm_params"]["metadata"]` — user-supplied metadata

### BudgetManager Key Methods

| Method | Purpose |
|--------|---------|
| `create_budget(total_budget, user, duration)` | Create budget with reset interval |
| `get_current_cost(user)` | Current spend for user |
| `get_total_budget(user)` | Budget cap for user |
| `update_cost(completion_obj, user)` | Record spend from completion |
| `is_valid_user(user)` | Check if user exists |
| `reset_on_duration(user)` | Manually reset based on duration |
| `projected_cost(model, messages, user)` | Estimate cost before calling |

### Proxy Rate Limit Fields

| Field | Applies To |
|-------|-----------|
| `tpm_limit` | Key, User, Team, Agent |
| `rpm_limit` | Key, User, Team, Agent |
| `max_parallel_requests` | Key, User, Team |
| `model_rpm_limit` / `model_tpm_limit` | Key, Team (per-model dict) |
| `budget_duration` | Key, User, Team (reset period) |
| `max_budget` | Key, User, Team, Global |
| `budget_limits` | Key (multiple concurrent windows) |

### Proxy Budget Scope Hierarchy

Global > Team > Team Member (`max_budget_in_team`) > User > Key > End Customer (`user` param)

When a key belongs to a team, the **team budget is applied**, not the user's personal budget.

### Budget Reset Schedules

| `budget_duration` | Reset Trigger |
|-------------------|---------------|
| `1h` | Every hour |
| `24h` | Daily at midnight UTC |
| `7d` | Every Sunday at midnight UTC |
| `30d` | 1st of every month at midnight UTC |

## Caveats

- **Team budget takes priority** over user budget when key has `team_id`. Use `max_budget_in_team` for per-member caps within a team.
- **`BudgetManager(client_type="local")` does NOT auto-reset** — manually call `reset_on_duration()` or use `client_type="hosted"` with a hosted DB.
- **Callback exceptions break the flow** — always wrap external service calls in try/except inside callbacks.
- **Use async hooks (`CustomLogger` async variants) for I/O** to avoid blocking the request.
- **Proxy-only hooks** (`async_post_call_success_hook`, `async_pre_call_hook`) do not work in SDK/library mode.
- **Budget reset scheduler defaults to 10-minute interval** — budget may be temporarily exceeded. Tighten with `proxy_budget_rescheduler_min_time: 1`.
- **`model_max_budget`** (per-model budget caps) is Enterprise-only.
- **TPM counts total tokens by default** (input + output). Set `token_rate_limit_type: "output"` or `"input"` to change.

## Composition Hints

- **SDK mode**: Use `CustomLogger` subclass for full lifecycle; use `litellm.success_callback` list for simple logging. Access `kwargs["response_cost"]` for cost.
- **Standalone budgets**: Use `BudgetManager(client_type="hosted")` for auto-resetting budgets without running the proxy.
- **Proxy mode**: Budgets are set at key generation time via `max_budget` + `budget_duration`, or via `budget_limits` for multiple windows. Rate limits (`tpm_limit`, `rpm_limit`) are also set at key/user/team creation.
- **Multiple budget windows** (`budget_limits`) allow daily + monthly caps on one key — each window resets independently.
- **End-customer tracking**: Set `max_end_user_budget` in proxy config and pass `user` in `/chat/completions` — no per-customer key needed.
- **Agent budgets**: Use `max_budget_per_session` and `max_iterations` in agent `litellm_params` for session-level caps.

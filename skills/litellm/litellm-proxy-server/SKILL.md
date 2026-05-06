---
name: litellm-proxy-server
description: LiteLLM Proxy Server — OpenAI-compatible gateway for 100+ LLMs with virtual keys, spend tracking, rate limiting, model aliases, and key rotation.
tech_stack: [litellm]
language: [python]
capability: [auth, observability, payment-reconcile]
version: "LiteLLM unversioned"
collected_at: 2025-01-01
---

# LiteLLM Proxy Server

> Source: https://docs.litellm.ai/docs/simple_proxy, https://docs.litellm.ai/docs/proxy/virtual_keys, https://docs.litellm.ai/docs/proxy/users

## Purpose

An OpenAI-compatible gateway server that sits between clients and 100+ LLM providers. It exposes `/v1/chat/completions`, `/v1/completions`, and `/v1/embeddings` endpoints while adding authentication (virtual keys), automatic spend tracking, rate limiting, budget enforcement, model aliasing, and key lifecycle management.

## When to Use

- Provide a single OpenAI-compatible endpoint for your entire organization
- Issue API keys to developers with fine-grained model access, spend limits, and rate limits
- Track LLM spend per key, user, or team automatically
- Transparently route model requests (e.g. map `gpt-3.5-turbo` → a cheaper model group)
- Integrate with tools expecting OpenAI endpoints (LibreChat, Aider, AutoGen, etc.)
- Enforce rate limits and budgets centrally without changing client code

## Basic Usage

### Minimal config.yaml

```yaml
model_list:
  - model_name: gpt-4
    litellm_params:
      model: openai/gpt-4
  - model_name: gpt-3.5-turbo
    litellm_params:
      model: openai/gpt-3.5-turbo

general_settings:
  master_key: sk-1234
  database_url: "postgresql://<user>:<password>@<host>:<port>/<dbname>"
```

### Start & Call

```bash
litellm --config /path/to/config.yaml
```

```bash
curl 'http://0.0.0.0:4000/v1/chat/completions' \
  -H 'Authorization: Bearer <virtual-key>' \
  -H 'Content-Type: application/json' \
  -d '{"model": "gpt-4", "messages": [{"role": "user", "content": "Hello"}]}'
```

### Generate a Virtual Key

```bash
curl 'http://0.0.0.0:4000/key/generate' \
  -H 'Authorization: Bearer <master-key>' \
  -H 'Content-Type: application/json' \
  -d '{"models": ["gpt-3.5-turbo", "gpt-4"], "max_budget": 10, "budget_duration": "30d"}'
```

### Use with OpenAI Python SDK

```python
import openai
client = openai.OpenAI(api_key="sk-your-virtual-key", base_url="http://0.0.0.0:4000/v1")
response = client.chat.completions.create(model="gpt-4", messages=[{"role": "user", "content": "Hello"}])
```

## Key APIs (Summary)

### Virtual Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /key/generate` | Create a virtual key with model access, budget, rate limits, aliases |
| `GET /key/info?key=<key>` | Get key details including current spend |
| `POST /key/block` | Disable a key |
| `POST /key/unblock` | Re-enable a key |
| `POST /key/update` | Modify key params (budget, models, rotation) |
| `POST /key/<key>/regenerate` | Rotate key (Enterprise) |

### Key Generation Parameters

| Param | Description |
|-------|-------------|
| `models` | List of allowed model names |
| `max_budget` | Spend cap (float, USD) |
| `budget_duration` | Reset period: `"30s"`, `"30m"`, `"30h"`, `"30d"` |
| `budget_limits` | Multiple budget windows: `[{"budget_duration": "24h", "max_budget": 10}, ...]` |
| `tpm_limit` / `rpm_limit` | Tokens/requests per minute |
| `max_parallel_requests` | Max concurrent requests |
| `duration` | Key expiry: `"30d"`, `"1h"`, etc. |
| `aliases` | Model name mappings: `{"gpt-3.5-turbo": "my-cheap-model"}` |
| `user_id` | Link key to an internal user |
| `team_id` | Link key to a team |
| `metadata` | Arbitrary JSON metadata |
| `auto_rotate` / `rotation_interval` | Scheduled key rotation (Enterprise) |

### Model Aliases

Map client-requested model names to different model groups at the key level:

```yaml
# In config.yaml — define model groups with the same model_name
model_list:
  - model_name: my-free-tier
    litellm_params:
      model: huggingface/HuggingFaceH4/zephyr-7b-beta
      api_base: http://0.0.0.0:8001
  - model_name: my-free-tier
    litellm_params:
      model: huggingface/HuggingFaceH4/zephyr-7b-beta
      api_base: http://0.0.0.0:8002
```

```bash
# Key with alias: client says "gpt-3.5-turbo" → proxy routes to "my-free-tier"
curl 'http://0.0.0.0:4000/key/generate' \
  -H 'Authorization: Bearer <master-key>' \
  -H 'Content-Type: application/json' \
  -d '{"models": ["my-free-tier"], "aliases": {"gpt-3.5-turbo": "my-free-tier"}}'
```

### Custom Key Header

Pass the virtual key in a custom header instead of `Authorization`:

```yaml
general_settings:
  litellm_key_header_name: "X-Litellm-Key"
```

### Custom Key Generation Logic

```python
# custom_auth.py
async def custom_generate_key_fn(data: GenerateKeyRequest) -> dict:
    team_id = data.json().get("team_id")
    if team_id == "litellm-core-infra@gmail.com":
        return {"decision": True}
    return {"decision": False, "message": "No valid team id provided."}
```

```yaml
general_settings:
  custom_key_generate: custom_auth.custom_generate_key_fn
```

### Key Rotation

**Manual** (Enterprise): `POST /key/sk-1234/regenerate` with optional `grace_period` (`"24h"`, `"2d"`, `"1w"`) to keep old key valid during cutover.

**Scheduled Auto-Rotation**: Set `auto_rotate: true` + `rotation_interval: "30d"` when creating a key. Enable with env vars:
```bash
export LITELLM_KEY_ROTATION_ENABLED=true
export LITELLM_KEY_ROTATION_CHECK_INTERVAL_SECONDS=3600
export LITELLM_KEY_ROTATION_GRACE_PERIOD=48h
```

### Restricting Key Generation

```yaml
litellm_settings:
  key_generation_settings:
    team_key_generation:
      allowed_team_member_roles: ["admin"]
      required_params: ["tags"]
    personal_key_generation:
      allowed_user_roles: ["proxy_admin"]
```

### Spend Tracking

Automatically tracked per key (`LiteLLM_VerificationTokenTable`), with aggregation to user (`LiteLLM_UserTable`) and team (`LiteLLM_TeamTable`). Query via:
- `GET /key/info?key=<key>` — key spend
- `GET /user/info?user_id=<id>` — user spend
- `GET /team/info?team_id=<id>` — team spend

## Caveats

- **Requires PostgreSQL** — set `DATABASE_URL` env var or `database_url` in config.yaml.
- **Master key must start with `sk-`** — set via `general_settings:master_key` or `LITELLM_MASTER_KEY` env var.
- **Default `max_budget` is `null`** — no budget enforced unless explicitly set on key/user/team.
- **Team budget supersedes user budget** when a key has `team_id`.
- **Budget reset scheduler** defaults to 10-minute intervals; tighten with `proxy_budget_rescheduler_min_time: 1` for real-time enforcement.
- **Key rotation** (`auto_rotate`, `/key/.../regenerate`) and **`model_max_budget`** are Enterprise-only features.
- **Custom key generation function** must be async, accept `GenerateKeyRequest`, return `{"decision": bool, "message": str}`.
- **Rate limit resolution**: Key metadata > Key `model_max_budget` > Team metadata.

## Composition Hints

- **Startup**: Always pair `config.yaml` with a PostgreSQL database. Use `litellm --config` CLI or the Dockerfile.database variant.
- **Key strategy**: Create internal users first (`/user/new`), then generate keys linked to them (`/key/generate` with `user_id`). For shared access, create teams (`/team/new`) and link keys to teams.
- **Model aliases**: Define model groups in `model_list` with duplicate `model_name` entries (for load balancing). Then set `aliases` on keys to map client-facing names to internal groups.
- **Custom header**: Use `litellm_key_header_name` when the proxy sits behind an API gateway that uses `Authorization` for its own auth.
- **Upperbound params**: Use `upperbound_key_generate_params` to prevent anyone from creating keys with budgets above a safe ceiling.
- **Global proxy budget**: Set `max_budget: 0` in `litellm_settings` to block all calls (useful as an emergency kill switch).

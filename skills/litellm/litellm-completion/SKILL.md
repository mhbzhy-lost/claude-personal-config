---
name: litellm-completion
description: Unified completion() API for calling 100+ LLM providers with OpenAI-compatible params and response format.
tech_stack: [litellm]
language: [python]
capability: [llm-client, tool-calling]
version: "litellm unversioned"
collected_at: 2025-07-16
---

# LiteLLM Completion API

> Source: https://docs.litellm.ai/docs/completion/input, https://docs.litellm.ai/docs/completion/output, https://docs.litellm.ai/docs/

## Purpose

`litellm.completion()` is the single entry point for chat completions across 100+ LLM providers. It accepts OpenAI Chat Completion params, translates them per-provider, and returns a `ModelResponse` matching the OpenAI format — regardless of the underlying provider.

## When to Use

- Any call to an LLM that should be provider-agnostic (`openai/`, `anthropic/`, `vertex_ai/`, `bedrock/`, `ollama/`, `azure/`, etc.)
- Building apps that swap models without code changes
- Multi-modal requests (text + image + audio + video + documents) across providers
- You need OpenAI-compatible exception types (`AuthenticationError`, `RateLimitError`, `APIError`) from non-OpenAI backends

## Basic Usage

```python
from litellm import completion
import os

os.environ["OPENAI_API_KEY"] = "sk-..."

# Any provider — same call signature
response = completion(
    model="openai/gpt-4o",                     # provider/model-name
    messages=[{"role": "user", "content": "Hello"}],
    max_tokens=100,
    temperature=0.7,
)
print(response.choices[0].message.content)     # OpenAI-compatible access
```

### Provider Prefix Convention

| Prefix | Provider | Env Vars Required |
|--------|----------|--------------------|
| `openai/` | OpenAI | `OPENAI_API_KEY` |
| `anthropic/` | Anthropic | `ANTHROPIC_API_KEY` |
| `vertex_ai/` | Google Vertex AI | `VERTEXAI_PROJECT`, `VERTEXAI_LOCATION` |
| `bedrock/` | AWS Bedrock | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION_NAME` |
| `ollama/` | Ollama (local) | (none; pass `api_base`) |
| `azure/` | Azure OpenAI | `AZURE_API_KEY`, `AZURE_API_BASE`, `AZURE_API_VERSION` |
| No prefix | OpenAI (default) | `OPENAI_API_KEY` |

### Streaming

```python
for chunk in completion(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Write a poem"}],
    stream=True,
):
    print(chunk.choices[0].delta.content or "", end="")
```

Add `stream_options={"include_usage": True}` to receive a final chunk with token usage before `[DONE]`.

### Multimodal Messages

```python
messages = [{
    "role": "user",
    "content": [
        {"type": "text", "text": "Describe this image"},
        {"type": "image_url", "image_url": {"url": "https://example.com/cat.jpg"}},
    ]
}]
```

Also supports `input_audio`, `video_url`, `file`, and `document` content types.

### Exception Handling

```python
import litellm

try:
    litellm.completion(model="anthropic/claude-instant-1", messages=[...])
except litellm.AuthenticationError as e:
    print(f"Bad API key: {e}")
except litellm.RateLimitError as e:
    print(f"Rate limited: {e}")
except litellm.APIError as e:
    print(f"API error: {e}")
```

## Key APIs (Summary)

### `litellm.completion()` — Essential Params

| Param | Type | Notes |
|-------|------|-------|
| `model` | str | **Required.** `"provider/model"` or bare model name |
| `messages` | List[dict] | **Required.** `role` + `content` (string or multimodal blocks) |
| `temperature` | float | 0–2 |
| `max_tokens` | int | Prefer over `max_completion_tokens` for broad compatibility |
| `stream` | bool | Token-by-token streaming |
| `tools` | List[dict] | Function/tool definitions |
| `tool_choice` | str/dict | `"none"`, `"auto"`, or specific function |
| `response_format` | dict | `{"type": "json_object"}` for JSON mode |
| `timeout` | int | Seconds (default: 600) |

### LiteLLM-Specific Params

| Param | Purpose |
|-------|---------|
| `base_url` | Override API endpoint |
| `api_key` | Override env API key per call |
| `api_version` | Azure API version |
| `num_retries` | Retries on transient errors |
| `fallbacks` | List of fallback model names+params |
| `drop_params` | Silently drop unsupported OpenAI params instead of raising |
| `metadata` | Passed to logging/callback integrations |

### `get_supported_openai_params()`

```python
from litellm import get_supported_openai_params
params = get_supported_openai_params(model="anthropic.claude-3", custom_llm_provider="bedrock")
# → ["max_tokens", "tools", "tool_choice", "stream"]
```

### `ModelResponse` Output

```python
response.choices[0].message.content    # assistant text
response.choices[0].finish_reason      # 'stop', 'length', 'tool_calls', 'content_filter'
response.usage.total_tokens            # token count
response.response_ms                   # latency in ms
```

**Native finish reason**: When a provider's finish reason is mapped, the original is in `response.choices[0].provider_specific_fields["native_finish_reason"]`.

## Caveats

- **Unsupported params raise by default.** Set `litellm.drop_params = True` or `drop_params=True` per call to silently drop them.
- **Stop sequences capped at 4** (OpenAI limit). Override with `litellm.disable_stop_sequence_limit = True`.
- **`functions`/`function_call` are deprecated.** Use `tools`/`tool_choice`.
- **JSON mode requires a prompt instruction.** Just setting `response_format={"type": "json_object"}` is insufficient — add a system/user message asking for JSON.
- **Prefer `max_tokens` over `max_completion_tokens`** for cross-provider compatibility.
- **Unrecognized kwargs pass through** to the provider as-is. This can silently break if you typo a param name.

## Composition Hints

- **For production resilience**: Wrap `completion()` with `Router` (see `litellm-routing-fallback`) for load balancing, retries, and fallbacks.
- **For cost savings**: Pair with `litellm-caching` to avoid duplicate API calls.
- **For observability**: Set `litellm.success_callback` / `litellm.failure_callback` and use `metadata` to tag requests.
- **For tool calling**: Use `tools` + `tool_choice` params; check provider support with `get_supported_openai_params()`.

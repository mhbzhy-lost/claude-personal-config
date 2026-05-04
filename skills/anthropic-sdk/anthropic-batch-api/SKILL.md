---
name: anthropic-batch-api
description: Process large volumes of Claude API requests asynchronously with 50% cost reduction using Message Batches.
tech_stack: [backend]
language: [python]
capability: [llm-client, task-scheduler]
version: "Anthropic API (beta: client.beta.messages.batches)"
collected_at: 2025-07-17
---

# Batch API (Message Batches)

> Source: https://platform.claude.com/docs/en/build-with-claude/batch-processing, https://platform.claude.com/cookbook/misc-batch-processing, https://platform.claude.com/docs/en/api/messages/batches

## Purpose

Message Batches process large volumes of independent Messages API requests asynchronously at **50% of the real-time price**. Each batch request uses the same `params` structure as `messages.create()` — you can mix text, image, system-prompt, and multi-turn requests in a single batch.

## When to Use

- Bulk evaluation / benchmark runs across many prompts
- Offline data processing: classification, summarization, extraction at scale
- Cost-sensitive workloads where latency is not critical
- Processing large document corpora overnight
- Any scenario with many independent requests where you can wait for results

**Do NOT use for:**
- Interactive / real-time chat (use `messages.create` directly)
- Requests that depend on outputs from other requests in the same batch
- Sub-second latency requirements

## Basic Usage

### Submit a batch

```python
import anthropic

client = anthropic.Anthropic()

batch_requests = [
    {
        "custom_id": f"question-{i}",
        "params": {
            "model": "claude-sonnet-4-6",
            "max_tokens": 1024,
            "messages": [{"role": "user", "content": question}],
        },
    }
    for i, question in enumerate(questions)
]

response = client.beta.messages.batches.create(requests=batch_requests)
batch_id = response.id
print(response.processing_status)  # "in_progress"
```

### Poll until complete

```python
import time

def monitor_batch(batch_id, polling_interval=5):
    while True:
        batch = client.beta.messages.batches.retrieve(batch_id)
        if batch.processing_status == "ended":
            return batch
        time.sleep(polling_interval)

batch_result = monitor_batch(batch_id)
print(f"Succeeded: {batch_result.request_counts.succeeded}")
print(f"Errored:   {batch_result.request_counts.errored}")
print(f"Expired:   {batch_result.request_counts.expired}")
```

### Retrieve results

```python
for result in client.beta.messages.batches.results(batch_id):
    if result.result.type == "succeeded":
        text = result.result.message.content[0].text
        print(f"{result.custom_id}: {text[:200]}...")
    elif result.result.type == "errored":
        print(f"{result.custom_id}: ERROR")
    elif result.result.type == "canceled":
        print(f"{result.custom_id}: CANCELED")
    elif result.result.type == "expired":
        print(f"{result.custom_id}: EXPIRED")
```

### Mixed request types in one batch

Each request's `params` accepts the full `messages.create()` signature — system prompts, images, multi-turn conversations can all coexist:

```python
batch_requests = [
    {
        "custom_id": "simple",
        "params": {
            "model": "claude-sonnet-4-6",
            "max_tokens": 1024,
            "messages": [{"role": "user", "content": "What is quantum computing?"}],
        },
    },
    {
        "custom_id": "with-image",
        "params": {
            "model": "claude-sonnet-4-6",
            "max_tokens": 1024,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64_data}},
                    {"type": "text", "text": "Describe this image."},
                ],
            }],
        },
    },
    {
        "custom_id": "with-system",
        "params": {
            "model": "claude-sonnet-4-6",
            "max_tokens": 1024,
            "system": "You are a helpful science teacher.",
            "messages": [{"role": "user", "content": "Explain gravity to a 5yo."}],
        },
    },
    {
        "custom_id": "multi-turn",
        "params": {
            "model": "claude-sonnet-4-6",
            "max_tokens": 1024,
            "messages": [
                {"role": "user", "content": "What is DNA?"},
                {"role": "assistant", "content": "DNA is like a blueprint..."},
                {"role": "user", "content": "How is DNA copied?"},
            ],
        },
    },
]

client.beta.messages.batches.create(requests=batch_requests)
```

## Key APIs (Summary)

| Endpoint | Purpose |
|----------|---------|
| `client.beta.messages.batches.create(requests=[])` | Submit a batch; returns batch with `id` and `processing_status` |
| `client.beta.messages.batches.retrieve(batch_id)` | Poll batch status; key fields: `processing_status`, `request_counts`, `results_url` |
| `client.beta.messages.batches.results(batch_id)` | Iterate individual results; each has `custom_id` and `result.type` |

**Batch response fields:**

| Field | Description |
|-------|-------------|
| `id` | `msgbatch_01...` identifier |
| `processing_status` | `"in_progress"` → `"ended"` |
| `request_counts.succeeded` | Successful completions |
| `request_counts.errored` | Failed requests |
| `request_counts.expired` | Expired before processing |
| `request_counts.canceled` | Explicitly canceled |
| `results_url` | URL for downloading results (populated when `ended`) |
| `expires_at` | 24 hours after creation |

**Per-result types:**

| `result.type` | Access pattern |
|---------------|---------------|
| `"succeeded"` | `result.result.message.content[0].text` |
| `"errored"` | Request failed — check error details |
| `"canceled"` | Request was canceled |
| `"expired"` | Batch expired before this request ran |

## Caveats

- **Beta API**: Lives under `client.beta.messages.batches` — may change before GA.
- **24-hour expiration**: Uncompleted batches expire after 24 hours. Plan workloads to finish within this window.
- **No execution order guarantee**: Requests within a batch complete independently and in any order. Never rely on sequential processing.
- **Independent requests only**: Each request must be fully self-contained. You cannot pipe one request's output as another's input within the same batch.
- **Per-request billing**: You are billed for every request at 50% of real-time price, regardless of whether you retrieve results.
- **Retrieve results promptly**: Results are available for a limited window after batch completion. Store them immediately.
- **Graceful per-request errors**: One failing request does not fail the whole batch. Always inspect `result.result.type` per result.
- **Separate rate limits**: Batch API rate limits are independent of the real-time Messages API. Large batches may queue.
- **Batch + Prompt Caching stack**: The 50% batch discount stacks with prompt caching's 0.1x cache-read pricing for additional savings.

## Composition Hints

- **With Prompt Caching**: Use `cache_control` inside batch request `params` to stack cache-read discounts on top of the 50% batch discount for repetitive long-context tasks.
- **With Tool Use**: Include tool definitions in batch request `params` — same structure as real-time `messages.create()`.
- **Large evaluation pipelines**: Distribute hundreds of test prompts across multiple batches. Use `custom_id` to map results back to input rows.
- **Polling strategy**: Use 5-10 second polling intervals. For very large batches, implement exponential backoff or use a webhook/callback pattern triggered by `processing_status == "ended"`.

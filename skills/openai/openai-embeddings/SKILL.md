---
name: openai-embeddings
description: Generate text embedding vectors via OpenAI's embeddings API with dimension control, batch input, and base64 encoding.
tech_stack: [openai]
language: [python]
capability: [llm-client, rag]
version: "openai-python unversioned"
collected_at: 2026-01-12
---

# OpenAI Embeddings

> Source: https://developers.openai.com/api/reference/python, https://deepwiki.com/openai/openai-python/4.5-embeddings-and-vector-stores

## Purpose

Convert text into high-dimensional vector representations (`list[float]`) that capture semantic meaning. These vectors enable semantic search, clustering, and retrieval-augmented generation (RAG). The `dimensions` parameter allows truncating vectors for storage efficiency.

## When to Use

- Semantic search: embed queries and documents, compare with cosine similarity
- RAG pipelines: embed knowledge base chunks, retrieve the top-k before generation
- Clustering / deduplication: embed texts and group by vector proximity
- Generating fixed-size feature vectors for downstream ML
- Reducing vector DB storage costs by truncating dimensions (e.g., 3072 → 512)

## Basic Usage

### Single text embedding

```python
from openai import OpenAI

client = OpenAI()

response = client.embeddings.create(
    model="text-embedding-3-small",
    input="The quick brown fox jumps over the lazy dog.",
)

vec = response.data[0].embedding  # list[float], length 1536
print(response.usage.total_tokens)  # token count for billing
```

### Batch multiple inputs

```python
texts = ["First document.", "Second document.", "Third document."]

response = client.embeddings.create(
    model="text-embedding-3-small",
    input=texts,  # up to 2048 inputs per request
)

# Results ordered by input index
for item in response.data:
    print(f"Index {item.index}: {len(item.embedding)} dims")
```

### Reduce dimensions (storage optimization)

```python
# text-embedding-3-large: default 3072 dims → request 256
response = client.embeddings.create(
    model="text-embedding-3-large",
    input="Some text",
    dimensions=256,  # only works with text-embedding-3-* models
)
print(len(response.data[0].embedding))  # 256
```

### Base64 encoding (compact transfer)

```python
response = client.embeddings.create(
    model="text-embedding-3-small",
    input="Encode me",
    encoding_format="base64",
)

import base64, numpy as np
b64 = response.data[0].embedding  # base64 string, not list[float]
vec = np.frombuffer(base64.b64decode(b64), dtype=np.float32)
```

### Async

```python
from openai import AsyncOpenAI

client = AsyncOpenAI()
response = await client.embeddings.create(
    model="text-embedding-3-small",
    input=["text one", "text two"],
)
```

## Key APIs (Summary)

| API | Notes |
|---|---|
| `client.embeddings.create(model, input)` | Core method. `input` is `str`, `list[str]`, `list[int]`, or `list[list[int]]` |
| `response.data[0].embedding` | The embedding vector (`list[float]` or base64 `str`) |
| `response.data[0].index` | Position in input array |
| `response.usage.total_tokens` | Total tokens processed (for cost tracking) |
| `response.model` | Model identifier used |

### Models

| Model | Default Dims | Notes |
|---|---|---|
| `text-embedding-3-small` | 1536 | Cost-efficient, good quality |
| `text-embedding-3-large` | 3072 | Best semantic capture |
| `text-embedding-ada-002` | 1536 | Legacy; `dimensions` param NOT supported |

## Caveats

- **`dimensions` only on `text-embedding-3-*`**: `text-embedding-ada-002` does not support the `dimensions` parameter — it always returns 1536.
- **Dimensions can only shrink, not grow**: Requesting `dimensions=4096` on a 3072-dim model will error.
- **Token limits**: Each input string has a model-specific token limit. Exceeding it raises an error. Split long documents into chunks before embedding.
- **Batch ≠ cheaper**: Batch embedding reduces round-trips, NOT per-token cost. You're billed the same total tokens whether you send 1 request with 100 inputs or 100 requests with 1 input.
- **Cross-provider availability is inconsistent**: `text-embedding-3-*` models are OpenAI-exclusive. When using DeepSeek/Qwen/Zhipu via `base_url`, embedding model names and capabilities differ. Many alternative providers lack embedding endpoints entirely — check provider docs.
- **Float vs base64**: `float` (default) returns Python lists — convenient but larger payload. `base64` is compact for network transfer but requires `base64.b64decode` + `np.frombuffer` to use.

## Composition Hints

- **RAG pipeline**: Embed documents → store in vector DB → embed user query → retrieve top-k by cosine similarity → inject into chat completion as context.
- **Cosine similarity**: `np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))` — standard metric for embedding comparison.
- **With async**: Use `AsyncOpenAI` + `asyncio.gather()` to embed many documents concurrently. For extreme throughput, optionally switch to `aiohttp` backend via `DefaultAioHttpClient()`.
- **Cost tracking**: Always log `response.usage.total_tokens` in production — embeddings can be a significant cost center at scale.
- **Chunking before embedding**: For documents larger than the token limit, split on paragraph/sentence boundaries. Typical chunk sizes: 256–512 tokens with some overlap.

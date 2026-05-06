---
name: openai-vision
description: Send images to vision-capable models (GPT-4o) via Chat Completions API using image_url content blocks, with base64 encoding, detail control, multi-image, and cross-provider support.
tech_stack: [openai]
language: [python]
capability: [llm-client, media-processing]
version: "OpenAI Python SDK unversioned"
collected_at: 2025-07-17
---

# OpenAI Vision

> Source: https://developers.openai.com/api/reference/python, https://github.com/openai/openai-python/blob/main/README.md?plain=1, https://api-docs.deepseek.com/

## Purpose

Send images alongside text to vision-capable OpenAI models (gpt-4o, gpt-4o-mini, gpt-4-turbo) and OpenAI-compatible providers (DeepSeek, Qwen-VL, Zhipu GLM-4V). Images are passed as `image_url` content blocks within the messages array — either as HTTP URLs or base64-encoded data URIs.

## When to Use

- Analyzing photos, screenshots, documents, charts, diagrams
- OCR — extracting text from images
- Visual Q&A and image classification
- Comparing multiple images in one request
- Combining vision with tool calling (classify → route)
- Cross-provider vision: DeepSeek-VL, Qwen-VL, GLM-4V via OpenAI-compatible endpoints

## Basic Usage

```python
from openai import OpenAI
client = OpenAI()

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "What's in this image?"},
            {
                "type": "image_url",
                "image_url": {
                    "url": "https://example.com/photo.jpg",
                    "detail": "auto"
                }
            }
        ]
    }]
)
print(response.choices[0].message.content)
```

### Base64 from local files

```python
import base64

with open("screenshot.png", "rb") as f:
    b64 = base64.b64encode(f.read()).decode("utf-8")

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "Extract text from this screenshot."},
            {"type": "image_url", "image_url": {
                "url": f"data:image/png;base64,{b64}"
            }}
        ]
    }]
)
```

### Base64 helper

```python
def encode_image(path: str) -> str:
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    ext = path.rsplit(".", 1)[-1].lower()
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "webp": "image/webp", "gif": "image/gif"}.get(ext, "image/png")
    return f"data:{mime};base64,{b64}"
```

### Multiple images

```python
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "Compare these two designs."},
            {"type": "image_url", "image_url": {"url": "https://example.com/a.png"}},
            {"type": "image_url", "image_url": {"url": "https://example.com/b.png"}}
        ]
    }]
)
```

### Streaming with vision

```python
stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "Describe this image."},
            {"type": "image_url", "image_url": {"url": "https://example.com/img.jpg"}}
        ]
    }],
    stream=True
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### Vision + tool calling

```python
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "Classify this image."},
            {"type": "image_url", "image_url": {"url": "https://example.com/img.jpg"}}
        ]
    }],
    tools=[{
        "type": "function",
        "function": {
            "name": "classify_image",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "enum": ["person", "animal", "object", "scene"]}
                },
                "required": ["category"]
            }
        }
    }],
    tool_choice="auto"
)
```

### Async

```python
from openai import AsyncOpenAI

async def analyze():
    client = AsyncOpenAI()
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": "Describe this."},
                {"type": "image_url", "image_url": {"url": "https://example.com/img.jpg"}}
            ]
        }]
    )
    return response.choices[0].message.content
```

## Key APIs (Summary)

- **`image_url` content block**: `{"type": "image_url", "image_url": {"url": "<url-or-data-uri>", "detail": "auto|low|high"}}`
- **`detail` parameter**: `"auto"` (default, model decides), `"low"` (85 tokens, 512px), `"high"` (detailed crops, ~765 tokens for 1024×1024)
- **Supported formats**: PNG, JPEG, WebP (gpt-4o+), non-animated GIF
- **Vision models**: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo` (OpenAI); `deepseek-v4-flash`, `deepseek-v4-pro` (DeepSeek); `qwen-vl-plus`, `qwen-vl-max` (Qwen); `glm-4v` (Zhipu)

### Cross-provider one-liner (DeepSeek)

```python
client = OpenAI(api_key="deepseek-key", base_url="https://api.deepseek.com")
# chat.completions.create() works identically — same image_url format
```

### Responses API (newer alternative)

The Responses API uses `type: "input_image"` with `image_url` as a plain string:

```python
response = client.responses.create(
    model="gpt-5.2",
    input=[{
        "role": "user",
        "content": [
            {"type": "input_text", "text": "What's in this image?"},
            {"type": "input_image", "image_url": "https://example.com/img.jpg"}
        ]
    }]
)
```

## Caveats

- **Token cost scales with detail**: `detail: "low"` = flat 85 tokens. `detail: "high"` scales with image dimensions — prefer `"low"` unless fine detail is needed.
- **Model gating**: gpt-3.5-turbo and older models reject image inputs. Always use a vision-capable model.
- **Base64 inflation**: base64 encoding adds ~33% payload size. For large images, prefer URL passthrough.
- **WebP cross-provider risk**: gpt-4o supports WebP; DeepSeek and Qwen-VL may not. Verify per-provider.
- **Streaming caveat**: Image token cost is billed upfront regardless of streaming. Streaming does not reduce image cost.
- **Image order**: The model processes images in content-array order. Rearrange if the model attends to the wrong image.
- **20MB per-image limit** on gpt-4o. Resize before uploading.

## Composition Hints

- **With openai-chat-completions**: Vision is a content-block extension of chat completions — all standard parameters (temperature, max_tokens, seed) apply.
- **With openai-streaming**: Stream vision responses identically to text; delta.content arrives as usual.
- **With openai-tool-calling**: Vision + tools works seamlessly. Use for classify→route, extract→validate, or describe→store workflows.
- **With openai-async-client**: Use `AsyncOpenAI` identically for concurrent image analysis.
- **With openai-structured-outputs**: Combine `response_format` with vision for structured extraction from images (e.g., parse a receipt into a Pydantic model).

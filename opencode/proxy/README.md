# OpenCode Bailian Cache Proxy

This proxy is only for Alibaba Cloud Bailian / DashScope OpenAI-compatible chat
completions. It adds Bailian explicit context-cache markers before forwarding
requests to DashScope.

`init_opencode.sh` configures a custom OpenCode provider:

```json
{
  "provider": {
    "bailian-custom-cached": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Bailian custom cached",
      "options": {
        "baseURL": "http://127.0.0.1:48761/compatible-mode/v1",
        "apiKey": "{env:DASHSCOPE_API_KEY}"
      }
    }
  }
}
```

Other providers do not use this proxy. The proxy has a fixed upstream default:

```text
https://dashscope.aliyuncs.com/compatible-mode/v1
```

Only chat completions paths are forwarded upstream. Control endpoints under
`/__bailian_cache_proxy/*` stay local, and any other path returns `404`.

## Lifecycle

The `opencode/plugins/bailian-cache-proxy.js` plugin starts the proxy if it is
not already running and sends periodic heartbeats with the current OpenCode
process pid. The proxy exits after all registered OpenCode pids are gone and the
idle timeout elapses.

## Environment

- `DASHSCOPE_API_KEY`: Bailian API key used by OpenCode and as proxy fallback
  when the request has no `Authorization` header.
- `BAILIAN_CACHE_PROXY_PORT`: local proxy port, default `48761`.
- `BAILIAN_UPSTREAM_BASE_URL`: upstream base URL, default China DashScope
  compatible-mode endpoint.
- `BAILIAN_CACHE_PROXY_MIN_TOKENS`: minimum estimated prefix tokens before
  adding cache markers, default `1024`.
- `BAILIAN_CACHE_PROXY_MAX_LOOKBACK_BLOCKS`: Bailian content-block lookback
  window, default `20`.
- `BAILIAN_CACHE_PROXY_MAX_BODY_BYTES`: maximum accepted request body size,
  default `10485760`.
- `OPENCODE_BAILIAN_CACHE_PROXY=0`: disables plugin-managed proxy startup.

## Cache Planning

The planner strips existing `cache_control` markers and emits at most four
markers:

- one early stable marker on the first eligible system/developer prefix
- rolling tail markers so long OpenCode sessions refresh cache points near the
  latest stable conversation prefix

Bailian creates cache blocks after a response returns, so the first request may
create cache while later requests should show cache reads in `usage`.

The proxy only accepts uncompressed JSON request bodies. Requests with
`content-encoding` other than `identity` return `415`.

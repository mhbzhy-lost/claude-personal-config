# bug-bailian-proxy-content-encoding

## 现象

E2E 验证 `opencode/proxy/scripts/e2e-bailian-cache.mjs` 跑两次同 prefix 请求，断言
`usage.prompt_tokens_details.cached_tokens > 0` 时持续失败。表面表现：

- 两次响应 `status: 200`
- 解析后 `usage` 字段是空对象 `{}`
- 没有 `prompt_tokens_details`，也没有任何 token 计数

进一步 probe（一次性的 `opencode/proxy/test/probe-headers.mjs`，
本次修复合并前已删除）发现真正的现象是 **响应体根本没成功送到 client**：

```
TypeError: terminated
  [cause]: Error: incorrect header check (Z_DATA_ERROR)
  at Gunzip... (node:zlib)
```

也就是说 200 是 status line 提前收到，但 body 流在解码阶段 abort，
fetch 在 `await response.json()` 时拿到 `_parse_error` 兜底为
`{ _parse_error: ... }`，因此 `body.usage` 是 undefined，summary 把它转成 `{}`。

## 调用链

E2E 脚本 → 本地 proxy `127.0.0.1:<ephemeral>/compatible-mode/v1/chat/completions`
→ proxy `server.mjs` → fetch upstream `https://token-plan...maas.aliyuncs.com/...`
→ upstream 返回 `content-encoding: gzip; transfer-encoding: chunked`，body 是 gzip 字节
→ undici fetch **自动解压** upstream body（这是 undici 默认行为）
→ proxy `headersToObject(upstreamResponse.headers)` 把所有 upstream 响应头
（包括 `content-encoding: gzip`）原样写回 client
→ proxy `pipeline(Readable.fromWeb(upstreamResponse.body), response)` 把
**已解压的明文 JSON 字节**写回 client
→ client 看到 `content-encoding: gzip`，对明文 JSON 调 `gunzip`，`Z_DATA_ERROR`，
   流 abort，`fetch().json()` reject

## 根因假设

1. **proxy 响应头透传策略错**：把 `content-encoding`、`content-length`、
   `transfer-encoding`、`connection` 等"传输/编码层"头原样转给 client，但 fetch
   已经在 proxy 侧解压并重新走 chunked，client 收到的 body 与这些头不匹配。
2. upstream 返回的某些字段不是 JSON（被排除：probe 直接打 upstream 解码后是合法
   JSON，size 318 bytes）。
3. proxy `pipeline` 写流时本身就出错（被排除：probe 看到 status + 完整响应头都
   到了 client，证明流前段是通的）。

假设 1 与现象 100% 吻合，2、3 已被 probe 数据排除。

## 验证方式

`opencode/proxy/test/probe-headers.mjs` 已经验证：

- 直接打 upstream（不走 proxy）：fetch 拿到 `content-encoding: gzip`，自动解压，
  body 318 字节明文 JSON，`response.json()` 成功
- 打 proxy：响应头里依然有 `content-encoding: gzip`，但 body 是 proxy 已解压
  后的明文 JSON 字节流，client 解码失败 `Z_DATA_ERROR`

## 根因确认

`opencode/proxy/src/server.mjs` `headersToObject(upstreamResponse.headers)`
在写回 client 时未剥离 transport-level 头。问题与缓存逻辑、cache_control 字段、
provider 配置完全无关——是 reverse proxy 的"忘剥编码头"经典坑。

## 影响范围

- **所有 OpenCode → bailian-cache-proxy 实际请求**：dashscope 默认就走 gzip，
  生产路径 100% 命中本 bug。意味着接入本 proxy 后 OpenCode 的 LLM 调用
  全部坏掉——但因为单测用 mock upstream（mock 不返回 gzip 头），单测全过；
  没有 e2e 之前没人发现。
- **任何 upstream 用 gzip / br / deflate 响应**的请求都受影响。
- 同样的逻辑漏洞在响应侧 `transfer-encoding`、`connection`、`keep-alive` 头透传，
  虽然 Node http 服务器一般会覆盖这些，但是显式透传仍是错的，可能在 HTTP/1.1
  连接复用时引入诡异行为。
- proxy 现在的请求侧 (`forwardHeaders`) 已经有 `HOP_BY_HOP_HEADERS` 集合
  + `content-encoding`/`content-length` 跳过——响应侧应该镜像同样的处理。

## 修复方案

`server.mjs` 添加 `responseHeadersToObject(headers)`，在写回 client 前剥离：

- `content-encoding`（fetch 已解压）
- `content-length`（已解压后字节数变了，让 Node http 自动 chunked）
- `transfer-encoding`（让 Node http 自己决定）
- 所有 `HOP_BY_HOP_HEADERS`：`connection / keep-alive / proxy-authenticate /
  proxy-authorization / te / trailer / upgrade`

修复**不引入新失败模式**的论证：

- 解压后字节数变了，原 `content-length` 必错；剥离后 Node 走 chunked，client
  按 chunked 接，无歧义。
- hop-by-hop 头按 RFC 7230 §6.1 本就**不应**跨代理转发。
- `vary`、`x-request-id` 等业务头保持透传，回放/排错信息不丢。

补一条 server.test.mjs 单测：mock upstream 返回 `content-encoding: gzip` +
明文 body，断言 client 收到的响应不包含 `content-encoding` 头且 `await
response.json()` 能成功。

## 修复后验证

- 重跑 `opencode/proxy/scripts/e2e-bailian-cache.mjs`：
  - 两次响应都能解析 usage
  - 第二次 `usage.prompt_tokens_details.cached_tokens > 0`
  - 第一次 `cache_creation_input_tokens > 0`（若 5 分钟内已 prior 命中则可能为 0，
    此时 cached_tokens 持续 > 0 即可视为通过）
- 全量 `npm test` 不能引入回归
- 删掉临时 probe 脚本 `test/probe-headers.mjs`

## 修复后验证结果（2026-05-23）

- `npm test`: 15 pass / 0 fail（含新增 strips transport-level response headers 单测）
- e2e: `cached_tokens=1428 / prompt_tokens=1436`，命中率 99.4%；`cache_type:
  "ephemeral"` 字段被 dashscope 回显，证明 marker 协议正确

## 附记

E2E 验证暴露的真实问题不止 1 个，按发现顺序：

1. **(已修)** 模型名 `qwen-turbo` 在 token-plan 端点不存在，应换 `qwen3.6-flash`
2. **(本 bug)** 响应头透传 bug 导致 body 解码失败
3. **(衍生设计问题)** init_opencode.sh 第 346-353 行的 7 个硬编码 `qwen-plus / max / turbo / coder-*` 模型名在 token-plan 端点全部不存在；当前 provider 配置实际无法工作。但这是配置维护问题，不在本 bug 修复范围。

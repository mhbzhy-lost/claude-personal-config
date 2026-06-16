# bug-streaming-error-body-unread.md

## 1. 症状
BailianProvider 流式请求返回 401/400 时，healthcheck 调用方访问 `exc.response.text` 抛 `ResponseNotRead`。
根因：streaming context 内 `raise_for_status()` 时 response body 尚未 read，httpx 拒绝访问 `.text`。

## 2. 影响
流式 provider 出错时无法提取错误 body，healthcheck/调用方只看到 HTTPStatusError 无 body，
调试困难（尤其百炼 API 常在 body 返回具体错误码如 InvalidApiKey）。

## 3. 根因
`BailianProvider.send_chat` 在 streaming context 内直接调 `response.raise_for_status()`，
若 status >= 400 则抛 HTTPStatusError，但此时 response body 未被 read，httpx 锁定 `.text` 访问。

## 4. 修复方案
在 raise_for_status 之前显式 `await response.aread()` — 先读 body 再抛错，
调用方即可正常 `exc.response.text` 获取错误详情。

## 5. 验证方式
- 单元测试：mock stream 返回 401 status，确认 raise_for_status 后 response.text 可读
- 集成：healthcheck 跑 3 provider，确认每个都输出具体错误 body 而非 ResponseNotRead

## 6. 后续
（无）

# OpenCode Qwen context alias 缺少 limit.output 导致闪退

## 现象

用户启动 OpenCode 后 TUI 闪退。用非沙箱环境复现：

```bash
opencode models openai-bailiab-api --print-logs --log-level DEBUG
```

OpenCode 报 `Configuration is invalid at /Users/leshi.zhy/.config/opencode/opencode.json`，
缺少四个 `limit.output`：

- `provider.openai-bailiab-api.models.qwen3.7-max-512k.limit.output`
- `provider.openai-bailiab-api.models.qwen3.7-max-1m.limit.output`
- `provider.openai-bailian-token-plan.models.qwen3.7-max-512k.limit.output`
- `provider.openai-bailian-token-plan.models.qwen3.7-max-1m.limit.output`

## 根因分析 6 要素

1. **触发条件**：运行 `bailian-cache-proxy-configure.mjs opencode` 后，实际
   `~/.config/opencode/opencode.json` 新增了 `qwen3.7-max-512k` 和
   `qwen3.7-max-1m`，但它们的 `limit` 只包含 `context`。
2. **错误表现**：OpenCode 1.15.13 启动时读取配置并做 schema 校验，发现
   `limit.output` 缺失后抛出 `ConfigInvalidError`，TUI bootstrap 失败。
3. **错误边界**：请求尚未进入 cache proxy，也未触达百炼；失败发生在 OpenCode
   本地配置加载阶段。
4. **根因假设验证**：非沙箱执行 `opencode debug config --print-logs --log-level DEBUG`
   与 `opencode models ...` 均稳定报同一组 `Missing key ... limit.output`。
5. **实现偏差**：前一轮只参考了“限制 context”的业务目标，把 `limit.context`
   当成可单独配置字段；但 OpenCode 当前 schema 要求 `limit` 对象同时提供
   `context` 和 `output`。
6. **影响范围**：所有由本仓生成的 Qwen3.7 Max context-size OpenCode alias
   都会写出非法配置；只影响 OpenCode provider 配置加载，不影响 proxy 的
   `qwen3.7-max-* -> qwen3.7-max` 上游模型改写语义。

## 修复方案

- 生成 `qwen3.7-max-512k` / `qwen3.7-max-1m` 时同时写入
  `limit.output: 65536`。
- 同步测试和 README，避免以后再次生成缺字段配置。
- 重新运行 configurator 写回 `~/.config/opencode/opencode.json`。

## 验证方式

- RED：`proxy/test/client-config.test.mjs` 先断言 context alias 必须包含
  `limit.output: 65536`，修复前失败。
- GREEN：目标单测通过。
- 本机验证：`opencode debug config` 或 `opencode models openai-bailiab-api`
  不再报配置缺失。

## 修复记录

- `QWEN_OPEN_CODE_MODELS` 中 `qwen3.7-max-512k` / `qwen3.7-max-1m`
  的 `limit` 已补齐 `output: 65536`。
- README 中 context alias 示例同步补齐 `limit.output`。
- 已重新运行 configurator，实际 `~/.config/opencode/opencode.json` 中两组
  provider 的 alias 都包含 `context` 和 `output`。
- 子模块修复已提交并推送：`vendor/opencode-cache-proxy` commit `3f49010`
  (`feat(opencode): 增加 Qwen 3.7 Max 上下文别名`)。
- 子模块验证锚点：`cd vendor/opencode-cache-proxy/proxy && npm test`
  通过，`opencode models openai-bailiab-api` 可列出 `qwen3.7-max-512k`
  与 `qwen3.7-max-1m`。

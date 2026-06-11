# Bug: OpenCode 使用 Idealab dogfooding AK 返回 PLATFORM_RUN_ERROR

## 现象

将 `~/.oc-cc/bin/get_idealab_ak` 返回的 `ak` 写入 OpenCode provider
`openai-idealab` 后，重启 OpenCode 调用 `openai-idealab/qwen3.7-max` 报错：

```text
{"success":false,"message":"平台运行错误","data":null,"code":"PLATFORM_RUN_ERROR",...}
```

## 根因分析 6 要素

1. **触发条件**：OpenCode 使用 provider `openai-idealab`，baseURL 为
   `https://idealab.alibaba-inc.com/api/openai/v1`，模型为裸 `qwen3.7-max`，AK 来自
   `get_idealab_ak` 返回的 dogfooding key。
2. **期望链路**：OpenCode 从 auth storage 读取 provider key，以 OpenAI-compatible
   请求调用 `/chat/completions`，Idealab upstream 返回正常 completion。
3. **实际链路**：OpenCode 请求进入 Idealab upstream 后返回平台级错误；用同一 AK 直接
   请求裸 `qwen3.7-max` 返回 `IRC-001`：“该模型需要授权”。
4. **关键假设失效**：之前假定 upstream 接受裸模型 id `qwen3.7-max`。实际 dogfooding
   通道使用 token-hub 的 `name` 字段作为模型名。
5. **旁证**：`https://token-hub.alibaba-inc.com/v1/models` 当前 priority 最高项为
   `name=Qwen3.7-Max-DogFooding`、`id=qwen3.7-max`；同一 AK 直接请求
   `Qwen3.7-Max-DogFooding` 返回 200 且 completion 为 `OK`。
6. **影响范围**：当前 `openai-idealab` provider 的 dogfooding AK 调用；已有百炼 cached
   provider 与 Anthropic Idealab provider 暂未发现受影响。

## 根因确认

`openai-idealab` provider 生成了错误的模型 key。Idealab dogfooding AK 授权的是
`Qwen3.7-Max-DogFooding`，不是裸 `qwen3.7-max`。另外人工写入 auth storage 时把
`openai-idealab` 写成字符串；OpenCode auth bootstrap 的规范格式应为
`{ "type": "api", "key": "..." }`。

## 修复记录

- 子仓 `client-config.mjs` 将 `openai-idealab.models` 改为只包含
  `Qwen3.7-Max-DogFooding`。
- 本机重新运行配置器，更新 `~/.config/opencode/opencode.json`。
- 本机 auth storage 通过 `writeOpenCodeCredential()` 规范化为 `{ type: "api", key }`。

## 验证方式

- RED：`npm test -- test/client-config.test.mjs` 在旧实现下失败，显示实际模型为
  `qwen3.7-max`。
- GREEN：修复后 `npm test -- test/client-config.test.mjs` 通过。
- 真实 upstream：同一 AK 请求 `Qwen3.7-Max-DogFooding` 返回 HTTP 200，内容为 `OK`。

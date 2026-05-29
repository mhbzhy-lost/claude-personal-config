# Bug: OpenCode auth bootstrap 选择 provider 后未等待 key

## 现象

执行交互式命令：

```bash
node vendor/opencode-cache-proxy/proxy/bin/opencode-cache-proxy-auth.mjs
```

选择 provider（例如输入 `1` 并回车）后，命令打印：

```text
API key for anthropic-cached:
```

但还没输入 API key，进程就直接退出，且退出码为 0。

## 根因 (6 要素)

1. **触发条件**：在真实 TTY 中运行 `opencode-cache-proxy-auth.mjs`，先通过
   `readline/promises` 菜单选择 provider，再进入隐藏 API key 输入。
2. **期望链路**：选择 provider 后，stdin 应继续保持可读；隐藏输入逻辑切到 raw
   mode，等待用户输入 key，回车后再写入 `auth.json`。
3. **实际链路**：菜单阶段的 `readline` 关闭后，stdin 处于 paused 状态。隐藏输入阶段
   只调用了 `emitKeypressEvents(input)`、`input.setRawMode(true)` 和
   `input.on("keypress", ...)`，但没有调用 `input.resume()`。
4. **关键假设失效**：之前假定注册 `keypress` listener 会让 stdin 保持活动。实际 Node
   中 paused stdin 不会保持 event loop；只有一个 pending Promise 时，进程可以自然退出。
5. **旁证**：用临时 `opencode.json`/`auth.json` 复现，输入 `1\n` 后命令退出码为 0，
   stdout 停在 `API key for anthropic-cached:`，未生成 key 写入流程，也没有错误输出。
6. **影响范围**：真实交互式 TTY 路径全部受影响；非 TTY 管道测试仍通过，因为它走
   buffered stdin 分支，不依赖 raw mode。

## 修复方向

1. `readApiKey()` 的 TTY 分支在切 raw mode 后调用 `input.resume()`，确保 stdin handle
   持续活跃直到用户输入回车或 Ctrl-C。
2. cleanup 时恢复 raw mode；如之前 stdin 是 paused 状态，可在 cleanup 后 pause 回去。
3. 新增 TTY 分支单测：用 fake TTY input 调 `readApiKey()`，断言它调用 `resume()`，并能
   通过模拟 keypress 完成输入。

## 验证方式

- RED：新增 TTY input 单测，在当前实现下因为未调用 `resume()` 失败。
- GREEN：修复后 `node --test test/opencode-auth.test.mjs` 通过。
- 回归：真实 TTY 手动运行临时 config，输入 provider 编号后进程等待 key，不再直接退出。

## 修复记录

- 子仓 `readApiKey()` 的 TTY 分支在注册 keypress listener 后调用 `input.resume()`。
- cleanup 恢复 raw mode；如果进入前 stdin 处于 paused 状态，cleanup 后再 pause 回去。
- cleanup 同时覆盖外部 `SIGINT`，避免信号中断时终端残留 raw mode。
- 新增 `TTY API key input resumes stdin and does not echo typed characters` 单测，覆盖
  resume、隐藏输入不回显和回车完成输入。
- 新增 `TTY API key input restores terminal state on SIGINT` 单测，覆盖信号中断时的
  raw mode 恢复、pause 状态恢复和 SIGINT listener 清理。
- 子仓修复最终指针：`803b845`，已推送到 `opencode-cache-proxy` 远端 main；
  其中包含 `be2f49e fix(opencode): 保持 auth key 输入等待` 的实现。

## 边界说明

- `opencode-cache-proxy-auth.mjs` 是一次性 CLI bootstrap，选择 provider 和输入 key
  的阶段独占 stdin；该命令不在长期 REPL 或并发 stdin 消费场景中运行。
- TTY 输入只监听 `keypress`，不把按键内容写到 stdout/stderr；测试断言 stdout 中不包含
  输入的测试 key。
- 非 TTY 管道路径仍走 buffered stdin 分支，不依赖 raw mode，也不会受 `resume()` 修复影响。

## 已执行验证

```bash
cd vendor/opencode-cache-proxy/proxy
node --test test/opencode-auth.test.mjs
npm test
```

真实 TTY 回归也已用临时 `opencode.json` / `auth.json` 验证：输入 provider 编号后进程
保持运行并等待 key，输入测试 key 后写入临时 auth 文件。

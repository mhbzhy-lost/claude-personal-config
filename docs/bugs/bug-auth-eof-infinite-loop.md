# Bug: install-opencode.sh 非交互 stdin EOF 时 auth 脚本死循环 OOM

## 现象

在非交互式 shell（如 opencode 的 bash 工具）中执行 `bash install-opencode.sh`，
配置步骤正常完成，但 auth bootstrap 阶段崩溃：

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

输出文件包含 58000+ 行重复的 `Please enter a number from 1 to 5.`。

## 根因 (6 要素)

1. **触发条件**：在非 TTY 环境中运行 `install-opencode.sh`（不传 `--no-auth`），
   auth 脚本的 stdin 为空或立即 EOF（如 opencode bash 工具、cron、CI）。
2. **期望链路**：stdin 无数据时，`createBufferedQuestion` 应快速返回空字符串或抛错，
   进程以非零退出码退出，提示用户需要交互输入。
3. **实际链路**：
   - `readAllInput(stdin)` 在 stdin EOF 时立即解析出空字符串 `""`。
   - `"".split(/\r?\n/)` 得 `[""]`。
   - 第一次 `lines.shift()` 返回 `""`（truthy? 否——但 `lines` 仍赋值为 `[""]`
     因为之前是 `undefined`），数组变 `[]`。
   - 第二次 `lines.shift()` 返回 `undefined`（falsy），触发 `lines ||= await linesPromise`
     —— `lines` 重新被赋值为 `[""]`（promise 早已 resolve）。
   - 如此循环无穷。每轮 `selectOpenCodeProvider` 的 `while(true)` 写一行
     "Please enter a number from 1 to 5."，最终输出积累导致 OOM。
4. **关键假设失效**：`lines ||= await linesPromise` 意图是"只在未初始化时 resolve 一次"，
   但 `||=` 在 `lines` 为 falsy 时重新赋值；空数组 `[]` 是 truthy，但 `shift()` 后的
   返回值 `undefined` 不写回 `lines`，`shift()` 本身不改变 `lines` 变量的 truthiness。
   问题在于 `lines.shift() ?? ""` 本应阻止，但原代码是裸 `lines.shift()`，
   **且** `lines` 本身在空数组时仍是 truthy，但 `lines.shift()` 返回 `undefined`
   不会让 `lines` 变 falsy——真正的问题在 `shift()` 消耗完后返回 `undefined`
   赋值给 `answer`，然后 `answer.trim()` 抛 TypeError？不对，`undefined`
   没有 `.trim()`。但实测死循环没报错直到 OOM，说明有别的机制。

   **精确重分析**：
   `lines ||= await linesPromise` — 当 lines 是 `[]`（truthy），不赋值；
   `return lines.length > 0 ? lines.shift() : ""` — `[]` length 是 0，返回 `""`
   （空字符串，**不是 undefined**）。所以不会 TypeError，死循环但不会报错，
   只是无限写 output 直到 OOM。

   修正后的关键假设失效：**`lines.length > 0 ? lines.shift() : ""`** 已经处理了
   空数组返回 `""`，看似安全。但 `""` 是 falsy，`selectOpenCodeProvider` 的
   `Number("")` = `NaN`，校验失败继续循环。每次循环都打印 "Please enter..."
   再调 `question()`，每次返回 `""`，死循环无终止条件。

5. **旁证**：
   - output 文件有 58464 行，几乎全是 "Please enter a number from 1 to 5."。
   - OOM 栈显示 GC 反复尝试释放内存，符合大量字符串累积特征。
   - 同样的脚本在真实 TTY 下运行正常（走 `readline/promises` 分支）。
6. **影响范围**：所有非 TTY 环境下运行 `install-opencode.sh` 不带 `--no-auth`
   且 stdin 无数据或数据不足（如只输入了 provider 编号但没输 API key）都会触发。
   已有的交互式测试不受影响（`runNode` 提供完整 stdin）。

## 修复方向

1. `createBufferedQuestion` 加 `exhausted` flag：buffer 用尽后标记，后续调用不再
   返回空字符串而是通过 `question.e` 属性暴露 EOF 状态。
2. `selectOpenCodeProvider` 在每次 `question()` 调用后检查 `question.e`，
   若为 true 抛出 `"no provider selected (input exhausted)"`。
3. `readApiKey` 同样处理。
4. 新增测试：非 TTY 空 stdin 应在 5 秒内以非零退出码退出，stderr 含 "input exhausted"。
5. 修复后 `install-opencode.sh` 非交互运行不再崩溃，可以改回不加 `--no-auth`。

## 验证方式

- RED：用空 stdin 跑 auth 脚本，应超时（当前 OOM）。
- GREEN：同样测试 5 秒内退出、status != 0、stderr 含 "input exhausted"。
- 回归：已有交互式测试仍通过。

## 修复记录

修复代码位于 `vendor/opencode-cache-proxy` 子模块提交
`d958f73 fix(auth): 处理非交互输入耗尽`，父仓仅记录子模块指针与本分析文档。
该提交改动 `proxy/src/opencode-auth.mjs` 与 `proxy/test/opencode-auth.test.mjs`。

- `opencode-auth.mjs` 中 `createBufferedQuestion` 闭包：buffer 耗尽时
  设置 `q.e = true` 并返回 `""`（而非触发 `||=` 重新 await promise）。
- `selectOpenCodeProvider` 在消费 `question()` 返回值后检查 `question.e`，
  若已耗尽立即抛 `Error("no provider selected (input exhausted)")`。
- `readApiKey` 同样在 `question` 路径中检查 `question.e`，
  抛 `Error("no API key provided for ${providerId} (input exhausted)")`。
- 新增单测 `selectOpenCodeProvider throws when buffered input is exhausted (non-TTY EOF)`：
  用模拟 `question` 函数（第二次调用标 `e=true`）断言 throw 包含 "input exhausted"。
- 新增集成测试 `auth script exits quickly with non-zero status when stdin is empty`：
  spawn 真实子进程 + 空 stdin，断言非零退出码 + stderr 含错误信息。
- 修复后验证：`install-opencode.sh < /dev/null` 在 2 次 prompt 后干净退出
  （exit 1），无 OOM、无 58000 行输出。

## 已执行验证

```bash
cd vendor/opencode-cache-proxy/proxy
node --test test/opencode-auth.test.mjs    # 8/8 pass（含 2 个新增）
node --test test/client-config.test.mjs   # 5/5 pass

# 非交互安装不再崩溃：
bash install-opencode.sh < /dev/null
# exit code: 1（干净错误），stderr: "no provider selected (input exhausted)"
```

# promptAsync 探测误报成功

## 1. 现象

`promptAsync` 响应缺少 `status` 时，探测逻辑伪造 204 成功；summary 获取失败不会影响 CLI 退出码；未知 `mode` 或非法数字参数会被回退为默认值并继续执行。复用既有 probe root 时，上一轮的 mode 日志、stdout、stderr 与 serve 日志未清空，旧终态证据可被下一轮读取。命令因此表面成功，实际请求状态或输入均未得到确认。

## 2. 影响

调用方可能把未确认的投递当作已接受，自动化流程继续推进；summary 失败被隐藏后，用户和脚本无法通过退出码感知诊断不完整。错误 mode 或数字输入静默改写执行语义，可能在错误目标或错误次数下运行。复用 root 时，当前执行还可能把旧 `prompt-async` 成功或终态事件当作本轮证据，形成假阳性并污染诊断输出。

## 3. 复现条件

让 `promptAsync` 返回没有 `status` 的对象；让 summary API 失败、超时或返回异常；传入未支持的 `mode`，或传入非数字、越界或格式非法的数字参数。CLI 均可能返回成功或以默认参数继续运行。先在一个 root 写入 `prompt-async-events.jsonl`、`opencode-run.stdout`、`opencode-run.stderr` 和 `opencode-serve.log`，再以同一 root 创建 prompt-async workspace，旧文件内容仍会存在。

## 4. 根因

探测与 CLI 参数处理偏向容错推进，而非以可验证的协议响应和显式输入为边界：缺失 `status` 被解释为成功，辅助 summary 被视为与命令结果无关，枚举和数字解析失败被默认值吞没。workspace 创建逻辑也只保证目录存在并重写配置，不会在复用 root 时截断本 mode 的证据文件；serve 以追加模式写日志，读取 summary 时因此混入旧轮次。缺少“无法证明成功即失败”的契约、运行前证据隔离和统一的退出码传播。

## 5. 修复方向

仅接受协议明确返回的成功状态，缺失或非法 `status` 必须作为探测失败处理，不得伪造 204。summary 失败应传播为非零 CLI 退出码并保留诊断。对 `mode` 使用严格枚举校验，对数字参数使用严格解析与范围校验；未知或非法输入直接报错，不回退执行。每次创建 workspace 时，截断该 mode 的事件日志、stdout、stderr 和 serve 日志；复用 root 不得删除其他 mode 的日志。

## 6. 验证与防回归

覆盖无 `status`、非成功或非法 `status`、summary 失败、未知 mode、非法数字和边界数字。断言每类失败均输出明确错误并返回非零退出码，且不会调用默认 mode 或默认数字继续执行；明确成功响应与合法参数仍保持原有成功路径。覆盖复用同一 root 时仅清除当前 mode 的四类证据文件，并保留其他 mode 的日志；dry-run 调用 creator 也必须获得干净的当前 mode 证据文件。

# Bug: Knowledge gate fail-open and hook args handling

## 现象

第二次 `git push` 被异源 review gate 拦截，指出 vendored knowledge gate 在配置损坏
或无法读取 staged diff 时会放行，且 Codex hooks 合并逻辑在托管命令带参数时可能重复
追加同一个 hook。

## 根因 (6 要素)

1. **触发条件**：`.agent/knowledge-gate.json` 存在但不是合法 JSON，或 `git diff
   --cached` 执行失败；另一路触发条件是 `codex/hooks.json` 中托管 command 带脚本
   参数后重复运行 `init_codex.sh`。
2. **期望链路**：配置文件一旦存在但不可解析，或 staged diff 无法取得，应阻断提交；
   托管 marker 提取和现有 command 识别应使用同一套“脚本路径”语义。
3. **实际链路**：`_load_config` 解析失败返回 `(None, error)`，`main` 的
   `invalid_config` 分支永远读不到配置；`_staged_files` 失败时返回空列表；
   `_command_markers` 从原始 command 字符串截取 marker，可能把参数也包含进去。
4. **关键假设失效**：实现假设 invalid config 可以从损坏 JSON 中读取策略，假设
   `git diff` 失败等同于没有 staged file，且模板托管命令永远不带参数。
5. **旁证**：当前模板 checker 没有 invalid config 和 git diff 失败测试；新增的
   command 解析逻辑已经证明参数和脚本路径需要分开处理。
6. **实现偏差**：pre-commit 硬门禁不能在自身判断能力失效时静默放行；托管边界也
   不能由包含参数的原始命令文本推导。

## 修复原则

- `.agent/knowledge-gate.json` 缺失仍 no-op；存在但无效时 fail-close。
- `git diff --cached` 失败时返回阻断状态，并输出 stderr 供诊断。
- `_command_markers` 与 `_is_managed_entry` 统一使用 `shlex` 解析出的脚本路径。
- installer 对不存在的目标目录输出清晰错误并返回 `2`。

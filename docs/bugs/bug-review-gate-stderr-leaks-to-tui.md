# Bug: external-review-gate stderr 泄漏导致 opencode TUI 渲染异常

## 1. 现象

每次 `git push` 触发 `external-review-gate` hook 后，opencode TUI 界面被
破坏，出现 `NotADirectoryError` traceback 和
`ERROR: Cannot read "clipboard"` 等错误信息直接覆盖在 TUI 上。

## 2. 根因

`opencode/plugins/external-review-gate.js:59` 使用
`stdio: ["pipe", "pipe", "inherit"]`，第三个元素 `inherit` 将子进程 stderr
直接继承到 opencode 主进程的 stderr。

opencode 是 TUI 应用（终端全屏渲染），任何第三方向 stderr 写入的内容都会
直接输出到终端，破坏 TUI 画面。

hook 执行链 `external-review-gate.js → bash → uv run python reviewer.py`
中所有环节的 stderr 都经此路径泄漏：
- `reviewer.py` 的诊断日志（`print(..., file=sys.stderr)`）
- `uv` 的依赖安装进度
- Python traceback（`NotADirectoryError` 等运行时错误）
- bash hook 自身的 `[external-review-gate]` 日志

## 3. 影响范围

仅影响 OpenCode 端。Claude Code / Qwen / Codex 的 hook 运行在独立进程空间，
stderr 不影响宿主 TUI。

## 4. 触发条件

`git push` 且 diff 不符合豁免条件（>10 行、含代码文件），触发 reviewer.py
执行。reviewer 运行期间任何 stderr 输出即触发。

## 5. 修复方案

将 `stdio` 第三个元素从 `"inherit"` 改为 `"pipe"`，捕获 stderr 但不输出到
终端。诊断需求可通过检查 `result.stderr` 在 catch 分支中使用。

## 6. 验证方式

修复后在 opencode 中执行 `git push`，确认 TUI 不受 hook 执行影响。

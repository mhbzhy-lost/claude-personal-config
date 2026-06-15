# opencode TUI provider 列表空引用

## 1. 现象

执行 `opencode -c` 启动 TUI 时退出：

```text
Error: Unexpected server error. Check server logs for details.
TypeError: null is not an object (evaluating 'n.provider')
```

`opencode -c --pure --print-logs --log-level DEBUG` 仍复现；但显式设置
`OPENCODE_PURE=1 opencode --pure --print-logs --log-level DEBUG` 可正常进入
TUI，说明 TUI Worker 没有吃到 CLI middleware 运行时设置的 `OPENCODE_PURE`，
仍加载了外部插件。

## 2. 影响

TUI 无法启动或继续会话。`opencode providers list` 和 `opencode models --pure`
仍可正常运行，因此凭据和 provider 基础配置本身不是直接坏点。

## 3. 复现步骤

```bash
opencode --pure --print-logs --log-level DEBUG
```

关键日志：

```text
TypeError: null is not an object (evaluating 'n.provider')
at Provider.list
at ConfigHttpApi.providers
```

## 4. 根因分析

已排除：

- `auth.json`、`account.json` 没有 `null`，且 `opencode providers list` 正常。
- sqlite `credential` / `account` / `account_state` 为空，不存在坏账号行。
- `opencode models --pure` 能列出模型，说明当前 provider 配置可解析。
- 临时移走 `~/.local/state/opencode/model.json` 后仍复现，旧 recent / variant
  状态不是根因。
- `opencode serve --pure --port 4100` 直接访问 `/config/providers`、`/provider`
  均正常，说明普通 serve 路径与 provider 配置本身不是根因。

根因：

近期 `init_opencode.sh` 新增执行
`vendor/opencode-dynamic-workflow/install-opencode.sh`，该脚本把
`vendor/opencode-dynamic-workflow/plugins/workflow-hint.js` 软链到
`~/.config/opencode/plugins/workflow-hint.js`。

`workflow-hint.js` 同时导出了两个函数：

- `WorkflowHintPlugin`
- `getWorkflowHint`

OpenCode 1.17.7 的 legacy 外部 plugin loader 会把模块中每个导出的函数都当作
server plugin 执行。`getWorkflowHint(pluginInput)` 因入参不是字符串而返回
`null`，这个 `null` 被加入 plugin hooks 列表。后续 `Provider.list` 遍历 hooks
时访问 `hook.provider`，触发 `null.provider`。

`opencode --pure` 仍复现的原因是 TUI 命令会启动内部 Bun Worker；`--pure` 在
CLI middleware 里通过运行时 `process.env.OPENCODE_PURE=1` 设置，Worker 未继承这
个运行时变更。显式从外部环境传入 `OPENCODE_PURE=1` 时可正常启动，验证了该判断。

## 5. 修复方案

最小修复：

- `workflow-hint.js` 只导出 `WorkflowHintPlugin`，把 `getWorkflowHint` 改为模块内
  私有函数。
- 增加回归测试，断言模块中只有一个函数导出，避免再次被 OpenCode legacy loader
  误识别为多个插件。

临时绕过：

```bash
OPENCODE_PURE=1 opencode --pure
```

## 6. 验证方式

验证命令：

```bash
cd vendor/opencode-dynamic-workflow
node --test tests/workflow-hint.test.mjs
node --test tests/*.test.mjs

OPENCODE_PURE=1 opencode --pure --print-logs --log-level DEBUG
opencode --pure --print-logs --log-level DEBUG
```

期望：显式 `OPENCODE_PURE=1` 可启动；修复后普通 `opencode --pure` 不再因
`workflow-hint.js` 产生 `n.provider` 空引用。

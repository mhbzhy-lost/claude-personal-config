# Qwen provider 测试假设所有 hook 都有 name 字段

**现象**：执行 `bash scripts/test-init-qwen-provider.sh` 失败：
`KeyError: 'name'`。失败位置在脚本末尾断言 `SessionStart` / `SessionEnd`
hooks 时，生成器表达式直接访问 `hook["name"]`。

**调用链**：测试脚本先构造临时 `QWEN_CONFIG_DIR/settings.json`，其中已有一个带
`name=keep-session-start` 的 `SessionStart` hook → 执行 `init_qwen.sh` →
`init_qwen.sh` 追加本仓 hooks，其中 memory loader hook 只有 `type` 和
`command`，没有 `name` → cache proxy 配置入口再合并
`bailian-cache-proxy-start/stop` hook → 测试脚本遍历所有 hook 并直接访问
`hook["name"]` → 遇到无 `name` 的 memory hook 抛 `KeyError`。

**根因假设**：

1. 测试脚本把“cache proxy hook 有 name”误扩展成“所有 hook 都有 name”。
2. `init_qwen.sh` 的本仓 memory hook 使用 Qwen/Claude hook 通用最小结构，
   不要求 `name` 字段。
3. 最近移除 turn-level Stop hook 后，`SessionStart` 中无 name 的本仓 hook
   更容易暴露这个测试断言假设。

**验证方式**：

- 复现命令：`bash scripts/test-init-qwen-provider.sh`
- 失败输出：`KeyError: 'name'`
- 读取脚本可见第 105 和第 116 行使用 `hook["name"]`，未做 `.get("name")`
  或字段存在性判断。
- 读取生成配置可见 memory hook 结构合法但没有 `name` 字段。

**根因确认**：问题不在 Qwen provider 合并逻辑，而在测试脚本对 hooks schema 的
断言过窄。Qwen settings 允许同一事件下混合存在有名 hook 和无名 hook；测试只需要
筛选 cache proxy 自己管理的 hook。

**影响范围**：影响 `scripts/test-init-qwen-provider.sh` 本地/CI 验证，导致真实
provider 初始化行为无法被该脚本稳定验证。运行时配置本身不需要为测试补 `name`
字段，否则会把测试假设反向污染到产品配置。

**修复方案要求**：

- 修改测试脚本断言，使用 `hook.get("name")` 判断目标 hook。
- 保留对 `bailian-cache-proxy-start`、`keep-session-start`、
  `bailian-cache-proxy-stop` 的验证语义。
- 不修改 `init_qwen.sh` 的 memory hook 结构。
- 重新运行 `bash scripts/test-init-qwen-provider.sh` 证明修复。

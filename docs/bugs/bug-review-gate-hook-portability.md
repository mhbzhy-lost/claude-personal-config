# Bug: Review gate blocked hook portability fixes

## 现象

`git push` 被异源 review gate 拦截，指出本次提交里的测试硬编码本机绝对路径，
以及 `init_codex.sh` 的 Codex hooks 合并逻辑可能误删第三方 hook。

## 根因 (6 要素)

1. **触发条件**：在非 `/Users/leshi.zhy/claude-config` 路径运行测试，或目标
   `~/.codex/hooks.json` 中第三方 hook 文本包含本仓 hook 的相对路径 marker。
2. **期望链路**：测试应根据当前 checkout 动态计算路径；hook 渲染只替换命令实际
   指向本仓当前 checkout 的托管条目。
3. **实际链路**：测试断言写死本机路径；`_is_managed_entry` 把整个 entry 序列化后
   做 marker 子串匹配。
4. **关键假设失效**：实现假设测试只在维护者本机运行，且第三方 hook 不会在命令、
   参数或说明中包含本仓相对 hook 路径。
5. **旁证**：异源 review gate 在 push 前复查累计 diff 时把硬编码路径列为
   Critical；现有合并测试没有覆盖“第三方 hook 只是提到托管 marker”的场景。
6. **实现偏差**：本仓托管边界应由 hook command 中当前 checkout 的绝对路径决定，
   不能由任意 JSON 文本里的相对路径子串决定。

## 修复原则

- 测试中所有本仓路径断言都从 `REPO_ROOT` 动态生成。
- 新增回归测试覆盖第三方 hook command 参数包含托管 marker 但不指向本仓路径的场景。
- `_is_managed_entry` 只检查 entry 内 hook command 是否包含当前 `src_root` 下的
  managed marker，不扫描整个 JSON 文本。
- 对 knowledge gate 的 `fnmatch` 匹配语义在模板 README 中明示，避免误当成 shell
  glob 语义。

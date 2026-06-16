diff_chars=13555
[external-llm-review] backend=api model=qwen3.7-max base=https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1 diff_chars=13555
### Strengths
- **架构与关注点分离清晰**：将编排决策（Workflow vs Subagent）从硬编码的 Hook/Plugin 层上移到 `CLAUDE.md` 作为全局硬约束，Plugin 层精简为仅做 `background: true` 的底线检查。这有效解决了 LLM 容易忽略软建议（逃生舱）的问题，提升了规则的执行确定性。
- **测试覆盖全面且精准**：`test_codex_hooks.py` 不仅验证了 Markdown 文档中的关键字（确保文档与代码同步），还通过实际拉起 Node.js 进程执行 Plugin 代码，验证了运行时行为（只拦截非后台模式），做到了真正的端到端验证。
- **文档与记忆同步更新**：`memory.md`、`CLAUDE.reason.md` 和各 `docs/knowledge/*.md` 详细记录了决策演进、事实确认（如 subagent 默认工具集）和架构变更（Worktree 生命周期），为后续维护提供了极佳的上下文。

### Issues

#### Critical (Must Fix)
*无*

#### Important (Should Fix)
*无*

#### Minor (Nice to Have)
- **测试断言缺失 stderr 上下文**：在 `codex/hooks/tests/test_codex_hooks.py:1750` 附近，对 Node.js 子进程输出的断言（`self.assertIn("background", hint.lower())`）如果失败，不会打印 `proc.stderr`。如果 Plugin 执行时产生了 Warning 或未被 `check=True` 捕获的非致命错误（如未处理的 Promise rejection 导致输出异常但 exit code 为 0），调试时会缺乏关键信息。
  - **建议**：在断言中附带 stderr 信息，例如：`self.assertIn("background", hint.lower(), f"stdout={hint}\nstderr={proc.stderr}")`。

### Checklist Coverage
1. **实现是否真正满足 spec / bug-analysis 的根因与影响范围**：已检查。文档、策略 JSON、测试和 Submodule 指针更新高度一致，完全满足将编排决策上移并精简 Plugin 的目标。
2. **入口参数、help、dry-run 是否会误触发网络/写文件/远端副作用**：N/A（本次 diff 无此类业务代码）。
3. **临时文件、trap、exec、cleanup、stdin/stdout/stderr 处理是否可靠**：已检查。测试中的 `subprocess.run` 使用了 `capture_output=True` 和 `check=True`，处理可靠。
4. **shell 兼容性**：N/A（无 Shell 脚本修改）。
5. **子进程 / 网络错误是否保留 stderr / response body / 可诊断上下文**：已检查。`check=True` 会在进程失败时保留 stderr，但断言失败时未保留（见 Minor issue）。
6. **幂等性、重复执行、部分失败、回滚/备份是否安全**：N/A。
7. **输入边界、路径穿越、敏感信息泄露、权限边界是否合理**：已检查。测试中构建 JS 脚本时使用了 `json.dumps` 处理文件 URI，有效防止了路径注入或语法错误；无敏感信息泄露。
8. **并发/异步/缓存/状态共享是否引入竞态或陈旧状态**：N/A。
9. **新增测试是否覆盖根因路径和影响范围，而不是只覆盖表面失败**：已检查。测试同时覆盖了静态文本校验和动态 Plugin 执行校验，覆盖深度足够。

### Assessment

**Ready to merge?** Yes
**Reasoning:** 本次变更主要是策略配置、文档演进和测试同步，逻辑清晰且关注点分离合理。测试用例设计严谨，能够确保规则在文档和运行时的一致性。仅有一个 Minor 级别的测试调试体验优化建议，不影响合并。

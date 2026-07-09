---
title: OpenCode 初始化同步约定
kind: convention
status: active
applies_to:
  - init_opencode.sh
  - opencode.json
  - userconf/plugins/
  - userconf/agents/
  - agents/skills.list
last_verified: 2026-07-09
source: docs/bugs/bug-init-plugin-glob-path-sync.md
---

# `init_opencode.sh` 同步本仓托管项时必须按路径语义处理

## 适用场景

修改 `init_opencode.sh` 中 plugin、agent、skill、theme、TUI 等本仓托管配置同步逻辑时阅读。

## 项目事实 / 约定

- 本仓托管 plugin 使用 per-file symlink，同步时只处理 `userconf/plugins/` 的平铺文件，不递归处理子目录。
- 枚举源目录项不要用 shell glob 拼接路径；仓库路径可能包含 `[`, `]`, `*`, `?` 等字符，应使用按目录读取的方式，当前用 `find ... -print0`。
- 清理废弃或迁移中的托管软链时，不要直接比较 `readlink` 原始字符串；历史软链可能保存相对 target，应先按软链所在目录解析后比较路径语义。若旧 target parent 已缺失，只能对明确传入的托管后缀做兜底匹配，避免误删用户自管软链。
- 托管后缀兜底匹配必须按字符串长度比较，不要用 `case` pattern 承载变量后缀；解析 symlink target parent 时用 `cd -- "$target_dir"`，避免以连字符开头的路径被当成选项。
- 断言软链是否被删除时，测试要用 `lstat` 语义，不要用会跟随 target 的 `existsSync`，否则 dangling symlink 会产生假阳性。
- `sync_opencode_json()` 托管全局 `opencode.json` 的 MCP、LSP、permission 与 agent 合并。MCP 目前包含 `playwright-mcp`、`playwright-mcp-headless`、`basic-memory`、`exa`；新增或调整 MCP 时应在该函数里幂等合并，不要要求用户手工复制 JSON。
- Exa 使用官方 hosted remote MCP：`mcp.exa = { type: "remote", url: "https://mcp.exa.ai/mcp", enabled: true }`。不要把 Exa API key 写入仓库；如需 key 或额外工具，优先让用户在本地全局配置或 Exa 授权链路处理。

## 修改时注意

- 新增废弃 plugin 清理规则时，同时覆盖绝对 target 和相对 target 的历史软链。
- 新增共享 skill 来源时，同步更新 `agents/skills.list`、`docs/knowledge/opencode-shared-skills.md` 和 init 单测。
- 新增托管 MCP server 时，同步更新 `sync_opencode_json()`、`userconf/plugins/test/init-opencode-agents.test.mjs` 和本文档；确保配置符合 `https://opencode.ai/config.json` 中的 MCP schema。
- 子模块安装脚本不读取主仓白名单；主仓负责决定是否调用子模块初始化入口。

## 验证方式

- `node --test "userconf/plugins/test/init-opencode-agents.test.mjs"`
- `bash -n "init_opencode.sh"`

## 相关资料

- `docs/bugs/bug-init-plugin-glob-path-sync.md`
- `docs/bugs/bug-init-relative-managed-symlink.md`
- `docs/bugs/bug-workflow-usage-legacy-opencode-skill.md`
- `docs/knowledge/opencode-shared-skills.md`

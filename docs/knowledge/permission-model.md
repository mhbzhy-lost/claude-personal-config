---
title: opencode 权限模型与 YOLO 边界
kind: architecture
status: active
applies_to:
  - userconf/permission.json
  - userconf/plugins/rm-outside-workspace-guard.js
  - init_opencode.sh
last_verified: 2026-06-17
source: code-health-review synthesis
---

# opencode 权限模型：YOLO 模式的边界与插件兜底

opencode permission 是 glob/command gate，**不是**文件系统沙箱。
YOLO 模式通过权限模板全量放行，同时用插件层做精细兜底。

## 适用场景

- 修改 `userconf/permission.json`（SSOT 权限模板）
- 理解为什么某些破坏性操作靠插件而非 permission 拦截
- 排查 "命令被拦截" 或 "路径被拒绝" 问题
- 新增权限规则或插件时，判断边界归属

## 项目事实 / 约定

**权限模板格式：** `permission.json` 顶层 `description` + `notes` 是元数据，
`template` 对象是 init_opencode.sh 写入 `opencode.json` 的实际权限规则。

**评估模型：** opencode 对每条工具调用按 insertion order 匹配 pattern，
**最后命中的规则为最终结果**。因此：
- 宽规则（`"**": "allow"`）放前面
- 窄规则（`"rm *": "deny"`）放后面
- 顺序反转会导致 deny 被 allow 覆盖

**当前分层（2026-06 后）：**

| 层 | 机制 | 覆盖 | 示例 |
|---|---|---|---|
| L1: permission template | `permission.json` → `opencode.json` | 工具级 glob/command gate | `bash` 命令白名单、`read` 路径白名单 |
| L2: plugin hook | `tool.execute.before` | 精细逻辑（如 rm 目标路径校验） | `rm-outside-workspace-guard.js` |
| L3: AGENTS.md 约定 | 文档约束 | 软性规范（可被违反） | "禁止前台模式派发 subagent" |

**YOLO 模式边界：**
- `permission: "allow"`（top-level string）= 全量放行（极少使用）
- `"template": { ... }` = 可控的宽泛放行 + 精细兜底
- 本仓选择 template 模式：YOLO + 关键防线（rm 双层、bash 白名单、文件路径限制）

**插件兜底适用场景：**
- 需要运行时上下文（如工作区根目录、实时路径解析）
- 需要复杂判断逻辑（如 symlink 解析、shell 展开检测）
- 需要输出可操作的错误信息（如列出被阻断目标）

## 原因

- permission template 是静态 glob，无法处理运行时路径规范化
- `rm -rf /usr/lib` 的 `/usr/lib` 需 `realpathSync` 解析 symlink，permission glob 做不到
- 分层的哲学：静态规则低成本覆盖 90% 场景，插件兜底 10% 高风险场景

## 修改时注意

- `permission.json` 修改后必须重跑 `init_opencode.sh` 才能同步到 `opencode.json`
- 重跑后需重启 opencode（权限配置不热加载）
- 新增 plugin 拦截规则时，同步在 `permission.json` 加对应 deny 作为第二防线
- `$REPO` 是路径白名单中的占位符，由 opencode 在运行时解析为工作区根目录

## 验证方式

```bash
# 检查 permission.json 是否合法 JSON
python3 -c "import json; json.load(open('userconf/permission.json'))"

# 检查 opencode.json permission 是否与 SSOT 一致
python3 -c "
import json
ssot = json.load(open('userconf/permission.json'))['template']
cfg = json.load(open('$HOME/.config/opencode/opencode.json'))['permission']
print('MATCH' if ssot == cfg else 'MISMATCH: rerun init_opencode.sh')
"

# 测试 rm 双层防线
node --test userconf/plugins/test/rm-outside-workspace-guard.test.mjs
```

## 相关资料

- 权限模板：`userconf/permission.json`
- rm 插件：`userconf/plugins/rm-outside-workspace-guard.js`
- 分层策略：`docs/knowledge/permission-layers.md`
- 工作区边界：`docs/knowledge/workspace-boundary.md`
- init 流程：`init_opencode.sh` 第 530-553 行（permission 合并逻辑）

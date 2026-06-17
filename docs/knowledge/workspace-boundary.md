---
title: 工作区边界与外部路径访问规范
kind: convention
status: active
applies_to:
  - userconf/permission.json
  - userconf/plugins/rm-outside-workspace-guard.js
  - init_opencode.sh
  - userconf/AGENTS.md
last_verified: 2026-06-17
source: code-health-review synthesis
---

# 工作区边界：agent 访问外部路径的场景分类与审批流程

agent 默认在工作区（`$REPO`）内操作。访问工作区外路径需要按场景分类，
遵守对应的审批流程。高风险操作（如 `rm`）有硬性阻断，其他场景通过
permission 白名单 + 约定引导。

## 适用场景

- 判断 agent 读取/编辑工作区外文件是否合规
- 理解 `rm-outside-workspace-guard.js` 的阻断逻辑
- 排查 "路径被拒绝" 问题
- 设计需要访问外部路径的新功能

## 项目事实 / 约定

### 场景分类

| 场景 | 安全等级 | 处理方式 | 示例 |
|---|---|---|---|
| 读取工作区内文件 | 安全 | 无需审批 | `read src/main.ts` |
| 读取全局配置/技能 | 安全 | 无需审批（通过 reference/软链授权） | `~/.config/opencode/` 下的文件 |
| 读取临时目录 | 安全 | 无需审批 | `/tmp/`、`$TMPDIR` |
| 写入工作区内文件 | 安全 | 无需审批 | `edit src/utils.ts` |
| 读取工作区外源码 | 需审批 | 通过 AGENTS.md 约定 | 参考另一个仓库的源码 |
| 写入工作区外文件 | 需审批 | 通过 AGENTS.md 约定 | 更新 `~/.config/` 下的配置 |
| 删除工作区内文件 | 需审批 | permission 白名单 | `rm src/old.ts` |
| 删除工作区外文件 | **禁止** | 插件硬阻断 + permission deny | `rm -rf /usr/lib` |
| 删除临时目录文件 | 安全 | 插件放行 | `rm /tmp/test-*` |

### 阻断机制

**rm 双层防线：**

1. **L2（plugin 硬阻断）**：`rm-outside-workspace-guard.js` 在 `tool.execute.before` 中
   检查 `rm` 目标，对外部路径 `throw Error` 阻断。支持：
   - 符号链接解析（防止 symlink 绕过）
   - `cd` 链跟踪（准确定位最终路径）
   - shell 展开检测（`$VAR`、`*`、`` ` `` 标记为需用户手动确认）
   - 临时目录白名单（`/tmp`、`$TMPDIR`、`/private/tmp`）

2. **L1（permission deny）**：`permission.json` 中 `"rm *": "deny"` 作为声明式第二防线。
   即使 plugin 被旁路，permission 层仍阻断所有 `rm` 命令。

**文件路径白名单：**
`read`/`edit`/`glob`/`grep` 限定为 `$REPO/**`，工作区外路径默认拒绝。
例外路径通过 opencode 的 `references`、`external_directory` 工具或软链显式授权。

### 临时目录白名单

以下路径视为"安全临时区域"，rm 插件允许操作：

| 路径 | 来源 |
|---|---|
| `os.tmpdir()` | Node.js 标准库 |
| `realpathSync(os.tmpdir())` | 解析 macOS `/var` → `/private/var` |
| `/tmp` | Unix 标准 |
| `realpathSync("/tmp")` | 解析后 |

### 安全绕过防范

**符号链接攻击：** 攻击者在 `/tmp/evil` 创建指向 `/etc/important` 的符号链接，
试图通过 `rm /tmp/evil` 删除系统文件。防护：
- 插件使用 `lstatSync` 检测符号链接
- 使用 `realpathSync` 解析真实路径后再检查是否在白名单内
- 符号链接解析失败时默认视为不安全

**Shell 展开：** `rm $HOME/sensitive/*` 中的 `$HOME` 可能在展开后指向工作区外。
防护：插件检测 `$`、`` ` ``、`*`、`?`、`[]`、`{}` 等展开字符，阻断并提示用户手动确认。

## 原因

- **工作区内操作**是 agent 的主要使用场景，不应有额外摩擦
- **读取外部配置/技能**是 opencode 正常运行的基础（软链、references），必须透明
- **写入外部文件**风险可控但需可审计（通过 AGENTS.md 约定 + 日志）
- **删除外部文件**是最高风险操作，必须硬性阻断（符号链接攻击、shell 展开误删）
- 分层防御（permission + plugin）确保即使一层失效，另一层仍能阻断

## 修改时注意

- 新增"安全临时区域"需同时更新 `rm-outside-workspace-guard.js` 的 `TEMP_DIRS`
  数组和本文件
- 修改 `$REPO` 解析逻辑需确认 `references` 授权的外部路径不被误拒
- 新增外部路径访问场景需在本文件的场景分类表中补充
- `permission.json` 文件路径白名单使用 `$REPO` 占位符，不要硬编码绝对路径

## 验证方式

```bash
# 验证 rm 插件阻断外部路径
node --test userconf/plugins/test/rm-outside-workspace-guard.test.mjs

# 验证符号链接解析（创建测试链接后执行）
ln -sf /etc/hosts /tmp/test-evil-link
# 此时 rm /tmp/test-evil-link 应被解析为 /etc/hosts 并阻断

# 验证文件路径白名单已生效
python3 -c "
import json
perm = json.load(open('$HOME/.config/opencode/opencode.json'))['permission']
for tool in ['read', 'edit', 'glob', 'grep']:
    rule = perm.get(tool)
    assert isinstance(rule, dict), f'{tool} should be object, got {type(rule)}'
    assert 'deny' in rule.values(), f'{tool} missing deny fallback'
print('workspace boundary OK')
"
```

## 相关资料

- 权限模板：`userconf/permission.json`
- rm 插件：`userconf/plugins/rm-outside-workspace-guard.js`
- 权限分层：`docs/knowledge/permission-layers.md`
- 权限模型：`docs/knowledge/permission-model.md`

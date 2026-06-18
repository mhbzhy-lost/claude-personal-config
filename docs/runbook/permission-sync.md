# 修改 permission 后同步 opencode

## 前提条件

- `userconf/permission.json` 已存在（SSOT 模板）
- Python 3 可用

## 操作步骤

### 1. 编辑 SSOT 模板

修改 `userconf/permission.json` 中的 `template` 字段。

### 2. 同步到 opencode.json

```bash
bash init_opencode.sh
```

脚本中的 Python 合并块会将 `template` 整块替换到 `~/.config/opencode/opencode.json` 的 `permission` 字段。

### 3. 重启 opencode

权限配置不热加载，必须重启 opencode 会话才能生效。

## 验证方式

```bash
python3 -c "
import json, os
ssot = json.load(open('userconf/permission.json'))['template']
cfg = json.load(open(os.path.expanduser('~/.config/opencode/opencode.json')))['permission']
print('MATCH' if ssot == cfg else 'MISMATCH: rerun init_opencode.sh')
"
```

## 常见失败处理

- **MISMATCH**：重跑 `init_opencode.sh`
- **修改后工具不生效**：未重启 opencode（权限不热加载）
- **新增 plugin 拦规则后 permission 层未加 deny**：新 plugin 拦截规则时，同步在 `permission.json` 加对应 deny 作为第二防线

## 相关资料

- 权限模型：`docs/knowledge/permission-model.md`
- 分层策略：`docs/knowledge/permission-layers.md`
- 权限模板：`userconf/permission.json`

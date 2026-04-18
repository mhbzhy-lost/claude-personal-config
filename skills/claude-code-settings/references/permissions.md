# Permission 规则与模式

> 来源：https://code.claude.com/docs/en/iam

## 规则语法

```
"Read"                 精确工具名
"Bash(git *)"          工具 + 参数 glob
"Edit(src/**/*.ts)"    工具 + 文件路径 glob
"*"                    匹配一切
```

Glob 语义（同时适用于 settings、`--allowedTools`、`--disallowedTools`）：

| 符号 | 含义 |
|---|---|
| `*`  | 单段内任意字符 |
| `**` | 零个或多个路径段 |
| `?`  | 单字符 |
| `[abc]` | 字符集 |

## 三个 bucket

```json
{
  "permissions": {
    "allow": ["Read", "Edit(src/**)", "Bash(git *)"],
    "deny":  ["Bash(ssh *)", "Bash(rm -rf *)"],
    "ask":   ["Bash(curl *)", "Edit(package.json)"]
  }
}
```

## 评估顺序（每次工具调用）

```
1. deny  命中 → 拒绝（最高）
2. ask   命中 → 弹窗询问
3. allow 命中 → 放行
4. 都没命中   → 由 permission mode 决定
```

deny 总是先判，所以「allow 写得太宽」不会把 deny 盖掉。

## Permission modes

`defaultMode` / `--permission-mode` 可选：

| 模式 | 未命中规则时 |
|---|---|
| `default` | 弹窗询问 |
| `acceptEdits` | 自动批准文件编辑，其他询问 |
| `plan` | 展示计划但不执行 |
| `auto` | 自动批准安全工具，风险项询问 |
| `dontAsk` | 自动批准全部 |
| `bypassPermissions` | 跳过所有权限检查（即 `--dangerously-skip-permissions`） |

## 常用模板

### 保守（企业 / 新人）

```json
{
  "permissions": {
    "allow": ["Read"],
    "ask":   ["Edit(**)", "Bash(*)"],
    "deny":  ["Bash(ssh *)", "Bash(curl * | *sh)", "Edit(.env*)", "WebFetch"]
  },
  "defaultMode": "default"
}
```

### 激进（本地脚本 / CI 受控环境）

```json
{
  "permissions": {
    "allow": ["*"],
    "deny":  ["Bash(rm -rf /)", "Bash(sudo *)"]
  },
  "defaultMode": "acceptEdits"
}
```

### 只读审计

```json
{
  "permissions": {
    "allow": ["Read", "Grep", "Glob"],
    "deny":  ["Edit(**)", "Write(**)", "Bash(*)"]
  },
  "defaultMode": "plan"
}
```

## CLI 等价

```bash
# 追加允许
claude --allowedTools "Bash(git log *)" "Bash(git diff *)" "Read"

# 追加禁止（并从 context 移除）
claude --disallowedTools "Bash(ssh *)" "Edit"

# 只给特定工具
claude --tools "Bash,Edit,Read"
```

`--allowedTools` / `--disallowedTools` 仅追加规则；要**限制**可用工具集，用 `--tools`。

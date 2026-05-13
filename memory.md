# 项目记忆

## bash 变量紧邻全角括号导致 unbound variable

**现象**：脚本中 `$var（` 形式（变量后紧跟全角左括号 U+FF08）触发 `unbound variable` 错误。

**根因**：bash 在 UTF-8 locale 下，使用 locale 相关函数判定合法变量名字符。全角 `（` 的首字节 `0xef` 被误判为字母，bash 将 `$var（` 整体当作变量名展开，而该变量不存在，`set -u` 报错。

**表现**：
```bash
# ❌ 崩溃
echo "安装 $key（未 pin）..."

# ✓ 正常
echo "安装 ${key}（未 pin）..."
```

同样会触发的全角字符：`（` `）` `，` `。` `、` 等。

**已修复出**：`init_claude.sh:949`, `init_opencode.sh:46,55`。若新增脚本含中文 echo 带变量引用，统一用 `${var}` 花括号形式。

**参考**：curl 项目 2016 年类似 bug，`$var` 后紧跟 UTF-8 多字节字符在部分 locale 下被视为变量名延续。

**规避**：zsh 不受此 bug 影响，`$var（` 在 zsh 中可正常展开。若有 zsh 环境，将脚本 shebang 改为 `#!/usr/bin/env zsh` 也可规避。但本仓为兼容性保留 bash，统一用 `${var}` 修复。

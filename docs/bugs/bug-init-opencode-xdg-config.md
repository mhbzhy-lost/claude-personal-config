# Bug: init_opencode.sh 未遵守 XDG_CONFIG_HOME 标准

**Status:** ✅ RESOLVED  
**Reporter:** User  
**Date:** 2024-06-22  
**Severity:** Medium

---

## Summary

`init_opencode.sh` 在确定 opencode 配置目录时，没有遵守 XDG Base Directory Specification，导致用户在另一台机器上执行初始化后，颜色主题等配置未能正确同步。

## Symptom

用户在其他机器上执行 `init_opencode.sh` 后，发现颜色主题（themes）没有正确加载，TUI 界面显示默认配色而非自定义主题。

## Environment

- **Affected file:** `init_opencode.sh` (line 23)
- **User setup:** 目标机器设置了 `XDG_CONFIG_HOME` 环境变量
- **Current behavior:** 脚本忽略了 `XDG_CONFIG_HOME`，直接使用 `$HOME/.config`

## Root Cause Analysis

### 1. 初始假设
原代码假设所有用户的配置目录都是 `$HOME/.config/opencode` 或通过 `OPENCODE_CONFIG_DIR` 显式指定。

### 2. 根本问题
**第 23 行原始逻辑：**
```bash
OPENCODE_CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
```

这是一个二元优先级的 shell 参数扩展：
- 如果 `OPENCODE_CONFIG_DIR` 已定义且非空 → 使用它
- 否则 → 回退到 `$HOME/.config/opencode`

**缺失的一层：** [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html)

根据该规范，XDG 兼容的应用程序应该按以下优先级查找配置目录：
1. `$XDG_CONFIG_HOME` - 用户显式指定的配置根目录
2. `$HOME/.config` - 默认值（当 XDG_CONFIG_HOME 未设置时）

### 3. 为什么是问题
许多 Linux 桌面环境和开发工具遵循 XDG 标准。用户可能在以下场景设置 `XDG_CONFIG_HOME`：
- 使用自定义配置目录（如 `~/.config-custom`）
- 多用户共享系统
- 容器化环境
- 通过 systemd 用户服务管理的环境

当用户设置 `XDG_CONFIG_HOME=/custom/path` 时：
- opencode 会在 `/custom/path/opencode` 查找配置
- 但 `init_opencode.sh` 把配置文件写入 `$HOME/.config/opencode`
- **结果：** 配置文件写错位置，opencode 找不到自定义主题

## Verification

### Test Suite
创建了 `tests/init-opencode-config-dir.sh`，测试三种场景：

```bash
✓ Test 1: 显式 OPENCODE_CONFIG_DIR 优先
✓ Test 2: XDG_CONFIG_HOME 被正确使用
✓ Test 3: 两者都未设置时回退到 $HOME/.config
```

### Reproduce
在设置了 `XDG_CONFIG_HOME` 的机器上：
```bash
export XDG_CONFIG_HOME=/tmp/test-xdg
bash init_opencode.sh
# 检查：配置文件应该写入 /tmp/test-xdg/opencode
# 而非 $HOME/.config/opencode
```

## Solution

### Code Changes
将第 23 行替换为三层优先级逻辑：

```bash
# 配置目录优先级：OPENCODE_CONFIG_DIR > XDG_CONFIG_HOME > HOME/.config
if [ -n "$OPENCODE_CONFIG_DIR" ]; then
  CONFIG_DIR="$OPENCODE_CONFIG_DIR"
elif [ -n "$XDG_CONFIG_HOME" ]; then
  CONFIG_DIR="$XDG_CONFIG_HOME/opencode"
else
  CONFIG_DIR="$HOME/.config/opencode"
fi
```

### TDD Approach
1. **RED phase:** 编写测试，验证失败（确认 bug 存在）
2. **GREEN phase:** 实现修复，测试通过
3. **REFACTOR phase:** 添加注释，明确优先级顺序

## Impact

### User Impact
- ✅ 修复后，在设置了 XDG_CONFIG_HOME 的机器上，配置文件会写入正确位置
- ✅ 自定义主题、MCP 配置等可以正确加载
- ✅ 符合 Linux/Unix 社区的标准实践

### Backward Compatibility
- ✅ 完全向后兼容
- ✅ 未设置 XDG_CONFIG_HOME 的用户行为不变
- ✅ 显式设置 OPENCODE_CONFIG_DIR 的用户行为不变

## References

- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/)
- [Arch Wiki: XDG Base Directory](https://wiki.archlinux.org/title/XDG_Base_Directory)
- [OpenCode Configuration Guide](https://github.com/anomalyco/opencode)

## Resolution

**Fixed in commit:** `init_opencode.sh` line 23-31  
**Test coverage:** `tests/init-opencode-config-dir.sh` (3 test cases, all passing)  
**Verification:** User should test on affected machine to confirm theme sync works

---

## Lessons Learned

1. **遵循标准：** 配置文件路径应该遵循平台标准（如 XDG），而非假设默认值
2. **多层回退：** 环境变量优先级设计应考虑完整的回退链
3. **TDD 价值：** 通过测试明确定义预期行为，避免回归

# Codex AGENTS.md legacy cleanup 在大小写不敏感文件系统上会误删 canonical 入口

## 现象

将 Codex 全局规则入口从 `~/.codex/agents.md` 改为 `~/.codex/AGENTS.md` 后，
尝试清理小写 legacy 软链时，`~/.codex/AGENTS.md` 也随之消失。

## 调用链

1. `init_codex.sh` 设置 `CODEX_AGENTS_PATH="$CODEX_HOME/AGENTS.md"`。
2. 脚本创建 `~/.codex/AGENTS.md -> <repo>/claude/CLAUDE.md`。
3. 新增的 `cleanup_legacy_codex_agents` 检查 `~/.codex/agents.md`。
4. 在当前文件系统上，`AGENTS.md` 与 `agents.md` 是同一个路径别名。
5. `rm -f ~/.codex/agents.md` 等价于删除 `~/.codex/AGENTS.md`。

## 假设

初始假设是大小写不同的两个路径可以安全并存：大写作为 canonical 入口，小写作为
legacy 入口被清理。这个假设在大小写敏感文件系统成立，但在当前 macOS 用户目录
不成立。

## 验证

执行实际同步命令后：

```sh
ln -sfn /Users/leshi.zhy/claude-config/claude/CLAUDE.md /Users/leshi.zhy/.codex/AGENTS.md
rm -f /Users/leshi.zhy/.codex/agents.md
ls -la /Users/leshi.zhy/.codex/AGENTS.md /Users/leshi.zhy/.codex/agents.md
```

结果两个路径都报 `No such file or directory`。随后用非覆盖式 `ln -s` 恢复
`AGENTS.md` 后，`ls` 同时显示 `AGENTS.md` 和 `agents.md`，说明两个名字在当前
路径解析中互为别名。

## 确认

根因是 cleanup 策略假定大小写敏感；但用户目录大小写不敏感时，不能用删除小写路径
的方式清理 legacy 入口。正确策略应只把 canonical 写入目标改成 `AGENTS.md`，不要
自动删除小写别名；如果需要提示，可输出说明而不是删除。

## 影响范围

- 影响 `init_codex.sh` 新增的 `cleanup_legacy_codex_agents` 逻辑。
- 在大小写不敏感文件系统上运行会删除 canonical `~/.codex/AGENTS.md` 入口。
- 在大小写敏感文件系统上删除小写 legacy 虽然安全，但不是必需行为；保留小写兼容入口
  不影响 Codex 读取大写 `AGENTS.md`。

## 建议修复

移除 `cleanup_legacy_codex_agents` 自动删除逻辑。保留：

- `CODEX_AGENTS_PATH="$CODEX_HOME/AGENTS.md"`
- README 和测试中明确大写是 canonical

不再尝试自动清理 `~/.codex/agents.md`。

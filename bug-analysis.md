# Bug Analysis: init_codex.sh remove_table NameError

## 现象

运行 `bash init_codex.sh` 在写入 `~/.codex/config.toml` 阶段失败：

```text
Traceback (most recent call last):
  File "<stdin>", line 22, in <module>
NameError: name 'remove_table' is not defined
```

## 调用链

用户要求移除 Superpowers wrapper 后，我修改 `init_codex.sh` 的
`write_codex_managed_config()`。脚本执行到该函数时，通过 heredoc 启动内联
Python。Python 读取 `~/.codex/config.toml`，移除 managed block 后，立刻调用
`remove_table()` 清理遗留的 `marketplaces.superpowers-dev` 和
`plugins."superpowers@superpowers-dev"` 表。此时函数定义还在调用语句之后，解释器
尚未执行到 `def remove_table(...)`，因此抛出 `NameError`。

## 根因假设

1. `remove_table()` 定义顺序错误，调用发生在定义之前。
2. heredoc 中函数名拼写不一致。
3. shell 环境变量传递缺失导致 Python 段提前进入错误分支。

## 验证方式

查看 `init_codex.sh` 行号：调用在第 296-297 行，函数定义在第 300 行开始。
错误信息精确指向 `remove_table` 未定义，排除环境变量和拼写分支问题。

## 根因确认

根因是内联 Python 中 `remove_table()` 的定义位置晚于首次调用。

## 影响范围

任何执行 `write_codex_managed_config()` 的 `bash init_codex.sh` 调用都会失败，导致
Codex managed config 无法刷新，也无法自动清理旧的 `superpowers-dev` marketplace
配置。

## 修复方案

把 `remove_table()` 函数定义移动到首次调用之前，并保持清理逻辑只删除
`marketplaces.superpowers-dev` 和 `plugins."superpowers@superpowers-dev"` 两个表。

该修复只改变内联 Python 的声明顺序，不改变配置生成内容，不会影响 MCP server
表生成和 skills 链接流程。

## 验证计划

- `bash -n init_codex.sh`
- `bash init_codex.sh`
- `rg "superpowers-dev|superpowers@superpowers-dev" ~/.codex/config.toml init_codex.sh`
- `test ! -e codex/marketplaces`

## 修复结果

已将 `remove_table()` 调用移动到函数定义之后。

验证结果：

- `bash -n init_codex.sh` 通过
- `bash init_codex.sh` 通过并写回 `~/.codex/config.toml`
- `~/.codex/config.toml` 不再包含 `marketplaces.superpowers-dev` 或
  `plugins."superpowers@superpowers-dev"`
- `codex/marketplaces` 不存在

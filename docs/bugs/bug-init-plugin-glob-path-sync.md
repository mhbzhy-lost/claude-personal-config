# Bug: init plugin 同步在 glob 字符路径下不完整

## 现象

外部 push review 指出 `init_opencode.sh` 使用 `for src_file in "$src_path"/*` 遍历 plugin 源目录；当仓库路径包含 `[`、`]`、`*`、`?` 等 glob 元字符时，正常 plugin 同步可能静默失效。

## 根因 (6 要素)

1. **触发条件**：checkout 路径或上级目录名包含 shell glob 元字符，并运行 `sync_opencode_plugins`。
2. **期望链路**：逐个枚举 `userconf/plugins/` 下的真实目录项，既清理废弃 plugin 软链，也继续同步仍然有效的 plugin 文件。
3. **实际链路**：`"$src_path"/*` 只引用了目录前缀，尾部 `*` 仍由 shell 做模式展开；路径中 glob 元字符会参与匹配语义。
4. **关键假设失效**：实现假设仓库路径不会包含 glob 元字符，且 shell 模式展开等价于按目录列文件。
5. **旁证**：回归测试把仓库复制到 `opencode-[plugins]-...` 路径后，废弃软链可清理，但需要额外断言有效 plugin 仍能建链才能覆盖静默同步缺失。
6. **实现偏差**：目录枚举应使用按路径读取的方式，而不是拼接 shell glob；否则路径名内容会影响同步语义。

## 修复方案

`sync_opencode_plugins` 改用 `find "$src_path" -mindepth 1 -maxdepth 1 -print0` 和 NUL 分隔读取目录项，并保留对子目录跳过、普通文件同步、废弃 plugin 忽略的既有行为。

## 验证

`userconf/plugins/test/init-opencode-agents.test.mjs` 在包含 glob 字符的临时仓库路径下同时断言废弃 `session-journal.js` 被清理、有效 `dummy-plugin.js` 仍创建软链。

# OpenCode 空目录启动加载到失效的 cache-proxy 插件目录

## 现象

在普通空目录执行 `opencode -c` 时，OpenCode 报错：cache-proxy 的 `plugins/`
目录缺少 `package.json` 或入口文件，插件安装失败。

## 根因分析六要素

1. **触发条件**：全局配置曾使用 `plugin-list` 模式写入 cache-proxy 的 `plugins/` 目录，之后初始化流程切换到 `symlink` 模式。
2. **直接现象**：`~/.config/opencode/opencode.json.plugin` 仍包含 vendor `plugins/` 目录，同时 `~/.config/opencode/plugins/bailian-cache-proxy.js` 已存在按文件软链。
3. **期望链路**：`symlink` 模式只依赖 OpenCode 对全局 `plugins/*.js` 的自动发现，不应再保留同一插件的目录安装项。
4. **实际链路**：`configureOpenCodeCacheProxy` 在 `symlink` 分支只创建软链，没有移除自己曾在 `plugin-list` 模式写入的目录项。
5. **根本原因**：配置器缺少从 `plugin-list` 到 `symlink` 的幂等迁移清理，导致旧配置跨版本残留。
6. **修复与验证**：`symlink` 模式删除精确匹配的托管目录项但保留其他插件；用单测覆盖迁移，并在空目录验证 OpenCode 可加载。

## 风险边界

只删除等于当前 cache-proxy `plugins/` 绝对路径的条目，不清理用户自管插件或其他目录。

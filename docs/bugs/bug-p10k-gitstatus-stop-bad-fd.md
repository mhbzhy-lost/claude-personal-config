# Bug: source ~/.zshrc 后 p10k gitstatus_stop 报 bad file descriptor

## 现象

用户在应用终端配色调整后看到：

```text
gitstatus_stop_p9k_:48: failed to close file descriptor 13: bad file descriptor
```

## 根因 (6 要素)

1. **触发条件**：在已经加载过 Powerlevel10k 的交互 zsh 中执行 `source ~/.zshrc`，
   或其他方式让同一个 shell 进程重复加载 `powerlevel10k.zsh-theme` 与
   `~/.p10k.zsh`。
2. **期望链路**：重载配置时 p10k 调用 `p10k reload`，停止旧的 gitstatus daemon，
   关闭请求/响应/锁相关 fd，然后重新初始化 prompt。
3. **实际链路**：`gitstatus_stop_p9k_ POWERLEVEL9K` 尝试关闭记录在
   `_GITSTATUS_*_FD_POWERLEVEL9K` 中的 fd，其中一个 fd 在当前进程里已经无效，
   zsh 在 `exec {fd}>&-` 处报告 `bad file descriptor`。
4. **关键假设失效**：我建议用 `source ~/.zshrc` 立即生效，但 p10k 的配置并不适合
   在已初始化的同一 shell 中完整重复 source；更稳妥的重载方式是新开终端或
   `exec zsh`。
5. **旁证**：`~/.p10k.zsh` 末尾存在：

   ```zsh
   (( ! $+functions[p10k] )) || p10k reload
   ```

   Powerlevel10k 的 `_p9k_deinit` 会调用：

   ```zsh
   gitstatus_stop_p9k_ POWERLEVEL9K
   ```

   `gitstatus.plugin.zsh` 中 stop 函数会关闭 `req_fd`、`resp_fd` 等 fd。
6. **实现偏差**：本次配色改动只改了 prompt 颜色和
   `ZSH_HIGHLIGHT_STYLES`，没有直接改 gitstatus；异常来自“让配置在当前 shell
   热重载”的操作方式，而不是浅色配色值本身。

## 证据

- `~/.p10k.zsh` 的颜色块已成功替换，`zsh -n ~/.p10k.zsh` 语法通过。
- `~/.zshrc` 的高亮配置已成功追加，`zsh -n ~/.zshrc` 语法通过。
- p10k 配置中存在 `p10k reload`；p10k 内部 deinit 路径调用
  `gitstatus_stop_p9k_`。
- `gitstatus_stop_p9k_` 的实现会基于保存的 fd 变量执行 `exec {fd}>&-`，与报错
  文本吻合。

## 影响范围

- 主要影响当前已经打开、又执行过 `source ~/.zshrc` 的终端会话。
- 新开 iTerm2 tab/window 通常不走“同一进程重复 stop 旧 gitstatus”的路径。
- 如果某个脚本或 alias 经常自动 `source ~/.zshrc`，则可能重复出现。

## 待确认修复方向

推荐：不再用 `source ~/.zshrc` 作为 p10k 生效方式，改用 `exec zsh` 或新开 tab。

可选增强：在 `~/.zshrc` 中加一个交互式 guard，避免同一 shell 重复 source 时再次
加载 Powerlevel10k。代价是以后手动 source `.zshrc` 时，p10k 相关改动不会立即热重载，
需要 `exec zsh`。

## 修复记录

待用户确认后执行。

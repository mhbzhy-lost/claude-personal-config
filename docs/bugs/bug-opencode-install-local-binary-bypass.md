# bug-opencode-install-local-binary-bypass

**现象**：执行 `bash init_opencode.sh` 时，脚本先成功初始化
`vendor/opencode-cache-proxy` submodule，随后进入 OpenCode 安装分支并失败：
`Failed to fetch version information`。

**调用链**：`init_opencode.sh` 主流程 → submodule guard 拉取
`vendor/opencode-cache-proxy` → `command -v opencode` 未命中 → 执行
`curl -fsSL https://opencode.ai/install | bash` → 官方安装器请求
`https://api.github.com/repos/anomalyco/opencode/releases/latest` → GitHub API
返回 rate limit 结果，安装器无法解析 `tag_name` → 输出
`Failed to fetch version information` 并退出。

**根因假设**：

1. 本地已有 OpenCode 二进制，但目录未加入当前非交互 shell 的 `PATH`，脚本只用
   `command -v opencode` 检测，误判为未安装。
2. 当前 shell 设置了 `http_proxy` / `https_proxy` 到 `127.0.0.1:7897`，安装器内
   GitHub API 请求经代理出口命中未认证 rate limit。
3. 官方安装器或上游 release API 临时不可用。

**验证方式**：

- `command -v opencode` 当前无输出，说明主流程会进入安装分支。
- `env | rg -i '^(https?_proxy|all_proxy|no_proxy)='` 看到
  `http_proxy=http://127.0.0.1:7897` 与
  `https_proxy=http://127.0.0.1:7897`。
- `curl -s https://api.github.com/repos/anomalyco/opencode/releases/latest`
  返回 GitHub API rate limit JSON；同一请求加 `--noproxy '*'` 可返回
  `v1.15.10` release JSON。

**根因确认**：部署脚本只检查当前 `PATH`，未识别常见本地安装路径；一旦误入官方
安装器，就会受代理出口的 GitHub API rate limit 影响而失败。

**影响范围**：所有本地已安装 OpenCode 但未暴露到非交互 shell `PATH` 的机器都会误走
安装器；所有设置了受限 HTTP(S) 代理的机器在官方安装器 GitHub API 步骤也可能失败。

**修复方案**：

- 把安装检测抽成 `ensure_opencode_installed`，优先查 `command -v opencode`。
- 若未命中，再检查 `OPENCODE_BIN`、`~/.opencode/bin/opencode`、
  `~/.local/bin/opencode`、Homebrew 常见路径等本地二进制；命中时把所在目录临时加入
  本次脚本 `PATH` 并跳过安装器。
- 未发现本地二进制时仍保留原官方安装逻辑，不改变新机器 bootstrap 行为。

**为什么不会引入新问题**：本地二进制必须是可执行文件才会被接受；只临时扩展当前脚本
进程的 `PATH`，不会改写用户 dotfiles。找不到本地二进制时仍走原安装路径。

**修复后验证计划**：

- 新增单测：`OPENCODE_BIN` 指向可执行文件且当前 `PATH` 不含 opencode 时，
  `ensure_opencode_installed` 应跳过 `curl` 安装，并把二进制目录加入 `PATH`。
- 重跑新增 opencode init 单测。
- 重跑真实 `bash init_opencode.sh`，确认不再因为已有本地二进制而进入安装器；若本机确实
  没有 OpenCode 二进制，则结果应明确停在“未安装且官方安装失败/需安装”而不是误报
  proxy 配置成功。

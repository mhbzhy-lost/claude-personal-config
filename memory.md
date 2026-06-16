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

## bash 单引号 Python heredoc 内的 apostrophe 提前终止字符串

**现象**：`init_opencode.sh` 改 model list 时加了一行注释 `# only models that actually exist on the user's endpoint.`，重跑 init 报：

```
File "<string>", line 139
    desired_bailian_cache = {
                            ^
SyntaxError: '{' was never closed
```

**根因**：Python 代码块用 `$PY -c '...'` 单引号包裹整体送给 Python。注释里的 `user's` 含一个 ASCII 单引号 `'`，bash 看到立即结束 `$PY -c` 的字符串，后面的 Python 源码被截断。Python 拿到不完整的脚本，从某个早就结束了的 `{` 开始报"未闭合"的迷误。

**陷阱位置**：`init_opencode.sh` line 422 附近（已修），其他可能踩坑的地方是任何用 `$PY -c '...'` / `bash -c '...'` 内嵌大段字符串的位置。

**规避**：
1. 内嵌长 Python / shell 时**禁止**写 ASCII 单引号——用全角 `’` 或改写句子（`user's` → `user`）。`don't` `it's` `we'll` 同样踩。
2. 反引号 `` ` `` 在双引号 `"..."` 字符串里会触发命令替换，同样致命；写中文长文本一并避免。
3. 中文长文本走 `apply_patch` / `Write` 工具直接写文件；只有必须时才走 `python3 - <<'PY'` heredoc，且 heredoc 标签必须加单引号（`'PY'`）防止变量展开。
4. 若必须 inline 一段含 `'` 的代码，改用 `$PY <<'PY' ... PY` heredoc 而非 `$PY -c '...'`。

**早期识别**：`bash -n script.sh` 不会报这种错（shell 语法本身合法）；要用 `python3 -c "import ast; ast.parse(open('script.sh').read())"` 也不行（混合脚本）；最好的诊断是 init 脚本跑一次就暴露了，但前提是覆盖到那段 Python 的执行路径。

## superpowers skill 路径中 # 的正确处理

**现象**：Skill 工具返回的 base directory 路径中 `#v5.1.0` 被 URL-encoded 为 `%23v5.1.0`。直接使用 `%23` 路径调用 Read/Glob/Bash 会报 `No such file or directory`。

**根因**：Skill 元数据中路径经 URL encoding（`#` → `%23`），但 macOS 文件系统目录名使用字面 `#`。工具调用时 `%23` 不会被自动解码。

**修复**：将路径中 `%23` 手动替换为 `#`，且 bash 中 `#` 是注释符，整段路径必须用双引号包裹。Read/Glob 工具直接用 `#` 即可，无需双引号处理。

## 微信小程序 / Taro 渲染异常排查

**触发场景**：mp:snap 出 6800 字节（约）纯白 PNG / 页面整片空白 / IDE 模拟器看不到内容。

**第一反应**：**这是 bug，走 §Bugfix 流程**——不是 CSS 微调，不是"改改 100vh 试试"。
看到 6800b 空白先：

1. `cat ~/.claude/memory.md` 通读（你正在做的事）
2. `/knowledge-retrieval wechat-mp + taro` 拉相关 skill
3. 列 1-3 候选根因（不是单点假设硬试）
4. 写 `bug-analysis.md` 再动手

**已知根因清单**（按概率排序）：

| 根因 | 信号 | 修法 |
|---|---|---|
| **React 保留 prop `key` 被剥离** | 自定义函数组件 props 里 `key` 是 undefined | 重命名为 `sectionKey` / `itemKey` 等业务名 |
| **第三方组件库 import 名错** | React error #130 (Element type is invalid: got undefined) | 查库 README 实际 export 名（vantui 没 `Input`，叫 `Field`；其他库类似） |
| **TabbarShell / 其他 SDK 接入参数名错** | tab.render is not a function 等 | 对照 SDK types/d.ts 检查 prop 名 |
| **`<scroll-view scroll-y>` flex:1 高度塌缩** | 内容渲染了但看不见 + 父容器 flex 链 | scroll-view 必须显式 `height`（WX 文档明写） |
| **Taro flex 跨 native custom-component 边界失效** | 深嵌套 + `height:100vh` + 多层 flex 的页面整片白 | 改用 `min-height:100vh` + 块级布局；不依赖跨边界的 flex/100% 链 |
| **vantui 自定义组件未注册** | vantui 元素退化为纯文字（"Test Button" 而非按钮） | 配 `usingComponents` 或用 `addGlobalClass` |

**不是"调 CSS"问题的诊断手段**：

```tsx
// 1. 加 React error boundary 抓真实异常
class ErrBoundary extends Component {
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return <View><Text>CRASH: {String(this.state.err.message)}</Text></View>;
    return this.props.children;
  }
}

// 2. 在子组件外侧加显眼 marker，确认 page wrapper 渲染了
<View style={{background:'red',padding:'16px'}}><Text>MARKER_BEFORE</Text></View>
<TargetComponent ... />
<View style={{background:'green',padding:'16px'}}><Text>MARKER_AFTER</Text></View>

// 3. node 里直接探 SDK exports
node -e "const m=require('node_modules/<lib>/lib/<sub>/index.js'); console.log(Object.keys(m), Object.entries(m).map(([k,v])=>[k,typeof v]))"
```

**WeChat DevTools 自动化坑**：

- 服务端口默认关，必须先编辑 `WeappLocalData/localstorage_b72da75d79277d2f5f9c30c9177be57e.json` 把
  `security.enableServicePort` 改 true，**重启 IDE 后才生效**（IDE 启动时读 file，运行中只写不读）
- `cli auto --auto-port 9421` 的 `--auto-port` flag 实际**不绑定到指定端口**，IDE
  自分配。要拿 port 必须 `lsof -iTCP -sTCP:LISTEN -P | grep wechatweb`
- 长 automator 会话（snap 15+ 页）会让后续页面都返回 6800b 空白；现象是
  **同一份 dist 同一段代码，前几张正常后几张空白**——必须 pkill IDE +
  `lsof -ti :9421 | xargs kill -9` 重启
- IDE crash 后 settings 文件被覆盖回 `enableServicePort:false`，重启前必须重写

**实测路径**：项目内的 `~/blocks-demo/miniprogram/scripts/snapshot.mjs`
是端到端可复用的截图驱动；新项目接 mp 自动化直接抄。

## 流程纪律：违反 CLAUDE.md 的元教训

**这次的违反 + 对应规则**（2026-05-14 mp 验收 session）：

| 违反 | 规则条款 | 后果 |
|---|---|---|
| 看到截图全白没走 §Bugfix 流程 | "禁止直接进入修复" | 浪费 ~1h 试错 |
| 没列 1-3 候选根因 | "列出 1-3 个候选假设" | 单点假设硬试 5 次错方向 |
| 改 5 次 CSS 没触发熔断 | "3 次失败必须 retrieval+WebSearch" | 用户 explicit 提示才转向 |
| 用 vantui Input 前没查 README | §1 "Web 补充：未覆盖的外部 API" | React error #130 浪费 20 min |
| 全程没 `cat memory.md` | §全局记忆 "动手前先扫" | 同类坑下次还会踩 |

**反违反内化规则**：

1. "看似简单的现象"是最容易跳流程的陷阱——**越觉得简单越要走完整流程**
2. 改假设不重置熔断计数——同一症状下的所有尝试合并算
3. 用任何第三方 SDK 之前先 `cat node_modules/<lib>/README.md` 或 `node -e require()` 探 exports
4. retrieval 不是"找 fix 的地方"，是"动手前建立 prior 概率"——开工前用，不是卡壳后用

## 自动化脚本与平台集成经验

这组记忆都来自远端自动化：shell 负责把脚本、配置和平台命令送到另一个环境，
最容易在“还没进入业务逻辑”之前失败。先保证脚本传输、解释器、PATH、登录态和
平台 API 参数可诊断，再谈业务修复。

### Python heredoc / shell 拼接中文长文本的编码与引用坑

**现象**：用 `python3 - <<'PY'` 执行包含中文字符串的脚本时，可能报
`SyntaxError: Non-UTF-8 code starting with ... but no encoding declared`；改用
`python3 -c "..."` 时，如果说明文本里含反引号，zsh 会先做命令替换，出现
`command not found` 或 glob qualifier 错误。

**根因**：长 Markdown/中文内容直接嵌入 shell 命令会同时踩 Python 源码编码和
shell 引用/命令替换规则；失败常发生在解析阶段，尚未进入文件 I/O。

**规避**：写中文长文本优先用 `apply_patch`；若必须跨沙箱用脚本写外部路径，让
shell 只传 ASCII（如 base64 载荷），再由 Python 解码并
`write_text(..., encoding='utf-8')`。不要把包含中文、反引号或大量 Markdown 的正文
直接塞进 heredoc / `python -c` 命令字符串。

### zsh 脚本避免覆盖特殊参数 status/path

**现象**：远端 zsh wrapper 中使用 `status=$?` 会报 `read-only variable: status`；
函数中使用 `local path="$1"` 后，即使 `PATH` 原本包含 `/bin`，函数内仍可能报
`command not found: cp`。

**根因**：zsh 有若干特殊参数。`status` 是上一条命令退出码的只读参数；`path`
是与 `PATH` 绑定的数组。把普通业务变量命名为 `status` 或 `path` 会覆盖/触发
这些特殊语义，破坏状态保存或命令查找。

**规避**：zsh 脚本里不要用 `status`、`path` 作普通变量名。保存退出码用
`exit_code`，文件路径变量用 `target_file`、`file_path`、`script_path` 等。

### 远程 SSH 脚本执行的 zsh/macOS 坑

**场景**：通过 `ssh host 'zsh -s' <<'REMOTE'` 或封装脚本在远端 macOS 上安装
Homebrew 工具、改 `.zshrc`、配置开发环境。

**不要把长脚本直接流给远端 shell 的 stdin。** 如果脚本中途执行 `brew install`、
安装器或其他可能读 stdin 的子进程，子进程可能消费后续脚本文本，导致后半段配置
静默不执行。更稳的模式是先把脚本写入远端临时文件，再执行该文件：

```sh
tmp_script="$(mktemp -t setup-name)"
trap 'rm -f "${tmp_script}"' EXIT
cat >"${tmp_script}"
zsh "${tmp_script}"
```

**macOS/BSD `mktemp` 和 GNU 行为不同。** macOS 上优先用 `mktemp -t name`。
不要依赖 GNU 风格的后缀模板，如 `mktemp /tmp/name.XXXXXX.zsh`，否则可能在远端
生成失败或行为不一致。

**zsh glob 无匹配默认报错。** 清理 `~/.pyenv.disabled.*` 这类路径时，如果没有
匹配项，zsh 会报 `no matches found`。需要用 zsh null-glob qualifier：

```zsh
for pyenv_dir in "${HOME}/.pyenv" "${HOME}"/.pyenv.disabled.*(N); do
  ...
done
```

**非交互 shell 不应加载需要 TTY/ZLE 的插件。** `fzf` key-bindings、`uv`
completion、任何调用 `zle` 的脚本都应加 TTY guard：

```zsh
if [[ -t 0 && -t 1 ]]; then
  ...
fi
```

否则远端非交互验证可能出现 `(eval):1: can't change option: zle`，或在没有终端时
阻塞/输出噪声。托管 `.zshrc` 也应区分基础环境和交互增强：`PATH/proxy/LANG`
可在非交互加载，prompt、completion、key binding 只在交互 shell 加载。

**修改 `.zshrc` 要可重复、可回滚、尽量原子。** 不要直接覆盖用户整份 `.zshrc`。
更稳做法：

- 先备份原文件
- 把大段配置写入 `~/.zshrc.d/<name>.zsh`
- 在 `.zshrc` 中只维护一段有 marker 的 source block
- 重跑时先删除旧 marker block 再追加新 block
- 用临时文件 + `mv` 替换 `.zshrc`，不要 `cat tmp > ~/.zshrc` 截断式写入

**远端命令的 `PATH` 不可信。** 远端非登录 shell、用户旧 dotfile 或 zsh 特殊变量
污染都可能导致 `cp/mv/awk/rm` 解析异常。远程脚本开头显式设置基础路径：

```zsh
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
```

同时避免 zsh 特殊变量名（见 `status/path` 章节）。

### Codex MCP 配置指向缺失 .venv/bin/python 会 ENOENT

**现象**：远端启动 `codex` 时出现：

```text
MCP client for `block-catalog` failed to start: MCP startup failed: No such file or directory (os error 2)
MCP client for `skill-catalog` failed to start: MCP startup failed: No such file or directory (os error 2)
```

**根因**：`~/.codex/config.toml` 的 `mcp_servers.<name>.command` 使用绝对路径指向
某个 MCP 项目的 `.venv/bin/python`。如果 `.venv` 没创建、被清理、或目录存在但
`bin/python` 缺失，Codex 在 spawn 阶段直接收到 OS `ENOENT`，还没进入 Python
模块导入。

**诊断**：

```sh
grep -A5 'mcp_servers' ~/.codex/config.toml
test -x /path/to/mcp/.venv/bin/python || echo missing
/path/to/mcp/.venv/bin/python -c 'import importlib.util; print(importlib.util.find_spec("pkg.server"))'
```

不要用 `python -m pkg.server` 做导入验证，因为 MCP server 模块可能在 import/startup
阶段读取 env 并退出。用 `importlib.util.find_spec` 验证模块可发现性更安全。

**修复**：在 MCP 项目目录重建 venv 并 editable 安装。若 `.venv` 目录存在但不完整，
用 `--clear`：

```sh
cd /path/to/mcp/skill-catalog
uv venv --clear --python 3.14 .venv
.venv/bin/python -m pip install -e .
```

若项目声明 `requires-python >=3.11`，不要用 macOS `/usr/bin/python3`（常见为
3.9.x）；优先用 `uv` 管理的 Python。

## Codex subagent 派发时的提权提示

**场景**：Codex 主会话创建 subagent，让其再调用需要外部服务、隔离 worktree 或
写入 `.git/worktrees` 的 worker（例如 `opencode-deepseek-worker`）。

**已知问题**：subagent 遇到权限审查 / sandbox 拦截时，可能直接把任务标记为
blocked，而不是像主会话一样发起 `require_escalated` 请求。实际成功案例表明：
在 prompt 中明确要求 subagent 遇到审查拦截时尝试提权重跑，审批可通过并完成任务。

**规避**：以后 Codex 派发 subagent 时，worker prompt 必须写明：

- 如果创建 worktree、调用外部 worker、访问授权资源时被 sandbox / 审查拦截，不要立刻放弃。
- 先按当前任务已授权范围发起 `require_escalated` 请求，并使用合理的 `prefix_rule`。
- 只有提权请求被明确拒绝、或授权范围与任务不匹配时，才返回 blocked。

## Generated artifact 的 EOF 空白必须修生成器

**现象**：`git diff --check <base>..HEAD` 对新增生成文件报
`new blank line at EOF`。单看文件时只是末尾多一个空行，例如 generated Markdown
最后一节自带换行，外层 renderer 又追加一次终止换行。

**常见误修**：直接手删生成物末尾空行。若项目有 render-equivalence / canonical
renderer 校验，这会让生成物与 canonical output 不一致，下一次 `check` 或重新渲染
又会失败 / 反复产生 diff。

**正确处理**：

1. 先确认生成链路：artifact 是由哪个 renderer / serializer / formatter 写出的。
2. 在生成器层修复尾随空白，只保留一个 POSIX 文件终止换行，不保留 EOF 空白行。
3. 加单测直接断言生成文本不以 `"\n\n"` 结尾。
4. 重新生成受影响 artifact，再同时跑：
   - artifact 的 equivalence/check 命令
   - `git diff --check <base>..HEAD`

**判断原则**：凡是 generated artifact 被 canonical check 管控，空白问题默认先查
generator，不要把手工编辑生成物当成修复。

## tmux wheel binding 覆盖破坏 TUI 应用滚动

**现象**：通过 tmux session 封装 opencode/codex（或任何使用 alternate screen buffer
的 TUI 应用），滚轮无法滚动查看应用内历史。

**根因**：`configure_tmux_session` 用 session-level `bind-key` 自定义了
`WheelUpPane`/`WheelDownPane`，强制进入 `copy-mode`。即使加了 `alternate_screen`
判断（错误用法：tmux 的正确变量名是 `alternate_on` 而非 `alternate_screen`），
也会覆盖 tmux 3.6a 内置的默认绑定——而内置绑定本身已经正确处理了三种场景：
`#{||:#{alternate_on},#{pane_in_mode},#{mouse_any_flag}}` 为真时透传给应用，
否则才进入 `copy-mode -e`。

**修法**：移除 session-level 的 `WheelUpPane`/`WheelDownPane` 自定义 `bind-key`，
只保留 `mouse on` / `history-limit` / `mode-keys vi`，让 tmux 内置默认绑定生效。

**已修**：`bin/remote-opencode`、`bin/remote-codex` 的 `configure_tmux_session`
函数。部署后需要 `tmux kill-server` 杀旧 session 再重连才能生效。

**通用规则**：不要在 `mouse on` 的 session 里覆盖 `WheelUpPane`/`WheelDownPane`，
tmux 3.5+ 内置的 wheel binding 已经是最优解。

## Codex 沙箱内本地端口监听 / 访问被拒

**现象**：在 Codex 沙箱内启动 Uvicorn 等本地 HTTP 服务时报：

```text
[Errno 1] error while attempting to bind on address ('0.0.0.0', 18080): operation not permitted
```

改成 `127.0.0.1` 仍然可能报同类错误。即使服务在沙箱外启动成功，沙箱内
`curl --noproxy '*' http://127.0.0.1:<port>/...` 也可能连接失败。

**根因**：当前 Codex 沙箱限制进程监听本地 socket，并隔离沙箱内进程访问沙箱外
启动的本地端口。这是本地验证环境限制，不代表应用启动脚本或 HTTP 服务不可用。

**解法**：需要真实端口 smoke 时，用 `require_escalated` 在沙箱外启动服务，并且
也在沙箱外执行 `curl` 验证。不要因为本地沙箱报错把容器生产默认 host 从
`0.0.0.0` 改成 `127.0.0.1`，否则容器外部可能无法访问。

## 本地 curl 被代理到 127.0.0.1:7897

**现象**：请求本地服务时：

```text
curl: (7) Failed to connect to 127.0.0.1 port 7897 after 0 ms: Couldn't connect to server
```

明明命令目标是 `127.0.0.1:<service-port>`，错误却显示连接代理端口 `7897`。

**根因**：shell 环境里存在 HTTP 代理变量，但 localhost 没有被 `NO_PROXY` 正确
排除，`curl` 先连接本机代理；代理未运行或沙箱内不可达，于是请求没有到达服务。

**解法**：本地 smoke 用 `curl --noproxy '*' ...` 绕过代理。若服务在沙箱外启动，
curl 本身也要在沙箱外执行，否则还会受 Codex 沙箱本地端口隔离影响。

## opencode task tool 的 subagent_type 只有 explore 和 general

**现象**：派发 subagent 时报 `Unknown agent type: general-purpose is not a valid
agent type`。

**根因**：opencode task tool 的 `subagent_type` 参数只接受两个值：

- `explore`：专用于代码探索、文件搜索、关键字检索
- `general`：通用多步骤任务

**易错点**：容易混淆 `general-purpose`（Claude Code 的 agent type）与 opencode
的 `general`。两者不是同一个枚举。派发 opencode 任务时只用 `general` 或 `explore`。

**规避**：每次调 task tool 前，`subagent_type` 直接写 `general`，不要尝试其他名字。

## Claude Code 安装 OpenAI Codex 插件

OpenAI 官方 Codex Claude Code 插件的 marketplace 源是 `openai/codex-plugin-cc`，
注册后 marketplace 名称是 `openai-codex`，插件安装名是 `codex@openai-codex`。
手动安装命令：

```sh
claude plugins marketplace add openai/codex-plugin-cc
claude plugins install codex@openai-codex
```

在本仓 `init_claude.sh` 中，marketplace 注册由脚本显式处理；实际插件安装由
`claude/plugins.list` 的 `codex:openai-codex` 条目驱动，统一走后续
`claude plugins install "$key"` 清单循环。

安装后 `claude plugins details codex@openai-codex` 应显示 `Agents (1) codex-rescue`。

## Codex hooks.json 验证链路差异

Codex App 会话会在会话内加载 `~/.codex/hooks.json`，但修改该文件后当前会话不一定
热加载新增 hook。排查 push hook 时，`git commit` 探针仍被旧 PreToolUse 拦截，
而新增 `external-review-gate` 在同一会话的 `git push` 中没有生成 marker。

不要用 `codex exec` 直接等价验证 App 会话 hook：Codex CLI 0.134.0 的
`codex exec --json` 事件显示 shell 为 `command_execution`，实测即使临时加
`matcher: ".*"` 的 `~/.codex/hooks.json` 探针，也没有收到 payload。验证 App hook
需要新开 App/Codex 会话，或在当前会话中用无副作用探针确认已加载的 hook 集合。

## Anthropic 兼容缓存命中关键字段

在 Anthropic 兼容端点上，prompt cache 命中不依赖 `x-claude-code-session-id`。
实测同一缓存前缀在相同 session、不同 session、无 session 下都能命中。

真正影响缓存隔离的是请求体里的 `metadata.user_id`：稳定填充同一个
`metadata.user_id` 时可读到缓存；删除 metadata、空 metadata，或两次请求之间更换
`metadata.user_id` 都会导致重新创建缓存。给 opencode 这类客户端做缓存代理时，
如果客户端不稳定提供该字段，proxy 应在非 bypass 模式下补一个稳定、低敏的
`metadata.user_id`。

## 本机安装指定 Xcode 与 iOS runtime 的注意点

`xcodes` CLI 可通过 Homebrew 安装；当前 1.6.2 没有单独 `sign-in` 子命令，
`xcodes install/download 26.2` 会在下载阶段要求 Apple Developer Apple ID 或
`FASTLANE_SESSION`。如果没有凭证，会报 `Apple ID: Missing username or a password`。

iOS runtime 的 `xcodes runtimes install` 参数要带平台名，例如 `iOS 26.2`，裸
`26.2` 会报 runtime invalid。当前 Xcode 26.5 下执行
`xcodebuild -downloadPlatform iOS -buildVersion 26.2` 会报 `iOS 26.2 is not
available for download`，因此更可靠的顺序是先装匹配的 Xcode，再用其组件/runtime
能力补齐配套 runtime。

本机 `xcodes install` 下载慢有两个独立原因：
1. 系统/环境代理 `127.0.0.1:7897` 会让 Apple CDN 大文件下载极慢；测试中
   `devimages-cdn.apple.com` 20MB 分片代理约 0.47MB/s，直连约 17MB/s。
2. `~/.aria2/aria2.conf` 启用了 `input-file/save-session/enable-rpc`，
   `xcodes` 调起 aria2 后可能只启动 RPC/session 而不实际写 `.xip`。

可行做法：让 `xcodes` 用代理拿 Apple Cookie，但把 aria2 替换成临时 wrapper，
wrapper 中 `unset *_proxy`，并使用空配置文件：

```sh
ARIA2_CONF=$(mktemp)
ARIA2_BIN=$(mktemp)
trap 'rm -f "$ARIA2_CONF" "$ARIA2_BIN"' EXIT
: > "$ARIA2_CONF"
cat >"$ARIA2_BIN" <<EOF
#!/bin/sh
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY all_proxy ALL_PROXY no_proxy NO_PROXY
exec aria2c --conf-path="$ARIA2_CONF" \
  --all-proxy= --http-proxy= --https-proxy= "\$@"
EOF
chmod +x "$ARIA2_BIN"
xcodes install 26.2 --directory /Applications --experimental-unxip --aria2 "$ARIA2_BIN"
```

若 `xcodes` 仍不推进，可先让 wrapper 记录 aria2 参数，再手动过滤掉
`--stop-with-process` 后执行 aria2；实测 Xcode 26.2 Apple silicon xip 可达到约
87MiB/s。

## OpenCode provider limit schema

OpenCode 1.15.13 的 `opencode.json` 中，custom provider 的 model `limit` 对象
不能只写 `context`。一旦出现 `limit`，schema 要求同时提供 `context` 和 `output`。
例如 Qwen context alias 应写成：

```json
"limit": { "context": 512000, "output": 65536 }
```

只写 `{ "context": 512000 }` 会导致启动时 `ConfigInvalidError: Missing key
...limit.output`，TUI bootstrap 闪退。

OpenCode 官方安装脚本入口是 `https://opencode.ai/install`，会安装到
`~/.opencode/bin/opencode` 并把 `export PATH=$HOME/.opencode/bin:$PATH` 写入
交互 shell 配置。脚本会先检查 PATH 里的现有 `opencode`，若版本相同会直接退出；
从 Homebrew 切到官方脚本时应先 `brew uninstall opencode`，再带代理执行：
`http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897 bash /tmp/opencode-install`。

## OpenCode legacy plugin 导出约束

OpenCode 1.17.7 的 legacy 外部 plugin loader 会把插件模块中每个导出的函数都当作
server plugin 入口执行。插件文件不要导出 helper 函数；helper 必须保持模块内私有。

实际踩坑：`workflow-hint.js` 同时导出 `WorkflowHintPlugin` 和
`getWorkflowHint`，loader 调用 `getWorkflowHint(pluginInput)` 得到 `null` 并塞进
hooks 列表，随后 `Provider.list` 访问 `hook.provider` 崩成
`TypeError: null is not an object (evaluating 'n.provider')`。回归测试应断言插件模块
只有真正的 plugin 入口函数导出。

2026-06-16 简化：删除 `getWorkflowHint` helper，只保留 `WorkflowHintPlugin`。插件
逻辑精简为只检查 `background: true`，编排决策从插件层移到 `claude/CLAUDE.md`。

## 并发编排决策框架（2026-06-16 定稿）

**阈值规则**：并发 < 3 走 subagent，≥ 3 走 Dynamic Workflow。串行多步也用
subagent 以隔离主对话上下文。

**关键事实（2026-06-16 确认）**：opencode 的 subagent 默认已有完整工具集（bash、
webfetch、playwright 等），机制如下：
- `task` 工具创建 subagent session 时，继承父 session 的 `permission: allow *`
- 默认 deny `todowrite`（避免污染父 session todo）和 `task`（禁止递归派发）
- 默认 deny 任何列入 `experimental.primary_tools` 的工具（未设置则不受影响）
- 实测后台模式的 general subagent 可执行 bash 命令

**演进历程**：
- 早期：hook/plugin 嵌入完整编排推荐（workflow vs subagent 决策树 + 逃生舱）
  → 实测 agent 几乎总走逃生舱，直接派发 subagent
- 2026-06-16 v1：把决策树移入 CLAUDE.md（硬约束），hook/plugin 只检查
  background:true；当时假设"subagent 工具集被硬编码限制为只读子集"，
  因此决策树按"工具可用性"写
- 2026-06-16 v2（修正）：通过分析 `TaskTool` 源码（minified 二进制中的
  subtask 执行逻辑）+ 实测 subagent bash 调用，确认默认工具集完整。
  v2 的"plan B（plugin 替换 task 工具）"从未实际实施，不需要——
  限制本来就只针对 todowrite/task/primary_tools 三项。
- CLAUDE.md 改为纯并发阈值 + subagent 优先。不再提及工具限制或 worktree，
  worktree 隔离只在 Dynamic Workflow 内部强制（workflow-usage skill 管辖）。
- 2026-06-16 v4（worktree 内置化）：Dynamic Workflow 现已内置 git worktree
  支持。`createWorkflow({ worktree: { enable, repoDir, branch, baseBranch } })`
  会在启动 server 前自动 `git worktree add` 并 `process.chdir()` 到新目录。
  脚本不自动合并/删除 worktree（冲突需 LLM 判断），在 IPC result 中报告
  worktree 信息让主 agent 执行合并。AGENTS.md 新增规则：coding 类 Dynamic
  Workflow 必须启用 `worktree.enable: true`。



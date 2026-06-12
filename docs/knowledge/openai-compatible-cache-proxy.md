---
title: OpenAI-compatible cache proxy
kind: integration
status: active
applies_to:
  - init_opencode.sh
  - init_qwen.sh
  - vendor/opencode-cache-proxy/
last_verified: 2026-06-11
source: OpenCode provider-driven proxy config migration; cache proxy lifecycle fix; Idealab OpenAI direct provider
---

# OpenCode 和 Qwen Code 共用子仓提供的 OpenAI-compatible 缓存代理

显式缓存代理的能力边界在 `vendor/opencode-cache-proxy/` 子仓内。主仓
`init_opencode.sh` / `init_qwen.sh` 只负责调用子仓配置入口，并维护各端自己的
外围配置。

## 适用场景

修改 OpenCode / Qwen Code 的缓存代理接入、provider 配置、生命周期 hook、
显式缓存策略、用量日志或初始化脚本时，必须检查本文。

## 项目事实 / 约定

子仓定位是 OpenAI-compatible chat completions cache proxy，不再是
OpenCode-only 或 Bailian-only。默认 upstream 仍指向 DashScope compatible-mode，
因为当前显式缓存 marker 依赖该类 Qwen 兼容接口支持。

子仓提供统一配置入口：

```bash
node vendor/opencode-cache-proxy/proxy/bin/bailian-cache-proxy-configure.mjs opencode
node vendor/opencode-cache-proxy/proxy/bin/bailian-cache-proxy-configure.mjs qwen
node vendor/opencode-cache-proxy/proxy/bin/bailian-cache-proxy-configure.mjs all
```

OpenCode 托管 provider id 包括：

- `openai-bailiab-api`：走 `@ai-sdk/openai-compatible`，上游为 DashScope
  compatible-mode。模型列表：`qwen3.7-max`、`qwen3.7-max-256k`
  （context-size alias，`limit: { context: 256000, output: 32768 }`）、
  `qwen3.7-plus`、`qwen3.7-plus-nothink`。裸 `-max` 与 `-plus` 不设 `limit`。
- `openai-bailian-token-plan`：走 `@ai-sdk/openai-compatible`，上游为百炼
  token-plan compatible-mode。模型列表与 `openai-bailiab-api` 一致。
- `openai-idealab`：走 `@ai-sdk/openai-compatible`，**经过本地 cache proxy**
  （用于把 `-256k` context-size alias 改写成真实上游 model id），但 `x-cache-proxy-marker-strategy` 固定为 `none`，让 proxy 不注入 `cache_control` markers——缓存由 Idealab 上游自行处理。上游为 Idealab OpenAI endpoint
  `https://idealab.alibaba-inc.com/api/openai/v1`。当前模型列表：
  - `Qwen3.7-Max-DogFooding`（base，不设 `limit`，由上游 1M 窗口控制，opencode 不主动 compact）
  - `Qwen3.7-Max-DogFooding-256k`（context-size alias，`limit: { context: 256000, output: 32768 }`，用于短对话较早触发 compact；proxy 层把 model id 改写成 `Qwen3.7-Max-DogFooding` 再转发）

  模型名来自 token-hub 的 `name` 字段；不要改成裸 `qwen3.7-max`，dogfooding AK 对
  裸模型会返回"该模型需要授权"。TUI 自动追加 "Default" variant 条目，所以
  `variants` map 中不能显式写 `default` key，否则会出现重复条目。
- `anthropic-idealab`：走 `@ai-sdk/anthropic`，用于 Idealab 提供的
  Anthropic Messages API 形态 Opus provider，base URL 指向本地 proxy 的
  `/apps/anthropic/v1`，上游 URL 与 Claude-compatible upstream user-agent 固定写在
  provider header 中。模型列表：
  `claude-opus-4-6-200k`、`claude-opus-4-6-1m`。

旧 id `bailian-cache` / `bailian-custom-cached` / `openai-compatible-cached` /
`anthropic-cached` / `anthropic-idealab-cached` 视为 legacy，
配置入口会清理迁移；旧 `anthropic-cached` 的稳定 `metadata.user_id` 会迁移到
`anthropic-idealab`。

OpenCode cached providers 默认都不写 `options.apiKey`。OpenCode custom provider
的凭据由子仓交互式 bootstrap 写入：

```bash
node vendor/opencode-cache-proxy/proxy/bin/opencode-cache-proxy-auth.mjs
```

该命令从已有 `opencode.json` 列出 provider，选择一个 provider 后写入 key；需要
使用多个 provider 时重复执行。当前 OpenCode CLI 的 `auth login -p <custom-id>`
可能不识别 custom provider，不能把它当成可靠的 headless 录入路径。

key 存在 `~/.local/share/opencode/auth.json`。cached provider 的上游 URL、marker strategy、
Anthropic cache strategy、上游 user-agent 和 `metadata.user_id` 由子仓配置器写入 provider
`options.headers` 的 `x-cache-proxy-*` 控制头；proxy 消费这些头后必须剥离，不能
转发给真实上游。所有 provider 都通过本地 proxy 转发，`x-cache-proxy-marker-strategy: none`
  可让 proxy 跳过 `cache_control` marker 注入（当前只有 `openai-idealab` 使用，因为
  Idealab 上游自行管理缓存）。Anthropic upstream 不走 `.env` 或 init
脚本参数；需要支持另一个 Anthropic-compatible 平台时新增独立 provider，而不是给一个
provider 再挂多套配置。
其中 `x-cache-proxy-upstream-base-url` 只允许 loopback 客户端生效；如果 proxy
被绑定到非本机接口，远端客户端不能通过该 header 改写上游 URL。

Qwen Code 通过 `settings.json` 的 `modelProviders.openai` 增加托管 provider，
默认维护 `qwen3.7-plus` 与 `qwen3.7-max`，并用 SessionStart hook 确保本地
proxy 单例已启动。SessionEnd hook 可以继续调用 stop，但 stop 当前是 no-op，
因为 proxy 生命周期在 OpenCode 与 Qwen Code 之间共享。

OpenCode 侧的 Qwen `qwen3.7-max-256k` 是
context-size alias，只用于 OpenCode 本地模型选择和上下文管理；proxy 转发前必须
把它改写回真实上游模型 `qwen3.7-max`。OpenCode 1.15.13 的 model `limit`
schema 要求 `context` 与 `output` 同时存在，不能只写 `limit.context`。Qwen3.7
Max aliases 应写 `limit: { context: 256000, output: 32768 }`，否则
`opencode.json` 配置校验会报 `Missing key ... limit.output` 并导致 TUI bootstrap
失败。

OpenCode plugin 目录不能再整目录软链到主仓 `opencode/plugins/`。主仓自有 plugin
必须逐文件软链到 `~/.config/opencode/plugins/`，否则子仓配置入口写入
`bailian-cache-proxy.js` 时会反向落到主仓目录，破坏子仓边界。

## 原因

显式缓存依赖请求体中的 `cache_control` marker，且 OpenCode 与 Qwen Code 都可以
通过 OpenAI-compatible base URL 接入同一个本地代理。把 provider/hook/plugin
配置能力下沉到子仓，可以让子仓单独交付时仍具备一键配置能力；主仓 init 脚本只做
本仓集成与兼容参数传递。

## 修改时注意

- 新增 OpenCode provider 适配时，优先扩展子仓 `client-config.mjs` 与配置 CLI，不要把
  provider JSON 逻辑重新写回主仓 init 脚本。主仓 `init_opencode.sh` 只能传
  repo/config/plugin 路径与本地端口，不能传 API key env、上游 URL、模型列表或 cache
  strategy。
- OpenCode-managed proxy path 不再加载 `proxy/.env`。provider key 属于 OpenCode
  auth storage；provider 上游与缓存参数属于子仓生成的 `options.headers`。保留的进程
  env 仅用于 runtime 行为，例如 `BAILIAN_CACHE_PROXY_PORT`、
  `BAILIAN_CACHE_PROXY_USAGE_LOG`、idle timeout 和 keepalive 阈值。
- **MARKER_STRATEGY 默认是 `turn-stable`**（2026-05-26 切换），锚定
  mid-marker 至 user turn 边界，对 coding agent 多 tool call 场景命中率更好；
  老行为是 `fraction`（按 token 比例 [0.5, 0.85]，中段 drift）。如果生产命中率
  异常下降，可临时切回 `fraction` 对比定位问题。
- **KEEPALIVE 默认启用**（2026-05-26 上线）：活动驱动 + 单次 ping，在 session 静默
  `DEFAULT_THRESHOLD_MS` 后向上游续期 5min TTL 一次。`BAILIAN_CACHE_PROXY_KEEPALIVE=0`
  可关；`..._THRESHOLD_MS`/`..._SCAN_INTERVAL_MS`/`..._MIN_HITS` 可调。默认阈值
  详见子仓 `proxy/src/keepalive.mjs`。基于真实数据（862 请求 / 15 次
  TTL_EXPIRED，60% 落在 5–9.5min 可救窗口）决策，盲 timer 方案按当日定价成本
  反超 8 倍已否决。
- **proxy 进程默认常驻**（2026-06-04 切换）：`BAILIAN_CACHE_PROXY_IDLE_EXIT_MS`
  默认值是 `0`，表示关闭 lifecycle idle exit。OpenCode plugin 与 Qwen
  SessionStart hook 都只做 health check 后确保单例运行，不再维护 per-runtime
  heartbeat/keepalive 进程，也不依赖 plugin runtime 的 `process.pid` 代表长期
  OpenCode 主进程。只有调试或临时进程需要自动退出时，才显式设置正数 idle timeout。
- `opencode/proxy/.env` 不再是 OpenCode provider 凭据来源；不要新增依赖它的
  OpenCode 路径。若未来 Qwen Code 需要迁移，另开任务适配 Qwen 配置通道。
- Qwen `.qwen/settings.json.orig` 是本机备份文件，必须保持 ignored。
- cache diagnostic 只能记录低敏 hash、token 位置和长度信息，不得记录 prompt 原文。
- Anthropic usage 统计必须使用 `input_tokens + cache_read_input_tokens +
  cache_creation_input_tokens` 作为 cache hit ratio 分母，命中量使用
  `cache_read_input_tokens`。不要套用 OpenAI-compatible 的
  `cached_tokens / prompt_tokens` 口径，否则冷启动/写缓存请求会被错误统计。
- Anthropic `turn-stable` 诊断字段包含 `messages_hash` 与
  `marker_selection_hash`，用于比较相邻请求的 prompt/marker 漂移；这些 hash 是低敏
  观测字段，不能替换为原始消息内容。
- Anthropic keepalive 使用 marker[2] 的 prefix hash 作为 session key，优先保护较长的
  稳定 prefix；marker 不足 3 个时不注册 keepalive。修改 planner 时必须同时检查
  `truncateAnthropicBodyForKeepalive` 和 handler 的 session key 选择。
- Anthropic `no-turn-prev` 长请求会使用 `no-turn-depth` marker，按 32k/64k/128k
  等稳定 token bucket 放置深层前缀；短 first-turn 请求仍保留 `early-stable`。
  这是为了避免 compact 后或单 user-turn agent loop 只命中浅前缀。
- OpenCode/Qwen 的 turn-level Stop 验证提醒已退役；大型任务结束检查放在 git push
  gate。不要重新把 `stop-verification.sh` 注册到 Stop/session.idle，否则会在每轮
  对话结束时产生噪音。
- git push gate 判断待推送范围时必须优先使用当前分支 upstream `@{u}`，只有读取失败
  时才回退到 `origin/HEAD` / `origin/main`。不要用远端默认分支替代当前分支 upstream，
  否则 `main` 跟踪 `origin/main`、`origin/HEAD` 指向 `master` 的仓库会被误判为仍有
  待 review diff。
- git push gate 不应因为 staged/unstaged dirty tree 本身阻断 push。`git push` 只推
  `base_ref..HEAD` 的 commit；dirty tree 可能是用户草稿或其它任务改动，最多作为日志
  提示，不能要求 agent 提交或回滚无关本地状态。
- OpenCode 采用 YOLO permission，`rm` 越界删除由
  `opencode/plugins/rm-outside-workspace-guard.js` 插件兜底。不要用粗粒度 permission
  glob 重建一份删除策略，避免与插件规则漂移。
- 测试失败 marker 只允许使用格式安全的 `CLAUDE_SESSION_KEY`；不要 fallback 到 PPID
  写入或读取 `/tmp/.claude-last-test-exit-*` / `/tmp/.qwen-last-test-exit-*`，否则本机
  其它进程可预测 marker 名称并干扰 git push gate。

## 验证方式

```bash
cd vendor/opencode-cache-proxy/proxy
npm test
node --test test/opencode-auth.test.mjs
node scripts/cache-stats.mjs --since today --by turn-prev
```

```bash
bash scripts/test-init-opencode-env.sh
bash scripts/test-init-opencode-cache-proxy.sh
bash scripts/test-init-qwen-provider.sh
python3 -m unittest codex/hooks/tests/test_codex_hooks.py
bash -n init_opencode.sh
bash -n init_qwen.sh
git diff --check
git -C vendor/opencode-cache-proxy diff --check
```

真实幂等验证时，连续运行两遍 `bash init_opencode.sh` 与 `bash init_qwen.sh`，对比
第一遍后和第二遍后的配置快照。关键断言：

- `~/.config/opencode/plugins` 是真实目录，不是整目录软链；
- `~/.config/opencode/plugins/bailian-cache-proxy.js` 指向子仓 plugin；
- 主仓 `opencode/plugins/bailian-cache-proxy.js` 不存在；
- `~/.config/opencode/opencode.json` 里有 `openai-bailiab-api`、
  `openai-bailian-token-plan`、`openai-idealab` 与 `anthropic-idealab`，且默认都没有
  `options.apiKey`；
- 所有三个 OpenAI-compatible provider 都带
  `options.headers["x-cache-proxy-upstream-base-url"]`；
- `openai-idealab.options.headers["x-cache-proxy-marker-strategy"]` 固定为 `none`，
  `options.baseURL` 指向本地 proxy；
- `openai-idealab.models` 包含 `Qwen3.7-Max-DogFooding` 和 `Qwen3.7-Max-DogFooding-256k`；
- `anthropic-idealab.options.headers["x-cache-proxy-upstream-base-url"]`
  固定为 `https://idealab.alibaba-inc.com/api/anthropic`；
- `anthropic-idealab.options.headers["x-cache-proxy-upstream-user-agent"]`
  固定为 `claude-cli/2.1.156 (external, sdk-cli)`；
- `opencode models anthropic-idealab` 能列出
  `anthropic-idealab/claude-opus-4-6-200k` 和
  `claude-opus-4-6-1m`；
- 第二遍配置快照无差异。

## 未来工作（当前未实施）

子仓 `docs/TODO.md` 沉淀了 2 项远期待办，**每项都带明确触发条件，不得提前实施**：

- **上游 profile 抽象**（DashScope / Anthropic / OpenAI 差异表 + 骨架代码）
  → 触发：真正接入第二个 upstream 时落地；当前硬编码 5min TTL 与 max markers=4
- **cache-stats 按策略分段输出**（fraction vs turn-stable）
  → 触发：策略切换后需要对比真实收益

维护知识文档时如看到相关设计讨论，应指向子仓 `docs/TODO.md` 而非在本仓复制。
子仓的 TODO 是单一来源，避免双份维护漂移。

## Keepalive 防 TTL 过期（已实施）

DashScope 缓存条目在最后一次命中后 5 分钟过期。用户在短间歇（开会、思考、读
文档）离开后，下一次请求常遭遇 cache miss。proxy 用"活动驱动 + 单次 ping"
机制解决：

- 入口 env：`BAILIAN_CACHE_PROXY_KEEPALIVE`（默认 `1`，默认阈值详见子仓
  `proxy/src/keepalive.mjs` 的 `DEFAULT_THRESHOLD_MS` / `DEFAULT_MIN_HITS`）
- 模块：`vendor/opencode-cache-proxy/proxy/src/keepalive.mjs` —
  `createKeepaliveManager`，per-session-key Map 管理
- 触发条件：同一 session key 连续 >`DEFAULT_THRESHOLD_MS` 无新请求，且
  totalHits ≥ `DEFAULT_MIN_HITS`
- 行为：发送一次 keepalive（body 截断到 marker[2]，stream=false，
  max_tokens=1），该窗口内不重复发
- 数据基础（2026-05-26 turn-stable 期间 862 请求）：15 次真实 TTL_EXPIRED，
  9 次 (60%) 落在 5–9.5min "可救" 区间，日净收益约 ¥7.76（按当日 DashScope
  定价，价格随计费调整但 ROI 量级稳定）

**已知局限**：单次 ping 救不了 >9.5min 的 idle window（今天占 40%）。若未来
数据显示"长时间 idle"比例升高，可考虑扩展为"2 次 ping（3.5min + 8.5min）"
方案。

**不做的事**：盲 timer（每 4 min 发一次）——实测成本 ¥3.51/天（当日定价），vs
节省 ¥0.42/天，**反赔 8 倍**。详见子仓
`docs/plans/2026-05-26-keepalive-for-ttl-expiry.md`。

**观测**：keepalive body 带 `_keepalive: true` 标记，可从 usage 统计中过滤；
当前 `usage-recorder` 直接不记录这些请求，cache 命中率数字不受影响。

**验证**：`cd vendor/opencode-cache-proxy/proxy && node --test` 中
`test/keepalive.test.mjs` 与 `test/server.test.mjs` 的 keepalive 集成测试
覆盖核心路径（具体用例数请以当前文件为准，本文不固化数字）。

## 相关资料

- `vendor/opencode-cache-proxy/README.md`
- `vendor/opencode-cache-proxy/proxy/README.md` — 含 "## Keepalive" 节
- `vendor/opencode-cache-proxy/proxy/src/client-config.mjs`
- `vendor/opencode-cache-proxy/proxy/src/server.mjs`
- `vendor/opencode-cache-proxy/proxy/src/keepalive.mjs` — 防 TTL 过期模块
- `vendor/opencode-cache-proxy/docs/TODO.md` — 子仓远期待办（上游 profile、stats 分段）
- `vendor/opencode-cache-proxy/docs/plans/2026-05-26-keepalive-for-ttl-expiry.md` — keepalive 实施计划与真实数据 ROI 分析
- `docs/bugs/bug-opencode-cache-proxy-plugin-boundary.md`
- `docs/bugs/bug-opencode-ak-missing.md`

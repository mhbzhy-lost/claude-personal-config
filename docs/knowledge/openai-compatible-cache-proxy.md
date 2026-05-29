---
title: OpenAI-compatible cache proxy
kind: integration
status: active
applies_to:
  - init_opencode.sh
  - init_qwen.sh
  - vendor/opencode-cache-proxy/
last_verified: 2026-05-29
source: OpenCode provider-driven proxy config migration
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

- `openai-compatible-cached`：走 `@ai-sdk/openai-compatible`，用于 Qwen/OpenAI
  compatible chat-completions。
- `anthropic-cached`：走 `@ai-sdk/anthropic`，用于 Anthropic Messages API 形态的
  Opus/Claude provider，base URL 指向本地 proxy 的 `/apps/anthropic/v1`。

旧 id `bailian-cache` / `bailian-custom-cached` 视为 legacy，配置入口会清理迁移。

OpenCode cached providers 默认都不写 `options.apiKey`。OpenCode custom provider
的正常凭据路径是：

```bash
opencode auth login -p openai-compatible-cached
opencode auth login -p anthropic-cached
```

key 存在 `~/.local/share/opencode/auth.json`。上游 URL、marker strategy、
Anthropic cache strategy 和 `metadata.user_id` 由子仓配置器写入 provider
`options.headers` 的 `x-cache-proxy-*` 控制头；proxy 消费这些头后必须剥离，不能
转发给真实上游。
其中 `x-cache-proxy-upstream-base-url` 只允许 loopback 客户端生效；如果 proxy
被绑定到非本机接口，远端客户端不能通过该 header 改写上游 URL。

Qwen Code 通过 `settings.json` 的 `modelProviders.openai` 增加托管 provider，
默认维护 `qwen3.6-plus` 与 `qwen3.7-max`，并用 SessionStart / SessionEnd hook
启动和停止 proxy keepalive。

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
- `opencode/proxy/.env` 不再是 OpenCode provider 凭据来源；不要新增依赖它的
  OpenCode 路径。若未来 Qwen Code 需要迁移，另开任务适配 Qwen 配置通道。
- Qwen `.qwen/settings.json.orig` 是本机备份文件，必须保持 ignored。
- cache diagnostic 只能记录低敏 hash、token 位置和长度信息，不得记录 prompt 原文。

## 验证方式

```bash
cd vendor/opencode-cache-proxy/proxy
npm test
```

```bash
bash scripts/test-init-opencode-cache-proxy.sh
bash scripts/test-init-qwen-provider.sh
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
- `~/.config/opencode/opencode.json` 里有 `openai-compatible-cached` 与
  `anthropic-cached`，且默认都没有 `options.apiKey`；
- 两个 cached provider 都带 `options.headers["x-cache-proxy-upstream-base-url"]`；
- `opencode models anthropic-cached` 能列出 `anthropic-cached/claude-opus-4-6`；
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

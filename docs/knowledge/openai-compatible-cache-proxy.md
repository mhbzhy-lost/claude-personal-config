---
title: OpenAI-compatible cache proxy
kind: integration
status: active
applies_to:
  - init_opencode.sh
  - init_qwen.sh
  - vendor/opencode-cache-proxy/
last_verified: 2026-05-26
source: manual
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

OpenCode 托管 provider id 是 `openai-compatible-cached`。旧 id
`bailian-cache` / `bailian-custom-cached` 视为 legacy，配置入口会清理迁移。

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

- 新增 client 适配时，优先扩展子仓 `client-config.mjs` 与配置 CLI，不要把
  provider JSON 逻辑重新写回主仓 init 脚本。
- 子仓只认两个环境变量：`OPENAI_COMPATIBLE_API_KEY`（upstream key）和
  `OPENAI_COMPATIBLE_UPSTREAM_BASE_URL`（upstream base URL）。历史兼容别名
  （DASHSCOPE_API_KEY / BAILIAN_CODING_PLAN_API_KEY / BAILIAN_UPSTREAM_BASE_URL 等）
  已全部移除。主仓 init 脚本也应统一使用 `OPENAI_COMPATIBLE_API_KEY`。
- `opencode/proxy/.env` 是本机凭据文件，必须保持 ignored，不得提交。
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
- 第二遍配置快照无差异。

## 相关资料

- `vendor/opencode-cache-proxy/README.md`
- `vendor/opencode-cache-proxy/proxy/README.md`
- `vendor/opencode-cache-proxy/proxy/src/client-config.mjs`
- `vendor/opencode-cache-proxy/proxy/src/server.mjs`
- `docs/bugs/bug-opencode-cache-proxy-plugin-boundary.md`

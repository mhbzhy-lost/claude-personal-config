# external-llm-review Provider 架构

## 背景
2024-06-15 重构。之前是单一 `.env` 文件 + `--backend` 参数，配置混杂，扩展性差。

## 新架构
- `providers/<name>.yaml`：每个 provider 一个文件，存非敏感配置（base_url/model/max_tokens/feature flags）
- `.env`：纯 secret 仓库（gitignored），YAML 里用 `${VAR}` 占位符引用
- `_config.py`：配置加载器，支持 `${VAR}` 插值，工厂函数 `build_provider(cfg) -> BaseProvider`
- `_provider.py`：3 个 provider 类（IdealabAnthropic/IdealabOpenAI/Bailian），统一接口 `send_chat(client, messages, spec) -> str`
- `_healthcheck.py`：诊断脚本，跑 3 provider "say hello" 请求验证连通性

## 切换 provider
```bash
# 环境变量
export EXTERNAL_LLM_REVIEW_PROVIDER=idealab-openai

# CLI 参数
python reviewer.py HEAD^ HEAD --provider bailian

# 审查当前未提交工作区 diff（plan-runner harness 使用）
python reviewer.py HEAD WORKTREE --worktree . --provider bailian

# 默认 idealab-anthropic
```

## plan-runner harness fallback

`reviewer.py` 直接 CLI 仍是单 provider；plan-runner harness 在调用默认 reviewer
时会做 provider fallback，默认链路：

```text
idealab-anthropic -> bailian -> idealab-openai
```

运行时可用 `OPENCODE_PLAN_RUNNER_EXTERNAL_REVIEW_PROVIDERS` 覆盖链路，值支持逗号或空白分隔。
如果设置 `EXTERNAL_LLM_REVIEW_PROVIDER`，harness 只使用该 provider，便于显式锁定某个网关。

## 新增 provider 步骤
1. `providers/<name>.yaml`：写配置，敏感字段用 `${API_KEY_VAR}`
2. `.env.example`：加一行说明 API key 变量名
3. `_config.py` 的 `build_provider`：加一个分支返回对应 provider 类
4. `_healthcheck.py` 的 `PROVIDERS` 列表：加新 provider name
5. `tests/test_reviewer.py`：加 ProviderConfigLoader + GetProviderDispatch 测试

## 注意事项
- Bailian 必须 streaming（300s 非流式硬超时），`send_chat` 用 `async with client.stream(...)`
- Idealab Anthropic 网关月度配额耗尽时返回 400 `IRC-001`，下月自动恢复，不需要改 key
- `.env` 必须 gitignored（已在 `.gitignore` 里）
- `head_sha=WORKTREE` 是特殊值：`reviewer.py` 会执行 `git diff <base_sha>`，用于包含当前
  未提交工作区改动；普通 push gate 继续使用 `<base>..<HEAD>` commit range。

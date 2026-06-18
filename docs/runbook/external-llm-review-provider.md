# 切换外部 LLM Review Provider

## 前提条件

- `external-llm-review-providers` provider 架构已部署
- `.env` 文件已配置（gitignored）

## 操作步骤

### 1. 选择 provider

```bash
# 环境变量方式（推荐，影响当前 shell）
export EXTERNAL_LLM_REVIEW_PROVIDER=idealab-openai

# CLI 参数方式（单次执行）
python reviewer.py HEAD^ HEAD --provider bailian

# 不设置则为默认 idealab-anthropic
```

### 2. 配置 API key

```bash
# 编辑 .env（已 gitignored）
# 添加对应 provider 的 key
# 例如：IDEALAB_OPENAI_API_KEY=sk-xxx

# 加固文件权限
chmod 600 .env

# 验证 gitignore 生效
git check-ignore .env && echo "OK: gitignored" || echo "ERROR: .env not in .gitignore"
```

## 验证方式

```bash
# 运行 healthcheck 验证连通性
python _healthcheck.py
```

## 常见失败处理

- **Bailian 300s 超时**：该 provider 必须 streaming 模式，`send_chat` 用 `async with client.stream(...)`
- **Idealab Anthropic 400 IRC-001**：月度配额耗尽，下月自动恢复，不需要改 key

## 新增 provider 步骤

1. `providers/<name>.yaml`：写配置，敏感字段用 `${API_KEY_VAR}`
2. `.env.example`：加一行说明 API key 变量名
3. `_config.py` 的 `build_provider`：加一个分支返回对应 provider 类
4. `_healthcheck.py` 的 `PROVIDERS` 列表：加新 provider name
5. `tests/test_reviewer.py`：加 ProviderConfigLoader + GetProviderDispatch 测试

## 相关资料

- 架构详情：`docs/knowledge/external-llm-review-providers.md`

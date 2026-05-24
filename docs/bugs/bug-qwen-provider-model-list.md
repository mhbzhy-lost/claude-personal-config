# Qwen provider model list 不符合缓存接入预期

**现象**：用户启动 Qwen Code 后发现 provider 不符合预期。当前
`~/.qwen/settings.json` 的 `modelProviders.openai` 中已有直连
`qwen3.6-plus`，而 `init_qwen.sh` 新增的托管缓存 provider 是
`qwen3-coder-plus`；用户实际需要接入缓存的是 `qwen3.6-plus` 和
`qwen3.7-max`。

**调用链**：执行 `bash init_qwen.sh` → Python 内嵌逻辑构造
`managed_openai_provider` → 只按单个 `QWEN_BAILIAN_MODEL_ID`
upsert provider → 默认值为 `qwen3-coder-plus` → 写入
`~/.qwen/settings.json` 的 `modelProviders.openai` → Qwen Code provider 列表出现
`qwen3-coder-plus`，但没有缓存版 `qwen3.7-max`，已有 `qwen3.6-plus` 仍指向
直连 upstream。

**根因假设**：

1. `init_qwen.sh` 的托管 provider 设计成单模型默认 `qwen3-coder-plus`，没有表达
   “一组缓存模型”的需求。
2. 上一次实现直接采用了 cache proxy README 中的 Qwen Code 示例模型，
   没对齐本机既有 Qwen provider 列表和用户实际使用的 `qwen3.6-plus` /
   `qwen3.7-max`。
3. upsert 逻辑按单个 id 替换，导致无法同时维护两个托管缓存 provider。

**验证方式**：

- 读取真实配置：
  `python3 - <<'PY' ... ~/.qwen/settings.json ... PY`
- 结果显示：
  - `qwen3.6-plus` 存在，但 `baseUrl` 是
    `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
  - `qwen3-coder-plus` 存在，`baseUrl` 是 `http://127.0.0.1:48761/v1`
  - 未发现 `qwen3.7-max`
- `rg` 代码确认 `init_qwen.sh` 默认只配置 `QWEN_BAILIAN_MODEL_ID=qwen3-coder-plus`。

**根因确认**：`init_qwen.sh` 将 Qwen cache proxy provider 建模为单个
`qwen3-coder-plus`，与用户需要的 `qwen3.6-plus` 和 `qwen3.7-max` 缓存 provider
列表不一致。

**影响范围**：所有通过 `init_qwen.sh` 生成 Qwen Code provider 的机器都会得到错误
的托管模型集合；Qwen Code 中选择 `qwen3.6-plus` 时仍可能走直连 upstream，不经过
本地 cache proxy；`qwen3.7-max` 无法从初始化脚本自动出现。OpenCode provider
不受此脚本问题影响。

**修复方案要求**：

- 将 `init_qwen.sh` 的托管 provider 从单模型改为固定列表：
  `qwen3.6-plus` 和 `qwen3.7-max`。
- 两个 provider 都指向 `http://127.0.0.1:48761/v1`，使用
  `BAILIAN_TOKEN_PLAN_API_KEY`，并设置
  `generationConfig.enableCacheControl=true`。
- upsert 时按 id 替换已有同名 provider，保留其它非托管 provider。
- 明确是否删除旧托管 `qwen3-coder-plus`：推荐删除，避免 Qwen Code 继续展示不需要
  的缓存模型。
- 补充临时目录验证：执行 `init_qwen.sh` 后断言 `qwen3.6-plus` 和 `qwen3.7-max`
  都指向本地 proxy，且 `qwen3-coder-plus` 不再由托管配置生成。

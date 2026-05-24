#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

export QWEN_CONFIG_DIR="$TMP_DIR/qwen"
mkdir -p "$QWEN_CONFIG_DIR"

python3 <<'PY'
import json
import os

settings = {
    "hooks": {
        "SessionStart": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "echo keep-session-start",
                        "name": "keep-session-start",
                    }
                ]
            }
        ]
    },
    "modelProviders": {
        "openai": [
            {
                "id": "qwen3.6-plus",
                "name": "Qwen 3.6 Plus",
                "envKey": "BAILIAN_TOKEN_PLAN_API_KEY",
                "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
                "generationConfig": {
                    "extra_body": {"enable_thinking": True},
                    "modalities": {"image": True, "video": True},
                },
            },
            {
                "id": "qwen3-coder-plus",
                "name": "Qwen 3 Coder Plus (cached)",
                "envKey": "BAILIAN_TOKEN_PLAN_API_KEY",
                "baseUrl": "http://127.0.0.1:48761/v1",
                "generationConfig": {"enableCacheControl": True},
            },
            {
                "id": "deepseek-v3.2",
                "name": "DeepSeek",
                "envKey": "BAILIAN_TOKEN_PLAN_API_KEY",
                "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
                "generationConfig": {"contextWindowSize": 131072},
            },
        ]
    },
    "security": {"auth": {"selectedType": "other"}},
}

with open(os.path.join(os.environ["QWEN_CONFIG_DIR"], "settings.json"), "w", encoding="utf-8") as f:
    json.dump(settings, f)
    f.write("\n")
PY

bash "$ROOT/init_qwen.sh" >/dev/null

python3 <<'PY'
import json
import os

with open(os.path.join(os.environ["QWEN_CONFIG_DIR"], "settings.json"), encoding="utf-8") as f:
    settings = json.load(f)

providers = [
    provider
    for provider in settings["modelProviders"]["openai"]
    if isinstance(provider, dict)
]
by_id = {provider.get("id"): provider for provider in providers}

for model_id in ("qwen3.6-plus", "qwen3.7-max"):
    provider = by_id[model_id]
    generation = provider["generationConfig"]
    assert provider["baseUrl"] == "http://127.0.0.1:48761/v1", provider
    assert provider["envKey"] == "BAILIAN_TOKEN_PLAN_API_KEY", provider
    assert generation["enableCacheControl"] is True, provider
    assert generation["contextWindowSize"] == 1000000, provider

assert by_id["qwen3.6-plus"]["generationConfig"]["extra_body"]["enable_thinking"] is True
assert by_id["qwen3.6-plus"]["generationConfig"]["modalities"] == {"image": True, "video": True}
assert "qwen3-coder-plus" not in by_id
assert by_id["deepseek-v3.2"]["baseUrl"] == "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
assert settings["security"]["auth"]["selectedType"] == "openai"

start_hooks = [
    hook
    for group in settings["hooks"]["SessionStart"]
    for hook in group["hooks"]
]
end_hooks = [
    hook
    for group in settings["hooks"]["SessionEnd"]
    for hook in group["hooks"]
]
assert any(
    hook["name"] == "bailian-cache-proxy-start"
    and hook["command"].endswith("bailian-cache-proxy-qwen-hook.mjs start")
    for hook in start_hooks
)
assert any(
    hook["name"] == "keep-session-start"
    and hook["command"] == "echo keep-session-start"
    for hook in start_hooks
)
assert any(
    hook["name"] == "bailian-cache-proxy-stop"
    and hook["command"].endswith("bailian-cache-proxy-qwen-hook.mjs stop")
    for hook in end_hooks
)

print("init_qwen provider integration test passed")
PY

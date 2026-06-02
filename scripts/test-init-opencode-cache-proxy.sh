#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

export ROOT
FAKE_BIN="$TMP_DIR/bin"
mkdir -p "$FAKE_BIN"
cat >"$FAKE_BIN/opencode" <<'SH'
#!/usr/bin/env bash
echo "opencode-test"
SH
chmod +x "$FAKE_BIN/opencode"

export HOME="$TMP_DIR/home"
export PATH="$FAKE_BIN:$PATH"
export OPENCODE_CONFIG_DIR="$TMP_DIR/opencode-config"

mkdir -p "$HOME"
ROOT="$ROOT" HOME="$HOME" python3 <<'PY'
import os
from pathlib import Path

root = Path(os.environ["ROOT"])
home = Path(os.environ["HOME"])
zshrc = home / ".zshrc"
zshrc.write_text(
    f'export CLAUDE_CONFIG_HOME="{root}" # existing value with comment\n'
    "export MY_OPENCODE_DISABLE_CLAUDE_CODE=1\n",
    encoding="utf-8",
)
PY
mkdir -p "$OPENCODE_CONFIG_DIR"
USER_PLUGIN="$TMP_DIR/user-opencode-plugin"
export USER_PLUGIN

python3 <<'PY'
import json
import os
from pathlib import Path

config_dir = Path(os.environ["OPENCODE_CONFIG_DIR"])
root = Path(os.environ["ROOT"])
user_plugin = os.environ["USER_PLUGIN"]
config_dir.mkdir(parents=True, exist_ok=True)
(config_dir / "opencode.json").write_text(
    json.dumps(
        {
            "instructions": ["UserGuide.md"],
            "plugin": [str(root / "vendor/superpowers"), user_plugin],
            "mcp": {
                "block-catalog": {
                    "type": "local",
                    "command": [str(root / "mcp/block-catalog/.venv/bin/python"), "-m", "block_catalog.server"],
                    "enabled": True,
                }
            },
        },
        indent=2,
    ) + "\n",
    encoding="utf-8",
)
PY

bash "$ROOT/init_opencode.sh" >/dev/null

python3 <<'PY'
import json
import os
from pathlib import Path

config_path = Path(os.environ["OPENCODE_CONFIG_DIR"]) / "opencode.json"
with config_path.open(encoding="utf-8") as f:
    config = json.load(f)

providers = config.get("provider")
assert isinstance(providers, dict), f"Missing or invalid provider map: {providers!r}"
assert "block-catalog" not in (config.get("mcp") or {}), config.get("mcp")
assert config.get("instructions") == ["UserGuide.md", "Superpowers.md"], config.get("instructions")

provider = providers.get("openai-compatible-cached")
assert isinstance(provider, dict), "Missing openai-compatible-cached provider"
provider_options = provider.get("options") or {}
provider_headers = provider_options.get("headers") or {}
assert provider_options.get("baseURL") == "http://127.0.0.1:48761/compatible-mode/v1"
assert "apiKey" not in provider_options
assert provider_headers.get("x-cache-proxy-upstream-base-url") == "https://dashscope.aliyuncs.com/compatible-mode/v1"
assert provider_headers.get("x-cache-proxy-marker-strategy") == "turn-stable"
assert "qwen3.6-plus" in provider["models"]
assert "qwen3.7-max" in provider["models"]

anthropic_provider = providers.get("anthropic-idealab-cached")
assert isinstance(anthropic_provider, dict), "Missing anthropic-idealab-cached provider"
anthropic_options = anthropic_provider.get("options") or {}
anthropic_headers = anthropic_options.get("headers") or {}
assert anthropic_provider.get("npm") == "@ai-sdk/anthropic", f"Unexpected Anthropic npm: {anthropic_provider.get('npm')!r}"
assert anthropic_provider.get("name") == "Anthropic Idealab cached", f"Unexpected Anthropic name: {anthropic_provider.get('name')!r}"
assert anthropic_options.get("baseURL") == "http://127.0.0.1:48761/apps/anthropic/v1"
assert "apiKey" not in anthropic_options
assert anthropic_headers.get("x-cache-proxy-upstream-base-url") == "https://idealab.alibaba-inc.com/api/anthropic"
assert anthropic_headers.get("x-cache-proxy-cache-strategy") == "cache"
assert anthropic_headers.get("x-cache-proxy-upstream-user-agent") == "claude-cli/2.1.156 (external, sdk-cli)"
assert anthropic_headers.get("x-cache-proxy-metadata-user-id")
assert "claude-opus-4-6" in (anthropic_provider.get("models") or {}), "Missing claude-opus-4-6 model"

assert "bailian-custom-cached" not in providers
assert "anthropic-cached" not in providers
assert config.get("plugin") == [os.environ["USER_PLUGIN"]], config.get("plugin")

plugin_dir = Path(os.environ["OPENCODE_CONFIG_DIR"]) / "plugins"
plugin_link = plugin_dir / "bailian-cache-proxy.js"
proxy_link = plugin_dir.parent / "proxy"
assert plugin_link.is_symlink(), plugin_link
assert proxy_link.is_symlink(), proxy_link
root = Path(os.environ["ROOT"])
assert os.readlink(plugin_link) == str(root / "vendor/opencode-cache-proxy/plugins/bailian-cache-proxy.js")
assert os.readlink(proxy_link) == str(root / "vendor/opencode-cache-proxy/proxy")

agents_link = Path(os.environ["OPENCODE_CONFIG_DIR"]) / "AGENTS.md"
superpowers_link = Path(os.environ["OPENCODE_CONFIG_DIR"]) / "Superpowers.md"
assert agents_link.is_symlink(), agents_link
assert superpowers_link.is_symlink(), superpowers_link
assert os.readlink(agents_link) == str(root / "claude/CLAUDE.md")
assert os.readlink(superpowers_link) == str(root / "claude/Superpowers.md")

zshrc = Path(os.environ["HOME"]) / ".zshrc"
zshrc_lines = zshrc.read_text(encoding="utf-8").splitlines()
claude_config_home_lines = [
    line
    for line in zshrc_lines
    if line.strip().startswith("export CLAUDE_CONFIG_HOME=")
]
assert len(claude_config_home_lines) == 1, claude_config_home_lines
assert claude_config_home_lines[0].startswith(f'export CLAUDE_CONFIG_HOME="{root}"')
opencode_disable_lines = [
    line
    for line in zshrc_lines
    if line.strip() == "export OPENCODE_DISABLE_CLAUDE_CODE=1"
]
assert len(opencode_disable_lines) == 1, zshrc_lines

print("init_opencode cache proxy integration test passed")
PY

if grep -E -q -- '^[^#]*--opencode-(api-key-env|anthropic-api-key-env|anthropic-upstream-base-url|anthropic-cache-strategy|anthropic-metadata-user-id|anthropic-models)([[:space:]=]|$)' "$ROOT/init_opencode.sh"; then
  echo "init_opencode.sh must not pass provider-specific config flags" >&2
  exit 1
fi

LEGACY_ROOT="$TMP_DIR/legacy-repo"
LEGACY_CONFIG_DIR="$TMP_DIR/legacy-opencode-config"
mkdir -p "$LEGACY_ROOT/opencode/plugins" "$LEGACY_CONFIG_DIR"
cp "$ROOT/init_opencode.sh" "$LEGACY_ROOT/init_opencode.sh"
ln -s "$ROOT/vendor" "$LEGACY_ROOT/vendor"
printf 'console.log("main plugin")\n' >"$LEGACY_ROOT/opencode/plugins/main-plugin.js"
ln -s "$LEGACY_ROOT/opencode/plugins" "$LEGACY_CONFIG_DIR/plugins"

OPENCODE_CONFIG_DIR="$LEGACY_CONFIG_DIR" bash "$LEGACY_ROOT/init_opencode.sh" >/dev/null

LEGACY_ROOT="$LEGACY_ROOT" LEGACY_CONFIG_DIR="$LEGACY_CONFIG_DIR" python3 <<'PY'
import os
from pathlib import Path

legacy_root = Path(os.environ["LEGACY_ROOT"])
config_dir = Path(os.environ["LEGACY_CONFIG_DIR"])

repo_proxy_plugin = legacy_root / "opencode/plugins/bailian-cache-proxy.js"
plugin_dir = config_dir / "plugins"
main_plugin_link = plugin_dir / "main-plugin.js"
proxy_plugin_link = plugin_dir / "bailian-cache-proxy.js"

assert not repo_proxy_plugin.exists(), repo_proxy_plugin
assert plugin_dir.is_dir(), plugin_dir
assert not plugin_dir.is_symlink(), plugin_dir
assert main_plugin_link.is_symlink(), main_plugin_link
assert os.readlink(main_plugin_link) == str(legacy_root / "opencode/plugins/main-plugin.js")
assert proxy_plugin_link.is_symlink(), proxy_plugin_link
assert os.readlink(proxy_plugin_link) == str(legacy_root / "vendor/opencode-cache-proxy/plugins/bailian-cache-proxy.js")

print("legacy opencode plugin directory migration test passed")
PY

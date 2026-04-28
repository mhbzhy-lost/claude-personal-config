#!/usr/bin/env bash
# init_ccr.sh
#
# 安装并配置 claude-code-router（CCR），注入 claude → CCR 路由包装函数到 ~/.zshrc。
#
# 使用方法：
#   bash init_ccr.sh                    # 安装并配置
#   bash init_ccr.sh --skip-install     # 仅配置，跳过安装
#
# 运行后：
#   1. 安装 @musistudio/claude-code-router（npm global）
#   2. 生成 ~/.claude-code-router/config.json（模板，APIKEY 需手动填写）
#   3. 注入 .zshrc wrapper：CLAUDE_USE_CCR=1 时走 CCR → 第三方 provider
#
# 注意：
#   - 不包含任何 API key，需自行在 config.json 中填写 api_key
#   - config.json 模板使用默认 127.0.0.1:3456 端口
#   - 适用于 DeepSeek / OpenRouter 等兼容 OpenAI Anthropic 的 provider
# ---------------------------------------------------------------------------

set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"

# ---------------------------------------------------------------------------
# 1. 安装 CCR
# ---------------------------------------------------------------------------
install_ccr() {
  if command -v ccr >/dev/null 2>&1; then
    echo "[ccr] claude-code-router 已安装: $(ccr --version 2>/dev/null || echo 'version unknown')"
    return
  fi

  if command -v npm >/dev/null 2>&1; then
    echo "[ccr] 安装 @musistudio/claude-code-router..."
    npm install -g @musistudio/claude-code-router
    echo "[ccr] 安装完成"
  else
    echo "[ccr] ERROR: npm 未安装，请先安装 Node.js (>=18)"
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# 2. 生成 config.json 模板
# ---------------------------------------------------------------------------
generate_config() {
  local config_dir="$HOME/.claude-code-router"
  local config_file="$config_dir/config.json"
  mkdir -p "$config_dir"

  if [ -f "$config_file" ]; then
    echo "[ccr] config.json 已存在，跳过生成"
    return
  fi

  cp "$SRC/ccr-config.template.json" "$config_file"
  chmod 600 "$config_file"

  echo "[ccr] 模板已生成: $config_file"
  echo "[ccr] >>> 请编辑 $config_file 填写 YOUR_DEEPSEEK_API_KEY <<<"
  echo "[ccr] 模板源文件: $SRC/ccr-config.template.json（可修改此文件定制默认配置）"
}

# ---------------------------------------------------------------------------
# 3. 注入 claude → CCR 路由包装函数到 ~/.zshrc
# ---------------------------------------------------------------------------
ZSHRC="$HOME/.zshrc"
NEW_MARKER="claude_ccr_wrapper_v5"
HELPER_MARKER="_claude_should_autoresume"

# 通用 awk state-machine：删除从 marker_pattern 匹配行起、到首个独立 '}' 行止
# 的整段（含 marker 行与 '}' 行）。用于清理历代 wrapper 块。
prune_block() {
  local marker_pattern="$1"
  local file="$2"
  local tmp
  tmp="$(mktemp)"
  awk -v pat="$marker_pattern" '
    BEGIN { skip = 0 }
    skip == 0 && $0 ~ pat { skip = 1; next }
    skip == 1 {
      if ($0 ~ /^\}[[:space:]]*$/) { skip = 0; next }
      next
    }
    { print }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

inject_zshrc_wrapper() {
  if [ ! -f "$ZSHRC" ]; then
    echo "[zshrc] $ZSHRC 不存在，跳过注入"
    return
  fi

  # 清理历史遗留
  local legacy_versions=("v1" "v2" "v3" "v4")
  for ver in "${legacy_versions[@]}"; do
    if grep -q "claude_ccr_wrapper_${ver}" "$ZSHRC" \
        && ! grep -q "claude_ccr_wrapper_v5" "$ZSHRC"; then
      echo "[zshrc] 检测到历史 claude_ccr_wrapper_${ver} wrapper，自动清理..."
      prune_block "claude_ccr_wrapper_${ver}" "$ZSHRC"
    fi
  done

  # v0 → 清理
  if grep -q "claude_chain_next" "$ZSHRC"; then
    echo "[zshrc] 检测到历史 claude_chain_next wrapper，自动清理..."
    prune_block "链式执行包装函数" "$ZSHRC"
    rm -f "$HOME/.claude_chain_next" 2>/dev/null || true
  fi

  # 注入 v5：helper + wrapper 是配套的
  if grep -q "$NEW_MARKER" "$ZSHRC" && grep -q "$HELPER_MARKER" "$ZSHRC"; then
    echo "[zshrc] ccr wrapper v5 已存在，跳过注入"
    return
  fi

  # 若仅 helper 残留也清理掉
  if grep -q "$HELPER_MARKER" "$ZSHRC" && ! grep -q "$NEW_MARKER" "$ZSHRC"; then
    prune_block "_claude_should_autoresume\\(\\)" "$ZSHRC"
  fi

  cat >> "$ZSHRC" << 'EOF'

# claude 自动续聊：交互式调用默认补 --continue --fork-session
# 跳过：含会话/打印相关标志，或首个参数是子命令
function _claude_should_autoresume() {
    if [[ $# -eq 0 ]]; then
        # 仅当当前目录有历史会话时才自动续聊
        if ! [[ -f "$HOME/.claude/history.jsonl" ]] \
            || ! grep -q --fixed-strings "\"project\":\"${PWD}\"" "$HOME/.claude/history.jsonl" 2>/dev/null; then
            return 1
        fi
        return 0
    fi
    case "$1" in
        mcp|config|migrate-installer|setup-token|update|doctor|install)
            return 1
            ;;
    esac
    local arg
    for arg in "$@"; do
        case "$arg" in
            -c|--continue|-r|--resume|--fork-session|--session-id|-p|--print)
                return 1
                ;;
        esac
    done
    return 0
}

# claude → ccr 路由包装函数（由 init_ccr.sh 注入，marker: claude_ccr_wrapper_v5）
# v5 相对于 v4: _claude_should_autoresume 检查 history.jsonl，新目录不续聊
# 语义：默认走原生 claude；显式 export CLAUDE_USE_CCR=1 才路由到本地 ccr。
function claude() {
    if _claude_should_autoresume "$@"; then
        set -- --continue --fork-session "$@"
    fi
    if [[ "${CLAUDE_USE_CCR:-0}" != "1" ]]; then
        command claude "$@"
        return $?
    fi

    local ccr_host="127.0.0.1"
    local ccr_port="3456"
    local ccr_url="http://${ccr_host}:${ccr_port}"
    local ccr_up=0
    if curl -sf --max-time 1 -o /dev/null "${ccr_url}/" 2>/dev/null \
        || curl -sf --max-time 1 -o /dev/null "${ccr_url}/api/config" 2>/dev/null; then
        ccr_up=1
    fi
    if (( ! ccr_up )); then
        if command -v ccr >/dev/null 2>&1; then
            (ccr start >/dev/null 2>&1 &)
            local i
            for i in 1 2 3 4 5 6 7 8 9 10; do
                if curl -sf --max-time 1 -o /dev/null "${ccr_url}/" 2>/dev/null \
                    || curl -sf --max-time 1 -o /dev/null "${ccr_url}/api/config" 2>/dev/null; then
                    ccr_up=1
                    break
                fi
                sleep 0.5
            done
        else
            echo "[claude wrapper] CLAUDE_USE_CCR=1 但 ccr 未安装，本次回退到原生 claude" >&2
            command claude "$@"
            return $?
        fi
    fi
    if (( ! ccr_up )); then
        echo "[claude wrapper] ccr 在 ${ccr_url} 5s 内未就绪，本次回退到原生 claude" >&2
        command claude "$@"
        return $?
    fi
    local ccr_apikey=""
    if [[ -f "$HOME/.claude-code-router/config.json" ]]; then
        ccr_apikey=$(command python3 -c 'import json,os,sys
try:
    print(json.load(open(os.path.expanduser("~/.claude-code-router/config.json"))).get("APIKEY",""))
except Exception:
    pass' 2>/dev/null)
    fi
    ANTHROPIC_BASE_URL="${ccr_url}" \
    ANTHROPIC_AUTH_TOKEN="${ccr_apikey}" \
    NO_PROXY="127.0.0.1,localhost" \
        command claude "$@"
}
EOF

  echo "[zshrc] 已注入 claude → ccr wrapper（marker: $NEW_MARKER；source ~/.zshrc 或重开终端生效）"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
SKIP_INSTALL=false
for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=true ;;
  esac
done

if ! $SKIP_INSTALL; then
  install_ccr
fi

generate_config
inject_zshrc_wrapper

echo ""
echo "============================================"
echo " CCR 安装完成，接下来："
echo ""
echo " 1. 编辑 ~/.claude-code-router/config.json"
echo "    填写你的 api_base_url 和 api_key"
echo ""
echo " 2. source ~/.zshrc 或重开终端"
echo ""
echo " 3. 使用: CLAUDE_USE_CCR=1 claude"
echo "============================================"

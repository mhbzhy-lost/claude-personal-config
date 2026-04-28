#!/usr/bin/env bash
# ccr-test-provider — 测试 CCR provider 连通性
# 用法:
#   ccr-test-provider                          # 测试当前 config.json 中的 provider
#   ccr-test-provider https://xxx /path        # 测试任意 Anthropic 兼容端点
set -euo pipefail

# 颜色
G='\033[0;32m' R='\033[0;31m' Y='\033[0;33m' N='\033[0m'

if [ $# -ge 2 ]; then
  base_url="$1"
  api_key="$2"
elif [ -f "$HOME/.claude-code-router/config.json" ]; then
  base_url=$(python3 -c "
import json
c=json.load(open('$HOME/.claude-code-router/config.json'))
p=c['Providers'][0]
print(p.get('api_base_url',''))
" 2>/dev/null) || { echo -e "${R}无法解析 config.json${N}"; exit 1; }
  api_key=$(python3 -c "
import json
c=json.load(open('$HOME/.claude-code-router/config.json'))
print(c['Providers'][0].get('api_key',''))
" 2>/dev/null) || true
else
  echo "用法: $0 [api_base_url api_key]"
  echo "不传参数则从 ~/.claude-code-router/config.json 读取"
  exit 1
fi

if [ -z "$base_url" ]; then
  echo -e "${R}错误: 未获取到 api_base_url${N}"; exit 1
fi

echo -e "${Y}测试:${N} $base_url"
echo ""

for model in "deepseek-v4-pro" "deepseek-v4-flash"; do
  echo -n "  $model ... "
  resp=$(curl -s -w "\n%{http_code}" -X POST "$base_url" \
    -H "x-api-key: $api_key" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "{\"model\":\"$model\",\"max_tokens\":10,\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}]}" 2>/dev/null)
  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | sed '$d')
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    echo -e "${G}OK (HTTP $code)${N}"
  else
    err=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',{}).get('message','?'))" 2>/dev/null || echo "$body" | head -c 120)
    echo -e "${R}FAIL (HTTP $code):${N} $err"
  fi
done

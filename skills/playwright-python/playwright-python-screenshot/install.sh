#!/bin/bash
set -euo pipefail

# Idempotent guard — playwright CLI + browser cache must both exist
command -v playwright && [ -d /root/.cache/ms-playwright ] && exit 0

# retry helper for executable skill setup
# 提供网络敏感命令的 retry 包装
retry() {
  local n=0 max=3
  until "$@"; do
    n=$((n+1))
    if [ $n -ge $max ]; then
      echo "[claude-skill] retry $n/$max failed: $*" >&2
      return 1
    fi
    sleep $((n*3))
  done
}


# ── China-friendly apt mirrors ──────────────────────────────────────────────
sed -i 's|http://deb.debian.org/debian|https://mirrors.tuna.tsinghua.edu.cn/debian|g' /etc/apt/sources.list 2>/dev/null || true
sed -i 's|http://security.debian.org|https://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list 2>/dev/null || true
sed -i 's|http://deb.debian.org/debian|https://mirrors.tuna.tsinghua.edu.cn/debian|g' /etc/apt/sources.list.d/*.list 2>/dev/null || true

retry apt-get update -y
retry apt-get install -y python3 python3-pip ca-certificates curl

retry pip3 install --break-system-packages playwright

# Playwright needs system deps for Chromium; --with-deps drives apt internally
retry playwright install --with-deps chromium

# ── Self-verify ─────────────────────────────────────────────────────────────
playwright --version >/dev/null
python3 -c "from playwright.sync_api import sync_playwright; print('OK')" >/dev/null

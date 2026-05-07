#!/usr/bin/env bash
# Install Python 3 + playwright + headless Chromium into Debian sandbox.
# Use Tsinghua mirror to avoid 中国大陆 outbound timeouts on default Debian repos.
command -v playwright >/dev/null 2>&1 \
  && [ -d /root/.cache/ms-playwright ] \
  && exit 0   # idempotent guard

# install_helpers.sh — 由 distill 注入到每个 install.sh 头部
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

set -euo pipefail

# Network optimization for restricted environments (e.g. China):
# swap deb.debian.org → mirrors.tuna.tsinghua.edu.cn before apt update.
# Idempotent — sed only modifies if the source string is present.
if [ -f /etc/apt/sources.list.d/debian.sources ]; then
  sed -i "s|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g" /etc/apt/sources.list.d/debian.sources
fi

retry apt-get update -y
retry apt-get install --no-install-recommends -y \
  python3 python3-pip ca-certificates curl
apt-get clean
rm -rf /var/lib/apt/lists/*

# Debian 12 enforces PEP 668 (externally-managed-environment); --break-system-packages
# is acceptable inside a disposable sandbox where we own the only Python install.
# Pin to a recent stable; the SKILL.md says "Playwright Python (stable, unversioned)".
retry pip3 install --break-system-packages --no-cache-dir 'playwright>=1.45,<2'

# `playwright install --with-deps chromium` downloads chromium (~150MB) and apt-installs
# the libs Chromium needs (libnss3/libcups2/libgbm1/etc.) in one shot. retry guards the
# combined network operation; safe to re-run.
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/root/.cache/ms-playwright}"
retry playwright install --with-deps chromium

# Self-verify: import + version
python3 -c "from playwright.sync_api import sync_playwright; print('playwright import OK')"
playwright --version >/dev/null

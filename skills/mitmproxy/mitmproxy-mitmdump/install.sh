#!/usr/bin/env bash
# Install mitmproxy + ca-certificates into Debian sandbox.
# Use Tsinghua mirror to avoid 中国大陆 outbound timeouts on default Debian repos.
which mitmdump >/dev/null 2>&1 && exit 0   # idempotent guard

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

set -euo pipefail

# Network optimization for restricted environments (e.g. China):
# swap deb.debian.org → mirrors.tuna.tsinghua.edu.cn before apt update.
# Idempotent — sed only modifies if the source string is present.
if [ -f /etc/apt/sources.list.d/debian.sources ]; then
  sed -i "s|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g" /etc/apt/sources.list.d/debian.sources
fi

retry apt-get update -y
retry apt-get install --no-install-recommends -y mitmproxy ca-certificates
apt-get clean
rm -rf /var/lib/apt/lists/*

mitmdump --version >/dev/null  # self-verify

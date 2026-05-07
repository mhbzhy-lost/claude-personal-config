#!/usr/bin/env bash
# Install OpenJDK 17 JRE headless + maestro CLI into Debian sandbox.
# Use Tsinghua mirror to avoid 中国大陆 outbound timeouts on default Debian repos.
which maestro >/dev/null 2>&1 && exit 0   # idempotent guard

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
  openjdk-17-jre-headless ca-certificates curl unzip bash
apt-get clean
rm -rf /var/lib/apt/lists/*

# Maestro install: official one-shot installer drops the binary at
# $HOME/.maestro/bin/maestro and does not modify PATH globally. We symlink
# into /usr/local/bin so `which maestro` succeeds after this script.
export MAESTRO_VERSION="${MAESTRO_VERSION:-2.5.1}"
export HOME="${HOME:-/root}"
retry bash -c 'curl -fsSL "https://get.maestro.mobile.dev" | bash'

# Symlink to /usr/local/bin so the binary is on PATH for any subsequent
# `docker exec` (which gets a fresh shell with no $HOME/.maestro/bin entry).
ln -sf "$HOME/.maestro/bin/maestro" /usr/local/bin/maestro

# Self-verify
JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(which java)")")")" \
  /usr/local/bin/maestro --version >/dev/null

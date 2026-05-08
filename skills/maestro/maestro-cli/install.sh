#!/bin/bash
command -v maestro >/dev/null 2>&1 && exit 0

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


# Fallback retry if not auto-injected by pipeline
type retry >/dev/null 2>&1 || retry() { "$@"; }

export DEBIAN_FRONTEND=noninteractive

# Replace apt sources with Tsinghua mirrors (China network)
sed -i 's|http://deb.debian.org/debian|http://mirrors.tuna.tsinghua.edu.cn/debian|g' /etc/apt/sources.list.d/debian.sources
sed -i 's|http://deb.debian.org/debian-security|http://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list.d/debian.sources

retry apt-get update
retry apt-get install -y --no-install-recommends openjdk-17-jre-headless curl unzip

# Dynamically determine JAVA_HOME (handles both amd64 and arm64)
JAVA_HOME=$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")
echo "JAVA_HOME=$JAVA_HOME" >> /etc/environment
export JAVA_HOME

# Download latest maestro CLI zip from GitHub releases
MAESTRO_URL="https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.5.1/maestro.zip"

retry curl -fsSL -o /tmp/maestro.zip "$MAESTRO_URL"

# Maestro launcher 是 shell wrapper，依赖兄弟 lib/jvm-version.jar 等 jar 包
# 通过 dirname "$0" 相对寻址。所以必须保留整棵 bin+lib 子树到 /opt/maestro
# 而不是只 cp launcher 到 /usr/local/bin/maestro（那样会在启动时
# Could not find or load main class JvmVersion）。
TMP_EXTRACT=$(mktemp -d /tmp/maestro-extract-XXXX)
unzip -o -q /tmp/maestro.zip -d "$TMP_EXTRACT"

# zip 顶层是 "maestro/"（含 bin/ 和 lib/）
EXTRACTED_ROOT=$(find "$TMP_EXTRACT" -maxdepth 2 -type d -name maestro -path "*/maestro" | head -1)
if [ -z "$EXTRACTED_ROOT" ] || [ ! -f "$EXTRACTED_ROOT/bin/maestro" ]; then
    echo "ERROR: maestro tree not found under $TMP_EXTRACT" >&2
    ls -laR "$TMP_EXTRACT" >&2
    exit 1
fi

# 整棵搬到 /opt/maestro（清掉旧版以保 idempotent）
rm -rf /opt/maestro
mv "$EXTRACTED_ROOT" /opt/maestro
chmod 755 /opt/maestro/bin/maestro

# Symlink 到 PATH 上的位置，让 `which maestro` 命中
ln -sf /opt/maestro/bin/maestro /usr/local/bin/maestro

# Cleanup
rm -rf /tmp/maestro.zip "$TMP_EXTRACT"

# Self-verify
export JAVA_HOME
maestro --version >/dev/null
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

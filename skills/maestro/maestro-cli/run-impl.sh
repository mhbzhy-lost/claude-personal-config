#!/usr/bin/env bash
# run-impl.sh — wrap maestro CLI, exporting JAVA_HOME for non-login docker exec.
#
# docker exec spawns a non-login shell — /etc/environment isn't auto-sourced,
# so JAVA_HOME (which the maestro launcher requires) must be set explicitly
# from the Debian default openjdk-17 install path. Falls back to readlink-derived
# path if the default isn't there (handles arm64 vs amd64 layout).
set -euo pipefail
if [ -z "${JAVA_HOME:-}" ]; then
  if [ -d /usr/lib/jvm/java-17-openjdk-arm64 ]; then
    export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-arm64
  elif [ -d /usr/lib/jvm/java-17-openjdk-amd64 ]; then
    export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
  else
    export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")"
  fi
fi
exec maestro "$@"

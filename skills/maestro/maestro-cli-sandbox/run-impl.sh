#!/usr/bin/env bash
# run-impl.sh — wrap maestro CLI with JAVA_HOME export.
#
# Maestro is a Java app and requires JAVA_HOME (the official wrapper at
# $HOME/.maestro/bin/maestro infers it but only when invoked via the user's
# login shell). docker exec spawns a non-login bash, so we set JAVA_HOME
# explicitly here from the OpenJDK 17 default install path.
#
# Usage examples (via runner.sh):
#   runner.sh --version                          # print version
#   runner.sh --help                             # full help
#   runner.sh cloud --app-file=app.apk --flows=flows/ --api-key=$KEY
#   runner.sh test --format=NOOP flow.yaml       # syntax check
set -euo pipefail
export JAVA_HOME="${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(which java)")")")}"
exec maestro "$@"

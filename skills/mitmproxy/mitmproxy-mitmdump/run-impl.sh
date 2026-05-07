#!/usr/bin/env bash
# run-impl.sh — wrap mitmdump with sane defaults for capture-and-replay.
#
# Usage examples (via runner.sh):
#   runner.sh                                # interactive mitmdump on default port 8080
#   runner.sh --version                      # print version
#   runner.sh -p 9090 -w capture.flow        # custom port + flow output
#   runner.sh -r capture.flow                # replay a saved flow
#
# The runner.sh wrapper sets cwd to /work which is the agent's $PWD inside
# the sandbox — capture.flow lands in the host's $PWD.
set -euo pipefail
exec mitmdump "$@"

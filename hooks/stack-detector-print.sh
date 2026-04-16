#!/usr/bin/env bash
# SubagentStop hook for stack-detector.
#
# Reads the hook input JSON on stdin, extracts last_assistant_message
# (the subagent's final text output) and surfaces it to the user via
# systemMessage so the detected tech_stack is visible in the UI.

set -euo pipefail

LOG_FILE="${STACK_DETECTOR_PRINT_LOG:-$HOME/.claude/logs/stack-detector-print.log}"
mkdir -p "$(dirname "$LOG_FILE")"

INPUT=$(cat)
printf '[%s] hook fired\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
printf '%s\n' "$INPUT" >> "$LOG_FILE"

MSG=$(printf '%s' "$INPUT" | jq -r '.last_assistant_message // empty')

if [ -z "$MSG" ]; then
  exit 0
fi

jq -n --arg msg "[stack-detector]
$MSG" '{systemMessage: $msg, suppressOutput: true}'

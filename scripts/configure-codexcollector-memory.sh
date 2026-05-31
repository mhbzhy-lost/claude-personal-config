#!/usr/bin/env bash
set -euo pipefail

PLIST="${CODEXCOLLECTOR_PLIST:-$HOME/Library/LaunchAgents/codexcollector.plist}"
MAX_OLD_SPACE_SIZE="${CODEXCOLLECTOR_MAX_OLD_SPACE_SIZE:-512}"
RELOAD=0
PLISTBUDDY="/usr/libexec/PlistBuddy"

usage() {
  cat <<'USAGE'
Usage: configure-codexcollector-memory.sh [options]

Options:
  --plist PATH                 LaunchAgent plist path.
  --max-old-space-size MB      V8 old-space heap limit in MB. Default: 512.
  --reload                     Unload and load the LaunchAgent after updating.
  -h, --help                   Show this help.

Environment:
  CODEXCOLLECTOR_PLIST
  CODEXCOLLECTOR_MAX_OLD_SPACE_SIZE
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plist)
      [[ $# -ge 2 ]] || { echo "missing value for --plist" >&2; exit 2; }
      PLIST="$2"
      shift 2
      ;;
    --max-old-space-size)
      [[ $# -ge 2 ]] || { echo "missing value for --max-old-space-size" >&2; exit 2; }
      MAX_OLD_SPACE_SIZE="$2"
      shift 2
      ;;
    --reload)
      RELOAD=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! [[ "$MAX_OLD_SPACE_SIZE" =~ ^[1-9][0-9]*$ ]]; then
  echo "--max-old-space-size must be a positive integer, got: $MAX_OLD_SPACE_SIZE" >&2
  exit 2
fi

if [[ ! -f "$PLIST" ]]; then
  echo "plist not found: $PLIST" >&2
  exit 1
fi

if ! "$PLISTBUDDY" -c "Print :EnvironmentVariables" "$PLIST" >/dev/null 2>&1; then
  "$PLISTBUDDY" -c "Add :EnvironmentVariables dict" "$PLIST"
fi

current_node_options="$("$PLISTBUDDY" -c "Print :EnvironmentVariables:NODE_OPTIONS" "$PLIST" 2>/dev/null || true)"
heap_option="--max-old-space-size=$MAX_OLD_SPACE_SIZE"

if [[ -z "$current_node_options" ]]; then
  new_node_options="$heap_option"
elif [[ "$current_node_options" =~ --max-old-space-size=[0-9]+ ]]; then
  existing_heap_option="${BASH_REMATCH[0]}"
  new_node_options="${current_node_options//$existing_heap_option/$heap_option}"
else
  new_node_options="$current_node_options $heap_option"
fi

if "$PLISTBUDDY" -c "Print :EnvironmentVariables:NODE_OPTIONS" "$PLIST" >/dev/null 2>&1; then
  "$PLISTBUDDY" -c "Set :EnvironmentVariables:NODE_OPTIONS $new_node_options" "$PLIST"
else
  "$PLISTBUDDY" -c "Add :EnvironmentVariables:NODE_OPTIONS string $new_node_options" "$PLIST"
fi

plutil -lint "$PLIST" >/dev/null

if [[ "$RELOAD" -eq 1 ]]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
fi

printf 'codexcollector NODE_OPTIONS=%s\n' "$new_node_options"

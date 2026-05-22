# Claude Code launchers + log helper. Sourced by ~/.zshrc.
# Provider switching is delegated to Claude Code's --settings (no local proxy).

# --- internal helpers --------------------------------------------------------
# Claude Code 把 CWD 编码到 ~/.claude/projects/<encoded>/，规则是把 path 中
# 的 '/' 与 '.' 都替换为 '-'（例如 /Users/leshi.zhy/foo → -Users-leshi-zhy-foo）。
# 历史上 claude-log 只换了 '/'，在带点路径下静默找不到日志；统一走这个 helper。
_claude_proj_dir() {
  local enc="${PWD//./-}"
  enc="${enc//\//-}"
  print -r -- "$HOME/.claude/projects/$enc"
}

# 当前 CWD 是否已有 Claude 会话历史。无历史时调用 --continue 会以
# "No conversation found to continue" 退出，因此 launcher 在自动续聊前先探一下。
_claude_has_history() {
  local dir
  dir="$(_claude_proj_dir)"
  local sessions=("$dir"/*.jsonl(N))
  (( ${#sessions} > 0 ))
}

# --- claude wrapper -----------------------------------------------------------
claude() {
  if (( $# == 0 )); then
    if _claude_has_history; then
      command claude --continue --fork-session
    else
      command claude
    fi
  else
    command claude "$@"
  fi
}

# --- claude-qwen --------------------------------------------------------------
claude-qwen() {
  (
    local env_file="$HOME/claude-config/claude/settings/.env"
    if [[ -f "$env_file" ]]; then
      set -a; source "$env_file"; set +a
    fi
    if [[ -z "$ANTHROPIC_AUTH_TOKEN_QWEN" ]]; then
      echo "claude-qwen: ANTHROPIC_AUTH_TOKEN_QWEN not set; check $env_file" >&2
      return 1
    fi
    export ANTHROPIC_AUTH_TOKEN="$ANTHROPIC_AUTH_TOKEN_QWEN"
    local settings="$HOME/claude-config/claude/settings/settings-qwen.json"
    if (( $# == 0 )); then
      if _claude_has_history; then
        command claude --settings "$settings" --continue --fork-session
      else
        command claude --settings "$settings"
      fi
    else
      command claude --settings "$settings" "$@"
    fi
  )
}

# --- claude-deepseek ----------------------------------------------------------
claude-deepseek() {
  (
    local env_file="$HOME/claude-config/claude/settings/.env"
    if [[ -f "$env_file" ]]; then
      set -a; source "$env_file"; set +a
    fi
    if [[ -z "$ANTHROPIC_AUTH_TOKEN_DEEPSEEK" ]]; then
      echo "claude-deepseek: ANTHROPIC_AUTH_TOKEN_DEEPSEEK not set; check $env_file" >&2
      return 1
    fi
    export ANTHROPIC_AUTH_TOKEN="$ANTHROPIC_AUTH_TOKEN_DEEPSEEK"
    local settings="$HOME/claude-config/claude/settings/settings-deepseek.json"
    if (( $# == 0 )); then
      if _claude_has_history; then
        command claude --settings "$settings" --continue --fork-session
      else
        command claude --settings "$settings"
      fi
    else
      command claude --settings "$settings" "$@"
    fi
  )
}

# --- claude-log ---------------------------------------------------------------
# Inspect / open Claude Code session jsonl logs for the current directory.
claude-log() {
  local dir
  dir="$(_claude_proj_dir)"
  local opt_edit=0 opt_copy=0 opt_list=0 opt_n=1

  while getopts ":ecln:h" opt; do
    case "$opt" in
      e) opt_edit=1 ;;
      c) opt_copy=1 ;;
      l) opt_list=1 ;;
      n) opt_n="$OPTARG" ;;
      h)
        cat <<'EOF'
Usage: claude-log [OPTIONS]
  (no flags)   Print absolute path of the most recent session log for $PWD
  -e           Open the log with $EDITOR (falls back to 'code')
  -c           Copy the log path to clipboard (pbcopy)
  -n N         Use the Nth most recent session (default: 1); combinable with -e/-c
  -l           List all sessions for $PWD, newest first (timestamp + path)
  -h           Show this help
EOF
        return 0
        ;;
      :) echo "claude-log: option -$OPTARG requires an argument" >&2; return 1 ;;
      \?) echo "claude-log: unknown option -$OPTARG" >&2; return 1 ;;
    esac
  done

  # -l: list mode
  if (( opt_list )); then
    if [[ ! -d "$dir" ]] || ! ls "$dir"/*.jsonl >/dev/null 2>&1; then
      echo "claude-log: no claude code logs found for $PWD" >&2
      return 1
    fi
    stat -f '%Sm %N' -t '%Y-%m-%d %H:%M:%S' "$dir"/*.jsonl 2>/dev/null | sort -r
    return 0
  fi

  # resolve the Nth newest file
  if [[ ! -d "$dir" ]] || ! ls "$dir"/*.jsonl >/dev/null 2>&1; then
    echo "claude-log: no claude code logs found for $PWD" >&2
    return 1
  fi

  local target
  target=$(ls -t "$dir"/*.jsonl 2>/dev/null | sed -n "${opt_n}p")
  if [[ -z "$target" ]]; then
    echo "claude-log: no session #${opt_n} found (fewer logs exist)" >&2
    return 1
  fi

  if (( opt_copy )); then
    echo -n "$target" | pbcopy
    echo "Copied to clipboard: $target"
    return 0
  fi

  if (( opt_edit )); then
    local editor="${EDITOR:-}"
    if [[ -z "$editor" ]]; then
      if command -v code >/dev/null 2>&1; then
        editor="code"
      else
        echo "claude-log: \$EDITOR is unset and 'code' not found in PATH" >&2
        return 1
      fi
    fi
    "$editor" "$target"
    return 0
  fi

  echo "$target"
}
# ------------------------------------------------------------------------------

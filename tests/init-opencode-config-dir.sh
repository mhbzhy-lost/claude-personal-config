#!/usr/bin/env bash
# Test script to verify OPENCODE_CONFIG_DIR resolution respects XDG_CONFIG_HOME
set -euo pipefail

echo "=== Testing OPENCODE_CONFIG_DIR resolution ==="

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Test 1: OPENCODE_CONFIG_DIR explicitly set (should take precedence)
echo -e "\n--- Test 1: Explicit OPENCODE_CONFIG_DIR (should take precedence) ---"
(
  export OPENCODE_CONFIG_DIR="/explicit/path/opencode"
  export XDG_CONFIG_HOME="/should/be/ignored"
  export OPENCODE_INIT_AS_LIBRARY=1
  source "$REPO_ROOT/init_opencode.sh"
  
  if [ "$OPENCODE_CONFIG_DIR" = "/explicit/path/opencode" ]; then
    echo "✓ PASS: Explicit OPENCODE_CONFIG_DIR took precedence"
  else
    echo "❌ FAIL: OPENCODE_CONFIG_DIR should be /explicit/path/opencode, got $OPENCODE_CONFIG_DIR"
    exit 1
  fi
)

# Test 2: XDG_CONFIG_HOME set (should use $XDG_CONFIG_HOME/opencode)
echo -e "\n--- Test 2: XDG_CONFIG_HOME set (should use it) ---"
(
  unset OPENCODE_CONFIG_DIR
  export XDG_CONFIG_HOME="/tmp/xdg-test"
  export OPENCODE_INIT_AS_LIBRARY=1
  source "$REPO_ROOT/init_opencode.sh"
  
  if [ "$OPENCODE_CONFIG_DIR" = "/tmp/xdg-test/opencode" ]; then
    echo "✓ PASS: XDG_CONFIG_HOME was respected"
  else
    echo "❌ FAIL: OPENCODE_CONFIG_DIR should be /tmp/xdg-test/opencode, got $OPENCODE_CONFIG_DIR"
    exit 1
  fi
)

# Test 3: Neither set (should default to $HOME/.config/opencode)
echo -e "\n--- Test 3: Neither set (should default to \$HOME/.config/opencode) ---"
(
  unset OPENCODE_CONFIG_DIR
  unset XDG_CONFIG_HOME
  export OPENCODE_INIT_AS_LIBRARY=1
  source "$REPO_ROOT/init_opencode.sh"
  
  expected="$HOME/.config/opencode"
  if [ "$OPENCODE_CONFIG_DIR" = "$expected" ]; then
    echo "✓ PASS: Defaulted to \$HOME/.config/opencode"
  else
    echo "❌ FAIL: OPENCODE_CONFIG_DIR should be $expected, got $OPENCODE_CONFIG_DIR"
    exit 1
  fi
)

echo -e "\n=== All tests passed ==="

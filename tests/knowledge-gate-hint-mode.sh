#!/usr/bin/env bash
# Test script to verify knowledge-gate hint mode behavior
set -euo pipefail

echo "=== Testing knowledge-gate hint mode ==="

# Create temporary test repository
TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"
git init -q
git config user.email "test@example.com"
git config user.name "Test User"

# Create .agent directory structure
mkdir -p .agent/hooks

# Copy knowledge-gate.py
cp /Users/leshi.zhy/claude-config/.agent/hooks/knowledge-gate.py .agent/hooks/

# Test 1: Block mode (default behavior)
echo -e "\n--- Test 1: Block mode (should fail) ---"
cat > .agent/knowledge-gate.json <<'EOF'
{
  "version": 1,
  "mode": "block",
  "rules": [
    {
      "id": "test-rule",
      "paths": ["userconf/*"],
      "satisfy_by": ["docs/knowledge/*"],
      "reason": "test trigger for userconf changes"
    }
  ]
}
EOF

git add .agent/
git commit -q -m "Initial commit"

# Stage a file that would trigger the gate
mkdir -p userconf
echo "test" > userconf/test.py
git add userconf/test.py

if python3 .agent/hooks/knowledge-gate.py --mode pre-commit 2>&1; then
  echo "❌ FAIL: Block mode should have returned non-zero exit code"
  exit 1
else
  echo "✓ PASS: Block mode correctly returned non-zero exit code"
fi

# Test 2: Hint mode (should succeed with warnings)
echo -e "\n--- Test 2: Hint mode (should succeed with warnings) ---"
cat > .agent/knowledge-gate.json <<'EOF'
{
  "version": 1,
  "mode": "hint",
  "rules": [
    {
      "id": "test-rule",
      "paths": ["userconf/*"],
      "satisfy_by": ["docs/knowledge/*"],
      "reason": "test trigger for userconf changes"
    }
  ]
}
EOF

OUTPUT=$(python3 .agent/hooks/knowledge-gate.py --mode pre-commit 2>&1) || EXIT_CODE=$?

if [[ -z "${EXIT_CODE+set}" ]] || [[ "$EXIT_CODE" -eq 0 ]]; then
  echo "✓ PASS: Hint mode correctly returned zero exit code"
  if echo "$OUTPUT" | grep -q "⚠️.*提醒"; then
    echo "✓ PASS: Hint mode printed reminder message"
  else
    echo "❌ FAIL: Hint mode did not print reminder message"
    echo "Output: $OUTPUT"
    exit 1
  fi
else
  echo "❌ FAIL: Hint mode should have returned zero exit code, got $EXIT_CODE"
  echo "Output: $OUTPUT"
  exit 1
fi

# Test 3: No violations (should succeed silently)
echo -e "\n--- Test 3: No violations (should succeed silently) ---"
git reset -q
mkdir -p docs/knowledge
echo "test" > docs/knowledge/test.md
git add docs/knowledge/test.md userconf/test.py

if python3 .agent/hooks/knowledge-gate.py --mode pre-commit 2>&1; then
  echo "✓ PASS: No violations correctly returned zero exit code"
else
  echo "❌ FAIL: No violations should have returned zero exit code"
  exit 1
fi

# Cleanup
cd /
rm -rf "$TEST_DIR"

echo -e "\n=== All tests passed ==="

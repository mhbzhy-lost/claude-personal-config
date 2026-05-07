#!/usr/bin/env bash
# run-impl.sh — capture a screenshot via headless Chromium.
#
# Usage examples (via runner.sh, which translates $PWD → /work and back):
#   runner.sh https://example.com                      # → ./screenshot.png
#   runner.sh https://example.com out.png              # → ./out.png
#   runner.sh https://example.com out.png --full-page  # full-page capture
#
# The runner.sh wrapper sets cwd to /work (the agent's $PWD inside the
# sandbox), so output files land in the host's $PWD.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $(basename "$0") <url> [output_path] [--full-page]" >&2
  exit 64
fi

URL="$1"
OUT="${2:-screenshot.png}"
FULL_PAGE="false"
if [ "${3:-}" = "--full-page" ]; then
  FULL_PAGE="true"
fi

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/root/.cache/ms-playwright}"

URL="$URL" OUT="$OUT" FULL_PAGE="$FULL_PAGE" python3 - <<'PY'
import os
from playwright.sync_api import sync_playwright

url = os.environ["URL"]
out = os.environ["OUT"]
full_page = os.environ["FULL_PAGE"] == "true"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(url)
    page.screenshot(path=out, full_page=full_page)
    browser.close()

print(f"saved {out}")
PY

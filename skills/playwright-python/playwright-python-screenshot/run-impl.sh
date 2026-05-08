#!/bin/bash
output="${2:-screenshot.png}"; [ -f "$output" ] && exit 0

if [ $# -eq 0 ]; then
    echo "Usage: $0 <URL> [output_path]"
    exit 1
fi

url="$1"
output="${2:-screenshot.png}"

python3 - "$url" "$output" << 'PYEOF'
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1]
output = sys.argv[2]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(url)
    page.screenshot(path=output, full_page=True)
    browser.close()
PYEOF
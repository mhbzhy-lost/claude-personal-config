#!/usr/bin/env python3
"""Phaser runtime environment check & bootstrap.

Detects whether the playwright + chromium environment is ready to run the
phaser-runtime-* skills, and (optionally) installs missing pieces.

Usage:
    python check.py              # check only, exit 0 if ready, 1 if not
    python check.py --install    # check then attempt to install anything missing
    python check.py --json       # emit machine-readable JSON result

Checks performed:
    1. Python version >= 3.10 (playwright sync_api requirement)
    2. `playwright` Python package importable
    3. Chromium binary installed (via playwright._impl._driver registry lookup)
    4. Scaffold HTML exists at ../phaser-runtime-common/scaffold/index.html
    5. Launch chromium headless, open scaffold, confirm window.__ready becomes true

Exit codes:
    0 = all checks passed
    1 = at least one check failed
    2 = usage / unexpected error
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

SCAFFOLD = (
    Path(__file__).parent.parent / "phaser-runtime-common" / "scaffold" / "index.html"
).resolve()
MIN_PY = (3, 10)


def _result(name: str, ok: bool, detail: str = "", fix: str = "") -> dict[str, Any]:
    return {"name": name, "ok": ok, "detail": detail, "fix": fix}


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------


def check_python() -> dict[str, Any]:
    v = sys.version_info
    ok = v >= MIN_PY
    return _result(
        "python_version",
        ok,
        detail=f"{v.major}.{v.minor}.{v.micro}",
        fix=f"Upgrade to Python >= {MIN_PY[0]}.{MIN_PY[1]}" if not ok else "",
    )


def check_playwright_package() -> dict[str, Any]:
    try:
        import playwright  # noqa: F401
        v = getattr(playwright, "__version__", None)
        if v is None:
            # 某些版本/Python 不导出 __version__，尝试 importlib.metadata
            try:
                from importlib.metadata import version as pkg_version
                v = pkg_version("playwright")
            except Exception:
                v = "unknown"
        return _result("playwright_package", True, detail=f"playwright=={v}")
    except ImportError as e:
        return _result(
            "playwright_package",
            False,
            detail=str(e),
            fix="pip install 'playwright>=1.50'  (or `uv sync` in project root)",
        )


def check_chromium_binary() -> dict[str, Any]:
    """Ask playwright where its chromium lives and verify it's on disk."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return _result(
            "chromium_binary",
            False,
            detail="playwright not importable",
            fix="Run playwright package fix first",
        )

    try:
        with sync_playwright() as p:
            exe = p.chromium.executable_path
    except Exception as e:  # noqa: BLE001
        return _result(
            "chromium_binary",
            False,
            detail=f"{type(e).__name__}: {e}",
            fix="playwright install chromium",
        )

    if not exe or not Path(exe).exists():
        return _result(
            "chromium_binary",
            False,
            detail=f"executable_path={exe} (missing)",
            fix="playwright install chromium",
        )
    return _result("chromium_binary", True, detail=exe)


def check_scaffold() -> dict[str, Any]:
    if not SCAFFOLD.exists():
        return _result(
            "scaffold_html",
            False,
            detail=f"missing {SCAFFOLD}",
            fix="Ensure skills/webgame/phaser-runtime-common/scaffold/index.html is present",
        )
    return _result("scaffold_html", True, detail=str(SCAFFOLD))


def check_smoke_launch() -> dict[str, Any]:
    """Actually launch chromium, load scaffold, verify __ready becomes true."""
    try:
        from playwright.sync_api import Error as PWError
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        return _result(
            "smoke_launch",
            False,
            detail=str(e),
            fix="Fix playwright package first",
        )

    if not SCAFFOLD.exists():
        return _result(
            "smoke_launch",
            False,
            detail="scaffold missing, skip",
            fix="Fix scaffold first",
        )

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                context = browser.new_context()
                page = context.new_page()
                page.goto(f"file://{SCAFFOLD}")
                page.wait_for_function("window.__ready === true", timeout=10_000)
                renderer = page.evaluate(
                    "typeof Phaser !== 'undefined' ? Phaser.VERSION : null"
                )
            finally:
                browser.close()
    except PWError as e:
        msg = str(e)
        fix = "playwright install chromium"
        if "Host system is missing dependencies" in msg or "libnss3" in msg:
            fix = "playwright install-deps chromium  (requires sudo on Linux)"
        return _result("smoke_launch", False, detail=msg.splitlines()[0], fix=fix)
    except Exception as e:  # noqa: BLE001
        return _result(
            "smoke_launch",
            False,
            detail=f"{type(e).__name__}: {e}",
            fix="See detail above",
        )
    return _result(
        "smoke_launch",
        True,
        detail=f"chromium OK, Phaser version loaded={renderer}",
    )


CHECKS = [
    check_python,
    check_playwright_package,
    check_chromium_binary,
    check_scaffold,
    check_smoke_launch,
]


# ---------------------------------------------------------------------------
# Install actions
# ---------------------------------------------------------------------------


def _run(cmd: list[str]) -> tuple[bool, str]:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        ok = proc.returncode == 0
        out = (proc.stdout or "") + (proc.stderr or "")
        return ok, out.strip()
    except FileNotFoundError:
        return False, f"command not found: {cmd[0]}"
    except subprocess.TimeoutExpired:
        return False, f"timeout: {' '.join(cmd)}"


def install_playwright_package() -> tuple[bool, str]:
    # Prefer uv if the project uses it (pyproject.toml + .venv managed by uv).
    if shutil.which("uv"):
        ok, out = _run(["uv", "pip", "install", "playwright>=1.50"])
        if ok:
            return True, "installed via uv pip"
        return False, out
    ok, out = _run([sys.executable, "-m", "pip", "install", "playwright>=1.50"])
    return ok, out if ok else out


def install_chromium() -> tuple[bool, str]:
    ok, out = _run([sys.executable, "-m", "playwright", "install", "chromium"])
    return ok, out


def install_chromium_deps() -> tuple[bool, str]:
    ok, out = _run([sys.executable, "-m", "playwright", "install-deps", "chromium"])
    return ok, out


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def run_checks() -> list[dict[str, Any]]:
    return [c() for c in CHECKS]


def maybe_install(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    names = {r["name"]: r for r in results}

    if not names["playwright_package"]["ok"]:
        ok, out = install_playwright_package()
        actions.append({"action": "install_playwright_package", "ok": ok, "output": out[-500:]})
        if not ok:
            return actions

    if not names.get("chromium_binary", {}).get("ok", False):
        ok, out = install_chromium()
        actions.append({"action": "install_chromium", "ok": ok, "output": out[-500:]})
        if not ok and ("Host system is missing" in out or "libnss3" in out):
            ok2, out2 = install_chromium_deps()
            actions.append({"action": "install_chromium_deps", "ok": ok2, "output": out2[-500:]})

    return actions


def format_text(results: list[dict[str, Any]], actions: list[dict[str, Any]]) -> str:
    lines = ["Phaser runtime environment check", "=" * 34]
    for r in results:
        mark = "OK " if r["ok"] else "FAIL"
        lines.append(f"  [{mark}] {r['name']}: {r['detail']}")
        if not r["ok"] and r["fix"]:
            lines.append(f"         fix: {r['fix']}")
    if actions:
        lines.append("")
        lines.append("Install actions:")
        for a in actions:
            mark = "OK " if a["ok"] else "FAIL"
            lines.append(f"  [{mark}] {a['action']}")
            if not a["ok"]:
                lines.append(f"         output tail: {a['output']}")
    all_ok = all(r["ok"] for r in results)
    lines.append("")
    lines.append("RESULT: " + ("READY" if all_ok else "NOT READY"))
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Phaser runtime environment check/bootstrap")
    parser.add_argument("--install", action="store_true", help="Attempt to install missing pieces")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text")
    args = parser.parse_args()

    results = run_checks()
    actions: list[dict[str, Any]] = []
    if args.install and not all(r["ok"] for r in results):
        actions = maybe_install(results)
        # Re-run checks after install attempts.
        results = run_checks()

    all_ok = all(r["ok"] for r in results)

    if args.json:
        print(json.dumps({"ok": all_ok, "checks": results, "actions": actions}))
    else:
        print(format_text(results, actions))

    return 0 if all_ok else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(2)

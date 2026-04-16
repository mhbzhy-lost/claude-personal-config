#!/usr/bin/env python3
"""Phaser runtime helper.

Shared entry point for the phaser-runtime-* skill suite. Launches a headless
Chromium via Playwright, loads a minimal Phaser 3.90 scaffold, injects a user
Scene, and exposes five actions:

    snapshot    - run a Scene and capture a PNG
    probe       - run a Scene and evaluate expressions against the active scene
    watch       - run a Scene for N ms, sampling expressions every frame
    load-check  - run only preload() and report every asset's load result
    self-test   - validate the full runtime chain (scaffold → scene → snap → probe → watch)

All output is emitted as a single JSON document on stdout. Errors (both from
Python and from the browser page) are aggregated into the `errors` array so
agents can read them without parsing stderr.

Prerequisites (one-time):
    playwright install chromium
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

SETUP_HINT = (
    "Environment not ready. Run: "
    "python skills/webgame/phaser-runtime-setup/check.py --install --json"
)

# Auto-install playwright if missing. check.py handles pip install + chromium download.
try:
    from playwright.sync_api import Error as PWError
    from playwright.sync_api import sync_playwright
except ImportError:
    _check_script = Path(__file__).parent.parent / "phaser-runtime-setup" / "check.py"
    if _check_script.exists():
        import subprocess as _sp
        _proc = _sp.run(
            [sys.executable, str(_check_script), "--install", "--json"],
            capture_output=True, text=True, timeout=300,
        )
        try:
            _result = json.loads(_proc.stdout)
            if not _result.get("ok"):
                _failed = [c for c in _result.get("checks", []) if not c.get("ok")]
                print(json.dumps({
                    "ok": False,
                    "errors": [{"type": "environment",
                                "message": f"auto-install failed: {_failed}",
                                "hint": SETUP_HINT}],
                }))
                sys.exit(1)
        except (json.JSONDecodeError, TypeError):
            print(json.dumps({
                "ok": False,
                "errors": [{"type": "environment",
                            "message": f"check.py output unparseable: {_proc.stdout[:300]}",
                            "hint": SETUP_HINT}],
            }))
            sys.exit(1)
        # Retry import after successful install
        try:
            from playwright.sync_api import Error as PWError
            from playwright.sync_api import sync_playwright
        except ImportError:
            print(json.dumps({
                "ok": False,
                "errors": [{"type": "environment",
                            "message": "playwright installed but still not importable (venv mismatch?)",
                            "hint": SETUP_HINT}],
            }))
            sys.exit(1)
    else:
        print(json.dumps({
            "ok": False,
            "errors": [{"type": "environment",
                        "message": "playwright is not installed and check.py not found",
                        "hint": SETUP_HINT}],
        }))
        sys.exit(1)

SCAFFOLD = Path(__file__).parent / "scaffold" / "index.html"
DEFAULT_READY_TIMEOUT_MS = 10_000
DEFAULT_SCENE_TIMEOUT_MS = 10_000


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _read_scene(path: str) -> str:
    """Read a Scene JS file. Content must be a single expression that evaluates
    to a class extending Phaser.Scene (or a plain object with preload/create)."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"scene file not found: {path}")
    return p.read_text(encoding="utf-8")


def _hook_page_errors(page, errors: list[dict[str, Any]]) -> None:
    page.on(
        "pageerror",
        lambda e: errors.append({"type": "pageerror", "message": str(e)}),
    )
    page.on(
        "requestfailed",
        lambda r: errors.append(
            {
                "type": "requestfailed",
                "url": r.url,
                "failure": r.failure,
            }
        ),
    )

    def _on_console(msg):
        if msg.type in ("error", "warning"):
            try:
                errors.append({"type": f"console.{msg.type}", "message": msg.text})
            except Exception:
                pass

    page.on("console", _on_console)


def _goto_scaffold(page) -> None:
    page.goto(f"file://{SCAFFOLD}")
    page.wait_for_function("window.__ready === true", timeout=DEFAULT_READY_TIMEOUT_MS)


def _run_scene(page, scene_code: str, config: dict[str, Any], timeout_ms: int) -> None:
    page.evaluate(
        "({code, config}) => window.__runScene(code, config)",
        {"code": scene_code, "config": config},
    )
    page.wait_for_function("window.__sceneReady === true", timeout=timeout_ms)


def _collect_page_errors(page) -> list[Any]:
    return page.evaluate("window.__errors || []")


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_snapshot(page, args) -> dict[str, Any]:
    scene_code = _read_scene(args.scene)
    config = {
        "width": args.width,
        "height": args.height,
        "physicsDebug": args.physics_debug,
    }
    _run_scene(page, scene_code, config, DEFAULT_SCENE_TIMEOUT_MS)
    if args.wait_ms > 0:
        page.wait_for_timeout(args.wait_ms)
    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(out_path), full_page=False)
    meta = page.evaluate(
        """() => ({
          width: window.__game && window.__game.scale ? window.__game.scale.width : null,
          height: window.__game && window.__game.scale ? window.__game.scale.height : null,
          renderer: window.__game && window.__game.renderer ? window.__game.renderer.type : null,
          children: window.__activeScene ? window.__activeScene.children.length : 0,
        })"""
    )
    return {
        "screenshot": str(out_path),
        "meta": meta,
        "page_errors": _collect_page_errors(page),
    }


def cmd_probe(page, args) -> dict[str, Any]:
    scene_code = _read_scene(args.scene)
    config = {"width": args.width, "height": args.height}
    _run_scene(page, scene_code, config, DEFAULT_SCENE_TIMEOUT_MS)
    if args.wait_ms > 0:
        page.wait_for_timeout(args.wait_ms)
    results = {}
    for expr in args.expr:
        value = page.evaluate("(e) => window.__probe(e)", expr)
        results[expr] = value
    return {
        "values": results,
        "page_errors": _collect_page_errors(page),
    }


def cmd_watch(page, args) -> dict[str, Any]:
    scene_code = _read_scene(args.scene)
    config = {"width": args.width, "height": args.height}
    _run_scene(page, scene_code, config, DEFAULT_SCENE_TIMEOUT_MS)

    # Break comma-separated samples into a list, trimming whitespace.
    sample_exprs = [s.strip() for s in args.sample.split(",") if s.strip()] if args.sample else []

    frames: list[dict[str, Any]] = []
    start = time.monotonic()
    deadline = start + (args.duration / 1000.0)
    interval = max(args.interval, 8) / 1000.0  # floor 8ms ≈ 120fps
    while True:
        now = time.monotonic()
        if now >= deadline:
            break
        t_ms = int((now - start) * 1000)
        if sample_exprs:
            values = page.evaluate("(es) => window.__collectSample(es)", sample_exprs)
        else:
            values = {}
        frames.append({"t": t_ms, "values": values})
        # Sleep until next tick or deadline, whichever comes first.
        next_tick = now + interval
        sleep_for = min(next_tick, deadline) - time.monotonic()
        if sleep_for > 0:
            time.sleep(sleep_for)
    return {
        "frames": frames,
        "frame_count": len(frames),
        "duration_ms": args.duration,
        "page_errors": _collect_page_errors(page),
    }


def cmd_load_check(page, args) -> dict[str, Any]:
    config_path = Path(args.config)
    if not config_path.exists():
        raise FileNotFoundError(f"assets config not found: {args.config}")
    assets = json.loads(config_path.read_text(encoding="utf-8"))
    if not isinstance(assets, list):
        raise ValueError("assets config must be a JSON array of asset descriptors")

    # Build a Scene class that calls this.load.<type>(key, url, ...) for each entry.
    # We serialize the assets array into the JS source.
    scene_code = (
        "class extends Phaser.Scene {"
        "  constructor() { super('load_check'); this.__loadReport = []; }"
        "  preload() {"
        f"    const assets = {json.dumps(assets)};"
        "    const report = this.__loadReport;"
        "    this.load.on('loaderror', (file) => {"
        "      report.push({ key: file.key, type: file.type, ok: false, error: 'loaderror: ' + (file.src || '') });"
        "    });"
        "    this.load.on('filecomplete', (key, type) => {"
        "      report.push({ key: key, type: type, ok: true });"
        "    });"
        "    for (const a of assets) {"
        "      try {"
        "        if (typeof this.load[a.type] !== 'function') {"
        "          report.push({ key: a.key, type: a.type, ok: false, error: 'unsupported type' });"
        "          continue;"
        "        }"
        "        const args = a.args || [a.key, a.url].concat(a.extra || []);"
        "        this.load[a.type].apply(this.load, args);"
        "      } catch (e) {"
        "        report.push({ key: a.key, type: a.type, ok: false, error: e.message });"
        "      }"
        "    }"
        "  }"
        "  create() { window.__loadReport = this.__loadReport; }"
        "}"
    )
    _run_scene(page, scene_code, {"width": 16, "height": 16}, DEFAULT_SCENE_TIMEOUT_MS)
    page.wait_for_timeout(200)  # let filecomplete listeners settle

    report = page.evaluate("window.__loadReport || []")
    dump = page.evaluate("window.__dumpLoaded ? window.__dumpLoaded() : null")
    # Merge metadata (texture dimensions etc) into the report entries.
    tex_by_key = {t["key"]: t for t in (dump.get("textures") or []) if dump}
    audio_by_key = {a["key"]: a for a in (dump.get("audio") or []) if dump}
    for entry in report:
        k = entry.get("key")
        if k in tex_by_key:
            entry["metadata"] = tex_by_key[k]
        elif k in audio_by_key:
            entry["metadata"] = audio_by_key[k]

    return {
        "report": report,
        "loaded": dump,
        "page_errors": _collect_page_errors(page),
    }


_SELF_TEST_SCENE = """\
class extends Phaser.Scene {
  create() { this.add.rectangle(400, 300, 100, 100, 0xff0000); }
}
"""

_NETWORK_ERROR_MARKERS = ("net::", "ERR_NAME", "ERR_CONNECTION", "ERR_TIMED_OUT")


def _classify_error(exc: Exception) -> str:
    """Return 'network' or 'runtime' based on exception content."""
    msg = str(exc)
    if any(m in msg for m in _NETWORK_ERROR_MARKERS):
        return "network"
    return "runtime"


def cmd_self_test(page, args) -> dict[str, Any]:
    """Validate the full runtime chain: scaffold → Phaser → scene → snap → probe → watch."""
    tests: dict[str, dict[str, Any]] = {}

    # Decide temp directory: user-provided (persistent) or auto-cleanup.
    use_tmp_ctx = args.out_dir is None
    tmp_ctx = tempfile.TemporaryDirectory(prefix="phaser-self-test-") if use_tmp_ctx else None
    tmp_dir = Path(tmp_ctx.name) if tmp_ctx else Path(args.out_dir)
    tmp_dir.mkdir(parents=True, exist_ok=True)

    try:
        # -- 1. scaffold + Phaser version ------------------------------------
        try:
            ver = page.evaluate("typeof Phaser !== 'undefined' ? Phaser.VERSION : null")
            tests["scaffold_phaser"] = {"ok": ver is not None, "version": ver}
        except Exception as exc:
            tests["scaffold_phaser"] = {"ok": False, "error": str(exc), "error_type": _classify_error(exc)}

        # -- 2. run_scene ----------------------------------------------------
        scene_path = tmp_dir / "self_test_scene.js"
        scene_path.write_text(_SELF_TEST_SCENE, encoding="utf-8")
        try:
            scene_code = scene_path.read_text(encoding="utf-8")
            _run_scene(page, scene_code, {"width": 800, "height": 600}, DEFAULT_SCENE_TIMEOUT_MS)
            ready = page.evaluate("window.__sceneReady === true")
            tests["run_scene"] = {"ok": bool(ready)}
        except Exception as exc:
            tests["run_scene"] = {"ok": False, "error": str(exc), "error_type": _classify_error(exc)}

        # -- 3. snapshot -----------------------------------------------------
        png_path = tmp_dir / "self_test.png"
        try:
            page.screenshot(path=str(png_path), full_page=False)
            children = page.evaluate(
                "window.__activeScene ? window.__activeScene.children.length : 0"
            )
            size_bytes = png_path.stat().st_size if png_path.exists() else 0
            tests["snapshot"] = {
                "ok": size_bytes > 0 and children > 0,
                "size_bytes": size_bytes,
                "children": children,
            }
        except Exception as exc:
            tests["snapshot"] = {"ok": False, "error": str(exc), "error_type": _classify_error(exc)}

        # -- 4. probe --------------------------------------------------------
        try:
            value = page.evaluate("window.__probe('scene.children.list.length')")
            tests["probe"] = {"ok": isinstance(value, (int, float)) and value > 0, "value": value}
        except Exception as exc:
            tests["probe"] = {"ok": False, "error": str(exc), "error_type": _classify_error(exc)}

        # -- 5. watch (100ms sample) -----------------------------------------
        try:
            samples: list[Any] = []
            start = time.monotonic()
            deadline = start + 0.1
            while time.monotonic() < deadline:
                val = page.evaluate(
                    "(es) => window.__collectSample(es)",
                    ["scene.children.list.length"],
                )
                samples.append(val)
                time.sleep(0.016)
            tests["watch"] = {"ok": len(samples) > 0, "frame_count": len(samples)}
        except Exception as exc:
            tests["watch"] = {"ok": False, "error": str(exc), "error_type": _classify_error(exc)}

    finally:
        if tmp_ctx:
            tmp_ctx.cleanup()

    return {
        "tests": tests,
        "all_passed": all(t["ok"] for t in tests.values()),
    }


DISPATCH = {
    "snapshot": cmd_snapshot,
    "probe": cmd_probe,
    "watch": cmd_watch,
    "load-check": cmd_load_check,
    "self-test": cmd_self_test,
}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="phaser-runtime-runner",
        description="Playwright-backed Phaser runtime helper for the phaser-runtime-* skills.",
    )
    sub = parser.add_subparsers(dest="action", required=True)

    # common flags factory
    def add_common(p):
        p.add_argument("--scene", required=True, help="Path to a JS file containing a Scene class expression")
        p.add_argument("--width", type=int, default=800)
        p.add_argument("--height", type=int, default=600)
        p.add_argument("--wait-ms", type=int, default=0, help="Extra wait after scene ready")

    ps = sub.add_parser("snapshot", help="Run a Scene and capture a PNG")
    add_common(ps)
    ps.add_argument("--out", required=True, help="Output PNG path")
    ps.add_argument("--physics-debug", action="store_true", help="Enable Arcade physics debug overlay")

    pp = sub.add_parser("probe", help="Run a Scene and evaluate expressions")
    add_common(pp)
    pp.add_argument(
        "--expr",
        action="append",
        required=True,
        help="Expression to evaluate against the active scene; may be repeated",
    )

    pw = sub.add_parser("watch", help="Sample expressions every frame for N ms")
    add_common(pw)
    pw.add_argument("--duration", type=int, default=500, help="Sample duration in ms")
    pw.add_argument("--interval", type=int, default=16, help="Sample interval in ms (floor 8)")
    pw.add_argument(
        "--sample",
        default="",
        help="Comma-separated expressions to sample each tick (use scene.xxx)",
    )

    pl = sub.add_parser("load-check", help="Run only preload() and report every asset")
    pl.add_argument("--config", required=True, help="Path to a JSON array of asset descriptors")
    pl.add_argument("--width", type=int, default=16)
    pl.add_argument("--height", type=int, default=16)
    pl.add_argument("--wait-ms", type=int, default=0)

    pst = sub.add_parser("self-test", help="Validate the full runtime skill chain")
    pst.add_argument(
        "--out-dir", default=None,
        help="Directory for test artifacts (default: auto-cleanup temp dir)",
    )

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    errors: list[Any] = []
    result: Any = None
    ok = True

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                context = browser.new_context()
                page = context.new_page()
                _hook_page_errors(page, errors)
                _goto_scaffold(page)
                result = DISPATCH[args.action](page, args)
            finally:
                browser.close()
    except FileNotFoundError as e:
        ok = False
        errors.append({"type": "python", "message": str(e)})
    except PWError as e:
        ok = False
        msg = str(e)
        entry = {"type": "playwright", "message": msg}
        # Heuristic: suggest running setup skill on typical environment failures.
        env_markers = (
            "Executable doesn't exist",
            "Host system is missing dependencies",
            "BrowserType.launch",
            "libnss3",
            "browserType.launch",
        )
        if any(m in msg for m in env_markers):
            entry["hint"] = SETUP_HINT
        errors.append(entry)
    except Exception as e:  # noqa: BLE001
        ok = False
        errors.append({"type": "python", "message": f"{type(e).__name__}: {e}"})

    print(json.dumps({"ok": ok, "action": args.action, "result": result, "errors": errors}, default=str))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

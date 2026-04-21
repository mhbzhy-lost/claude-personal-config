"""Tests for OllamaLifecycleManager using a mock daemon binary.

The mock "ollama" binary is a tiny Python HTTP server that listens on
$OLLAMA_HOST and responds 200 with {"models": []} on /api/tags. This
lets us exercise acquire/release/refcount logic without any real ollama.

Every test uses tmp_path for runtime_dir so there is zero risk of
touching the shared daemon the main session relies on.
"""

from __future__ import annotations

import os
import socket
import stat
import sys
import textwrap
import time
from pathlib import Path

import pytest

from skill_catalog.lifecycle import (
    OllamaConfig,
    OllamaLifecycleManager,
    OllamaStartupError,
    _pid_alive,
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_port_free(port: int, timeout: float = 3.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
                return
            except OSError:
                time.sleep(0.1)


MOCK_OK_BINARY = textwrap.dedent(
    """\
    #!/usr/bin/env python3
    import os, sys
    from http.server import BaseHTTPRequestHandler, HTTPServer

    host_env = os.environ.get("OLLAMA_HOST", "127.0.0.1:11435")
    host, port = host_env.split(":")
    port = int(port)

    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/api/tags":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"models": []}')
            else:
                self.send_response(404); self.end_headers()
        def log_message(self, *a, **k): pass

    srv = HTTPServer((host, port), H)
    srv.serve_forever()
    """
)

# Binary that does not bind the port — used to trigger timeout
MOCK_HANG_BINARY = textwrap.dedent(
    """\
    #!/usr/bin/env python3
    import time
    while True:
        time.sleep(60)
    """
)


def _write_bin(path: Path, body: str) -> Path:
    path.write_text(f"#!{sys.executable}\n" + body.split("\n", 1)[1])
    path.chmod(path.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return path


@pytest.fixture
def mock_bin_ok(tmp_path: Path) -> Path:
    return _write_bin(tmp_path / "mock_ollama_ok", MOCK_OK_BINARY)


@pytest.fixture
def mock_bin_hang(tmp_path: Path) -> Path:
    return _write_bin(tmp_path / "mock_ollama_hang", MOCK_HANG_BINARY)


def _make_config(
    tmp_path: Path,
    binary: Path,
    port: int,
    *,
    startup_timeout: int = 5,
) -> OllamaConfig:
    return OllamaConfig(
        binary_path=binary,
        models_dir=tmp_path / "models",
        runtime_dir=tmp_path / "runtime",
        port=port,
        startup_timeout_s=startup_timeout,
        shutdown_timeout_s=2,
    )


# ---------------------------------------------------------------------------
# tests
# ---------------------------------------------------------------------------


def test_acquire_starts_daemon_and_registers_client(tmp_path, mock_bin_ok):
    port = _free_port()
    cfg = _make_config(tmp_path, mock_bin_ok, port)
    mgr = OllamaLifecycleManager(cfg)
    try:
        mgr.acquire()
        assert mgr.daemon_running() is True
        assert cfg.pid_file.exists()
        assert (cfg.clients_dir / str(os.getpid())).exists()
        assert mgr.active_client_count() == 1
    finally:
        mgr.release()
    _wait_port_free(port)


def test_acquire_is_idempotent_and_reuses_daemon(tmp_path, mock_bin_ok):
    port = _free_port()
    cfg = _make_config(tmp_path, mock_bin_ok, port)
    mgr = OllamaLifecycleManager(cfg)
    try:
        mgr.acquire()
        pid1 = int(cfg.pid_file.read_text())
        mgr.acquire()  # second call — should be no-op
        pid2 = int(cfg.pid_file.read_text())
        assert pid1 == pid2
        assert mgr.active_client_count() == 1
    finally:
        mgr.release()
    _wait_port_free(port)


def test_release_keeps_daemon_when_other_clients_alive(tmp_path, mock_bin_ok):
    """Simulate a second live client via a marker file for a real pid."""
    port = _free_port()
    cfg = _make_config(tmp_path, mock_bin_ok, port)
    mgr = OllamaLifecycleManager(cfg)
    mgr.acquire()
    try:
        # simulate second client: use parent pid (guaranteed alive)
        other_pid = os.getppid()
        assert _pid_alive(other_pid)
        cfg.clients_dir.mkdir(parents=True, exist_ok=True)
        (cfg.clients_dir / str(other_pid)).touch()

        pid_before = int(cfg.pid_file.read_text())
        mgr.release()  # our marker gone, but other_pid still registered

        # daemon should still be up
        assert mgr.daemon_running() is True
        assert cfg.pid_file.exists()
        assert int(cfg.pid_file.read_text()) == pid_before
        assert (cfg.clients_dir / str(other_pid)).exists()
    finally:
        # force-clean: remove sentinel, then release again to shut daemon
        try:
            (cfg.clients_dir / str(os.getppid())).unlink()
        except FileNotFoundError:
            pass
        # recreate our own marker so release() path shuts daemon cleanly
        (cfg.clients_dir / str(os.getpid())).touch()
        mgr.release()
    _wait_port_free(port)


def test_release_shuts_daemon_when_last_client(tmp_path, mock_bin_ok):
    port = _free_port()
    cfg = _make_config(tmp_path, mock_bin_ok, port)
    mgr = OllamaLifecycleManager(cfg)
    mgr.acquire()
    pid = int(cfg.pid_file.read_text())
    mgr.release()

    assert not cfg.pid_file.exists()
    # process should be gone within shutdown timeout
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline and _pid_alive(pid):
        time.sleep(0.1)
    assert not _pid_alive(pid)
    assert mgr.daemon_running() is False
    _wait_port_free(port)


def test_stale_client_marker_is_reaped(tmp_path, mock_bin_ok):
    port = _free_port()
    cfg = _make_config(tmp_path, mock_bin_ok, port)
    # pre-seed a stale marker for a pid that cannot exist
    cfg.clients_dir.mkdir(parents=True, exist_ok=True)
    stale = cfg.clients_dir / "99999999"
    stale.touch()

    mgr = OllamaLifecycleManager(cfg)
    try:
        mgr.acquire()
        assert not stale.exists(), "stale marker must be reaped"
        assert mgr.active_client_count() == 1
    finally:
        mgr.release()
    _wait_port_free(port)


def test_startup_timeout_raises(tmp_path, mock_bin_hang):
    port = _free_port()
    cfg = _make_config(tmp_path, mock_bin_hang, port, startup_timeout=2)
    mgr = OllamaLifecycleManager(cfg)
    with pytest.raises(OllamaStartupError):
        mgr.acquire()
    # cleanup any lingering marker / process
    try:
        mgr.release()
    except Exception:
        pass
    _wait_port_free(port)


def test_missing_binary_raises(tmp_path):
    port = _free_port()
    cfg = _make_config(tmp_path, tmp_path / "does-not-exist", port)
    mgr = OllamaLifecycleManager(cfg)
    with pytest.raises(OllamaStartupError):
        mgr.acquire()

"""Cross-process reference-counted lifecycle manager for the ollama daemon.

Each MCP server instance calls :meth:`OllamaLifecycleManager.acquire` on
startup and :meth:`OllamaLifecycleManager.release` on shutdown. The manager
ensures exactly one ollama daemon is running while at least one client is
alive, and shuts it down once the last client releases.

Coordination uses a shared runtime directory:

    <runtime_dir>/
        ollama.pid          # daemon pid (written by whoever starts it)
        ollama.log          # daemon stdout/stderr
        ollama.lock         # global filelock guarding acquire/release
        clients/<pid>       # empty marker file per live MCP server
"""

from __future__ import annotations

import http.client
import os
import signal
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from filelock import FileLock


class OllamaStartupError(Exception):
    """Raised when the ollama daemon fails to start or become ready."""


@dataclass
class OllamaConfig:
    binary_path: Path
    models_dir: Path
    runtime_dir: Path
    host: str = "127.0.0.1"
    port: int = 11435
    keep_alive: str = "24h"
    startup_timeout_s: int = 15
    shutdown_timeout_s: int = 5

    @property
    def host_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    @property
    def pid_file(self) -> Path:
        return self.runtime_dir / "ollama.pid"

    @property
    def log_file(self) -> Path:
        return self.runtime_dir / "ollama.log"

    @property
    def lock_file(self) -> Path:
        return self.runtime_dir / "ollama.lock"

    @property
    def clients_dir(self) -> Path:
        return self.runtime_dir / "clients"


def _pid_alive(pid: int) -> bool:
    """Return True if *pid* refers to a live process on this host."""
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        # process exists but we lack permissions to signal it
        return True
    except OSError:
        return False
    return True


class OllamaLifecycleManager:
    def __init__(self, config: OllamaConfig) -> None:
        self.config = config
        self._lock = FileLock(str(config.lock_file), timeout=30)
        self._self_pid = os.getpid()

    # ----- public API ---------------------------------------------------

    @property
    def host_url(self) -> str:
        return self.config.host_url

    def daemon_running(self) -> bool:
        """HTTP-probe the daemon's /api/tags endpoint (1s timeout)."""
        conn = http.client.HTTPConnection(
            self.config.host, self.config.port, timeout=1.0
        )
        try:
            conn.request("GET", "/api/tags")
            resp = conn.getresponse()
            resp.read()
            return 200 <= resp.status < 300
        except (
            ConnectionRefusedError,
            socket.timeout,
            TimeoutError,
            OSError,
            http.client.HTTPException,
        ):
            return False
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def active_client_count(self) -> int:
        self._ensure_dirs()
        self._reap_stale_clients()
        return sum(1 for _ in self.config.clients_dir.iterdir())

    def acquire(self) -> None:
        self._ensure_dirs()
        with self._lock:
            self._reap_stale_clients()
            my_marker = self.config.clients_dir / str(self._self_pid)
            my_marker.touch(exist_ok=True)

            if self.daemon_running():
                return

            self._start_daemon_locked()

    def release(self) -> None:
        self._ensure_dirs()
        with self._lock:
            my_marker = self.config.clients_dir / str(self._self_pid)
            try:
                my_marker.unlink()
            except FileNotFoundError:
                pass

            self._reap_stale_clients()

            remaining = list(self.config.clients_dir.iterdir())
            if remaining:
                return

            self._stop_daemon_locked()

    # ----- internals ----------------------------------------------------

    def _ensure_dirs(self) -> None:
        self.config.runtime_dir.mkdir(parents=True, exist_ok=True)
        self.config.clients_dir.mkdir(parents=True, exist_ok=True)

    def _reap_stale_clients(self) -> None:
        for child in self.config.clients_dir.iterdir():
            try:
                pid = int(child.name)
            except ValueError:
                # not a pid-named file; remove defensively
                try:
                    child.unlink()
                except FileNotFoundError:
                    pass
                continue
            if not _pid_alive(pid):
                try:
                    child.unlink()
                except FileNotFoundError:
                    pass

    def _start_daemon_locked(self) -> None:
        env = os.environ.copy()
        env["OLLAMA_HOST"] = f"{self.config.host}:{self.config.port}"
        env["OLLAMA_MODELS"] = str(self.config.models_dir)
        env["OLLAMA_KEEP_ALIVE"] = self.config.keep_alive

        self.config.models_dir.mkdir(parents=True, exist_ok=True)

        log_fh = open(self.config.log_file, "ab")
        try:
            proc = subprocess.Popen(
                [str(self.config.binary_path), "serve"],
                stdout=log_fh,
                stderr=log_fh,
                stdin=subprocess.DEVNULL,
                env=env,
                start_new_session=True,
                close_fds=True,
            )
        except FileNotFoundError as e:
            log_fh.close()
            raise OllamaStartupError(
                f"ollama binary not found: {self.config.binary_path}"
            ) from e
        finally:
            # parent does not need the fd once Popen dup'd it
            try:
                log_fh.close()
            except Exception:
                pass

        self.config.pid_file.write_text(str(proc.pid))

        deadline = time.monotonic() + self.config.startup_timeout_s
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                raise OllamaStartupError(
                    f"ollama daemon exited with code {proc.returncode} during startup; "
                    f"see {self.config.log_file}"
                )
            if self.daemon_running():
                return
            time.sleep(0.5)

        # timeout: best-effort kill so we don't leak
        try:
            os.kill(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        raise OllamaStartupError(
            f"ollama daemon did not become ready within "
            f"{self.config.startup_timeout_s}s (host={self.host_url})"
        )

    @staticmethod
    def _try_reap(pid: int) -> None:
        """Non-blocking waitpid; silently ignores if pid is not our child."""
        try:
            os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            pass
        except OSError:
            pass

    def _stop_daemon_locked(self) -> None:
        pid_file = self.config.pid_file
        if not pid_file.exists():
            return
        try:
            pid = int(pid_file.read_text().strip())
        except (ValueError, OSError):
            try:
                pid_file.unlink()
            except FileNotFoundError:
                pass
            return

        if _pid_alive(pid):
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass

            deadline = time.monotonic() + self.config.shutdown_timeout_s
            while time.monotonic() < deadline:
                self._try_reap(pid)
                if not _pid_alive(pid):
                    break
                time.sleep(0.2)

            if _pid_alive(pid):
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                # give the kernel a moment then reap if it was our child
                for _ in range(10):
                    self._try_reap(pid)
                    if not _pid_alive(pid):
                        break
                    time.sleep(0.1)

        try:
            pid_file.unlink()
        except FileNotFoundError:
            pass


__all__ = [
    "OllamaConfig",
    "OllamaLifecycleManager",
    "OllamaStartupError",
]

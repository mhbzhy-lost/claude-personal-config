"""Block instantiation: copy component/ tree into a destination project."""

from __future__ import annotations

import shutil
from pathlib import Path

# These names are never copied — they're build/test/CI artifacts that leak in
# even when authors forget to gitignore them.
EXCLUDED_NAMES = {
    "node_modules",
    "__pycache__",
    ".venv",
    ".pytest_cache",
    ".ruff_cache",
    ".mypy_cache",
    "dist",
    ".DS_Store",
}


def _filter(_dir: str, names: list[str]) -> list[str]:
    return [n for n in names if n in EXCLUDED_NAMES or n.endswith(".tsbuildinfo")]


def copy_block(src_component: Path, dest: Path, overwrite: bool = False) -> dict:
    """Copy component/ tree to dest. Returns a report of what was written."""
    if not src_component.is_dir():
        raise FileNotFoundError(f"component/ not found: {src_component}")
    if dest.exists() and not overwrite:
        raise FileExistsError(
            f"destination already exists: {dest} (pass overwrite=True to replace)"
        )
    if dest.exists():
        shutil.rmtree(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src_component, dest, ignore=_filter, symlinks=False)

    # Tally
    files = sum(1 for _ in dest.rglob("*") if _.is_file())
    size = sum(p.stat().st_size for p in dest.rglob("*") if p.is_file())
    return {
        "dest": str(dest),
        "files_written": files,
        "bytes_written": size,
    }

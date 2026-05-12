"""block-catalog MCP server entry point."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from .catalog import BlockCatalog
from .copier import copy_block


def _load_catalog() -> BlockCatalog:
    blocks_path = os.environ.get("BLOCK_LIBRARY_PATH")
    if not blocks_path:
        print(
            "[block-catalog] FATAL: BLOCK_LIBRARY_PATH env var is required "
            "(point at <repo>/blocks)",
            file=sys.stderr,
        )
        sys.exit(2)
    catalog = BlockCatalog(Path(blocks_path))
    catalog.reindex()
    print(
        f"[block-catalog] indexed {len(catalog.by_slug)} blocks from {blocks_path}",
        file=sys.stderr,
    )
    return catalog


catalog = _load_catalog()
mcp = FastMCP("block-catalog")


@mcp.tool()
def list_blocks(
    kind: str | None = None,
    capability: list[str] | None = None,
    tech_stack: list[str] | None = None,
) -> dict:
    """List all indexed blocks, optionally filtered by kind / capability / tech_stack.

    Each returned summary has: slug, title, title_en, description, kind,
    capabilities, tech_stack. Use this when you want a directory of available
    blocks; call ``get_block(slug)`` afterwards for full metadata + paths.

    Args:
        kind: ``"business-pattern"`` or ``"ui-chrome"``. Omit to include both.
        capability: Intersect filter on the block's `capabilities` tag list
            (e.g. ``["realtime", "websocket"]``). Block must have at least one.
        tech_stack: Intersect filter on the block's `tech_stack` (e.g. ``["fastapi"]``).
            Block must have at least one match.

    Returns:
        {"blocks": [<summary>, ...]} sorted by slug.
    """
    return {"blocks": catalog.list_summaries(kind=kind, capability=capability, tech_stack=tech_stack)}


@mcp.tool()
def get_block(slug: str) -> dict | None:
    """Fetch full metadata for one block by slug.

    Returns the raw `block.json` plus absolute paths the caller can pass to
    Read tool (consumer_readme_abs is the most useful entry point) or to
    `copy_block` (copyable_root_abs).

    Args:
        slug: e.g. ``"im-chat-detail"``.

    Returns:
        {"slug", "root", "copyable_root_abs", "consumer_readme_abs", "block_json": {...}}
        or None if slug is unknown.
    """
    return catalog.get(slug)


@mcp.tool()
def search_blocks(
    intent: str,
    kind: str | None = None,
    capability: list[str] | None = None,
    tech_stack: list[str] | None = None,
    top_k: int = 5,
) -> dict:
    """Search blocks by free-text intent + tag filters.

    Ranking is pure keyword frequency with a boost when tokens appear in
    slug/title. No LLM / embedding model—index is small (~10 blocks) and
    deterministic ranking is enough.

    Args:
        intent: The user's request in Chinese/English (e.g. "做一个聊天页 双人 实时").
        kind, capability, tech_stack: Same as list_blocks (pre-filter before scoring).
        top_k: Cut top-K (default 5).

    Returns:
        {"matches": [<summary>, ...]} ordered by descending relevance.
    """
    return {"matches": catalog.search(intent, kind=kind, capability=capability, tech_stack=tech_stack, top_k=top_k)}


@mcp.tool()
def copy_block_to(slug: str, dest_path: str, overwrite: bool = False) -> dict:
    """Copy a block's `component/` tree to a target project path.

    This is the primary "instantiate as SDK" workflow:
    1. Pick a block via list_blocks / search_blocks / get_block
    2. Call copy_block_to(slug, "/path/to/your-project/sdk/<slug>")
    3. The agent then only needs to read component/README.md to consume the API

    Build artifacts (node_modules, dist, __pycache__, .venv, *.tsbuildinfo)
    are excluded automatically.

    Args:
        slug: Block slug.
        dest_path: Absolute or cwd-relative path where component/ contents
            should land. The leaf dir will be created.
        overwrite: If False (default) and dest exists, raises. If True, replaces.

    Returns:
        {"dest", "files_written", "bytes_written"}.
    """
    block = catalog.by_slug.get(slug)
    if not block:
        return {"error": f"unknown slug: {slug}"}
    src = block.copyable_root
    return copy_block(src, Path(dest_path).expanduser().resolve(), overwrite=overwrite)


@mcp.tool()
def reindex() -> dict:
    """Re-read all block.json files from disk. Useful after adding/editing blocks."""
    catalog.reindex()
    return {"indexed": len(catalog.by_slug), "slugs": sorted(catalog.by_slug.keys())}


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()

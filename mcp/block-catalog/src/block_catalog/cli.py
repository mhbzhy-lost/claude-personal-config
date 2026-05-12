"""block-catalog CLI for debugging without MCP harness."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .catalog import BlockCatalog
from .copier import copy_block


def main() -> int:
    p = argparse.ArgumentParser(prog="block-catalog")
    p.add_argument(
        "--blocks-path",
        default=os.environ.get("BLOCK_LIBRARY_PATH"),
        help="Path to blocks/ dir (or BLOCK_LIBRARY_PATH env var).",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="list all blocks")

    g = sub.add_parser("get", help="get one block's full metadata")
    g.add_argument("slug")

    s = sub.add_parser("search", help="search by intent + tags")
    s.add_argument("intent")
    s.add_argument("--kind")
    s.add_argument("--capability", nargs="*")
    s.add_argument("--tech-stack", nargs="*")
    s.add_argument("--top-k", type=int, default=5)

    c = sub.add_parser("copy", help="copy a block's component/ to dest")
    c.add_argument("slug")
    c.add_argument("dest")
    c.add_argument("--overwrite", action="store_true")

    args = p.parse_args()
    if not args.blocks_path:
        print("error: --blocks-path or BLOCK_LIBRARY_PATH required", file=sys.stderr)
        return 2

    catalog = BlockCatalog(Path(args.blocks_path))
    catalog.reindex()

    if args.cmd == "list":
        out = catalog.list_summaries()
    elif args.cmd == "get":
        out = catalog.get(args.slug) or {"error": f"unknown slug: {args.slug}"}
    elif args.cmd == "search":
        out = catalog.search(
            args.intent,
            kind=args.kind,
            capability=args.capability,
            tech_stack=args.tech_stack,
            top_k=args.top_k,
        )
    elif args.cmd == "copy":
        block = catalog.by_slug.get(args.slug)
        if not block:
            print(f"unknown slug: {args.slug}", file=sys.stderr)
            return 1
        out = copy_block(
            block.copyable_root, Path(args.dest).expanduser().resolve(), overwrite=args.overwrite
        )
    else:
        return 2

    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

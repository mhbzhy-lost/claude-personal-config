#!/usr/bin/env python3
"""
Scaffold a new business pattern block from .claude/skills/new-block/templates/.

The generated block has three top-level dirs:
    component/   <- SDK surface; agent copies this entire tree to target project
    dev/         <- maintainer tooling (Makefile / tests / docker-compose / codegen)
    examples/    <- local demo

Usage:
    ./.claude/skills/new-block/scripts/new-block.py \\
        --slug order-detail \\
        --env-prefix OD \\
        --pkg-ns od \\
        --backend-port 8082 \\
        --postgres-port 5546 \\
        --title-en "Order Detail" \\
        --title-cn "订单详情"

After scaffold, follow the printed "Next steps".
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

# Script lives at <repo>/.claude/skills/new-block/scripts/new-block.py.
# Templates live at <repo>/.claude/skills/new-block/templates/.
# Output goes to <repo>/blocks/<slug>/.
SKILL_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[4]
SHARED = SKILL_ROOT / "templates"
BLOCKS = REPO_ROOT / "blocks"

# Templates that map to special destinations / filenames in the new block.
#   - block-README.md  -> <block>/README.md  (maintainer-facing top-level)
#   - component-README.md  -> <block>/component/README.md  (consumer-facing)
#   - block.json.tmpl  -> <block>/block.json
SPECIAL_PATHS_FULL = {
    "block-README.md": "README.md",
    "component-README.md": "component/README.md",
    "block.json.tmpl": "block.json",
}
SPECIAL_PATHS_UI = {
    "block-README-ui.md": "README.md",
    "component-README-ui.md": "component/README.md",
    "block-ui.json.tmpl": "block.json",
}

# Templates that exist for one variant but should be SKIPPED for the other.
SKIP_WHEN_FULL = {
    "block-README-ui.md",
    "component-README-ui.md",
    "block-ui.json.tmpl",
}
SKIP_WHEN_UI = {
    "block-README.md",
    "component-README.md",
    "block.json.tmpl",
}

# When --no-backend, also skip the backend/protocol layers entirely.
BACKEND_ONLY_TOP_DIRS = {"component/backend", "component/protocol", "dev/backend", "dev/protocol"}

SKIP_PATHS_RE = re.compile(
    r"(^|/)(node_modules|\.venv|\.vite|__pycache__|dist|generated|\.pytest_cache|\.ruff_cache)(/|$)"
)


def slug_to_snake(slug: str) -> str:
    return slug.replace("-", "_")


def build_substitutions(args: argparse.Namespace) -> dict[str, str]:
    env_prefix = args.env_prefix or args.slug.split("-")[0].upper()
    pkg_ns = args.pkg_ns or env_prefix.lower()
    seed_cmd = args.seed_cmd or f"{pkg_ns}-seed"
    return {
        "{{SLUG}}": args.slug,
        "{{SLUG_SNAKE}}": slug_to_snake(args.slug),
        "{{ENV_PREFIX}}": env_prefix,
        "{{ENV_PREFIX_LOWER}}": env_prefix.lower(),
        "{{PKG_NS}}": pkg_ns,
        "{{BACKEND_PORT}}": str(args.backend_port or 0),
        "{{POSTGRES_PORT}}": str(args.postgres_port or 0),
        "{{TITLE_EN}}": args.title_en,
        "{{TITLE_CN}}": args.title_cn or args.title_en,
        "{{SEED_CMD}}": seed_cmd,
    }


def substitute(text: str, subs: dict[str, str]) -> str:
    for k, v in subs.items():
        text = text.replace(k, v)
    return text


TEXT_SUFFIXES = {
    ".py", ".toml", ".yaml", ".yml", ".json", ".md", ".ini",
    ".ts", ".tsx", ".js", ".css", ".html", ".sh", ".sql", ".mako", ".tmpl",
    "", ".example", ".gitignore", ".gitkeep", ".spectral",
}


def is_text(path: Path) -> bool:
    if path.suffix in TEXT_SUFFIXES:
        return True
    if path.name in {".gitignore", ".gitkeep", ".env.example", ".spectral.yaml"}:
        return True
    return False


def copy_tree(
    src_root: Path,
    dst_root: Path,
    subs: dict[str, str],
    dry_run: bool,
    no_backend: bool = False,
) -> int:
    """Walk src_root, copy with substitution to dst_root. Returns file count."""
    count = 0
    special_paths = SPECIAL_PATHS_UI if no_backend else SPECIAL_PATHS_FULL
    skip_set = SKIP_WHEN_UI if no_backend else SKIP_WHEN_FULL

    for src in sorted(src_root.rglob("*")):
        rel = src.relative_to(src_root).as_posix()
        if SKIP_PATHS_RE.search(rel):
            continue
        if src.is_dir():
            continue

        # Skip backend/protocol templates when --no-backend.
        if no_backend and any(rel.startswith(d + "/") for d in BACKEND_ONLY_TOP_DIRS):
            continue

        # The top-level templates/README.md documents the scaffold itself,
        # not a block deliverable; never copy it into a block.
        if rel == "README.md":
            continue

        # Skip the README/block.json variant we're NOT using.
        if rel in skip_set:
            continue

        # Special mapping at the file-name level (top-level only).
        dst_rel = special_paths.get(rel, rel)
        # Substitute placeholders in the path itself.
        dst_rel = substitute(dst_rel, subs)
        dst = dst_root / dst_rel
        if not dry_run:
            dst.parent.mkdir(parents=True, exist_ok=True)

        if is_text(src):
            content = src.read_text(encoding="utf-8")
            new_content = substitute(content, subs)
            if dry_run:
                print(f"  [dry-run] write {dst.relative_to(REPO_ROOT)}")
            else:
                dst.write_text(new_content, encoding="utf-8")
        else:
            if dry_run:
                print(f"  [dry-run] copy {dst.relative_to(REPO_ROOT)}")
            else:
                shutil.copy2(src, dst)
        count += 1
    return count


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="new-block",
        description=(
            "Scaffold a new block (component/ + dev/ + examples/) from "
            ".claude/skills/new-block/templates/."
        ),
    )
    parser.add_argument("--slug", required=True, help='Block slug, e.g. "order-detail"')
    parser.add_argument(
        "--no-backend",
        action="store_true",
        help="Frontend-only block (UI chrome). Skips protocol/ and backend/.",
    )
    parser.add_argument("--env-prefix", default=None, help='Env prefix (UPPERCASE)')
    parser.add_argument("--pkg-ns", default=None, help="NPM namespace, defaults to env-prefix lowercased")
    parser.add_argument("--backend-port", type=int, default=None)
    parser.add_argument("--postgres-port", type=int, default=None)
    parser.add_argument("--title-en", required=True)
    parser.add_argument("--title-cn", default=None, help="Defaults to title-en")
    parser.add_argument("--seed-cmd", default=None, help='Defaults to "<pkg-ns>-seed"')
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="Overwrite existing target dir")
    args = parser.parse_args(argv)

    if not re.match(r"^[a-z][a-z0-9-]*[a-z0-9]$", args.slug):
        print(f"error: slug must be lowercase-kebab-case, got {args.slug!r}", file=sys.stderr)
        return 2

    if args.no_backend:
        if args.env_prefix is None:
            args.env_prefix = ""
        if not args.pkg_ns:
            print("error: --pkg-ns is required when --no-backend", file=sys.stderr)
            return 2
    else:
        missing = []
        if not args.env_prefix:
            missing.append("--env-prefix")
        if args.backend_port is None:
            missing.append("--backend-port")
        if args.postgres_port is None:
            missing.append("--postgres-port")
        if missing:
            print(
                f"error: missing required args: {', '.join(missing)}\n"
                f"       (pass --no-backend for frontend-only UI block)",
                file=sys.stderr,
            )
            return 2
        if not re.match(r"^[A-Z][A-Z0-9]*$", args.env_prefix):
            print(f"error: env-prefix must be UPPERCASE, got {args.env_prefix!r}", file=sys.stderr)
            return 2
        if not (1024 <= args.backend_port <= 65535):
            print(f"error: backend-port out of range: {args.backend_port}", file=sys.stderr)
            return 2
        if not (1024 <= args.postgres_port <= 65535):
            print(f"error: postgres-port out of range: {args.postgres_port}", file=sys.stderr)
            return 2

    if not SHARED.exists():
        print(f"error: shared templates not found at {SHARED}", file=sys.stderr)
        return 2

    target = BLOCKS / args.slug
    if target.exists():
        if not args.force:
            print(
                f"error: target already exists: {target}\n"
                f"       (use --force to overwrite, or pick a different --slug)",
                file=sys.stderr,
            )
            return 2
        if not args.dry_run:
            shutil.rmtree(target)

    subs = build_substitutions(args)

    print(f"Scaffolding block {args.slug!r} from {SHARED.relative_to(REPO_ROOT)} ...")
    print(f"  target:  {target.relative_to(REPO_ROOT)}")
    print(f"  layout:  component/ + dev/ + examples/ + block.json + README.md")
    print()

    total = copy_tree(SHARED, target, subs, args.dry_run, no_backend=args.no_backend)
    print()
    if args.dry_run:
        print(f"[dry-run] would create {total} files")
    else:
        print(f"Created {total} files in {target.relative_to(REPO_ROOT)}/")
        print()
        print("Next steps (replace TODOs with your domain):")
        print(f"  1. Edit blocks/{args.slug}/block.json — fill capabilities + description")
        print(f"  2. Edit blocks/{args.slug}/component/README.md — consumer-facing API")
        print(f"  3. Edit blocks/{args.slug}/component/frontend/SKILL.md — agent usage")
        if not args.no_backend:
            print(f"  4. Define your domain in component/backend/app/{{models,schemas,services,api}}/")
            print(f"  5. Generate alembic migration:")
            print(f"     cd blocks/{args.slug}/component/backend && uv run alembic revision --autogenerate")
            print(f"  6. Edit component/protocol/openapi.yaml + cd ../../dev/protocol && pnpm gen")
            print()
            print(f"  7. cd blocks/{args.slug}/dev/backend && make install && make db-up && make migrate")
            print(f"  8. make dev    # uvicorn :{args.backend_port}")
            print(f"  9. cd ../../examples/basic && pnpm install && pnpm dev")
        else:
            print(f"  4. Build component/frontend/src/components/")
            print(f"  5. cd dev/frontend && pnpm install && pnpm build  # optional lib build")
            print(f"  6. cd ../../examples/basic && pnpm install && pnpm dev")

    return 0


if __name__ == "__main__":
    sys.exit(main())

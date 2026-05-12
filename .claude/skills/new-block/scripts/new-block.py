#!/usr/bin/env python3
"""
Scaffold a new business pattern block from .claude/skills/new-block/templates/.

Usage:
    ./.claude/skills/new-block/scripts/new-block.py \
        --slug order-detail \
        --env-prefix OD \
        --pkg-ns od \
        --backend-port 8082 \
        --postgres-port 5546 \
        --title-en "Order Detail" \
        --title-cn "订单详情"

After scaffold:
    cd blocks/order-detail/protocol && make install
    cd ../backend && make install
    cd ../frontend && pnpm install
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
SKILL_ROOT = Path(__file__).resolve().parents[1]   # .claude/skills/new-block/
REPO_ROOT = Path(__file__).resolve().parents[4]    # repo root
SHARED = SKILL_ROOT / "templates"
BLOCKS = REPO_ROOT / "blocks"

# Files in _shared/ that map to special destinations in the new block.
SPECIAL_PATHS = {
    "block-README.md": "README.md",
}

# Skip these paths entirely (cache / generated / module installs).
SKIP_PATHS_RE = re.compile(
    r"(^|/)(node_modules|\.venv|\.vite|__pycache__|dist|generated|\.pytest_cache|\.ruff_cache)(/|$)"
)


def slug_to_snake(slug: str) -> str:
    return slug.replace("-", "_")


def build_substitutions(args: argparse.Namespace) -> dict[str, str]:
    pkg_ns = args.pkg_ns or args.env_prefix.lower()
    seed_cmd = args.seed_cmd or f"{pkg_ns}-seed"
    return {
        "{{SLUG}}": args.slug,
        "{{SLUG_SNAKE}}": slug_to_snake(args.slug),
        "{{ENV_PREFIX}}": args.env_prefix,
        "{{ENV_PREFIX_LOWER}}": args.env_prefix.lower(),
        "{{PKG_NS}}": pkg_ns,
        "{{BACKEND_PORT}}": str(args.backend_port),
        "{{POSTGRES_PORT}}": str(args.postgres_port),
        "{{TITLE_EN}}": args.title_en,
        "{{TITLE_CN}}": args.title_cn or args.title_en,
        "{{SEED_CMD}}": seed_cmd,
    }


def substitute(text: str, subs: dict[str, str]) -> str:
    for k, v in subs.items():
        text = text.replace(k, v)
    return text


# File extensions we treat as text and substitute. Anything else copied raw.
TEXT_SUFFIXES = {
    ".py", ".toml", ".yaml", ".yml", ".json", ".md", ".ini",
    ".ts", ".tsx", ".css", ".html", ".sh", ".sql", ".mako", ".tmpl",
    "", ".example", ".gitignore", ".gitkeep", ".gitkeep.example",
    ".spectral",
}


def is_text(path: Path) -> bool:
    if path.suffix in TEXT_SUFFIXES:
        return True
    # Dotfiles: rely on name
    if path.name in {".gitignore", ".gitkeep", ".env.example", ".spectral.yaml"}:
        return True
    return False


def copy_tree(src_root: Path, dst_root: Path, subs: dict[str, str], dry_run: bool) -> int:
    """Walk src_root, copy with substitution to dst_root. Returns file count."""
    count = 0
    for src in sorted(src_root.rglob("*")):
        rel = src.relative_to(src_root).as_posix()
        if SKIP_PATHS_RE.search(rel):
            continue
        if src.is_dir():
            continue

        # Special mapping at the file-name level (top-level only).
        if rel in SPECIAL_PATHS:
            dst_rel = SPECIAL_PATHS[rel]
        else:
            dst_rel = rel
        # Substitute placeholders in the path itself (e.g. dir names).
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
        description="Scaffold a new business pattern block from .claude/skills/new-block/templates/.",
    )
    parser.add_argument("--slug", required=True, help='Block slug, e.g. "order-detail"')
    parser.add_argument("--env-prefix", required=True, help='Env prefix (uppercase), e.g. "OD"')
    parser.add_argument("--pkg-ns", default=None, help='NPM namespace, defaults to env-prefix lowercased')
    parser.add_argument("--backend-port", type=int, required=True)
    parser.add_argument("--postgres-port", type=int, required=True)
    parser.add_argument("--title-en", required=True, help='English title, e.g. "Order Detail"')
    parser.add_argument("--title-cn", default=None, help='Chinese title, defaults to title-en')
    parser.add_argument("--seed-cmd", default=None, help='CLI seed command name, defaults to "<pkg-ns>-seed"')
    parser.add_argument("--dry-run", action="store_true", help='Preview without writing')
    parser.add_argument("--force", action="store_true", help='Overwrite existing target dir (dangerous)')
    args = parser.parse_args(argv)

    # Validate
    if not re.match(r"^[a-z][a-z0-9-]*[a-z0-9]$", args.slug):
        print(f"error: slug must be lowercase-kebab-case, got {args.slug!r}", file=sys.stderr)
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
            print(f"error: target already exists: {target}\n"
                  f"       (use --force to overwrite, or pick a different --slug)",
                  file=sys.stderr)
            return 2
        if not args.dry_run:
            shutil.rmtree(target)

    subs = build_substitutions(args)

    print(f"Scaffolding block {args.slug!r} from {SHARED.relative_to(REPO_ROOT)} ...")
    print(f"  target:  {target.relative_to(REPO_ROOT)}")
    print(f"  subs:")
    for k, v in subs.items():
        print(f"    {k:25s} → {v}")
    print()

    total = 0
    total += copy_tree(SHARED, target, subs, args.dry_run)

    print()
    if args.dry_run:
        print(f"[dry-run] would create {total} files")
    else:
        print(f"Created {total} files in {target.relative_to(REPO_ROOT)}/")
        print()
        print("Next steps:")
        print(f"  cd {target.relative_to(REPO_ROOT)}")
        print(f"  cd protocol && make install && make lint     # validate scaffold")
        print(f"  cd ../backend && make install                # install Python deps")
        print(f"  # (start postgres on :{args.postgres_port} and run `make migrate`)")
        print(f"  make test                                    # run scaffold's 2 baseline tests")
        print(f"  make dev                                     # uvicorn :{args.backend_port}")
        print()
        print(f"  cd ../frontend && pnpm install && pnpm build # frontend lib build")
        print()
        print("Then fill in your domain (models / schemas / services / routes /")
        print("components / SKILL.md). See blocks/im-conversation-list/ or")
        print("blocks/commerce-product-list/ for reference patterns.")

    return 0


if __name__ == "__main__":
    sys.exit(main())

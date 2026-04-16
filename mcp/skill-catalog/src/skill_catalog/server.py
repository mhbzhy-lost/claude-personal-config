"""skill-catalog MCP server entry point."""

from __future__ import annotations

import os
import sys
import tomllib
from pathlib import Path
from typing import Optional

from mcp.server.fastmcp import FastMCP

from .scanner import SkillCatalog

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_DEFAULT_CONFIG = _PROJECT_ROOT / "catalog.toml"


def _load_config() -> dict:
    """Load catalog.toml from env var or default project-root location."""
    config_path = os.environ.get("SKILL_CATALOG_CONFIG", str(_DEFAULT_CONFIG))
    path = Path(config_path)
    if path.is_file():
        with open(path, "rb") as f:
            return tomllib.load(f)
    return {}


def _load_catalog() -> SkillCatalog:
    library_path = os.environ.get("SKILL_LIBRARY_PATH")
    if not library_path:
        print(
            "[skill-catalog] FATAL: SKILL_LIBRARY_PATH env var is required",
            file=sys.stderr,
        )
        sys.exit(2)

    config = _load_config()
    filter_cfg = config.get("filter", {})
    ts_mode = filter_cfg.get("tech_stack_match_mode", "intersection")
    lang_mode = filter_cfg.get("language_match_mode", "union")

    catalog = SkillCatalog(
        library_path,
        tech_stack_match_mode=ts_mode,
        language_match_mode=lang_mode,
    )
    print(
        f"[skill-catalog] indexed {len(catalog.by_name)} skills across "
        f"{len(catalog.by_tag)} tags from {library_path} "
        f"(tech_stack={catalog.tech_stack_match_mode}, "
        f"language={catalog.language_match_mode})",
        file=sys.stderr,
    )
    return catalog


mcp = FastMCP("skill-catalog")
catalog = _load_catalog()


@mcp.tool()
def list_skills(
    tech_stack: list[str] | None = None,
    language: list[str] | None = None,
) -> dict:
    """List skills filtered by tech stack and/or programming language.

    Args:
        tech_stack: Platform/framework tags (e.g. ["harmonyos"], ["django"]).
            When provided, only skills whose tech_stack intersects this list
            are returned.  Pass None or empty list to leave unconstrained.
        language: Programming language tags (e.g. ["python"], ["cpp"]).
            When provided, only skills whose language field intersects this
            list are returned; language-agnostic skills (no language field)
            are excluded.  Pass None or empty list to leave unconstrained.

    Both empty → returns nothing.
    Only one provided → the other dimension is unconstrained.
    Both provided → skills must match on both dimensions.

    Returns:
        {"skills": [{"name", "description", "tech_stack", "language"?}, ...]}
    """
    return catalog.list_skills(tech_stack, language=language)


@mcp.tool()
def get_skill(name: str) -> Optional[dict]:
    """Load a skill's full body by name.

    Frontmatter is stripped; relative markdown links inside the body are rewritten
    to absolute filesystem paths so the caller can Read referenced files directly.

    Args:
        name: The skill's `name` as returned by list_skills.

    Returns:
        {"content": "<markdown>"} or None if the skill is unknown.
    """
    return catalog.get_skill(name)


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()

"""skill-catalog MCP server entry point."""

from __future__ import annotations

import os
import sys
from typing import Optional

from mcp.server.fastmcp import FastMCP

from .scanner import SkillCatalog


def _load_catalog() -> SkillCatalog:
    library_path = os.environ.get("SKILL_LIBRARY_PATH")
    if not library_path:
        print(
            "[skill-catalog] FATAL: SKILL_LIBRARY_PATH env var is required",
            file=sys.stderr,
        )
        sys.exit(2)
    catalog = SkillCatalog(library_path)
    print(
        f"[skill-catalog] indexed {len(catalog.by_name)} skills across "
        f"{len(catalog.by_tag)} tags from {library_path}",
        file=sys.stderr,
    )
    return catalog


mcp = FastMCP("skill-catalog")
catalog = _load_catalog()


@mcp.tool()
def list_skills(tech_stack: list[str]) -> dict:
    """List skills matching one or more tech stack tags.

    Args:
        tech_stack: Tag names to filter by. Pass an empty list to get every skill
            that declares a `tech_stack` field. If any tag in the list is unknown,
            the full catalog is returned as a fallback (so the caller can still
            see what's available).

    Returns:
        {"skills": [{"name", "description", "tech_stack"}, ...]}
    """
    return catalog.list_skills(tech_stack)


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

"""Skill library scanner: indexes SKILL.md files by name and tech_stack tag."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import frontmatter


@dataclass
class SkillRecord:
    name: str
    description: str
    tech_stack: list[str]
    language: list[str]  # empty → language-agnostic
    path: Path  # absolute path to the SKILL.md file
    body: str   # markdown body (frontmatter stripped)


# Matches markdown links/images: ](...) capturing prefix, link target, suffix
_MD_LINK_RE = re.compile(r"(\]\()([^)\s]+)(\))")


def _rewrite_relative_links(body: str, skill_dir: Path) -> str:
    """Rewrite relative markdown link targets to absolute paths.

    Skips http(s), mailto, anchor (#...), and already-absolute (/...) targets.
    """

    def replace(match: re.Match[str]) -> str:
        prefix, link, suffix = match.group(1), match.group(2), match.group(3)
        if link.startswith(("http://", "https://", "mailto:", "#", "/")):
            return match.group(0)
        try:
            abs_path = (skill_dir / link).resolve()
        except (OSError, ValueError):
            return match.group(0)
        return f"{prefix}{abs_path}{suffix}"

    return _MD_LINK_RE.sub(replace, body)


class SkillCatalog:
    """In-memory index of all SKILL.md under a library root."""

    def __init__(self, library_path: str | Path) -> None:
        self.library = Path(library_path).resolve()
        self.by_name: dict[str, SkillRecord] = {}
        self.by_tag: dict[str, list[str]] = {}
        self._scan()

    def _scan(self) -> None:
        if not self.library.is_dir():
            return
        for skill_md in self.library.rglob("SKILL.md"):
            try:
                post = frontmatter.load(skill_md)
            except Exception:
                # Malformed YAML — skip silently, catalog stays functional.
                continue

            meta = post.metadata or {}
            name = meta.get("name")
            if not isinstance(name, str) or not name:
                continue

            description = meta.get("description", "")
            if not isinstance(description, str):
                description = str(description)

            tech_stack_raw = meta.get("tech_stack", [])
            if isinstance(tech_stack_raw, str):
                tech_stack = [tech_stack_raw]
            elif isinstance(tech_stack_raw, list):
                tech_stack = [str(t) for t in tech_stack_raw]
            else:
                tech_stack = []

            language_raw = meta.get("language", [])
            if isinstance(language_raw, str):
                language = [language_raw]
            elif isinstance(language_raw, list):
                language = [str(l) for l in language_raw]
            else:
                language = []

            record = SkillRecord(
                name=name,
                description=description,
                tech_stack=tech_stack,
                language=language,
                path=skill_md.resolve(),
                body=post.content,
            )
            # Last-write-wins if duplicate names appear; log would be nice but keep silent.
            self.by_name[name] = record
            for tag in tech_stack:
                self.by_tag.setdefault(tag, []).append(name)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def list_skills(
        self,
        tech_stack: list[str] | None = None,
        language: list[str] | None = None,
    ) -> dict:
        """Return skill metadata matching the query.

        Filtering rules:
        - Both empty/None → return nothing (empty list).
        - Only *tech_stack* provided → skills whose ``tech_stack`` intersects
          the query, regardless of language.
        - Only *language* provided → skills whose ``language`` intersects the
          query, regardless of tech_stack.  Language-agnostic skills (no
          ``language`` field) are **excluded**.
        - Both provided → skills must match on **both** dimensions.
          Language-agnostic skills are **excluded** when *language* is set.
        """
        has_ts = bool(tech_stack)
        has_lang = bool(language)

        if not has_ts and not has_lang:
            candidates = list(self.by_name.values())
            candidates.sort(key=lambda r: r.name)
            return {
                "skills": [
                    {
                        "name": r.name,
                        "description": r.description,
                        "tech_stack": r.tech_stack,
                        **({"language": r.language} if r.language else {}),
                    }
                    for r in candidates
                ]
            }

        candidates = list(self.by_name.values())

        if has_ts:
            ts_set = set(tech_stack)  # type: ignore[arg-type]
            candidates = [
                r for r in candidates
                if ts_set.intersection(r.tech_stack)
            ]

        if has_lang:
            lang_set = set(language)  # type: ignore[arg-type]
            candidates = [
                r for r in candidates
                if r.language and lang_set.intersection(r.language)
            ]

        candidates.sort(key=lambda r: r.name)
        return {
            "skills": [
                {
                    "name": r.name,
                    "description": r.description,
                    "tech_stack": r.tech_stack,
                    **({"language": r.language} if r.language else {}),
                }
                for r in candidates
            ]
        }

    def get_skill(self, name: str) -> Optional[dict]:
        """Return skill body (frontmatter stripped, relative links rewritten)."""
        record = self.by_name.get(name)
        if record is None:
            return None
        content = _rewrite_relative_links(record.body, record.path.parent)
        return {"content": content}

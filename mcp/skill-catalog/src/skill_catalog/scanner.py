"""Skill library scanner: indexes SKILL.md files by name and tech_stack tag."""

from __future__ import annotations

import json
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
    capability: list[str]  # empty → unclassified (pre-marker legacy)
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

    VALID_MATCH_MODES = ("intersection", "union")

    def __init__(
        self,
        library_path: str | Path,
        *,
        tech_stack_match_mode: str = "intersection",
        language_match_mode: str = "union",
        capability_match_mode: str = "union",
    ) -> None:
        for label, mode in [
            ("tech_stack_match_mode", tech_stack_match_mode),
            ("language_match_mode", language_match_mode),
            ("capability_match_mode", capability_match_mode),
        ]:
            if mode not in self.VALID_MATCH_MODES:
                raise ValueError(
                    f"{label} must be one of {self.VALID_MATCH_MODES}, got {mode!r}"
                )
        self.library = Path(library_path).resolve()
        self.tech_stack_match_mode = tech_stack_match_mode
        self.language_match_mode = language_match_mode
        self.capability_match_mode = capability_match_mode
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

            capability_raw = meta.get("capability", [])
            if isinstance(capability_raw, str):
                capability = [capability_raw]
            elif isinstance(capability_raw, list):
                capability = [str(c) for c in capability_raw]
            else:
                capability = []

            record = SkillRecord(
                name=name,
                description=description,
                tech_stack=tech_stack,
                language=language,
                capability=capability,
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
        capability: list[str] | None = None,
    ) -> dict:
        """Return skill metadata matching the query.

        Filtering rules:
        - All empty/None → return nothing (empty list).
        - *tech_stack* → skills whose ``tech_stack`` intersects/subsets the
          query (per ``tech_stack_match_mode``).
        - *language* → skills whose ``language`` field intersects/subsets the
          query. Language-agnostic skills (no ``language`` field) are
          **excluded** when *language* is set.
        - *capability* → skills whose ``capability`` field intersects/subsets
          the query (per ``capability_match_mode``, default ``union``).
          Skills without ``capability`` (legacy / pre-marker) are
          **excluded** when *capability* is set.
        - Multiple provided → must match on **all** provided dimensions.
        """
        has_ts = bool(tech_stack)
        has_lang = bool(language)
        has_cap = bool(capability)

        if not has_ts and not has_lang and not has_cap:
            candidates = list(self.by_name.values())
            candidates.sort(key=lambda r: r.name)
            return {"skills": [self._format(r) for r in candidates]}

        candidates = list(self.by_name.values())

        if has_ts:
            ts_set = set(tech_stack)  # type: ignore[arg-type]
            if self.tech_stack_match_mode == "intersection":
                candidates = [
                    r for r in candidates
                    if ts_set.issubset(r.tech_stack)
                ]
            else:
                candidates = [
                    r for r in candidates
                    if ts_set.intersection(r.tech_stack)
                ]

        if has_lang:
            lang_set = set(language)  # type: ignore[arg-type]
            if self.language_match_mode == "intersection":
                candidates = [
                    r for r in candidates
                    if r.language and lang_set.issubset(r.language)
                ]
            else:
                candidates = [
                    r for r in candidates
                    if r.language and lang_set.intersection(r.language)
                ]

        if has_cap:
            cap_set = set(capability)  # type: ignore[arg-type]
            if self.capability_match_mode == "intersection":
                candidates = [
                    r for r in candidates
                    if r.capability and cap_set.issubset(r.capability)
                ]
            else:
                candidates = [
                    r for r in candidates
                    if r.capability and cap_set.intersection(r.capability)
                ]

        candidates.sort(key=lambda r: r.name)
        return {"skills": [self._format(r) for r in candidates]}

    @staticmethod
    def _format(r: SkillRecord) -> dict:
        out: dict = {
            "name": r.name,
            "description": r.description,
            "tech_stack": r.tech_stack,
        }
        if r.language:
            out["language"] = r.language
        if r.capability:
            out["capability"] = r.capability
        return out

    def available_tags(self) -> dict[str, list[str]]:
        """Return the closed-set tag universe.

        Resolution order:

        1. Authoritative — read ``<library_path>/_tag_catalog.json`` if
           present. ``capability`` / ``tech_stack`` may be either a dict
           (``{key: description}``) or a plain list of keys; ``language``
           is a flat list. Description values are ignored here — the
           function returns sorted keys only.
        2. Fallback — aggregate the tag universe from indexed SKILL.md
           frontmatter (legacy "what's actually used" reflection).

        Consumed by downstream classifiers as a ``pick only from this set``
        constraint. Each dimension is returned as a sorted, de-duplicated
        list.
        """
        catalog_path = self.library / "_tag_catalog.json"
        if catalog_path.exists():
            try:
                data = json.loads(catalog_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                data = None
            if isinstance(data, dict):
                def _keys(field: str) -> list[str]:
                    val = data.get(field)
                    if isinstance(val, dict):
                        return sorted(val.keys())
                    if isinstance(val, list):
                        return sorted({str(x) for x in val})
                    return []
                return {
                    "tech_stack": _keys("tech_stack"),
                    "language": _keys("language"),
                    "capability": _keys("capability"),
                }

        tech: set[str] = set()
        langs: set[str] = set()
        caps: set[str] = set()
        for r in self.by_name.values():
            tech.update(r.tech_stack)
            langs.update(r.language)
            caps.update(r.capability)
        return {
            "tech_stack": sorted(tech),
            "language": sorted(langs),
            "capability": sorted(caps),
        }

    def get_skill(self, name: str) -> Optional[dict]:
        """Return skill body (frontmatter stripped, relative links rewritten)."""
        record = self.by_name.get(name)
        if record is None:
            return None
        content = _rewrite_relative_links(record.body, record.path.parent)
        return {"content": content}

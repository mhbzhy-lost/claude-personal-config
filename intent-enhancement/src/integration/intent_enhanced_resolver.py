"""Bridge adapter: skill-catalog pipeline ⇄ intent-enhancement EnhancedSkillResolver.

This module is imported dynamically by skill-catalog's pipeline when the
``ENABLE_INTENT_ENHANCEMENT`` env var is truthy. It is intentionally forgiving:
any internal failure is converted into an exception that the caller catches
and logs, falling back to the legacy pipeline — no partial/broken results
propagate to MCP clients.

Design notes:
- Reuses ``EnhancedSkillResolver`` verbatim; no changes to its API.
- Replaces the SKILL.md rescan with skill-catalog's already-indexed
  ``SkillCatalog.list_skills()`` output (avoids double scan + yaml dependency
  on the load path).
- Return shape is a superset of the legacy pipeline's dict: original keys are
  preserved byte-for-byte; enhancement adds ``enhanced_intent``, ``confidence``,
  ``dependency_analysis``, ``intent_enhancement_used=True``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from integration.enhanced_resolver import EnhancedSkillResolver
from retrieval import HybridRetrievalEngine


def _catalog_to_dicts(catalog) -> list[dict[str, Any]]:
    """Convert skill-catalog's ``SkillCatalog.by_name`` into dicts the
    intent-enhancement ``HybridRetrievalEngine`` understands.
    """
    out: list[dict[str, Any]] = []
    for rec in catalog.by_name.values():
        out.append({
            "name": rec.name,
            "description": rec.description,
            "tech_stack": list(rec.tech_stack or []),
            "language": list(rec.language or []),
            "capability": list(rec.capability or []),
            "file_path": str(rec.path),
        })
    return out


class IntentEnhancedResolver:
    """Adapter wiring skill-catalog pipeline inputs into
    ``EnhancedSkillResolver`` and normalizing the output dict.
    """

    def __init__(self, catalog, classifier=None) -> None:
        # classifier kept as arg for symmetry/future use; enhanced resolver has
        # its own intent engine, so we don't call the qwen classifier here.
        self._catalog = catalog
        self._classifier = classifier
        self._resolver = EnhancedSkillResolver()

        # Inject skill-catalog's indexed skills directly, bypassing SKILL.md
        # rescan + yaml parse in load_skill_catalog().
        skills_data = _catalog_to_dicts(catalog)
        self._resolver.skill_catalog_data = skills_data
        self._resolver.retrieval_engine = HybridRetrievalEngine(skills_data)

    def resolve(
        self,
        *,
        user_prompt: str,
        cwd: str | Path,
        tech_stack: list[str] | None = None,
        capability: list[str] | None = None,
        language: list[str] | None = None,
        top_n_limit: int | None = None,
        fingerprint_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        cwd_path = Path(cwd)
        enhanced = self._resolver.resolve(
            user_prompt=user_prompt,
            cwd=str(cwd_path),
            tech_stack=tech_stack,
            capability=capability,
            language=language,
            top_n=top_n_limit,
        )

        try:
            cwd_resolved = str(cwd_path.resolve())
        except OSError:
            cwd_resolved = str(cwd_path)

        # Preserve skill-catalog's (name, description) minimal shape at the
        # top-level ``skills`` key; any richer fields from enhancement go into
        # a nested ``enhanced_skills`` key for consumers that want them.
        minimal_skills = [
            {"name": s.get("name", ""), "description": s.get("description", "")}
            for s in enhanced.skills
        ]

        return {
            "cwd": cwd_resolved,
            "fingerprint": fingerprint_payload or {},
            "tech_stack": tech_stack or [],
            "capability": capability or [],
            "classifier_error": None,
            "skills": minimal_skills,
            # Enhancement-only fields:
            "intent_enhancement_used": True,
            "enhanced_intent": enhanced.enhanced_intent,
            "original_intent": enhanced.original_intent,
            "intent_confidence": enhanced.intent_confidence,
            "confidence": enhanced.confidence,
            "technical_context": enhanced.technical_context,
            "dependency_analysis": enhanced.dependency_analysis,
            "processing_time": enhanced.processing_time,
            "used_cache": enhanced.used_cache,
            "enhanced_skills": enhanced.skills,
        }

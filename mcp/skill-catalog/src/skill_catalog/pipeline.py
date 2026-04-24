"""Shared resolve pipeline used by both the MCP ``resolve`` tool and CLI.

Pure function: given a catalog + classifier + user inputs, produce a structured
result identical in shape for both callers.
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from .classifier import Classifier
from .fingerprint import scan_with_submodules
from .ranking import rank, top_n
from .scanner import SkillCatalog

logger = logging.getLogger(__name__)


# Resolve intent-enhancement/src once; path is derived relative to this file:
#   <repo>/mcp/skill-catalog/src/skill_catalog/pipeline.py
#   parents: [0]=skill_catalog [1]=src [2]=skill-catalog [3]=mcp [4]=<repo>
_REPO_ROOT = Path(__file__).resolve().parents[4]
_INTENT_ENHANCEMENT_SRC = _REPO_ROOT / "intent-enhancement" / "src"


def _enhancement_enabled() -> bool:
    return os.getenv("ENABLE_INTENT_ENHANCEMENT", "false").lower() in (
        "true",
        "1",
        "yes",
    )


def _try_import_intent_enhanced_resolver():
    """Inject intent-enhancement/src onto sys.path and import the adapter.

    Raises ImportError on any failure; caller logs + falls back.
    """
    if not _INTENT_ENHANCEMENT_SRC.is_dir():
        raise ImportError(
            f"intent-enhancement src dir not found: {_INTENT_ENHANCEMENT_SRC}"
        )
    path_str = str(_INTENT_ENHANCEMENT_SRC)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)
    from integration.intent_enhanced_resolver import IntentEnhancedResolver  # type: ignore
    return IntentEnhancedResolver


def run_resolve_pipeline(
    catalog: SkillCatalog,
    classifier: Classifier,
    user_prompt: str,
    cwd: str | Path,
    tech_stack: list[str] | None = None,
    capability: list[str] | None = None,
    language: list[str] | None = None,
    top_n_limit: int | None = None,
) -> dict:
    cwd_path = Path(cwd)
    fp = scan_with_submodules(cwd_path)

    # Optional intent-enhancement path (opt-in via env var, fail-soft).
    if _enhancement_enabled():
        try:
            ResolverCls = _try_import_intent_enhanced_resolver()
            resolver = ResolverCls(catalog=catalog, classifier=classifier)
            try:
                cwd_resolved = str(cwd_path.resolve())
            except OSError:
                cwd_resolved = str(cwd_path)
            fp_payload = {
                "detected": fp.detected,
                "summary": fp.to_text_summary(),
                "empty": fp.empty,
            }
            result = resolver.resolve(
                user_prompt=user_prompt,
                cwd=cwd_resolved,
                tech_stack=tech_stack,
                capability=capability,
                language=language,
                top_n_limit=top_n_limit,
                fingerprint_payload=fp_payload,
            )
            return result
        except Exception as e:  # noqa: BLE001 — explicit fail-soft
            logger.warning(
                "Intent enhancement failed, falling back to legacy pipeline: %s",
                e,
            )

    classifier_error: str | None = None
    if tech_stack is None or capability is None:
        tags = catalog.available_tags()
        result = classifier.classify(
            user_prompt=user_prompt,
            fingerprint_summary=fp.to_text_summary(),
            available_tech_stack=tags["tech_stack"],
            available_capability=tags["capability"],
        )
        if tech_stack is None:
            tech_stack = result.tech_stack
        if capability is None:
            capability = result.capability
        classifier_error = result.error

    tech_stack = tech_stack or []
    capability = capability or []

    if not tech_stack and not capability:
        filtered = {"skills": []}
    else:
        filtered = catalog.list_skills(
            tech_stack=tech_stack or None,
            capability=capability or None,
            language=language,
        )

    ranked = rank(filtered["skills"], tech_stack, capability, user_prompt)
    top = top_n(ranked, n=top_n_limit, candidate_count=len(filtered["skills"]))

    try:
        cwd_resolved = str(cwd_path.resolve())
    except OSError:
        cwd_resolved = str(cwd_path)

    return {
        "cwd": cwd_resolved,
        "fingerprint": {
            "detected": fp.detected,
            "summary": fp.to_text_summary(),
            "empty": fp.empty,
        },
        "tech_stack": tech_stack,
        "capability": capability,
        "classifier_error": classifier_error,
        "skills": [
            {"name": r.name, "description": r.description}
            for r in top
        ],
    }

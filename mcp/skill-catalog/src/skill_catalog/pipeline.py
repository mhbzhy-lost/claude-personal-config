"""Shared resolve pipeline used by both the MCP ``resolve`` tool and CLI.

Pure function: given a catalog + classifier + user inputs, produce a structured
result identical in shape for both callers.
"""

from __future__ import annotations

from pathlib import Path

from .classifier import Classifier
from .fingerprint import scan_with_submodules
from .ranking import rank, top_n
from .scanner import SkillCatalog


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

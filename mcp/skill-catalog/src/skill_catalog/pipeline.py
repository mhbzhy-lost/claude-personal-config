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

# Limits for @-referenced file augmentation.
_REF_FILE_MAX_BYTES = 8192
_REF_FILE_MAX_COUNT = 3


def _read_referenced_file(path: Path) -> str | None:
    try:
        if not path.is_file():
            return None
        raw = path.read_bytes()
    except OSError:
        return None
    truncated = len(raw) > _REF_FILE_MAX_BYTES
    data = raw[:_REF_FILE_MAX_BYTES] if truncated else raw
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("utf-8", errors="replace")
    if truncated:
        text += f"\n...[truncated at {_REF_FILE_MAX_BYTES} bytes]"
    return text


def _augment_prompt_with_references(
    user_prompt: str,
    referenced_files: list[str] | None,
) -> tuple[str, list[str]]:
    """Append readable content of @-referenced files to the prompt.

    Returns (augmented_prompt, list_of_paths_successfully_attached).
    """
    if not referenced_files:
        return user_prompt, []

    attached: list[str] = []
    sections: list[str] = []
    for raw_path in referenced_files:
        if len(attached) >= _REF_FILE_MAX_COUNT:
            break
        if not raw_path:
            continue
        path = Path(raw_path)
        content = _read_referenced_file(path)
        if content is None:
            continue
        sections.append(f"=== @{path} ===\n{content}")
        attached.append(str(path))

    if not sections:
        return user_prompt, []

    augmented = (
        f"{user_prompt}\n\n"
        "--- 用户在 prompt 中用 @ 引用的本地文件（作为分类补充上下文）---\n"
        + "\n\n".join(sections)
    )
    return augmented, attached


def run_resolve_pipeline(
    catalog: SkillCatalog,
    classifier: Classifier,
    user_prompt: str,
    cwd: str | Path,
    tech_stack: list[str] | None = None,
    capability: list[str] | None = None,
    language: list[str] | None = None,
    top_n_limit: int | None = None,
    referenced_files: list[str] | None = None,
) -> dict:
    cwd_path = Path(cwd)
    fp = scan_with_submodules(cwd_path)

    augmented_prompt, attached_refs = _augment_prompt_with_references(
        user_prompt, referenced_files
    )

    classifier_error: str | None = None
    if tech_stack is None or capability is None:
        tags = catalog.available_tags()
        result = classifier.classify(
            user_prompt=augmented_prompt,
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
        "referenced_files": attached_refs,
        "skills": [
            {"name": r.name, "description": r.description}
            for r in top
        ],
    }

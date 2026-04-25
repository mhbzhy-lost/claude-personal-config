"""Frontmatter audit for skill library.

Usage (manual)::
    python3 scripts/audit-frontmatter.py

Exit 1 if any ERROR. Suggested pre-commit hook (opt-in)::
    # .git/hooks/pre-commit
    #!/bin/sh
    python3 scripts/audit-frontmatter.py || exit 1
"""

import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).parent.parent
SKILLS_DIR = REPO_ROOT / "skills"
CAPABILITY_TAXONOMY = REPO_ROOT / "claude-skills" / "skill-distillation" / "references" / "capability-taxonomy.md"
TECH_STACK_TAXONOMY = REPO_ROOT / "claude-skills" / "skill-distillation" / "references" / "tech-stack-taxonomy.md"

REQUIRED_FIELDS = ["name", "description", "tech_stack", "capability"]

BANNED_LANGUAGE_VALUES = {
    "objective-c": "objc",
    "typescript-react": "use 'typescript' + 'react' separately",
    "javascript-react": "use 'javascript' + 'react' separately",
}

DESCRIPTION_MIN_LEN = 30


# ---------------------------------------------------------------------------
# Taxonomy helpers
# ---------------------------------------------------------------------------

def extract_bold_terms(path: Path) -> set[str]:
    """Extract all **term** values from a markdown file."""
    terms = set()
    for m in re.finditer(r"\*\*([^*]+)\*\*", path.read_text(encoding="utf-8")):
        terms.add(m.group(1).strip())
    return terms


# ---------------------------------------------------------------------------
# YAML-lite frontmatter parser (stdlib only, with pyyaml fallback)
# ---------------------------------------------------------------------------

def parse_frontmatter(text: str) -> dict | None:
    """Return parsed frontmatter dict or None if not found."""
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end == -1:
        return None
    fm_text = text[3:end].strip()

    try:
        import yaml  # pyyaml
        return yaml.safe_load(fm_text) or {}
    except ImportError:
        pass

    # Fallback: regex-based simple parser (handles scalar, list)
    result: dict = {}
    lines = fm_text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        scalar_m = re.match(r'^(\w[\w_-]*):\s*(.+)$', line)
        list_start_m = re.match(r'^(\w[\w_-]*):\s*$', line)
        if scalar_m:
            key, val = scalar_m.group(1), scalar_m.group(2).strip()
            # inline list: [a, b, c]
            if val.startswith("[") and val.endswith("]"):
                inner = val[1:-1]
                result[key] = [v.strip().strip("'\"") for v in inner.split(",") if v.strip()]
            else:
                result[key] = val.strip("'\"")
            i += 1
        elif list_start_m:
            key = list_start_m.group(1)
            items = []
            i += 1
            while i < len(lines) and lines[i].startswith("  - "):
                items.append(lines[i][4:].strip().strip("'\""))
                i += 1
            result[key] = items
        else:
            i += 1
    return result


def to_list(val) -> list[str]:
    """Coerce scalar or list to list of strings."""
    if val is None:
        return []
    if isinstance(val, list):
        return [str(v) for v in val]
    return [str(val)]


# ---------------------------------------------------------------------------
# Main audit logic
# ---------------------------------------------------------------------------

def audit():
    # Load capability closed set
    cap_set = extract_bold_terms(CAPABILITY_TAXONOMY)

    # Load tech_stack closed set (optional)
    ts_set: set[str] | None = None
    if TECH_STACK_TAXONOMY.exists():
        ts_set = extract_bold_terms(TECH_STACK_TAXONOMY)
    else:
        print(f"[info] tech-stack-taxonomy.md not found, skipping tech_stack closed-set check")

    skill_files = sorted(SKILLS_DIR.rglob("SKILL.md"))
    total = len(skill_files)
    print(f"Scanning {SKILLS_DIR} ...")

    errors: list[str] = []
    warnings: list[str] = []

    for skill_path in skill_files:
        rel = skill_path.relative_to(REPO_ROOT)
        text = skill_path.read_text(encoding="utf-8")
        fm = parse_frontmatter(text)

        if fm is None:
            errors.append(f"[ERROR] {rel}: no frontmatter found")
            continue

        # a. Required fields
        for field in REQUIRED_FIELDS:
            val = fm.get(field)
            if val is None or val == "" or val == [] or (isinstance(val, str) and not val.strip()):
                errors.append(f"[ERROR] {rel}: missing or empty required field '{field}'")

        # b. capability closed-set
        for cap in to_list(fm.get("capability")):
            if cap and cap not in cap_set:
                errors.append(f"[ERROR] {rel}: capability '{cap}' not in capability-taxonomy closed set")

        # c. tech_stack closed-set (optional)
        if ts_set is not None:
            for ts in to_list(fm.get("tech_stack")):
                if ts and ts not in ts_set:
                    errors.append(f"[ERROR] {rel}: tech_stack '{ts}' not in tech-stack-taxonomy closed set")

        # d. language banned names
        for lang in to_list(fm.get("language")):
            lang_lower = lang.lower()
            if lang_lower in BANNED_LANGUAGE_VALUES:
                suggestion = BANNED_LANGUAGE_VALUES[lang_lower]
                errors.append(
                    f"[ERROR] {rel}: language contains '{lang}' (should be '{suggestion}')"
                )

        # e. description quality (warning only)
        desc = fm.get("description", "")
        if isinstance(desc, str) and desc.strip() and len(desc.strip()) < DESCRIPTION_MIN_LEN:
            warnings.append(
                f"[WARNING] {rel}: description too short ({len(desc.strip())} < {DESCRIPTION_MIN_LEN} chars)"
            )

    # Output
    if not errors and not warnings:
        print(f"{total} skills checked. All passed.")
        return 0

    print(f"{total} skills checked.\n")
    for msg in errors:
        print(msg)
    for msg in warnings:
        print(msg)

    err_count = len(errors)
    warn_count = len(warnings)
    print(f"\nSummary: {err_count} error{'s' if err_count != 1 else ''}, {warn_count} warning{'s' if warn_count != 1 else ''}.")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(audit())

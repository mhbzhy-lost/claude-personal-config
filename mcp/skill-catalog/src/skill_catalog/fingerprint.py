"""Workspace fingerprinting: pure static file-based tech-stack detection.

No LLM, no network. Scans only the first level of the given directory for
well-known config files (package.json, pyproject.toml, go.mod, ...) and emits
a structured summary the caller can feed into an LLM prompt.
"""

from __future__ import annotations

import json
import tomllib
from dataclasses import dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# package.json deps → tech_stack tag
# ---------------------------------------------------------------------------
_NPM_DEP_TO_TAG: list[tuple[str, str]] = [
    ("next", "nextjs"),
    ("react", "react"),
    ("vue", "vue"),
    ("@angular/core", "angular"),
    ("antd", "antd"),
    ("@ant-design/pro-components", "antd"),
    ("@playwright/test", "playwright"),
]

# ---------------------------------------------------------------------------
# python package name → tech_stack tag
# ---------------------------------------------------------------------------
_PY_DEP_TO_TAG: list[tuple[str, str]] = [
    ("django", "django"),
    ("fastapi", "fastapi"),
    ("flask", "flask"),
    ("celery", "celery"),
    ("langchain", "langchain"),
    ("langgraph", "langgraph"),
    ("pydantic", "pydantic"),
]


@dataclass
class FingerprintResult:
    """Result of scanning a workspace root."""

    cwd: Path
    detected: dict[str, list[str]] = field(default_factory=dict)
    empty: bool = True

    def to_text_summary(self) -> str:
        """Compact multi-line summary suitable for embedding into an LLM prompt."""
        if self.empty:
            return "(空目录/无可识别配置)"
        lines: list[str] = [f"workspace: {self.cwd}"]
        for key in ("tech_stack", "language", "config_files", "evidence"):
            vals = self.detected.get(key) or []
            if not vals:
                continue
            lines.append(f"{key}: {', '.join(vals)}")
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# parsers (each returns (tags, langs, evidence_lines))
# ---------------------------------------------------------------------------


def _parse_package_json(path: Path) -> tuple[list[str], list[str], list[str]]:
    try:
        with open(path, "rb") as f:
            data = json.load(f)
    except Exception:
        return [], [], []

    deps: dict = {}
    for field_name in ("dependencies", "devDependencies", "peerDependencies"):
        block = data.get(field_name)
        if isinstance(block, dict):
            deps.update(block)

    tags: list[str] = []
    matched: list[str] = []
    for dep_name, tag in _NPM_DEP_TO_TAG:
        if dep_name in deps and tag not in tags:
            tags.append(tag)
            matched.append(f"dependencies.{dep_name}")

    langs: list[str] = []
    if "typescript" in deps:
        langs.append("typescript")

    evidence: list[str] = []
    if matched:
        evidence.append(f"package.json -> {', '.join(matched)}")
    return tags, langs, evidence


def _parse_pyproject(path: Path) -> tuple[list[str], list[str], list[str]]:
    try:
        with open(path, "rb") as f:
            data = tomllib.load(f)
    except Exception:
        return [], [], []

    dep_strings: list[str] = []

    # PEP 621: [project].dependencies is a list of strings
    project = data.get("project", {})
    if isinstance(project, dict):
        deps = project.get("dependencies")
        if isinstance(deps, list):
            dep_strings.extend(str(d) for d in deps)
        # optional-dependencies: dict[str, list[str]]
        opt = project.get("optional-dependencies")
        if isinstance(opt, dict):
            for v in opt.values():
                if isinstance(v, list):
                    dep_strings.extend(str(d) for d in v)

    # Poetry: [tool.poetry.dependencies] is a dict
    poetry = data.get("tool", {}).get("poetry", {}) if isinstance(data.get("tool"), dict) else {}
    if isinstance(poetry, dict):
        p_deps = poetry.get("dependencies")
        if isinstance(p_deps, dict):
            dep_strings.extend(p_deps.keys())

    lowered = " ".join(s.lower() for s in dep_strings)

    tags: list[str] = []
    matched: list[str] = []
    for pkg, tag in _PY_DEP_TO_TAG:
        # crude substring match — PEP 508 spec allows 'pkg>=x', 'pkg[extra]' etc.
        if pkg in lowered and tag not in tags:
            tags.append(tag)
            matched.append(pkg)

    evidence: list[str] = []
    if matched:
        evidence.append(f"pyproject.toml -> {', '.join(matched)}")
    # python language always implied by pyproject existence (caller decides)
    return tags, ["python"], evidence


def _parse_requirements_txt(path: Path) -> tuple[list[str], list[str], list[str]]:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception:
        return [], [], []

    lowered_lines: list[str] = []
    for ln in lines:
        ln = ln.strip()
        if not ln or ln.startswith("#") or ln.startswith("-"):
            continue
        lowered_lines.append(ln.lower())
    lowered = " ".join(lowered_lines)

    tags: list[str] = []
    matched: list[str] = []
    for pkg, tag in _PY_DEP_TO_TAG:
        if pkg in lowered and tag not in tags:
            tags.append(tag)
            matched.append(pkg)

    evidence: list[str] = []
    if matched:
        evidence.append(f"requirements.txt -> {', '.join(matched)}")
    return tags, ["python"], evidence


# ---------------------------------------------------------------------------
# public entry point
# ---------------------------------------------------------------------------


def scan(cwd: Path | str) -> FingerprintResult:
    """Scan *cwd* (first level only) and return a FingerprintResult.

    Never raises — on any I/O or parse failure the offending file is skipped.
    """
    root = Path(cwd)
    result = FingerprintResult(cwd=root)

    try:
        if not root.exists() or not root.is_dir():
            return result
    except OSError:
        return result

    tech: list[str] = []
    langs: list[str] = []
    configs: list[str] = []
    evidence: list[str] = []

    def add_tags(new_tags: list[str]) -> None:
        for t in new_tags:
            if t and t not in tech:
                tech.append(t)

    def add_langs(new_langs: list[str]) -> None:
        for lng in new_langs:
            if lng and lng not in langs:
                langs.append(lng)

    # --- file-existence dispatch ----------------------------------------
    try:
        children = {p.name: p for p in root.iterdir()}
    except OSError:
        return result

    pkg_json = children.get("package.json")
    if pkg_json and pkg_json.is_file():
        configs.append("package.json")
        t, l, ev = _parse_package_json(pkg_json)
        add_tags(t)
        add_langs(l)
        evidence.extend(ev)

    pyproject = children.get("pyproject.toml")
    if pyproject and pyproject.is_file():
        configs.append("pyproject.toml")
        t, l, ev = _parse_pyproject(pyproject)
        add_tags(t)
        add_langs(l)
        evidence.extend(ev)

    req = children.get("requirements.txt")
    if req and req.is_file():
        configs.append("requirements.txt")
        t, l, ev = _parse_requirements_txt(req)
        add_tags(t)
        add_langs(l)
        evidence.extend(ev)

    if "go.mod" in children and children["go.mod"].is_file():
        configs.append("go.mod")
        add_tags(["go"])
        add_langs(["go"])
        evidence.append("go.mod present")

    if "Cargo.toml" in children and children["Cargo.toml"].is_file():
        configs.append("Cargo.toml")
        add_tags(["rust"])
        add_langs(["rust"])
        evidence.append("Cargo.toml present")

    if "pubspec.yaml" in children and children["pubspec.yaml"].is_file():
        configs.append("pubspec.yaml")
        add_tags(["flutter"])
        evidence.append("pubspec.yaml present")

    if ("Podfile" in children and children["Podfile"].is_file()) or (
        "Package.swift" in children and children["Package.swift"].is_file()
    ):
        configs.append("Podfile/Package.swift")
        add_tags(["ios"])
        evidence.append("iOS manifest present")

    # Android signals: build.gradle / settings.gradle / any *.kt at top level
    has_gradle = any(
        n in children and children[n].is_file()
        for n in ("build.gradle", "settings.gradle", "build.gradle.kts", "settings.gradle.kts")
    )
    has_kt_file = False
    try:
        has_kt_file = any(root.glob("*.kt"))
    except OSError:
        has_kt_file = False
    if has_gradle or has_kt_file:
        if has_gradle:
            configs.append("gradle")
        add_tags(["android"])
        if has_kt_file:
            add_langs(["kotlin"])
        evidence.append("android build files present")

    if "composer.json" in children and children["composer.json"].is_file():
        configs.append("composer.json")
        add_tags(["php"])
        evidence.append("composer.json present")

    if "Gemfile" in children and children["Gemfile"].is_file():
        configs.append("Gemfile")
        add_tags(["ruby"])
        evidence.append("Gemfile present")

    # --- language signals by extension (top level only) -----------------
    try:
        has_ts = any(root.glob("*.ts")) or any(root.glob("*.tsx"))
    except OSError:
        has_ts = False
    if has_ts:
        add_langs(["typescript"])

    try:
        has_py = any(root.glob("*.py"))
    except OSError:
        has_py = False
    if has_py:
        add_langs(["python"])

    # --- assemble result -------------------------------------------------
    detected: dict[str, list[str]] = {}
    if tech:
        detected["tech_stack"] = tech
    if langs:
        detected["language"] = langs
    if configs:
        detected["config_files"] = configs
    if evidence:
        detected["evidence"] = evidence

    result.detected = detected
    result.empty = not any(detected.get(k) for k in ("tech_stack", "language", "config_files"))
    return result


_DEFAULT_SUBMODULES: tuple[str, ...] = (
    "web", "frontend", "client", "ui",
    "backend", "server", "api",
    "app", "apps",
)


def scan_with_submodules(
    cwd: Path | str,
    submodule_names: tuple[str, ...] = _DEFAULT_SUBMODULES,
) -> FingerprintResult:
    """Scan *cwd* top-level, then each existing immediate submodule dir, and merge.

    Evidence entries coming from submodule scans are prefixed with the submodule
    name (e.g. ``web/package.json -> ...``). Config file entries are likewise
    prefixed. Tags and languages are merged as a de-duplicated union.

    Never raises — submodule scan failures are silently skipped.
    """
    root = Path(cwd)
    merged = scan(root)

    try:
        if not root.exists() or not root.is_dir():
            return merged
    except OSError:
        return merged

    tech: list[str] = list(merged.detected.get("tech_stack") or [])
    langs: list[str] = list(merged.detected.get("language") or [])
    configs: list[str] = list(merged.detected.get("config_files") or [])
    evidence: list[str] = list(merged.detected.get("evidence") or [])

    def add_unique(dst: list[str], items: list[str]) -> None:
        for x in items:
            if x and x not in dst:
                dst.append(x)

    for name in submodule_names:
        sub = root / name
        try:
            if not sub.is_dir():
                continue
        except OSError:
            continue
        sub_result = scan(sub)
        sub_detected = sub_result.detected
        add_unique(tech, list(sub_detected.get("tech_stack") or []))
        add_unique(langs, list(sub_detected.get("language") or []))
        # prefix configs + evidence with submodule name
        for c in sub_detected.get("config_files") or []:
            prefixed = f"{name}/{c}"
            if prefixed not in configs:
                configs.append(prefixed)
        for ev in sub_detected.get("evidence") or []:
            prefixed = f"{name}/{ev}"
            if prefixed not in evidence:
                evidence.append(prefixed)

    detected: dict[str, list[str]] = {}
    if tech:
        detected["tech_stack"] = tech
    if langs:
        detected["language"] = langs
    if configs:
        detected["config_files"] = configs
    if evidence:
        detected["evidence"] = evidence

    merged.detected = detected
    merged.empty = not any(
        detected.get(k) for k in ("tech_stack", "language", "config_files")
    )
    return merged

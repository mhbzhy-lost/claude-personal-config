"""skill-catalog MCP server entry point."""

from __future__ import annotations

import atexit
import os
import signal
import sys
import tomllib
from pathlib import Path
from typing import Optional

from mcp.server.fastmcp import FastMCP

from .intent_fallback import IntentFallback, IntentFallbackConfig
from .lifecycle import OllamaConfig, OllamaLifecycleManager, OllamaStartupError
from .pipeline import run_resolve_pipeline
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
    cap_mode = filter_cfg.get("capability_match_mode", "union")

    catalog = SkillCatalog(
        library_path,
        tech_stack_match_mode=ts_mode,
        language_match_mode=lang_mode,
        capability_match_mode=cap_mode,
    )
    print(
        f"[skill-catalog] indexed {len(catalog.by_name)} skills across "
        f"{len(catalog.by_tag)} tags from {library_path} "
        f"(tech_stack={catalog.tech_stack_match_mode}, "
        f"language={catalog.language_match_mode}, "
        f"capability={catalog.capability_match_mode})",
        file=sys.stderr,
    )
    return catalog


def _build_lifecycle() -> OllamaLifecycleManager:
    default_bin = _PROJECT_ROOT / "vendor" / "ollama" / "ollama"
    default_models = _PROJECT_ROOT / ".ollama-models"
    default_runtime = _PROJECT_ROOT / ".ollama-runtime"

    binary_path = Path(
        os.environ.get("SKILL_CATALOG_OLLAMA_BIN", str(default_bin))
    )
    models_dir = Path(
        os.environ.get("SKILL_CATALOG_OLLAMA_MODELS_DIR", str(default_models))
    )
    runtime_dir = Path(
        os.environ.get("SKILL_CATALOG_OLLAMA_RUNTIME_DIR", str(default_runtime))
    )
    port_raw = os.environ.get("SKILL_CATALOG_OLLAMA_PORT", "11435")
    try:
        port = int(port_raw)
    except ValueError:
        print(
            f"[skill-catalog] FATAL: invalid SKILL_CATALOG_OLLAMA_PORT={port_raw!r}",
            file=sys.stderr,
        )
        sys.exit(3)

    config = OllamaConfig(
        binary_path=binary_path,
        models_dir=models_dir,
        runtime_dir=runtime_dir,
        port=port,
    )
    return OllamaLifecycleManager(config)


def _build_intent_fallback() -> IntentFallback:
    config = _load_config()
    # 优先读 [intent_fallback]；兼容历史 [classifier].timeout_s 字段名
    fb_cfg = config.get("intent_fallback", {}) or config.get("classifier", {})
    host_url = os.environ.get(
        "SKILL_CATALOG_OLLAMA_HOST", "http://127.0.0.1:11435"
    )
    model = os.environ.get("SKILL_CATALOG_EMBEDDING_MODEL", "bge-m3")
    timeout_s = fb_cfg.get("embedding_timeout_s", fb_cfg.get("timeout_s", 15.0))
    return IntentFallback(
        IntentFallbackConfig(
            embedding_host_url=host_url,
            embedding_model=model,
            embedding_timeout_s=timeout_s,
        )
    )


catalog = _load_catalog()
classifier = _build_intent_fallback()

lifecycle = _build_lifecycle()
try:
    lifecycle.acquire()
except OllamaStartupError as e:
    print(f"[skill-catalog] FATAL: ollama daemon 启动失败: {e}", file=sys.stderr)
    sys.exit(3)


def _cleanup() -> None:
    try:
        lifecycle.release()
    except Exception as e:  # noqa: BLE001
        print(f"[skill-catalog] cleanup warn: {e}", file=sys.stderr)


atexit.register(_cleanup)


def _signal_cleanup(_signum, _frame) -> None:
    _cleanup()
    sys.exit(0)


for _sig in (signal.SIGTERM, signal.SIGINT):
    try:
        signal.signal(_sig, _signal_cleanup)
    except (ValueError, OSError):
        # not on main thread or unsupported platform
        pass

mcp = FastMCP("skill-catalog")


@mcp.tool()
def list_skills(
    tech_stack: list[str] | None = None,
    language: list[str] | None = None,
    capability: list[str] | None = None,
) -> dict:
    """List skills filtered by tech stack, programming language and/or capability.

    Args:
        tech_stack: Platform/framework tags (e.g. ["harmonyos"], ["django"]).
            When provided, only skills whose tech_stack matches are returned.
            Pass None or empty list to leave unconstrained.
        language: Programming language tags (e.g. ["python"], ["cpp"]).
            When provided, only skills whose language field intersects are
            returned; language-agnostic skills are excluded.
        capability: Capability enum keys from the project's capability
            taxonomy (e.g. ["ui-input", "auth"]). When provided, only skills
            whose capability field intersects are returned; skills without
            a capability field (legacy/unmarked) are excluded.

    All empty → returns nothing.
    Multiple provided → must match on all provided dimensions.

    Returns:
        {"skills": [{"name", "description", "tech_stack",
                     "language"?, "capability"?}, ...]}
    """
    return catalog.list_skills(
        tech_stack,
        language=language,
        capability=capability,
    )


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


@mcp.tool()
def resolve(
    user_prompt: str,
    cwd: str,
    tech_stack: list[str] | None = None,
    capability: list[str] | None = None,
    language: list[str] | None = None,
    top_n_limit: int | None = None,
) -> dict:
    """One-stop retrieval: fingerprint + LLM classify + filter + rank + top-N.

    Args:
        user_prompt: The user's original request (Chinese/English mix OK).
        cwd: Workspace root absolute path.
        tech_stack: If caller has pre-computed tags, skips LLM classification
            for this dimension (value is used as-is).
        capability: Same as above for capability dimension.
        language: Optional programming-language filter.
        top_n_limit: Override dynamic top-N truncation.

    Returns:
        Dict with keys: cwd, fingerprint, tech_stack, capability,
        classifier_error, skills. Each skill entry is a
        minimal {name, description} pair sorted by internal heuristic rank —
        **read the description to decide which skill is actually relevant,
        then call `get_skill(name)` only for the ones you need**. List order
        is a coarse hint; description is the ground truth for pick-vs-skip.
    """
    return run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,
        user_prompt=user_prompt,
        cwd=cwd,
        tech_stack=tech_stack,
        capability=capability,
        language=language,
        top_n_limit=top_n_limit,
    )


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()

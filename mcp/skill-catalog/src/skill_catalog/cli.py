"""skill-catalog-cli: command-line entry used by hooks and for manual debugging."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tomllib
from pathlib import Path

from .classifier import Classifier, ClassifierConfig
from .fingerprint import scan as fingerprint_scan
from .pipeline import run_resolve_pipeline
from .scanner import SkillCatalog

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_DEFAULT_CONFIG = _PROJECT_ROOT / "catalog.toml"


def _load_config() -> dict:
    config_path = os.environ.get("SKILL_CATALOG_CONFIG", str(_DEFAULT_CONFIG))
    path = Path(config_path)
    if path.is_file():
        try:
            with open(path, "rb") as f:
                return tomllib.load(f)
        except Exception:
            return {}
    return {}


def _build_catalog() -> SkillCatalog:
    library_path = os.environ.get("SKILL_LIBRARY_PATH")
    if not library_path:
        print(
            "[skill-catalog-cli] FATAL: SKILL_LIBRARY_PATH env var is required",
            file=sys.stderr,
        )
        sys.exit(2)

    filter_cfg = _load_config().get("filter", {})
    return SkillCatalog(
        library_path,
        tech_stack_match_mode=filter_cfg.get("tech_stack_match_mode", "intersection"),
        language_match_mode=filter_cfg.get("language_match_mode", "union"),
        capability_match_mode=filter_cfg.get("capability_match_mode", "union"),
    )


def cmd_fingerprint(args: argparse.Namespace) -> int:
    result = fingerprint_scan(Path(args.cwd).resolve())
    print(
        json.dumps(
            {
                "cwd": str(result.cwd),
                "detected": result.detected,
                "empty": result.empty,
                "summary": result.to_text_summary(),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def cmd_tags(args: argparse.Namespace) -> int:
    catalog = _build_catalog()
    print(json.dumps(catalog.available_tags(), ensure_ascii=False, indent=2))
    return 0


def _build_classifier() -> Classifier:
    host_url = os.environ.get(
        "SKILL_CATALOG_OLLAMA_HOST", "http://127.0.0.1:11435"
    )
    model = os.environ.get("SKILL_CATALOG_OLLAMA_MODEL", "qwen3:4b")
    return Classifier(ClassifierConfig(host_url=host_url, model=model))


def _format_resolve_text(result: dict) -> str:
    lines: list[str] = []
    ts = result.get("tech_stack") or []
    cap = result.get("capability") or []
    skills = result.get("skills") or []
    lines.append(f"检测技术栈: {', '.join(ts) if ts else '(无)'}")
    lines.append(f"能力域: {', '.join(cap) if cap else '(无)'}")
    if skills:
        lines.append("相关 skill（读 description 决定要不要 get_skill）:")
        for s in skills:
            name = s.get("name", "")
            desc = s.get("description", "") or ""
            # 单行化 + 截断避免 hook 注入文本爆炸
            desc_clean = " ".join(desc.split())
            if len(desc_clean) > 120:
                desc_clean = desc_clean[:117] + "..."
            lines.append(f"  - {name}: {desc_clean}" if desc_clean else f"  - {name}")
    else:
        lines.append("相关 skill: (无)")
    err = result.get("classifier_error")
    if err:
        lines.append(f"classifier_error: {err}")
    return "\n".join(lines)


def cmd_get(args: argparse.Namespace) -> int:
    """Load a single skill's body by name.

    --json-output (default): prints {"name": <name>, "content": <body>|null}
    --text-output: prints body on stdout; if missing, empty stdout + rc=2
    """
    catalog = _build_catalog()
    result = catalog.get_skill(args.name)
    content = result["content"] if result else None

    if args.text_output:
        if content is None:
            return 2
        sys.stdout.write(content)
        if not content.endswith("\n"):
            sys.stdout.write("\n")
        return 0

    print(
        json.dumps(
            {"name": args.name, "content": content},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def cmd_resolve(args: argparse.Namespace) -> int:
    catalog = _build_catalog()
    classifier = _build_classifier()

    tech_stack = args.tech_stack or None
    capability = args.capability or None
    language = args.language or None

    result = run_resolve_pipeline(
        catalog=catalog,
        classifier=classifier,
        user_prompt=args.prompt,
        cwd=args.cwd,
        tech_stack=tech_stack,
        capability=capability,
        language=language,
        top_n_limit=args.top_n,
    )

    if args.text_output:
        print(_format_resolve_text(result))
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="skill-catalog-cli")
    sub = parser.add_subparsers(dest="command", required=True)

    p_fp = sub.add_parser("fingerprint", help="扫 workspace 生成指纹")
    p_fp.add_argument("--cwd", required=True)
    p_fp.set_defaults(func=cmd_fingerprint)

    p_tags = sub.add_parser("tags", help="列出 skill 库内合法 tag universe")
    p_tags.set_defaults(func=cmd_tags)

    p_resolve = sub.add_parser(
        "resolve", help="一站式检索（LLM 分类 + 过滤 + rank）"
    )
    p_resolve.add_argument("--prompt", required=True)
    p_resolve.add_argument("--cwd", required=True)
    p_resolve.add_argument(
        "--tech-stack", action="append", default=None,
        help="预置 tech_stack tag，可多次指定；跳过 LLM 分类该维度",
    )
    p_resolve.add_argument(
        "--capability", action="append", default=None,
        help="预置 capability tag，可多次指定；跳过 LLM 分类该维度",
    )
    p_resolve.add_argument(
        "--language", action="append", default=None,
        help="过滤编程语言，可多次指定",
    )
    p_resolve.add_argument(
        "--top-n", type=int, default=None,
        help="截断结果数量（默认走动态规则）",
    )
    out_group = p_resolve.add_mutually_exclusive_group()
    out_group.add_argument(
        "--json-output", dest="text_output", action="store_false",
        help="输出 JSON（默认）",
    )
    out_group.add_argument(
        "--text-output", dest="text_output", action="store_true",
        help="输出人类可读摘要（供 hook 注入用）",
    )
    p_resolve.set_defaults(func=cmd_resolve, text_output=False)

    p_get = sub.add_parser("get", help="按 name 读取单条 skill 正文")
    p_get.add_argument("--name", required=True, help="skill 的 name（SKILL.md frontmatter）")
    get_out = p_get.add_mutually_exclusive_group()
    get_out.add_argument(
        "--json-output", dest="text_output", action="store_false",
        help='输出 JSON {"name":..., "content":...}（默认）',
    )
    get_out.add_argument(
        "--text-output", dest="text_output", action="store_true",
        help="直接输出 body；skill 不存在时空 stdout + rc=2",
    )
    p_get.set_defaults(func=cmd_get, text_output=False)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

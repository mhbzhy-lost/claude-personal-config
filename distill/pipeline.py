"""3-stage skill distillation pipeline orchestrator.

Architecture:

  Stage 1 — plan   : single LLM conversation that explores authoritative
                     sources and emits ``plan.json``.
  Stage 2 — fetch  : pure Python loop, no LLM. Downloads every URL listed
                     in ``plan.json`` to ``raw/<skill_name>/<file>``.
  Stage 3 — build  : single LLM conversation that walks 3 inner steps —
                     preprocess, build SKILL.md, mark capability — by
                     appending user nudges to the *same* messages array.
                     The system prompt stays byte-identical across all
                     turns so prefix caching hits aggressively.

The build stage relies on ``read_file`` to pull raw material from disk on
demand — the raw bytes are NEVER inlined into the conversation history,
which keeps prompt_tokens flat regardless of source size.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

# Load .env from this script's directory BEFORE importing adapter (which reads
# DEEPSEEK_API_KEY / DASHSCOPE_API_KEY from os.environ at construction time).
# Silent if .env is absent — env-var validation happens in main().
from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_PATH)

from adapter import DeepSeekAdapter, PipelineStats, QwenAdapter, StageStats
from persistence import FetchLogger, RunRecorder, StageRecorder
from tools import (
    TOOL_DEFINITIONS,
    execute_tool,
    get_tool_defs,
    web_fetch as tool_web_fetch,
)

# ---------------------------------------------------------------------------
# Tool budgets per LLM conversation phase
# ---------------------------------------------------------------------------
# Plan budget is fixed; build budgets scale linearly with the number of
# skills inside the current build batch (see ``compute_step_budget``).
# Budgets are *cumulative* tool-call caps for a single conversation —
# step boundaries are advisory, the model can push past a step if it
# needs another read before writing.
PLAN_TOOL_BUDGET: int = 25


def compute_step_budget(
    step_name: str,
    n_skills_in_batch: int,
    multiplier: float = 1.0,
) -> int:
    """Per-step budget that scales with batch size.

    Empirical formula (recalibrated 2026-04 — single-skill case needs
    extra slack for list_files + 2-3 read_file + 2 writes + spillover):
      step_1 (preprocess):     8 + 7*N   (N=1→15, N=3→29, N=5→43)
      step_2 (build SKILL.md): 5 + 4*N   (N=1→9,  N=3→17, N=5→25)
      step_3 (mark capability):4 + 3*N   (N=1→7,  N=3→13, N=5→19)
    """
    n = max(1, int(n_skills_in_batch))
    base = {
        "build_step_1": 8 + 7 * n,
        "build_step_2": 5 + 4 * n,
        "build_step_3": 4 + 3 * n,
    }
    if step_name not in base:
        raise KeyError(f"unknown step: {step_name}")
    return max(1, int(round(base[step_name] * multiplier)))


# Back-compat: keep TOOL_BUDGETS exported as a *snapshot* under N=1 for
# any caller that still inspects it. Inside the pipeline we always use
# compute_step_budget.
TOOL_BUDGETS: dict[str, int] = {
    "plan": PLAN_TOOL_BUDGET,
    "build_step_1": compute_step_budget("build_step_1", 1),
    "build_step_2": compute_step_budget("build_step_2", 1),
    "build_step_3": compute_step_budget("build_step_3", 1),
}

# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------
PLAN_PROMPT = """\
You are an *intent-aware source-planner* for a skill distillation
pipeline. Your sole job is to (a) interpret the user's natural-language
intent, (b) discover authoritative documentation sources, and (c) emit a
structured plan that honors every constraint expressed in the intent.

You DO NOT distill, fetch, or write SKILL.md. You only plan.

## Inputs you will receive (in the user message)

- `intent`           — the user's natural-language request, verbatim.
- `existing_skills`  — JSON list of skill names already present under
                       the skills_base catalog. Use this for dedup.
- `plan_path`        — absolute path where you must persist plan.json.
- `skills_base`      — root dir for SKILL.md outputs (FYI only).

## Step 1: interpret the intent

Parse the intent to extract these facets (some may be implicit / absent):

- **tech_stack**: the library / framework / domain. Infer if not spelled
  out. MUST be a clean filesystem slug (lowercase, no spaces, no
  slashes, hyphens OK). Examples: "antd", "fastapi", "shadcn-ui",
  "lodash".
- **focus_constraints**: which areas / components / patterns to cover.
  Encode as `focus:<topic>` strings.
- **skip_constraints**: areas / topics / already-existing skills the
  user wants excluded. Encode as `skip:<topic>` strings. ALWAYS add a
  `skip:<name>` entry for any name in `existing_skills` that matches
  the user's "skip already-existing" intent.
- **granularity_hint**: e.g. `granularity:per-component`,
  `granularity:single-skill`, `granularity:by-feature`.
- **size_hint**: optional, e.g. `max_size:5kb`, `target_tokens:18000`.

If the intent is vague (e.g. just "distill httpx"), emit an empty
constraints array — never invent restrictions the user did not request.

## Step 2: discover sources

1. `list_skills(tech_stack="<inferred>")` — confirm dedup view (the
   user message already provides existing_skills, but a fresh call is
   cheap and authoritative).
2. `web_search(query="...")` — at most 1-2 calls to locate official
   docs domain. STOP once found.
3. `web_fetch(url="<landing>")` — inspect doc structure. Up to 3-4
   pages to map the tree, no more.

## Step 3: compose plan.json

Persist via `write_file(path=plan_path, content=...)`. Returning the
plan inline in your reply without write_file is a protocol violation —
the next stage reads from disk only.

```json
{
  "intent": "<verbatim intent string>",
  "intent_summary": "<one-line distilled goal>",
  "tech_stack": "<inferred slug>",
  "constraints": [
    "focus:form-components",
    "skip:antd-table",
    "granularity:per-component",
    "max_size:5kb"
  ],
  "skills": [
    {
      "name": "<tech>-<component>",
      "primary": "https://<official-docs-url>",
      "complements": ["https://..."],
      "estimated_tokens": 18000,
      "rationale": "Why this skill, why this scope (refs constraints)"
    }
  ],
  "build_batch_size": 3,
  "build_batch_rationale": "<one-line reasoning per Step 4>"
}
```

## Step 4: recommend build_batch_size

After you've decided the skills list, recommend a build_batch_size based on:

- N = number of skills you plan to produce (length of skills array)
- avg estimated_tokens per skill (from your skills[].estimated_tokens)
- Provider context window (~256K for both DeepSeek and Qwen)
- Empirical observation: each skill in build adds ~80-100K to conversation prompt
  due to system prompt + reasoning_content + tool_results accumulation

Heuristic:
- If avg_tokens < 10K → batch_size 4-5 (skills are small, can pack more per batch)
- If avg_tokens 10-25K → batch_size 3 (default)
- If avg_tokens > 25K → batch_size 1-2 (large skills accumulate fast)
- Hard cap: skills_in_batch × 100K ≤ 200K (leave 56K buffer for system + reasoning + tool overhead)

For N=1 (single skill plan), batch_size MUST be 1.
For N=2, prefer batch_size=2 (single batch, max cache reuse) unless skills are huge.

Output build_batch_size as a positive integer + a one-line rationale
in `build_batch_rationale`.

## Skill-list rules (HARD)

- The skills list MUST honor every constraint:
  * Every focus:<topic> should appear (or be subsumed) in at least one
    skill's scope.
  * No skill may overlap a skip:<topic> entry.
- If `existing_skills` already covers a topic that the intent does not
  explicitly override, prefer NOT to redistill — leave it out and add a
  `skip:already-distilled-<name>` constraint to make the decision
  auditable.
- Aim for 1-5 skills total at component / module granularity (unless
  granularity hint says otherwise).

## Source rules

- Prefer official docs > GitHub README > official CHANGELOG.
- NEVER include: community blogs, Medium, Stack Overflow, translated docs.
- Each skill: 1 primary URL + 0..3 complements.
- For GitHub markdown, prefer raw.githubusercontent.com URLs.

## Final reply

After write_file succeeds, return a short JSON status (no fences):
`{"status":"ok","plan_path":"...","tech_stack":"...","skill_count":N}`
"""

BUILD_PROMPT = """\
You are a *skill builder* in a 3-stage distillation pipeline. The plan
and raw material have already been prepared on disk; your conversation
walks 3 inner steps in order, and each user message tells you which step
to execute next. The conversation history persists across all 3 steps so
you can reference earlier work.

## Workspace layout (paths injected via user messages)

```
<output_dir>/<tech>/
├── plan.json                # already written by stage-1
├── raw/<skill>/             # fetched files (read with read_file)
│   ├── primary.md
│   ├── complement-01.md
│   └── ...
└── cleaned/<skill>/         # YOU write SOURCE.md + _meta.json here
    ├── SOURCE.md
    └── _meta.json

<skills_base>/<tech>/<skill>/SKILL.md   # YOU write the final SKILL.md here
```

## The 3 steps you will be asked to perform (in order)

### Step 1: preprocess

For each skill in the plan, list files in `raw/<skill>/`, read each
file, strip obvious noise (nav, footers, duplicate paragraphs), and
write a single `cleaned/<skill>/SOURCE.md` plus `cleaned/<skill>/_meta.json`.

SOURCE.md template (preserve author wording — only remove noise):

```markdown
# <skill-name>

## Source URLs
<list>

## Version
<extracted from material, or "<product> unversioned">

## Core Concepts
<verbatim core>

## When to Use
<usage scenarios>

## API Reference
<API tables / signatures, most-detailed version kept>

## Examples
<code examples + surrounding text>

## Caveats & Pitfalls
<warnings, breaking changes>
```

_meta.json fields: skill_name, sources[], version, collected_at,
language_hints[], raw_bytes, processed_bytes.

### Step 2: build SKILL.md

For each skill, read `cleaned/<skill>/SOURCE.md` + `_meta.json` and
write `<skills_base>/<tech>/<skill>/SKILL.md` using the format below.
Goal: an LLM should handle 80% of common tasks for this component
after reading this single file.

```markdown
---
name: <skill-name>
description: <one-line description>
tech_stack: [<tech>]
language: [<lang>]              # omit if language-agnostic
version: "<product> <version>"  # MANDATORY, never "latest"
collected_at: <YYYY-MM-DD>      # MANDATORY
---

# <Component Name>

> Source: <URLs from cleaned/_meta.json>

## Purpose
## When to Use
## Basic Usage
## Key APIs (Summary)
## Caveats
## Composition Hints
```

KEEP: high-frequency usage, edge behavior, breaking changes, minimal
examples. DROP: marketing text, full API reference, internal impl,
rarely-used features. Do NOT include capability field — that's step 3.

tech_stack taxonomy — closed enumeration (use ONLY canonical names from
this enumeration when filling frontmatter `tech_stack:`):

```
__TECH_STACK_TAXONOMY__
```

Selection rules for `tech_stack:`:
- Pick 1-3 canonical tech_stack names per skill (cross-stack综合 up to 5)
- Values MUST be from the enumeration above; aliases listed under
  "合并别名" must be normalized to the canonical name — DO NOT invent
  new tech_stack values
- For `language:` use the actual programming language slug (lowercase),
  omit when language-agnostic

### Step 3: mark capability

For each SKILL.md you wrote in step 2, read it, decide 1-3 capability
keys from the closed taxonomy below, then read+write the file to insert
`capability: [key1, key2]` into the frontmatter (right after `language`
or `tech_stack` if no `language`). Keep the array on a single line.

Capability taxonomy — closed enumeration (use ONLY values defined here):

```
__CAPABILITY_TAXONOMY__
```

Selection rules:
- Pick 1-3 capability keys per skill (cross-domain components up to 5)
- Values MUST be from the enumeration above; if no key fits exactly,
  pick the closest available — DO NOT invent new keys
- Each key is documented with "包含/不包含/示例" — read the descriptions
  carefully before picking

## Tool usage rules

- `read_file(path)` for loading any disk content. Cap is 20K chars per
  call; if a file is bigger, the tool returns the prefix — that's fine
  for skill distillation, the tail is rarely useful.
- `write_file(path, content)` for persisting artifacts. ALWAYS write
  the complete file in one call — do NOT loop read_file/write_file to
  incrementally edit (except in step 3, where you are surgically adding
  one frontmatter line).
- `list_files(path, pattern)` to discover what raw files exist.
- Do NOT fetch anything from the web — fetch is already done.

## Output discipline

Each step ends when you've persisted all artifacts for every skill in
the plan. After persisting, send a short JSON status reply (no fences),
e.g. `{"status":"ok","step":"preprocess","skills_done":["foo","bar"]}`,
then await the next user nudge.
"""

# ---------------------------------------------------------------------------
# Tag catalog: authoritative closed-set source of truth
# ---------------------------------------------------------------------------
# Lives at ``<skills_base>/_tag_catalog.json``. Both the mcp/skill-catalog
# server (for available_tags) and this distill pipeline (for BUILD_PROMPT
# closed-set injection) read from it. After build, any new tag values that
# appeared in produced SKILL.md but weren't in the catalog are
# auto-appended with ``null`` description for later manual fill-in.
TAG_CATALOG_FILENAME = "_tag_catalog.json"


def load_tag_catalog(skills_base: str | Path) -> dict:
    """Load <skills_base>/_tag_catalog.json. Hard-fail on missing/invalid.

    The closed-set catalog is mandatory for distillation — without it the
    BUILD_PROMPT would let the LLM invent arbitrary tag values, defeating
    the whole point of having a curated taxonomy.
    """
    path = Path(skills_base) / TAG_CATALOG_FILENAME
    if not path.exists():
        raise RuntimeError(
            f"tag catalog missing: {path}. The distill pipeline requires "
            f"an authoritative closed-set tag catalog. Create the JSON "
            f"file before running."
        )
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise RuntimeError(f"tag catalog at {path} is invalid JSON: {e}") from e
    if not isinstance(data, dict):
        raise RuntimeError(f"tag catalog at {path} must be a JSON object")
    return data


def _render_dict_taxonomy(field: dict | list, header: str) -> str:
    """Render capability or tech_stack section as a markdown bullet list."""
    lines = [header, ""]
    if isinstance(field, dict):
        for key in sorted(field.keys()):
            desc = field[key]
            if desc:
                lines.append(f"- **{key}**: {desc}")
            else:
                lines.append(f"- **{key}**")
    elif isinstance(field, list):
        for key in sorted(field):
            lines.append(f"- **{key}**")
    return "\n".join(lines)


def render_tag_catalog_for_prompt(catalog: dict) -> tuple[str, str]:
    """Return (capability_block, tech_stack_block) markdown strings."""
    cap_block = _render_dict_taxonomy(
        catalog.get("capability", {}),
        "Capability taxonomy (closed set, pick ONLY from these keys):",
    )
    tech_block = _render_dict_taxonomy(
        catalog.get("tech_stack", {}),
        "tech_stack taxonomy (closed set, pick ONLY from these canonical names):",
    )
    return cap_block, tech_block


def build_prompt_with_catalog(catalog: dict) -> str:
    """Inject closed-set taxonomies into the BUILD_PROMPT template."""
    cap_block, tech_block = render_tag_catalog_for_prompt(catalog)
    return BUILD_PROMPT.replace(
        "__CAPABILITY_TAXONOMY__", cap_block
    ).replace(
        "__TECH_STACK_TAXONOMY__", tech_block
    )


def _parse_skill_frontmatter(skill_md_path: Path) -> dict:
    """Read SKILL.md frontmatter (between leading ``---`` fences) as dict."""
    if not skill_md_path.exists():
        return {}
    text = skill_md_path.read_text(encoding="utf-8", errors="replace")
    if not text.startswith("---"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    fm_text = parts[1]
    out: dict = {}
    for line in fm_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            items = [x.strip().strip("'\"") for x in inner.split(",") if x.strip()]
            out[key] = items
        else:
            out[key] = val.strip("'\"")
    return out


def auto_append_new_tags(
    skills_base: str | Path,
    skill_outputs: list[dict],
) -> dict:
    """Detect new capability/tech_stack values from produced SKILL.md and
    append them to the catalog json with ``null`` description.

    Returns a dict ``{"capability": [...], "tech_stack": [...]}`` listing
    what was newly appended (empty lists when nothing new).
    """
    appended = {"capability": [], "tech_stack": []}
    base = Path(skills_base)
    catalog_path = base / TAG_CATALOG_FILENAME
    if not catalog_path.exists():
        return appended
    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return appended

    cap_field = catalog.get("capability")
    tech_field = catalog.get("tech_stack")
    cap_keys = set(cap_field.keys() if isinstance(cap_field, dict) else (cap_field or []))
    tech_keys = set(tech_field.keys() if isinstance(tech_field, dict) else (tech_field or []))

    new_caps: set[str] = set()
    new_techs: set[str] = set()
    for so in skill_outputs:
        if not so.get("exists"):
            continue
        fm = _parse_skill_frontmatter(Path(so["path"]))
        for cap in fm.get("capability", []) or []:
            if cap and cap not in cap_keys:
                new_caps.add(cap)
        for tech in fm.get("tech_stack", []) or []:
            if tech and tech not in tech_keys:
                new_techs.add(tech)

    if not new_caps and not new_techs:
        return appended

    # Append (preserve dict shape if present, else upgrade list→dict so we
    # can store null descriptions consistently).
    if isinstance(cap_field, dict):
        for k in new_caps:
            cap_field[k] = None
    else:
        upgraded = {k: None for k in (cap_field or [])}
        for k in new_caps:
            upgraded[k] = None
        catalog["capability"] = upgraded
    if isinstance(tech_field, dict):
        for k in new_techs:
            tech_field[k] = None
    else:
        upgraded = {k: None for k in (tech_field or [])}
        for k in new_techs:
            upgraded[k] = None
        catalog["tech_stack"] = upgraded

    catalog["updated_at"] = _dt.date.today().isoformat()
    catalog_path.write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    appended["capability"] = sorted(new_caps)
    appended["tech_stack"] = sorted(new_techs)
    print(
        f"[catalog] appended new tags: "
        f"capability={appended['capability']} "
        f"tech_stack={appended['tech_stack']}",
        file=sys.stderr,
    )
    return appended


STEP_1_NUDGE = """\
Begin **Step 1/3: preprocess** for THIS BATCH.

Workspace:
- raw_dir:     {raw_dir}
- cleaned_dir: {cleaned_dir}
- plan_path:   {plan_path}

Batch skills (process EXACTLY these, in order): {skill_names}

For EACH skill in the batch list, run this loop ONE SKILL AT A TIME:
  1. list_files raw/<skill_name>/
  2. read_file each raw file for THIS skill
  3. compose SOURCE.md + _meta.json for THIS skill
  4. write_file cleaned/<skill_name>/SOURCE.md
  5. write_file cleaned/<skill_name>/_meta.json
  6. Move to the NEXT skill and repeat

CRITICAL protocol rules:
- Process skills ONE BY ONE. After each skill you MUST call write_file
  (twice — SOURCE.md and _meta.json) BEFORE touching the next skill.
- Do NOT read all raw files for the whole batch first and then batch-write
  at the end — that wastes the tool budget and risks a soft-abort that
  leaves zero artifacts on disk.
- Reporting completion only via response text (without write_file) is a
  protocol violation — the next stage reads from disk.
- When the batch is fully processed, list_files cleaned/ to verify every
  expected <skill_name> dir exists, then reply with a short JSON status
  like `{{"status":"ok","step":"preprocess","skills_done":[...]}}`."""

STEP_2_NUDGE = """\
Begin **Step 2/3: build SKILL.md** for THIS BATCH.

Workspace:
- cleaned_dir: {cleaned_dir}
- skills_base: {skills_base}
- tech_stack:  {tech_stack}

Batch skills (process EXACTLY these, in order): {skill_names}

For EACH skill in the batch list, run this loop ONE SKILL AT A TIME:
  1. read_file cleaned/<skill_name>/SOURCE.md
  2. read_file cleaned/<skill_name>/_meta.json
  3. compose SKILL.md per the format in your system prompt
  4. write_file {skills_base}/{tech_stack}/<skill_name>/SKILL.md
  5. Move to the NEXT skill and repeat

CRITICAL protocol rules:
- MUST call write_file for SKILL.md after EACH skill before moving on.
- Do NOT include the `capability:` field — step 3 will insert it.
- Reporting completion only via response text is a protocol violation.
- When the batch is fully processed, reply with a short JSON status
  listing the paths written."""

STEP_3_NUDGE = """\
Begin **Step 3/3: mark capability** for THIS BATCH.

Batch skills (process EXACTLY these, in order): {skill_names}

For EACH skill in the batch list, run this loop ONE SKILL AT A TIME:
  1. read_file the SKILL.md you wrote in step 2 for THIS skill
  2. pick 1-3 capability keys from the taxonomy in your system prompt
  3. write_file the SKILL.md back with the `capability: [...]` line
     inserted into frontmatter (right after `language` or `tech_stack`).
  4. Move to the NEXT skill and repeat

CRITICAL protocol rules:
- MUST call write_file after EACH skill before moving on.
- Reporting only via response text is a protocol violation.
- When done, reply with a short JSON status:
  `{{"status":"ok","marked":[{{"path":"...","capability":[...]}}]}}`."""


# ---------------------------------------------------------------------------
# Tool whitelists per conversation
# ---------------------------------------------------------------------------
PLAN_TOOLS = ["list_skills", "web_search", "web_fetch", "read_file", "write_file"]
BUILD_TOOLS = ["read_file", "write_file", "list_files", "run_shell"]


# ---------------------------------------------------------------------------
# Generic tool loop with soft-abort + step-boundary salvage
# ---------------------------------------------------------------------------
def _format_salvage(reason: str, msg, budget_info: str = "") -> str:
    """Build an [ABORTED] payload from the last assistant message."""
    if msg is None:
        return ""
    content = msg.content or ""
    reasoning = getattr(msg, "reasoning_content", None) or ""
    if not content and not reasoning:
        return ""
    header = f"[ABORTED at {reason}"
    if budget_info:
        header += f" {budget_info}"
    header += " — partial output below]"
    parts = [header]
    if content:
        parts.append("[content]:")
        parts.append(content)
    if reasoning:
        parts.append("[reasoning_content]:")
        parts.append(reasoning)
    return "\n\n".join(parts)


def run_tool_loop(
    adapter,
    messages: list[dict],
    tools: list[dict] | None,
    stats: StageStats,
    *,
    max_iterations: int = 30,
    max_tokens: int = 8192,
    max_tool_calls: int,
    recorder: StageRecorder | None = None,
) -> tuple[str, dict | None]:
    """Drive a tool-using conversation until the model emits final text.

    Returns ``(final_text, abort_info)``.

    ``abort_info`` is None on a clean finish; on soft-abort it contains
    ``{"reason": ..., "salvaged": True/False}`` so the caller can decide
    whether to keep advancing through subsequent build steps.

    The function MUTATES ``messages`` (appends assistant + tool messages)
    and ``stats`` (cumulative counters). The caller can therefore call it
    repeatedly with the same messages array to walk through multiple
    user-nudge-driven steps.
    """
    final_text = ""
    consecutive_failures = 0
    budget_warning_issued = False
    last_msg = None

    starting_tool_calls = stats.tool_calls

    for iteration in range(max_iterations):
        response = adapter.create_message(
            messages=messages,
            tools=tools,
            max_tokens=max_tokens,
        )
        stats.requests += 1

        usage = adapter.extract_usage(response)
        stats.prompt_tokens += usage["prompt_tokens"]
        stats.completion_tokens += usage["completion_tokens"]
        stats.cached_tokens += usage["cached_tokens"]
        stats.cache_write_tokens += usage["cache_write_tokens"]

        choice = response.choices[0]
        msg = choice.message
        last_msg = msg

        # Pure-text completion → done
        if msg.content and not msg.tool_calls:
            final_text = msg.content
            messages.append(adapter.serialize_assistant_message(msg))
            if recorder:
                recorder.log_assistant(
                    content=msg.content,
                    reasoning_content=getattr(msg, "reasoning_content", None),
                )
            return final_text, None

        # Tool calls → execute, feed back, continue
        if msg.tool_calls:
            stats.tool_calls += len(msg.tool_calls)

            tool_results = []
            any_success = False
            for tc in msg.tool_calls:
                result = execute_tool(tc)
                result_str = str(result)
                tool_results.append((tc, result_str))
                if not result_str.startswith("Error"):
                    any_success = True
            consecutive_failures = 0 if any_success else consecutive_failures + 1

            assistant_entry = adapter.serialize_assistant_message(msg)
            messages.append(assistant_entry)
            if recorder:
                recorder.log_assistant(
                    content=msg.content,
                    tool_calls=assistant_entry.get("tool_calls"),
                    reasoning_content=getattr(msg, "reasoning_content", None),
                )

            for tc, result_str in tool_results:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result_str,
                })
                if recorder:
                    recorder.log_tool_result(
                        tool_call_id=tc.id,
                        name=tc.function.name,
                        content=result_str,
                    )

            # ── Soft-abort: tool-call budget ─────────────────────────
            if stats.tool_calls >= max_tool_calls:
                if not budget_warning_issued:
                    budget_warning_issued = True
                    nudge = (
                        f"You have made {stats.tool_calls} tool calls, "
                        f"reaching the budget of {max_tool_calls}. Provide "
                        "your final answer NOW based on what you have. Do "
                        "NOT call any more tools — output the final JSON "
                        "(or whatever this step requires) directly in your "
                        "next message."
                    )
                    messages.append({"role": "system", "content": nudge})
                    if recorder:
                        recorder.log_meta(
                            f"tool-budget reached "
                            f"({stats.tool_calls}/{max_tool_calls}); "
                            "issuing final-answer nudge"
                        )
                    continue

                # Already nudged once and the model still calls tools.
                stats.aborted_reason = "tool_call_limit"
                stats.tool_call_limit_hit = True
                salvaged = _format_salvage(
                    "tool_call_limit",
                    msg,
                    f"({stats.tool_calls}/{max_tool_calls})",
                )
                if salvaged:
                    final_text = salvaged
                if recorder:
                    recorder.log_meta(
                        f"soft-abort: tool_call_limit "
                        f"({stats.tool_calls}/{max_tool_calls})"
                    )
                    recorder.log_abort_marker(
                        "tool_call_limit",
                        tool_calls_at_abort=stats.tool_calls,
                        max_tool_calls=max_tool_calls,
                        salvaged_content_chars=len(msg.content or ""),
                        salvaged_reasoning_chars=len(
                            getattr(msg, "reasoning_content", None) or ""
                        ),
                    )
                return final_text, {"reason": "tool_call_limit", "salvaged": bool(salvaged)}

            if consecutive_failures >= 2:
                fail_nudge = (
                    "Several of your tool calls have failed. Stop using "
                    "tools and produce your final reply now with what you "
                    "have. If you cannot complete the task, output "
                    '{"status": "partial", "error": "tool failures"}.'
                )
                messages.append({"role": "user", "content": fail_nudge})
                if recorder:
                    recorder.log_user(fail_nudge)

            continue

        if choice.finish_reason == "stop":
            if msg.content:
                final_text = msg.content
                if recorder:
                    recorder.log_assistant(content=msg.content)
            return final_text, None

    # Iteration limit
    if not stats.aborted_reason:
        stats.aborted_reason = "iteration_limit"
        salvaged = _format_salvage(
            "iteration_limit", last_msg, f"({max_iterations} iters)"
        )
        if salvaged and not final_text:
            final_text = salvaged
        if recorder:
            recorder.log_meta(f"soft-abort: iteration_limit ({max_iterations})")
            if last_msg is not None:
                recorder.log_abort_marker(
                    "iteration_limit",
                    max_iterations=max_iterations,
                    tool_calls_at_abort=stats.tool_calls,
                    salvaged_content_chars=len(last_msg.content or ""),
                    salvaged_reasoning_chars=len(
                        getattr(last_msg, "reasoning_content", None) or ""
                    ),
                )
    return final_text, {"reason": "iteration_limit", "salvaged": bool(final_text)}


# ---------------------------------------------------------------------------
# Stage 1: plan
# ---------------------------------------------------------------------------
def _list_existing_skills(skills_base: str) -> list[str]:
    """Enumerate existing top-level skill dirs under skills_base.

    Returns a flat list of "<tech>/<skill>" identifiers (when nested) or
    just "<skill>" (when not). Quiet on missing path.
    """
    base = Path(skills_base)
    if not base.exists():
        return []
    out: list[str] = []
    try:
        for tech_dir in sorted(base.iterdir()):
            if not tech_dir.is_dir() or tech_dir.name.startswith("."):
                continue
            # Direct SKILL.md (flat layout)
            if (tech_dir / "SKILL.md").exists():
                out.append(tech_dir.name)
                continue
            # Nested: <tech>/<skill>/SKILL.md
            for sub in sorted(tech_dir.iterdir()):
                if sub.is_dir() and (sub / "SKILL.md").exists():
                    out.append(f"{tech_dir.name}/{sub.name}")
    except OSError:
        pass
    return out


def run_plan(
    adapter,
    intent: str,
    plan_dir: Path,
    skills_base: str,
    recorder: StageRecorder,
    *,
    tool_budget: int,
    max_iterations: int = 25,
    max_tokens: int = 8192,
) -> tuple[StageStats, dict]:
    """Run the plan conversation. Returns (stats, plan_dict).

    The plan stage now interprets a natural-language ``intent`` instead
    of a bare tech_stack slug. The LLM is responsible for inferring a
    clean ``tech_stack`` slug from the intent and emitting it in
    plan.json — downstream stages read it from there.
    """
    stats = StageStats(stage="plan")
    plan_path = plan_dir / "plan.json"
    plan_dir.mkdir(parents=True, exist_ok=True)

    existing_skills = _list_existing_skills(skills_base)

    system_messages = adapter.build_system(PLAN_PROMPT)
    user_msg = json.dumps({
        "intent": intent,
        "existing_skills": existing_skills,
        "plan_path": str(plan_path),
        "skills_base": skills_base,
        "instructions": (
            "Interpret the intent (extract tech_stack slug + "
            "constraints), discover authoritative sources honoring "
            f"every constraint, and persist plan.json to {plan_path} "
            "via write_file. Then reply with a short status JSON."
        ),
    }, indent=2, ensure_ascii=False)

    messages = [*system_messages, {"role": "user", "content": user_msg}]

    # Transcript seed
    for sm in system_messages:
        content = sm.get("content")
        if isinstance(content, list):
            content = "\n\n".join(
                blk.get("text", "") for blk in content if isinstance(blk, dict)
            )
        recorder.log_system(content or "")
    recorder.log_user(user_msg)

    t0 = time.time()
    final_text, _abort = run_tool_loop(
        adapter,
        messages,
        get_tool_defs(PLAN_TOOLS),
        stats,
        max_iterations=max_iterations,
        max_tokens=max_tokens,
        max_tool_calls=tool_budget,
        recorder=recorder,
    )
    stats.elapsed_ms = int((time.time() - t0) * 1000)

    recorder.write_final_output(final_text)
    recorder.write_stats(stats)

    # Load plan.json from disk (the LLM was instructed to persist it).
    plan_dict: dict = {}
    if plan_path.exists():
        try:
            plan_dict = json.loads(plan_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            plan_dict = {}
    if not plan_dict:
        # Salvage: try to extract embedded JSON from final_text.
        plan_dict = _extract_json(final_text) or {}

    return stats, plan_dict


# ---------------------------------------------------------------------------
# Stage 2: fetch (pure script, no LLM)
# ---------------------------------------------------------------------------
def _slugify(url: str, fallback: str) -> str:
    """Turn a URL into a sane filename. Strips schema, replaces / with -."""
    parsed = urlparse(url)
    path = parsed.path.strip("/").rsplit("/", 1)[-1]
    if not path or path in {".", ".."}:
        path = fallback
    # Drop query / fragment
    name = re.sub(r"[^a-zA-Z0-9._-]+", "-", path).strip("-")
    if not name:
        name = fallback
    if not name.endswith((".md", ".txt", ".rst", ".json")):
        name += ".md"
    return name


def run_fetch(
    plan: dict,
    raw_dir: Path,
    fetch_logger: FetchLogger,
) -> dict:
    """Pure-Python fetch. Returns aggregate stats dict."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    files_count = 0
    bytes_total = 0
    failures: list[dict] = []

    skills = plan.get("skills") or []
    for skill in skills:
        name = skill.get("name") or ""
        if not name:
            continue
        skill_dir = raw_dir / name
        skill_dir.mkdir(parents=True, exist_ok=True)

        urls: list[tuple[str, str]] = []  # (url, role)
        primary = skill.get("primary")
        if primary:
            urls.append((primary, "primary"))
        for u in skill.get("complements", []) or []:
            urls.append((u, "complement"))

        for idx, (url, role) in enumerate(urls):
            fname = _slugify(url, f"{role}-{idx:02d}")
            # Avoid filename collisions
            target = skill_dir / fname
            if target.exists():
                stem = target.stem
                target = skill_dir / f"{stem}-{idx:02d}{target.suffix}"

            try:
                content = tool_web_fetch(url)
                if isinstance(content, str) and content.startswith('{"error"'):
                    raise RuntimeError(content)
                target.write_text(content, encoding="utf-8")
                size = target.stat().st_size
                files_count += 1
                bytes_total += size
                fetch_logger.log(
                    skill=name,
                    role=role,
                    url=url,
                    status="ok",
                    bytes=size,
                    path=str(target),
                )
            except Exception as e:
                failures.append({
                    "skill": name,
                    "url": url,
                    "role": role,
                    "error": str(e),
                })
                fetch_logger.log(
                    skill=name,
                    role=role,
                    url=url,
                    status="error",
                    error=str(e),
                )

    stats = {
        "files_count": files_count,
        "bytes_total": bytes_total,
        "failures": failures,
        "elapsed_ms": int((time.time() - t0) * 1000),
    }
    fetch_logger.write_stats(stats)
    return stats


# ---------------------------------------------------------------------------
# Stage 3: build (single conversation, 3 inner steps)
# ---------------------------------------------------------------------------
def run_build(
    adapter,
    batch_skills: list[dict],
    raw_dir: Path,
    cleaned_dir: Path,
    skills_base: str,
    tech_stack: str,
    plan_path: Path,
    recorder: StageRecorder,
    *,
    batch_idx: int = 0,
    tool_budget_multiplier: float = 1.0,
    max_iterations_per_step: int = 30,
    max_tokens: int = 8192,
    build_prompt: str | None = None,
) -> tuple[StageStats, list[dict]]:
    """Run a single build conversation for ONE BATCH of skills.

    The conversation walks the standard 3 inner steps but only operates
    on the skills in ``batch_skills``. A separate ``run_build`` call (and
    therefore a fresh messages array) is made per batch — the system
    prompt is byte-identical so prefix caching still hits across batches.

    Returns (stats, skill_outputs) for THIS BATCH only.
    """
    cleaned_dir.mkdir(parents=True, exist_ok=True)

    stats = StageStats(stage=f"build_batch_{batch_idx}")
    # Use injected, catalog-rendered BUILD_PROMPT if provided; else fall
    # back to the unrendered template (only smoke-tests hit this path).
    effective_prompt = build_prompt if build_prompt is not None else BUILD_PROMPT
    system_messages = adapter.build_system(effective_prompt)
    messages = list(system_messages)

    # Transcript seed
    for sm in system_messages:
        content = sm.get("content")
        if isinstance(content, list):
            content = "\n\n".join(
                blk.get("text", "") for blk in content if isinstance(blk, dict)
            )
        recorder.log_system(content or "")

    tools = get_tool_defs(BUILD_TOOLS)

    skill_names = [s.get("name", "") for s in batch_skills if s.get("name")]
    skill_names_repr = json.dumps(skill_names, ensure_ascii=False)
    n = len(skill_names)

    recorder.log_meta(
        f"batch {batch_idx}: {n} skills = {skill_names_repr}"
    )

    b1 = compute_step_budget("build_step_1", n, tool_budget_multiplier)
    b2 = compute_step_budget("build_step_2", n, tool_budget_multiplier)
    b3 = compute_step_budget("build_step_3", n, tool_budget_multiplier)

    step_specs = [
        ("step_1_preprocess", STEP_1_NUDGE.format(
            raw_dir=str(raw_dir),
            cleaned_dir=str(cleaned_dir),
            plan_path=str(plan_path),
            skill_names=skill_names_repr,
        ), b1),
        ("step_2_build", STEP_2_NUDGE.format(
            cleaned_dir=str(cleaned_dir),
            skills_base=skills_base,
            tech_stack=tech_stack,
            skill_names=skill_names_repr,
        ), b2),
        ("step_3_mark", STEP_3_NUDGE.format(
            skill_names=skill_names_repr,
        ), b3),
    ]

    t0 = time.time()
    last_final_text = ""
    cumulative_budget = 0
    aborted_in_step: str | None = None

    for step_name, nudge, step_budget in step_specs:
        snapshot_before = stats.snapshot()
        recorder.log_step_boundary(step_name, snapshot_before)

        messages.append({"role": "user", "content": nudge})
        recorder.log_user(nudge)

        cumulative_budget += step_budget

        final_text, abort_info = run_tool_loop(
            adapter,
            messages,
            tools,
            stats,
            max_iterations=max_iterations_per_step,
            max_tokens=max_tokens,
            max_tool_calls=cumulative_budget,
            recorder=recorder,
        )
        if final_text:
            last_final_text = final_text

        snapshot_after = stats.snapshot()
        slice_dict = {"step": step_name, "budget": step_budget}
        for k, v in snapshot_after.items():
            slice_dict[k] = v - snapshot_before[k]
        if abort_info:
            slice_dict["aborted"] = abort_info["reason"]
        stats.step_slices.append(slice_dict)

        if abort_info:
            aborted_in_step = step_name
            break

    stats.elapsed_ms = int((time.time() - t0) * 1000)
    if aborted_in_step and not stats.aborted_reason:
        stats.aborted_reason = f"aborted_in_{aborted_in_step}"

    recorder.write_final_output(last_final_text)
    recorder.write_stats(stats)

    # Discover SKILL.md outputs for THIS BATCH only.
    skill_outputs: list[dict] = []
    for skill in batch_skills:
        name = skill.get("name", "")
        if not name:
            continue
        skill_md = Path(skills_base) / tech_stack / name / "SKILL.md"
        exists = skill_md.exists()
        skill_outputs.append({
            "name": name,
            "path": str(skill_md),
            "exists": exists,
            "size": skill_md.stat().st_size if exists else 0,
            "batch_idx": batch_idx,
            "skill_status": (
                "success" if exists
                else ("aborted" if aborted_in_step else "error")
            ),
        })
    return stats, skill_outputs


# ---------------------------------------------------------------------------
# Pipeline orchestration
# ---------------------------------------------------------------------------
DEFAULT_RUNS_DIR = str(Path(__file__).resolve().parent / "runs")


_TECH_SLUG_RE = re.compile(r"[^a-z0-9-]+")


def _normalize_tech_slug(raw: str | None) -> str:
    """Force a tech_stack value into a safe filesystem slug."""
    if not raw:
        return "unknown"
    s = str(raw).strip().lower().replace(" ", "-").replace("/", "-")
    s = _TECH_SLUG_RE.sub("-", s).strip("-")
    return s or "unknown"


def run_pipeline(
    adapter: DeepSeekAdapter | QwenAdapter,
    intent: str,
    output_dir: str = "/tmp/skill-src",
    skills_base: str | None = None,
    runs_dir: str | None = None,
    tool_budget_multiplier: float = 1.0,
    max_skills: int = 0,
) -> PipelineStats:
    """Run the full 3-stage distillation pipeline.

    ``intent`` is a natural-language request. The plan stage extracts a
    filesystem-safe tech_stack slug from the intent; downstream stages
    use that slug for workspace + skills_base path layout.
    """
    if skills_base is None:
        skills_base = os.environ.get("SKILL_LIBRARY_PATH")
    if not skills_base:
        raise RuntimeError(
            "skills_base unset: pass --skills-base or export "
            "SKILL_LIBRARY_PATH. Recommended: "
            "/Users/mhbzhy/claude-config/skills (the technical knowledge "
            "library indexed by mcp/skill-catalog). The legacy default "
            "~/.claude/skills is no longer auto-applied."
        )

    # Load authoritative tag catalog. Hard-fail if missing — distillation
    # without a closed-set taxonomy would let the LLM invent tags.
    tag_catalog = load_tag_catalog(skills_base)
    rendered_build_prompt = build_prompt_with_catalog(tag_catalog)

    runs_root = runs_dir or DEFAULT_RUNS_DIR
    recorder = RunRecorder(runs_root)
    print(f"  Run dir:  {recorder.root}")

    # The tech_stack slug isn't known until the plan stage finishes. We
    # write the plan into a staging path keyed by run_id, then move /
    # mirror into the canonical <output_dir>/<tech>/ once known.
    staging_root = Path(output_dir) / f"_staging-{recorder.run_id}"
    staging_root.mkdir(parents=True, exist_ok=True)

    plan_budget = max(1, int(round(PLAN_TOOL_BUDGET * tool_budget_multiplier)))
    config_dict = {
        "run_id": recorder.run_id,
        "provider": adapter.name,
        "model": adapter.model,
        "intent": intent,
        "output_dir": output_dir,
        "skills_base": skills_base,
        "runs_dir": runs_root,
        "tool_budget_multiplier": tool_budget_multiplier,
        "plan_tool_budget": plan_budget,
        "build_budget_formula": {
            "step_1": "8 + 7*N",
            "step_2": "5 + 4*N",
            "step_3": "4 + 3*N",
            "multiplier": tool_budget_multiplier,
            "note": "N = number of skills in the batch",
        },
        "build_batch_size": None,  # set after plan stage from plan_dict
        "max_skills": max_skills,
        "schema_version": 2,
    }
    recorder.write_config(config_dict)

    stats = PipelineStats(
        provider=adapter.name,
        model=adapter.model,
        tech_stack="(pending-plan)",
    )

    plan_skill_names: list[str] = []
    skill_outputs: list[dict] = []
    build_batches_summary: list[dict] = []

    def _flush() -> None:
        summary = stats.to_summary_dict(
            run_id=recorder.run_id,
            config=config_dict,
            plan_skill_names=plan_skill_names,
            skill_outputs=skill_outputs,
        )
        # Inject per-batch build details. ``stats.build_stats`` already
        # holds the merged totals (see ``run_pipeline`` build block).
        if build_batches_summary:
            existing_build = summary.get("build") or {}
            existing_build = dict(existing_build) if isinstance(existing_build, dict) else {}
            existing_build["batches"] = build_batches_summary
            summary["build"] = existing_build
        recorder.flush_summary(summary)

    # ── Stage 1: plan ─────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  Stage 1/3: plan — interpreting intent + discovering sources")
    print(f"  Intent: {intent[:120]}{'…' if len(intent) > 120 else ''}")
    print(f"{'='*60}")
    plan_recorder = recorder.stage("plan")
    plan_stats, plan_dict = run_plan(
        adapter,
        intent,
        staging_root,
        skills_base,
        plan_recorder,
        tool_budget=plan_budget,
    )
    stats.plan_stats = plan_stats

    # Extract tech_stack slug from plan and relocate workspace.
    tech_stack = _normalize_tech_slug(plan_dict.get("tech_stack"))
    plan_dict["tech_stack"] = tech_stack
    stats.tech_stack = tech_stack
    config_dict["tech_stack"] = tech_stack
    config_dict["intent_summary"] = plan_dict.get("intent_summary", "")
    config_dict["constraints"] = plan_dict.get("constraints", []) or []

    # build_batch_size now comes from the plan LLM (it knows skill count
    # + avg estimated_tokens). Fallback to 3 if missing for back-compat.
    raw_bbs = plan_dict.get("build_batch_size")
    if isinstance(raw_bbs, int) and raw_bbs > 0:
        build_batch_size = raw_bbs
    else:
        import sys as _sys
        print(
            f"  WARN: plan.json missing/invalid build_batch_size "
            f"({raw_bbs!r}); falling back to 3",
            file=_sys.stderr,
        )
        build_batch_size = 3
    config_dict["build_batch_size"] = build_batch_size
    config_dict["build_batch_rationale"] = plan_dict.get(
        "build_batch_rationale", ""
    )

    work_root = Path(output_dir) / tech_stack
    work_root.mkdir(parents=True, exist_ok=True)
    plan_dir = work_root
    raw_dir = work_root / "raw"
    cleaned_dir = work_root / "cleaned"
    plan_path = plan_dir / "plan.json"

    # Apply --max-skills truncation
    raw_skills = plan_dict.get("skills", []) or []
    original_count = len(raw_skills)
    if max_skills > 0 and original_count > max_skills:
        plan_dict["skills"] = raw_skills[:max_skills]
        print(f"  --max-skills {max_skills}: truncated from {original_count} skills")

    # Always persist the (possibly enriched / truncated) plan to the
    # canonical workspace path so the build stage reads from disk.
    plan_path.write_text(
        json.dumps(plan_dict, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    plan_skill_names.extend(s.get("name", "") for s in plan_dict.get("skills", []))
    config_dict["original_skill_count"] = original_count
    config_dict["executed_skill_count"] = len(plan_skill_names)
    recorder.write_config(config_dict)

    print(f"  Plan: {len(plan_skill_names)} skills "
          f"(prompt={plan_stats.prompt_tokens} cached={plan_stats.cached_tokens} "
          f"completion={plan_stats.completion_tokens} "
          f"tool_calls={plan_stats.tool_calls})"
          + (f" abort={plan_stats.aborted_reason}" if plan_stats.aborted_reason else ""))
    _flush()

    if not plan_skill_names:
        print("  Plan produced no skills — aborting downstream stages.")
        _flush()
        return stats

    # ── Stage 2: fetch ────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  Stage 2/3: fetch — downloading sources (pure script)")
    print(f"{'='*60}")
    fetch_logger = recorder.fetch_logger()
    fetch_stats = run_fetch(plan_dict, raw_dir, fetch_logger)
    stats.fetch_stats = fetch_stats
    stats.source_text_chars = fetch_stats["bytes_total"]
    print(f"  Fetched: files={fetch_stats['files_count']} "
          f"bytes={fetch_stats['bytes_total']:,} "
          f"failures={len(fetch_stats['failures'])} "
          f"time={fetch_stats['elapsed_ms']}ms")
    _flush()

    if fetch_stats["files_count"] == 0:
        print("  Fetch produced 0 files — skipping build.")
        _flush()
        return stats

    # ── Stage 3: build (per-batch conversations) ─────────────────
    plan_skills_full = plan_dict.get("skills", []) or []
    if build_batch_size and build_batch_size > 0:
        batches = [
            plan_skills_full[i : i + build_batch_size]
            for i in range(0, len(plan_skills_full), build_batch_size)
        ]
    else:
        # 0 = single-conversation fallback (legacy behavior)
        batches = [plan_skills_full] if plan_skills_full else []

    print(f"\n{'='*60}")
    print(f"  Stage 3/3: build — {len(batches)} batch(es), "
          f"batch_size={build_batch_size or 'unbounded'}")
    print(f"{'='*60}")

    # Merged StageStats so the existing summary serialization (which
    # expects a single ``build`` stage block) keeps working.
    merged_build = StageStats(stage="build")

    for batch_idx, batch in enumerate(batches):
        batch_skill_names = [s.get("name", "") for s in batch if s.get("name")]
        if not batch_skill_names:
            continue

        print(f"\n  -- batch {batch_idx + 1}/{len(batches)}: "
              f"{len(batch_skill_names)} skill(s) = {batch_skill_names}")

        # Sub-stage dir: build/batch_<N>/
        batch_recorder = recorder.stage(f"build/batch_{batch_idx}")

        try:
            batch_stats, batch_outputs = run_build(
                adapter,
                batch,
                raw_dir,
                cleaned_dir,
                skills_base,
                tech_stack,
                plan_path,
                batch_recorder,
                batch_idx=batch_idx,
                tool_budget_multiplier=tool_budget_multiplier,
                build_prompt=rendered_build_prompt,
            )
        except Exception as exc:  # noqa: BLE001
            # Degraded tolerance: a batch failure should not kill the run.
            print(f"     batch {batch_idx} failed: {exc}")
            build_batches_summary.append({
                "batch_idx": batch_idx,
                "skills": batch_skill_names,
                "error": str(exc),
                "skill_status": "error",
            })
            for s in batch:
                name = s.get("name", "")
                if not name:
                    continue
                skill_md = Path(skills_base) / tech_stack / name / "SKILL.md"
                skill_outputs.append({
                    "name": name,
                    "path": str(skill_md),
                    "exists": skill_md.exists(),
                    "size": skill_md.stat().st_size if skill_md.exists() else 0,
                    "batch_idx": batch_idx,
                    "skill_status": "error",
                })
            _flush()
            continue

        # Accumulate into merged build stats
        merged_build.prompt_tokens += batch_stats.prompt_tokens
        merged_build.completion_tokens += batch_stats.completion_tokens
        merged_build.cached_tokens += batch_stats.cached_tokens
        merged_build.cache_write_tokens += batch_stats.cache_write_tokens
        merged_build.requests += batch_stats.requests
        merged_build.tool_calls += batch_stats.tool_calls
        merged_build.elapsed_ms += batch_stats.elapsed_ms
        if batch_stats.tool_call_limit_hit:
            merged_build.tool_call_limit_hit = True
        if batch_stats.aborted_reason and not merged_build.aborted_reason:
            merged_build.aborted_reason = (
                f"batch_{batch_idx}:{batch_stats.aborted_reason}"
            )
        # Tag step slices with batch index for transparency
        for sl in batch_stats.step_slices:
            tagged = dict(sl)
            tagged["batch_idx"] = batch_idx
            merged_build.step_slices.append(tagged)

        skill_outputs.extend(batch_outputs)

        build_batches_summary.append({
            "batch_idx": batch_idx,
            "skills": batch_skill_names,
            "stage_stats": {
                "prompt_tokens": batch_stats.prompt_tokens,
                "completion_tokens": batch_stats.completion_tokens,
                "cached_tokens": batch_stats.cached_tokens,
                "cache_write_tokens": batch_stats.cache_write_tokens,
                "cache_hit_rate": round(batch_stats.cache_hit_rate, 4),
                "requests": batch_stats.requests,
                "tool_calls": batch_stats.tool_calls,
                "elapsed_ms": batch_stats.elapsed_ms,
                "aborted_reason": batch_stats.aborted_reason,
                "tool_call_limit_hit": batch_stats.tool_call_limit_hit,
            },
            "step_slices": batch_stats.step_slices,
            "skill_outputs": batch_outputs,
        })

        created_in_batch = sum(1 for s in batch_outputs if s.get("exists"))
        print(f"     batch {batch_idx}: created={created_in_batch}/{len(batch_outputs)} "
              f"prompt={batch_stats.prompt_tokens} "
              f"cached={batch_stats.cached_tokens} "
              f"completion={batch_stats.completion_tokens} "
              f"tool_calls={batch_stats.tool_calls}"
              + (f" abort={batch_stats.aborted_reason}"
                 if batch_stats.aborted_reason else ""))

        # Persist incremental progress per batch
        stats.build_stats = merged_build
        stats.skills_created = sum(1 for s in skill_outputs if s.get("exists"))
        _flush()

    stats.build_stats = merged_build
    stats.skills_created = sum(1 for s in skill_outputs if s.get("exists"))

    # Post-build: auto-append any new tag values to the authoritative catalog.
    try:
        appended = auto_append_new_tags(skills_base, skill_outputs)
    except Exception as e:  # noqa: BLE001
        print(f"  WARN: auto_append_new_tags failed: {e}", file=sys.stderr)
        appended = {"capability": [], "tech_stack": []}
    config_dict["new_tags_appended"] = appended
    recorder.write_config(config_dict)

    print(f"\n  Build TOTAL: SKILL.md created={stats.skills_created}/{len(skill_outputs)} "
          f"prompt={merged_build.prompt_tokens} cached={merged_build.cached_tokens} "
          f"completion={merged_build.completion_tokens} "
          f"tool_calls={merged_build.tool_calls}"
          + (f" abort={merged_build.aborted_reason}"
             if merged_build.aborted_reason else ""))
    _flush()
    return stats


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _extract_json(text: str) -> dict:
    """Extract a JSON object from LLM output that may have markdown fences."""
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return {}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Skill distillation pipeline — 3-stage (plan/fetch/build)"
    )
    parser.add_argument(
        "--intent",
        required=True,
        help=(
            "Natural-language distillation intent. "
            "Should describe the target tech stack and any "
            "focus / skip / granularity / size constraints. "
            "Example: 'distill antd form components, focus on "
            "Form/Input/Select, skip Calendar/Charts'."
        ),
    )
    parser.add_argument(
        "--model",
        help=(
            "Model name override. Falls back to $DISTILL_MODEL, then to "
            "the provider's built-in default."
        ),
    )
    parser.add_argument(
        "--output-dir",
        default="/tmp/skill-src",
        help="Temp root for raw + cleaned material (default: /tmp/skill-src)",
    )
    parser.add_argument(
        "--skills-base",
        help=(
            "Output dir for SKILL.md files. Falls back to "
            "$SKILL_LIBRARY_PATH if unset. NO implicit default — must "
            "be provided one way or another. Recommended: "
            "/Users/mhbzhy/claude-config/skills (the technical knowledge "
            "library indexed by mcp/skill-catalog)."
        ),
    )
    parser.add_argument(
        "--runs-dir",
        default=None,
        help=f"Per-run persistence dir. Default: {DEFAULT_RUNS_DIR}",
    )
    parser.add_argument(
        "--tool-budget-multiplier",
        type=float,
        default=1.0,
        help=(
            "Global multiplier over TOOL_BUDGETS "
            f"({TOOL_BUDGETS}). 1.0 = defaults; 0.5 halves; "
            "2.0 doubles. Default 1.0"
        ),
    )
    parser.add_argument(
        "--max-skills",
        type=int,
        default=0,
        help=(
            "Truncate plan to first N skills (0 = no truncation). "
            "For testing/debugging only; do not use in production calls."
        ),
    )
    args = parser.parse_args()

    # ── Resolve provider + api_key from .env (CLI no longer accepts them) ──
    provider = os.environ.get("DISTILL_PROVIDER", "").strip().lower()
    if provider not in {"deepseek", "qwen"}:
        raise SystemExit(
            "ERROR: DISTILL_PROVIDER missing or invalid in environment "
            f"(got {provider!r}; expected 'deepseek' or 'qwen').\n\n"
            "Configure it in /Users/mhbzhy/claude-config/distill/.env\n"
            "See /Users/mhbzhy/claude-config/distill/.env.example for "
            "a template."
        )

    if provider == "deepseek":
        api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
        key_var = "DEEPSEEK_API_KEY"
    else:  # qwen
        api_key = os.environ.get("DASHSCOPE_API_KEY", "").strip()
        key_var = "DASHSCOPE_API_KEY"

    if not api_key:
        raise SystemExit(
            f"ERROR: {key_var} missing in environment (required when "
            f"DISTILL_PROVIDER={provider}).\n\n"
            "Configure it in /Users/mhbzhy/claude-config/distill/.env\n"
            "See /Users/mhbzhy/claude-config/distill/.env.example for "
            "a template."
        )

    # CLI --model overrides $DISTILL_MODEL which overrides adapter default.
    model = args.model or os.environ.get("DISTILL_MODEL") or None

    from adapter import create_adapter

    adapter = create_adapter(
        provider=provider,
        model=model,
        api_key=api_key,
    )

    print("\n  Pipeline: skill-distill v0.4 (intent-driven, 3-stage, env-config)")
    print(f"  Provider: {provider} ({adapter.model})")
    print(f"  Intent:   {args.intent}")
    print(f"  Temp:     {args.output_dir}")

    stats = run_pipeline(
        adapter=adapter,
        intent=args.intent,
        output_dir=args.output_dir,
        skills_base=args.skills_base,
        runs_dir=args.runs_dir,
        tool_budget_multiplier=args.tool_budget_multiplier,
        max_skills=args.max_skills,
    )

    print("\n" + stats.report())


if __name__ == "__main__":
    main()

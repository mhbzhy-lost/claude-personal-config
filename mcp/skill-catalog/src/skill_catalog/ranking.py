"""Pure-script scoring & top-N truncation for skill candidates.

No LLM. Score = tech_stack overlap + capability overlap + description fuzzy
match against the user prompt. The caller is expected to have already fetched
candidates via ``SkillCatalog.list_skills``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


TECH_WEIGHT = 2.0
CAP_WEIGHT = 1.5
DESC_KEYWORD_WEIGHT = 0.5

_DEFAULT_KEYWORD_CAP = 3


# Minimal stopword list — intentionally conservative to avoid dropping useful
# domain terms. Both English and Chinese common particles.
_STOPWORDS = {
    # en
    "the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "with",
    "is", "are", "be", "this", "that", "it", "as", "at", "by", "from",
    "use", "using", "make", "do", "need", "want",
    # zh
    "的", "了", "和", "与", "或", "是", "在", "我", "你", "他", "她",
    "一个", "一下", "请", "帮", "如何", "怎么", "怎样", "需要", "想要",
    "实现", "做", "写", "用", "给", "把", "这个", "那个",
}


@dataclass
class RankedSkill:
    name: str
    score: float
    matched_tags: list[str] = field(default_factory=list)
    description: str = ""


# ---------------------------------------------------------------------------
# keyword extraction
# ---------------------------------------------------------------------------


_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9_\-]+|[一-鿿]+")


def extract_user_keywords(user_prompt: str, top_k: int = _DEFAULT_KEYWORD_CAP) -> list[str]:
    """Extract up to *top_k* high-signal keywords from *user_prompt*.

    Rules (intentionally simple, no external deps):
    - Tokenise on regex: ASCII words (len>=2) and runs of CJK chars.
    - Drop stopwords (case-insensitive for ASCII).
    - For CJK runs longer than 4 chars, keep sub-windows of length 2-4.
    - Rank by (frequency desc, length desc, first-occurrence asc) and take top_k.
    """
    if not user_prompt or top_k <= 0:
        return []

    raw_tokens = _TOKEN_RE.findall(user_prompt)

    tokens: list[str] = []
    for tok in raw_tokens:
        if not tok:
            continue
        lower = tok.lower()
        if lower in _STOPWORDS:
            continue
        if tok and tok[0] < "一":
            # ASCII token
            if len(tok) < 2:
                continue
            tokens.append(tok)
        else:
            # CJK run — try to split useful 2-4 char windows if the run is long,
            # otherwise keep the whole run.
            if len(tok) <= 4:
                tokens.append(tok)
            else:
                # keep whole run plus sliding 2-gram windows so common
                # domain phrases ("三级联动", "数据看板") still surface.
                tokens.append(tok)
                for size in (4, 3, 2):
                    for i in range(0, len(tok) - size + 1):
                        sub = tok[i : i + size]
                        if sub not in _STOPWORDS:
                            tokens.append(sub)

    if not tokens:
        return []

    freq: dict[str, int] = {}
    first_pos: dict[str, int] = {}
    for i, t in enumerate(tokens):
        freq[t] = freq.get(t, 0) + 1
        first_pos.setdefault(t, i)

    ranked = sorted(
        freq.keys(),
        key=lambda k: (-freq[k], -len(k), first_pos[k]),
    )
    return ranked[:top_k]


# ---------------------------------------------------------------------------
# scoring
# ---------------------------------------------------------------------------


def rank(
    skills: list[dict],
    tech_stack: list[str],
    capability: list[str],
    user_prompt: str,
) -> list[RankedSkill]:
    """Score and sort *skills*. Returns all candidates sorted by score desc.

    Score components:
      - +TECH_WEIGHT per tech_stack tag intersecting the query
      - +CAP_WEIGHT per capability tag intersecting the query
      - +DESC_KEYWORD_WEIGHT per user-prompt keyword appearing in description
        (case-insensitive substring; first _DEFAULT_KEYWORD_CAP keywords only)
    """
    if not skills:
        return []

    ts_set = {t.lower() for t in (tech_stack or []) if t}
    cap_set = {c.lower() for c in (capability or []) if c}
    keywords = extract_user_keywords(user_prompt or "", _DEFAULT_KEYWORD_CAP)
    kw_lowered = [k.lower() for k in keywords]

    ranked: list[RankedSkill] = []
    for s in skills:
        name = str(s.get("name", ""))
        if not name:
            continue
        skill_ts = {str(t).lower() for t in (s.get("tech_stack") or [])}
        skill_cap = {str(c).lower() for c in (s.get("capability") or [])}
        description = str(s.get("description", "")).lower()

        score = 0.0
        matched: list[str] = []

        for t in ts_set & skill_ts:
            score += TECH_WEIGHT
            matched.append(f"tech:{t}")
        for c in cap_set & skill_cap:
            score += CAP_WEIGHT
            matched.append(f"cap:{c}")
        for kw in kw_lowered:
            if kw and kw in description:
                score += DESC_KEYWORD_WEIGHT
                matched.append(f"kw:{kw}")

        ranked.append(
            RankedSkill(
                name=name,
                score=score,
                matched_tags=matched,
                description=str(s.get("description", "")),
            )
        )

    # stable sort: score desc, then name asc for determinism
    ranked.sort(key=lambda r: (-r.score, r.name))
    return ranked


# ---------------------------------------------------------------------------
# top-N truncation
# ---------------------------------------------------------------------------


FULL_RETURN_THRESHOLD = 35


# match_quality classification threshold for the resolve pipeline.
#
# Score components (see rank() above):
#   - TECH_WEIGHT       = 2.0  per tech_stack tag overlap
#   - CAP_WEIGHT        = 1.5  per capability tag overlap
#   - DESC_KEYWORD_WEIGHT = 0.5 per matched user-prompt keyword
#
# Rationale for the high/low boundary at 2.0:
#   A top-1 score of >= 2.0 means at least one tech_stack tag intersected the
#   query (the strongest signal in this scheme — workspace fingerprint already
#   constrains tech_stack, so a matched tech tag indicates real domain
#   alignment). A single capability hit (1.5) or pure keyword fuzzing
#   (n * 0.5) can occur incidentally and should be treated as "low" — agent
#   should skim descriptions but is allowed to skip get_skill if nothing
#   reads as relevant.
HIGH_MATCH_THRESHOLD = 2.0


def top_n(
    ranked: list[RankedSkill],
    n: int | None = None,
    candidate_count: int | None = None,
) -> list[RankedSkill]:
    """Truncate to top N. If *n* is None, use dynamic rule.

    Dynamic rule (based on *candidate_count*; falls back to ``len(ranked)``):
      - count <= FULL_RETURN_THRESHOLD (35) → return all
      - count >  FULL_RETURN_THRESHOLD      → return first FULL_RETURN_THRESHOLD

    Rationale: an Opus-class consumer handles ~35 same-capability skill entries
    without noticeable attention drift (measured boundary is ~50). Giving it
    the full candidate set with descriptions lets the LLM do the final pick,
    which beats score-based truncation — ranking is a heuristic and alphabetical
    tie-breaks on equal scores otherwise lose rare-capability skills like
    Popover/Popconfirm/Tooltip in large antd-style libraries.
    """
    if not ranked:
        return []

    if n is not None:
        return ranked[: max(0, n)]

    count = candidate_count if candidate_count is not None else len(ranked)
    limit = count if count <= FULL_RETURN_THRESHOLD else FULL_RETURN_THRESHOLD
    return ranked[:limit]

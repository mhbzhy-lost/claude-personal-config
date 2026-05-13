"""Indexes block.json files under BLOCKS_PATH and provides retrieval/search."""

from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Block:
    """Parsed contents of one blocks/<slug>/block.json plus its on-disk root."""

    slug: str
    root: Path
    data: dict

    @property
    def title(self) -> str:
        return self.data.get("title") or self.slug

    @property
    def description(self) -> str:
        return self.data.get("description", "")

    @property
    def kind(self) -> str:
        return self.data.get("kind", "")

    @property
    def capabilities(self) -> list[str]:
        return list(self.data.get("capabilities", []))

    @property
    def tech_stack(self) -> list[str]:
        return list(self.data.get("tech_stack", []))

    @property
    def copyable_root(self) -> Path:
        rel = self.data.get("copyable_root", "component")
        return self.root / rel


@dataclass
class BlockCatalog:
    blocks_path: Path
    by_slug: dict[str, Block] = field(default_factory=dict)

    def reindex(self) -> None:
        self.by_slug.clear()
        for block_json in sorted(self.blocks_path.glob("*/block.json")):
            slug = block_json.parent.name
            try:
                data = json.loads(block_json.read_text())
            except json.JSONDecodeError as e:
                print(f"[block-catalog] skip {slug}: invalid block.json ({e})")
                continue
            self.by_slug[slug] = Block(slug=slug, root=block_json.parent, data=data)

    # ---- listing / lookup ----

    def list_summaries(
        self,
        kind: str | None = None,
        capability: list[str] | None = None,
        tech_stack: list[str] | None = None,
    ) -> list[dict]:
        out = []
        for b in self.by_slug.values():
            if kind and b.kind != kind:
                continue
            if capability and not (set(capability) & set(b.capabilities)):
                continue
            if tech_stack and not (set(tech_stack) & set(b.tech_stack)):
                continue
            out.append(
                {
                    "slug": b.slug,
                    "title": b.title,
                    "title_en": b.data.get("title_en"),
                    "description": b.description,
                    "kind": b.kind,
                    "capabilities": b.capabilities,
                    "tech_stack": b.tech_stack,
                }
            )
        return out

    def get(self, slug: str) -> dict | None:
        b = self.by_slug.get(slug)
        if not b:
            return None
        return {
            "slug": b.slug,
            "root": str(b.root),
            "copyable_root_abs": str(b.copyable_root),
            "consumer_readme_abs": (
                str(b.root / b.data["consumer_readme"])
                if b.data.get("consumer_readme")
                else None
            ),
            "block_json": b.data,
        }

    # ---- search by intent text + tag tolerance ----

    # Latin tokens are word runs; CJK tokens are individual chars.
    # Char-level CJK gives recall on a small catalog without dragging in jieba —
    # e.g. "评论区" → 评/论/区, each looked up against haystack substring.
    _WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9_-]+|[一-鿿]")

    def search(
        self,
        intent: str,
        kind: str | None = None,
        capability: list[str] | None = None,
        tech_stack: list[str] | None = None,
        top_k: int = 5,
    ) -> list[dict]:
        """Tag intersect + keyword frequency ranking. No LLM / embedding."""
        candidates = self.list_summaries(kind=kind, capability=capability, tech_stack=tech_stack)
        if not intent.strip():
            return candidates[:top_k]

        tokens = [t.lower() for t in self._WORD_RE.findall(intent)]
        if not tokens:
            return candidates[:top_k]
        tok_counter = Counter(tokens)

        scored: list[tuple[float, dict]] = []
        for c in candidates:
            haystack = " ".join(
                [
                    c["slug"].replace("-", " "),
                    c["title"],
                    c.get("title_en") or "",
                    c["description"],
                    " ".join(c["capabilities"]),
                    " ".join(c["tech_stack"]),
                ]
            ).lower()
            score = 0.0
            for tok, cnt in tok_counter.items():
                if tok in haystack:
                    score += cnt
                    # boost when token appears in slug / title
                    if tok in c["slug"].lower() or tok in c["title"].lower():
                        score += cnt * 2
            if score > 0:
                scored.append((score, c))

        scored.sort(key=lambda p: p[0], reverse=True)
        return [c for _s, c in scored[:top_k]]

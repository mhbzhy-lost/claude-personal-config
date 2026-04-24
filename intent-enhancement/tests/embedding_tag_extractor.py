"""System B · Embedding-based tech_stack / capability extractor.

Each tag has a hand-written "tag card" (1-3 lines of natural-language
expansion). Query = full input text → bge-m3 embed → cosine against all
tag-card embeddings → threshold θ filter. Threshold is tunable.
"""
from __future__ import annotations

import json
import math
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

# make intent-enhancement src importable
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from retrieval.embedding_client import OllamaEmbeddingClient, OllamaEmbeddingError  # noqa: E402


TAG_CARDS_PATH = Path(__file__).parent / "tag_cards.json"


def _cosine(a: List[float], b: List[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


@dataclass
class EmbedResult:
    tech_stack: List[str] = field(default_factory=list)
    capability: List[str] = field(default_factory=list)
    elapsed_s: float = 0.0
    tech_scores: Dict[str, float] = field(default_factory=dict)
    cap_scores: Dict[str, float] = field(default_factory=dict)


class EmbeddingTagExtractor:
    def __init__(
        self,
        available_tech_stack: Sequence[str],
        available_capability: Sequence[str],
        tag_cards_path: Path = TAG_CARDS_PATH,
        tech_threshold: float = 0.45,
        cap_threshold: float = 0.45,
        client: OllamaEmbeddingClient | None = None,
    ) -> None:
        self._allowed_tech = set(available_tech_stack)
        self._allowed_cap = set(available_capability)
        self.tech_threshold = tech_threshold
        self.cap_threshold = cap_threshold

        cards = json.loads(tag_cards_path.read_text(encoding="utf-8"))
        # only keep cards whose tag is in allowlist; for tags without cards,
        # fall back to tag name only (still embeddable)
        self._tech_cards: Dict[str, str] = {}
        for tag in self._allowed_tech:
            self._tech_cards[tag] = cards["tech_stack"].get(tag, tag)
        self._cap_cards: Dict[str, str] = {}
        for tag in self._allowed_cap:
            self._cap_cards[tag] = cards["capability"].get(tag, tag)

        self._client = client or OllamaEmbeddingClient()
        self._tech_vecs: Dict[str, List[float]] = {}
        self._cap_vecs: Dict[str, List[float]] = {}
        self._indexed = False

    def build_index(self) -> None:
        """Batch-embed all tag cards. One-shot cost; skipped on subsequent calls."""
        if self._indexed:
            return
        tech_tags = list(self._tech_cards.keys())
        tech_texts = [self._tech_cards[t] for t in tech_tags]
        cap_tags = list(self._cap_cards.keys())
        cap_texts = [self._cap_cards[t] for t in cap_tags]

        tech_vecs = self._client.embed_batch(tech_texts)
        cap_vecs = self._client.embed_batch(cap_texts)

        for tag, vec in zip(tech_tags, tech_vecs):
            self._tech_vecs[tag] = vec
        for tag, vec in zip(cap_tags, cap_vecs):
            self._cap_vecs[tag] = vec
        self._indexed = True

    def extract(self, text: str) -> EmbedResult:
        if not self._indexed:
            self.build_index()
        t0 = time.monotonic()
        try:
            qvec = self._client.embed(text)
        except OllamaEmbeddingError as e:
            return EmbedResult(elapsed_s=time.monotonic() - t0, tech_scores={"__error__": 0.0}, cap_scores={"__error__": 0.0})

        tech_scores = {tag: _cosine(qvec, vec) for tag, vec in self._tech_vecs.items()}
        cap_scores = {tag: _cosine(qvec, vec) for tag, vec in self._cap_vecs.items()}

        tech_pred = sorted([t for t, s in tech_scores.items() if s >= self.tech_threshold])
        cap_pred = sorted([t for t, s in cap_scores.items() if s >= self.cap_threshold])

        return EmbedResult(
            tech_stack=tech_pred,
            capability=cap_pred,
            elapsed_s=time.monotonic() - t0,
            tech_scores=tech_scores,
            cap_scores=cap_scores,
        )

    def grid_search_threshold(
        self,
        samples: List[dict],
        thresholds: Sequence[float] = (0.35, 0.40, 0.45, 0.50, 0.55, 0.60),
    ) -> Tuple[float, float, Dict[Tuple[float, float], Tuple[float, float]]]:
        """Pick (tech_θ, cap_θ) that maximizes mean F1 separately per dim.

        Returns (best_tech_θ, best_cap_θ, debug_map).
        """
        if not self._indexed:
            self.build_index()

        # pre-embed all queries once
        query_texts = [s["_input_text"] for s in samples]
        query_vecs = self._client.embed_batch(query_texts)

        # pre-compute all (sample, tag) scores once
        per_sample_tech: List[Dict[str, float]] = []
        per_sample_cap: List[Dict[str, float]] = []
        for qv in query_vecs:
            per_sample_tech.append({tag: _cosine(qv, vec) for tag, vec in self._tech_vecs.items()})
            per_sample_cap.append({tag: _cosine(qv, vec) for tag, vec in self._cap_vecs.items()})

        def mean_f1(scores_list: List[Dict[str, float]], gt_key: str, theta: float) -> float:
            f1s = []
            for scores, sample in zip(scores_list, samples):
                pred = set(t for t, s in scores.items() if s >= theta)
                gt = set(sample[gt_key])
                if not gt and not pred:
                    f1s.append(1.0)
                    continue
                if not pred or not gt:
                    f1s.append(0.0)
                    continue
                tp = len(pred & gt)
                p = tp / len(pred) if pred else 0.0
                r = tp / len(gt) if gt else 0.0
                f = (2 * p * r / (p + r)) if (p + r) > 0 else 0.0
                f1s.append(f)
            return sum(f1s) / len(f1s) if f1s else 0.0

        debug: Dict[Tuple[float, float], Tuple[float, float]] = {}
        best_tech, best_tech_f1 = thresholds[0], -1.0
        best_cap, best_cap_f1 = thresholds[0], -1.0
        for theta in thresholds:
            tf1 = mean_f1(per_sample_tech, "gt_tech_stack", theta)
            cf1 = mean_f1(per_sample_cap, "gt_capability", theta)
            debug[(theta, theta)] = (tf1, cf1)
            if tf1 > best_tech_f1:
                best_tech_f1 = tf1
                best_tech = theta
            if cf1 > best_cap_f1:
                best_cap_f1 = cf1
                best_cap = theta

        self.tech_threshold = best_tech
        self.cap_threshold = best_cap
        return best_tech, best_cap, debug

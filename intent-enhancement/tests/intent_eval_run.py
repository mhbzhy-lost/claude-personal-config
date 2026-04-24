"""Execute three systems (rule / embedding / LLM) over intent_eval_dataset.json,
score them, and dump results to intent_eval_results.json.

Usage: python tests/intent_eval_run.py
"""
from __future__ import annotations

import json
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean
from typing import Dict, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT.parent / "mcp" / "skill-catalog" / "src"))

from rule_based_extractor import RuleBasedExtractor  # noqa: E402
from embedding_tag_extractor import EmbeddingTagExtractor  # noqa: E402

# skill_catalog has external 'frontmatter' dep we dont need for classifier alone
# — import Classifier directly
from skill_catalog.classifier import Classifier, ClassifierConfig  # noqa: E402


DATASET = Path(__file__).parent / "intent_eval_dataset.json"
TAGS = Path(__file__).parent / "_catalog_tags.json"
RESULTS = Path(__file__).parent / "intent_eval_results.json"


def _f1(pred: set, gt: set) -> Tuple[float, float, float]:
    if not gt and not pred:
        return 1.0, 1.0, 1.0
    if not pred or not gt:
        p = 0.0 if gt else float("nan")
        r = 0.0 if pred else float("nan")
        return p, r, 0.0
    tp = len(pred & gt)
    p = tp / len(pred)
    r = tp / len(gt)
    f = (2 * p * r / (p + r)) if (p + r) > 0 else 0.0
    return p, r, f


def _nan_mean(xs: list[float]) -> float:
    xs2 = [x for x in xs if x == x]  # filter NaN
    return mean(xs2) if xs2 else float("nan")


def score_per_sample(sample: dict, sys_key: str, pred_tech: list, pred_cap: list, elapsed: float) -> dict:
    gt_t = set(sample["gt_tech_stack"])
    gt_c = set(sample["gt_capability"])
    pt, pc = set(pred_tech), set(pred_cap)
    tp, tr, tf = _f1(pt, gt_t)
    cp, cr, cf = _f1(pc, gt_c)
    return {
        "system": sys_key,
        "pred_tech_stack": sorted(pt),
        "pred_capability": sorted(pc),
        "tech_precision": tp, "tech_recall": tr, "tech_f1": tf,
        "cap_precision": cp, "cap_recall": cr, "cap_f1": cf,
        "elapsed_s": elapsed,
    }


def aggregate(per_sample: list[dict], bucket_key: str = None) -> dict:
    """Aggregate metrics over list of per-sample result dicts."""
    agg: dict = defaultdict(list)
    for r in per_sample:
        for k in ("tech_precision","tech_recall","tech_f1","cap_precision","cap_recall","cap_f1","elapsed_s"):
            agg[k].append(r[k])
    out = {k: _nan_mean(v) for k, v in agg.items()}
    out["n"] = len(per_sample)
    return out


def main():
    samples = json.loads(DATASET.read_text(encoding="utf-8"))
    tags = json.loads(TAGS.read_text(encoding="utf-8"))
    tech_tags = tags["tech_stack"]
    cap_tags = tags["capability"]

    # ---- System A: rules ----
    print("[run] System A rule-based...", file=sys.stderr)
    rule = RuleBasedExtractor(tech_tags, cap_tags)
    rule_results = []
    for s in samples:
        r = rule.extract(s["_input_text"])
        rule_results.append(score_per_sample(s, "rule", r.tech_stack, r.capability, r.elapsed_s))

    # ---- System B: embedding ----
    print("[run] System B embedding: building index...", file=sys.stderr)
    emb = EmbeddingTagExtractor(tech_tags, cap_tags)
    emb.build_index()
    print("[run] grid search thresholds...", file=sys.stderr)
    best_t, best_c, grid = emb.grid_search_threshold(samples)
    print(f"[run] best tech_theta={best_t}, cap_theta={best_c}", file=sys.stderr)
    print(f"[run] grid: {grid}", file=sys.stderr)
    emb_results = []
    for s in samples:
        r = emb.extract(s["_input_text"])
        emb_results.append(score_per_sample(s, "embedding", r.tech_stack, r.capability, r.elapsed_s))

    # ---- System C: LLM ----
    print("[run] System C LLM classifier...", file=sys.stderr)
    host = os.environ.get("SKILL_CATALOG_OLLAMA_HOST", "http://127.0.0.1:11435")
    clf = Classifier(ClassifierConfig(host_url=host, model="qwen2.5:7b", timeout_s=30.0))
    llm_results = []
    for i, s in enumerate(samples):
        # build user_prompt analog for classifier
        up = s["user_prompt"]
        if s.get("dialogue_context"):
            up += f"\n\n对话上下文:\n{s['dialogue_context']}"
        if s.get("file_summary"):
            up += f"\n\n文件摘要:\n{s['file_summary']}"
        fp = s.get("fingerprint_summary") or ""
        res = clf.classify(up, fp, tech_tags, cap_tags)
        if res.error:
            print(f"[run] LLM error on {s['sample_id']}: {res.error}", file=sys.stderr)
        llm_results.append(score_per_sample(s, "llm", res.tech_stack, res.capability, res.elapsed_s))
        if (i + 1) % 5 == 0:
            print(f"[run]   {i+1}/{len(samples)}", file=sys.stderr)

    # ---- Aggregate ----
    report = {
        "thresholds": {"tech": best_t, "cap": best_c, "grid_debug": {str(k): v for k, v in grid.items()}},
        "per_sample": [],
    }
    for s, ra, rb, rc in zip(samples, rule_results, emb_results, llm_results):
        report["per_sample"].append({
            "sample_id": s["sample_id"],
            "source": s["source"],
            "difficulty": s["difficulty"],
            "user_prompt": s["user_prompt"],
            "dialogue_context": s["dialogue_context"],
            "fingerprint_summary": s["fingerprint_summary"],
            "gt_tech_stack": s["gt_tech_stack"],
            "gt_capability": s["gt_capability"],
            "gt_reason": s["gt_reason"],
            "rule": ra,
            "embedding": rb,
            "llm": rc,
        })

    # Overall + per-difficulty + per-source
    def bucket_agg(rows, key):
        buckets = defaultdict(list)
        for row, s in zip(rows, samples):
            buckets[s[key]].append(row)
        return {k: aggregate(v) for k, v in buckets.items()}

    report["aggregate"] = {
        "rule":      {"overall": aggregate(rule_results), "by_difficulty": bucket_agg(rule_results, "difficulty"), "by_source": bucket_agg(rule_results, "source")},
        "embedding": {"overall": aggregate(emb_results),  "by_difficulty": bucket_agg(emb_results,  "difficulty"), "by_source": bucket_agg(emb_results,  "source")},
        "llm":       {"overall": aggregate(llm_results),  "by_difficulty": bucket_agg(llm_results,  "difficulty"), "by_source": bucket_agg(llm_results,  "source")},
    }

    # Q1/Q2/Q3 classification
    def sample_f1_avg(r):
        vals = [r["tech_f1"], r["cap_f1"]]
        vals = [v for v in vals if v == v]
        return mean(vals) if vals else 0.0

    q1_rule_ok, q2_emb_saves, q3_llm_only, neither = [], [], [], []
    for s, ra, rb, rc in zip(samples, rule_results, emb_results, llm_results):
        a = sample_f1_avg(ra); b = sample_f1_avg(rb); c = sample_f1_avg(rc)
        entry = {"sample_id": s["sample_id"], "difficulty": s["difficulty"],
                 "f1_rule": round(a,3), "f1_embedding": round(b,3), "f1_llm": round(c,3)}
        if a >= 0.8:
            q1_rule_ok.append(entry)
        elif b >= 0.8:
            q2_emb_saves.append(entry)
        elif c >= 0.8:
            q3_llm_only.append(entry)
        else:
            neither.append(entry)
    report["triage"] = {
        "Q1_rule_enough": q1_rule_ok,
        "Q2_embedding_needed": q2_emb_saves,
        "Q3_llm_required": q3_llm_only,
        "blind_spot_all_fail": neither,
    }

    RESULTS.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[done] wrote {RESULTS}")
    ov = report["aggregate"]
    print(f"[summary] rule      tech_f1={ov['rule']['overall']['tech_f1']:.3f}  cap_f1={ov['rule']['overall']['cap_f1']:.3f}")
    print(f"[summary] embedding tech_f1={ov['embedding']['overall']['tech_f1']:.3f}  cap_f1={ov['embedding']['overall']['cap_f1']:.3f}")
    print(f"[summary] llm       tech_f1={ov['llm']['overall']['tech_f1']:.3f}  cap_f1={ov['llm']['overall']['cap_f1']:.3f}")
    print(f"[triage] Q1={len(q1_rule_ok)}  Q2={len(q2_emb_saves)}  Q3={len(q3_llm_only)}  blind={len(neither)}")


if __name__ == "__main__":
    main()

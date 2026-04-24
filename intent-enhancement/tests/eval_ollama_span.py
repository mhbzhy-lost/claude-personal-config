"""
LLM span-extraction baseline: ask Ollama qwen2.5:7b to list filesystem paths
mentioned in each snippet, parse the response, and score like other systems.

This is NOT wired into intent-enhancement today; it's a hypothetical upgrade
baseline for the report.
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from eval_path_extraction import score, aggregate, match_path  # noqa: E402

OLLAMA = "http://127.0.0.1:11435/api/generate"
MODEL = "qwen2.5:7b"
EVAL_PATH = Path(__file__).parent / "path_extraction_eval.json"
OUT_APPEND = Path(__file__).parent / "path_extraction_eval_report.md"
DETAIL = Path(__file__).parent / "_ollama_span_raw.json"

PROMPT_TMPL = """你是一个路径抽取器。下面是一段 Claude Code 对话片段。请只输出片段中**明确提到的文件路径或目录路径**，每行一个，**不要解释**、不要加编号、不要加说明文字。

规则：
- 只列出像 `hooks/foo.sh`、`CLAUDE.md`、`src/module.py`、`settings.json`、`agents/expert.md` 这样的具体路径或文件名
- 不要列出框架名、变量名、tool 名（比如 Next.js、Observable、WebFetch 都不算）
- 不要列出临时路径（/tmp/、/private/tmp/ 开头的）
- 只输出路径，不要任何前缀（不要加 `-` 或数字）

片段：
<<<
{snippet}
>>>

路径列表："""


def call_ollama(prompt: str, timeout=60) -> str:
    req = urllib.request.Request(
        OLLAMA,
        data=json.dumps({
            "model": MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.0, "num_predict": 512},
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return body.get("response", "")


def parse_paths(raw: str) -> set[str]:
    hits = set()
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        # strip common list markers
        line = re.sub(r"^[-*\d\.\)\(]+\s*", "", line)
        line = line.strip("`\"'")
        if not line:
            continue
        # Must contain a '/' or a file extension to be considered a path
        if "/" in line or re.search(r"\.(py|sh|md|json|ts|tsx|js|jsx|yml|yaml|toml|txt)$", line):
            hits.add(line)
    return hits


def main():
    samples = json.loads(EVAL_PATH.read_text())
    results = []
    raw_log = []
    t0 = time.time()
    for i, s in enumerate(samples):
        # Truncate very long snippets to keep qwen2.5:7b focused
        snip = s["context_snippet"]
        if len(snip) > 2800:
            snip = snip[:2800] + "\n...[truncated]"
        prompt = PROMPT_TMPL.format(snippet=snip)
        try:
            raw = call_ollama(prompt)
        except Exception as e:
            print(f"[{i}] err: {e}", file=sys.stderr)
            raw = ""
        pred = parse_paths(raw)
        gt = set(s["ground_truth_paths"])
        sc = score(pred, gt)
        sc["sample_id"] = s["sample_id"]
        sc["path_types"] = s["path_types"]
        sc["difficulty"] = s["difficulty"]
        sc["pred"] = pred
        sc["gt"] = gt
        results.append(sc)
        raw_log.append({"sample_id": s["sample_id"], "raw": raw, "pred": sorted(pred)})
        if i % 5 == 0:
            agg = aggregate(results)
            print(f"[{i+1}/{len(samples)}] P={agg['precision']:.2%} R={agg['recall']:.2%}")

    agg = aggregate(results)
    elapsed = time.time() - t0
    print(f"\nOllama qwen2.5:7b span extraction: {len(samples)} snippets in {elapsed:.1f}s")
    print(f"  P={agg['precision']:.2%} R={agg['recall']:.2%} F1={agg['f1']:.2%}")

    DETAIL.write_text(json.dumps(raw_log, ensure_ascii=False, indent=2))

    # Breakdowns
    from collections import defaultdict
    by_type = defaultdict(list)
    by_diff = defaultdict(list)
    for r in results:
        by_type[r["path_types"]].append(r)
        by_diff[r["difficulty"]].append(r)

    # Append to report
    lines = ["", "## LLM span-extraction baseline (Ollama qwen2.5:7b)", ""]
    lines.append(
        "This is a **hypothetical upgrade** baseline — it is NOT part of the "
        "current intent-enhancement pipeline. We prompt qwen2.5:7b with the "
        "full snippet and ask it to list filesystem paths, one per line."
    )
    lines.append("")
    lines.append(f"- Model: `{MODEL}` via `http://127.0.0.1:11435`")
    lines.append(f"- Samples: {len(samples)}, elapsed: {elapsed:.1f}s "
                 f"(~{elapsed/len(samples):.1f}s/sample)")
    lines.append("")
    lines.append("| Bucket | N | Recall | Precision | F1 |")
    lines.append("|---|---:|---:|---:|---:|")
    a = aggregate(results)
    lines.append(f"| overall | {len(results)} | {a['recall']:.2%} | {a['precision']:.2%} | {a['f1']:.2%} |")
    for k in ["A", "B", "mixed"]:
        if k in by_type:
            rs = by_type[k]; a = aggregate(rs)
            lines.append(f"| path_type={k} | {len(rs)} | {a['recall']:.2%} | {a['precision']:.2%} | {a['f1']:.2%} |")
    for k in ["easy", "medium", "hard"]:
        if k in by_diff:
            rs = by_diff[k]; a = aggregate(rs)
            lines.append(f"| difficulty={k} | {len(rs)} | {a['recall']:.2%} | {a['precision']:.2%} | {a['f1']:.2%} |")
    lines.append("")

    # Example rows
    lines.append("### Sample outputs (first 5)")
    lines.append("")
    for r in results[:5]:
        lines.append(f"- **{r['sample_id']}** ({r['path_types']}/{r['difficulty']}): "
                     f"R={r['recall']:.2%} P={r['precision']:.2%} · pred={sorted(r['pred'])[:6]}")
    lines.append("")

    with OUT_APPEND.open("a") as f:
        f.write("\n".join(lines))
    print(f"appended LLM baseline section to {OUT_APPEND}")


if __name__ == "__main__":
    main()

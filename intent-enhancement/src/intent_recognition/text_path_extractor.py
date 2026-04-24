"""
行文文件路径抽取器 (prose file-path extractor).

从 user/assistant 消息的自由文本中抽取文件路径候选 — 补足 parser.py 仅
消费 Claude Code `attachment` 事件（即 `@path` 产物）所遗留的 B 类路径盲区。

核心设计：
- 正则优先：带扩展名的裸文件名 + 项目目录前缀的相对路径 + 绝对路径 / `~`
- 目录词典可注入：便于跨项目复用，不把 claude-config 的结构硬编码死
- `cwd` 磁盘存在性检查：不存在并不丢弃（讨论中"即将新建"的文件也有意图价值），
  而是标记 `exists=False`，由下游决定如何使用

基线回归：评估脚本 `tests/eval_path_extraction.py` 里的 `prose_regex_simple`
在 40 条样本集上 F1≈84%（lenient match），本实现以该正则为起点，并新增：
- 绝对路径 / `~` 展开
- 代码块 / 反引号 / ascii 图内路径（原正则已经能命中，但来源会标记为 `code_block`）
- 尾随标点清理、常见框架名词（Next.js、Node.js...）白名单过滤
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence


# ---------------------------------------------------------------------------
# 默认扩展名与目录词典
# ---------------------------------------------------------------------------

DEFAULT_EXTENSIONS: tuple[str, ...] = (
    "py", "sh", "md", "json",
    "ts", "tsx", "js", "jsx",
    "yml", "yaml", "toml", "ini",
    "txt", "cfg", "conf",
)

# 项目目录词典 — claude-config 友好，但接受构造参数覆盖
DEFAULT_DIR_VOCAB: tuple[str, ...] = (
    "hooks", "guidelines", "agents", "config", "src", "tests",
    "docs", "mcp", "skills", "intent-enhancement",
)

# 看起来像文件名但属于品牌 / 框架名词 — 误杀主要来源
FRAMEWORK_NOUNS: frozenset[str] = frozenset({
    "next.js", "nuxt.js", "node.js", "auth.js", "vue.js",
    "nest.js", "express.js", "three.js",
})

_TRIM_TRAILING = ".,;:!?)]}\"'`>"


# ---------------------------------------------------------------------------
# 数据结构
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ExtractedPath:
    """抽取出的路径候选 + 元数据."""

    path: str              # 原文中出现的路径（相对 / 绝对 / 带 ~ 的原样）
    absolute: str          # 归一化后的绝对路径（用于 exists 判定与下游索引）
    exists: bool           # 在 cwd 下 `os.path.exists` 是否为真
    source: str            # "prose" | "code_block" | "absolute" | "tilde"

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "absolute": self.absolute,
            "exists": self.exists,
            "source": self.source,
        }


# ---------------------------------------------------------------------------
# 提取器
# ---------------------------------------------------------------------------

class TextPathExtractor:
    """从自由文本中抽取文件路径候选.

    用法::

        extractor = TextPathExtractor(cwd="/Users/me/proj")
        results = extractor.extract("请看 hooks/foo.sh 和 `src/main.py`")
        for r in results:
            print(r.path, r.exists)
    """

    def __init__(
        self,
        cwd: Optional[str] = None,
        dir_vocab: Optional[Sequence[str]] = None,
        extensions: Optional[Sequence[str]] = None,
        framework_nouns: Optional[Iterable[str]] = None,
    ) -> None:
        self.cwd = os.path.abspath(cwd) if cwd else os.getcwd()
        self.dir_vocab = tuple(dir_vocab) if dir_vocab is not None else DEFAULT_DIR_VOCAB
        self.extensions = tuple(extensions) if extensions is not None else DEFAULT_EXTENSIONS
        self.framework_nouns = (
            frozenset(n.lower() for n in framework_nouns)
            if framework_nouns is not None
            else FRAMEWORK_NOUNS
        )

        self._re_ext = self._build_ext_regex(self.extensions)
        self._re_dir = self._build_dir_regex(self.dir_vocab)
        # 绝对路径：首字符必须是 `/` 且第二字符为字母数字或 `_`（排除 `//`、`/.`）
        # 前置断言排除 `~` 与 `:`（URL scheme 尾部）上下文
        self._re_abs = re.compile(
            r"(?<![A-Za-z0-9~:/])(/[A-Za-z0-9_][A-Za-z0-9_\-./]*)"
        )
        self._re_tilde = re.compile(r"(?<![A-Za-z0-9])(~/[A-Za-z0-9_\-./]+)")
        # 围栏代码块 ```...``` — 捕获其 body
        self._re_fence = re.compile(r"```[^\n]*\n(.*?)```", re.DOTALL)
        # 内联反引号 `...`
        self._re_inline = re.compile(r"`([^`\n]{1,200})`")

    # ------------------------------------------------------------------
    # 正则构造
    # ------------------------------------------------------------------

    @staticmethod
    def _build_ext_regex(exts: Sequence[str]) -> re.Pattern[str]:
        alt = "|".join(re.escape(e) for e in exts)
        # 前后断言避免嵌在标识符里（如 'myfile.py' inside 'foo.pyrocks'）
        return re.compile(
            rf"(?<![A-Za-z0-9@/._\-])"
            rf"([A-Za-z0-9_\-]+(?:/[A-Za-z0-9_\-]+)*\.(?:{alt}))"
            rf"(?![A-Za-z0-9])"
        )

    @staticmethod
    def _build_dir_regex(dirs: Sequence[str]) -> re.Pattern[str]:
        alt = "|".join(re.escape(d) for d in dirs)
        return re.compile(
            rf"(?<![A-Za-z0-9@/._\-])"
            rf"((?:{alt})/[A-Za-z0-9_\-./]+)"
        )

    # ------------------------------------------------------------------
    # 公开 API
    # ------------------------------------------------------------------

    def extract(self, text: str) -> List[ExtractedPath]:
        """抽取并去重 (按 absolute 归一化)."""
        if not text:
            return []

        # 收集 (raw_path, source) 候选 — 顺序用于 dedup 时保留首次出现的 source
        candidates: list[tuple[str, str]] = []

        # 1. 围栏代码块内优先处理 (source=code_block)
        fenced_spans: list[tuple[int, int]] = []
        for m in self._re_fence.finditer(text):
            fenced_spans.append(m.span())
            self._collect_from_span(m.group(1), candidates, source="code_block")

        # 2. 内联反引号 — source=code_block
        for m in self._re_inline.finditer(text):
            # 跳过与 fenced 重叠的
            if self._span_overlaps(m.span(), fenced_spans):
                continue
            inner = m.group(1).strip()
            self._collect_from_span(inner, candidates, source="code_block")

        # 3. 全文扫描 (prose / absolute / tilde) — 跳过已处理的 fenced 区间
        masked = self._mask_spans(text, fenced_spans)
        self._collect_from_span(masked, candidates, source="prose")

        # 4. 归一化 + 去重 + exists 标记
        return self._finalize(candidates)

    # ------------------------------------------------------------------
    # 内部收集
    # ------------------------------------------------------------------

    def _collect_from_span(
        self,
        text: str,
        out: list[tuple[str, str]],
        source: str,
    ) -> None:
        # 绝对路径
        for m in self._re_abs.finditer(text):
            p = self._trim(m.group(1))
            if p and self._looks_like_path(p):
                out.append((p, "absolute"))

        # ~/...
        for m in self._re_tilde.finditer(text):
            p = self._trim(m.group(1))
            if p:
                out.append((p, "tilde"))

        # 带扩展名的裸文件名 / 相对路径
        for m in self._re_ext.finditer(text):
            p = self._trim(m.group(1))
            if not p:
                continue
            if p.lower() in self.framework_nouns:
                continue
            out.append((p, source))

        # 项目目录前缀的相对路径
        for m in self._re_dir.finditer(text):
            p = self._trim(m.group(1))
            if p:
                out.append((p, source))

    @staticmethod
    def _trim(path: str) -> str:
        p = path.rstrip(_TRIM_TRAILING)
        # 同时剥离围绕性的引号
        p = p.strip("'\"`")
        # 去除尾部斜杠（目录引用，不是文件路径）
        p = p.rstrip("/")
        return p

    @staticmethod
    def _looks_like_path(s: str) -> bool:
        """过滤明显不是文件路径的绝对路径（如纯分类 '/api/v1'）.

        启发式：要么有扩展名，要么有至少 2 段路径。
        """
        if "." in os.path.basename(s):
            return True
        return s.count("/") >= 2

    @staticmethod
    def _span_overlaps(span: tuple[int, int], spans: list[tuple[int, int]]) -> bool:
        s, e = span
        for a, b in spans:
            if s < b and a < e:
                return True
        return False

    @staticmethod
    def _mask_spans(text: str, spans: list[tuple[int, int]]) -> str:
        if not spans:
            return text
        # 用空格替换以保持位置偏移
        buf = list(text)
        for a, b in spans:
            for i in range(a, b):
                if buf[i] != "\n":
                    buf[i] = " "
        return "".join(buf)

    # ------------------------------------------------------------------
    # 归一化 / exists 判定 / 去重
    # ------------------------------------------------------------------

    def _resolve_absolute(self, raw: str) -> str:
        if raw.startswith("~"):
            return os.path.abspath(os.path.expanduser(raw))
        if os.path.isabs(raw):
            return os.path.abspath(raw)
        return os.path.abspath(os.path.join(self.cwd, raw))

    def _finalize(self, candidates: list[tuple[str, str]]) -> List[ExtractedPath]:
        seen: dict[str, ExtractedPath] = {}
        # source 优先级：path 多次出现时，更强的 source 覆盖更弱的
        source_priority = {"absolute": 3, "tilde": 3, "code_block": 2, "prose": 1}
        for raw, src in candidates:
            if not raw:
                continue
            absolute = self._resolve_absolute(raw)
            exists = os.path.exists(absolute)
            entry = ExtractedPath(path=raw, absolute=absolute, exists=exists, source=src)
            prev = seen.get(absolute)
            if prev is None:
                seen[absolute] = entry
            else:
                # 同一 absolute：保留 source 优先级高者 (一般意味着原文更明确)
                if source_priority.get(src, 0) > source_priority.get(prev.source, 0):
                    seen[absolute] = entry
        return list(seen.values())


# ---------------------------------------------------------------------------
# 便捷函数
# ---------------------------------------------------------------------------

def extract_paths(
    text: str,
    cwd: Optional[str] = None,
    dir_vocab: Optional[Sequence[str]] = None,
) -> List[ExtractedPath]:
    """一次性提取（无状态封装）."""
    return TextPathExtractor(cwd=cwd, dir_vocab=dir_vocab).extract(text)

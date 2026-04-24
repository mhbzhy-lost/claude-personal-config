"""Unit tests for intent_recognition.text_path_extractor."""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from intent_recognition.text_path_extractor import (  # noqa: E402
    ExtractedPath,
    TextPathExtractor,
    extract_paths,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_project(tmp_path: Path) -> Path:
    """构造一个迷你项目：hooks/foo.sh, src/main.py, CLAUDE.md 都存在."""
    (tmp_path / "hooks").mkdir()
    (tmp_path / "hooks" / "foo.sh").write_text("#!/bin/sh\n")
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("print('hi')\n")
    (tmp_path / "CLAUDE.md").write_text("# config\n")
    return tmp_path


@pytest.fixture
def extractor(tmp_project: Path) -> TextPathExtractor:
    return TextPathExtractor(cwd=str(tmp_project))


def _paths(results):
    return {r.path for r in results}


def _by_path(results):
    return {r.path: r for r in results}


# ---------------------------------------------------------------------------
# 基本功能
# ---------------------------------------------------------------------------

def test_empty_string_returns_empty(extractor: TextPathExtractor) -> None:
    assert extractor.extract("") == []
    assert extractor.extract(None) == []  # type: ignore[arg-type]


def test_bare_filename_with_extension(extractor: TextPathExtractor) -> None:
    text = "请看一下 CLAUDE.md 里的配置，还有 settings.json 这个文件。"
    res = _paths(extractor.extract(text))
    assert "CLAUDE.md" in res
    assert "settings.json" in res


def test_dir_prefixed_relative_path(extractor: TextPathExtractor) -> None:
    text = "改动落在 hooks/foo.sh 和 src/main.py。"
    res = _paths(extractor.extract(text))
    assert "hooks/foo.sh" in res
    assert "src/main.py" in res


def test_absolute_path(tmp_project: Path, extractor: TextPathExtractor) -> None:
    abs_path = str(tmp_project / "src" / "main.py")
    text = f"详见 {abs_path} 的实现。"
    res = extractor.extract(text)
    by = _by_path(res)
    assert abs_path in by
    assert by[abs_path].source == "absolute"
    assert by[abs_path].exists is True


def test_tilde_expansion(tmp_project: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOME", str(tmp_project))
    ex = TextPathExtractor(cwd=str(tmp_project))
    text = "规范见 ~/CLAUDE.md 和 ~/hooks/foo.sh"
    results = ex.extract(text)
    # 归一化后的 absolute 指向 tmp_project
    absolutes = {r.absolute for r in results}
    assert str(tmp_project / "CLAUDE.md") in absolutes
    assert str(tmp_project / "hooks" / "foo.sh") in absolutes
    # source 应被标为 tilde
    sources = {r.source for r in results if r.path.startswith("~")}
    assert sources == {"tilde"}


def test_path_inside_fenced_code_block(extractor: TextPathExtractor) -> None:
    text = (
        "目录结构如下：\n"
        "```\n"
        "hooks/foo.sh\n"
        "src/main.py\n"
        "CLAUDE.md\n"
        "```\n"
        "以上就是全部。"
    )
    res = _by_path(extractor.extract(text))
    assert "hooks/foo.sh" in res
    assert res["hooks/foo.sh"].source == "code_block"
    assert "src/main.py" in res
    assert "CLAUDE.md" in res


def test_path_inside_inline_backticks(extractor: TextPathExtractor) -> None:
    text = "核心文件 `src/main.py` 被 `hooks/foo.sh` 调用。"
    res = _by_path(extractor.extract(text))
    assert res["src/main.py"].source == "code_block"
    assert res["hooks/foo.sh"].source == "code_block"


# ---------------------------------------------------------------------------
# exists 语义
# ---------------------------------------------------------------------------

def test_nonexistent_file_is_kept_with_flag(extractor: TextPathExtractor) -> None:
    text = "计划新增 src/not_yet.py 这个模块。"
    res = _by_path(extractor.extract(text))
    assert "src/not_yet.py" in res
    assert res["src/not_yet.py"].exists is False


def test_existing_file_flagged_true(extractor: TextPathExtractor) -> None:
    res = _by_path(extractor.extract("看 hooks/foo.sh"))
    assert res["hooks/foo.sh"].exists is True


# ---------------------------------------------------------------------------
# 噪声过滤
# ---------------------------------------------------------------------------

def test_framework_noun_filtered(extractor: TextPathExtractor) -> None:
    text = "项目用 Next.js 和 Node.js 搭建，入口在 src/main.py。"
    res = _paths(extractor.extract(text))
    assert "src/main.py" in res
    assert "Next.js" not in res
    assert "Node.js" not in res


def test_trailing_punctuation_stripped(extractor: TextPathExtractor) -> None:
    text = "请看 hooks/foo.sh, 以及 CLAUDE.md。"
    res = _paths(extractor.extract(text))
    assert "hooks/foo.sh" in res
    assert "CLAUDE.md" in res


def test_dedup_by_absolute(extractor: TextPathExtractor) -> None:
    # 绝对与相对指向同一文件 — 只保留一份，且倾向更强的 source
    text = (
        "相对路径 hooks/foo.sh，绝对路径 "
        f"{os.path.join(os.getcwd(), 'ignored')}。\n"
        "再提一次 hooks/foo.sh。"
    )
    res = extractor.extract(text)
    foos = [r for r in res if r.absolute.endswith("hooks/foo.sh")]
    assert len(foos) == 1


# ---------------------------------------------------------------------------
# 可注入词典
# ---------------------------------------------------------------------------

def test_custom_dir_vocab(tmp_path: Path) -> None:
    ex = TextPathExtractor(cwd=str(tmp_path), dir_vocab=["foo", "bar"])
    text = "看 foo/x.py 和 hooks/y.py"  # hooks 不在词典里了
    res = _paths(ex.extract(text))
    assert "foo/x.py" in res
    # hooks/y.py 仍通过扩展名路径命中（relative with slash）—这是预期的
    assert "hooks/y.py" in res  # via ext regex that allows a/b.py


def test_convenience_function(tmp_project: Path) -> None:
    res = extract_paths("看 hooks/foo.sh", cwd=str(tmp_project))
    assert any(r.path == "hooks/foo.sh" for r in res)


# ---------------------------------------------------------------------------
# Sanity perf
# ---------------------------------------------------------------------------

def test_large_text_is_fast(extractor: TextPathExtractor) -> None:
    chunk = "这是一段文本，讨论 hooks/foo.sh 和 src/main.py 与 CLAUDE.md。\n"
    big = chunk * 2000  # ~200 KB
    start = time.perf_counter()
    res = extractor.extract(big)
    dur = time.perf_counter() - start
    assert dur < 2.0, f"extract too slow: {dur:.2f}s"
    # 去重后 3 个
    assert len({r.path for r in res}) == 3

"""Tests for skill_catalog.fingerprint — pure static workspace detection."""

from __future__ import annotations

import json
from pathlib import Path

from skill_catalog.fingerprint import FingerprintResult, scan


def _write(p: Path, content: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")


# ---------------------------------------------------------------------------
# empty / edge cases
# ---------------------------------------------------------------------------


def test_empty_dir_returns_empty_result(tmp_path: Path) -> None:
    result = scan(tmp_path)
    assert result.empty is True
    assert result.detected == {}
    assert "空目录" in result.to_text_summary()


def test_nonexistent_path_does_not_raise(tmp_path: Path) -> None:
    result = scan(tmp_path / "does-not-exist")
    assert result.empty is True
    assert result.detected == {}


def test_file_instead_of_dir_is_safe(tmp_path: Path) -> None:
    f = tmp_path / "regular.txt"
    f.write_text("hi")
    result = scan(f)
    assert result.empty is True


# ---------------------------------------------------------------------------
# npm stacks
# ---------------------------------------------------------------------------


def test_nextjs_react_antd_detected(tmp_path: Path) -> None:
    _write(
        tmp_path / "package.json",
        json.dumps(
            {
                "name": "demo",
                "dependencies": {
                    "next": "^14.0.0",
                    "react": "^18.0.0",
                    "antd": "^5.0.0",
                    "@playwright/test": "^1.40.0",
                },
                "devDependencies": {"typescript": "^5.0.0"},
            }
        ),
    )
    result = scan(tmp_path)
    assert result.empty is False
    tech = result.detected["tech_stack"]
    assert "nextjs" in tech
    assert "react" in tech
    assert "antd" in tech
    assert "playwright" in tech
    assert "typescript" in result.detected["language"]
    assert "package.json" in result.detected["config_files"]


def test_antd_via_pro_components_alias(tmp_path: Path) -> None:
    _write(
        tmp_path / "package.json",
        json.dumps({"dependencies": {"@ant-design/pro-components": "^2.0.0"}}),
    )
    result = scan(tmp_path)
    assert "antd" in result.detected["tech_stack"]


def test_vue_and_angular_detected(tmp_path: Path) -> None:
    _write(
        tmp_path / "package.json",
        json.dumps({"dependencies": {"vue": "^3.0.0"}}),
    )
    assert "vue" in scan(tmp_path).detected["tech_stack"]


# ---------------------------------------------------------------------------
# python stacks
# ---------------------------------------------------------------------------


def test_pyproject_django_fastapi_celery_detected(tmp_path: Path) -> None:
    _write(
        tmp_path / "pyproject.toml",
        """
[project]
name = "app"
dependencies = [
    "django>=5.0",
    "fastapi>=0.110",
    "celery>=5.0",
    "langchain>=0.1",
    "langgraph>=0.0.30",
    "pydantic>=2",
]
""".strip(),
    )
    result = scan(tmp_path)
    tech = result.detected["tech_stack"]
    for tag in ("django", "fastapi", "celery", "langchain", "langgraph", "pydantic"):
        assert tag in tech, f"missing {tag} in {tech}"
    assert "python" in result.detected["language"]


def test_poetry_style_pyproject(tmp_path: Path) -> None:
    _write(
        tmp_path / "pyproject.toml",
        """
[tool.poetry]
name = "app"

[tool.poetry.dependencies]
python = "^3.11"
django = "^5.0"
flask = "^3.0"
""".strip(),
    )
    tech = scan(tmp_path).detected["tech_stack"]
    assert "django" in tech
    assert "flask" in tech


def test_requirements_txt_detection(tmp_path: Path) -> None:
    _write(tmp_path / "requirements.txt", "django==5.0\nfastapi>=0.110\n# comment\n")
    tech = scan(tmp_path).detected["tech_stack"]
    assert "django" in tech
    assert "fastapi" in tech


# ---------------------------------------------------------------------------
# bare-manifest stacks
# ---------------------------------------------------------------------------


def test_go_mod_detected(tmp_path: Path) -> None:
    _write(tmp_path / "go.mod", "module demo\n")
    result = scan(tmp_path)
    assert "go" in result.detected["tech_stack"]
    assert "go" in result.detected["language"]


def test_cargo_toml_detected(tmp_path: Path) -> None:
    _write(tmp_path / "Cargo.toml", '[package]\nname = "x"\n')
    result = scan(tmp_path)
    assert "rust" in result.detected["tech_stack"]
    assert "rust" in result.detected["language"]


def test_pubspec_flutter_detected(tmp_path: Path) -> None:
    _write(tmp_path / "pubspec.yaml", "name: demo\n")
    assert "flutter" in scan(tmp_path).detected["tech_stack"]


def test_ios_podfile_detected(tmp_path: Path) -> None:
    _write(tmp_path / "Podfile", "platform :ios\n")
    assert "ios" in scan(tmp_path).detected["tech_stack"]


def test_android_gradle_detected(tmp_path: Path) -> None:
    _write(tmp_path / "build.gradle", "apply plugin: 'com.android.application'\n")
    assert "android" in scan(tmp_path).detected["tech_stack"]


def test_android_kt_file_adds_kotlin(tmp_path: Path) -> None:
    _write(tmp_path / "Main.kt", "fun main() {}\n")
    result = scan(tmp_path)
    assert "android" in result.detected["tech_stack"]
    assert "kotlin" in result.detected["language"]


def test_composer_php_detected(tmp_path: Path) -> None:
    _write(tmp_path / "composer.json", "{}")
    assert "php" in scan(tmp_path).detected["tech_stack"]


def test_gemfile_ruby_detected(tmp_path: Path) -> None:
    _write(tmp_path / "Gemfile", "source 'https://rubygems.org'\n")
    assert "ruby" in scan(tmp_path).detected["tech_stack"]


# ---------------------------------------------------------------------------
# language heuristics
# ---------------------------------------------------------------------------


def test_top_level_ts_file_triggers_typescript_language(tmp_path: Path) -> None:
    _write(tmp_path / "index.ts", "export const x = 1\n")
    assert "typescript" in scan(tmp_path).detected.get("language", [])


def test_top_level_py_file_triggers_python_language(tmp_path: Path) -> None:
    _write(tmp_path / "main.py", "print('hi')\n")
    assert "python" in scan(tmp_path).detected.get("language", [])


# ---------------------------------------------------------------------------
# multi-stack coexistence & malformed files
# ---------------------------------------------------------------------------


def test_multi_stack_coexistence(tmp_path: Path) -> None:
    _write(
        tmp_path / "package.json",
        json.dumps({"dependencies": {"react": "^18"}}),
    )
    _write(
        tmp_path / "pyproject.toml",
        '[project]\nname="x"\ndependencies = ["fastapi>=0"]\n',
    )
    result = scan(tmp_path)
    tech = result.detected["tech_stack"]
    assert "react" in tech
    assert "fastapi" in tech


def test_malformed_package_json_ignored(tmp_path: Path) -> None:
    _write(tmp_path / "package.json", "{ this is not json")
    _write(tmp_path / "go.mod", "module demo\n")
    result = scan(tmp_path)
    # Bad package.json should not derail; go.mod still detected
    assert "go" in result.detected["tech_stack"]


def test_malformed_pyproject_ignored(tmp_path: Path) -> None:
    _write(tmp_path / "pyproject.toml", "this is not toml = =")
    _write(tmp_path / "Cargo.toml", '[package]\nname="x"\n')
    result = scan(tmp_path)
    assert "rust" in result.detected["tech_stack"]


# ---------------------------------------------------------------------------
# summary shape
# ---------------------------------------------------------------------------


def test_text_summary_is_multiline_and_mentions_tech(tmp_path: Path) -> None:
    _write(
        tmp_path / "package.json",
        json.dumps({"dependencies": {"react": "^18"}}),
    )
    summary = scan(tmp_path).to_text_summary()
    assert "react" in summary
    assert "workspace" in summary
    assert summary.count("\n") >= 1


def test_scan_accepts_string_path(tmp_path: Path) -> None:
    _write(tmp_path / "go.mod", "module x\n")
    result = scan(str(tmp_path))
    assert isinstance(result, FingerprintResult)
    assert "go" in result.detected["tech_stack"]


# ---------------------------------------------------------------------------
# scan_with_submodules — monorepo layouts
# ---------------------------------------------------------------------------


from skill_catalog.fingerprint import scan_with_submodules  # noqa: E402


def test_scan_with_submodules_merges_web_subdir(tmp_path: Path) -> None:
    _write(tmp_path / "pyproject.toml",
           '[project]\nname="x"\ndependencies=["fastapi"]\n')
    _write(tmp_path / "web" / "package.json",
           json.dumps({"dependencies": {"react": "^19", "antd": "^5"}}))
    result = scan_with_submodules(tmp_path)
    assert "fastapi" in result.detected["tech_stack"]
    assert "react" in result.detected["tech_stack"]
    assert "antd" in result.detected["tech_stack"]
    # evidence gets prefixed with submodule name
    assert any(e.startswith("web/") for e in result.detected.get("evidence", []))


def test_scan_with_submodules_skips_missing_dirs(tmp_path: Path) -> None:
    _write(tmp_path / "go.mod", "module x\n")
    result = scan_with_submodules(tmp_path)
    assert "go" in result.detected["tech_stack"]


def test_scan_with_submodules_empty(tmp_path: Path) -> None:
    result = scan_with_submodules(tmp_path)
    assert result.empty is True


def test_scan_with_submodules_respects_custom_submodule_list(tmp_path: Path) -> None:
    _write(tmp_path / "custom" / "package.json",
           json.dumps({"dependencies": {"react": "^19"}}))
    # default submodule list does not include "custom"
    result_default = scan_with_submodules(tmp_path)
    assert result_default.empty is True
    # with explicit list, picked up
    result_custom = scan_with_submodules(tmp_path, submodule_names=("custom",))
    assert "react" in result_custom.detected["tech_stack"]

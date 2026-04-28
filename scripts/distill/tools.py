"""Tool implementations for the distillation pipeline.

Tools are defined as OpenAI-format function definitions + Python handlers.
When the LLM returns a tool_call, the orchestrator executes the handler and
feeds the result back.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

TOOL_DEFINITIONS: dict[str, dict] = {}
TOOL_HANDLERS: dict[str, Any] = {}


def _register(name: str, description: str, parameters: dict):
    """Register a tool definition + handler via decorator."""

    def deco(fn):
        TOOL_DEFINITIONS[name] = {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": {
                    "type": "object",
                    "properties": parameters,
                    "required": list(parameters.keys()),
                },
            },
        }
        TOOL_HANDLERS[name] = fn
        return fn

    return deco


# ---------------------------------------------------------------------------
# Web tools — used by source-planner and skill-fetcher
# ---------------------------------------------------------------------------
@_register(
    "web_search",
    "Search the web for information. Returns titles, snippets, and URLs.",
    {
        "query": {
            "type": "string",
            "description": "Search query string",
        },
    },
)
def web_search(query: str) -> str:
    """Execute a web search via DuckDuckGo (no API key required).

    Falls back to SearXNG public instance if available.
    """
    # Try DuckDuckGo HTML search first (no API key needed)
    try:
        url = "https://html.duckduckgo.com/html/"
        headers = {"User-Agent": "skill-distill/1.0"}
        resp = requests.post(url, data={"q": query}, headers=headers, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")
        results = []
        for r in soup.select(".result")[:10]:
            title_el = r.select_one(".result__title")
            snippet_el = r.select_one(".result__snippet")
            link_el = r.select_one(".result__url")
            if title_el:
                results.append(
                    {
                        "title": title_el.get_text(strip=True),
                        "snippet": snippet_el.get_text(strip=True) if snippet_el else "",
                        "url": link_el.get("href", "") if link_el else "",
                    }
                )
        if results:
            return json.dumps(results, ensure_ascii=False, indent=2)
    except Exception:
        pass

    return json.dumps(
        {"error": "web_search failed", "hint": "try a more specific query"},
        ensure_ascii=False,
    )


@_register(
    "web_fetch",
    "Fetch the content of a web page and extract the main text. "
    "Use for reading documentation pages, README files, CHANGELOGs, etc.",
    {
        "url": {
            "type": "string",
            "description": "The URL to fetch",
        },
    },
)
def web_fetch(url: str) -> str:
    """Fetch a URL and extract main text content."""
    headers = {
        "User-Agent": "skill-distill/1.0 (compatible; +https://github.com/mhbzhy-lost/claude-personal-config)"
    }
    try:
        # If it's a raw markdown/text file, return verbatim
        if _is_raw_text_url(url):
            resp = requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            return resp.text[:50000]  # cap at 50K chars

        # Otherwise extract main content from HTML
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove noise elements
        for tag in soup.select(
            "nav, footer, script, style, .sidebar, .navigation, "
            ".cookie-banner, .advertisement, .header, #header, "
            ".toc, .table-of-contents, .edit-link"
        ):
            tag.decompose()

        # Try to find main content area
        main = (
            soup.select_one("main")
            or soup.select_one("article")
            or soup.select_one(".content")
            or soup.select_one("#content")
            or soup.select_one(".markdown-body")
            or soup.select_one(".documentation")
            or soup.body
        )

        if main:
            text = main.get_text("\n", strip=True)
        else:
            text = soup.get_text("\n", strip=True)

        # Collapse excessive whitespace
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text[:50000]

    except requests.RequestException as e:
        return json.dumps(
            {"error": f"web_fetch failed: {e}", "url": url}, ensure_ascii=False
        )


def _is_raw_text_url(url: str) -> bool:
    """Check if URL points to a raw text file."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    path = parsed.path

    if "raw.githubusercontent.com" in host:
        return True
    if host == "gist.githubusercontent.com":
        return True
    if path.endswith((".md", ".mdx", ".txt", ".rst", ".json", ".yaml", ".yml")):
        return True
    return False


# ---------------------------------------------------------------------------
# File system tools — used by fetcher/preprocessor/builder/marker
# ---------------------------------------------------------------------------
@_register(
    "read_file",
    "Read the contents of a file at the given path.",
    {
        "path": {
            "type": "string",
            "description": "Absolute path to the file to read",
        },
    },
)
def read_file(path: str) -> str:
    p = Path(path)
    if not p.exists():
        return f"Error: file not found: {path}"
    try:
        return p.read_text(encoding="utf-8")[:20000]
    except Exception as e:
        return f"Error reading {path}: {e}"


@_register(
    "write_file",
    "Write content to a file. Creates parent directories if needed.",
    {
        "path": {
            "type": "string",
            "description": "Absolute path to write to",
        },
        "content": {
            "type": "string",
            "description": "Content to write",
        },
    },
)
def write_file(path: str, content: str) -> str:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    try:
        p.write_text(content, encoding="utf-8")
        return f"Written {len(content)} bytes to {path}"
    except Exception as e:
        return f"Error writing {path}: {e}"


@_register(
    "list_files",
    "List files in a directory matching an optional glob pattern.",
    {
        "path": {
            "type": "string",
            "description": "Directory path to list",
        },
        "pattern": {
            "type": "string",
            "description": "Optional glob pattern, e.g. '**/*.md'",
        },
    },
)
def list_files(path: str, pattern: str = "*") -> str:
    p = Path(path)
    if not p.exists():
        return f"Error: directory not found: {path}"
    if not p.is_dir():
        return f"Error: not a directory: {path}"

    files = sorted(p.glob(pattern))
    result = []
    for f in files:
        if f.is_file():
            result.append(
                {"name": str(f.relative_to(p)), "path": str(f), "size": f.stat().st_size}
            )
    return json.dumps(result[:100], ensure_ascii=False, indent=2)


@_register(
    "run_shell",
    "Execute a shell command. Use sparingly — prefer read_file/write_file/list_files.",
    {
        "command": {
            "type": "string",
            "description": "Shell command to execute",
        },
    },
)
def run_shell(command: str) -> str:
    # Safety: block dangerous commands
    dangerous = ["rm -rf /", "sudo ", "mkfs.", "dd if=", ":(){ :|:& };:"]
    for d in dangerous:
        if d in command.lower():
            return f"Error: dangerous command blocked: {d}"

    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=60,
            cwd=os.getcwd(),
        )
        output = result.stdout[:5000]
        if result.stderr:
            output += "\n[stderr]\n" + result.stderr[:2000]
        return output or f"(exit code {result.returncode})"
    except subprocess.TimeoutExpired:
        return "Error: command timed out (60s)"
    except Exception as e:
        return f"Error executing command: {e}"


@_register(
    "list_skills",
    "List existing skills from the skill catalog for deduplication. "
    "Call this before planning new skills to avoid duplicates.",
    {
        "tech_stack": {
            "type": "string",
            "description": "The tech stack to query, e.g. 'antd', 'fastapi'",
        },
    },
)
def list_skills(tech_stack: str) -> str:
    """Query the local skill catalog for existing skills."""
    skills_dir = Path(os.environ.get(
        "SKILL_LIBRARY_PATH",
        os.path.expanduser("~/.claude/skills"),
    ))
    tech_dir = skills_dir / tech_stack
    if not tech_dir.exists():
        return json.dumps({"skills": [], "note": f"no existing skills for {tech_stack}"})

    found = []
    for skmd in sorted(tech_dir.glob("**/SKILL.md")):
        try:
            content = skmd.read_text()[:2000]
            # Extract frontmatter name
            m = re.search(r"^name:\s*(.+)$", content, re.MULTILINE)
            m2 = re.search(r"^collected_at:\s*(.+)$", content, re.MULTILINE)
            name = m.group(1).strip() if m else skmd.parent.name
            collected = m2.group(1).strip() if m2 else "unknown"
            found.append({"name": name, "collected_at": collected})
        except Exception:
            pass

    return json.dumps({"skills": found}, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------
def execute_tool(tool_call: Any) -> str:
    """Execute a single tool call and return the result as a string."""
    name = tool_call.function.name
    try:
        args = json.loads(tool_call.function.arguments)
    except json.JSONDecodeError:
        args = {}

    handler = TOOL_HANDLERS.get(name)
    if handler is None:
        return f"Error: unknown tool '{name}'"

    try:
        return handler(**args)
    except Exception as e:
        return f"Error executing {name}: {e}"


def get_tool_defs(names: list[str]) -> list[dict]:
    """Get tool definitions for the requested tool names."""
    return [TOOL_DEFINITIONS[n] for n in names if n in TOOL_DEFINITIONS]

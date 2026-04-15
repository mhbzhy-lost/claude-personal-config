# skill-catalog

MCP server that serves Claude Code skills by tech stack, enabling progressive disclosure.

## Design

The catalog is indexed at server startup by scanning `$SKILL_LIBRARY_PATH` recursively for `SKILL.md` files. Each skill's frontmatter is parsed; skills with a `tech_stack` array are indexed by tag.

Two tools are exposed:

- `list_skills(tech_stack: list[str]) -> { skills: [...] }`
- `get_skill(name: str) -> { content: str } | null`

See top of this repo's `CLAUDE.md` for how the main agent is expected to use them.

## Setup

```bash
cd /Users/mhbzhy/claude-config/mcp/skill-catalog
python3 -m venv .venv
.venv/bin/pip install -e .
```

## Configuration

Register in `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "skill-catalog": {
      "type": "stdio",
      "command": "/Users/mhbzhy/claude-config/mcp/skill-catalog/.venv/bin/python",
      "args": ["-m", "skill_catalog.server"],
      "env": {
        "SKILL_LIBRARY_PATH": "/Users/mhbzhy/claude-config/skills"
      }
    }
  }
}
```

Restart Claude Code (or `/reload-plugins`) to pick up changes.

## Query semantics

### `list_skills(tech_stack)`

- Empty array → returns all skills with a `tech_stack` field
- Any unknown tag in query → returns full catalog as fallback (union semantics)
- Normal query → union of skills whose `tech_stack` intersects any queried tag
- Results are sorted by name for deterministic output

### `get_skill(name)`

- Returns `{"content": "..."}` with YAML frontmatter stripped
- Rewrites relative markdown links `[text](./relative/path)` to absolute paths based on the skill's directory
- Skips rewriting for `http(s)://`, `mailto:`, anchor links `#foo`, and already-absolute paths
- Returns `null` if the skill name is unknown

## Development

Run the server manually for debugging:

```bash
SKILL_LIBRARY_PATH=/Users/mhbzhy/claude-config/skills \
  .venv/bin/python -m skill_catalog.server
```

The server speaks stdio JSON-RPC per MCP protocol. Use a client (e.g., `mcp-cli`) for interactive testing, or pipe JSON-RPC requests from a file.

## Adding new skills

1. Create `$SKILL_LIBRARY_PATH/<stack>/<skill-name>/SKILL.md`
2. Frontmatter must include:
   ```yaml
   ---
   name: <skill-name>
   description: "..."
   tech_stack: [<stack>, ...]
   ---
   ```
3. Restart Claude Code or run `/reload-plugins`

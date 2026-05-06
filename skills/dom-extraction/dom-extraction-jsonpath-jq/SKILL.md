---
name: dom-extraction-jsonpath-jq
description: Query, extract, and transform JSON data in Python using jsonpath-ng (JSONPath expressions) and pyjq (jq bindings).
tech_stack: [backend]
language: [python]
capability: [data-fetching]
version: "jsonpath-ng 1.8.0; pyjq unversioned"
collected_at: 2026-02-24
---

# JSONPath & jq for Python

> Source: https://github.com/h2non/jsonpath-ng, https://pypi.org/project/jsonpath-ng/, https://github.com/doloopwhile/pyjq

## Purpose

Two complementary Python libraries for querying and transforming JSON-like data structures (dicts, lists) without writing manual traversal loops:

- **jsonpath-ng** — standards-compliant JSONPath implementation with AST support and extensions (arithmetic, filtering, regex). Best when you need JSONPath portability or programmatic expression building.
- **pyjq** — Python bindings to the full jq query language. Best when you need jq's expressive power (pipes, conditionals, complex transformations) from Python.

## When to Use

**jsonpath-ng** when you need:
- Standard JSONPath syntax (`$.store.book[*].author`)
- In-place mutation of JSON trees (update/delete nodes by path)
- Programmatic construction of query expressions (AST building)
- Extensions: arithmetic on fields, regex filtering, length/keys/split

**pyjq** when you need:
- jq's full pipeline language (filter → map → select → group)
- Complex transformations expressed as jq scripts
- Pre-compiled queries for repeated execution against many objects

## Basic Usage

### jsonpath-ng — parse & find

```python
from jsonpath_ng import parse

expr = parse('foo[*].baz')
data = {'foo': [{'baz': 1}, {'baz': 2}]}

# Extract values
[ m.value for m in expr.find(data) ]          # => [1, 2]

# Extract with full path context
[ str(m.full_path) for m in expr.find(data) ] # => ['foo.[0].baz', 'foo.[1].baz']

# Update in-place
expr.update(data, 3)
# => {'foo': [{'baz': 3}, {'baz': 3}]}

# Delete matching nodes
expr.filter(lambda d: True, data)
# => {'foo': [{}, {}]}
```

For extended features (arithmetic, filter expressions): `from jsonpath_ng.ext import parse`

### pyjq — all / first / one / compile

```python
import pyjq

data = {"user": "stedolan", "titles": ["JQ Primer", "More JQ"]}

# Get all results
pyjq.all('{user, title: .titles[]}', data)
# => [{'user': 'stedolan', 'title': 'JQ Primer'}, {'user': 'stedolan', 'title': 'More JQ'}]

# First result only (None if empty)
pyjq.first('.titles[] | select(test("P"))', data)
# => 'JQ Primer'

# Exactly one result (raises IndexError if 0 or 2+)
pyjq.one('.titles[] | select(test("P"))', data)
# => 'JQ Primer'

# Pre-compile for repeated use
pat = pyjq.compile('{user, title: .titles[]}')
pat.all(data)
```

## Key APIs (Summary)

| Library | Function | Purpose |
|---------|----------|---------|
| jsonpath-ng | `parse(expr)` | Compile JSONPath string → expression object |
| jsonpath-ng | `expr.find(data)` | Return list of `DatumInContext` matches (`.value`, `.full_path`) |
| jsonpath-ng | `expr.update(data, val)` | Replace all matched values in-place |
| jsonpath-ng | `expr.filter(predicate, data)` | Remove matching nodes from data |
| jsonpath-ng | `Fields/Slice/Child(...)` | Build expressions programmatically |
| pyjq | `all(script, data, vars?, url?)` | All jq results as list |
| pyjq | `first(script, data, default?)` | First result or None/default |
| pyjq | `one(script, data)` | Exactly one result or IndexError |
| pyjq | `compile(script)` | Pre-compile jq script → reusable object |

**jsonpath-ng syntax quick reference** (most-used operators):

| Operator | Meaning | Example |
|----------|---------|---------|
| `.field` | Child field | `$.store.book` |
| `..field` | Descendant (recursive) | `$..author` |
| `[*]` | Any array element | `$.book[*]` |
| `[n]` | Array index | `$.book[0]` |
| `[?(@.price < 10)]` | Filter (extended parser) | `$.book[?(@.price < 10)]` |
| `\|` | Union | `$.foo \| $.bar` |
| `` `parent` `` | Named operator (parent context) | `` a.*.b.`parent`.c `` |

**pyjq jq patterns** (most common):

| Pattern | Meaning |
|---------|---------|
| `.field` | Identity / field access |
| `.[]` | Unwrap array/object |
| `select(condition)` | Filter by condition |
| `{k1, k2}` | Object construction (projection) |
| `expr \| expr` | Pipeline |
| `test("regex")` | Regex match |
| `$var` | Variable reference (passed via `vars=` dict) |

## Caveats

### jsonpath-ng
- **PLY/docstrings**: Does NOT work with `PYTHONOPTIMIZE=2` or `python -OO` — the parser toolkit requires docstrings intact.
- **Filter limitations**: `[?()]` expressions can only compare properties against static values, not against other properties.
- **Arithmetic**: Returns `[]` (empty) on type-incompatible operations. Bare names without `$` prefix are treated as string literals, not jsonpath.
- **No step in slicing**: `[start:end:step]` — step parameter is unimplemented.
- **Python**: 3.10+ only.

### pyjq
- **Build dependencies**: Needs `flex`, `bison` (3.0+), `libtool`, `make`, `automake`, `autoconf` on the system. Not a pure-Python wheel.
- **JSON-only data**: Can only process `str`, `int`, `float`, `list`, `dict`. Non-JSON types (Decimal, datetime, custom objects) will fail.
- **Must json.loads() strings first**: If you have a raw JSON string, parse it with `json.loads()` before passing to pyjq.
- **Not the `jq` PyPI package**: The `jq` package on PyPI is a different, incompatible binding.

## Composition Hints

- **Default to jsonpath-ng** for simple extraction (`parse().find()`) — it's pure Python, no build deps, and the JSONPath syntax is portable across languages.
- **Reach for pyjq** when the extraction logic needs pipelines, grouping, or complex conditionals that are awkward in JSONPath. jq's pipe syntax handles multi-step transforms cleanly.
- **jsonpath-ng for mutation**: If you need to modify or delete nodes in-place, jsonpath-ng is the only option — pyjq is read-only.
- **pyjq for URL fetching**: `pyjq.all(script, url="...")` can fetch and query in one call; jsonpath-ng requires separate `json.load()`.
- **Combine them**: Use jsonpath-ng to navigate to a subtree, then pyjq for complex reshaping within that subtree.

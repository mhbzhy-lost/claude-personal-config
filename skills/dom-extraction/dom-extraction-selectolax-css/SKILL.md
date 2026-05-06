---
name: dom-extraction-selectolax-css
description: Fast HTML5 parser with CSS selectors using Lexbor engine — 25x faster than BeautifulSoup for bulk scraping
tech_stack: [web]
language: [python]
capability: [http-client]
version: "selectolax 0.4.8"
collected_at: 2026-05-04
---

# selectolax — Fast HTML5 CSS Selector Parser

> Source: https://selectolax.readthedocs.io/en/latest/, https://github.com/rushter/selectolax, https://pypi.org/project/selectolax/

## Purpose
selectolax is a Cython-based HTML5 parser providing CSS selector queries at near-native C speed. It's the fastest Python HTML parsing option — ~25x faster than BeautifulSoup (html.parser), ~4x faster than lxml+BS4.

## When to Use
- High-performance web scraping where parsing speed is the bottleneck
- Bulk HTML processing (thousands/millions of documents)
- CSS selector-based extraction as a drop-in replacement for BeautifulSoup's `.select()`
- HTML5 parsing compliance (Lexbor backend gracefully handles malformed HTML)
- **NOT** when you need XPath queries — use lxml instead
- **NOT** for quick one-off scripts where BeautifulSoup's API convenience matters more than speed

## Basic Usage

### Installation
```bash
pip install selectolax
# If compilation fails:
pip install selectolax[cython]
```
Requires Python ≥3.9, <3.15. Pre-built wheels for Linux/macOS/Windows.

### Parsing and selecting
```python
from selectolax.lexbor import LexborHTMLParser

html = """
<h1 id="title" data-updated="20201101">Hi there</h1>
<div class="post">Lorem Ipsum is simply dummy text.</div>
<div class="post">Lorem ipsum dolor sit amet.</div>
"""

parser = LexborHTMLParser(html)

# Single element
parser.css_first('h1#title').text()         # 'Hi there'
parser.css_first('h1#title').attributes     # {'id': 'title', 'data-updated': '20201101'}

# Multiple elements
[node.text() for node in parser.css('.post')]
# ['Lorem Ipsum is simply dummy text.', 'Lorem ipsum dolor sit amet.']
```

### Core node API
```python
node.css(selector)       # list of matching child nodes
node.css_first(selector) # first match or None
node.text()              # inner text content
node.attributes          # dict of all attributes
node.tag                 # tag name string
node.html                # outer HTML
node.parent / node.child # tree navigation
node.next / node.prev    # sibling navigation
node.remove()            # remove from tree
node.traverse()          # depth-first iterator
node.closest(selector)   # nearest ancestor matching selector
```

### Compiled selectors (for repeated use)
```python
from selectolax.lexbor import Selector

sel = Selector("div.post > h2.title")
for node in sel.match(parser.root):
    print(node.text())
```

### lexbor-contains — text content matching
```python
# Case-sensitive
parser.css('p:lexbor-contains("AwesOme")')

# Case-insensitive (i flag outside quotes)
parser.css('p:lexbor-contains("awesome" i)')
```
This is a selectolax-specific non-standard pseudo-class. Use it when you need to select elements by their text content.

## Key APIs (Summary)

| API | Description |
|---|---|
| `LexborHTMLParser(html)` | Parse HTML string into DOM tree |
| `parser.root` | Root `LexborNode` of the document |
| `node.css(selector)` | Find all matching descendants (returns list) |
| `node.css_first(selector)` | Find first matching descendant (returns node or None) |
| `node.text(deep=True)` | Extract text content recursively |
| `node.attributes` | Dict of element attributes |
| `node.parent` / `node.child` | Parent / first child navigation |
| `node.next` / `node.prev` | Sibling navigation |
| `node.remove()` | Remove element from the tree |
| `node.traverse()` | Iterate all nodes depth-first |
| `node.closest(selector)` | Find nearest ancestor matching selector |
| `Selector(css_str)` | Compile a CSS selector for repeated matching |
| `sel.match(node)` | Apply compiled selector, returns matching nodes |

## Caveats

### Always use the Lexbor backend
```python
# DO: preferred, maintained
from selectolax.lexbor import LexborHTMLParser

# DON'T: Modest backend is deprecated, underlying C lib unmaintained
from selectolax.parser import HTMLParser
```

### Performance expectations
| Parser | Time (754 domains) |
|---|---|
| BeautifulSoup (html.parser) | 61.02s |
| lxml / BS4 (lxml backend) | 9.09s |
| selectolax (Lexbor) | **2.39s** |

### CSS selector coverage
CSS selector support follows Lexbor engine capabilities — not all CSS4 selectors are available. For complex structured extraction needing axes (ancestor, following-sibling), use lxml XPath.

### Pre-processing for text extraction
Remove script/style tags before extracting text to avoid noise:
```python
for tag in parser.css('script, style, noscript'):
    tag.remove()
clean_text = parser.root.text()
```

### When to use alternatives
- **lxml**: when you need XPath, namespaces, or complex structured extraction
- **BeautifulSoup**: when API ergonomics matter more than raw speed
- **selectolax**: when speed and CSS selectors are the top priority

## Composition Hints
- Pair with `httpx` or `requests` for fetching HTML before parsing
- Use `css()` for batch extraction, `css_first()` for single-element lookups
- For table parsing, chain: `parser.css('table tr')` → `row.css('td')`
- For form extraction, iterate `parser.css('form input[name]')` and collect `attributes.get('name')` / `attributes.get('value')`
- Use `Selector()` for compiled selectors when the same query runs on many documents

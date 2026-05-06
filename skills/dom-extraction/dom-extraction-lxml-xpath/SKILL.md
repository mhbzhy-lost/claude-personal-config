---
name: dom-extraction-lxml-xpath
description: XPath 1.0 structured extraction with lxml.etree — namespaces, compiled expressions, EXSLT regex, and smart strings
tech_stack: [web]
language: [python]
capability: [http-client]
version: "lxml 6.1.0"
collected_at: 2026-04-17
---

# lxml XPath — Structured XML/HTML Extraction

> Source: https://lxml.de/xpathxslt.html, https://lxml.de/tutorial.html, https://lxml.de/

## Purpose
lxml.etree provides full **XPath 1.0** querying backed by libxml2/libxslt C libraries — fast, feature-complete, and Pythonic. It handles namespaces, compiled expressions, variables, EXSLT regex extensions, and smart string introspection that tracks text origin in the DOM.

## When to Use
- Complex XML/HTML extraction needing XPath axes (`ancestor::`, `following-sibling::`, etc.)
- XML with **namespaces** requiring prefix-aware queries
- **Compiled** XPath expressions evaluated repeatedly across documents
- XSLT transformations on XML documents
- **NOT** for simple tag/class CSS selection — use `lxml.cssselect` or selectolax instead
- **NOT** for memory-constrained streaming — XPath always collects ALL results before returning

## Basic Usage

### Parsing and querying
```python
from lxml import etree

xml = '<foo><bar>Text</bar></foo>'
tree = etree.fromstring(xml)     # for XML; use etree.HTML() for HTML

# Absolute path
tree.xpath('/foo/bar')           # [<Element bar>]
tree.xpath('/foo/bar/text()')    # ['Text']

# Relative path from current element
tree.xpath('bar')                # [<Element bar>]

# String value
tree.xpath('string(/foo/bar)')   # 'Text'
```

### Two query tiers — choose the right one
```python
# ElementPath (faster, simpler, incremental):
tree.find('bar')                 # first match
tree.findall('bar')              # all matches (list)
tree.iterfind('bar')             # incremental iterator

# XPath (full power, conditions, functions, axes):
tree.xpath('//bar[@id="main"]')  # conditional
tree.xpath('//foo/ancestor::*')  # axes
```

**Rule**: Use `.find*()` for simple tag paths. Use `.xpath()` when you need conditions, functions, axes, or text/attribute extraction in one expression.

## Key APIs (Summary)

### Query methods
| Method | Description |
|---|---|
| `elem.xpath(expr, namespaces=..., smart_strings=..., **vars)` | One-shot XPath evaluation |
| `etree.XPath(expr, namespaces=..., regexp=..., smart_strings=...)` | Compiled XPath — returns callable, compile once evaluate many |
| `etree.XPathEvaluator(elem)` | Efficient evaluator for multiple different XPaths on same element |
| `etree.ETXPath(expr)` | XPath with Clark notation `{ns}name` — no prefix mapping needed |
| `tree.getpath(elem)` | Generate structural absolute XPath to an element |

### Return value types
| Expression yields | Python type |
|---|---|
| Boolean (`true()`/`false()`) | `True` / `False` |
| Number (`count()`, `position()`) | `float` |
| String (`string()`, `concat()`) | plain `str` (no parent reference) |
| Text nodes (`text()`, `//text()`) | 'smart' string with `getparent()`, `is_text`, `is_tail` |
| Attribute values (`@attr`) | 'smart' string with `getparent()`, `is_attribute` |
| Nodes (`//element`) | list of `Element` objects |
| Namespace declarations | `(prefix, URI)` tuples |

### Smart strings
```python
texts = tree.xpath('//text()')
texts[0]                  # 'Hello'
texts[0].getparent().tag  # owning element's tag
texts[0].is_text          # True
texts[0].is_tail          # False

# Disable to reduce memory (no parent references kept):
tree.xpath('//text()', smart_strings=False)
```

## Namespace Handling

### The critical rule: XPath has NO default namespace
```python
# This FAILS — empty prefix undefined in XPath:
xml = '<root xmlns="http://example.com/ns"><child/></root>'
root = etree.fromstring(xml)
# root.xpath('/root')  # XPathEvalError!

# Correct: define explicit prefix
root.xpath('/n:root', namespaces={'n': 'http://example.com/ns'})
```

### Prefix mapping is independent of document prefixes
```python
xml = '<a:foo xmlns:a="http://example.com/ns1"><b:bar xmlns:b="http://example.com/ns2">Text</b:bar></a:foo>'
doc = etree.fromstring(xml)

# Your prefixes are YOUR choice — only URIs must match:
doc.xpath('/x:foo/y:bar', namespaces={
    'x': 'http://example.com/ns1',  # document uses 'a', we use 'x'
    'y': 'http://example.com/ns2'   # document uses 'b', we use 'y'
})[0].text  # 'Text'
```

### Clark notation — skip prefix mapping entirely
```python
# ETXPath: use {uri}tagname directly
etree.ETXPath('//{http://example.com/ns}bar')(root)

# Also visible in tag names after parsing:
doc.xpath('/x:foo')[0].tag  # '{http://example.com/ns1}foo'
```

### Namespace-agnostic matching
```python
# Match by local name only, ignoring namespace:
tree.xpath('//*[local-name() = "bar"]')
```

## Compiled XPath and Variables

### Compile for repeated use (significant performance gain)
```python
find_b = etree.XPath("//b")
find_b(root)  # callable — evaluate many times

# With namespaces:
find_ns = etree.XPath("//n:b", namespaces={'n': 'http://example.com/ns'})
```

### XPath variables
```python
# Dynamic element matching:
count = etree.XPath("count(//*[local-name() = $name])")
count(root, name="foo")  # 1.0
count(root, name="bar")  # 2.0

# String variable:
tree.xpath("$text", text="Hello World!")  # 'Hello World!'
```

## Common Extraction Patterns

### Structured record extraction
```python
root = etree.fromstring(xml)

records = []
for product in root.xpath('//product'):
    records.append({
        'sku': product.get('sku'),
        'name': product.xpath('string(name)'),
        'price': float(product.xpath('string(price)')),
        'categories': product.xpath('categories/category/text()'),
    })
```

### Text extraction from mixed-content HTML
```python
from lxml import html
root = html.fromstring("<html><body>Hello<br/>World</body></html>")

root.xpath('//text()')   # ['Hello', 'World'] — separate chunks
root.xpath('string()')   # 'HelloWorld' — concatenated
```

### Attribute extraction
```python
root.xpath('//item/@id')                # all ids
root.xpath('//item[@id="2"]/@name')     # filtered
root.xpath('//item/@id')[0].getparent() # owner element
```

### EXSLT regex matching
```python
find = etree.XPath(
    "//*[re:test(., '^abc$', 'i')]",
    namespaces={'re': 'http://exslt.org/regular-expressions'}
)
# Matches elements whose text matches regex (case-insensitive)
```

### XPath axes
```python
root.xpath('//title/ancestor::chapter')             # up the tree
root.xpath('//title/following-sibling::para')       # siblings after
root.xpath('//title/parent::*')                     # immediate parent
root.xpath('//chapter/descendant::*')               # all descendants
```

## Caveats

### Smart string memory trap
Smart strings keep the XML tree alive via `getparent()`. For large documents where you only need string values, always use `smart_strings=False`. Functions `string()` and `concat()` return plain strings — safe for memory.

### XPath collects all results eagerly
Unlike `iterfind()` which yields incrementally, `.xpath()` builds the complete result list in memory. Not suitable for streaming huge documents.

### XPath 1.0 only — no XPath 2.0+
No `fn:matches()` (use EXSLT `re:test()`), no `for` expressions, no sequences. EXSLT regex is enabled by default (`regexp=True` on `XPath` constructor).

### Error handling differences
```python
# XPath class: compile-time vs runtime errors separated
try:
    compiled = etree.XPath(expr)      # XPathSyntaxError here
    compiled(root)                     # XPathEvalError here
except etree.XPathError:              # catch-all for both
    ...

# xpath() method: all errors are XPathEvalError
tree.xpath(expr)                       # XPathEvalError for everything
```

### HTML vs XML parsing
```python
# For HTML (malformed, unclosed tags, etc.):
from lxml import html
root = html.fromstring(html_str)      # handles real-world HTML
root = etree.HTML(html_str)            # equivalent

# For well-formed XML:
root = etree.fromstring(xml_str)       # strict XML parsing
root = etree.XML(xml_str)              # equivalent
```

### XSLT caveat
`<xsl:strip-space elements="*"/>` can crash due to a libxslt bug — avoid it.

## Composition Hints
- For HTML scraping: parse with `lxml.html.fromstring()`, query with `.xpath()`, fall back to `.cssselect()` for simple class/id selection
- For namespace-heavy XML: prefer `ETXPath` with Clark notation to avoid maintaining prefix mappings
- For repeated queries on the same document: use `XPathEvaluator`; for the same query across documents: use compiled `XPath`
- Combine `xpath()` for node selection with `string()` or `text()` for extracting values in one pass
- When extracting structured data: iterate over record elements with `xpath()`, then use relative `xpath()` calls on each element for fields

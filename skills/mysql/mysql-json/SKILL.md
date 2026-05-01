---
name: mysql-json
description: Working with MySQL's native JSON data type — storage, querying, indexing, and transforming JSON documents with SQL.
tech_stack: [mysql]
language: [sql]
capability: [relational-db]
version: "MySQL 8.4"
collected_at: 2025-01-01
---

# MySQL JSON Data Type

> Source: https://dev.mysql.com/doc/refman/8.4/en/json.html, https://dev.mysql.com/doc/refman/8.4/en/json-table-functions.html, https://dev.mysql.com/doc/refman/8.4/en/json-functions.html

## Purpose

MySQL provides a native `JSON` data type (RFC 8259) with automatic validation, optimized binary storage for fast path-based access, and a rich set of SQL functions for creating, querying, and modifying JSON documents. The `JSON_TABLE()` function converts JSON into relational rows for joining and filtering.

## When to Use

- Storing semi-structured or schema-flexible data alongside relational columns
- Nesting sub-documents (objects, arrays) accessed via path expressions
- Replacing EAV (Entity-Attribute-Value) anti-patterns with a single validated JSON column
- Flattening JSON arrays/objects into relational rows for SQL joins via `JSON_TABLE`
- When you need database-level JSON validation

## Basic Usage

### Defining a JSON Column

```sql
CREATE TABLE t1 (id INT PRIMARY KEY, data JSON);
INSERT INTO t1 VALUES (1, '{"name": "Alice", "scores": [95, 87, 91]}');
```

### Path Access Operators

```sql
-- -> returns JSON-typed value (with quotes for strings)
SELECT data->'$.name' FROM t1;        -- "Alice"

-- ->> returns unquoted scalar string
SELECT data->>'$.name' FROM t1;       -- Alice

-- Extract nested array element (0-indexed)
SELECT data->>'$.scores[0]' FROM t1;  -- 95
```

### Creating JSON

```sql
SELECT JSON_OBJECT('key1', 1, 'key2', 'abc');          -- {"key1": 1, "key2": "abc"}
SELECT JSON_ARRAY('a', 1, NOW());                      -- ["a", 1, "2015-07-27 09:43:47"]
SELECT JSON_MERGE_PRESERVE('["a", 1]', '{"k": "v"}');  -- ["a", 1, {"k": "v"}]
```

### Modifying JSON In-Place

```sql
UPDATE t1 SET data = JSON_SET(data, '$.name', 'Bob') WHERE id = 1;
UPDATE t1 SET data = JSON_INSERT(data, '$.age', 30) WHERE id = 1;  -- no-op if key exists
UPDATE t1 SET data = JSON_REPLACE(data, '$.name', 'Carol') WHERE id = 1;
UPDATE t1 SET data = JSON_REMOVE(data, '$.age') WHERE id = 1;
UPDATE t1 SET data = JSON_ARRAY_APPEND(data, '$.scores', 99) WHERE id = 1;
```

Prefer `JSON_SET`/`JSON_REPLACE`/`JSON_REMOVE` over direct assignment — they enable the partial-update optimization (in-place modification when the new value ≤ old value size).

### JSON_TABLE — Flattening JSON to Rows

```sql
-- Basic: each array element becomes a row
SELECT *
FROM JSON_TABLE(
    '[{"x":2,"y":"8"},{"x":"3","y":"7"},{"x":"4","y":6}]',
    '$[*]' COLUMNS(
        xval VARCHAR(100) PATH '$.x',
        yval VARCHAR(100) PATH '$.y'
    )
) AS jt;

-- NESTED PATH: flatten inner arrays
SELECT *
FROM JSON_TABLE(
    '[{"a": 1, "b": [11,111]}, {"a": 2, "b": [22,222]}, {"a":3}]',
    '$[*]' COLUMNS(
        a INT PATH '$.a',
        NESTED PATH '$.b[*]' COLUMNS (b INT PATH '$')
    )
) AS jt
WHERE b IS NOT NULL;  -- inner join: drop rows where nested path had no match
```

**JSON_TABLE column types:**
| Type | Purpose |
|------|---------|
| `name FOR ORDINALITY` | Row counter (UNSIGNED INT, starts at 1) |
| `name type PATH '...'` | Extract scalar, coerce to `type` |
| `name type EXISTS PATH '...'` | 1 if data exists, else 0 |
| `NESTED PATH '...' COLUMNS (...)` | Flatten nested objects/arrays |

**ON EMPTY / ON ERROR defaults:**
```sql
col VARCHAR(100) PATH '$.a' DEFAULT '111' ON EMPTY DEFAULT '999' ON ERROR
```

### Indexing JSON

JSON columns cannot be indexed directly. Index generated columns instead:

```sql
CREATE TABLE employees (
    id INT PRIMARY KEY,
    data JSON,
    INDEX idx_name ((CAST(data->>'$.name' AS CHAR(100))))
);
```

For InnoDB (8.0.17+), multi-valued indexes on JSON arrays:
```sql
CREATE INDEX idx_scores ON t1 ((CAST(data->'$.scores' AS UNSIGNED ARRAY)));
```

## Key APIs (Summary)

| Category | Key Functions |
|----------|--------------|
| **Create** | `JSON_ARRAY()`, `JSON_OBJECT()`, `JSON_QUOTE()`, `JSON_ARRAYAGG()`, `JSON_OBJECTAGG()` |
| **Extract** | `JSON_EXTRACT()`, `->`, `->>`, `JSON_VALUE()`, `JSON_KEYS()` |
| **Search** | `JSON_CONTAINS()`, `JSON_CONTAINS_PATH()`, `JSON_SEARCH()` |
| **Modify** | `JSON_SET()`, `JSON_INSERT()`, `JSON_REPLACE()`, `JSON_REMOVE()`, `JSON_ARRAY_APPEND()`, `JSON_ARRAY_INSERT()` |
| **Merge** | `JSON_MERGE_PRESERVE()` (combine arrays), `JSON_MERGE_PATCH()` (RFC 7396, overwrite) |
| **Validate** | `JSON_VALID()`, `JSON_SCHEMA_VALID()`, `JSON_SCHEMA_VALIDATION_REPORT()` |
| **Inspect** | `JSON_TYPE()`, `JSON_DEPTH()`, `JSON_LENGTH()`, `JSON_STORAGE_SIZE()`, `JSON_STORAGE_FREE()`, `JSON_PRETTY()` |
| **Table** | `JSON_TABLE()` |

## Caveats

- **No direct indexes on JSON**: always use generated columns or multi-valued indexes.
- **Sort order is unstable**: JSON normalization order may change across releases — never rely on it.
- **Case sensitivity**: JSON `null`/`true`/`false` must be lowercase. String comparison uses `utf8mb4_bin` (case-sensitive).
- **`max_allowed_packet` limit**: governs stored JSON size; in-memory can be larger.
- **Partial updates**: only `JSON_SET`/`JSON_REPLACE`/`JSON_REMOVE` trigger the optimization. Direct assignment always does full replacement. Replacement value must be ≤ old value.
- **`JSON_MERGE()` is deprecated**: use `JSON_MERGE_PRESERVE()` instead.
- **User variables lose JSON type**: `SET @j = JSON_OBJECT(...)` stores a string, not a JSON value.
- **JSON_TABLE quirks**: `ON ERROR` before `ON EMPTY` is deprecated. Never use `LATERAL` keyword (it's implicit; explicit `LATERAL` errors).
- **NDB Cluster**: max 3 JSON columns per table.

## Composition Hints

- **JSON + generated column indexes** is the standard pattern for queryable JSON fields.
- **JSON_TABLE + JOIN**: `JSON_TABLE` is a lateral derived table — it can reference columns of tables listed before it in `FROM`. Use this to join JSON content to parent rows.
- **Prefer `JSON_OBJECT()` over string literals** for safe construction (avoids escaping issues, consistent regardless of `NO_BACKSLASH_ESCAPES` mode).
- **Use `JSON_MERGE_PATCH()`** for partial document updates where you want to overwrite keys; use `JSON_MERGE_PRESERVE()` to combine arrays.
- **For validation at insert/update time**, combine `JSON_VALID()` with a `CHECK` constraint or use `JSON_SCHEMA_VALID()`.
- **Sibling NESTED PATH**: produces sum of records (not product). Each sibling iterates independently, setting the other siblings' columns to NULL.

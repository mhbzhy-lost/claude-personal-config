---
name: mysql-index-optimization
description: MySQL 8.0 index optimization — B-tree/FULLTEXT/spatial index types, EXPLAIN output interpretation, composite index design, covering indexes, index hints, and FULLTEXT search syntax
tech_stack: [mysql]
language: [sql]
capability: [relational-db, search-engine, observability]
version: "MySQL 8.0"
collected_at: 2025-01-01
---

# MySQL Index Optimization

> Source: https://dev.mysql.com/doc/refman/8.0/en/optimization-indexes.html, https://dev.mysql.com/doc/refman/8.0/en/explain-output.html, https://dev.mysql.com/doc/refman/8.0/en/index-hints.html, https://dev.mysql.com/doc/refman/8.0/en/fulltext-search.html

## Purpose

Indexes are the primary mechanism for accelerating SELECT queries in MySQL. They allow the optimizer to locate rows without scanning entire tables. This skill covers index types, EXPLAIN-based diagnosis, composite index design, index hints, and FULLTEXT search — the complete toolkit for solving query performance problems with indexing.

## When to Use

- EXPLAIN shows `type: ALL` (full table scan) or `type: index` (full index scan) on large tables
- `Extra: Using filesort` or `Using temporary` appears — sorting/grouping needs an index
- JOIN columns lack indexes, causing nested full scans
- Text search on VARCHAR/TEXT columns — FULLTEXT is far more efficient than `LIKE '%...%'`
- You need to test dropping an index safely — make it invisible first (8.0+)
- The optimizer picks the wrong index — use index hints or optimizer hints to override

## Basic Usage

### Quick Diagnosis with EXPLAIN

```sql
EXPLAIN SELECT ...\G
-- Key columns to check:
--   type:     system > const > eq_ref > ref > range > index > ALL
--             (ref/range = good, ALL = bad, index = maybe OK if covering)
--   key:      index actually used (NULL = no index)
--   rows:     estimated rows examined (lower is better)
--   Extra:    "Using index" = covering (excellent)
--             "Using filesort" = sort problem
--             "Using temporary" = grouping problem

EXPLAIN FORMAT=TREE SELECT ...;       -- Hierarchical plan (8.0.16+)
EXPLAIN FORMAT=JSON SELECT ...;       -- Machine-parseable + cost info
EXPLAIN ANALYZE SELECT ...;           -- Actually executes, shows real timing (8.0.18+)
```

### Designing a Composite Index

Follow the **leftmost prefix rule**: index on (A, B, C) supports queries on A, A+B, A+B+C.

```sql
-- Query: WHERE customer_id = ? AND status = ? ORDER BY order_date DESC
-- Good index: equality filters first, then range/sort columns
CREATE INDEX idx_cust_status_date ON orders (customer_id, status, order_date);
```

Column order heuristic: **equality conditions → range conditions → sort columns**.

### Full-Text Search

```sql
-- Create FULLTEXT index
CREATE FULLTEXT INDEX ft_idx ON articles (title, body);

-- Natural language (default): relevance-ranked, stopwords apply
SELECT *, MATCH(title, body) AGAINST('database optimization') AS score
FROM articles WHERE MATCH(title, body) AGAINST('database optimization')
ORDER BY score DESC;

-- Boolean mode: +required -excluded *wildcard "phrase"
SELECT * FROM articles
WHERE MATCH(title, body) AGAINST('+mysql -oracle "performance tuning"' IN BOOLEAN MODE);

-- Query expansion: auto-broadens search with relevant terms from top results
SELECT * FROM articles
WHERE MATCH(title, body) AGAINST('database' WITH QUERY EXPANSION);
```

### Overriding the Optimizer

```sql
-- Hint to prefer a specific index
SELECT * FROM t1 FORCE INDEX (idx_created) WHERE created_at > '2024-01-01';

-- Hint to avoid a bad index
SELECT * FROM t1 IGNORE INDEX (idx_status) WHERE status = 'active';

-- Scope hint to sorting only
SELECT * FROM t1 USE INDEX FOR ORDER BY (idx_date) ORDER BY created_at DESC LIMIT 10;

-- In 8.0.20+, prefer optimizer hints (more flexible, support single-table DELETE):
SELECT /*+ JOIN_INDEX(t1, idx_created) */ * FROM t1 WHERE created_at > '2024-01-01';
```

### Invisible Indexes (safe-drop testing)

```sql
ALTER TABLE orders ALTER INDEX idx_old INVISIBLE;
-- Optimizer ignores it; but writes still maintain it
-- If no query regresses after monitoring, DROP it:
-- ALTER TABLE orders ALTER INDEX idx_old VISIBLE;  -- undo
DROP INDEX idx_old ON orders;
```

## Key APIs (Summary)

### EXPLAIN Join Types — Best to Worst

| Type | When | Quality |
|------|------|---------|
| `system` / `const` | PK/UNIQUE lookup on constant | Instant |
| `eq_ref` | PK/UNIQUE NOT NULL join with `=` | Excellent |
| `ref` | Non-unique index or leftmost prefix with `=` | Very good |
| `range` | `=`, `>`, `<`, `BETWEEN`, `IN()`, `LIKE 'pref%'` | Good |
| `index` | Full index scan (covering or index-order scan) | OK if small |
| `ALL` | Full table scan | Bad — add index |

### Critical EXPLAIN Extra Flags

| Flag | Problem? | Fix |
|------|----------|-----|
| `Using index` | ✅ Good | Covering index; query satisfied from index only |
| `Using index condition` | Varies | Index Condition Pushdown; index helps but WHERE still applies |
| `Using filesort` | ⚠️ Slow | Add index matching ORDER BY columns |
| `Using temporary` | ⚠️ Slow | Add index matching GROUP BY / DISTINCT columns |
| `Using join buffer` | ⚠️ Slow | Add index on JOIN column of the buffered table |

### Index Types

| Type | Syntax | Use Case |
|------|--------|----------|
| B-tree (default) | `CREATE INDEX` / `PRIMARY KEY` / `UNIQUE` | Equality, range, sort, prefix matching |
| FULLTEXT | `CREATE FULLTEXT INDEX` | Natural-language text search, boolean search |
| Spatial (R-tree) | `CREATE SPATIAL INDEX` | Geometry/POINT/POLYGON proximity queries |
| Descending (8.0+) | `INDEX (col1 ASC, col2 DESC)` | Mixed-order ORDER BY without filesort |

### FULLTEXT Boolean Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `+word` | Must be present | `+mysql` |
| `-word` | Must not be present | `-oracle` |
| `word*` | Prefix wildcard | `optim*` |
| `"phrase"` | Exact phrase match | `"query optimization"` |
| `(a b)` | Grouping | `(+mysql +index) (+innodb +myisam)` |
| `>word` `<word` | Raise/lower relevance weight | `>urgent <minor` |
| `~word` | Negate relevance (but still match) | `~deprecated` |

### Key Parameters

| Parameter | Default | Effect |
|-----------|---------|--------|
| `innodb_ft_min_token_size` | 3 | Min word length indexed for FULLTEXT |
| `innodb_ft_max_token_size` | 84 | Max word length indexed for FULLTEXT |
| `ngram_token_size` | 2 | CJK token size for ngram parser |
| `optimizer_switch` | (compound) | Toggle `use_invisible_indexes`, `skip_scan`, `index_merge` etc. |

## Caveats

- **Leftmost prefix is strict**: Index on (A, B, C) won't help `WHERE B = ?` unless using skip scan (8.0.13+) — plan column order from most selective + most frequently filtered
- **Stale statistics → wrong index**: Run `ANALYZE TABLE` after heavy writes; the optimizer relies on cardinality estimates
- **Too many indexes = slow writes**: Every INSERT/UPDATE/DELETE maintains all indexes; each index adds ~10-30% write overhead
- **Index hints are fragile**: Index names can change with schema migrations. Prefer optimizer hints (8.0.20+) — `/*+ JOIN_INDEX(...) */`
- **FORCE INDEX not guaranteed**: MySQL may still table scan if the index is genuinely unusable for the query
- **FULLTEXT ignores short words**: `innodb_ft_min_token_size=3` means "to", "is", "an" are not indexed. Adjust for short-term searches
- **Boolean FULLTEXT ignores stopwords**: Unlike natural language mode, boolean mode does not filter stopwords
- **`Using index` with `type: index` is still a full scan**: Covering index scan beats table scan but may be slow on large indexes
- **`EXPLAIN` rows is an estimate**: Based on index statistics, may be off by orders of magnitude. Use `EXPLAIN ANALYZE` for real counts
- **Invisible indexes still cost writes**: They're maintained on every DML — use temporarily for testing, then drop
- **Index merge may be slower than a composite index**: `type: index_merge` with two indexes can underperform one well-designed composite index

## Composition Hints

- **InnoDB B-tree structure**: Secondary indexes store the primary key at leaf level — see `mysql-innodb` for B+tree page layout and how it affects index size
- **Transaction isolation affects locking reads**: `SELECT ... FOR UPDATE` uses indexes to set gap/next-key locks — see `mysql-transaction-isolation` for lock-index interaction
- **Partition pruning uses indexes**: Partition elimination works with indexes; EXPLAIN `partitions` column shows matched partitions — see `mysql-partitioning`
- **JSON indexes**: Generated columns + secondary indexes, and multi-valued indexes (8.0.17+) enable indexing JSON arrays — see `mysql-json`
- **Query optimizer decisions**: The optimizer chooses join order, index, and access method based on cost model — see `mysql-query-optimization` for optimizer trace and join algorithms
- **Schema design drives index design**: PK choice (UUID vs auto-increment) determines clustered index fragmentation — see `mysql-schema-design`

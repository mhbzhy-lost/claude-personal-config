---
name: mysql-window-functions-cte
description: Window functions for per-row analytics (ranking, running totals, LAG/LEAD) and Common Table Expressions (CTEs) including recursive CTEs for series generation and hierarchy traversal.
tech_stack: [mysql]
language: [sql]
capability: [relational-db]
version: "MySQL 8.4"
collected_at: 2025-01-01
---

# MySQL Window Functions & CTEs

> Source: https://dev.mysql.com/doc/refman/8.4/en/window-function-descriptions.html, https://dev.mysql.com/doc/refman/8.4/en/window-functions-usage.html, https://dev.mysql.com/doc/refman/8.4/en/with.html

## Purpose

Window functions compute per-row results based on a sliding "window" of related rows without collapsing groups — ideal for running totals, rankings, and row-to-row comparisons. Common Table Expressions (CTEs) create named, reusable temporary result sets within a single statement; recursive CTEs enable series generation and hierarchical data traversal.

## When to Use

**Window functions for:**
- Running totals / cumulative sums / moving averages
- Ranking rows within groups: `ROW_NUMBER`, `RANK`, `DENSE_RANK`
- Row-to-row deltas (day-over-day change) via `LAG`/`LEAD`
- First/last/Nth value per partition without self-joins
- Percentiles, quartiles, bucket distributions: `NTILE`, `PERCENT_RANK`, `CUME_DIST`
- Detail rows alongside aggregate totals in the same result

**CTEs for:**
- Breaking complex queries into named, readable steps
- Reusing the same subquery multiple times in a statement
- Recursive CTEs: series generation (dates, sequences), hierarchy traversal (org charts, category trees), transitive closure (graph reachability)
- Replacing repeated derived tables

## Basic Usage

### Window Function Syntax

```sql
SELECT 
    col1, col2,
    SUM(col3) OVER(PARTITION BY col1 ORDER BY col2) AS running_total,
    RANK() OVER(PARTITION BY col1 ORDER BY col3 DESC) AS rank_in_group
FROM table_name;
```

**The OVER clause:**
```sql
OVER ([PARTITION BY expr,...] [ORDER BY expr [ASC|DESC],...] [frame_clause])
```

- `OVER()` — entire result set is one partition
- `PARTITION BY` — split rows into groups (MySQL allows expressions, e.g., `PARTITION BY YEAR(dt)`)
- `ORDER BY` — sort within each partition; rows equal on ORDER BY are **peers**
- **Named windows**: `WINDOW w AS (PARTITION BY x ORDER BY y)` then `OVER w`

**Window function execution order**: after `WHERE`/`GROUP BY`/`HAVING`, before `ORDER BY`/`LIMIT`/`SELECT DISTINCT`. Window functions are only allowed in the SELECT list and query-level ORDER BY — never in WHERE (use a CTE/subquery to filter on window function results).

### The Frame Clause

A frame is a subset of the current partition. Only `ROWS` or `RANGE` frames are supported:

| Frame | Behavior |
|-------|----------|
| `ROWS BETWEEN ... AND ...` | Physical rows |
| `RANGE BETWEEN ... AND ...` | By value; includes all peers (default) |

Frame extent: `CURRENT ROW`, `UNBOUNDED PRECEDING`, `UNBOUNDED FOLLOWING`, `N PRECEDING`, `N FOLLOWING`.

**Default frame** (when ORDER BY present, no explicit frame): `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`

### Ranking Functions

```sql
SELECT name, score,
    ROW_NUMBER() OVER (ORDER BY score DESC) AS row_num,    -- 1,2,3,4,5 (no ties)
    RANK()       OVER (ORDER BY score DESC) AS rank_num,   -- 1,1,3,4,4 (gaps)
    DENSE_RANK() OVER (ORDER BY score DESC) AS dense_num   -- 1,1,2,3,3 (no gaps)
FROM students;
```

### LAG / LEAD — Row-to-Row Comparisons

```sql
SELECT 
    dt, revenue,
    LAG(revenue)  OVER (ORDER BY dt) AS prev_day,
    LEAD(revenue) OVER (ORDER BY dt) AS next_day,
    revenue - LAG(revenue) OVER (ORDER BY dt) AS day_change
FROM daily_sales;
-- LAG(expr, offset=1, default=NULL)
-- First row: LAG returns NULL (no previous row)
```

### FIRST_VALUE / LAST_VALUE / NTH_VALUE

```sql
SELECT dt, val,
    FIRST_VALUE(val) OVER (ORDER BY dt ROWS UNBOUNDED PRECEDING) AS first_val,
    LAST_VALUE(val)  OVER (ORDER BY dt ROWS BETWEEN UNBOUNDED PRECEDING 
                                          AND UNBOUNDED FOLLOWING) AS last_val,
    NTH_VALUE(val, 2) OVER (ORDER BY dt ROWS UNBOUNDED PRECEDING) AS second_val
FROM observations;
```

> **Critical**: The default frame `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` means `LAST_VALUE()` returns the current row's value, not the partition's last row. Always use `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` to get the true last value of the partition.

### NTILE — Bucketing

```sql
SELECT val, NTILE(4) OVER (ORDER BY val) AS quartile
FROM numbers;   -- divides rows into 4 roughly-equal buckets, returns 1-4
```

### CTE — Basic Syntax

```sql
WITH 
    order_totals AS (
        SELECT customer_id, SUM(amount) AS total
        FROM orders GROUP BY customer_id
    ),
    big_spenders AS (
        SELECT * FROM order_totals WHERE total > 1000
    )
SELECT c.name, b.total
FROM customers c JOIN big_spenders b ON c.id = b.customer_id;
```

### CTE — Filter on Window Function Results

```sql
WITH ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS rn
    FROM employees
)
SELECT * FROM ranked WHERE rn <= 3;  -- top 3 per department
```

### Recursive CTE

```sql
WITH RECURSIVE cte (n) AS (
    SELECT 1                           -- nonrecursive: seed row(s)
    UNION ALL
    SELECT n + 1 FROM cte WHERE n < 5  -- recursive: based on prior iteration
)
SELECT * FROM cte;  -- 1,2,3,4,5
```

**Recursive CTE rules:**
- Must have `RECURSIVE` keyword
- Two parts separated by `UNION ALL` (or `UNION DISTINCT`): nonrecursive seed + recursive part
- Recursive part references CTE name exactly once in `FROM` (not in subqueries)
- Recursion ends when recursive part yields no rows
- Column types come from the nonrecursive part only — use `CAST()` to widen if needed

**Recursive SELECT cannot contain:** `GROUP BY`, `ORDER BY`, `DISTINCT`, aggregate functions, window functions. `LIMIT` IS allowed (stops generation efficiently).

### Recursive CTE — Hierarchy Traversal

```sql
WITH RECURSIVE org_tree AS (
    SELECT id, name, manager_id, 0 AS depth
    FROM employees WHERE manager_id IS NULL    -- root
    UNION ALL
    SELECT e.id, e.name, e.manager_id, ot.depth + 1
    FROM employees e JOIN org_tree ot ON e.manager_id = ot.id
)
SELECT * FROM org_tree ORDER BY depth, name;
```

### Recursive CTE — Date Series

```sql
WITH RECURSIVE dates (dt) AS (
    SELECT '2025-01-01'
    UNION ALL
    SELECT dt + INTERVAL 1 DAY FROM dates WHERE dt < '2025-01-31'
)
SELECT dt FROM dates;
```

## Key APIs (Summary)

| Function | Returns | Notes |
|----------|---------|-------|
| `ROW_NUMBER()` | Row number (1..N) | Unique per row; nondeterministic without ORDER BY |
| `RANK()` | Rank with gaps | Ties share rank; next rank skips |
| `DENSE_RANK()` | Rank without gaps | Ties share rank; next rank is consecutive |
| `NTILE(N)` | Bucket number (1..N) | N must be literal positive integer |
| `LAG(expr, N, default)` | Value N rows before | N defaults to 1; default defaults to NULL |
| `LEAD(expr, N, default)` | Value N rows after | Same semantics as LAG |
| `FIRST_VALUE(expr)` | First row in frame | Respects frame definition |
| `LAST_VALUE(expr)` | Last row in frame | Mind the default frame! |
| `NTH_VALUE(expr, N)` | Nth row in frame | N must be positive integer |
| `CUME_DIST()` | Cumulative distribution (0–1) | row_position / total_rows |
| `PERCENT_RANK()` | Percent rank (0–1) | (rank-1) / (rows-1) |

**Aggregate window functions** (usable with OVER): `AVG`, `SUM`, `COUNT`, `MAX`, `MIN`, `STDDEV_POP`, `STDDEV_SAMP`, `VAR_POP`, `VARIANCE`, `BIT_AND`, `BIT_OR`, `BIT_XOR`, `JSON_ARRAYAGG`, `JSON_OBJECTAGG`.

## Caveats

### Window Functions
- **Default frame trap**: `LAST_VALUE()` with default frame returns current row, not partition-end. Use explicit `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`.
- **No WHERE filtering**: window functions run after WHERE/HAVING; wrap in CTE to filter.
- **`IGNORE NULLS` not supported**: only `RESPECT NULLS` (default).
- **`FROM LAST` not supported for NTH_VALUE**: use reverse ORDER BY instead.
- **No DISTINCT in aggregate window functions**: `SUM(DISTINCT col) OVER()` is illegal.
- **ORDER BY in a window ≠ query ORDER BY**: window ORDER BY only sorts within each partition, not the final result.

### CTEs
- **Missing RECURSIVE → ERROR 1146**: "Table doesn't exist" error if you forget the keyword.
- **One WITH per level**: `WITH a AS (...) WITH b AS (...)` is illegal → use `WITH a AS (...), b AS (...)`.
- **No forward references**: CTEs can only reference earlier CTEs in the same WITH clause.
- **Column truncation in recursive CTEs**: cast wide in the nonrecursive part: `CAST('abc' AS CHAR(100))`.
- **Recursive part must reference CTE exactly once** in FROM, not on RIGHT side of LEFT JOIN.
- **Recursion limit**: `cte_max_recursion_depth` defaults to 1000. Set session-level or use `/*+ SET_VAR(cte_max_recursion_depth = N) */` hint. Also consider `max_execution_time`.
- **OPTIMIZER COST**: EXPLAIN shows cost per iteration, not total — optimizer cannot predict recursion depth.

## Composition Hints

- **Top-N per group**: `ROW_NUMBER() OVER (PARTITION BY group ORDER BY metric DESC)` in a CTE, then `WHERE rn <= N` — the most common window function pattern.
- **Running totals**: `SUM(amount) OVER (ORDER BY dt ROWS UNBOUNDED PRECEDING)` — use ROWS not RANGE for strict row-by-row accumulation.
- **Moving average**: `AVG(val) OVER (ORDER BY dt ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)` for 7-day rolling average.
- **Recursive CTE for tree**: always include a depth counter and a termination condition. Use `UNION DISTINCT` instead of `UNION ALL` if cycles are possible (graph traversal).
- **Gap filling**: Use a recursive date-series CTE `LEFT JOIN`ed to sparse data with `COALESCE(SUM(val), 0)`.
- **Named windows reduce repetition**: when multiple functions share the same partitioning/ordering, define once with `WINDOW w AS (...)`.
- **Combine CTEs + window functions**: CTE computes the window function result, outer query filters/joins — avoids duplicating window logic.

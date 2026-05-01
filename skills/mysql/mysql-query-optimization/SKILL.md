---
name: mysql-query-optimization
description: MySQL 8.0 query optimizer internals — optimizer tracing, subquery strategies (semijoin/materialization/EXISTS), derived table merge vs materialization, and CTE optimization with hints.
tech_stack: [mysql]
language: [sql]
capability: [relational-db]
version: "MySQL 8.0"
collected_at: 2025-01-01
---

# MySQL Query Optimization

> Source: https://dev.mysql.com/doc/refman/8.0/en/optimization.html, https://dev.mysql.com/doc/refman/8.0/en/optimizer-tracing.html, https://dev.mysql.com/doc/refman/8.0/en/subquery-optimization.html, https://dev.mysql.com/doc/refman/8.0/en/derived-table-optimization.html

## Purpose
Understand and influence the MySQL 8.0 query optimizer's decision-making process. Covers optimizer tracing for diagnosing plan choices, subquery rewrite strategies (semijoin, materialization, EXISTS), derived table merging/materialization rules, and CTE-specific behaviors.

## When to Use
- A query is slow and EXPLAIN output doesn't reveal the full reasoning
- You need to tune subqueries, derived tables, CTEs, or view references
- Diagnosing why the optimizer chose materialization over merging (or vice versa)
- Working with CTEs referenced multiple times and need to control one-time materialization

## Basic Usage

### Enable Optimizer Tracing
```sql
SET optimizer_trace='enabled=on';
-- run your query here
SELECT * FROM INFORMATION_SCHEMA.OPTIMIZER_TRACE;
SET optimizer_trace='enabled=off';
```

### Subquery Optimization Strategies
The optimizer chooses among these for `IN`/`= ANY`/`EXISTS` subqueries:
| Strategy | Behavior |
|----------|----------|
| **Semijoin** | Rewrites subquery as a join, deduplicating results |
| **Materialization** | Executes subquery once into a temp table with index |
| **EXISTS** | Correlated execution, one probe per outer row |

For `NOT IN`/`<> ALL`/`NOT EXISTS`: Materialization or EXISTS only.

### Derived Table Merge vs Materialize
The optimizer handles derived tables, views, and CTEs identically:

**Merge** — folds the derived table into the outer query. The derived table reference disappears from the plan; only its base tables appear. This enables condition pushdown.

**Materialize** — executes the derived table into an internal temporary table, possibly adding an auto-generated index for `ref` access.

```sql
-- This derived table MERGES (disappears):
SELECT * FROM (SELECT * FROM t1) AS dt;

-- Equivalent after merging:
SELECT * FROM t1;
```

Merge is the default. The optimizer avoids materialization unless forced.

### Controlling Merge Behavior
```sql
-- System-wide: disable derived merge
SET optimizer_switch='derived_merge=off';

-- Per-query hints:
SELECT /*+ NO_MERGE(dt) */ ... FROM (SELECT ...) AS dt ...
SELECT /*+ MERGE(cte1) NO_MERGE(cte2) */ ... WITH cte1 AS (...), cte2 AS (...) ...
```

### Constructs That Prevent Merging
Any of these in the subquery forces materialization:
- Aggregate/window functions (`SUM`, `COUNT`, `ROW_NUMBER`, etc.)
- `DISTINCT`, `GROUP BY`, `HAVING`
- `LIMIT`
- `UNION` / `UNION ALL`
- Subqueries in the SELECT list
- User variable assignments
- References only to literal values (no underlying table)

### CTE-Specific Rules
- A CTE is materialized **once** per query, even if referenced multiple times
- **Recursive CTEs are always materialized** — you cannot force merge
- Optimizer auto-creates indexes on materialized CTEs; may create multiple indexes for different references
- Optimizer trace shows `creating_tmp_table` once + `reusing_tmp_table` for each subsequent reference

### ORDER BY Propagation
An `ORDER BY` in a derived table propagates to the outer query **only** when:
1. Outer query is not grouped/aggregated
2. Outer query has no `DISTINCT`, `HAVING`, or `ORDER BY`
3. The derived table is the **only** source in `FROM`

Otherwise the `ORDER BY` is silently dropped.

## Key APIs (Summary)
| Mechanism | Interface |
|-----------|-----------|
| Optimizer trace | `SET optimizer_trace='enabled=on'`; read `INFORMATION_SCHEMA.OPTIMIZER_TRACE` |
| Merge hints | `/*+ MERGE(tbl) */`, `/*+ NO_MERGE(tbl) */` |
| System flag | `optimizer_switch='derived_merge=on/off'` |
| View algorithm | `CREATE ALGORITHM=TEMPTABLE VIEW ...` to force materialization |
| CTE hint per reference | `/*+ MERGE(cte1) NO_MERGE(cte2) */` — each CTE ref gets its own hint |

## Caveats
- **UPDATE/DELETE subquery limitation**: Semijoin and materialization are NOT used for subqueries modifying a single table. Rewrite as multi-table JOIN.
- **61-table merge limit**: If merging causes >61 base tables in the outer query, materialization is forced.
- **ORDER BY silently dropped** if outer query has GROUP BY, DISTINCT, HAVING, ORDER BY, or multiple FROM sources.
- **Pre-8.0.16**: Materialized CTEs with `internal_tmp_disk_storage_engine=MYISAM` caused errors. Fixed in 8.0.16+ (TempTable always uses InnoDB on disk).
- **Recursive CTEs can never be merged** — materialization is mandatory.
- **`ALGORITHM` on CREATE VIEW** only affects the SELECT, not any preceding WITH clause.

## Composition Hints
- Pair with `mysql-index-optimization` — optimizer trace output references index decisions; EXPLAIN formats complement each other
- Pair with `mysql-window-functions-cte` — CTE materialization behavior directly affects window function query performance
- Before diagnosing slow queries, first check `mysql-schema-design` — poor schema drives bad optimizer choices
- Use `mysql-transaction-isolation` to understand how isolation levels interact with subquery execution (locking reads in subqueries)

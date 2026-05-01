---
name: mysql-partitioning
description: MySQL 8.0 table partitioning — types, syntax, partition pruning, and management operations
tech_stack: [mysql]
language: [sql]
capability: [relational-db]
version: "MySQL 8.0"
collected_at: 2025-01-01
---

# MySQL Partitioning

> Source: https://dev.mysql.com/doc/refman/8.0/en/partitioning.html, https://dev.mysql.com/doc/refman/8.0/en/partitioning-types.html, https://dev.mysql.com/doc/refman/8.0/en/partitioning-pruning.html

## Purpose

Design, create, and manage partitioned tables in MySQL 8.0. Covers all four partition types (RANGE, LIST, HASH, KEY) with their COLUMNS extensions, the partition pruning optimization, date-based partitioning patterns, and partition lifecycle management.

## When to Use

- Large tables where queries consistently filter on a known column (date, region, tenant ID)
- Time-series data that benefits from date-range pruning
- Data lifecycle management: fast purge via `DROP PARTITION` instead of `DELETE`
- Physically segregating data while maintaining a single logical table
- When partition-level DDL (TRUNCATE, REBUILD) is more efficient than row-level operations

## Basic Usage

### Choosing a Partition Type

| Type | Best For | Expression | Date Support |
|---|---|---|---|
| **RANGE** | Continuous ranges (dates, IDs) | Integer expression | Via `YEAR()`, `TO_DAYS()`, `TO_SECONDS()` |
| **LIST** | Discrete categories (region, status) | Integer expression | Via function returning integer |
| **HASH** | Even data distribution | User-defined integer expression | Via function returning integer |
| **KEY** | Even distribution, non-integer columns | MySQL's internal hash | Native DATE/TIME/DATETIME support |
| **RANGE COLUMNS** | Multi-column ranges | Column list (non-integer OK) | Native DATE/DATETIME support |
| **LIST COLUMNS** | Multi-column discrete sets | Column list (non-integer OK) | Native DATE/DATETIME support |

### RANGE Partitioning (most common)

```sql
CREATE TABLE orders (
    id INT NOT NULL,
    order_date DATE NOT NULL,
    amount DECIMAL(10,2)
)
PARTITION BY RANGE( YEAR(order_date) ) (
    PARTITION p2021 VALUES LESS THAN (2022),
    PARTITION p2022 VALUES LESS THAN (2023),
    PARTITION p2023 VALUES LESS THAN (2024),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);
```

### LIST Partitioning

```sql
CREATE TABLE users (
    id INT NOT NULL,
    region_code TINYINT UNSIGNED NOT NULL,
    name VARCHAR(100)
)
PARTITION BY LIST(region_code) (
    PARTITION r_emea VALUES IN (1, 2, 3),
    PARTITION r_apac VALUES IN (4, 5, 6),
    PARTITION r_amer VALUES IN (7, 8, 9)
);
```

### HASH / KEY Partitioning

```sql
-- HASH: user-defined expression
PARTITION BY HASH( customer_id )
PARTITIONS 16;

-- KEY: MySQL's internal hash, works with non-integer columns
PARTITION BY KEY( email )
PARTITIONS 16;
```

### Partition Management DDL

```sql
-- Add a new partition (RANGE/LIST)
ALTER TABLE orders ADD PARTITION (
    PARTITION p2024 VALUES LESS THAN (2025)
);

-- Drop a partition and all its data (instant!)
ALTER TABLE orders DROP PARTITION p2021;

-- Truncate partition data only
ALTER TABLE orders TRUNCATE PARTITION p2022;

-- Reorganize (split or merge)
ALTER TABLE orders REORGANIZE PARTITION p_future INTO (
    PARTITION p2024 VALUES LESS THAN (2025),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- Reduce HASH/KEY partition count
ALTER TABLE orders COALESCE PARTITION 4;
```

## Key APIs (Summary)

### Partition Information

```sql
-- List all partitions with row counts and sizes
SELECT PARTITION_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH
FROM INFORMATION_SCHEMA.PARTITIONS
WHERE TABLE_NAME = 'orders';

-- Check which partition a value maps to (RANGE/LIST)
EXPLAIN SELECT * FROM orders WHERE order_date = '2023-06-15';
-- Look for "partitions" column in output
```

### Partition Pruning Rules

The optimizer eliminates partitions that cannot contain matching rows. Pruning activates when the WHERE clause reduces to:

- `partition_expr = constant`
- `partition_expr IN (c1, c2, ...)`
- `partition_expr <|>|<=|>=|<> constant`
- `partition_expr BETWEEN c1 AND c2`

Short ranges are internally converted to `IN` lists for pruning. Works for `SELECT`, `DELETE`, `UPDATE`. `INSERT` implicitly accesses only the target partition.

**Date functions optimized for pruning**: `YEAR()`, `TO_DAYS()`, `TO_SECONDS()`. Other functions (`MONTH()`, `WEEKDAY()`) work but may be less efficient.

### Pruning per Partition Type

| Type | Pruning Mechanism |
|---|---|
| RANGE | Range boundaries mapped to partition list |
| LIST | Values mapped to partition membership |
| RANGE COLUMNS / LIST COLUMNS | Multi-column pruning supported |
| HASH / KEY | `=` and short-range `IN` only; range must be **smaller than partition count**; **integer columns only** |

## Caveats

### Storage Engine Constraints
- Partitioning only works with **InnoDB** and **NDB** in MySQL 8.0. MyISAM partitioned tables fail with `ER_CHECK_NOT_IMPLEMENTED`.
- No special `my.cnf` configuration needed; InnoDB partitioning cannot be disabled.

### HASH/KEY Pruning Gotchas
- Pruning only applies when the WHERE range size is **strictly less than** the number of partitions. Example: 8-partition table with `WHERE id BETWEEN 4 AND 12` (9 values) → **no pruning**.
- Only works on **integer columns**. `WHERE dob BETWEEN ...` on a KEY-partitioned `DATE` column → no pruning, even though KEY accepts non-integer columns for distribution.
- Use `RANGE` or `RANGE COLUMNS` for date-range pruning instead.

### Invalid DATE/DATETIME Values
- Invalid date values (e.g., `'2008-12-00'`) are treated as `NULL` in WHERE clauses against partitioned tables → the query silently returns **zero rows**.

### Partition Naming
- Partition names are **case-insensitive**: `p2021` and `P2021` collide.
- Partition count must be a positive integer literal, no leading zeros, no expressions.

### RANGE/LIST Design Rules
- Every partition number must have a corresponding definition. Use `MAXVALUE` as a catch-all for RANGE.
- For `RANGE COLUMNS` with multiple columns, `VALUES LESS THAN` must match column count.
- HASH expression must evaluate to an integer; KEY handles this automatically.

## Composition Hints

- **Prerequisite**: mysql-schema-design — column type choices (DATE vs INT, UUID vs auto-increment) affect partitioning strategy
- **Companion**: mysql-query-optimization — verify pruning with `EXPLAIN`; check that `partitions` column shows only expected partitions
- **Related**: mysql-backup-recovery — partition-level backup strategies (backup active partitions only, drop old partitions)
- Always verify pruning with `EXPLAIN` before deploying — the optimizer may not prune when you expect it to
- For time-series: prefer `RANGE` on `TO_DAYS()` or `RANGE COLUMNS` on `DATE` for reliable pruning; avoid HASH/KEY for date-based queries

---
name: mysql-schema-design
description: MySQL schema design decisions — PK selection (UUID vs auto-increment), character sets and collations, temporal type pitfalls, normalization trade-offs, and data type sizing.
tech_stack: [mysql]
language: [sql]
capability: [relational-db]
version: "MySQL 8.4"
collected_at: 2025-07-17
---

# MySQL Schema Design

> Source: https://dev.mysql.com/doc/refman/8.4/en/data-types.html, https://dev.mysql.com/doc/refman/8.4/en/charset.html, https://dev.mysql.com/doc/refman/8.4/en/optimization.html, https://dev.mysql.com/doc/refman/8.4/en/innodb-index-types.html

## Purpose

Schema design decisions made at CREATE TABLE time have irreversible performance consequences. The three highest-leverage choices are: **primary key type** (affects every secondary index and insert pattern), **character set / collation** (affects storage, comparison, and joins), and **temporal type** (affects range, timezone behavior, and future-proofing). Getting these wrong at design time creates tech debt that requires a table rebuild to fix.

## When to Use

Every new table design should evaluate:

| Decision | Question |
|----------|----------|
| PK type | UUID vs auto-increment BIGINT? Distributed systems vs single-writer? |
| Character set | `utf8mb4` for everything new. `latin1` only for legacy interop. |
| Collation | `_ai_ci` (accent/case-insensitive) for search, `_bin` for exact match. |
| Temporal type | `TIMESTAMP` for auto-update + timezone-aware, `DATETIME` for fixed point-in-time, dates beyond 2038. |
| Integer sizing | `TINYINT` for flags, `INT` for most IDs, `BIGINT` for high-volume PKs. |
| Normalization | Third-normal form by default; denormalize only with measured benefit. |
| Large-table splits | Vertical (column groups) or horizontal (partitioning) — decided at design time. |

## Basic Usage

### Rule 1: Always Define a PRIMARY KEY

InnoDB uses the PK as the **clustered index** — the physical row order on disk. If you omit a PK, the fallback chain is:

1. First `UNIQUE` index with all `NOT NULL` columns (brittle — may pick the wrong one)
2. Hidden `GEN_CLUST_INDEX` on a 6-byte synthetic row ID (invisible, unqueryable, useless for lookups)

**Always define an explicit PK.** If no natural key exists, use `BIGINT UNSIGNED AUTO_INCREMENT`.

### Rule 2: Short PKs Save Space Everywhere

Every secondary index in InnoDB stores the PK value in its leaf nodes. A 36-byte `CHAR(36)` UUID PK means every secondary index entry carries 36 bytes of overhead. An 8-byte `BIGINT` PK means 8 bytes.

```sql
-- ❌ 36-byte PK bloats every secondary index
CREATE TABLE bad_orders (
  id CHAR(36) NOT NULL,               -- UUID as PK, 36 bytes
  customer_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_customer (customer_id)    -- each entry stores 36-byte id!
);

-- ✅ Compact PK, predictable insert order
CREATE TABLE good_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_customer (customer_id)    -- each entry stores 8-byte id
);

-- ✅ Compromise for distributed systems: BINARY(16) UUID v7 (time-ordered)
CREATE TABLE dist_orders (
  id BINARY(16) NOT NULL,             -- 16 bytes, time-ordered
  customer_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_customer (customer_id)    -- 16 bytes overhead
);
```

**Insert performance matters too:** `AUTO_INCREMENT` inserts sequentially at the B-tree tail. Random UUIDs (v4) scatter inserts across pages, causing page splits, fragmenting the buffer pool, and hurting write throughput. UUID v7 (timestamp-prefixed) mitigates this.

### Rule 3: utf8mb4, Always

MySQL's `UTF8` charset is a lie — it's `utf8mb3` (3 bytes per char max), meaning no emoji, no supplementary Unicode planes, and broken CJK extension characters. `utf8mb4` is the real UTF-8.

```sql
-- ❌ Silently breaks on emoji
CREATE TABLE bad_users (name VARCHAR(100)) CHARACTER SET utf8;

-- ✅ Correct
CREATE TABLE good_users (name VARCHAR(100)) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
```

**Collation choice:**
- `utf8mb4_0900_ai_ci` — Default in 8.0+. Accent-insensitive, case-insensitive. Best for general search.
- `utf8mb4_bin` — Exact byte comparison. Use for case-sensitive data (tokens, API keys, paths).
- `utf8mb4_general_ci` — Legacy, faster but less accurate than `_0900_` collations. Avoid in new designs.

The `_0900_` collations are based on Unicode 9.0 and handle sorting/case-folding correctly for modern scripts.

### Rule 4: TIMESTAMP vs DATETIME

```sql
CREATE TABLE events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  -- TIMESTAMP: 4 bytes, UTC storage, auto-converts to session timezone.
  -- Good for: audit timestamps, auto-update. Range ends 2038-01-19.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- DATETIME: ~5 bytes + fractional, stores literal value, no timezone conversion.
  -- Good for: future dates beyond 2038, fixed-point-in-time events.
  scheduled_for DATETIME NOT NULL,

  -- Explicit fractional seconds: MySQL defaults to 0 (not standard SQL's 6)!
  precise_at DATETIME(3) NOT NULL     -- millisecond precision
);
```

| Type | Range | TZ-aware | Storage | Best for |
|------|-------|----------|---------|----------|
| `TIMESTAMP` | 1970–2038 | Yes (UTC) | 4B + fsp | Audit, auto-update, timezone-dependent |
| `DATETIME` | 1000–9999 | No | 5B+ (8.0.28+) | Future dates, fixed points in time |

**The TIMESTAMP trap:** If you change the server or session timezone, TIMESTAMP values appear to change. `DATETIME` values stay constant. Pick based on whether the event's wall-clock time or the UTC instant matters.

### Rule 5: Right-Size Integer Types

| Type | Bytes | Signed Range | Unsigned Range |
|------|-------|-------------|----------------|
| `TINYINT` | 1 | -128..127 | 0..255 |
| `SMALLINT` | 2 | -32K..32K | 0..65K |
| `MEDIUMINT` | 3 | -8M..8M | 0..16M |
| `INT` | 4 | -2B..2B | 0..4B |
| `BIGINT` | 8 | -9E..9E | 0..18E |

For PKs that might grow, just use `BIGINT UNSIGNED`. The 4 extra bytes over `INT` are negligible compared to the pain of an ALTER TABLE on a huge table. Use `TINYINT` for boolean/enum flags, `INT` for most foreign keys, `BIGINT` for PKs and high-cardinality FKs.

## Key APIs (Summary)

- `CREATE TABLE ... CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci` — Table-level charset.
- `ALTER TABLE t CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci` — Convert existing table (rebuilds it; takes a metadata lock).
- `SET NAMES 'utf8mb4'` — Set connection charset. Equivalent to setting `character_set_client`, `character_set_results`, `character_set_connection` together.
- `SHOW CHARACTER SET` / `SHOW COLLATION` — List available charsets and collations.
- `SHOW CREATE TABLE t` — Inspect current charset/collation per table.
- `SELECT @@character_set_database, @@collation_database` — Current DB defaults.

## Caveats

1. **`UTF8` ≠ UTF-8**: MySQL `utf8` = `utf8mb3`. Cannot store emoji, 4-byte CJK, or supplementary characters. This alias will be removed in a future version. **Always write `utf8mb4` explicitly.**
2. **Collation mismatch breaks joins**: `SELECT * FROM a JOIN b ON a.name = b.name` fails with "Illegal mix of collations" if columns have different collations. Keep collation consistent within a database.
3. **TIMESTAMP 2038**: Like the Unix epoch Y2K. `TIMESTAMP` values beyond 2038-01-19 store as `0000-00-00` (or error in strict mode). Use `DATETIME` for future dates.
4. **No PK = hidden 6-byte row ID you can't query**: InnoDB creates `GEN_CLUST_INDEX` but it's invisible. You can't use it in queries, replication, or foreign keys. Always define an explicit PK.
5. **Long PKs silently bloat every index**: A `VARCHAR(255)` PK means every secondary index stores 255 bytes per entry. On a table with 5 secondary indexes and 1M rows, that's ~1.2 GB wasted vs a BIGINT PK.
6. **Fractional seconds default to 0**: Standard SQL says `DATETIME` should default to 6 fractional digits. MySQL defaults to 0. Always write `DATETIME(3)` or `TIMESTAMP(3)` explicitly.
7. **UUID v4 destroys insert performance**: Random UUIDs scatter new rows across the B-tree, causing page splits and fragmenting the buffer pool. Use auto-increment for single-writer, UUID v7 (time-ordered) for distributed.
8. **`ALTER TABLE ... CONVERT TO CHARACTER SET` takes a full table copy**: Plan for downtime or use an online schema change tool. The statement reads every row, converts, and writes back.
9. **Mixed storage engines complicate backups**: MyISAM tables require `LOCK TABLES` for consistent dumps; InnoDB handles `--single-transaction`. Avoid MyISAM in new designs.

## Composition Hints

- **With mysql-index-optimization**: PK choice directly determines secondary index size. After choosing a short PK, the next layer is selecting the right secondary indexes for query patterns.
- **With mysql-innodb**: Clustered index behavior (B-tree physical ordering, page splits on random inserts) is an InnoDB implementation detail. Schema decisions should account for how InnoDB lays out rows.
- **With mysql-partitioning**: When a table is too large for a single B-tree, horizontal partitioning is the next step. Schema design should anticipate partition keys (usually a date column).
- **With mysql-json**: JSON columns may suggest a more denormalized design. Character set and collation choices for JSON columns follow the same rules as regular text columns.
- **With mysql-backup-recovery**: Schema design affects backup strategy — large tables favor physical backups (XtraBackup) over logical (mysqldump), which may influence how aggressively you normalize.

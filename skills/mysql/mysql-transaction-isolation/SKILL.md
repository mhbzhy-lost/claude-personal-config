---
name: mysql-transaction-isolation
description: InnoDB locking mechanisms, isolation levels, and deadlock diagnosis for MySQL 8.0
tech_stack: [mysql]
language: [sql]
capability: [relational-db]
version: "MySQL 8.0"
collected_at: 2025-01-01
---

# InnoDB Transaction Isolation & Locking

> Source: https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-model.html, https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html, https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlock-detection.html

## Purpose

Understand and troubleshoot InnoDB's locking model, including the seven lock types, how they interact under different isolation levels, and how to diagnose and prevent deadlocks. Covers the mechanics behind `SELECT ... FOR UPDATE`, gap locking, next-key locking, and phantom row prevention.

## When to Use

- Diagnosing lock wait timeouts and lock contention
- Understanding what locks a given SQL statement acquires under REPEATABLE READ vs READ COMMITTED
- Troubleshooting deadlocks via `SHOW ENGINE INNODB STATUS`
- Deciding whether to use READ COMMITTED (gap-lock-free) vs REPEATABLE READ (phantom-safe)
- Designing concurrent write patterns that minimize lock conflicts
- Interpreting InnoDB monitor lock output

## Basic Usage

### Isolation Levels and Locking Behavior

| Isolation Level | Gap Locking | Phantom Protection | Nonmatching Row Locks |
|---|---|---|---|
| READ COMMITTED | Disabled (except FK/dup checks) | No | Released after WHERE evaluation |
| REPEATABLE READ (default) | Enabled via next-key locks | Yes | Held until transaction ends |
| SERIALIZABLE | Enabled + reads become `FOR SHARE` | Yes | Held until transaction ends |

### Locking Reads

```sql
-- Shared lock (IS at table level, S on matching rows)
SELECT * FROM t WHERE id = 10 FOR SHARE;

-- Exclusive lock (IX at table level, X on matching rows)
SELECT * FROM t WHERE id = 10 FOR UPDATE;

-- Range scan — next-key locks under REPEATABLE READ
SELECT * FROM t WHERE id BETWEEN 10 AND 20 FOR UPDATE;
```

### Diagnosing Locks

```sql
-- Full lock and transaction report
SHOW ENGINE INNODB STATUS\G

-- Focus on latest deadlock only
SHOW ENGINE INNODB STATUS\G | grep -A 50 "LATEST DETECTED DEADLOCK"

-- Current transactions and their locks (MySQL 8.0)
SELECT * FROM performance_schema.data_locks;
SELECT * FROM performance_schema.data_lock_waits;
```

### Deadlock Detection Control

```sql
-- Disable deadlock detection on high-concurrency systems
SET GLOBAL innodb_deadlock_detect = OFF;

-- Then rely on timeout instead
SET GLOBAL innodb_lock_wait_timeout = 5;
```

## Key APIs (Summary)

### The Seven Lock Types

| Lock Type | Level | Purpose | Key Behavior |
|---|---|---|---|
| **Shared (S)** | Row | Read a row | Multiple S locks compatible |
| **Exclusive (X)** | Row | Update/delete a row | Blocks all other S/X locks |
| **Intention Shared (IS)** | Table | Signal intent to set row S locks | Set by `FOR SHARE` |
| **Intention Exclusive (IX)** | Table | Signal intent to set row X locks | Set by `FOR UPDATE` |
| **Record Lock** | Index record | Lock single index entry | `lock_mode X locks rec but not gap` |
| **Gap Lock** | Gap between indexes | Prevent inserts into gap | Pure-inhibitive; gaps can co-exist; disabled in READ COMMITTED |
| **Next-Key Lock** | Record + preceding gap | Prevent phantom rows | Default in REPEATABLE READ; = record lock + gap lock |
| **Insert Intention** | Gap (special) | Signal INSERT intent | Non-conflicting with other insert intentions at different positions |
| **AUTO-INC** | Table | Serialize AUTO_INCREMENT inserts | Controlled by `innodb_autoinc_lock_mode` |

### Interpreting SHOW ENGINE INNODB STATUS Lock Output

```
lock_mode X locks rec but not gap           → Record lock
lock_mode X                                 → Next-key lock
lock_mode X locks gap before rec            → Gap lock
lock_mode X locks gap before rec insert intention → Insert intention lock
```

### Key Configuration Variables

| Variable | Default | Purpose |
|---|---|---|
| `innodb_deadlock_detect` | ON | Enable/disable automatic deadlock detection |
| `innodb_lock_wait_timeout` | 50 (sec) | How long to wait before rolling back |
| `innodb_table_locks` | 1 | InnoDB awareness of MySQL-level table locks |
| `innodb_autoinc_lock_mode` | 2 | AUTO-INC locking algorithm (0=traditional, 1=consecutive, 2=interleaved) |

### Intention Lock Compatibility Matrix

|     | X | IX | S | IS |
|-----|---|---|---|---|
| **X** | ✗ | ✗ | ✗ | ✗ |
| **IX** | ✗ | ✓ | ✗ | ✓ |
| **S** | ✗ | ✗ | ✓ | ✓ |
| **IS** | ✗ | ✓ | ✓ | ✓ |

Intention locks only block full-table requests (`LOCK TABLES ... WRITE`).

## Caveats

### Gap Locking Disabled Under READ COMMITTED
- Gap locks are *only* used for foreign-key and duplicate-key checking
- Nonmatching row locks are released immediately after WHERE evaluation
- UPDATEs use "semi-consistent reads" — returns latest committed version for WHERE matching
- **Tradeoff**: higher concurrency but no phantom row protection

### Unique Index Exception
- Gap locking is **not** used for exact-match lookups on a unique index (e.g., `WHERE id = 100` with `id` PRIMARY KEY)
- **But**: if only a subset of a multi-column unique index is used, gap locking still occurs

### Deadlock Detection Limits
- Wait-for list is capped at **200 transactions** — exceeded ⇒ treated as deadlock, rolling back the checker
- Locking thread must examine ≤ **1,000,000 locks** — exceeded ⇒ same forced rollback
- InnoDB rolls back the **smallest** transaction (fewest inserted/updated/deleted rows)
- Table locks from `LOCK TABLES` or non-InnoDB engines are invisible unless `innodb_table_locks=1` AND `autocommit=0`

### High-Concurrency Deadlock Detection Overhead
- When many threads queue for the same lock, deadlock detection itself becomes a bottleneck
- Disable via `innodb_deadlock_detect = OFF` and depend on `innodb_lock_wait_timeout`

### Phantom Row Prevention
Under REPEATABLE READ, next-key locks cover:
- (negative infinity, 10] — (10, 11] — (11, 13] — (13, 20] — (20, positive infinity)
- The final lock covers only the gap after the max value (supremum pseudo-record)

## Composition Hints

- **Prerequisite**: mysql-innodb for InnoDB architecture context (MVCC, clustered indexes, undo/redo)
- **Companion**: mysql-schema-design — index design directly affects lock granularity (unique vs non-unique indexes change gap lock behavior)
- **Related**: mysql-query-optimization — understanding locking helps explain why some query patterns cause contention
- The `performance_schema.data_locks` and `data_lock_waits` tables (MySQL 8.0+) are preferred over `SHOW ENGINE INNODB STATUS` for programmatic lock analysis

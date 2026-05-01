---
name: mysql-innodb
description: InnoDB storage engine internals — buffer pool, redo/undo logs, MVCC, row-level locking, transaction isolation, and deadlock diagnosis for MySQL 8.0
tech_stack: [mysql]
language: [sql]
capability: [relational-db, observability]
version: "MySQL 8.0"
collected_at: 2025-01-01
---

# InnoDB Storage Engine

> Source: https://dev.mysql.com/doc/refman/8.0/en/innodb-storage-engine.html, https://dev.mysql.com/doc/refman/8.0/en/innodb-architecture.html, https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-transaction-model.html, https://dev.mysql.com/doc/refman/8.0/en/innodb-on-disk-structures.html

## Purpose

InnoDB is the default MySQL 8.0 storage engine. It provides full **ACID-compliant transactions** via row-level locking, multi-version concurrency control (MVCC), and crash recovery through a redo/undo log architecture. It is the only MySQL engine that supports foreign keys and online hot backups.

## When to Use

- High-concurrency **OLTP workloads** needing row-level locking and non-blocking reads via MVCC
- Any application requiring **ACID guarantees** with crash recovery
- Schemas with **foreign key constraints**
- Workloads needing **hot/online backups** (MySQL Enterprise Backup, Percona XtraBackup)
- Performance tuning of memory (buffer pool), I/O (redo log), and lock contention

## Basic Usage

### Essential Configuration

```ini
[mysqld]
# Buffer pool: 50-80% of available RAM — the single most important setting
innodb_buffer_pool_size = 12G
innodb_buffer_pool_instances = 12        # 1 per GB, max 64

# Redo log: size for ~1 hour of peak writes; larger = less checkpoint I/O
innodb_log_file_size = 2G
innodb_log_files_in_group = 2

# Durability: 1 = full ACID, 0/2 = faster but may lose last ~1s on crash
innodb_flush_log_at_trx_commit = 1
innodb_flush_method = O_DIRECT           # Avoids double-buffering on Linux

# File-per-table: enables per-table .ibd files (recommended)
innodb_file_per_table = ON

# Change buffering: defers secondary index I/O; all operations
innodb_change_buffering = all
```

### Monitoring Health

```sql
-- Comprehensive status: deadlocks, buffer pool, transactions, I/O
SHOW ENGINE INNODB STATUS\G

-- Buffer pool hit ratio (target >99%)
SELECT (1 - Innodb_buffer_pool_reads / Innodb_buffer_pool_read_requests) * 100
  AS hit_pct FROM performance_schema.global_status
 WHERE VARIABLE_NAME IN ('Innodb_buffer_pool_reads', 'Innodb_buffer_pool_read_requests');

-- Active transactions and lock waits (8.0 preferred path)
SELECT * FROM information_schema.INNODB_TRX;
SELECT * FROM performance_schema.data_locks;
SELECT * FROM performance_schema.data_lock_waits;
```

### Diagnosing Deadlocks

```sql
SHOW ENGINE INNODB STATUS\G
-- Look for "LATEST DETECTED DEADLOCK" section:
--   Transaction 1: locks held, locks waited
--   Transaction 2: locks held, locks waited
--   "WE ROLL BACK TRANSACTION (1)" — victim

-- Or enable deadlock logging to error log
SET GLOBAL innodb_print_all_deadlocks = ON;
```

### Choosing Isolation Level

```sql
-- Session level:
SET SESSION transaction_isolation = 'READ-COMMITTED';  -- No gap locks, phantom reads possible
SET SESSION transaction_isolation = 'REPEATABLE-READ';  -- Default, gap locks prevent phantoms
```

## Key APIs (Summary)

### Critical Configuration Parameters

| Parameter | Purpose | Guidance |
|-----------|---------|----------|
| `innodb_buffer_pool_size` | Primary memory cache for data/index pages | 50-80% RAM |
| `innodb_log_file_size` | Individual redo log file size | Large enough for ~1h of writes |
| `innodb_flush_log_at_trx_commit` | Redo log flush on commit (0/1/2) | 1=durable, 2=crash-safe w/ 1s loss |
| `innodb_flush_method` | I/O sync method | O_DIRECT on Linux |
| `innodb_file_per_table` | One .ibd per table vs shared ibdata1 | ON (recommended) |
| `innodb_change_buffering` | Which ops to buffer for secondary indexes | all |
| `innodb_adaptive_hash_index` | Auto-build hash indexes for hot pages | OFF if contention observed |
| `innodb_deadlock_detect` | Automatic deadlock detection | OFF + use timeout at >1000 concurrent txns |
| `innodb_lock_wait_timeout` | Seconds before lock wait aborts | Default 50; lower for fast-fail |
| `innodb_autoinc_lock_mode` | AUTO_INCREMENT locking strategy | 2 (interleaved) for high INSERT concurrency |
| `transaction_isolation` | READ-UNCOMMITTED / READ-COMMITTED / REPEATABLE-READ / SERIALIZABLE | READ-COMMITTED for high concurrency |

### InnoDB Lock Types

| Lock | Scope | Purpose |
|------|-------|---------|
| Record Lock | Single index record | Locks one row |
| Gap Lock | Between index records | Prevents INSERT into gap (phantom prevention) |
| Next-Key Lock | Record + preceding gap | Default REPEATABLE READ lock; prevents phantoms |
| Insert Intention Lock | Gap (before INSERT) | Signals intent; non-blocking between inserts to same gap |
| Intention Lock (IS/IX) | Table level | Signals intent to set row-level S/X locks |
| AUTO-INC Lock | Table level | Serializes AUTO_INCREMENT assignments |

### Key Monitoring Tables

- `information_schema.INNODB_BUFFER_POOL_STATS` — page hit rates, LRU stats
- `information_schema.INNODB_TRX` — active transactions, lock waits
- `performance_schema.data_locks` — all current locks (8.0+)
- `performance_schema.data_lock_waits` — blocked lock requests
- `information_schema.INNODB_METRICS` — 200+ counters for buffer, I/O, locks, compression

## Caveats

- **REPEATABLE READ gap locks cause deadlocks** under high concurrency — switch to READ COMMITTED if phantom prevention is not required
- **Large redo logs = longer crash recovery**: More redo to apply on restart after unclean shutdown
- **`innodb_flush_log_at_trx_commit ≠ 1`** risks losing committed transactions on crash
- **`innodb_file_per_table = OFF`** stores all data in `ibdata1` which never shrinks — DROP TABLE won't reclaim disk
- **Long-running transactions** cause undo log bloat, slowing MVCC reads; keep transactions short
- **Change buffer merges** cause I/O spikes during secondary index maintenance on cold pages
- **Adaptive hash index** contention under heavy concurrent joins/sorts — monitor and disable if observed
- **Deadlock detection overhead** at >1000 concurrent transactions — consider `innodb_deadlock_detect = OFF` with `innodb_lock_wait_timeout`
- **AUTO-INC table-level lock** serializes high-rate inserts — use `innodb_autoinc_lock_mode = 2`

## Composition Hints

- **Indexes live in InnoDB**: B-tree primary keys are clustered; secondary indexes store PK. Designing efficient indexes requires understanding InnoDB's page layout — see `mysql-index-optimization`
- **Transactions + replication**: InnoDB's redo log feeds binary log for replication — `innodb_flush_log_at_trx_commit` and `sync_binlog` should be aligned for durability
- **Backup tools**: MySQL Enterprise Backup and XtraBackup interact directly with InnoDB's on-disk structures (tablespaces, redo log) for hot backups — see `mysql-backup-recovery`
- **Isolation + deadlocks**: The transaction isolation skill (`mysql-transaction-isolation`) covers gap/next-key lock details and deadlock avoidance patterns in depth
- **Buffer pool and query plans**: The optimizer's cost model considers whether pages are likely in the buffer pool — buffer pool sizing affects EXPLAIN cost estimates
- **Schema design**: InnoDB's clustered PK means PK choice (UUID vs auto-increment) dramatically affects insert performance and fragmentation — see `mysql-schema-design`

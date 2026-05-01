---
name: mysql-backup-recovery
description: MySQL backup and recovery strategies — mysqldump logical backups, Percona XtraBackup physical hot backups, and binlog-based point-in-time recovery.
tech_stack: [mysql]
language: [sql, bash]
capability: [relational-db]
version: "MySQL 8.4 / Percona XtraBackup 8.0.35-35"
collected_at: 2025-07-17
---

# MySQL Backup & Recovery

> Source: https://dev.mysql.com/doc/refman/8.4/en/backup-and-recovery.html, https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html, https://dev.mysql.com/doc/refman/8.4/en/point-in-time-recovery.html, https://docs.percona.com/percona-xtrabackup/8.0/index.html

## Purpose

MySQL offers three backup paradigms: **logical** (mysqldump — human-readable SQL), **physical** (Percona XtraBackup / mysqlbackup — raw data files for fast restore), and **point-in-time recovery** (binlog replay after a full restore). Each serves different scale, speed, and flexibility needs.

## When to Use

| Scenario | Tool |
|----------|------|
| Small-to-medium DB, cross-version migration, editable dump | `mysqldump` |
| Large DB, InnoDB-heavy, minimal downtime, fast restore | `xtrabackup` / physical |
| Recover to exact moment (e.g., just before a bad query) | Full backup + binlog PITR |
| Clone DB for dev/test | `mysqldump` or `xtrabackup --copy-back` |
| Safeguard before upgrade | Any method, but test restore first |

**Do NOT use mysqldump for large databases** — even if the dump completes quickly, restoring replays every INSERT through SQL parsing, disk I/O, and index rebuilds.

## Basic Usage

### mysqldump — Day-to-Day Patterns

```bash
# Single database (safe InnoDB snapshot, no locks)
mysqldump -u root -p --single-transaction --routines --events mydb > mydb.sql

# All databases
mysqldump -u root -p --all-databases --single-transaction --routines --events > full.sql

# Schema only
mysqldump -u root -p --no-data mydb > schema.sql

# Data only, complete INSERTs
mysqldump -u root -p --no-create-info --complete-insert mydb > data.sql

# Specific tables
mysqldump -u root -p mydb orders customers > subset.sql

# Filter rows
mysqldump -u root -p mydb orders --where="created_at >= '2025-01-01'" > recent.sql

# With binlog coordinates for PITR setup (source-data=2 writes as comment)
mysqldump -u root -p --single-transaction --source-data=2 mydb > pitr_ready.sql

# Remote host
mysqldump -h 10.0.0.5 -u backup -p --single-transaction mydb > mydb.sql

# Windows: ALWAYS use --result-file (not >) to avoid UTF-16 encoding
mysqldump -u root -p --result-file=dump.sql mydb

# Restore
mysql -u root -p mydb < mydb.sql
```

### mysqldump — Essential Options Cheat Sheet

**Consistency (pick one):**
| Option | Behavior |
|--------|----------|
| `--single-transaction` | BEGIN + consistent InnoDB snapshot; non-blocking. **Does not work on MyISAM.** |
| `--lock-tables`, `-l` | Locks each DB's tables during dump. Default via `--opt`. |
| `--lock-all-tables`, `-x` | Global read lock; consistent across all databases. |

**Performance:**
| Option | Behavior |
|--------|----------|
| `--quick`, `-q` | Row-by-row fetch (default via `--opt`). Use this. |
| `--skip-quick` | Buffer entire table in memory. DANGER on large tables. |
| `--disable-keys`, `-K` | Disable keys during insert, re-enable after. Faster restore. |
| `--extended-insert` | Multi-row INSERT syntax. Faster restore, harder to read. |

**Replication chain:**
| Option | Behavior |
|--------|----------|
| `--source-data=2` | Writes `CHANGE REPLICATION SOURCE TO` as comment with binlog pos. |
| `--dump-replica` | Include replica's source coordinates (for cascading setups). |
| `--set-gtid-purged=AUTO` | Include GTID state; omit if restoring to a different replication topology. |

**Scope:**
| Option | Behavior |
|--------|----------|
| `--all-databases`, `-A` | Everything |
| `--databases`, `-B` | Named databases (includes CREATE DATABASE) |
| `--no-data`, `-d` | Schema only |
| `--no-create-info`, `-t` | Data only |
| `--ignore-table=db.tbl` | Skip a table |
| `--where='cond'`, `-w` | Filter rows |

**Privileges needed:** `SELECT` on tables, `SHOW VIEW` on views, `TRIGGER` on triggers, `LOCK TABLES` (unless `--single-transaction`), `PROCESS` (unless `--no-tablespaces`), and `RELOAD`/`FLUSH_TABLES` when GTIDs are enabled with `--single-transaction`.

### Percona XtraBackup — Physical Hot Backup

```bash
# Full backup
xtrabackup --backup --target-dir=/backup/full --user=root --password=pass

# Prepare the backup (apply redo logs, make consistent)
xtrabackup --prepare --target-dir=/backup/full

# Restore (MySQL must be stopped, datadir must be empty)
xtrabackup --copy-back --target-dir=/backup/full
chown -R mysql:mysql /var/lib/mysql

# Incremental backup (requires a full backup as base)
xtrabackup --backup --target-dir=/backup/inc1 \
  --incremental-basedir=/backup/full --user=root --password=pass

# Prepare incremental (apply to base)
xtrabackup --prepare --apply-log-only --target-dir=/backup/full
xtrabackup --prepare --target-dir=/backup/full --incremental-dir=/backup/inc1

# Compressed backup
xtrabackup --backup --compress --target-dir=/backup/compressed

# Key binaries
# xtrabackup - main backup/restore
# xbcloud    - cloud storage upload/download
# xbcrypt    - encrypt/decrypt
# xbstream   - stream format (tar-like)
```

**PXB limitations to know:**
- PXB 8.0 **cannot** back up MySQL 5.7 or earlier (incompatible redo/undo log format).
- PXB ≤ 8.0.11 is incompatible with MySQL 8.0.20+.
- MyRocks incremental backups copy all files every time — no dedup.
- TokuDB is **not** supported.

### Point-in-Time Recovery (PITR)

**Prerequisite:** `log_bin=ON` on the server. Without binlogs, recovery is limited to the last full backup.

```bash
# 1. Restore full backup (mysqldump or xtrabackup)
mysql -u root -p < full_backup.sql

# 2. Find the binlog position from the backup (e.g., from --source-data comment)
#    The comment will contain: MASTER_LOG_FILE='binlog.000010', MASTER_LOG_POS=156

# 3. Apply binlogs from that position to the desired point
mysqlbinlog --start-position=156 \
  --stop-datetime="2025-06-15 14:30:00" \
  binlog.000010 binlog.000011 binlog.000012 | mysql -u root -p

# Using GTIDs instead of positions:
mysqlbinlog --include-gtids='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:1-9999' \
  binlog.00001* | mysql -u root -p
```

## Key APIs (Summary)

- `mysqldump` — Logical backup client. Key flags: `--single-transaction`, `--source-data`, `--routines`, `--events`, `--set-gtid-purged`, `--opt`.
- `xtrabackup` — Physical hot backup (Percona). Key modes: `--backup`, `--prepare`, `--copy-back`, `--incremental-basedir`, `--compress`.
- `mysqlbinlog` — Binlog reader for PITR. Key flags: `--start-position`, `--stop-datetime`, `--include-gtids`.
- `mysql` client — Used for restore of logical dumps.

## Caveats

1. **mysqldump restore is slow**: Every INSERT is parsed and executed individually. For >10GB databases, physical backup is the only practical choice.
2. **`--opt` includes `--lock-tables`**: On mixed MyISAM/InnoDB databases, this blocks writes to MyISAM tables. Use `--single-transaction` + `--skip-lock-tables` for InnoDB-only workloads, or accept the MyISAM lock window.
3. **`--single-transaction` does not help MyISAM**: MyISAM tables will still be locked during the dump. If you must back up MyISAM, either accept the lock or use `--lock-all-tables` for a consistent snapshot.
4. **PowerShell redirection breaks dumps**: `mysqldump > file.sql` on Windows PowerShell produces UTF-16, which MySQL cannot load. Always use `--result-file`.
5. **GTIDs + system tables**: Don't load a dump containing `mysql.*` system tables when `gtid_mode=ON` — mysqldump uses non-transactional DML for MyISAM system tables, which is forbidden under GTIDs.
6. **PXB version lock**: PXB major version must match the MySQL major version. PXB 8.0 → MySQL 8.0 only; PXB 8.4 → MySQL 8.4 only.
7. **Binlogs required for PITR**: If `log_bin` was not enabled before the incident, PITR is impossible — you can only restore to the last full backup.
8. **Test restores**: An untested backup is not a backup. Schedule regular restore drills.

## Composition Hints

- **Before mysql-replication**: A backup strategy should be in place before designing replication topologies. Use `--source-data` in mysqldump to capture replication coordinates.
- **With mysql-schema-design**: Backup method (logical vs physical) can influence schema decisions. Large tables benefit from physical backup-friendly designs.
- **With mysql-transaction-isolation**: `--single-transaction` relies on InnoDB's REPEATABLE READ snapshot. Understanding MVCC helps explain why the dump is consistent without locks.
- **With mysql-innodb**: PXB operates at the InnoDB page level. Understanding tablespaces, redo logs, and undo logs explains PXB's prepare phase.

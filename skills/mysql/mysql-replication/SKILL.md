---
name: mysql-replication
description: MySQL 8.0 replication architecture — async/semi-sync/delayed replication, GTID-based replication, Group Replication (single/multi-primary), replication formats (SBR/RBR/MBR), and failover patterns.
tech_stack: [mysql]
language: [sql]
capability: [relational-db]
version: "MySQL 8.0"
collected_at: 2025-01-01
---

# MySQL Replication

> Source: https://dev.mysql.com/doc/refman/8.0/en/replication.html, https://dev.mysql.com/doc/refman/8.0/en/group-replication.html, https://dev.mysql.com/doc/refman/8.0/en/replication-gtids.html

## Purpose
Covers the complete MySQL 8.0 replication stack: traditional binary-log-position replication, GTID-based replication, semisynchronous and delayed replication, and Group Replication for high-availability clusters. Includes replication format selection (SBR/RBR/MBR), failover patterns, and integration with MySQL Router and InnoDB Cluster.

## When to Use
- **Read scale-out** — distribute reads across replicas, direct all writes to the source
- **High availability** — Group Replication for automatic failover; async replication + manual promotion
- **Disaster recovery** — geographically distributed replicas for site-level redundancy
- **Backup offloading** — run mysqldump/xtrabackup on a replica without impacting the source
- **Analytics/reporting** — heavy queries on replicas; production source unaffected
- **Zero-downtime migrations** — use delayed replication as a safety net against human error (e.g., accidental DROP TABLE)

## Basic Usage

### Replication Methods

| Method | Basis | Failover | Complexity |
|--------|-------|----------|------------|
| **Binary log position** | File + offset in binlog | Manual; must find position | Higher |
| **GTID-based** | Global transaction ID | Auto-positioning; `CHANGE MASTER TO MASTER_AUTO_POSITION=1` | Lower |

GTID is recommended for all new deployments.

### Enabling GTID Replication
```sql
-- On both source and replica (my.cnf or SET GLOBAL):
SET GLOBAL gtid_mode = ON;
SET GLOBAL enforce_gtid_consistency = ON;

-- On the replica:
CHANGE MASTER TO MASTER_AUTO_POSITION = 1;
START REPLICA;
```

### Replication Formats

| Format | What's Replicated | Best For |
|--------|-------------------|----------|
| **SBR** (Statement) | Full SQL text | Simple, deterministic statements |
| **RBR** (Row) | Changed row images | Non-deterministic functions, complex UPDATEs |
| **MBR** (Mixed) | Switches per-statement | General-purpose; MySQL chooses SBR or RBR |

**Recommendation**: Use RBR with GTID. SBR is non-deterministic with `NOW()`, `UUID()`, user variables, and `LIMIT` without `ORDER BY`.

### Synchronization Types

| Type | Source Behavior | Durability | Latency |
|------|----------------|------------|---------|
| **Async** (default) | Returns immediately after commit | Replica may lag | None |
| **Semisync** | Blocks until ≥1 replica ACKs receipt | At least one replica has the event | +1 network RTT |
| **Delayed** | Normal async, replica deliberately lags N seconds | Configurable lag window | N/A |

```sql
-- Semisync on source:
INSTALL PLUGIN rpl_semi_sync_source SONAME 'semisync_source.so';
SET GLOBAL rpl_semi_sync_source_enabled = 1;

-- Semisync on replica:
INSTALL PLUGIN rpl_semi_sync_replica SONAME 'semisync_replica.so';
SET GLOBAL rpl_semi_sync_replica_enabled = 1;

-- Delayed replica:
CHANGE MASTER TO MASTER_DELAY = 3600;  -- 1-hour delay
```

### Group Replication
Plugin-based (no external tooling required). Two modes:

| Mode | Writes Accepted On | Primary Election |
|------|--------------------|------------------|
| **Single-Primary** | One server only | Automatic on failure |
| **Multi-Primary** | All members | N/A (all active) |

```sql
INSTALL PLUGIN group_replication SONAME 'group_replication.so';
```

**Critical**: Group Replication does NOT handle client failover. Use MySQL Router, a load balancer (ProxySQL, HAProxy), or application-level logic to redirect clients when a member fails. InnoDB Cluster (MySQL Shell + Group Replication + MySQL Router) provides an integrated solution.

### GTID Properties
- GTIDs are preserved source→replica; you can trace any transaction to its origin
- A GTID is applied **at most once** per server — idempotent replay prevents double-application
- `gtid_executed` tracks all executed GTIDs; `gtid_purged` tracks those removed from the binlog

## Key APIs (Summary)

| Mechanism | Key Variables / Commands |
|-----------|--------------------------|
| Enable GTID | `gtid_mode=ON`, `enforce_gtid_consistency=ON` |
| GTID state | `gtid_executed`, `gtid_purged`, `gtid_next` |
| Auto-positioning | `CHANGE MASTER TO MASTER_AUTO_POSITION=1` |
| Replication format | `binlog_format=ROW\|STATEMENT\|MIXED` |
| Semisync control | `rpl_semi_sync_source_enabled`, `rpl_semi_sync_replica_enabled` |
| Delayed replica | `CHANGE MASTER TO MASTER_DELAY=N` |
| Group Replication | `group_replication_single_primary_mode`, `group_replication_bootstrap_group` |
| Replica status | `SHOW REPLICA STATUS\G` |
| Group status | `SELECT * FROM performance_schema.replication_group_members` |

## Caveats
- **Async lag is inherent** — replicas are always slightly behind. Design applications for eventual consistency or read-your-own-writes patterns.
- **Never write to replicas** in async replication — causes data drift that can break replication entirely.
- **GTID restrictions**: `CREATE TABLE ... SELECT` is not GTID-safe. Temporary tables in transactions, cross-storage-engine updates in one statement — all forbidden with `enforce_gtid_consistency=ON`.
- **Semisync adds write latency** — the source blocks until at least one replica acknowledges. If no replica responds, the source falls back to async after `rpl_semi_sync_source_timeout`.
- **Group Replication requires quorum** — if a majority of members fail, the group blocks writes. A 3-node group survives 1 failure; a 5-node group survives 2.
- **Group Replication has no built-in client failover** — must pair with MySQL Router, ProxySQL, or similar middleware.
- **Delayed replication** is a safety net, not HA — the replica is intentionally stale; promoting it loses the delay window's worth of data.
- **SBR + non-determinism** = replica divergence. Use RBR whenever possible, especially with GTID.

## Composition Hints
- Pair with `mysql-backup-recovery` — backups on replicas are the standard pattern; binlog point-in-time recovery depends on replication binary logs
- Pair with `mysql-innodb` — replication binary log format interacts with InnoDB locking (row-based replication reads row locks on the source)
- Pair with `mysql-transaction-isolation` — replication lag interacts with isolation levels; READ COMMITTED on replicas can see partial transactions
- Use with `mysql-schema-design` — schema changes must be replication-safe (avoid `CREATE TABLE ... SELECT`, prefer online DDL with `ALGORITHM=INPLACE`)

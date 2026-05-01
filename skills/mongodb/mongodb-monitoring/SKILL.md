---
name: mongodb-monitoring
description: MongoDB monitoring and operations — mongostat, mongotop, serverStatus, currentOp, slow query diagnostics, replication lag, backup/restore with mongodump/mongorestore, and process logging.
tech_stack: [mongodb]
language: [javascript]
capability: [observability, relational-db]
version: "MongoDB 8.0"
collected_at: 2025-01-01
---

# MongoDB Monitoring & Operations

> Source: https://www.mongodb.com/docs/manual/administration/monitoring/, https://www.mongodb.com/docs/manual/tutorial/backup-and-restore-tools/, https://www.mongodb.com/docs/manual/reference/command/serverStatus/

## Purpose

Monitor MongoDB deployments to assess database health, diagnose problems before they become failures, and maintain operational stability. Covers real-time utilities, diagnostic commands, backup/restore procedures, and log management for self-managed deployments.

## When to Use

- Day-to-day health checks: connections, memory, operation throughput, latency
- Diagnosing slow queries or performance regressions
- Monitoring replication lag and replica set health
- Monitoring sharded cluster balance and config server availability
- Capacity planning (storage, connection pools, oplog sizing)
- Backup and disaster recovery for small-to-medium self-managed deployments

## Basic Usage

### Quick Health Check

```js
// Connection load
db.serverStatus().connections   // current, available, active

// Memory
db.serverStatus().mem           // { resident: <MB>, virtual: <MB> }

// Operation throughput since restart
db.serverStatus().opcounters    // { insert, query, update, delete, getmore, command }

// Latency in microseconds
db.serverStatus().opLatencies   // { reads: {latency, ops}, writes: {...}, commands: {...} }

// Storage
db.stats()                      // database-level: storage, objects, indexes, avg doc size
db.collection.stats()           // collection-level: count, size, index info
```

All `serverStatus` counters reset on `mongod` restart.

### Real-Time CLI Monitoring

```bash
mongostat --host=mongodb0.example.com --port=27017
# Live: inserts, queries, updates, deletes, getmore, commands per second
# Also: vsize, res, netIn, netOut, conn, time

mongotop --host=mongodb0.example.com:27017
# Per-collection read/write activity, 1s intervals
mongotop 5   # 5-second intervals
```

### Identify Long-Running Operations

```js
// Find operations running > 100ms
db.currentOp({ "active": true, "secs_running": { $gt: 0.1 } })

// Kill a specific operation
db.killOp(<opid>)
```

### Replication Health

```js
rs.status()
// Compare optimeDate on primary vs each secondary for lag
// A growing gap indicates replication problems
```

Flow control is **enabled by default** — the primary throttles writes to keep majority-committed lag under `flowControlTargetLagSeconds`. If replication lag exceeds the oplog window, the secondary must perform a full initial sync (oplog defaults to 5% of disk on 64-bit).

## Key APIs (Summary)

| Command | Purpose |
|---------|---------|
| `db.serverStatus()` | Full instance state: connections, memory, ops, locks, WiredTiger |
| `db.stats()` | Database storage, objects, indexes, avg doc size |
| `db.collection.stats()` | Collection-level size, count, index details |
| `rs.status()` | Replica set member states, optimes, health |
| `db.currentOp()` | All in-progress operations with duration |
| `db.killOp(opid)` | Terminate a running operation |
| `db.setLogLevel(n)` | Adjust logging verbosity at runtime |
| `sh.status()` | Sharded cluster overview: shards, chunks, balancer state |
| `db.getLog()` | Recent process log messages |
| `db.logRotate()` | Rotate log files |

### Key serverStatus Sections

| Section | What to Watch |
|---------|---------------|
| `connections` | `current` vs `available` — near limit means connection starvation |
| `mem` | `resident` — high RSS may indicate cache pressure |
| `opcounters` | Spikes in inserts/updates vs expectations |
| `opLatencies` | Rising read/write latency signals problems |
| `locks` | High lock acquisition counts → contention |
| `wiredTiger` | Cache utilization, eviction activity |
| `repl` | `rbid` (rollback count) — non-zero = recent rollback |
| `network` | `numRequests`, bytes in/out for throughput |

## Backup & Restore

### Backup with mongodump

```bash
# Full instance backup
mongodump --out=/backup/$(date +%Y%m%d)

# Single collection
mongodump --db=mydb --collection=orders --out=/backup/orders

# With oplog for point-in-time restore (replica sets)
mongodump --oplog --out=/backup/$(date +%Y%m%d)

# Archive format (single file)
mongodump --archive=backup.archive
```

Required privilege: `backup` role.

### Restore with mongorestore

```bash
# Full restore
mongorestore /backup/20250101

# Point-in-time restore (replay captured oplog)
mongorestore --oplogReplay --drop /backup/20250101

# From archive
mongorestore --archive=backup.archive

# Validate documents during restore
mongorestore --objcheck /backup/20250101
```

Required privilege: `restore` role. `--oplogReplay` additionally requires a custom role with `anyAction` on `anyResource`.

### Before Manual Backups on Sharded Clusters

```js
sh.stopBalancer()
use config
while (sh.isBalancerRunning()) { print("waiting..."); sleep(1000); }
// ... perform backup ...
sh.startBalancer()
```

This is **not** required for Atlas, Cloud Manager, or Ops Manager coordinated backups.

## Process Logging

```bash
mongod -v --logpath /var/log/mongodb/server1.log --logappend
```

| Setting | Effect |
|---------|--------|
| `quiet` | Reduces log verbosity |
| `--v` / `logLevel` | Increases detail; adjustable at runtime via `db.setLogLevel()` |
| `--logpath` | Write to file instead of stdout |
| `--logappend` | Append to existing log (default: overwrite) |

**Log redaction** (Enterprise/Atlas only): `redactClientLogData` replaces query/document content with `"###"` in logs, preventing sensitive data leakage at the cost of diagnostic detail. Use alongside Encryption at Rest and TLS/SSL for compliance.

## Caveats

1. **serverStatus counters reset on restart.** Never compare pre- and post-restart metrics directly. The `rollovers` field in `asserts` tells you how many times counters have wrapped.

2. **mongodump/mongorestore degrade performance.** They read all data through memory, evicting hot data from the WiredTiger cache. For production, prefer filesystem snapshots or Atlas Cloud Backups.

3. **Balancer disabled during manual backups — mandatory.** A chunk migration mid-backup produces an inconsistent snapshot. Not applicable to coordinated backup tools (Atlas, Cloud Manager, Ops Manager).

4. **Backups are stale by nature.** Data written after `mongodump` starts is lost unless you used `--oplog`. Oplog replay restores to the moment the dump completed — not an arbitrary point in time.

5. **Replication lag > oplog = full initial sync.** If a secondary falls behind by more than the oplog window, it must re-sync from scratch. The default oplog is 5% of disk; size it appropriately for your write volume and tolerated maintenance window.

6. **Storage Node Watchdog kills mongod on filesystem hang.** Exit code 61. On a primary, this triggers failover. The node may not restart cleanly on the same machine. Only enable (`watchdogPeriodSeconds ≥ 60`) when you have a replica set with automated failover.

7. **Flow control is on by default.** The primary may reduce write throughput to keep replication lag in check. If write throughput drops unexpectedly, check replication lag first.

8. **Sharded cluster backup complexity.** For manual dumps, stop the balancer, all writes, and schema migrations. For transactional consistency across shards, use Atlas/Cloud Manager/Ops Manager.

## Composition Hints

- **With mongodb-replication**: `rs.status()` and replication lag monitoring are the primary tools for replica set health. The `repl` section of `serverStatus` complements this.
- **With mongodb-sharding**: Monitor config server health, chunk distribution via `sh.status()`, and balancer state. Always stop the balancer before manual backups.
- **With mongodb-indexes**: Use `explain()` to diagnose slow queries; combine with `currentOp` to see which indexes are being used by running operations.
- **With mongodb-aggregation**: Long-running aggregation pipelines appear in `currentOp`; use `db.killOp()` if they're blocking.

---
name: mongodb-replication
description: MongoDB replica set architecture — automatic failover, oplog mechanics, read preference, write concern, mirrored reads, flow control, and special member types.
tech_stack: [mongodb]
capability: [orchestration]
version: "MongoDB 8.2"
collected_at: 2025-01-01
---

# MongoDB Replication

> Source: https://www.mongodb.com/docs/manual/replication/, https://www.mongodb.com/docs/manual/core/replica-set-oplog/, https://www.mongodb.com/docs/manual/core/replica-set-elections/

## Purpose

Replica sets provide redundancy, high availability, and read scaling for MongoDB. A replica set is a group of `mongod` processes that maintain identical data through asynchronous oplog replication. This is the foundation of all production MongoDB deployments.

## When to Use

- **Production deployments**: Always use a replica set (even a single-node replica set enables change streams, transactions, and oplog-based backups).
- **High availability**: Automatic failover when the primary becomes unavailable.
- **Read scaling**: Route read queries to secondaries via read preference.
- **Data redundancy**: Multiple copies protect against single-server loss.
- **Disaster recovery**: Delayed members provide a time-shifted safety net against operational errors.
- **Geographic distribution**: Place members across data centers for data locality.

## Basic Usage

### Replica Set Architecture

```
         ┌──────────┐
   ┌────►│ Secondary│
   │     └──────────┘
   │     ┌──────────┐
writes   │          │  async oplog
   │     │ PRIMARY  │──replication──►
   └────►│          │
         └──────────┘
              │
         ┌────▼─────┐
         │ Secondary │ (or Arbiter — votes, no data)
         └──────────┘
```

- **Primary**: One per set. Receives all writes. Records changes in oplog.
- **Secondary**: Replicate the oplog asynchronously. Can serve reads.
- **Arbiter**: Votes in elections only. Holds **no data**. Use only when cost prevents adding a data-bearing secondary.

### Oplog Essentials

The oplog (`local.oplog.rs`) is a capped collection recording all data-modifying operations. Every member has a copy.

- **Default size**: 5% of free disk space (WiredTiger, Unix/Windows), min 990 MB, max 50 GB.
- **Oplog window**: Time span from oldest to newest entry. If a secondary is offline longer than this window, it must do a full initial sync (resync).
- **Resize dynamically**: `db.adminCommand({ replSetResizeOplog: 1, size: 20480 })` (size in MB)
- **Check status**: `rs.printReplicationInfo()`
- **Minimum retention**: Set `storage.oplogMinRetentionHours` to prevent premature truncation.

### Automatic Failover

When the primary fails to heartbeat for `electionTimeoutMillis` (default **10 seconds**), an eligible secondary calls an election. Median time to new primary: ≤12 seconds.

- Writes are **unavailable** during election. Reads can continue on secondaries.
- Drivers automatically retry certain writes once (retryable writes enabled by default).
- Lower `electionTimeoutMillis` → faster detection but more false-positive elections during network blips (risk: more `w:1` rollbacks).

### Election Mechanics

- **Heartbeats**: every 2 seconds. Inaccessible after 10 seconds.
- **Priority**: Higher-priority secondaries call elections sooner and are more likely to win. Priority `0` = cannot become primary.
- **Voting**: Max 7 voting members (up to 50 total). Non-voting members must have `priority: 0`.
- **Network partition**: Primary that sees only a minority of voters steps down. Majority partition elects new primary.
- **Protocol**: `protocolVersion: 1` (pv1) — faster failover, faster multi-primary detection.

### Read Preference

Route reads to different members for scaling:

| Mode | Behavior |
|---|---|
| `primary` | All reads from primary (default) |
| `primaryPreferred` | Primary if available, else secondary |
| `secondary` | All reads from secondaries |
| `secondaryPreferred` | Secondary if available, else primary |
| `nearest` | Lowest network latency member |

**Important**: Transactions MUST use `primary`. All transaction operations route to the same member.

### Write Concern

Control durability vs. performance:

| Level | Behavior |
|---|---|
| `w: 1` | Primary only. Fast but may roll back on failover |
| `w: "majority"` | Majority of voting members. Durable across failovers |
| `w: <n>` | Specific number of members |
| `j: true` | Require journal commit on each member |

For production: use `{ w: "majority", j: true }` for critical writes.

### Mirrored Reads

Pre-warm secondary caches to reduce post-failover performance impact. The primary mirrors a sample of reads to electable secondaries (fire-and-forget).

```javascript
// Disable
db.adminCommand({ setParameter: 1, mirrorReads: { samplingRate: 0.0 } })
// Check metrics
db.serverStatus({ mirroredReads: 1 })
```

Default sampling rate: 0.01 (1%). MongoDB 8.2+ adds **targeted mirrored reads** for specific nodes.

### Flow Control

Enabled by default. When replication lag approaches `flowControlTargetLagSeconds`, the primary throttles writes (ticket-based locking) to let secondaries catch up. Monitor with `db.getReplicationInfo()`.

### Special Member Types

| Type | Priority | Votes | Data | Purpose |
|---|---|---|---|---|
| Standard | ≥1 | 1 | Yes | Normal member, can be primary |
| Priority 0 | 0 | 1 | Yes | Reporting/backup, never primary |
| Hidden | 0 | 1 | Yes | Invisible to clients, dedicated workloads |
| Delayed | 0 | 1 | Yes | `secondaryDelaySecs` lag for disaster recovery |
| Arbiter | 0 | 1 | No | Election participation only |
| Non-voting | 0 | 0 | Yes | Read scaling beyond 7 voters |

Example: adding a delayed hidden member for disaster recovery:

```javascript
rs.add({
  host: "dr-host:27017",
  priority: 0,
  hidden: true,
  secondaryDelaySecs: 3600   // 1 hour behind primary
})
```

## Key APIs (Summary)

| Command | Purpose |
|---|---|
| `rs.status()` | Full replica set status |
| `rs.printReplicationInfo()` | Oplog size and time window |
| `rs.stepDown(secs)` | Force primary to step down |
| `rs.add(member)` / `rs.remove(host)` | Add/remove members |
| `rs.reconfig(cfg)` | Change replica set configuration |
| `db.getReplicationInfo()` | Lag and replication status |
| `replSetResizeOplog` | Resize oplog dynamically |
| `db.serverStatus({ mirroredReads: 1 })` | Mirrored reads metrics |

## Caveats

- **Asynchronous = stale reads possible**: Secondary reads may not reflect the primary. Use `"majority"` read concern for consistency.
- **`w: 1` can roll back**: Only `w: "majority"` survives failover. Data acknowledged only by the former primary may be lost.
- **Split-brain**: Two nodes may transiently think they're primary during a network partition. Only the one that can complete `w: "majority"` writes is the true primary. The other's writes will roll back.
- **Oplog window is critical**: If a secondary falls behind beyond the oplog window, it needs full initial sync — plan oplog size for your workload's write volume and maintenance windows.
- **Max 7 voters**: Design replica sets with at most 7 voting members. Use non-voting members for additional read capacity.
- **Arbiters don't store data**: They're a single point of failure for data if you have only primary + arbiter (no true redundancy). Use at least 3 data-bearing nodes for production.
- **Flow control can surprise**: If secondaries lag significantly, primary writes slow down. Monitor replication lag proactively.
- **Oplog cannot be dropped**: The oplog is required for replication and crash recovery (WiredTiger). Manual writes to oplog prohibited since MongoDB 5.0.
- **Priority 0 ≠ hidden ≠ delayed**: These are independent — combine as needed (e.g., hidden + delayed for disaster recovery).

## Composition Hints

- **With mongodb-transactions**: Transactions require `readPreference: primary`. Use `w: "majority"` + `"snapshot"` read concern for strongest consistency in a replica set.
- **With mongodb-monitoring**: Monitor `rs.status()`, `db.getReplicationInfo()`, and `db.serverStatus({ mirroredReads: 1 })` to detect lag, track failover events, and ensure flow control isn't throttling.
- **With mongodb-sharding**: Each shard is itself a replica set. Replication concepts (oplog, elections, read preference) apply identically within each shard.
- **With mongodb-crud-queries**: Use read preference `secondary` or `nearest` to distribute read-heavy workloads. Be aware of eventual consistency when reading from secondaries.

---
name: mongodb-sharding
description: MongoDB sharding — horizontal scaling architecture, shard key selection (hashed vs ranged), chunk distribution, balancer management, and zone sharding for geographic data locality.
tech_stack: [mongodb]
language: [javascript]
capability: [relational-db]
version: "MongoDB 8.0"
collected_at: 2025-01-01
---

# MongoDB Sharding

> Source: https://www.mongodb.com/docs/manual/sharding/, https://www.mongodb.com/docs/manual/core/sharding-shard-key/, https://www.mongodb.com/docs/manual/tutorial/manage-sharded-cluster-balancer/

## Purpose

Sharding distributes data across multiple machines to support deployments with very large data sets and high throughput operations that exceed single-server capacity. MongoDB shards at the **collection** level.

## When to Use

- Data sets too large for a single server's storage
- Query rates exhausting single-server CPU
- Working sets exceeding available RAM
- Need to scale read/write horizontally by adding shards
- Geographic data locality requirements (zone sharding)

## Basic Usage

### Sharded Cluster Architecture

Three components, all deployed as replica sets:

| Component | Role |
|-----------|------|
| **shard** | Stores a subset of sharded data |
| **mongos** | Query router between clients and cluster |
| **config servers** | Metadata and configuration (CSRS) |

Always connect via **mongos** — never directly to a shard. Starting in MongoDB 8.0, direct shard connections reject unsupported commands unless the user has the `directShardOperations` role.

### Shard a Collection

```js
// Hashed sharding — even distribution, good for monotonically-changing keys
sh.shardCollection("mydb.orders", { "customerId": "hashed" })

// Ranged sharding — enables targeted range queries
sh.shardCollection("mydb.orders", { "customerId": 1 })

// MongoDB 8.0+: shard + immediate rebalance (bypasses slow balancer)
sh.shardAndDistributeCollection("mydb.orders", { "customerId": "hashed" })
```

To shard a **populated** collection, you must first create an index starting with the shard key. For empty collections, MongoDB creates the index automatically.

### Resharding (5.0+)

```js
sh.reshardCollection("mydb.orders", { "orderDate": 1 })
// Indexes on the new shard key are built automatically
```

### View Sharding Status

```js
sh.status()
```

## Key APIs (Summary)

| Method | Purpose |
|--------|---------|
| `sh.shardCollection(ns, key, opts)` | Shard a collection |
| `sh.shardAndDistributeCollection(ns, key)` | Shard + immediate rebalance (8.0+) |
| `sh.reshardCollection(ns, key)` | Change shard key (5.0+) |
| `sh.status()` | Cluster sharding overview |
| `sh.getBalancerState()` | Is balancer enabled? |
| `sh.isBalancerRunning()` | Is balancer actively migrating? |
| `sh.stopBalancer()` / `sh.startBalancer()` | Disable/enable balancer |
| `sh.disableBalancing(ns)` / `sh.enableBalancing(ns)` | Per-collection balancing |
| `db.collection.analyzeShardKey()` | Shard key metrics from sampled queries (7.0+) |

### Balancer Window Scheduling

```js
use config
db.settings.updateOne(
  { _id: "balancer" },
  { $set: { activeWindow: { start: "01:00", stop: "05:00" } } },
  { upsert: true }
)
// Remove schedule:
db.settings.updateOne({ _id: "balancer" }, { $unset: { activeWindow: true } })
```

Times are relative to config server primary timezone (self-managed) or UTC (Atlas).

## Caveats

1. **Shard key is destiny.** Poor key choice bottlenecks even the best hardware. Use `analyzeShardKey` (7.0+) to evaluate cardinality, frequency, and monotonicity from real query samples before committing.

2. **Broadcast queries.** Queries that omit the shard key (or compound prefix) are scatter/gathered to **all** shards — these are slow. Always include the shard key in queries when possible.

3. **No cross-shard `_id` uniqueness.** When `_id` is not the shard key, uniqueness is only per-shard. Two documents on different shards can share the same `_id`. Applications must ensure global `_id` uniqueness themselves.

4. **Missing shard key fields.** Documents can lack shard key fields — they're treated as `null` for distribution. A `{ field: null }` query matches both missing fields and explicit nulls. Use `{ $exists: false }` to target only missing fields.

5. **Hashed keys forbid unique constraints.** Uniqueness on the shard key is only available with ranged sharding. Hashed shard keys cannot be unique.

6. **CWWC required (5.1+).** `sh.addShard()` fails if Cluster Wide Write Concern is unset and the shard's default write concern is `{ w: 1 }`.

7. **Collation.** Sharding a collection with a non-simple default collation requires `collation: { locale: "simple" }` and a matching shard key index. Queries on the collection still use the default collation — specify `{ locale: "simple" }` explicitly to use the shard key index.

8. **Balancer and backups.** Disable the balancer before manual backups (`sh.stopBalancer()`); chunk migration during backup produces inconsistent snapshots. Not needed for Atlas/Cloud Manager/Ops Manager.

9. **Resharding is expensive.** `sh.shardCollection()` migrates one chunk per shard at a time. In 8.0+, prefer `sh.shardAndDistributeCollection()` for fast initial balancing.

## Composition Hints

- **With mongodb-replication**: Each shard is a replica set; shard availability depends on replica set health.
- **With mongodb-indexes**: Shard key indexes follow all index rules — the shard key index is the most critical index in a sharded collection.
- **With mongodb-transactions**: Distributed transactions span shards; use snapshot read concern for cross-shard consistency.
- **With mongodb-monitoring**: Monitor balancer state, chunk distribution, and config server health as part of sharded cluster operations.

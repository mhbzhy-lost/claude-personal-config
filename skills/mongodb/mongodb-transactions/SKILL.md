---
name: mongodb-transactions
description: Multi-document ACID transactions in MongoDB — sessions, callback/core APIs, read concern levels, causal consistency, and production considerations.
tech_stack: [mongodb]
capability: [relational-db]
version: "MongoDB 8.1"
collected_at: 2025-01-01
---

# MongoDB Transactions

> Source: https://www.mongodb.com/docs/manual/core/transactions/, https://www.mongodb.com/docs/manual/core/read-isolation-consistency-recency/, https://www.mongodb.com/docs/manual/reference/read-concern/

## Purpose

Provide multi-document ACID guarantees in MongoDB. Single-document operations are already atomic; transactions extend atomicity across multiple documents, collections, databases, and shards. Use when denormalized schema design (embedding) cannot satisfy atomicity requirements.

## When to Use

- Atomic writes spanning multiple documents in one or more collections
- Cross-collection or cross-database consistency boundaries
- Operations on sharded clusters requiring all-or-nothing semantics
- Scenarios where embedding/denormalization is impractical

**Do NOT use transactions as a replacement for good schema design.** Prefer embedded documents and arrays whenever possible — multi-document transactions incur higher performance cost and have runtime/oplog limits.

## Basic Usage

### Callback API (recommended for most cases)

The callback API handles start, execution, commit/abort, and automatic retry for transient errors:

```javascript
const session = client.startSession();
await session.withTransaction(async () => {
  await coll1.insertOne({ _id: 1, item: "A" }, { session });
  await coll2.updateOne({ _id: 2 }, { $set: { status: "done" } }, { session });
}, {
  readConcern: { level: "snapshot" },
  writeConcern: { w: "majority" }
});
await session.endSession();
```

### Core API (manual control)

Use when you need custom error handling beyond what the callback API provides:

```javascript
const session = client.startSession();
session.startTransaction({
  readConcern: { level: "snapshot" },
  writeConcern: { w: "majority" }
});
try {
  await coll1.insertOne({ _id: 1 }, { session });
  await coll2.insertOne({ _id: 2 }, { session });
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  await session.endSession();
}
```

### Critical Rules

- **Always pass the session** to every operation inside the transaction.
- Set read concern, write concern, and read preference at the **transaction level**, not per-operation.
- Collection/database-level read concerns are **ignored** inside transactions.
- Precedence: transaction-level > session-level > client-level.

### Causal Consistency

For causally related operations (e.g., update-then-insert), use a causally consistent session with `"majority"` read/write concern:

```javascript
const session = client.startSession({ causalConsistency: true });
const coll = client.db("test").collection("items", {
  readConcern: { level: "majority" },
  writeConcern: { w: "majority", wtimeoutMS: 1000 }
});
// Update is guaranteed to happen-before the insert
await coll.updateOne({ sku: "111", end: null }, { $set: { end: new Date() } }, { session });
await coll.insertOne({ sku: "nuts-111", name: "Pecans", start: new Date() }, { session });
```

To make a different session causally consistent with a prior session, advance its cluster time and operation time:

```javascript
session2.advanceClusterTime(session1.clusterTime);
session2.advanceOperationTime(session1.operationTime);
```

## Key APIs (Summary)

| Method | Purpose |
|---|---|
| `client.startSession()` | Create a client session |
| `session.withTransaction(cb, opts)` | Callback API: run cb in a transaction with auto retry |
| `session.startTransaction(opts)` | Core API: begin transaction manually |
| `session.commitTransaction()` | Core API: commit |
| `session.abortTransaction()` | Core API: abort/rollback |
| `session.endSession()` | Release session resources |

**Transaction options:** `readConcern`, `writeConcern`, `readPreference`, `maxCommitTimeMS`

### Read Concern Levels for Transactions

| Level | Transaction Support | Guarantee |
|---|---|---|
| `"local"` | ✓ | Data from instance; may be rolled back |
| `"majority"` | ✓ | Majority-acknowledged; durable. Requires `w:"majority"` commit for full guarantees |
| `"snapshot"` | ✓ | Point-in-time across shards. Requires `w:"majority"` commit |
| `"available"` | ✗ | Not available in transactions |
| `"linearizable"` | ✗ | Not available in transactions |

### Retryable Errors (Callback API auto-retries)

- `TransientTransactionError` — retried
- `UnknownTransactionCommitResult` — retried
- `TransactionTooLargeForCache` — **NOT retried** (MongoDB 6.2+)
- `DuplicateKeyError` on upsert — **NOT retried** (MongoDB 8.1+)

## Caveats

- **Performance**: Multi-document transactions cost more than single-document writes. Design schema to avoid them where possible.
- **`"snapshot"` requires `w:"majority"` commit** — otherwise zero guarantees on data read.
- **`"linearizable"` is not for transactions** — primary-only, no `$out`/`$merge`, must uniquely identify one document, always pair with `maxTimeMS`.
- **Explicit collection/index creation** inside a transaction requires read concern `"local"`.
- **`local` database** silently ignores all read concerns.
- **Causal sessions are NOT isolated** from concurrent outside operations — writes can interleave.
- **Cursor stability**: Cursors can return duplicate documents if indexed fields change mid-iteration. Use `"snapshot"` read concern for stability.
- **Drivers**: Use the driver version matching your MongoDB server version.
- **Oplog/runtime limits**: See Production Considerations in the MongoDB docs for size and time limits on transactions.

## Composition Hints

- **With mongodb-schema-design**: Prefer embedding over transactions. Only reach for transactions when embedding cannot model the consistency boundary.
- **With mongodb-replication**: Transactions require `readPreference: primary` — all operations route to the same member. Use `w:"majority"` with `"snapshot"` read concern for strongest guarantees in replica sets.
- **With mongodb-sharding**: Cross-shard distributed transactions are supported; `"snapshot"` read concern provides point-in-time consistency across shards.

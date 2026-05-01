---
name: mongodb-indexes
description: MongoDB index types, creation, management, and query performance diagnosis via explain()
tech_stack: [mongodb]
capability: [relational-db, observability]
version: "MongoDB Manual unversioned"
collected_at: 2025-07-14
---

# MongoDB Indexes

> Source: https://www.mongodb.com/docs/manual/indexes/, https://www.mongodb.com/docs/manual/reference/explain-results/, https://www.mongodb.com/docs/manual/core/index-types/, https://www.mongodb.com/docs/manual/tutorial/manage-indexes/

## Purpose

Indexes use a B-tree data structure to store a small portion of the collection's data in an easy-to-traverse form, enabling efficient query execution. Without indexes, MongoDB performs `COLLSCAN` — reading every document. Indexes support equality matches, range queries, and returning sorted results directly from the index.

**Trade-off:** indexes accelerate reads but slow writes — every insert/update/delete must also update all indexes.

## When to Use

- Queries on a collection are slow and `explain()` shows `COLLSCAN`
- Repeatedly filtering, sorting, or ranging on specific fields
- Enforcing uniqueness constraints on fields (e.g., email, username)
- Supporting text search, geospatial queries, or TTL-based data expiration
- Diagnosing query performance with `explain()` to identify missing or unused indexes
- Safely dropping or modifying indexes by hiding them first
- Detecting and resolving index inconsistencies across shards

## Basic Usage

### Creating Indexes

```js
// Single field — supports queries and sorts on sku
db.products.createIndex({ "sku": 1 })

// Compound — supports queries on prefix: {custId}, {custId, orderDate}
db.orders.createIndex({ "customerId": 1, "orderDate": -1 })

// Unique — rejects duplicates
db.users.createIndex({ "email": 1 }, { unique: true })

// TTL — auto-delete documents 3600s after createdAt
db.sessions.createIndex({ "createdAt": 1 }, { expireAfterSeconds: 3600 })

// Text — enables $text search
db.articles.createIndex({ "title": "text", "body": "text" })

// Geospatial — enables $near, $geoWithin, $geoIntersects
db.places.createIndex({ "location": "2dsphere" })

// Wildcard — indexes all scalar fields (cautious use)
db.collection.createIndex({ "$**": 1 })

// Partial — only indexes documents matching filter
db.orders.createIndex(
  { "customerId": 1 },
  { partialFilterExpression: { "status": "active" } }
)

// Sparse — only indexes docs that have the field
db.collection.createIndex({ "optionalField": 1 }, { sparse: true })

// Hidden — exists but ignored by query planner
db.collection.createIndex({ "field": 1 }, { hidden: true })
```

### Viewing Indexes

```js
db.collection.getIndexes()   // all indexes on a collection
```

### Diagnosing with explain()

```js
// See query plan without executing
db.products.find({ "sku": "ABC123" }).explain("queryPlanner")

// Execute and get execution statistics
db.products.find({ "sku": "ABC123" }).explain("executionStats")

// Compare all candidate plans
db.products.find({ "sku": "ABC123" }).explain("allPlansExecution")
```

### Managing Index Lifecycle

```js
// Hide before dropping — evaluate impact safely
db.collection.hideIndex("indexName")
db.collection.unhideIndex("indexName")

// Drop
db.collection.dropIndex("indexName")
db.collection.dropIndex({ field: 1 })
```

## Key APIs (Summary)

### Index Types
| Type | Use Case | Example |
|------|----------|---------|
| **Single Field** | Equality, sort on one field | `{ sku: 1 }` |
| **Compound** | Multi-field filter, sort | `{ custId: 1, date: -1 }` |
| **Multikey** | Array field queries | auto-created when indexing array field |
| **Text** | Full-text search | `{ desc: "text" }` |
| **2dsphere** | GeoJSON proximity/containment | `{ loc: "2dsphere" }` |
| **Wildcard** | Dynamic schema, unknown fields | `{ "$**": 1 }` |
| **TTL** | Auto-expiring data | `{ createdAt: 1 }, { expireAfterSeconds: N }` |
| **Hashed** | Hashed sharding | `{ field: "hashed" }` |

### Index Properties
| Property | Effect |
|----------|--------|
| `unique: true` | Reject duplicate values |
| `sparse: true` | Skip docs missing the field |
| `partialFilterExpression` | Only index docs matching filter |
| `hidden: true` | Index exists but planner ignores it |
| `expireAfterSeconds: N` | TTL — auto-delete after N seconds |

### Explain — Reading the Output

Explain returns a **tree of stages**. Leaf nodes access collections/indexes; internal nodes consume child output; the root derives the result set.

**Key stage names:**
| Stage | Meaning |
|-------|---------|
| `COLLSCAN` | Collection scan — **bad**, no index used |
| `IXSCAN` | Index scan — **good**, using index keys |
| `FETCH` | Retrieving full docs after IXSCAN |
| `EOF` | End-of-stream |

**Key metrics to evaluate:**
| Metric | Signal |
|--------|--------|
| `totalKeysExamined` | Index entries scanned |
| `totalDocsExamined` | Docs examined (including filtered-out) |
| `nReturned` | Docs actually returned |
| `executionTimeMillis` | Query time (excl. network) |

**Diagnosis rules of thumb:**
- ✅ **Covered query:** `totalKeysExamined == nReturned`, `totalDocsExamined == 0`
- ✅ **Efficient:** `totalDocsExamined == nReturned`
- ⚠️ **Inefficient:** `totalDocsExamined >> nReturned` (many docs examined then discarded)
- ❌ **Missing index:** stage `COLLSCAN` in the winning plan

## Caveats

- **Compound index prefix rule:** `{ a:1, b:1, c:1 }` supports queries on `{a}`, `{a,b}`, `{a,b,c}` — but **NOT** `{b}` or `{c}` alone. Order matters.
- **Embedded document indexes:** Indexing `{ location: 1 }` only matches queries against the *entire* embedded document. Use dot notation `{ "location.city": 1 }` for field-level indexing.
- **Index build on populated collections** blocks or limits read/write access. Schedule builds during maintenance windows.
- **`explain()` ignores the plan cache** and prevents caching — its timing may differ from production steady-state.
- **Max 64 indexes per collection**, max index key size **1024 bytes**.
- **Cannot rename indexes** — drop and recreate.
- **Write amplification:** each index adds overhead to inserts/updates/deletes. High-write collections should minimize index count.
- **Inconsistent indexes in sharded clusters** can cause unexpected behavior. Detect with `db.runCommand({ checkMetadataConsistency: 1, checkIndexes: true })`.

## Composition Hints

- **Always use `explain("executionStats")`** before adding an index — verify the query actually needs one and that the new index is being picked.
- **Prefix matters in compound indexes:** put equality-filtered fields first, then range/sort fields. For `{ status: "active", createdAt: { $gt: ... } }` sorted by `createdAt`, use `{ status: 1, createdAt: 1 }`.
- **Hide before dropping:** `hideIndex()` lets you test the performance impact of removing an index without losing it. If performance degrades, `unhideIndex()` immediately restores it.
- **Covered queries eliminate FETCH:** if all queried fields are in the index, MongoDB can answer entirely from the index. Use projection to return only indexed fields: `db.col.find({ sku: "X" }, { sku: 1, price: 1, _id: 0 })` with index `{ sku: 1, price: 1 }`.
- **Use partial indexes for sparse patterns:** instead of indexing all documents, use `partialFilterExpression` to only index a hot subset (e.g., `{ status: "active" }`), reducing index size and write overhead.
- **TTL indexes are not exact:** documents are expired by a background task running every 60 seconds. Don't rely on sub-second precision for expiration.

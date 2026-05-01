---
name: mongodb-crud-queries
description: MongoDB CRUD operations — create, read, update, delete documents, query filter predicates, projection, and bulk writes
tech_stack: [mongodb]
capability: [relational-db]
version: "MongoDB Manual unversioned"
collected_at: 2025-07-14
---

# MongoDB CRUD & Queries

> Source: https://www.mongodb.com/docs/manual/crud/, https://www.mongodb.com/docs/manual/tutorial/query-documents/, https://www.mongodb.com/docs/manual/reference/operator/query/, https://www.mongodb.com/docs/manual/tutorial/project-fields-from-query-results/

## Purpose

Perform standard CRUD (Create, Read, Update, Delete) operations on MongoDB collections. All operations target a single collection, are atomic at the single-document level, and share a common filter syntax across reads, updates, and deletes.

## When to Use

- Inserting single or batch documents into a collection
- Querying documents with equality, range, logical, array, regex, and geospatial filters
- Updating fields or replacing entire documents matching filter criteria
- Deleting documents selectively or in bulk
- Limiting returned fields via projection to reduce network payload
- Performing multiple write operations atomically in a single bulk write

## Basic Usage

```js
// === CREATE ===
db.collection.insertOne({ item: "canvas", qty: 100, tags: ["cotton"] })
db.collection.insertMany([
  { item: "journal", qty: 25, tags: ["blank", "red"] },
  { item: "mat", qty: 85, tags: ["gray"] }
])

// === READ ===
db.collection.find({})                        // select all
db.collection.find({ status: "A" })           // equality
db.collection.find({ qty: { $gt: 50 } })      // range
db.collection.find({ status: { $in: ["A", "D"] } }) // in-list
db.collection.find({ $and: [{ status: "A" }, { qty: { $lt: 30 } }] })
db.collection.find({ "size.uom": "in" })      // embedded document field (dot notation)

// === UPDATE ===
db.collection.updateOne(
  { item: "paper" },                          // filter
  { $set: { "size.uom": "cm", status: "P" } } // update
)
db.collection.updateMany(
  { qty: { $lt: 50 } },
  { $set: { status: "L" } }
)
db.collection.replaceOne(
  { item: "paper" },
  { item: "paper", qty: 150, size: { h: 10, w: 15, uom: "cm" }, status: "A" }
)

// === DELETE ===
db.collection.deleteOne({ status: "D" })
db.collection.deleteMany({ qty: { $lt: 50 } })

// === PROJECTION (field selection) ===
db.collection.find({ status: "A" }, { item: 1, qty: 1, _id: 0 })

// === BULK WRITE ===
db.collection.bulkWrite([
  { insertOne: { document: { item: "eraser", qty: 10 } } },
  { updateMany: { filter: { qty: { $lt: 30 } }, update: { $set: { status: "L" } } } },
  { deleteOne: { filter: { status: "D" } } }
])
```

## Key APIs (Summary)

### CRUD Methods
| Method | Purpose |
|--------|---------|
| `insertOne(doc)` | Insert a single document |
| `insertMany([docs])` | Insert multiple documents |
| `find(filter, projection)` | Query documents |
| `updateOne(filter, update)` | Update first matching document |
| `updateMany(filter, update)` | Update all matching documents |
| `replaceOne(filter, doc)` | Replace entire matching document |
| `deleteOne(filter)` | Delete first matching document |
| `deleteMany(filter)` | Delete all matching documents |
| `bulkWrite(ops)` | Execute mixed write operations |

### High-Frequency Query Operators
| Operator | Example | Meaning |
|----------|---------|---------|
| `$eq` / implicit | `{ field: "val" }` | Equals |
| `$ne` | `{ field: { $ne: "val" } }` | Not equals |
| `$gt`, `$gte` | `{ qty: { $gt: 50 } }` | Greater than / or equal |
| `$lt`, `$lte` | `{ qty: { $lt: 100 } }` | Less than / or equal |
| `$in` | `{ status: { $in: ["A","D"] } }` | In array |
| `$nin` | `{ status: { $nin: ["D"] } }` | Not in array |
| `$and` | `{ $and: [{a:1},{b:2}] }` | Logical AND |
| `$or` | `{ $or: [{a:1},{b:2}] }` | Logical OR |
| `$not` | `{ qty: { $not: { $gt: 50 } } }` | Negation |
| `$exists` | `{ field: { $exists: true } }` | Field presence |
| `$regex` | `{ name: { $regex: /^A/ } }` | Pattern match |
| `$elemMatch` | `{ arr: { $elemMatch: { $gt: 10 } } }` | Array element match |
| `$all` | `{ tags: { $all: ["red","blue"] } }` | Array contains all |
| `$size` | `{ tags: { $size: 2 } }` | Array length |

### Key Update Operators
| Operator | Effect |
|----------|--------|
| `$set` | Set field value |
| `$unset` | Remove field |
| `$inc` | Increment numeric field |
| `$push` | Append to array |
| `$pull` | Remove from array by value/condition |
| `$addToSet` | Add to array if not present |
| `$rename` | Rename field |

## Caveats

- **Empty filter `{}` matches ALL documents** — in update/delete this means every document is affected. Always double-check filters before running `updateMany` or `deleteMany`.
- **Single-document atomicity only** — for multi-document ACID guarantees, use transactions (`startTransaction`/`commitTransaction`).
- **Projection restrictions** — cannot mix inclusion and exclusion in the same projection (except `_id`). Use `{ field: 1 }` to include or `{ field: 0 }` to exclude, not both.
- **`$where` is slow** — it evaluates JavaScript per-document and cannot use indexes. Avoid in production.
- **`$regex` without an index** performs a full collection scan. For prefix-anchored regexes (`/^prefix/`), a standard index can help; for case-insensitive or unanchored regexes, use a text index instead.
- **`find()` returns a cursor**, not an array — use `.toArray()` or iteration to consume results in the shell.
- **Collection is auto-created** on first insert if it doesn't exist.

## Composition Hints

- **Prefer `$in` over multiple `$or` clauses** on the same field — `{ status: { $in: ["A", "D"] } }` is cleaner than `{ $or: [{ status: "A" }, { status: "D" }] }`.
- **Use dot notation for embedded fields** — `{ "size.uom": "cm" }` indexes and queries far more efficiently than matching against the full embedded document.
- **Combine `$set` and `$unset` in a single update** to reshape documents atomically.
- **Projection before returning data** cuts network transfer — always project only needed fields in production queries, especially on documents with large embedded sub-documents.
- **For pagination**, use `sort()` + `limit()` + `skip()` on `find()`, but prefer range-based pagination (e.g., `{ _id: { $gt: lastId } }`) over `skip()` for large collections — skip must traverse all skipped documents.

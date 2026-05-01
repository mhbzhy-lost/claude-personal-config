---
name: mongodb-schema-design
description: MongoDB schema design patterns — embedding vs referencing, polymorphic, bucket, tree, schema versioning, and migration strategies.
tech_stack: [mongodb]
capability: [relational-db, api-design]
version: "MongoDB unversioned"
collected_at: 2025-06-30
---

# MongoDB Schema Design

> Source: https://www.mongodb.com/docs/manual/data-modeling/, https://www.mongodb.com/docs/manual/applications/data-models-relationships/, https://www.mongodb.com/docs/manual/core/data-model-design-patterns/

## Purpose

MongoDB's flexible document model demands a different design approach than relational databases. The core principle: **data that is accessed together should be stored together**. Rather than normalizing by default, you choose between embedding and referencing based on your application's actual read/write patterns.

Documents within a single collection are not required to have the same fields, and a field's type can differ across documents — enabling polymorphic storage.

## When to Use

- **Embed** when: data is always read together, relationship is one-to-one or one-to-few, embedded data rarely changes independently, and parent document stays well under 16 MB
- **Reference** when: related entity is shared across many parents, changes independently, is queried/updated on its own, or embedding would cause unbounded array growth
- **Hybrid** when: embed frequently accessed summary fields (e.g., recent 5 reviews) while referencing the full detail collection for pagination
- **Polymorphic collections** when: related entity types share most access patterns but differ in some attributes (product catalog with varying fields per category)
- **Bucket pattern** when: dealing with high-volume time-series or IoT data to avoid millions of tiny documents
- **Tree pattern** when: modeling hierarchical data (categories, org charts, comment threads)

## Basic Usage

### Schema Design Process

1. Map out your application's read and write patterns with their frequencies
2. Identify entities and their relationship cardinalities (1:1, 1:N, M:N)
3. For each relationship, decide: embed or reference (see decision table below)
4. Apply `$jsonSchema` validation on fields that need consistency
5. Plan a `schema_version` field for future evolution
6. Iterate as the application grows

### Embedding vs Referencing Decision Table

| Factor | Favor Embedding | Favor Referencing |
|--------|----------------|-------------------|
| Read pattern | Always reads parent + child together | Child read independently |
| Write pattern | Child updated with parent | Child updated independently |
| Cardinality | One-to-one, one-to-few | One-to-many (unbounded), many-to-many |
| Data size | Child is small and bounded | Child is large or grows unboundedly |
| Sharing | Child belongs to exactly one parent | Child shared across many parents |
| Consistency | Single-document atomicity sufficient | Need cross-document transactions |

### Embedding Pattern

```javascript
// One-to-few: user with addresses
{
  _id: ObjectId("..."), name: "Alice",
  addresses: [
    { street: "123 Main St", city: "Portland", type: "home" },
    { street: "456 Oak Ave", city: "Seattle", type: "work" }
  ]
}
```

### Referencing Pattern

```javascript
// Parent
{ _id: ObjectId("..."), name: "Alice", address_ids: [ObjectId("a1"), ObjectId("a2")] }

// Children (separate collection)
{ _id: ObjectId("a1"), street: "123 Main St", city: "Portland", type: "home" }
{ _id: ObjectId("a2"), street: "456 Oak Ave", city: "Seattle", type: "work" }

// Assemble with $lookup
db.users.aggregate([
  { $match: { name: "Alice" } },
  { $lookup: { from: "addresses", localField: "address_ids", foreignField: "_id", as: "addresses" } }
])
```

## Key APIs (Summary)

### Schema Validation

Add `$jsonSchema` validation to collections that need structure guarantees:

```javascript
db.createCollection("users", {
  validator: { $jsonSchema: {
    bsonType: "object",
    required: ["name", "email"],
    properties: {
      name:    { bsonType: "string" },
      email:   { bsonType: "string", pattern: "^.+@.+$" },
      age:     { bsonType: "int", minimum: 0 }
    }
  }},
  validationAction: "warn"  // "error" to reject invalid writes
})
```

### Design Patterns

**Polymorphic Pattern** — heterogeneous entities in one collection, discriminated by a `type` field:

```javascript
{ _id: 1, type: "clothing",    name: "T-Shirt",   sizes: ["S","M","L"], material: "cotton" }
{ _id: 2, type: "electronics", name: "Headphones", warranty_years: 2, voltage: 5 }
{ _id: 3, type: "book",        name: "MongoDB Guide", author: "Smith", pages: 350 }
```

Query by type: `db.products.find({ type: "electronics" })`. Index `{ type: 1 }` for filtering.

**Bucket Pattern** — for time-series/IoT, group readings into time-bucketed documents instead of one doc per reading:

```javascript
// Instead of millions of individual readings:
// { sensor: "A", ts: ISODate(...), temp: 72 }

// Bucket into hourly documents:
{
  sensor_id: "A", date: ISODate("2025-01-15"),
  readings: [
    { hour: 0, avg_temp: 72.1, min_temp: 70, max_temp: 74 },
    { hour: 1, avg_temp: 73.0, min_temp: 71, max_temp: 75 }
    // ... up to 24 entries
  ]
}
```

Use `$push` + `$slice` to manage bucket capacity, or pre-allocate with a fixed array size. Reduces document count and index size dramatically.

**Tree Pattern** — hierarchies via materialized path or parent reference:

```javascript
// Materialized path — query all descendants with a regex
{ _id: "A", name: "Electronics",     path: null }
{ _id: "B", name: "Laptops",         path: "A" }
{ _id: "C", name: "Gaming Laptops",  path: "A,B" }
// All descendants of A: db.categories.find({ path: /^A/ })

// Parent reference — simpler writes, harder to query subtrees
{ _id: "C", name: "Gaming Laptops", parent_id: "B" }
```

**Schema Versioning** — add a `schema_version` field and handle in application code:

```javascript
// v1
{ _id: 1, name: "Alice", schema_version: 1, phone: "555-0100" }

// v2 — phone becomes array, new email field
{ _id: 2, name: "Bob", schema_version: 2, phones: ["555-0200"], email: "bob@example.com" }
```

Migration strategy: update documents lazily on read, or run incremental batch updates. Application code handles both versions during the transition period.

## Caveats

- **Unbounded arrays are dangerous**: embedding arrays that grow indefinitely (chat messages, event logs) will hit the 16 MB BSON limit. Use the bucket pattern or referencing.
- **16 MB document ceiling**: always calculate worst-case embedded document size. A single large embedded array of complex sub-documents can exceed it quickly.
- **No cross-document atomicity by default**: if you reference data across collections and need consistency, use multi-document transactions (ACID since 4.0). Embedding gives you free single-document atomicity.
- **Write amplification with embedding**: if a piece of embedded data is duplicated across many parent documents and it changes, every parent must be updated. Prefer referencing for shared, frequently-updated data.
- **`$lookup` cost**: joins are not free. Always index the `foreignField`. For data that's always read together, embedding is almost always faster.
- **Schema anarchy**: without `$jsonSchema` validation, inconsistent field names/types creep in. Validate critical paths in production.
- **No universal answer**: the right pattern depends on read/write ratio, data growth rate, query patterns, and lifecycle. Profile and measure.
- **Migration is real work**: schema evolution in production means application code handles multiple versions. Plan for it from day one with a `schema_version` field and incremental migration scripts.

## Composition Hints

- **Start embedded, extract later**: it's easier to start with embedded data and extract into a referenced collection when it outgrows the parent than the reverse.
- **For product catalogs with search facets**: polymorphic collection for products, referenced collections for categories/tags/inventory, `$facet` aggregation for search results.
- **For social feeds**: embed recent N comments in the post document (for the feed view), reference a separate comments collection (for "load more" / pagination).
- **For analytics / reporting**: bucket pattern for raw events, aggregation pipelines for rollups, separate materialized collections for dashboards.
- **For multi-tenant apps**: embed tenant data within each tenant's documents, or use a `tenant_id` field + compound indexes. Avoid separate collections per tenant (scaling issues).
- **Always add `created_at` / `updated_at` timestamps**: they're cheap and invaluable for debugging, incremental sync, and migration scripts.

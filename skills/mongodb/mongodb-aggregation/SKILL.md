---
name: mongodb-aggregation
description: MongoDB aggregation pipeline — multi-stage document processing with $match, $group, $sort, $project, $unwind, $lookup, $facet, and expressions.
tech_stack: [mongodb]
capability: [search-engine, observability]
version: "MongoDB unversioned"
collected_at: 2025-06-30
---

# MongoDB Aggregation Pipeline

> Source: https://www.mongodb.com/docs/manual/aggregation/, https://www.mongodb.com/docs/manual/core/aggregation-pipeline/, https://www.mongodb.com/docs/manual/reference/operator/aggregation/, https://www.mongodb.com/docs/manual/reference/operator/aggregation/facet/

## Purpose

Aggregation pipelines process multiple documents through a sequence of stages, each transforming the data before passing it to the next. They are the preferred way to perform analytics, grouping, reshaping, and computed updates in MongoDB — replacing map-reduce (deprecated since 5.0) entirely.

## When to Use

- **Summarize/group data**: count, sum, average across document groups (sales per region, user activity stats)
- **Multi-stage transformation chains**: filter → group → sort → limit in one operation
- **Multi-faceted analysis**: `$facet` runs several parallel aggregations on the same documents in one pass (e.g., categorize by tags, price buckets, and year ranges simultaneously)
- **Join collections**: `$lookup` for left-outer joins across collections
- **Computed field updates**: use pipeline syntax inside `updateOne`/`updateMany` to derive field values
- **Analytics without ETL**: compute directly in MongoDB instead of exporting to another platform

## Basic Usage

```javascript
db.collection.aggregate(pipeline, options)
// options: { allowDiskUse: true, cursor: { batchSize: 1000 }, maxTimeMS: 5000 }
```

Each stage is an object `{ $stageName: { ... } }` in the pipeline array. Documents flow sequentially; a stage's output is the next stage's input.

**Canonical pipeline pattern** — put `$match` first to leverage indexes and reduce document count:

```javascript
db.orders.aggregate([
  { $match: { status: "completed", date: { $gte: ISODate("2025-01-01") } } },
  { $group: { _id: "$customerId", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  { $sort: { total: -1 } },
  { $limit: 10 }
])
```

## Key APIs (Summary)

### Essential Stages (80% of use cases)

| Stage | What it does | Key detail |
|-------|-------------|------------|
| `$match` | Filter documents | Place first for index use |
| `$group` | Group by `_id`, apply accumulators | `$sum`, `$avg`, `$push`, `$addToSet`, `$first`, `$last` |
| `$sort` | Order documents | `1` asc, `-1` desc |
| `$project` | Reshape — include/exclude/compute fields | Use `1` to include, `0` to exclude |
| `$unwind` | Expand array into one doc per element | `{ path: "$arr", preserveNullAndEmptyArrays: true }` |
| `$lookup` | Left outer join with another collection | Index the `foreignField` |
| `$limit` / `$skip` | Paginate | `$skip` before `$limit` |

### Output Stages

| Stage | Behavior |
|-------|----------|
| `$out` | Writes to a collection, **replacing** it entirely |
| `$merge` | Writes to a collection with merge/insert/replace/update control |

Both must be the **last** stage in the pipeline.

### `$facet` — Multi-Faceted Aggregation

Runs multiple independent sub-pipelines on the same input documents in a single pass. Each sub-pipeline result lands in its own output field as an array.

```javascript
db.artwork.aggregate([{
  $facet: {
    "byTags":      [ { $unwind: "$tags" }, { $sortByCount: "$tags" } ],
    "byPrice":     [ { $match: { price: { $exists: 1 } } },
                     { $bucket: { groupBy: "$price", boundaries: [0,150,200,300,400],
                                   default: "Other", output: { count: { $sum: 1 } } } } ],
    "byYearAuto":  [ { $bucketAuto: { groupBy: "$year", buckets: 4 } } ]
  }
}])
```

**Allowed** inside `$facet` sub-pipelines: `$bucket`, `$bucketAuto`, `$sortByCount`, plus most regular stages.
**Forbidden**: `$collStats`, `$facet` (no nesting), `$geoNear`, `$indexStats`, `$out`, `$merge`, `$planCacheStats`, `$search`, `$searchMeta`, `$vectorSearch`.

### `$lookup` — Joins

```javascript
{ $lookup: {
    from: "inventory",
    localField: "item",      // field from the input documents
    foreignField: "sku",     // field from the "from" collection
    as: "inventory_docs"     // output array field name
}}
```

For more complex joins, use the `pipeline` variant (5.0+):

```javascript
{ $lookup: {
    from: "orders",
    let: { prodId: "$_id" },
    pipeline: [
      { $match: { $expr: { $and: [
        { $eq: ["$productId", "$$prodId"] },
        { $gte: ["$date", ISODate("2025-01-01")] }
      ]}}}
    ],
    as: "recentOrders"
}}
```

### High-Frequency Accumulators (`$group`)

`$sum`, `$avg`, `$min`, `$max`, `$first`, `$last`, `$push` (all values), `$addToSet` (unique only), `$count` (= `{ $sum: 1 }`), `$stdDevPop`, `$stdDevSamp`.

### Go-To Expression Operators

- **Conditional**: `$cond`, `$ifNull`, `$switch`
- **Comparison**: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$cmp`
- **Boolean**: `$and`, `$or`, `$not`
- **Arithmetic**: `$add`, `$subtract`, `$multiply`, `$divide`, `$mod`, `$round`, `$ceil`, `$floor`
- **String**: `$concat`, `$toLower`, `$toUpper`, `$substrCP`, `$split`, `$trim`, `$regexMatch`, `$replaceAll`
- **Array**: `$size`, `$filter`, `$map`, `$reduce`, `$slice`, `$arrayElemAt`, `$in`, `$concatArrays`
- **Date**: `$year`, `$month`, `$dayOfMonth`, `$hour`, `$dateToString`, `$dateFromParts`, `$dateDiff`
- **Set**: `$setUnion`, `$setIntersection`, `$setDifference`
- **Type/other**: `$toString`, `$toDate`, `$literal`, `$rand`, `$mergeObjects`

### Computed Updates (Aggregation Pipeline in Updates)

```javascript
db.students.updateMany({}, [
  { $set: { average: { $avg: "$scores" }, total: { $sum: "$scores" } } }
])
```

## Caveats

- **Memory**: 100 MB per stage. Use `{ allowDiskUse: true }`. `$facet` **cannot** spill to disk — its 100 MB limit is absolute.
- **16 MiB BSON limit**: final output document must fit. `$facet` with many large sub-pipeline results can hit this.
- **`$facet` as first stage** triggers a COLLSCAN. Always put `$match` or `$sort` before it.
- **`$match` early**: reduces documents flowing through the pipeline and lets MongoDB use indexes.
- **`$group` memory**: high-cardinality `_id` fields (many unique groups) can blow memory. Use `allowDiskUse`.
- **`$lookup` performance**: on an unindexed `foreignField`, it does a full collection scan on the foreign collection. Always index it.
- **`$lookup` with sharded `from`**: the simple (non-pipeline) `$lookup` requires the foreign collection to be unsharded. Use the pipeline syntax with `$expr` for sharded foreign collections.
- **`$out`/`$merge` are terminal**: no stages after them. `$out` replaces the target collection entirely; `$merge` gives merge control.
- **Field path ambiguity**: field names starting with `$` are interpreted as expressions. Use `$getField` or `$literal` to access them literally.
- **Map-reduce is dead**: remove it from any code you see; rewrite as an aggregation pipeline.

## Composition Hints

- **Performance rule**: `$match` → `$sort` → `$group` → `$project` → `$limit`/`$skip` is the optimal stage order for most pipelines.
- **For pagination with `$group`**: you can't `$skip`/`$limit` before `$group` if grouping is needed — use `$facet` to get total count + page results in one pass.
- **For top-N per group**: `$sort` → `$group` with `$first`/`$push` + `$slice`.
- **For analytics dashboards**: use `$facet` to compute multiple aggregations in a single database pass.
- **For time-series rollups**: `$group` by `$dateTrunc` (5.0+) or by computed `$year`/`$month`/`$day` fields, with `$avg`/`$min`/`$max` accumulators.
- **For flattening arrays**: `$unwind` then `$group` to recompose, or use `$reduce`/`$map` for in-document transformations.

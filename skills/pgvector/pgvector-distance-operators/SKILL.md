---
name: pgvector-distance-operators
description: Use pgvector distance operators (<->, <#>, <=>, <+>, <~>, <%>) for vector similarity search in Postgres.
tech_stack: [postgresql]
language: sql
capability: [relational-db]
version: "pgvector v0.8.2"
collected_at: 2025-01-01
---

# pgvector — Distance Operators

> Source: https://github.com/pgvector/pgvector/blob/v0.8.2/README.md

## Purpose
pgvector provides six distance operators that plug directly into SQL `ORDER BY` and `WHERE` clauses for nearest-neighbor search and radius filtering. Each operator implements a different mathematical distance/similarity measure, compatible with different vector types.

## When to Use

| Operator | Use Case |
|----------|----------|
| `<->` (L2) | Default choice; general dense embedding similarity |
| `<#>` (neg inner product) | Embeddings trained for dot-product maximization |
| `<=>` (cosine) | Normalized embeddings; magnitude-invariant similarity |
| `<+>` (L1) | Sparse or high-dimensional data; absolute differences |
| `<~>` (Hamming) | Binary embeddings; image hashes, binary codes |
| `<%>` (Jaccard) | Binary embeddings; set-overlap similarity |

## Basic Usage

### Nearest-Neighbor Search (ORDER BY + LIMIT)
```sql
-- L2: most common
SELECT * FROM items ORDER BY embedding <-> '[3,1,2]' LIMIT 5;

-- Inner product: maximizes similarity (ASC picks most negative = most similar)
SELECT * FROM items ORDER BY embedding <#> '[3,1,2]' LIMIT 5;

-- Cosine distance
SELECT * FROM items ORDER BY embedding <=> '[3,1,2]' LIMIT 5;

-- L1 (Manhattan)
SELECT * FROM items ORDER BY embedding <+> '[3,1,2]' LIMIT 5;

-- Binary vectors: Hamming
SELECT * FROM items ORDER BY embedding <~> '101' LIMIT 5;

-- Binary vectors: Jaccard
SELECT * FROM items ORDER BY embedding <%> '101' LIMIT 5;
```

### Radius Search (WHERE distance < threshold)
```sql
SELECT * FROM items WHERE embedding <-> '[3,1,2]' < 5;
-- Combine with ORDER BY + LIMIT for index usage:
SELECT * FROM items
WHERE embedding <-> '[3,1,2]' < 5
ORDER BY embedding <-> '[3,1,2]' LIMIT 10;
```

### Nearest to an Existing Row
```sql
SELECT * FROM items WHERE id != 1
ORDER BY embedding <-> (SELECT embedding FROM items WHERE id = 1) LIMIT 5;
```

## Key APIs (Summary)

### Operator–Type Compatibility

| Operator | vector | halfvec | bit | sparsevec |
|----------|:------:|:-------:|:---:|:---------:|
| `<->` L2 | ✓ | ✓ | — | ✓ |
| `<#>` neg IP | ✓ | ✓ | — | ✓ |
| `<=>` cosine | ✓ | ✓ | — | ✓ |
| `<+>` L1 | ✓ | ✓ | — | ✓ |
| `<~>` Hamming | — | — | ✓ | — |
| `<%>` Jaccard | — | — | ✓ | — |

### Converting Distance to Similarity

```sql
-- <#> returns NEGATIVE inner product → multiply by -1
SELECT (embedding <#> '[3,1,2]') * -1 AS inner_product FROM items;

-- <=> returns cosine DISTANCE → subtract from 1
SELECT 1 - (embedding <=> '[3,1,2]') AS cosine_similarity FROM items;
```

### Retrieve Raw Distance
```sql
SELECT id, embedding <-> '[3,1,2]' AS distance FROM items;
```

### Aggregate Vectors
```sql
SELECT AVG(embedding) FROM items;
SELECT category_id, AVG(embedding) FROM items GROUP BY category_id;
```

## Caveats
- **`<#>` is negative inner product**: most-similar = smallest (most negative) value. Always `* -1` for the real dot product
- **`<=>` is cosine distance** (range 0–2 for non-negative vectors). For cosine *similarity* use `1 - (embedding <=> query)`
- Exact search (no index) gives perfect recall; approximate indexes trade recall for speed
- Distance filtering in `WHERE` without `ORDER BY + LIMIT` won't use approximate indexes — the planner needs both clauses
- `<~>` and `<%>` only work with `bit` type — attempting on `vector`/`halfvec`/`sparsevec` will error
- Both operands must be the same type; no cross-type operator resolution
- Sparse vector indices are 1-based (SQL array convention)
- `AVG(embedding)` returns the same vector type as the column
- For small tables or low `LIMIT`, the planner may choose sequential scan even with an index present

## Composition Hints
- Use `pgvector-install-types` for type definitions and table setup before applying these operators
- Use `pgvector-indexes` to add HNSW/IVFFlat indexes; each index is tied to ONE distance operator class
- For embedding models that output normalized vectors (cosine-optimized), use `<=>` with an HNSW `vector_cosine_ops` index
- For CLIP/Sentence-BERT models, `<=>` is the standard choice
- When distance-filtering with approximate indexes, prefer materialized CTE pattern: scan with `ORDER BY ... LIMIT`, then filter distance outside the CTE

---
name: pgvector-indexes
description: Create and tune HNSW and IVFFlat approximate indexes for pgvector, including filtering strategies and expression indexes.
tech_stack: [postgresql]
language: sql
capability: [relational-db]
version: "pgvector v0.8.2"
collected_at: 2025-01-01
---

# pgvector — Indexing (HNSW, IVFFlat, Filtering)

> Source: https://github.com/pgvector/pgvector/blob/v0.8.2/README.md, CHANGELOG.md

## Purpose
pgvector supports two approximate nearest neighbor (ANN) index types — **HNSW** and **IVFFlat** — plus expression indexes for binary quantization, half-precision, and subvectors. By default pgvector does exact search (perfect recall); indexes trade recall for speed.

## When to Use
- **HNSW** (default choice): better speed-recall tradeoff; can build on empty tables; more memory, slower builds
- **IVFFlat**: faster builds, less memory; *requires* existing data; good for batch-loaded, rarely-updated tables
- **Iterative index scans** (v0.8.0+): when combining vector search with `WHERE` filters on approximate indexes
- **Expression indexes**: binary quantization for massive scale; half-precision for smaller indexes; subvectors for partial-indexing strategies

## Basic Usage

### Quick Start — HNSW
```sql
-- 1. Load data
COPY items (embedding) FROM STDIN WITH (FORMAT BINARY);

-- 2. Build index (tune memory + parallelism)
SET maintenance_work_mem = '4GB';
SET max_parallel_maintenance_workers = 4;
CREATE INDEX ON items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

-- 3. Query
SET hnsw.ef_search = 100;
SELECT id FROM items ORDER BY embedding <=> '[...]' LIMIT 10;
```

### Quick Start — IVFFlat
```sql
-- 1. Load data first (MANDATORY)
INSERT INTO items (embedding) SELECT ...;

-- 2. Build index (~1M rows → lists=1000)
CREATE INDEX ON items USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 1000);

-- 3. Query (probes ≈ sqrt(lists))
SET ivfflat.probes = 32;
SELECT id FROM items ORDER BY embedding <-> '[...]' LIMIT 10;
```

## Key APIs (Summary)

### HNSW Operator Classes

| Operator Class | Distance | Vector Types |
|---------------|----------|-------------|
| `vector_l2_ops` / `halfvec_l2_ops` / `sparsevec_l2_ops` | L2 | all except bit |
| `vector_ip_ops` / `halfvec_ip_ops` / `sparsevec_ip_ops` | Inner Product | all except bit |
| `vector_cosine_ops` / `halfvec_cosine_ops` / `sparsevec_cosine_ops` | Cosine | all except bit |
| `vector_l1_ops` / `halfvec_l1_ops` / `sparsevec_l1_ops` | L1 | all except bit |
| `bit_hamming_ops` | Hamming | bit only |
| `bit_jaccard_ops` | Jaccard | bit only |

### HNSW Tuning Parameters

| Setting | Default | Scope | Effect |
|---------|---------|-------|--------|
| `m` | 16 | Index option | Connections per layer |
| `ef_construction` | 64 | Index option | Build-time candidate list size |
| `hnsw.ef_search` | 40 | Session/GUC | Query-time candidate list size |
| `maintenance_work_mem` | varies | Session | Memory for index build |
| `max_parallel_maintenance_workers` | 2 | Session | Parallel build workers |
| `hnsw.iterative_scan` | off | Session | `strict_order` or `relaxed_order` |
| `hnsw.max_scan_tuples` | 20000 | Session | Cap for iterative scans |

### IVFFlat Tuning Parameters

| Setting | Default | Scope | Effect |
|---------|---------|-------|--------|
| `lists` | required | Index option | Number of inverted lists |
| `ivfflat.probes` | 1 | Session/GUC | Lists probed per query |
| `ivfflat.iterative_scan` | off | Session | `relaxed_order` |
| `ivfflat.max_probes` | 100 | Session | Cap for iterative scans |

### Lists Formula (IVFFlat)
- ≤1M rows: `lists = rows / 1000`
- >1M rows: `lists = sqrt(rows)`

### Index Build — Production Safe
```sql
CREATE INDEX CONCURRENTLY ON items USING hnsw (embedding vector_l2_ops);
```

### Monitor Build Progress
```sql
-- HNSW phases: initializing → loading tuples
-- IVFFlat phases: initializing → performing k-means → assigning tuples → loading tuples
SELECT phase, round(100.0 * blocks_done / nullif(blocks_total, 0), 1) AS "%"
FROM pg_stat_progress_create_index;
```

### Filtering Strategies

**B-tree on filter column** (best when filter matches few rows):
```sql
CREATE INDEX ON items (category_id);
SELECT * FROM items WHERE category_id = 123
ORDER BY embedding <-> '[...]' LIMIT 5;
```

**Partial index** (few distinct filter values):
```sql
CREATE INDEX ON items USING hnsw (embedding vector_l2_ops)
WHERE (category_id = 123);
```

**Iterative scan** (post-filter with ANN, v0.8.0+):
```sql
SET hnsw.iterative_scan = relaxed_order;
SET hnsw.ef_search = 100;
SELECT id FROM items WHERE tenant_id = 42
ORDER BY embedding <=> '[...]' LIMIT 20;
```

**Materialized CTE for strict ordering from relaxed scan**:
```sql
WITH relaxed AS MATERIALIZED (
    SELECT id, embedding <-> '[...]' AS dist
    FROM items WHERE cat = 1 ORDER BY dist LIMIT 5
) SELECT * FROM relaxed ORDER BY dist + 0;  -- "+ 0" for PG 17+
```

### Expression Indexes

**Binary quantization** (smallest/fastest — always re-rank):
```sql
CREATE INDEX ON items USING hnsw
  ((binary_quantize(embedding)::bit(3)) bit_hamming_ops);

SELECT * FROM (
    SELECT * FROM items
    ORDER BY binary_quantize(embedding)::bit(3) <~> binary_quantize('[...]')
    LIMIT 20
) ORDER BY embedding <=> '[...]' LIMIT 5;
```

**Half-precision expression index**:
```sql
CREATE INDEX ON items USING hnsw
  ((embedding::halfvec(3)) halfvec_l2_ops);
```

**Subvector index** (index part of each vector):
```sql
CREATE INDEX ON items USING hnsw
  ((subvector(embedding, 1, 3)::vector(3)) vector_cosine_ops);
```

## Caveats
- ANN indexes return **approximate** results — never use when perfect recall is mandatory
- Separate index needed for **each** distance operator you query with
- IVFFlat requires data before creation (`sparsevec` not supported for IVFFlat)
- `WHERE` filtering on approximate indexes happens **after** the index scan → results may be fewer than `LIMIT`; use iterative scans or raise `ef_search`/`probes`
- `maintenance_work_mem` too high can OOM the server; watch for the "graph no longer fits" notice
- v0.8.2 fixed a buffer overflow in parallel HNSW builds — ensure you're on it
- Expression indexes require matching expressions in queries (exact casts + function calls)
- Binary quantization trades recall for size/speed — always re-rank with full-precision vectors
- Load data *before* creating indexes for best build performance
- `CREATE INDEX CONCURRENTLY` avoids table locks but is slower

## Composition Hints
- Use `pgvector-install-types` for table setup and type definitions before indexing
- Use `pgvector-distance-operators` to choose the right distance operator; create the matching operator class index
- For multitenant SaaS: B-tree on `tenant_id` + HNSW on `embedding` is a strong default
- For >10M vectors: binary quantization + HNSW + re-rank with original vectors
- For OpenAI embeddings (1536d): `halfvec` type + `halfvec_cosine_ops` HNSW index for 2× storage savings

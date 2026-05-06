---
name: pgvector-install-types
description: Install pgvector extension and work with vector, halfvec, bit, and sparsevec types in Postgres.
tech_stack: [postgresql]
language: sql
capability: [relational-db]
version: "pgvector v0.8.2"
collected_at: 2025-01-01
---

# pgvector — Installation & Vector Types

> Source: https://github.com/pgvector/pgvector/blob/v0.8.2/README.md

## Purpose
pgvector is a Postgres extension (13+) for vector similarity search. It stores vector embeddings alongside relational data with ACID guarantees, supporting exact and approximate nearest neighbor search directly in SQL.

## When to Use
- You need vector similarity search without leaving Postgres
- You want embeddings co-located with the relational data they reference
- Choose `vector` for full-precision (≤2000 dims), `halfvec` for smaller footprint (≤4000 dims), `bit` for binary/hash embeddings (≤64000 dims), `sparsevec` for sparse embeddings (≤1000 non-zero elements)

## Basic Usage

### Install (Linux/Mac)
```sh
cd /tmp
git clone --branch v0.8.2 https://github.com/pgvector/pgvector.git
cd pgvector
make
make install          # may need sudo
```

Also available via Docker, Homebrew, APT, Yum, PGXN, conda-forge, and preinstalled on many hosted Postgres providers.

### Install (Windows)
```cmd
set "PGROOT=C:\Program Files\PostgreSQL\18"
cd %TEMP%
git clone --branch v0.8.2 https://github.com/pgvector/pgvector.git
cd pgvector
nmake /F Makefile.win
nmake /F Makefile.win install
```

### Enable & Create
```sql
-- Run once per database
CREATE EXTENSION vector;

-- Create a table with a vector column
CREATE TABLE items (id bigserial PRIMARY KEY, embedding vector(3));

-- Or add to existing table
ALTER TABLE items ADD COLUMN embedding vector(3);
```

### CRUD Operations
```sql
-- Insert
INSERT INTO items (embedding) VALUES ('[1,2,3]'), ('[4,5,6]');

-- Bulk load (fastest)
COPY items (embedding) FROM STDIN WITH (FORMAT BINARY);

-- Upsert
INSERT INTO items (id, embedding) VALUES (1, '[1,2,3]')
    ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding;

-- Update / Delete
UPDATE items SET embedding = '[1,2,3]' WHERE id = 1;
DELETE FROM items WHERE id = 1;
```

### Quick Nearest-Neighbor Query
```sql
SELECT * FROM items ORDER BY embedding <-> '[3,1,2]' LIMIT 5;
```

## Key APIs (Summary)

### Vector Types

| Type       | Precision    | Max Dims | Format Example                        |
|------------|-------------|----------|---------------------------------------|
| `vector`   | single (32b)| 2,000    | `'[1,2,3]'`                          |
| `halfvec`  | half (16b)  | 4,000    | `'[1,2,3]'`                          |
| `bit`      | binary (1b) | 64,000   | `'000'`, `'111'`                      |
| `sparsevec`| single      | 1,000 nnz| `'{1:1,3:2,5:3}/5'` (1-based index)  |

### Distance Operators

| Operator | Distance             | Supported Types              |
|----------|---------------------|------------------------------|
| `<->`    | L2 (Euclidean)       | vector, halfvec, sparsevec   |
| `<#>`    | Negative inner product| vector, halfvec, sparsevec   |
| `<=>`    | Cosine distance      | vector, halfvec, sparsevec   |
| `<+>`    | L1 (Manhattan)       | vector, halfvec, sparsevec   |
| `<~>`    | Hamming              | bit only                     |
| `<%>`    | Jaccard              | bit only                     |

### Conversions
```sql
-- <#> returns negative inner product → multiply by -1
SELECT (embedding <#> '[3,1,2]') * -1 AS inner_product FROM items;

-- <=> returns cosine distance → subtract from 1 for similarity
SELECT 1 - (embedding <=> '[3,1,2]') AS cosine_similarity FROM items;
```

### Aggregates
```sql
SELECT AVG(embedding) FROM items;
SELECT category_id, AVG(embedding) FROM items GROUP BY category_id;
```

## Caveats
- `<#>` returns **negative** inner product — always multiply by `-1` for the real dot product
- `CREATE EXTENSION vector` must be run in **each database** that uses pgvector
- Postgres **13+** required (v0.8.0 dropped Postgres 12)
- `vector` max 2,000 dims (index limit; stored limit is 16,000). Use `halfvec` for up to 4,000 dims
- `sparsevec` indices start at **1** (SQL array convention), not 0
- `sparsevec` max 1,000 non-zero elements
- Bulk load with `COPY ... FORMAT BINARY` — orders of magnitude faster than row-by-row INSERT
- On Windows, Visual Studio C++ build tools and x64 Native Tools Command Prompt required

## Composition Hints
- Pair with `pgvector-distance-operators` for detailed distance-function usage patterns
- Pair with `pgvector-indexes` when you need HNSW or IVFFlat approximate indexes for production scale
- For Python apps, use `pgvector-python` client library for embedding generation + bulk loading
- Use `halfvec` for OpenAI/Cohere embeddings (1536+ dims) to halve storage without meaningful recall loss

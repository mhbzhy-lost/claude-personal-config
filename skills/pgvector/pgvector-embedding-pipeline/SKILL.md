---
name: pgvector-embedding-pipeline
description: Production embedding pipeline for pgvector — ingesting, bulk loading, and safely upgrading embedding models without breaking retrieval.
tech_stack: [postgresql]
language: [python, sql, go]
capability: [rag, relational-db]
version: "pgvector v0.8.2"
collected_at: 2025-07-17
---

# pgvector Embedding Pipeline

> Source: https://github.com/pgvector/pgvector-python/blob/master/examples/openai/example.py, https://github.com/pgvector/pgvector-python/blob/master/examples/loading/example.py, encoder upgrade playbook

## Purpose

A production-grade pattern for ingesting vector embeddings into pgvector at scale, with a versioned schema that supports safe encoder model upgrades, shadow traffic validation, and one-config-flip cutover/rollback.

## When to Use

- You're building a semantic search system on PostgreSQL that will evolve through multiple embedding models
- You need to bulk-load millions of vectors efficiently
- You expect to upgrade from one encoder (e.g., `text-embedding-3-small` → `text-embedding-3-large` or a local model) without downtime
- Retrieval quality is business-critical and you need measurable validation gates before shipping model changes

## Basic Usage

### Simple pipeline: embed + store + query

Minimal pattern for getting started with OpenAI embeddings:

```python
import numpy as np
from openai import OpenAI
from pgvector.psycopg import register_vector
import psycopg

conn = psycopg.connect(dbname='pgvector_example', autocommit=True)
conn.execute('CREATE EXTENSION IF NOT EXISTS vector')
register_vector(conn)

conn.execute('CREATE TABLE documents (id bigserial PRIMARY KEY, content text, embedding vector(1536))')

def embed(texts, model='text-embedding-3-small'):
    client = OpenAI()
    resp = client.embeddings.create(input=texts, model=model)
    return [v.embedding for v in resp.data]

# Ingest
for content, emb in zip(texts, embed(texts)):
    conn.execute('INSERT INTO documents (content, embedding) VALUES (%s, %s)',
                 (content, np.array(emb)))

# Query
query_emb = embed(['forest'])[0]
results = conn.execute(
    'SELECT content FROM documents ORDER BY embedding <=> %s LIMIT 5',
    (np.array(query_emb),)
).fetchall()
```

### Bulk loading with COPY (binary)

For 100K+ vectors, use PostgreSQL binary COPY — orders of magnitude faster than row-by-row INSERT:

```python
import numpy as np
from pgvector.psycopg import register_vector
import psycopg

conn = psycopg.connect(dbname='pgvector_example', autocommit=True)
conn.execute('CREATE EXTENSION IF NOT EXISTS vector')
register_vector(conn)
conn.execute(f'CREATE TABLE items (id bigserial, embedding vector({dimensions}))')

cur = conn.cursor()
with cur.copy('COPY items (embedding) FROM STDIN WITH (FORMAT BINARY)') as copy:
    copy.set_types(['vector'])
    for emb in embeddings:
        copy.write_row([emb])

# ALWAYS create indexes AFTER loading
conn.execute("SET maintenance_work_mem = '8GB'")
conn.execute('SET max_parallel_maintenance_workers = 7')
conn.execute('CREATE INDEX ON items USING hnsw (embedding vector_cosine_ops)')
conn.execute('ANALYZE items')
```

### Versioned embedding schema (encoder upgrade safe)

The critical pattern for production: separate chunks from their embedding versions so multiple encoders can coexist:

```sql
-- Stable document identity (survives re-chunking, renames, model changes)
CREATE TABLE document_chunks (
    id bigserial PRIMARY KEY,
    semantic_key text NOT NULL UNIQUE,  -- sha256(doc_id || ':' || chunk_no || ':' || normalized_text)
    document_id uuid NOT NULL,
    chunk_no int NOT NULL,
    content text NOT NULL,
    content_sha256 bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Registry of encoder versions (control plane)
CREATE TABLE embedding_versions (
    id bigserial PRIMARY KEY,
    version_key text NOT NULL UNIQUE,   -- e.g. 'embed-v2026-03'
    encoder_name text NOT NULL,
    encoder_revision text NOT NULL,
    dimensions int NOT NULL,
    distance_metric text NOT NULL CHECK (distance_metric IN ('cosine', 'l2', 'ip')),
    active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Vectors versioned per encoder (one index per version!)
CREATE TABLE chunk_embeddings (
    chunk_id bigint NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    embedding_version_id bigint NOT NULL REFERENCES embedding_versions(id) ON DELETE CASCADE,
    embedding vector(1536) NOT NULL,
    PRIMARY KEY (chunk_id, embedding_version_id)
);

-- ONE index per embedding version; partition or separate table per version
CREATE INDEX CONCURRENTLY idx_emb_v1_hnsw
    ON chunk_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);
```

### Encoder upgrade workflow

1. **Register** the new version:
```sql
INSERT INTO embedding_versions (version_key, encoder_name, encoder_revision, dimensions, distance_metric)
VALUES ('embed-v2026-03', 'text-embedding-3-large-next', '2026-03-01', 1536, 'cosine')
ON CONFLICT (version_key) DO NOTHING;
```

2. **Backfill** in batches (worker reads unprocessed chunks, generates embeddings, writes via COPY):
```sql
WITH target AS (SELECT id FROM embedding_versions WHERE version_key = 'embed-v2026-03')
SELECT dc.id, dc.semantic_key, dc.content
FROM document_chunks dc
WHERE NOT EXISTS (
    SELECT 1 FROM chunk_embeddings ce, target t
    WHERE ce.chunk_id = dc.id AND ce.embedding_version_id = t.id
) ORDER BY dc.id LIMIT 1000;
```

3. **Shadow** traffic: mirror production queries to the candidate index, log top-K results and overlap with primary — but return primary results to users.

4. **Validate** with a cross-encoder on judged query sets. Hard-gate on segment-specific metrics (e.g., invoice queries precision@10 ≥ 0.90). Fail CI if thresholds are not met.

5. **Cut over** with a single config flip:
```sql
UPDATE embedding_versions SET active = CASE WHEN version_key = 'embed-v2026-03' THEN true ELSE false END;
```

6. **Keep old index queryable** for rollback via env var `RETRIEVAL_ROLLBACK_VERSION=embed-v2026-02`.

## Key APIs (Summary)

| Step | Method |
|---|---|
| Generate embeddings | OpenAI `embeddings.create()`, SentenceTransformers `.encode()`, etc. |
| Insert (small) | `conn.execute('INSERT ... VALUES (%s, %s)', ...)` |
| Bulk load | `cur.copy('COPY ... FROM STDIN WITH (FORMAT BINARY)')` + `copy.set_types(['vector'])` |
| Vector index | `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)` |
| Query | `SELECT ... ORDER BY embedding <=> %s LIMIT N` |
| Semantic key | `sha256(doc_id \|\| ':' \|\| chunk_no \|\| ':' \|\| normalized_text)` |

## Caveats

### Never overwrite embeddings in place
Updating an `embedding` column destroys the only comparison point you had. Always version embeddings separately from source chunks.

### One index per embedding version
pgvector indexes don't understand logical versioning. Storing multiple encoder versions in one table without partitioning causes the planner to scan wrong graphs → latency + recall bugs. Partition by `embedding_version_id` or use separate tables.

### Dimension mismatch is a hard error
```
ERROR: expected 1536 dimensions, not 1024
```
Validate encoder output dimensions against the target column before starting any backfill.

### Never compare cosine scores across models
Score distributions differ between encoders. `0.85` from one model ≠ `0.85` from another. Compare ranks, judged relevance, or downstream task success.

### Score thresholds rot across model swaps
Any logic like `if score > 0.82: answer directly` will break. Delete absolute thresholds or version them per encoder.

### Indexes after bulk load, not before
Create HNSW/IVFFlat indexes after loading data. Set `maintenance_work_mem` high (e.g., 8GB) and `max_parallel_maintenance_workers` to parallelize. Use `CONCURRENTLY` in production to avoid blocking writes.

### Semantic keys must be deterministic
Use `sha256(doc_id || ':' || chunk_no || ':' || normalized_text)`, not auto-increment row IDs. Re-chunking, imports, or sharding will change row IDs and destroy all comparisons and caches.

### Rollback = config flip, not re-index
If rolling back means regenerating 200M embeddings, you don't have rollback. Keep the old index queryable until the new one has survived real traffic.

## Composition Hints

- **With pgvector-sqlalchemy**: Define `document_chunks` and `chunk_embeddings` as SQLAlchemy models; use `mapped_column(VECTOR(d))` for the embedding column. The Alembic `ischema_names` hack is mandatory.
- **With pgvector-hybrid-search**: Embedding pipelines populate the vector column; hybrid search queries combine it with `tsvector` full-text indexes on the `content` column.
- **For cross-encoder validation**: Use a reranker (Cohere, Jina, SentenceTransformers) to score `(query, chunk)` pairs from both old and candidate indexes. Compare ranks, not raw scores.
- **Shadow proxy**: A thin Go/Python proxy that fans out queries to primary + candidate retrievers, returns primary, and logs comparison metrics is ~150 lines and pays for itself on the first encoder upgrade.

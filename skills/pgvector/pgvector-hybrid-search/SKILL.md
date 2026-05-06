---
name: pgvector-hybrid-search
description: Combine pgvector semantic search with PostgreSQL full-text search using Reciprocal Rank Fusion or cross-encoder re-ranking.
tech_stack: [postgresql]
language: [python, sql]
capability: [search-engine, rag]
version: "pgvector v0.8.2"
collected_at: 2025-07-17
---

# pgvector Hybrid Search

> Source: https://github.com/pgvector/pgvector/blob/master/README.md, https://github.com/pgvector/pgvector-python/blob/master/examples/hybrid_search/

## Purpose

Combine pgvector semantic (vector) search with PostgreSQL full-text keyword search to produce a single ranked result set. Two fusion strategies are supported: **Reciprocal Rank Fusion (RRF)** in pure SQL, and **cross-encoder re-ranking** in Python.

## When to Use

- Queries contain both semantic intent and specific keywords that embeddings alone miss (product codes, names, IDs)
- You need higher recall than pure vector or pure keyword search can provide alone
- You want to avoid deploying a separate search engine (Elasticsearch, etc.) — PostgreSQL handles both
- Your application can tolerate the latency of two queries + fusion (or you can parallelize them)

## Basic Usage

### Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
    id bigserial PRIMARY KEY,
    content text,
    embedding vector(384)
);

-- Full-text search index
CREATE INDEX ON documents USING GIN (to_tsvector('english', content));

-- Optional: vector index for ANN (adds speed at cost of some recall)
-- CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);
```

### Strategy A: Reciprocal Rank Fusion (pure SQL)

Best when latency matters and you don't need per-pair relevance scoring. The RRF formula is `1 / (k + rank)` where `k` is typically 60.

```sql
WITH semantic_search AS (
    SELECT id, RANK() OVER (ORDER BY embedding <=> %(embedding)s) AS rank
    FROM documents
    ORDER BY embedding <=> %(embedding)s
    LIMIT 20
),
keyword_search AS (
    SELECT id, RANK() OVER (ORDER BY ts_rank_cd(to_tsvector('english', content), query) DESC)
    FROM documents, plainto_tsquery('english', %(query)s) query
    WHERE to_tsvector('english', content) @@ query
    ORDER BY ts_rank_cd(to_tsvector('english', content), query) DESC
    LIMIT 20
)
SELECT
    COALESCE(s.id, k.id) AS id,
    COALESCE(1.0 / (%(k)s + s.rank), 0.0) +
    COALESCE(1.0 / (%(k)s + k.rank), 0.0) AS score
FROM semantic_search s
FULL OUTER JOIN keyword_search k ON s.id = k.id
ORDER BY score DESC
LIMIT 5;
```

From Python with psycopg:

```python
from pgvector.psycopg import register_vector
import psycopg
from sentence_transformers import SentenceTransformer

conn = psycopg.connect(dbname='pgvector_example', autocommit=True)
conn.execute('CREATE EXTENSION IF NOT EXISTS vector')
register_vector(conn)

model = SentenceTransformer('multi-qa-MiniLM-L6-cos-v1')
query = 'growling bear'
embedding = model.encode(query)

results = conn.execute(rrf_sql, {
    'query': query, 'embedding': embedding, 'k': 60
}).fetchall()
```

### Strategy B: Cross-Encoder Re-ranking (Python)

Best when relevance quality is critical and you can afford model inference. Runs semantic and keyword searches in parallel, deduplicates, then scores each (query, document) pair with a cross-encoder.

```python
import asyncio
import itertools
from pgvector.psycopg import register_vector_async
import psycopg
from sentence_transformers import CrossEncoder, SentenceTransformer

async def semantic_search(conn, query):
    model = SentenceTransformer('multi-qa-MiniLM-L6-cos-v1')
    embedding = model.encode(query)
    async with conn.cursor() as cur:
        await cur.execute(
            'SELECT id, content FROM documents ORDER BY embedding <=> %s LIMIT 20',
            (embedding,))
        return await cur.fetchall()

async def keyword_search(conn, query):
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT id, content FROM documents, plainto_tsquery('english', %s) q "
            "WHERE to_tsvector('english', content) @@ q "
            "ORDER BY ts_rank_cd(to_tsvector('english', content), q) DESC LIMIT 20",
            (query,))
        return await cur.fetchall()

def rerank(query, results):
    results = set(itertools.chain(*results))  # deduplicate by id
    encoder = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
    scores = encoder.predict([(query, item[1]) for item in results])
    return [v for _, v in sorted(zip(scores, results), reverse=True)]

async def hybrid_search(conn, query):
    results = await asyncio.gather(
        semantic_search(conn, query),
        keyword_search(conn, query))
    return rerank(query, results)
```

## Key APIs (Summary)

| Component | Role |
|---|---|
| `to_tsvector('english', content)` | Tokenizes text for full-text search |
| `plainto_tsquery('english', query)` | Converts raw query to tsquery (ignores operators) |
| `phraseto_tsquery('english', query)` | Alternative: preserves word order |
| `ts_rank_cd(tsvector, tsquery)` | Ranks by cover density (preferred for hybrid) |
| `RANK() OVER (ORDER BY ...)` | Produces ordinal ranks for RRF |
| `FULL OUTER JOIN` | Merges semantic + keyword sides in RRF |
| `CrossEncoder.predict(pairs)` | Scores (query, doc) pairs for re-ranking |

## Caveats

### RRF limitations
- `k=60` is a heuristic — tune for your data distribution
- RRF ignores raw similarity scores; a dominant match in one modality looks the same as a weak match
- Both CTEs independently `LIMIT 20` — results beyond this window are lost. Increase for higher recall at cost of speed

### Cross-encoder limitations
- Inference is expensive; re-ranking >100 candidates may hurt latency
- `cross-encoder/ms-marco-MiniLM-L-6-v2` is lightweight; production may need larger models (Cohere, Jina, Voyage rerankers)
- Must fetch results to Python — cannot be done in pure SQL

### General
- PostgreSQL GIN indexes on `tsvector` default to English stemming; other languages need dictionary configuration
- Raw user input must be preprocessed with `plainto_tsquery` or `phraseto_tsquery` — literal strings won't match
- Cosine distance (`<=>`) and `ts_rank_cd` produce incomparable scores — hence RRF or cross-encoder fusion is **required**

## Composition Hints

- **With pgvector-sqlalchemy**: Define the `documents` table using SQLAlchemy models with a `VECTOR` column; use raw SQL or `text()` for the full-text GIN index and RRF query
- **With embedding pipelines**: The embedding column should be populated by your embedding pipeline before hybrid queries execute
- **For production**: Consider adding an HNSW/IVFFlat index on the vector column if the semantic CTE scans large tables; set `hnsw.ef_search` higher for better recall under the LIMIT
- **Parallel execution**: Both search arms are independent — always run them concurrently (async Python, Go goroutines) to minimize latency

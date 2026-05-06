---
name: pgvector-sqlalchemy
description: Use pgvector vector similarity search with SQLAlchemy ORM and Alembic migrations in PostgreSQL.
tech_stack: [postgresql]
language: [python]
capability: [orm, relational-db]
version: "pgvector-python unversioned"
collected_at: 2025-07-17
---

# pgvector + SQLAlchemy

> Source: https://github.com/pgvector/pgvector-python/blob/master/README.md, https://github.com/sqlalchemy/sqlalchemy/discussions/1324

## Purpose

Integrate PostgreSQL pgvector extension with SQLAlchemy ORM/Core for storing and querying vector embeddings. Supports dense (`VECTOR`), half-precision (`HALFVEC`), binary (`BIT`), and sparse (`SPARSEVEC`) vector types with HNSW and IVFFlat approximate indexes.

## When to Use

- You need vector similarity search in PostgreSQL alongside existing relational data
- Your stack uses SQLAlchemy ORM or Core (including SQLModel, which reuses `pgvector.sqlalchemy` types)
- You want a single database for both structured queries and ANN search
- You use Alembic for migrations and need `vector` type support in autogenerate/check

## Basic Usage

### Model definition

```python
from pgvector.sqlalchemy import VECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
import numpy as np

class Base(DeclarativeBase):
    pass

class Item(Base):
    __tablename__ = "items"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    embedding: Mapped[np.ndarray] = mapped_column(VECTOR(3))
```

Other column types: `HALFVEC(d)`, `BIT(d)`, `SPARSEVEC(d)`.

### Enable extension, insert, and query

```python
session.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

# Insert
session.add(Item(embedding=[1, 2, 3]))
session.commit()

# Nearest neighbors by L2 distance
from sqlalchemy import select
results = session.scalars(
    select(Item).order_by(Item.embedding.l2_distance([3, 1, 2])).limit(5)
).all()

# Within distance
results = session.scalars(
    select(Item).filter(Item.embedding.l2_distance([3, 1, 2]) < 5)
).all()

# Get distance value
session.scalars(select(Item.embedding.l2_distance([3, 1, 2])))
```

### Distance methods on vector columns

| Method | PostgreSQL operator | Use case |
|---|---|---|
| `l2_distance(v)` | `<->` | Euclidean (most common) |
| `max_inner_product(v)` | `<#>` | Dot product similarity |
| `cosine_distance(v)` | `<=>` | Cosine distance |
| `l1_distance(v)` | `<+>` | Manhattan |
| `hamming_distance(v)` | `<~>` | Binary vectors only |
| `jaccard_distance(v)` | `<%>` | Binary vectors only |

### Aggregation

```python
from pgvector.sqlalchemy import avg, sum
session.scalars(select(avg(Item.embedding))).first()
```

### Approximate indexes (HNSW / IVFFlat)

```python
from sqlalchemy import Index

# HNSW — better speed/recall, higher memory, no training step
Index("my_hnsw", Item.embedding,
      postgresql_using="hnsw",
      postgresql_with={"m": 16, "ef_construction": 64},
      postgresql_ops={"embedding": "vector_l2_ops"}).create(engine)

# IVFFlat — faster build, lower memory, needs data before creation
Index("my_ivfflat", Item.embedding,
      postgresql_using="ivfflat",
      postgresql_with={"lists": 100},
      postgresql_ops={"embedding": "vector_l2_ops"}).create(engine)
```

Operator classes: `vector_l2_ops`, `vector_ip_ops`, `vector_cosine_ops`. For halfvec: `halfvec_l2_ops`, etc.

### Half-precision and binary quantization

```python
from pgvector.sqlalchemy import HALFVEC, BIT
from sqlalchemy.sql import func

# Index on casted half-precision
Index("my_idx",
      func.cast(Item.embedding, HALFVEC(3)).label("embedding"),
      postgresql_using="hnsw",
      postgresql_ops={"embedding": "halfvec_l2_ops"})

# Query: cast at query time
order = func.cast(Item.embedding, HALFVEC(3)).l2_distance([3, 1, 2])
session.scalars(select(Item).order_by(order).limit(5))
```

### ARRAY of vectors + driver registration

```python
from sqlalchemy import ARRAY

class Item(Base):
    embeddings = mapped_column(ARRAY(VECTOR(3)))

# Psycopg 3 driver registration (required for ARRAY columns)
from pgvector.psycopg import register_vector
from sqlalchemy import event

@event.listens_for(engine, "connect")
def connect(dbapi_connection, connection_record):
    register_vector(dbapi_connection)

# Async: use register_vector_async inside engine.sync_engine connect event
```

## Key APIs (Summary)

- **Types**: `pgvector.sqlalchemy.VECTOR`, `HALFVEC`, `BIT`, `SPARSEVEC`
- **Column methods**: `.l2_distance()`, `.max_inner_product()`, `.cosine_distance()`, `.l1_distance()`, `.hamming_distance()`, `.jaccard_distance()`
- **Aggregates**: `pgvector.sqlalchemy.avg`, `pgvector.sqlalchemy.sum`
- **Index creation**: `sqlalchemy.Index(...).create(engine)` with `postgresql_using` and `postgresql_ops`
- **Driver registration**: `pgvector.psycopg.register_vector`, `pgvector.psycopg.register_vector_async`, `pgvector.psycopg2.register_vector`

## Caveats

### Alembic: must inject vector into ischema_names

SQLAlchemy cannot reflect `vector` columns — `alembic check` and autogenerate produce warnings. The **only fix** is injecting the type in `env.py`:

```python
import pgvector

def do_run_migrations(connection):
    connection.dialect.ischema_names["vector"] = pgvector.sqlalchemy.Vector
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()
```

Also add `import pgvector` to `script.py.mako`. This is confirmed by the SQLAlchemy maintainer as the intended workaround — `column_reflect` hook receives `NullType` and cannot recover vector info.

### Index creation uses engine, not session

Call `index.create(engine)`, not from a session. `CREATE INDEX CONCURRENTLY` is not supported through this API — use `session.execute(text("CREATE INDEX CONCURRENTLY ..."))`.

### Half-precision / binary indexing requires explicit func.cast()

The column type stays `VECTOR`; half-precision or binary quantization is applied via `func.cast()` at index and query time. The column itself is not altered.

### ARRAY(VECTOR) needs driver registration

Without the `connect` event registering vector types, array-of-vector columns will fail to serialize/deserialize.

## Composition Hints

- **With SQLModel**: SQLModel uses `pgvector.sqlalchemy` types directly via `Field(sa_type=VECTOR(3))` — all column methods and index patterns are identical.
- **With FastAPI**: Use `VECTOR` columns in SQLAlchemy models; FastAPI doesn't need special handling as vectors serialize to lists naturally.
- **With Alembic migrations**: Always pair any model using `VECTOR` with the `ischema_names` hack in `env.py`. Create the extension in a migration: `op.execute("CREATE EXTENSION IF NOT EXISTS vector")`.
- **For bulk loading**: Use psycopg `COPY ... FROM STDIN WITH (FORMAT BINARY)` with `copy.set_types(["vector"])` rather than ORM inserts — orders of magnitude faster for large corpora.

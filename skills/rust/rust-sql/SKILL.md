---
name: rust-sql
description: Async SQL in Rust — sqlx for compile-time checked queries and connection pooling, SeaORM for entity-based ORM with relations and ActiveModel CRUD.
tech_stack: [backend]
language: [rust]
capability: [orm, relational-db]
version: "sqlx 0.8.x, SeaORM 2.0.x"
collected_at: 2025-01-01
---

# Rust SQL & ORM (sqlx + SeaORM)

> Source: https://docs.rs/sqlx/latest/sqlx/, https://github.com/launchbadge/sqlx, https://docs.rs/sea-orm/latest/sea_orm/, https://www.sea-ql.org/SeaORM/docs/index/

## Purpose

Two complementary approaches to SQL in async Rust:

- **sqlx** — compile-time checked raw SQL with connection pooling. Not an ORM. Maximum control, zero-cost.
- **SeaORM** — entity-based ORM built on sqlx + SeaQuery. ActiveModel pattern, relations, migrations, dynamic queries.

## When to Use

| Scenario | Use |
|---|---|
| Full control over SQL, compile-time verification | **sqlx** directly |
| PostgreSQL-specific features (LISTEN/NOTIFY, COPY) | **sqlx** |
| Prefer Rust structs over raw SQL strings | **SeaORM** |
| Need relations with lazy/eager loading | **SeaORM** |
| Rapid CRUD with insert/update/save/delete | **SeaORM** |
| Dynamic query building at runtime | **SeaORM** |
| Migration tooling + entity generation from DB | **SeaORM** |

## Basic Usage

### sqlx Quickstart

```rust
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect("postgres://postgres:password@localhost/test")
        .await?;

    let row: (i64,) = sqlx::query_as("SELECT $1")
        .bind(150_i64)
        .fetch_one(&pool)
        .await?;
    Ok(())
}
```

### sqlx Compile-time Checked Queries

```rust
// query! — anonymous record output, SQL verified against dev DB at compile time
let countries = sqlx::query!(
    "SELECT country, COUNT(*) as count FROM users
     GROUP BY country WHERE organization = ?",
    organization
).fetch_all(&pool).await?;
// countries[0].country: String, countries[0].count: i64

// query_as! — named struct output
struct Country { country: String, count: i64 }
let countries = sqlx::query_as!(Country,
    "SELECT country, COUNT(*) as count FROM users
     GROUP BY country WHERE organization = ?",
    organization
).fetch_all(&pool).await?;
```

### sqlx FromRow + Streaming

```rust
#[derive(sqlx::FromRow)]
struct User { name: String, id: i64 }

let mut stream = sqlx::query_as::<_, User>(
    "SELECT * FROM users WHERE email = ? OR name = ?"
).bind(email).bind(name).fetch(&mut conn);
```

### SeaORM Entity Definition

```rust
use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "cake")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub name: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::fruit::Entity")]
    Fruit,
}
impl Related<super::fruit::Entity> for Entity {
    fn to() -> RelationDef { Relation::Fruit.def() }
}
```

### SeaORM CRUD

```rust
// SELECT
let cakes: Vec<cake::Model> = Cake::find().all(db).await?;
let chocolate = Cake::find().filter(cake::Column::Name.contains("chocolate")).all(db).await?;
let cheese: Option<cake::Model> = Cake::find_by_id(1).one(db).await?;
// related — lazy
let fruits = cheese.find_related(Fruit).all(db).await?;
// related — eager
let cake_with_fruits: Vec<(cake::Model, Vec<fruit::Model>)> =
    Cake::find().find_with_related(Fruit).all(db).await?;

// INSERT
let apple = fruit::ActiveModel { name: Set("Apple".to_owned()), ..Default::default() };
let pear = apple.insert(db).await?;
Fruit::insert_many([apple, pear]).exec(db).await?;
// with ON CONFLICT
Fruit::insert_many([apple, pear]).on_conflict_do_nothing().exec(db).await?;

// UPDATE
let mut pear: fruit::ActiveModel = pear.unwrap().into();
pear.name = Set("Sweet pear".to_owned());
pear.update(db).await?;
// update many
Fruit::update_many()
    .col_expr(fruit::Column::CakeId, Expr::value(Value::Int(None)))
    .filter(fruit::Column::Name.contains("Apple")).exec(db).await?;

// SAVE — inserts when PK is NotSet, updates when PK is Set
let banana = fruit::ActiveModel { id: NotSet, name: Set("Banana".to_owned()), ..Default::default() };
let mut banana = banana.save(db).await?;  // INSERT
banana.name = Set("Banana Mongo".to_owned());
banana.save(db).await?;  // UPDATE

// DELETE
orange.delete(db).await?;
fruit::Entity::delete_many().filter(fruit::Column::Name.contains("Orange")).exec(db).await?;
```

## Key APIs (Summary)

### sqlx

| Category | Key Items |
|---|---|
| Pool types | `PgPool`, `MySqlPool`, `SqlitePool`, `Pool<DB>` |
| Pool config | `PgPoolOptions::new().max_connections(n).connect(url)` |
| Connection | `PgConnection::connect(url)`, `AnyConnection` |
| Transaction | `pool.begin().await?` → `Transaction<'_, DB>`, auto-rollback on drop |
| Query fns | `sqlx::query(sql)`, `sqlx::query_as::<_, T>(sql)`, `sqlx::query_scalar(sql)` |
| Bind params | `.bind(val)` — PostgreSQL uses `$1`, MySQL/SQLite use `?` |
| Finalizers | `.fetch_all()`, `.fetch_one()`, `.fetch_optional()`, `.fetch()`, `.execute()` |
| Macros | `query!`, `query_as!`, `query_scalar!`, `query_file!`, `query_file_as!`, `migrate!` |
| Unchecked | `query_unchecked!`, `query_as_unchecked!` — skip type checking, still parse SQL |
| FromRow | `#[derive(sqlx::FromRow)]` on struct |
| Migrations | `sqlx::migrate!("./migrations").run(&pool).await?` |
| Offline mode | `cargo sqlx prepare` — cache query metadata for CI |

### SeaORM

| Category | Key Items |
|---|---|
| Entity | `#[derive(DeriveEntityModel)]` on Model struct |
| Columns | Auto-generated `Column` enum from struct fields |
| Relations | `#[derive(DeriveRelation)]` enum + `impl Related<T> for Entity` |
| ActiveModel | `Model::into()` → `ActiveModel` with `Set(val)` / `NotSet` |
| Select | `Entity::find()`, `.filter()`, `.find_by_id()`, `.find_with_related()` |
| Insert | `ActiveModel::insert(db)`, `Entity::insert_many([...])` |
| Update | `ActiveModel::update(db)`, `Entity::update_many()` |
| Save | `ActiveModel::save(db)` — insert if PK is NotSet, update if Set |
| Delete | `Model::delete(db)`, `Entity::delete_many()` |
| Pagination | `Entity::find().paginate(db, page_size)` |
| Transaction | `db.transaction::<_, _, DbErr>(|txn| ...)` |
| Mock testing | `MockDatabase::new(DbBackend::Postgres)` with `.append_query_results()` |

### Feature Flags (sqlx)

```toml
# Minimal: runtime + database + TLS
sqlx = { version = "0.8", features = [
    "runtime-tokio",        # or runtime-async-std
    "tls-native-tls",       # or tls-rustls-ring-webpki
    "postgres",             # and/or mysql, sqlite
] }
# Additional: macros, migrate, chrono, uuid, json
sqlx = { version = "0.8", features = ["macros", "migrate", "chrono", "uuid", "json"] }
```

## Caveats

### sqlx

- **Compile-time queries need a running dev DB** — `query!` connects at build time. Schema must match production. Use `cargo sqlx prepare` for offline CI builds.
- **`DATABASE_URL` must be set at build time** (or `.env` with `dotenvy`).
- **At least one runtime feature required** — async functions panic without `runtime-tokio` or `runtime-async-std`.
- **Runtime precedence**: Tokio wins if both runtime features are enabled and a Tokio context is active.
- **TLS precedence**: `tls-native-tls` wins over `tls-rustls` if both enabled. `rustls` HandshakeFailure → server may not support TLS 1.2+.
- **SQLx is not an ORM** — no DSL, no entity generation, no relation loading. Just type-checked raw SQL.
- **Perf**: set `[profile.dev.package.sqlx-macros] opt-level = 3` for faster incremental builds.

### SeaORM

- **Built on sqlx** — pool, TLS, runtime config all go through sqlx. SeaORM re-exports it.
- **No compile-time SQL checking** — queries built at runtime via SeaQuery. Flexibility over verification.
- **ActiveModel semantics**: `NotSet` = leave as-is / use default; `Set(v)` = set value. `save()` inserts (PK NotSet) or updates (PK Set).
- **Relations need explicit `impl Related<T> for Entity`** even with derive macros.
- **Entity generation**: `sea-orm-cli generate entity -o src/entities` from existing DB.
- **MockDatabase** for testing: no real DB, uses `Vec<Statement>` and `BTreeMap<String, Value>`.

## Composition Hints

- **sqlx + SeaORM coexist**: Use SeaORM for most CRUD, drop to raw `sqlx::query_as` for complex queries or PostgreSQL-specific features. SeaORM's `DatabaseConnection` derefs to sqlx's pool.
- **Pool sharing**: Create one `PgPool` (sqlx) / `DatabaseConnection` (SeaORM) at startup, share via `Arc` or Axum `State`.
- **Migrations**: Use `sqlx-cli` (`sqlx migrate add`, `sqlx migrate run`) and embed with `sqlx::migrate!()` in `main()`.
- **Testing**: SeaORM's `MockDatabase` for unit tests; sqlx's `#[sqlx::test]` for integration tests with a real test DB.
- **Error handling**: sqlx returns `sqlx::Error`; SeaORM returns `DbErr`. Convert with `impl From<sqlx::Error> for DbErr`.
- **Tracing integration**: Enable `sqlx` feature `tracing` or use `log` feature; SeaORM has `metric` module for metrics collection.

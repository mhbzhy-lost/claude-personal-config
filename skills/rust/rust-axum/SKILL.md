---
name: rust-axum
description: Modular HTTP framework for Rust — routing, extractors, Tower middleware, and type-safe state sharing
tech_stack: [rust]
language: [rust]
capability: [web-framework, websocket, auth]
version: "axum 0.8.9, tower 0.4"
collected_at: 2025-07-11
---

# Axum

> Source: https://docs.rs/axum/latest/axum/, https://github.com/tokio-rs/axum, https://docs.rs/tower/latest/tower/

## Purpose

Axum is a modular HTTP routing and request-handling framework for Rust, built on `tokio` and `hyper`. Its defining characteristic is leveraging the **Tower `Service`/`Layer` ecosystem** for middleware — no custom middleware system. This means Axum gets timeouts, tracing, compression, CORS, rate limiting, and authorization "for free" from the Tower ecosystem, and middleware can be shared across Axum, Hyper, and Tonic applications.

## When to Use

- Building REST APIs and JSON services on Tokio.
- Web backends needing composable middleware (auth, logging, CORS, compression, rate limiting).
- Services that share middleware with gRPC (Tonic) or plain Hyper applications.
- WebSocket endpoints.
- Type-safe state sharing with compile-time extractor guarantees.

**When NOT to use:** you need a batteries-included framework (templating, ORM, asset bundling). Axum is intentionally minimal — pair it with libraries of your choice.

## Basic Usage

```rust
use axum::{routing::get, Router};

#[tokio::main]
async fn main() {
    let app = Router::new().route("/", get(|| async { "Hello, World!" }));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// Cargo.toml
// axum = "0.8"
// tokio = { version = "1", features = ["full"] }
// tower = "0.4"
```

## Key APIs

### Router

```rust
let app = Router::new()
    .route("/", get(root))
    .route("/users", get(list_users).post(create_user))
    .route("/users/{id}", get(get_user).delete(delete_user))
    // Nest another router under a path prefix
    .nest("/api", api_router)
    // Apply middleware to all routes (bottom-to-top: last .layer() wraps outermost)
    .layer(TraceLayer::new_for_http())
    // Apply middleware only to routes defined above
    .route_layer(middleware::from_fn(auth))
    .fallback(|| async { (StatusCode::NOT_FOUND, "Not Found") });

// Router<S>: when S != (), state is missing. .with_state(s) → Router<()>, ready for serve()
axum::serve(listener, app).await;
```

### Extractors (FromRequest)

Extractors declaratively parse request parts — compose them as handler arguments:

```rust
use axum::extract::{Path, Query, Json, State, Form};

// Path: /users/42/teams/7
async fn path(Path((user_id, team_id)): Path<(u32, u32)>) {}

// Query: /search?q=foo&page=2
async fn query(Query(params): Query<HashMap<String, String>>) {}

// JSON body (consumes body; must come before other body extractors)
async fn json(Json(payload): Json<CreateUser>) {}

// Multiple extractors compose left-to-right (body-consuming extractors must be last among body extractors)
async fn complex(Path(id): Path<u32>, Query(q): Query<Params>, Json(body): Json<Payload>) {}
```

### Responses (IntoResponse)

Anything implementing `IntoResponse` can be returned:

```rust
// &str → 200 OK, text/plain
async fn plain() -> &'static str { "ok" }

// Json<T> → application/json
async fn json() -> Json<Value> { Json(json!({"data": 42})) }

// (StatusCode, T) → custom status
async fn created() -> (StatusCode, Json<User>) { (StatusCode::CREATED, Json(user)) }

// Result<T, E> where both are IntoResponse
async fn fallible() -> Result<Json<User>, AppError> { Ok(Json(user)) }
```

### Sharing State

**State extractor (recommended — type-safe, compile-time checked):**

```rust
use axum::extract::State;
use std::sync::Arc;

#[derive(Clone)]
struct AppState { db: sqlx::PgPool }

let app = Router::new()
    .route("/", get(handler))
    .with_state(Arc::new(AppState { db }));

async fn handler(State(state): State<Arc<AppState>>) {
    // state.db.query(...)
}
```

State is cloned per request — always wrap in `Arc`. For substates, implement `FromRef`:

```rust
use axum::extract::FromRef;
impl FromRef<AppState> for ApiState {
    fn from_ref(s: &AppState) -> ApiState { s.api.clone() }
}
async fn handler(State(api): State<ApiState>) {} // only sees ApiState
```

**Extension layer (runtime-typed — avoid for new code):**

```rust
let app = Router::new().route("/", get(handler)).layer(Extension(state));
async fn handler(Extension(s): Extension<Arc<AppState>>) {}
// → 500 if Extension missing or wrong type — no compile-time safety
```

### Middleware via Tower Layers

```rust
use tower_http::{trace::TraceLayer, cors::CorsLayer, compression::CompressionLayer};
use axum::{middleware, http::StatusCode};

let app = Router::new()
    .route("/", get(handler))
    .layer(TraceLayer::new_for_http())
    .layer(CorsLayer::permissive())
    .layer(CompressionLayer::new());

// Custom middleware with middleware::from_fn
async fn auth(request: Request, next: Next) -> Result<Response, StatusCode> {
    if request.headers().contains_key("authorization") {
        Ok(next.run(request).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

let protected = Router::new()
    .route("/dashboard", get(dashboard))
    .route_layer(middleware::from_fn(auth));
```

### Error Handling

```rust
enum AppError { NotFound, Database(sqlx::Error) }

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match self {
            AppError::NotFound => (StatusCode::NOT_FOUND, "Not Found").into_response(),
            AppError::Database(e) => {
                tracing::error!("{e:?}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal Error").into_response()
            }
        }
    }
}

async fn handler() -> Result<Json<User>, AppError> {
    let user = db_query().await.map_err(AppError::Database)?;
    Ok(Json(user))
}
```

### WebSocket

```rust
use axum::extract::ws::{WebSocketUpgrade, WebSocket, Message};

async fn ws_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    while let Some(Ok(msg)) = socket.recv().await {
        if let Message::Text(t) = msg {
            if socket.send(Message::Text(format!("echo: {t}"))).await.is_err() { break; }
        }
    }
}

let app = Router::new().route("/ws", get(ws_handler));
```

### Testing

```rust
use axum::{body::Body, http::Request, Router};
use tower::ServiceExt;
use http_body_util::BodyExt;

#[tokio::test]
async fn test_hello() {
    let app = Router::new().route("/", get(|| async { "Hello, World!" }));
    let resp = app.oneshot(Request::builder().uri("/").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = resp.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&body[..], b"Hello, World!");
}
```

## Caveats

1. **State is cloned per request**: Always wrap in `Arc`. Forgetting this causes deep clones of large structs on every request.

2. **Prefer `State` over `Extension`**: `State<T>` fails at compile time if missing; `Extension<T>` gives runtime 500s.

3. **`Router<S>` type parameter**: Only `Router<()>` can be passed to `serve()`. Call `.with_state(s)` to go from `Router<S>` → `Router<()>`.

4. **Extractor ordering**: Left-to-right in handler signature. Body-consuming extractors (`Json`, `Form`, `Bytes`) consume the body — they cannot appear before another body extractor.

5. **Middleware ordering**: `.layer()` wraps outside-in — the **last** `.layer()` is the outermost layer (executed first on requests). `.route_layer()` only applies to routes defined before it on the same router.

6. **Single body consumption**: Request body can be read only once. If middleware reads it, the handler cannot. Pass data through request extensions if both need access.

7. **MSRV**: Rust 1.80+. Breaking changes: axum 0.9 is in development; 0.8.x is stable.

## Composition Hints

- **With `tower-http`**: Add `TraceLayer` (logging), `CorsLayer`, `CompressionLayer`, `TimeoutLayer`, `LimitLayer` — all work as drop-in `.layer(...)` additions.
- **With `sqlx`**: Store `PgPool` in `AppState` behind `Arc`, extract via `State<Arc<AppState>>`.
- **With `serde`**: `Json<T>` extractor/response requires `T: Deserialize` / `T: Serialize`. Works with any serde-compatible type.
- **With `thiserror`/`anyhow`**: Implement `IntoResponse` for your error enum (via `thiserror` derive) for clean error handling.
- **Nesting routers**: Use `.nest("/prefix", sub_router)` to modularize. Each sub-router can have its own state via `.with_state()`.
- **Graceful shutdown**: Combine with `tokio::signal::ctrl_c()` and `axum::serve(listener, app).with_graceful_shutdown(shutdown_signal)`.

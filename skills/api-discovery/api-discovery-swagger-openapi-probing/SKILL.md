---
name: api-discovery-swagger-openapi-probing
description: Probe and discover REST API endpoints through OpenAPI/Swagger specification files and Swagger UI configuration
tech_stack: [web]
capability: [api-design]
version: "OpenAPI 3.0.4"
collected_at: 2025-01-01
---

# OpenAPI / Swagger API Probing

> Source: https://swagger.io/docs/specification/basic-structure/, https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/, https://swagger.io/docs/specification/paths-and-operations/

## Purpose
Discover, explore, and interact with REST APIs by reading OpenAPI 3.0 specification files (swagger.json, swagger.yaml, openapi.json) and configuring Swagger UI for interactive probing. Covers the structure of OpenAPI definitions, how to locate API endpoints from spec files, and how to wire up Swagger UI to browse and test discovered APIs.

## When to Use
- Probing an unknown REST API to discover its endpoints, parameters, and data models
- Loading an OpenAPI spec file into Swagger UI for interactive exploration
- Extracting server URLs, paths, HTTP methods, and schemas from an OpenAPI definition
- Automating API endpoint enumeration from swagger.json / openapi.json files
- Differentiating between OpenAPI 2.0 (Swagger) and OpenAPI 3.0 structures when parsing specs

## Basic Usage

### Reading an OpenAPI 3.0 Spec
The top-level keys reveal the API surface immediately:
- `openapi` — spec version (3.0.0–3.0.4)
- `info` → `title`, `version`, `description` — API identity
- `servers` — base URLs (multiple for prod/staging)
- `paths` — every endpoint and its HTTP methods
- `components/schemas` — data models referenced via `$ref`

### Locating Endpoints in a Spec
```yaml
# The paths object IS the endpoint catalog
paths:
  /users:           # → GET /users, POST /users
    get: ...
    post: ...
  /users/{id}:      # → GET /users/5, PATCH /users/5, DELETE /users/5
    get: ...
    patch: ...
    delete: ...
```
Each path + HTTP method combination is a unique operation. Full URL = `<server-url>` + path.

### Path Parameter Discovery
Curly braces mark path parameters: `/users/{id}`, `/report.{format}`. Query parameters are separate — they appear under `parameters` with `in: query`, never inline in the path string.

### Quick Swagger UI Bootstrap
```javascript
SwaggerUI({
  url: "https://target-api.example.com/swagger.json",
  dom_id: "#swagger-ui",
  deepLinking: true,
  tryItOutEnabled: true,
  presets: [SwaggerUI.presets.ApisPreset],
  layout: "StandaloneLayout"
})
```
Use `spec` (JS object) instead of `url` to load a spec without hosting it. Use `urls` (array of `{url, name}`) to load multiple specs with a topbar selector.

## Key APIs (Summary)

| Method/Param | Purpose |
|---|---|
| `SwaggerUI({ url, dom_id })` | Bootstrap Swagger UI against a spec URL |
| `SwaggerUI({ spec })` | Pass a JS object directly, bypassing URL fetch |
| `SwaggerUI({ urls })` | Load multiple API specs with a dropdown selector |
| `requestInterceptor` / `responseInterceptor` | Inspect or mutate every request/response (useful for auth headers, logging) |
| `tryItOutEnabled: true` | Enable "Try it out" by default for rapid probing |
| `supportedSubmitMethods` | Restrict which HTTP methods allow Try-it-out |
| `filter: true` | Enable tag-based operation filtering for large specs |
| `docExpansion: "full"` | Expand all operations on load |
| `preauthorizeApiKey(name, token)` | Pre-fill API key / Bearer token (OAS 3.0: token only, no "Bearer" prefix) |
| `preauthorizeBasic(name, user, pass)` | Pre-fill Basic auth credentials |

## Caveats

- **Operation uniqueness**: A unique operation = path + HTTP method only. Two GETs on `/users` are invalid even with different query params. If you need different GET behaviors, use distinct paths like `/users/findByName` vs `/users/findByRole`.
- **Query strings don't go in paths**: Never write `/users?role={role}` in the `paths` section. Define `role` as a `query` parameter under the operation.
- **`info.version` ≠ `openapi` version**: `info.version` is your API version (arbitrary string like `1.0-beta`). The `openapi` key (e.g., `3.0.4`) is the spec format version.
- **OAS 2.0 vs 3.0**: OAS 2.0 uses `swagger: "2.0"`, `host`, `basePath`, `schemes`. OAS 3.0 replaces those with `openapi: 3.0.x` and `servers`. Specs fetched as `swagger.json` may be either version — check the top-level key.
- **Config precedence**: URL query params override `configUrl` document, which overrides the JS config object. When debugging, check all three.
- **`preauthorizeApiKey` for Bearer**: Do NOT include the `Bearer` prefix — just the raw token string.
- **Validation**: Swagger UI phones home to `validator.swagger.io` by default. Set `validatorUrl` to `none` or `localhost` for offline/private APIs.
- **CORS**: Swagger UI cannot set cross-domain cookies. `withCredentials: true` only sends existing browser cookies.

## Composition Hints
- Pair with **api-discovery-network-tab-capture** to verify spec endpoints against real browser traffic
- Use `requestInterceptor` to inject auth headers discovered through other probing techniques
- When a spec's `servers` list is empty or wrong, override via Swagger UI config or patch the spec JS object before passing to `SwaggerUI({ spec })`
- For APIs with multiple versions, use `urls` + `urls.primaryName` to present all versions in one UI

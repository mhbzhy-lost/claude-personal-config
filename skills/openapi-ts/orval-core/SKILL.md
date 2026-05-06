---
name: orval-core
description: Generate type-safe TypeScript HTTP clients from OpenAPI v2/v3 specs — with React Query, SWR, Axios, fetch, MSW mocks, and custom mutators
tech_stack: [openapi-ts]
language: [typescript]
capability: [api-design, http-client, ci-cd]
version: "orval unversioned"
collected_at: 2025-01-01
---

# Orval

> Source: https://orval.dev/docs/index.html.md, https://orval.dev/docs/reference/configuration, https://orval.dev/docs/reference/cli.md, https://orval.dev/docs/guides/basics.md, https://orval.dev/docs/guides/custom-axios.md

## Purpose

Orval generates **complete type-safe HTTP clients** from OpenAPI v3 or Swagger v2 specs. Unlike tools that only generate types, Orval produces ready-to-use request functions, TanStack Query/SWR hooks, and MSW mock handlers — all from a single `orval.config.(js|mjs|ts)` file.

## When to Use

- You need generated **HTTP request functions** with full typing, not just type definitions
- React/Vue/Svelte/Solid apps using **TanStack Query** (React Query, Vue Query, etc.) or **SWR**
- You want **MSW mock handlers** auto-generated alongside your API client
- Multiple API specs in one project (multi-project config with `defineConfig`)
- Custom HTTP client setup: Axios with auth interceptors, custom fetch wrappers
- CI/CD pipelines: `--watch` for dev, `--fail-on-warnings` for CI, `--clean` for fresh builds
- FastAPI / remote specs: point `input.target` at `http://localhost:8000/openapi.json`

**Not for:** pure type generation without client code — use `openapi-typescript` for that.

## Basic Usage

### Quick Start

```ts
// orval.config.ts
import { defineConfig } from 'orval';

export default defineConfig({
  petstore: {
    output: {
      mode: 'single',          // one file with everything
      target: './src/petstore.ts',
      schemas: './src/model',  // where models go
      mock: true,              // generate MSW handlers
    },
    input: {
      target: './petstore.yaml', // or URL: 'https://api.example.com/openapi.json'
    },
  },
});
```

```bash
npx orval
```

### Multiple Projects

```ts
export default defineConfig({
  petstore: {
    input: './petstore.yaml',
    output: './src/api/petstore.ts',
  },
  users: {
    input: './users.yaml',
    output: './src/api/users.ts',
  },
});
```

## Key APIs (Summary)

### Output Modes

| `mode` | Behavior |
|--------|----------|
| `single` | One file with everything (default) |
| `tags-split` | Split by OpenAPI tags — multiple files |
| `split` | Split by endpoint — many files |

When using `tags-split` or `split`, set `target` to a **directory path**, not a file.

### Client Selection

Set `output.client` or `output.httpClient`:

| Option | What it generates |
|--------|-------------------|
| `client: 'react-query'` | TanStack React Query hooks (`useQuery`, `useMutation`) |
| `client: 'vue-query'` | TanStack Vue Query hooks |
| `client: 'swr'` | SWR hooks (`useSWR`) |
| `client: 'axios'` | Axios-based request functions |
| `client: 'angular'` | Angular service |
| `httpClient: 'axios'` | Use Axios as HTTP transport (default is `fetch`) |
| `httpClient: 'fetch'` | Use Fetch API (default) |

### Custom Mutator (Custom HTTP Client)

The most powerful pattern: replace the generated HTTP client with your own.

```ts
// orval.config.ts
export default defineConfig({
  petstore: {
    output: {
      httpClient: 'axios',
      override: {
        mutator: {
          path: './api/mutator/custom-instance.ts',
          name: 'customInstance',
        },
      },
    },
    input: { target: './petstore.yaml' },
  },
});
```

**Required mutator signature and type exports:**
```ts
// custom-instance.ts
import Axios, { AxiosRequestConfig, AxiosError } from 'axios';

export const AXIOS_INSTANCE = Axios.create({ baseURL: process.env.API_URL });

export const customInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  return AXIOS_INSTANCE({ ...config, ...options }).then(({ data }) => data);
};

// MANDATORY for react-query/swr integration:
export type ErrorType<Error> = AxiosError<Error>;
export type BodyType<BodyData> = BodyData;
```

**With auth interceptors:**
```ts
AXIOS_INSTANCE.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

AXIOS_INSTANCE.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) window.location.href = '/login';
    return Promise.reject(error);
  },
);
```

### CLI Essentials

```bash
orval                                    # use orval.config.(js|mjs|ts) in root
orval --config ./api/orval.config.js     # custom config path
orval --project petstore                 # single project from multi-project config
orval --project dogstore catstore        # multiple specific projects
orval --watch                            # watch & regenerate (local files only)
orval --watch ./src                      # watch specific directory
orval --clean                            # clean ALL output targets + schema folders
orval --formatter biome                  # format with prettier/biome/oxfmt
orval --fail-on-warnings                 # CI gate: exit 1 on warnings
orval --verbose                          # shows dependency versions
orval --tsconfig ./src/tsconfig.json     # custom tsconfig path
```

### Hooks

```ts
export default defineConfig({
  petstore: {
    input: './petstore.yaml',
    output: './src/api/petstore.ts',
    hooks: {
      afterAllFilesWrite: 'prettier --write',  // auto-format after generation
    },
  },
});
```

## Caveats

- **`--clean` is destructive**: it removes ALL output target and schemas folders, not just the current project.
- **Custom mutator must export `ErrorType<Error>` and `BodyType<BodyData>`** — these are required by the generated React Query/SWR hooks. Missing them causes type errors.
- **Mutator function signature must be `(config, options?) => Promise<T>`**. The second `options` parameter is merged into the Axios config at call time.
- **`--watch` monitors local files only** — it does NOT poll remote spec URLs. For remote specs, re-run manually or use a cron/CI trigger.
- **`tags-split` / `split` modes**: ensure `target` is a directory, not a `.ts` file path. Otherwise generation fails.
- **Mutator `path` is relative to project root**, not the config file. If your `orval.config.ts` is in `/src`, `path: './api/mutator'` resolves from the project root, not `/src/api/mutator`.
- **Config files must be ESM-compatible**: use `.mjs`, `.ts`, or `.js` with `"type": "module"` in `package.json`.
- **Default HTTP client is Fetch API**. If you need Axios features (interceptors, cancel tokens), set `httpClient: 'axios'`.

## Composition Hints

- **Start with `mode: 'single'`** for small-to-medium APIs. Switch to `tags-split` when the generated file exceeds ~2000 lines.
- **Custom mutator is the foundation**: once you have a custom Axios instance with auth interceptors and error handling, all generated clients (React Query, SWR, plain axios) use it automatically.
- **Pair with MSW mocks** (`mock: true` in output) for a complete frontend development environment — generated request handlers with Faker.js data.
- **CI pipeline**: `orval --clean && orval --fail-on-warnings` ensures a clean, warning-free generation. Commit generated files to catch regressions.
- **Multi-project config for micro-frontends**: each team's API spec gets its own project in `defineConfig`. Use `--project` in CI to regenerate only what changed.
- **FastAPI workflow**: set `input.target` to `http://localhost:8000/openapi.json` during development. Before committing, swap to a local YAML snapshot for reproducible builds.
- **Post-generation formatting**: always add `hooks: { afterAllFilesWrite: 'prettier --write' }` to keep generated code consistent with your codebase style.

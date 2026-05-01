---
name: jest-vitest-api-testing
description: Test HTTP APIs with MSW for network-level mocking, supertest for server integration tests, and Vitest module mocking for lightweight interception.
tech_stack: [jest-vitest]
language: [javascript, typescript]
capability: [integration-testing, http-client]
version: "supertest@7.2.2"
collected_at: 2025-01-01
---

# API Testing (Jest/Vitest)

> Source: https://mswjs.io/docs/, https://github.com/forwardemail/supertest, https://vitest.dev/guide/mocking.html#requests

## Purpose

Test code that makes HTTP requests or serves HTTP responses. Three complementary approaches: **MSW** intercepts requests at the network level for frontend/Node.js tests without changing application code; **supertest** makes real HTTP calls against a live server for backend integration tests; **Vitest module mocking** provides lightweight, test-local HTTP client mocking.

## When to Use

| Approach | Best for |
|---|---|
| **MSW** (`setupServer`) | Frontend tests, full-stack tests, reusable mocks across dev/test/Storybook. Intercepts `fetch`, Axios, Apollo, etc. without touching application code. |
| **supertest** | Testing Express/Fastify/Koa route handlers, middleware, and full request/response cycles against a real HTTP server. |
| **Vitest `vi.mock`** | Quick, test-local mocking of a specific HTTP module. Lower confidence but simpler for isolated unit tests. |

**Rule of thumb**: Prefer MSW for frontend network mocking (highest confidence, reusable), supertest for backend HTTP integration tests, and `vi.mock` only for lightweight spot-mocking.

## Basic Usage

### MSW — Standard Node.js test setup

```js
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const handlers = [
  http.get('/api/users', () =>
    HttpResponse.json([{ id: 1, name: 'Alice' }])
  ),
  http.post('/api/users', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({ id: 2, ...body }, { status: 201 })
  }),
]

const server = setupServer(...handlers)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

### MSW — Runtime override for a single test

```js
it('handles empty list', async () => {
  server.use(http.get('/api/users', () => HttpResponse.json([])))
  // ... test code
})
```

### MSW — Error simulation

```js
it('handles 500 error', async () => {
  server.use(
    http.get('/api/users', () =>
      new HttpResponse(null, { status: 500 })
    )
  )
  // ... assert error handling
})
```

### supertest — Minimal test (async/await)

```js
import request from 'supertest'
import app from '../app'

test('GET /users returns json', async () => {
  const response = await request(app)
    .get('/users')
    .set('Accept', 'application/json')

  expect(response.status).toBe(200)
  expect(response.headers['content-type']).toMatch(/json/)
  expect(response.body).toEqual([{ id: 1, name: 'Alice' }])
})
```

### supertest — With callbacks (mocha-style)

```js
describe('POST /users', () => {
  it('creates a user', (done) => {
    request(app)
      .post('/users')
      .send({ name: 'john' })
      .expect('Content-Type', /json/)
      .expect(201)
      .end((err, res) => {
        if (err) return done(err)
        expect(res.body.name).toBe('john')
        done()
      })
  })
})
```

### Vitest — Mocking an HTTP client module

```js
import axios from 'axios'
import { fetchUsers } from './api'

vi.mock('axios')

test('fetchUsers returns data', async () => {
  axios.get.mockResolvedValue({ data: [{ id: 1, name: 'Alice' }] })

  const users = await fetchUsers()
  expect(users).toEqual([{ id: 1, name: 'Alice' }])
})
```

## Key APIs (Summary)

### MSW (`msw/node`)

| Export | Purpose |
|---|---|
| `setupServer(...handlers)` | Create a mock server for Node.js tests |
| `http.get(url, resolver)` | Handle GET requests |
| `http.post(url, resolver)` | Handle POST requests |
| `http.put/patch/delete(url, resolver)` | Handle other HTTP methods |
| `HttpResponse.json(body, init?)` | Return a JSON response |
| `HttpResponse(body, init?)` | Return any response (text, stream, null) |
| `server.listen()` | Start intercepting (in `beforeAll`) |
| `server.resetHandlers()` | Reset to initial handlers (in `afterEach`) |
| `server.close()` | Stop intercepting (in `afterAll`) |
| `server.use(...handlers)` | Add runtime overrides for current test |
| `graphql.query/mutation(name, resolver)` | Handle GraphQL operations |

Request handler `resolver` receives `{ request, params, cookies }`. Use `await request.json()` to read the request body.

Path parameters use Express-style syntax: `http.get('/api/users/:id', ({ params }) => { ... })`.

### supertest

| Method | Purpose |
|---|---|
| `request(app[, opts])` | Create test instance. `opts.http2: true` for HTTP/2 |
| `.get/post/put/patch/delete(path)` | Set HTTP method and path |
| `.set(field, value)` | Set request headers |
| `.send(data)` | Send request body (JSON or form-encoded) |
| `.auth(user, pass)` | HTTP Basic auth |
| `.field(name, value[, opts])` | Form field (for `multipart/form-data`) |
| `.attach(name, filepath)` | File attachment |
| `.expect(status[, fn])` | Assert status code |
| `.expect(status, body[, fn])` | Assert status + body |
| `.expect(body[, fn])` | Assert body (string, regex, or object) |
| `.expect(field, value[, fn])` | Assert header |
| `.expect(fn)` | Custom assertion function |
| `.end(fn)` | Execute request, call `fn(err, res)` |
| `request.agent(app)` | Persistent agent that tracks cookies |

**Custom assertion function signature**:

```js
.expect((res) => {
  if (!('next' in res.body)) throw new Error('missing next key')
})
```

### supertest — Cookie assertions

```js
import { cookies } from 'supertest'

request(app).get('/').expect(cookies.set({ name: 'session' }))
request(app).get('/').expect(cookies.not('set', { name: 'banned' }))
```

Key methods: `cookies.set()`, `cookies.not()`, `cookies.reset()`, `cookies.new()`, `cookies.renew()`, `cookies.contain()`.

## Caveats

### MSW
- **Lifecycle is critical**: Always `listen` → `resetHandlers` → `close`. Skipping `resetHandlers` leaks state between tests.
- **Network-level interception**: MSW works with any HTTP client (`fetch`, Axios, Apollo, etc.) — no per-client mocking needed.
- **`server.use()` is additive**: Runtime handlers are prepended to the handler array (higher priority). They're cleared by `server.resetHandlers()`.
- **GraphQL**: Use `graphql.query()` / `graphql.mutation()` instead of `http` handlers for GraphQL endpoints.
- **Node vs Browser**: `setupServer` for Node.js tests; `setupWorker` for browser dev/Storybook.

### supertest
- **Expectations run in definition order** — you can modify `res.body` or `res.headers` in an earlier `.expect(fn)` before later assertions.
- **Non-2XX responses become errors**: Without `.expect(status)`, any non-2XX is passed as `err` to `.end()` callback. Explicitly assert the status you expect (e.g., `.expect(302)`).
- **`.expect()` failures don't throw** — they're passed to `.end(err, res)`. You must check `err` or use async/await (which will reject).
- **Automatic port binding**: If the server isn't listening, supertest binds it to an ephemeral port automatically.
- **Reuse the request variable**: `request = request('http://localhost:5555')` then `request.get('/')` for multiple tests against the same host.

### Vitest Mocking
- **`vi.mock` is hoisted** — always executed before imports. Don't put logic in the factory that depends on imported variables.
- **Always clear/restore mocks** between tests (`clearAllMocks`, `resetAllMocks`, or per-test `vi.clearAllMocks()`).
- **Module mocking only affects external access**: If `original()` calls `mocked()` internally within the same module, it calls the real function, not the mock.
- **`vi.spyOn` doesn't work in Browser Mode** — use `vi.mock` instead.

## Composition Hints

- **MSW + supertest**: Use MSW when your test calls an external API from within your app; use supertest when testing your own server's endpoints directly.
- **MSW + React Testing Library**: MSW intercepts the HTTP layer, RTL tests the UI — they compose perfectly. Set up MSW server in `beforeAll`, render components with RTL, assert on the UI.
- **Reusable handlers**: Extract MSW handlers into a shared module for reuse across test files, Storybook, and dev environment.
- **Mocking strategy**: Mock as close to the network boundary as possible (MSW) for highest confidence. Mock at the module level (`vi.mock`) only for quick isolated unit tests where the HTTP client isn't the focus.

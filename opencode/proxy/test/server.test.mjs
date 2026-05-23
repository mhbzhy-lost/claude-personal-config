import assert from "node:assert/strict"
import { createServer } from "node:http"
import { describe, test } from "node:test"
import { gzipSync } from "node:zlib"

import { createBailianCacheProxy } from "../src/server.mjs"

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()))
  })

const close = (server) => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))

const readJson = async (request) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

describe("createBailianCacheProxy", () => {
  test("injects cache markers and forwards authorization to Bailian upstream", async () => {
    let received
    const upstream = createServer(async (request, response) => {
      received = {
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        body: await readJson(request),
      }
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ id: "chatcmpl-test", choices: [] }))
    })
    const upstreamAddress = await listen(upstream)

    const proxy = createBailianCacheProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamAddress.port}/compatible-mode/v1`,
      cacheOptions: { minCacheTokens: 16 },
      lifecycle: false,
    })
    const proxyAddress = await listen(proxy.server)

    try {
      const response = await fetch(
        `http://127.0.0.1:${proxyAddress.port}/compatible-mode/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer sk-test",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "qwen3.6-plus",
            messages: [
              { role: "system", content: "stable ".repeat(120) },
              { role: "user", content: "go" },
            ],
          }),
        },
      )

      assert.equal(response.status, 200)
      assert.equal(received.method, "POST")
      assert.equal(received.url, "/compatible-mode/v1/chat/completions")
      assert.equal(received.authorization, "Bearer sk-test")
      assert.deepEqual(received.body.messages[0].content[0].cache_control, { type: "ephemeral" })
    } finally {
      await close(proxy.server)
      await close(upstream)
    }
  })

  test("does not forward hop-by-hop or proxy headers", async () => {
    let receivedHeaders
    const upstream = createServer(async (request, response) => {
      receivedHeaders = request.headers
      await readJson(request)
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ ok: true }))
    })
    const upstreamAddress = await listen(upstream)
    const proxy = createBailianCacheProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamAddress.port}/compatible-mode/v1`,
      lifecycle: false,
    })
    const proxyAddress = await listen(proxy.server)

    try {
      const response = await fetch(
        `http://127.0.0.1:${proxyAddress.port}/compatible-mode/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer sk-test",
            connection: "keep-alive",
            "proxy-authorization": "Bearer proxy-secret",
            te: "trailers",
            trailer: "x-debug",
            "content-type": "application/json",
          },
          body: JSON.stringify({ model: "qwen3.6-plus", messages: [] }),
        },
      )

      assert.equal(response.status, 200)
      assert.equal(receivedHeaders.authorization, "Bearer sk-test")
      assert.equal(receivedHeaders["proxy-authorization"], undefined)
      assert.equal(receivedHeaders.te, undefined)
      assert.equal(receivedHeaders.trailer, undefined)
    } finally {
      await close(proxy.server)
      await close(upstream)
    }
  })

  test("rejects oversized request bodies before forwarding", async () => {
    let upstreamCalled = false
    const upstream = createServer((request, response) => {
      upstreamCalled = true
      response.writeHead(200)
      response.end()
    })
    const upstreamAddress = await listen(upstream)
    const proxy = createBailianCacheProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamAddress.port}/compatible-mode/v1`,
      lifecycle: false,
      maxBodyBytes: 64,
    })
    const proxyAddress = await listen(proxy.server)

    try {
      const response = await fetch(
        `http://127.0.0.1:${proxyAddress.port}/compatible-mode/v1/chat/completions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: "qwen3.6-plus",
            messages: [{ role: "user", content: "x".repeat(200) }],
          }),
        },
      )

      assert.equal(response.status, 413)
      assert.equal(upstreamCalled, false)
    } finally {
      await close(proxy.server)
      await close(upstream)
    }
  })

  test("rejects compressed JSON requests before parsing", async () => {
    let upstreamCalled = false
    const upstream = createServer((request, response) => {
      upstreamCalled = true
      response.writeHead(200)
      response.end()
    })
    const upstreamAddress = await listen(upstream)
    const proxy = createBailianCacheProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamAddress.port}/compatible-mode/v1`,
      lifecycle: false,
    })
    const proxyAddress = await listen(proxy.server)

    try {
      const response = await fetch(
        `http://127.0.0.1:${proxyAddress.port}/compatible-mode/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-encoding": "gzip",
          },
          body: Buffer.from("not-gzip"),
        },
      )

      assert.equal(response.status, 415)
      assert.equal(upstreamCalled, false)
    } finally {
      await close(proxy.server)
      await close(upstream)
    }
  })

  test("strips transport-level response headers so client doesn't double-decode", async () => {
    // Regression for bug-bailian-proxy-content-encoding: undici fetch in the
    // proxy auto-decompresses upstream gzip; if we forward content-encoding
    // verbatim the client tries to gunzip the already-plain body and aborts.
    const payload = JSON.stringify({ ok: true, usage: { prompt_tokens: 7 } })
    const gzipped = gzipSync(Buffer.from(payload))
    const upstream = createServer(async (request, response) => {
      await readJson(request)
      response.writeHead(200, {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": String(gzipped.length),
        "connection": "close",
        "x-request-id": "trace-123",
      })
      response.end(gzipped)
    })
    const upstreamAddress = await listen(upstream)
    const proxy = createBailianCacheProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamAddress.port}/compatible-mode/v1`,
      lifecycle: false,
    })
    const proxyAddress = await listen(proxy.server)

    try {
      const response = await fetch(
        `http://127.0.0.1:${proxyAddress.port}/compatible-mode/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer sk-test",
            "content-type": "application/json",
          },
          body: JSON.stringify({ model: "qwen3.6-flash", messages: [] }),
        },
      )

      assert.equal(response.status, 200)
      assert.equal(response.headers.get("content-encoding"), null)
      assert.equal(response.headers.get("content-length"), null)
      assert.equal(response.headers.get("x-request-id"), "trace-123")
      const body = await response.json()
      assert.deepEqual(body, { ok: true, usage: { prompt_tokens: 7 } })
    } finally {
      await close(proxy.server)
      await close(upstream)
    }
  })

  test("only forwards chat completions paths to Bailian", async () => {
    let upstreamCalled = false
    const upstream = createServer((request, response) => {
      upstreamCalled = true
      response.writeHead(200)
      response.end()
    })
    const upstreamAddress = await listen(upstream)
    const proxy = createBailianCacheProxy({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamAddress.port}/compatible-mode/v1`,
      lifecycle: false,
    })
    const proxyAddress = await listen(proxy.server)

    try {
      const response = await fetch(
        `http://127.0.0.1:${proxyAddress.port}/compatible-mode/v1/models`,
        {
          method: "GET",
        },
      )

      assert.equal(response.status, 404)
      assert.equal(upstreamCalled, false)
    } finally {
      await close(proxy.server)
      await close(upstream)
    }
  })
})

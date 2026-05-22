#!/usr/bin/env node

import { createBailianCacheProxy } from "../src/server.mjs"

const envNumber = (name, fallback) => {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

const host = process.env.BAILIAN_CACHE_PROXY_HOST || "127.0.0.1"
const port = envNumber("BAILIAN_CACHE_PROXY_PORT", 48761)

const { server } = createBailianCacheProxy({
  upstreamBaseUrl: process.env.BAILIAN_UPSTREAM_BASE_URL,
  idleExitMs: envNumber("BAILIAN_CACHE_PROXY_IDLE_EXIT_MS", 60_000),
  lifecycleCheckMs: envNumber("BAILIAN_CACHE_PROXY_LIFECYCLE_CHECK_MS", 5_000),
  maxBodyBytes: envNumber("BAILIAN_CACHE_PROXY_MAX_BODY_BYTES", 10 * 1024 * 1024),
  cacheOptions: {
    minCacheTokens: envNumber("BAILIAN_CACHE_PROXY_MIN_TOKENS", 1024),
    maxLookbackContentBlocks: envNumber("BAILIAN_CACHE_PROXY_MAX_LOOKBACK_BLOCKS", 20),
  },
})

server.listen(port, host, () => {
  process.stderr.write(`bailian-cache-proxy listening on http://${host}:${port}\n`)
})

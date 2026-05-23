import { createServer } from "node:http"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

import { planBailianCacheMarkers } from "./cache-planner.mjs"
import { createLifecycleTracker } from "./lifecycle.mjs"
import { ensureStreamUsageOption, extractUsage } from "./usage-extractor.mjs"
import { buildUsageRecord, createUsageRecorder } from "./usage-recorder.mjs"

const DEFAULT_UPSTREAM_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
const DEFAULT_IDLE_EXIT_MS = 60_000
const DEFAULT_LIFECYCLE_CHECK_MS = 5_000
const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024
// Cap how many response bytes we retain for usage extraction. SSE usage frames
// land in the tail; capping bounds memory regardless of conversation length.
const DEFAULT_USAGE_SNIFF_BYTES = 64 * 1024
const CONTROL_PREFIX = "/__bailian_cache_proxy"
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

// undici fetch transparently decompresses upstream gzip/br/deflate bodies, so
// any content-encoding/content-length we copy verbatim would mismatch the
// already-decoded bytes we pipe back. Strip transport-level headers and let
// Node http re-frame the response (chunked, no encoding).
const RESPONSE_STRIP_HEADERS = new Set([
  ...HOP_BY_HOP_HEADERS,
  "content-encoding",
  "content-length",
])

const readBody = async (request, maxBodyBytes = DEFAULT_MAX_BODY_BYTES) => {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > maxBodyBytes) {
      const err = new Error(`request body exceeds ${maxBodyBytes} bytes`)
      err.statusCode = 413
      throw err
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const writeJson = (response, statusCode, body) => {
  response.writeHead(statusCode, { "content-type": "application/json" })
  response.end(JSON.stringify(body))
}

const responseHeadersToObject = (headers) => {
  const result = {}
  for (const [key, value] of headers.entries()) {
    if (RESPONSE_STRIP_HEADERS.has(key.toLowerCase())) continue
    result[key] = value
  }
  return result
}

const buildUpstreamUrl = (requestUrl, upstreamBaseUrl) => {
  const incoming = new URL(requestUrl, "http://127.0.0.1")
  const upstreamBase = new URL(upstreamBaseUrl)
  const upstreamPath = upstreamBase.pathname.replace(/\/$/, "")
  let requestPath = incoming.pathname

  if (requestPath.startsWith(upstreamPath)) {
    requestPath = requestPath.slice(upstreamPath.length)
  }
  if (!requestPath.startsWith("/")) requestPath = `/${requestPath}`

  return new URL(`${upstreamPath}${requestPath}${incoming.search}`, upstreamBase.origin)
}

const isJsonContent = (request) => {
  const contentType = request.headers["content-type"] || ""
  return contentType.toLowerCase().includes("application/json")
}

const shouldPlanCache = (request) =>
  request.method === "POST" &&
  isJsonContent(request) &&
  new URL(request.url, "http://127.0.0.1").pathname.endsWith("/chat/completions")

const isAllowedUpstreamPath = (request) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname
  return pathname.endsWith("/chat/completions")
}

const hasUnsupportedContentEncoding = (request) => {
  const encoding = request.headers["content-encoding"]
  return Boolean(encoding && String(encoding).toLowerCase() !== "identity")
}

const forwardHeaders = (request, bodyLength, apiKey) => {
  const headers = {}
  for (const [key, value] of Object.entries(request.headers)) {
    const lowerKey = key.toLowerCase()
    if (lowerKey === "host" || lowerKey === "content-length") continue
    if (lowerKey === "content-encoding") continue
    if (HOP_BY_HOP_HEADERS.has(lowerKey)) continue
    headers[key] = value
  }
  headers["content-length"] = String(bodyLength)
  if (!headers.authorization && apiKey) {
    headers.authorization = `Bearer ${apiKey}`
  }
  return headers
}

const handleHeartbeat = async (request, response, tracker) => {
  if (request.method !== "POST") {
    writeJson(response, 405, { error: "method_not_allowed" })
    return
  }

  try {
    const body = JSON.parse((await readBody(request)).toString("utf8"))
    tracker.register(body.pid)
    writeJson(response, 200, { ok: true, activePids: tracker.activePids() })
  } catch (err) {
    writeJson(response, 400, { error: "invalid_heartbeat", message: String(err.message || err) })
  }
}

const writeProxyError = (response, statusCode, body) => {
  if (response.headersSent || response.destroyed) {
    response.destroy()
    return
  }
  writeJson(response, statusCode, body)
}

export const createBailianCacheProxy = ({
  upstreamBaseUrl = DEFAULT_UPSTREAM_BASE_URL,
  apiKey = process.env.DASHSCOPE_API_KEY || process.env.BAILIAN_API_KEY || "",
  cacheOptions = {},
  lifecycle = true,
  idleExitMs = DEFAULT_IDLE_EXIT_MS,
  lifecycleCheckMs = DEFAULT_LIFECYCLE_CHECK_MS,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  onIdleExit = () => process.exit(0),
  logger = console,
  usageRecorder = createUsageRecorder({ logger }),
  usageSniffBytes = DEFAULT_USAGE_SNIFF_BYTES,
  now = () => Date.now(),
} = {}) => {
  const tracker = createLifecycleTracker()
  let lastActiveAt = Date.now()
  let lifecycleTimer

  const server = createServer(async (request, response) => {
    const requestPath = new URL(request.url, "http://127.0.0.1").pathname

    if (requestPath === `${CONTROL_PREFIX}/health`) {
      writeJson(response, 200, { ok: true, activePids: tracker.activePids() })
      return
    }

    if (requestPath === `${CONTROL_PREFIX}/heartbeat`) {
      await handleHeartbeat(request, response, tracker)
      lastActiveAt = Date.now()
      return
    }

    const requestStart = now()
    let parsedRequestModel = null
    let isStream = false

    try {
      if (!isAllowedUpstreamPath(request)) {
        writeJson(response, 404, { error: "not_found" })
        return
      }
      if (hasUnsupportedContentEncoding(request)) {
        writeJson(response, 415, { error: "unsupported_content_encoding" })
        return
      }

      let bodyBuffer = await readBody(request, maxBodyBytes)
      if (shouldPlanCache(request)) {
        const body = JSON.parse(bodyBuffer.toString("utf8"))
        let planned = planBailianCacheMarkers(body, cacheOptions)
        // Inject stream_options.include_usage so streaming responses still
        // expose token usage in their trailing SSE frame. Without this, every
        // OpenCode AI-SDK call (which defaults to stream=true) would log no
        // usage and the cache hit-rate dataset would be empty.
        planned = ensureStreamUsageOption(planned)
        parsedRequestModel = planned?.model ?? null
        isStream = planned?.stream === true
        bodyBuffer = Buffer.from(JSON.stringify(planned))
      }

      const upstreamResponse = await fetch(buildUpstreamUrl(request.url, upstreamBaseUrl), {
        method: request.method,
        headers: forwardHeaders(request, bodyBuffer.length, apiKey),
        body: request.method === "GET" || request.method === "HEAD" ? undefined : bodyBuffer,
      })

      response.writeHead(upstreamResponse.status, responseHeadersToObject(upstreamResponse.headers))

      if (!upstreamResponse.body) {
        response.end()
        usageRecorder.fireAndForget(
          buildUsageRecord({
            ts: new Date(requestStart).toISOString(),
            model: parsedRequestModel,
            status: upstreamResponse.status,
            duration_ms: now() - requestStart,
            usage: null,
            request_id: null,
            is_stream: isStream,
            stream_usage_seen: false,
          }),
        )
        return
      }

      // Sniff up to the last `usageSniffBytes` bytes of the response so we can
      // extract usage without holding the full streamed body in memory.
      let sniffBuf = Buffer.alloc(0)
      const collect = async function* (source) {
        for await (const chunk of source) {
          if (sniffBuf.length < usageSniffBytes) {
            sniffBuf = Buffer.concat([sniffBuf, chunk])
            if (sniffBuf.length > usageSniffBytes) {
              sniffBuf = sniffBuf.subarray(sniffBuf.length - usageSniffBytes)
            }
          } else {
            // Already at cap; slide window so we keep the tail (usage frame).
            sniffBuf = Buffer.concat([sniffBuf, chunk]).subarray(
              Math.max(0, sniffBuf.length + chunk.length - usageSniffBytes),
            )
          }
          yield chunk
        }
      }

      try {
        await pipeline(Readable.fromWeb(upstreamResponse.body), collect, response)
      } finally {
        const extracted = extractUsage({ buffer: sniffBuf, isStream })
        usageRecorder.fireAndForget(
          buildUsageRecord({
            ts: new Date(requestStart).toISOString(),
            model: parsedRequestModel,
            status: upstreamResponse.status,
            duration_ms: now() - requestStart,
            usage: extracted.usage,
            request_id: extracted.request_id,
            is_stream: isStream,
            stream_usage_seen: extracted.stream_usage_seen,
          }),
        )
      }
    } catch (err) {
      if (err.statusCode === 413) {
        writeProxyError(response, 413, { error: "payload_too_large", message: err.message })
        return
      }
      logger.error?.(`bailian-cache-proxy: ${err.stack || err}`)
      writeProxyError(response, 502, { error: "bailian_proxy_failed", message: String(err.message || err) })
    }
  })

  if (lifecycle) {
    lifecycleTimer = setInterval(() => {
      if (tracker.hasActiveParents()) {
        lastActiveAt = Date.now()
        return
      }
      if (Date.now() - lastActiveAt >= idleExitMs) {
        server.close(() => onIdleExit())
      }
    }, lifecycleCheckMs)
    lifecycleTimer.unref?.()
  }

  server.on("close", () => {
    if (lifecycleTimer) clearInterval(lifecycleTimer)
  })

  return { server, tracker }
}

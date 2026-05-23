import { mkdir, appendFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const DEFAULT_DIR_NAME = "bailian-cache-proxy"
const DEFAULT_FILE_NAME = "usage.jsonl"

export const defaultUsageLogPath = () => {
  if (process.env.BAILIAN_CACHE_PROXY_USAGE_LOG) {
    return process.env.BAILIAN_CACHE_PROXY_USAGE_LOG
  }
  const cacheRoot =
    process.env.XDG_CACHE_HOME ||
    (process.platform === "darwin" ? join(homedir(), ".cache") : join(homedir(), ".cache"))
  return join(cacheRoot, DEFAULT_DIR_NAME, DEFAULT_FILE_NAME)
}

const ensureDirOnce = (() => {
  const created = new Set()
  return async (dir) => {
    if (created.has(dir)) return
    await mkdir(dir, { recursive: true })
    created.add(dir)
  }
})()

export const computeCacheHitRatio = (record) => {
  const prompt = Number(record?.prompt_tokens || 0)
  const cached = Number(record?.cached_tokens || 0)
  if (prompt <= 0) return 0
  return Math.round((cached / prompt) * 10000) / 10000
}

export const buildUsageRecord = ({
  ts,
  model,
  status,
  duration_ms,
  usage,
  request_id,
  is_stream,
  stream_usage_seen,
  proxy_pid = process.pid,
  opencode_pid = null,
}) => {
  const details = usage?.prompt_tokens_details || usage?.input_tokens_details || {}
  const prompt_tokens = usage?.prompt_tokens ?? usage?.input_tokens ?? null
  const completion_tokens = usage?.completion_tokens ?? usage?.output_tokens ?? null
  const cached_tokens = details.cached_tokens ?? null
  const cache_creation_input_tokens = details.cache_creation_input_tokens ?? null

  const record = {
    ts,
    proxy_pid,
    opencode_pid,
    model: model ?? null,
    status,
    duration_ms,
    is_stream: Boolean(is_stream),
    stream_usage_seen: is_stream ? Boolean(stream_usage_seen) : null,
    prompt_tokens,
    completion_tokens,
    cached_tokens,
    cache_creation_input_tokens,
    request_id: request_id ?? null,
  }
  record.cache_hit_ratio = computeCacheHitRatio(record)
  return record
}

export const createUsageRecorder = ({
  filePath = defaultUsageLogPath(),
  appendImpl = appendFile,
  mkdirImpl = mkdir,
  logger = console,
} = {}) => {
  let dirEnsured = false

  const ensureDir = async () => {
    if (dirEnsured) return
    await mkdirImpl(dirname(filePath), { recursive: true })
    dirEnsured = true
  }

  const record = async (entry) => {
    try {
      await ensureDir()
      await appendImpl(filePath, `${JSON.stringify(entry)}\n`, { encoding: "utf8" })
    } catch (err) {
      logger.warn?.(`bailian-cache-proxy: usage record failed: ${err.message || err}`)
    }
  }

  // Fire-and-forget wrapper so the proxy hot path never awaits us.
  const fireAndForget = (entry) => {
    void record(entry)
  }

  return { record, fireAndForget, filePath }
}

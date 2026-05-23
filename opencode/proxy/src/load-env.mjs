/**
 * Tiny .env loader: reads KEY=VAL lines into process.env without overwriting
 * existing values. Quoted values (single/double) are unwrapped. Lines starting
 * with `#` and blank lines are skipped.
 *
 * Used by:
 *   - bin/bailian-cache-proxy.mjs   so the proxy is self-sufficient when
 *                                   spawned by the OpenCode plugin (the
 *                                   OpenCode process env may not carry
 *                                   DASHSCOPE_API_KEY / DASHSCOPE_BASE_URL).
 *   - scripts/e2e-bailian-cache.mjs so manual e2e runs pick up the same .env.
 */

import { existsSync, readFileSync } from "node:fs"

export const loadEnvFile = (envPath, env = process.env) => {
  if (!envPath || !existsSync(envPath)) {
    return { loaded: false, vars: [] }
  }
  const raw = readFileSync(envPath, "utf8")
  const vars = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, valueRaw] = match
    let value = valueRaw.trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (env[key] === undefined) {
      env[key] = value
      vars.push(key)
    }
  }
  return { loaded: true, vars }
}

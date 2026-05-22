const DEFAULT_MIN_CACHE_TOKENS = 1024
const DEFAULT_MAX_MARKERS = 4
const DEFAULT_MAX_LOOKBACK_CONTENT_BLOCKS = 20
const CACHEABLE_ROLES = new Set(["system", "developer", "user", "assistant", "tool"])
const TEXT_LIKE_PART_TYPES = new Set(["text", "input_text"])

const marker = Object.freeze({ type: "ephemeral" })

const cloneJson = (value) => {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

const estimateTokens = (value) => {
  if (typeof value === "string") return Math.ceil(value.length / 4)
  if (value && typeof value === "object") {
    if (typeof value.text === "string") return estimateTokens(value.text)
    if (typeof value.content === "string") return estimateTokens(value.content)
    return Math.ceil(JSON.stringify(value).length / 4)
  }
  return 0
}

const normalizeContentParts = (content) => {
  if (typeof content === "string") {
    return [{ type: "text", text: content }]
  }
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return { type: "text", text: part }
      if (part && typeof part === "object") {
        const cloned = { ...part }
        delete cloned.cache_control
        return cloned
      }
      return part
    })
  }
  if (content && typeof content === "object") {
    const cloned = { ...content }
    delete cloned.cache_control
    return [cloned]
  }
  return []
}

const canMarkPart = (part) => {
  if (!part || typeof part !== "object") return false
  if (!("type" in part)) return true
  return TEXT_LIKE_PART_TYPES.has(part.type) || "text" in part
}

const annotateMarker = (message, partIndex) => {
  message.content[partIndex] = {
    ...message.content[partIndex],
    cache_control: { ...marker },
  }
}

const uniqueSorted = (values) => [...new Set(values)].sort((a, b) => a - b)

const selectMarkerContentIndexes = (blocks, options) => {
  const {
    maxMarkers = DEFAULT_MAX_MARKERS,
    minCacheTokens = DEFAULT_MIN_CACHE_TOKENS,
    maxLookbackContentBlocks = DEFAULT_MAX_LOOKBACK_CONTENT_BLOCKS,
  } = options

  const eligible = blocks.filter((block) => block.canMark && block.prefixTokens >= minCacheTokens)
  if (eligible.length === 0 || maxMarkers <= 0) return []

  const firstStable = eligible.find((block) => block.role === "system" || block.role === "developer")
  const selected = []
  if (firstStable) selected.push(firstStable.contentIndex)

  let cursor = eligible.at(-1)
  while (cursor && selected.length < maxMarkers) {
    selected.push(cursor.contentIndex)
    const targetIndex = cursor.contentIndex - maxLookbackContentBlocks
    cursor = eligible.findLast((block) => block.contentIndex <= targetIndex)
  }

  return uniqueSorted(selected).slice(-maxMarkers)
}

export const countCacheMarkers = (body) => {
  if (!body || !Array.isArray(body.messages)) return 0
  let count = 0
  for (const message of body.messages) {
    const parts = Array.isArray(message?.content) ? message.content : []
    for (const part of parts) {
      if (part && typeof part === "object" && part.cache_control) count += 1
    }
  }
  return count
}

export const planBailianCacheMarkers = (body, options = {}) => {
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) return body

  const planned = cloneJson(body)
  const blocks = []
  let prefixTokens = 0

  planned.messages = planned.messages.map((message, messageIndex) => {
    if (!message || typeof message !== "object") return message

    const clonedMessage = { ...message }
    delete clonedMessage.cache_control
    clonedMessage.content = normalizeContentParts(clonedMessage.content)

    const role = String(clonedMessage.role || "")
    clonedMessage.content.forEach((part, partIndex) => {
      prefixTokens += estimateTokens(part)
      blocks.push({
        role,
        messageIndex,
        partIndex,
        prefixTokens,
        contentIndex: blocks.length,
        canMark: CACHEABLE_ROLES.has(role) && canMarkPart(part),
      })
    })

    return clonedMessage
  })

  const selectedIndexes = new Set(selectMarkerContentIndexes(blocks, options))
  for (const block of blocks) {
    if (selectedIndexes.has(block.contentIndex)) {
      annotateMarker(planned.messages[block.messageIndex], block.partIndex)
    }
  }

  return planned
}

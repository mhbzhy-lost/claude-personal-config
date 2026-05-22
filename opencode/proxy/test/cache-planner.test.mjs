import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  countCacheMarkers,
  planBailianCacheMarkers,
} from "../src/cache-planner.mjs"

const repeatedText = (word, count) => Array.from({ length: count }, () => word).join(" ")

describe("planBailianCacheMarkers", () => {
  test("converts a long system string into a cacheable content block", () => {
    const body = {
      model: "qwen3.6-plus",
      messages: [
        { role: "system", content: repeatedText("stable-system", 140) },
        { role: "user", content: "What changed?" },
      ],
    }

    const planned = planBailianCacheMarkers(body, { minCacheTokens: 32 })

    assert.equal(countCacheMarkers(planned), 2)
    assert.deepEqual(planned.messages[0].content[0].cache_control, { type: "ephemeral" })
    assert.equal(planned.messages[0].content[0].text, body.messages[0].content)
    assert.deepEqual(planned.messages[1].content[0].cache_control, { type: "ephemeral" })
  })

  test("strips existing markers and never emits more than four markers", () => {
    const messages = [
      {
        role: "system",
        content: [
          {
            type: "text",
            text: repeatedText("stable", 120),
            cache_control: { type: "ephemeral" },
          },
        ],
      },
    ]

    for (let index = 0; index < 12; index += 1) {
      messages.push({
        role: index % 2 === 0 ? "user" : "assistant",
        content: [
          {
            type: "text",
            text: repeatedText(`turn-${index}`, 20),
            cache_control: { type: "ephemeral" },
          },
        ],
      })
    }

    const planned = planBailianCacheMarkers(
      { model: "qwen3.6-plus", messages },
      { minCacheTokens: 16, maxLookbackContentBlocks: 3 },
    )

    assert.equal(countCacheMarkers(planned), 4)
  })

  test("keeps a rolling marker near the tail for long conversations", () => {
    const messages = [
      { role: "system", content: repeatedText("stable-system", 120) },
    ]

    for (let index = 0; index < 36; index += 1) {
      messages.push({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `turn ${index} ${repeatedText("context", 12)}`,
      })
    }

    const planned = planBailianCacheMarkers(
      { model: "qwen3.6-plus", messages },
      { minCacheTokens: 16, maxLookbackContentBlocks: 20 },
    )

    const lastMessage = planned.messages.at(-1)
    assert.deepEqual(lastMessage.content[0].cache_control, { type: "ephemeral" })
  })

  test("leaves non-chat bodies unchanged", () => {
    const body = { model: "qwen3.6-plus", input: "hello" }

    assert.deepEqual(planBailianCacheMarkers(body), body)
  })
})

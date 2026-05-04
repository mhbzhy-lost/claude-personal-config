---
name: anthropic-sdk-typescript-core
description: TypeScript/JavaScript client for the Anthropic Claude API — promise-based message creation for Node.js backends
tech_stack: [anthropic-sdk]
language: [typescript, javascript]
capability: [llm-client]
version: "@anthropic-ai/sdk (bedrock-sdk: v0.29.1)"
collected_at: 2026-04-30
---

# Anthropic TypeScript SDK

> Source: https://github.com/anthropics/anthropic-sdk-typescript, https://npmjs.org/package/@anthropic-ai/sdk, https://platform.claude.com/docs/en/api/sdks/typescript

## Purpose
The official TypeScript/JavaScript SDK for Anthropic's Claude API. Provides a promise-based `Anthropic` client for creating LLM completions from server-side Node.js applications. All API methods return Promises and must be awaited.

## When to Use
- Node.js / TypeScript backends that need to call Claude models (Opus, Sonnet, Haiku)
- Server-side only — not suitable for browser environments
- Both ESM (`import`) and CommonJS (`require`) consumption supported
- Node.js 18+ required

## Basic Usage

### Install
```sh
npm install @anthropic-ai/sdk
```

### Send a Message
```js
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // defaults to ANTHROPIC_API_KEY env var

const message = await client.messages.create({
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello, Claude' }],
  model: 'claude-sonnet-4-5-20250929',
});

console.log(message.content);
```

## Key APIs (Summary)
- **`new Anthropic({ apiKey? })`** — client constructor; reads `ANTHROPIC_API_KEY` env var by default
- **`client.messages.create(params)`** — send a message and await the full response
- **`client.messages.stream(params)`** — streaming support (returns an async iterable)
- Key parameters: `model` (exact string ID), `max_tokens` (integer), `messages` (array of `{role, content}`)
- Response: `message.content` contains the model's reply text

## Caveats
- **Server-side only** — the SDK is not designed for browser use (API key exposure risk)
- **Node.js 18+** required
- **Scoped package**: install as `@anthropic-ai/sdk`, not `anthropic`
- **All methods are async** — forget `await` and you'll get a pending Promise, not the result
- **Model IDs are exact strings** (e.g., `'claude-sonnet-4-5-20250929'`) — no shorthand aliases
- **API key**: constructor option `apiKey` (camelCase) overrides the `ANTHROPIC_API_KEY` env var

## Composition Hints
- For tool use / function calling, see the companion `helpers.md` and `api.md` in the SDK repo (monorepo with `packages/` directory)
- Combine with `p-retry` or similar for retry logic on rate limits
- Works naturally with Next.js API routes, Express handlers, or any Node.js HTTP framework
- The `MIGRATION.md` file in the repo documents breaking changes between major versions

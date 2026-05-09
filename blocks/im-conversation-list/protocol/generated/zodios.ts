import { makeApi, Zodios, type ZodiosOptions } from "@zodios/core";
import { z } from "zod";

const Ulid = z.string();
const User = z
  .object({
    id: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    name: z.string().max(200),
    avatar_url: z.string().url().nullish(),
    online_status: z.enum(["online", "offline", "away"]).nullish(),
  })
  .strict();
const ContentText = z
  .object({ kind: z.string(), text: z.string().max(10000) })
  .strict();
const ContentImage = z
  .object({
    kind: z.string(),
    url: z.string().url(),
    width: z.number().int().gte(1).nullish(),
    height: z.number().int().gte(1).nullish(),
    alt: z.string().max(500).nullish(),
  })
  .strict();
const ContentFile = z
  .object({
    kind: z.string(),
    url: z.string().url(),
    name: z.string().max(500),
    size: z.number().int().gte(0),
    mime: z.string().max(200),
  })
  .strict();
const ContentSystem = z
  .object({
    kind: z.string(),
    code: z.string().max(100),
    params: z.object({}).partial().strict().passthrough().optional(),
  })
  .strict();
const ContentRecall = z
  .object({
    kind: z.string(),
    recall_of: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
  })
  .strict();
const Content = z.discriminatedUnion("kind", [
  ContentText,
  ContentImage,
  ContentFile,
  ContentSystem,
  ContentRecall,
]);
const Message = z
  .object({
    id: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    conversation_id: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    sender: User,
    content: Content,
    client_id: z.string().nullish(),
    status: z.enum(["sending", "sent", "delivered", "read", "failed"]),
    sent_at: z.string().datetime({ offset: true }),
    edited_at: z.string().datetime({ offset: true }).nullish(),
    deleted_at: z.string().datetime({ offset: true }).nullish(),
  })
  .strict();
const Conversation = z
  .object({
    id: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    type: z.enum(["direct", "group"]),
    title: z.string().max(200).nullish(),
    avatar_url: z.string().url().nullish(),
    participants: z.array(User).max(5),
    participant_count: z.number().int().gte(1),
    last_message: z.union([Message, z.null()]).optional(),
    unread_count: z.number().int().gte(0),
    is_pinned: z.boolean(),
    is_muted: z.boolean(),
    pinned_at: z.string().datetime({ offset: true }).nullish(),
    last_activity_at: z.string().datetime({ offset: true }),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
const ConversationPage = z
  .object({
    items: z.array(Conversation),
    next_cursor: z.string().nullish(),
    has_more: z.boolean(),
  })
  .strict();
const patchConversation_Body = z
  .object({ is_pinned: z.boolean(), is_muted: z.boolean() })
  .partial()
  .strict();
const MessagePage = z
  .object({
    items: z.array(Message),
    next_cursor: z.string().nullish(),
    has_more: z.boolean(),
  })
  .strict();
const sendMessage_Body = z
  .object({ content: Content, client_id: z.string().optional() })
  .strict();

export const schemas = {
  Ulid,
  User,
  ContentText,
  ContentImage,
  ContentFile,
  ContentSystem,
  ContentRecall,
  Content,
  Message,
  Conversation,
  ConversationPage,
  patchConversation_Body,
  MessagePage,
  sendMessage_Body,
};

const endpoints = makeApi([
  {
    method: "get",
    path: "/conversations",
    alias: "listConversations",
    description: `Returns the current user&#x27;s conversation list. Server-side sort:
pinned first (by pinned_at desc), then unpinned (by last_activity_at desc).
Clients must not re-sort.
`,
    requestFormat: "json",
    parameters: [
      {
        name: "cursor",
        type: "Query",
        schema: z.string().optional(),
      },
      {
        name: "limit",
        type: "Query",
        schema: z.number().int().gte(1).lte(100).optional().default(20),
      },
      {
        name: "filter",
        type: "Query",
        schema: z
          .enum(["all", "unread", "pinned", "muted", "archived"])
          .optional()
          .default("all"),
      },
    ],
    response: ConversationPage,
    errors: [
      {
        status: 401,
        description: `Unauthorized`,
        schema: z.void(),
      },
      {
        status: 429,
        description: `Too many requests`,
        schema: z.void(),
      },
    ],
  },
  {
    method: "get",
    path: "/conversations/:id",
    alias: "getConversation",
    description: `Fetch a single conversation by id, with the current user&#x27;s per-user state joined.`,
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      },
    ],
    response: Conversation,
    errors: [
      {
        status: 401,
        description: `Unauthorized`,
        schema: z.void(),
      },
      {
        status: 404,
        description: `Not found`,
        schema: z.void(),
      },
    ],
  },
  {
    method: "patch",
    path: "/conversations/:id",
    alias: "patchConversation",
    description: `Mutates &#x60;is_pinned&#x60; / &#x60;is_muted&#x60; only. Other fields are read-only via
this endpoint. Multi-device clients should observe the matching
&#x60;conversation.updated&#x60; event and reconcile.
`,
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: patchConversation_Body,
      },
      {
        name: "id",
        type: "Path",
        schema: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      },
    ],
    response: Conversation,
    errors: [
      {
        status: 401,
        description: `Unauthorized`,
        schema: z.void(),
      },
      {
        status: 404,
        description: `Not found`,
        schema: z.void(),
      },
      {
        status: 422,
        description: `Validation failed`,
        schema: z.void(),
      },
    ],
  },
  {
    method: "delete",
    path: "/conversations/:id",
    alias: "deleteConversation",
    description: `Does not delete underlying conversation or messages — only hides it
for the current user. Other participants are unaffected.
`,
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      },
    ],
    response: z.void(),
    errors: [
      {
        status: 401,
        description: `Unauthorized`,
        schema: z.void(),
      },
      {
        status: 404,
        description: `Not found`,
        schema: z.void(),
      },
    ],
  },
  {
    method: "get",
    path: "/conversations/:id/messages",
    alias: "listMessages",
    description: `Cursor pagination. Newest first.`,
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      },
      {
        name: "cursor",
        type: "Query",
        schema: z.string().optional(),
      },
      {
        name: "limit",
        type: "Query",
        schema: z.number().int().gte(1).lte(100).optional().default(20),
      },
    ],
    response: MessagePage,
    errors: [
      {
        status: 401,
        description: `Unauthorized`,
        schema: z.void(),
      },
      {
        status: 404,
        description: `Not found`,
        schema: z.void(),
      },
    ],
  },
  {
    method: "post",
    path: "/conversations/:id/messages",
    alias: "sendMessage",
    description: `Send a new message to this conversation. Honors &#x60;Idempotency-Key&#x60; for safe retry.`,
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: sendMessage_Body,
      },
      {
        name: "id",
        type: "Path",
        schema: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      },
      {
        name: "Idempotency-Key",
        type: "Header",
        schema: z.string().max(128).optional(),
      },
    ],
    response: Message,
    errors: [
      {
        status: 401,
        description: `Unauthorized`,
        schema: z.void(),
      },
      {
        status: 404,
        description: `Not found`,
        schema: z.void(),
      },
      {
        status: 409,
        description: `Conflict (e.g. idempotency mismatch)`,
        schema: z.void(),
      },
      {
        status: 422,
        description: `Validation failed`,
        schema: z.void(),
      },
    ],
  },
  {
    method: "post",
    path: "/conversations/:id/read",
    alias: "markRead",
    description: `Mark all messages in this conversation read up to the given message id, inclusive.`,
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z.object({ up_to_message_id: z.string() }).strict(),
      },
      {
        name: "id",
        type: "Path",
        schema: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      },
    ],
    response: z.void(),
    errors: [
      {
        status: 401,
        description: `Unauthorized`,
        schema: z.void(),
      },
      {
        status: 404,
        description: `Not found`,
        schema: z.void(),
      },
      {
        status: 422,
        description: `Validation failed`,
        schema: z.void(),
      },
    ],
  },
  {
    method: "get",
    path: "/conversations/search",
    alias: "searchConversations",
    description: `Full-text search across conversation title and last message preview.
Implementation may use database FTS or external index — opaque to client.
`,
    requestFormat: "json",
    parameters: [
      {
        name: "q",
        type: "Query",
        schema: z.string().min(1).max(200),
      },
      {
        name: "cursor",
        type: "Query",
        schema: z.string().optional(),
      },
      {
        name: "limit",
        type: "Query",
        schema: z.number().int().gte(1).lte(100).optional().default(20),
      },
    ],
    response: ConversationPage,
    errors: [
      {
        status: 400,
        description: `Bad request`,
        schema: z.void(),
      },
      {
        status: 401,
        description: `Unauthorized`,
        schema: z.void(),
      },
    ],
  },
  {
    method: "get",
    path: "/me",
    alias: "getMe",
    description: `Lightweight identity endpoint so clients can resolve &quot;self&quot; in WS
events without a separate auth introspection step.
`,
    requestFormat: "json",
    response: User,
    errors: [
      {
        status: 401,
        description: `Unauthorized`,
        schema: z.void(),
      },
    ],
  },
]);

export const api = new Zodios(endpoints);

export function createApiClient(baseUrl: string, options?: ZodiosOptions) {
  return new Zodios(baseUrl, endpoints, options);
}

import { makeApi, Zodios, type ZodiosOptions } from "@zodios/core";
import { z } from "zod";

const Ulid = z.string();
const User = z
  .object({
    id: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    name: z.string().max(200),
    avatar_url: z.string().url().nullish(),
  })
  .strict();
const Comment = z
  .object({
    id: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    resource_type: z.string().max(50),
    resource_id: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    parent_comment_id: z.string().nullish(),
    author: User,
    content: z.string().max(10000),
    depth: z.number().int().gte(0).lte(3),
    reply_count: z.number().int().gte(0),
    is_deleted: z.boolean(),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
const createComment_Body = z
  .object({
    resource_type: z.string().min(1).max(50),
    resource_id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    parent_comment_id: z
      .string()
      .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)
      .nullish(),
    content: z.string().min(1).max(10000),
  })
  .strict();

export const schemas = {
  Ulid,
  User,
  Comment,
  createComment_Body,
};

const endpoints = makeApi([
  {
    method: "get",
    path: "/comments",
    alias: "listComments",
    description: `Returns all non-deleted comments for &#x60;{resource_type, resource_id}&#x60;
as a flat list. Client groups by &#x60;parent_comment_id&#x60; to render tree.
Sorted oldest-first within each thread.
`,
    requestFormat: "json",
    parameters: [
      {
        name: "resource_type",
        type: "Query",
        schema: z.string().min(1).max(50),
      },
      {
        name: "resource_id",
        type: "Query",
        schema: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      },
    ],
    response: z
      .object({ items: z.array(Comment), total: z.number().int().gte(0) })
      .strict(),
  },
  {
    method: "post",
    path: "/comments",
    alias: "createComment",
    description: `Requires auth. &#x60;parent_comment_id&#x60; optional; when given, must reference
an existing comment on the same &#x60;{resource_type, resource_id}&#x60;, and
depth must not exceed 3 levels.
`,
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: createComment_Body,
      },
    ],
    response: Comment,
    errors: [
      {
        status: 401,
        description: `Unauthorized`,
        schema: z.void(),
      },
      {
        status: 404,
        description: `parent_comment not found / not on same host`,
        schema: z.void(),
      },
      {
        status: 422,
        description: `Depth exceeds 3 / validation error`,
        schema: z.void(),
      },
    ],
  },
  {
    method: "delete",
    path: "/comments/:id",
    alias: "deleteComment",
    description: `Author can delete own comment. Replies are preserved but parent shows
as &quot;[deleted]&quot;. Returns 403 if attempting to delete others&#x27;.
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
        status: 403,
        description: `Not the author`,
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
    path: "/me",
    alias: "getMe",
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

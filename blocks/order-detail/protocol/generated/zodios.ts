import { makeApi, Zodios, type ZodiosOptions } from "@zodios/core";
import { z } from "zod";

const Ulid = z.string();
const OrderStatus = z.enum([
  "pending",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);
const OrderSummary = z
  .object({
    id: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    order_number: z.string().max(50),
    status: OrderStatus,
    currency: z.string().min(3).max(3),
    total: z.number().int().gte(0),
    item_count: z.number().int().gte(1),
    cover_image: z.string().url().nullish(),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();
const OrderPage = z
  .object({
    items: z.array(OrderSummary),
    total: z.number().int().gte(0),
    page: z.number().int().gte(1),
    page_size: z.number().int().gte(1),
    has_more: z.boolean(),
  })
  .strict();
const ShippingAddress = z
  .object({
    recipient: z.string().max(100),
    phone: z.string().max(30),
    country: z.string().max(100),
    province: z.string().max(100),
    city: z.string().max(100),
    street: z.string().max(500),
    postal_code: z.string().max(30).nullish(),
  })
  .strict();
const OrderItem = z
  .object({
    line_no: z.number().int().gte(1),
    product_id: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    product_name: z.string().max(200),
    product_image: z.string().url().nullish(),
    sku: z.string().max(100).nullish(),
    quantity: z.number().int().gte(1),
    unit_price: z.number().int().gte(0),
    line_total: z.number().int().gte(0),
  })
  .strict();
const OrderStatusEvent = z
  .object({
    status: OrderStatus,
    occurred_at: z.string().datetime({ offset: true }),
    note: z.string().max(500).nullish(),
  })
  .strict();
const OrderDetail = z
  .object({
    id: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    order_number: z.string().max(50),
    status: OrderStatus,
    currency: z.string().min(3).max(3),
    subtotal: z.number().int().gte(0),
    shipping: z.number().int().gte(0),
    total: z.number().int().gte(0),
    shipping_address: ShippingAddress,
    items: z.array(OrderItem).min(1),
    status_events: z.array(OrderStatusEvent),
    paid_at: z.string().datetime({ offset: true }).nullish(),
    shipped_at: z.string().datetime({ offset: true }).nullish(),
    delivered_at: z.string().datetime({ offset: true }).nullish(),
    cancelled_at: z.string().datetime({ offset: true }).nullish(),
    cancel_reason: z.string().max(500).nullish(),
    refund_reason: z.string().max(500).nullish(),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
const User = z
  .object({
    id: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    name: z.string().max(200),
    avatar_url: z.string().url().nullish(),
  })
  .strict();

export const schemas = {
  Ulid,
  OrderStatus,
  OrderSummary,
  OrderPage,
  ShippingAddress,
  OrderItem,
  OrderStatusEvent,
  OrderDetail,
  User,
};

const endpoints = makeApi([
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
  {
    method: "get",
    path: "/orders",
    alias: "listOrders",
    description: `Returns the current user&#x27;s orders, paginated, newest first.`,
    requestFormat: "json",
    parameters: [
      {
        name: "status",
        type: "Query",
        schema: z
          .enum([
            "pending",
            "paid",
            "shipped",
            "delivered",
            "cancelled",
            "refunded",
          ])
          .optional(),
      },
      {
        name: "page",
        type: "Query",
        schema: z.number().int().gte(1).optional().default(1),
      },
      {
        name: "page_size",
        type: "Query",
        schema: z.number().int().gte(1).lte(100).optional().default(20),
      },
    ],
    response: OrderPage,
    errors: [
      {
        status: 401,
        description: `Unauthorized`,
        schema: z.void(),
      },
    ],
  },
  {
    method: "get",
    path: "/orders/:id",
    alias: "getOrder",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      },
    ],
    response: OrderDetail,
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
    path: "/orders/:id/cancel",
    alias: "cancelOrder",
    description: `Cancels an order in &#x60;pending&#x60; status. Returns 422 if the order is
past payment.
`,
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z
          .object({ reason: z.string().max(500) })
          .partial()
          .strict()
          .optional(),
      },
      {
        name: "id",
        type: "Path",
        schema: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      },
    ],
    response: OrderDetail,
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
    method: "post",
    path: "/orders/:id/refund",
    alias: "requestRefund",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z.object({ reason: z.string().min(5).max(500) }).strict(),
      },
      {
        name: "id",
        type: "Path",
        schema: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      },
    ],
    response: OrderDetail,
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
]);

export const api = new Zodios(endpoints);

export function createApiClient(baseUrl: string, options?: ZodiosOptions) {
  return new Zodios(baseUrl, endpoints, options);
}

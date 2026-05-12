import { makeApi, Zodios, type ZodiosOptions } from "@zodios/core";
import { z } from "zod";

const Ulid = z.string();
const Product = z
  .object({
    id: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    name: z.string().max(200),
    description: z.string().max(2000).nullish(),
    price: z.number().int().gte(0),
    currency: z.string().min(3).max(3),
    original_price: z.number().int().gte(0).nullish(),
    cover_image: z.string().url(),
    images: z.array(z.string().url()).max(9),
    stock: z.number().int().gte(0),
    sold_count: z.number().int().gte(0),
    rating: z.number().gte(0).lte(5).nullish(),
    rating_count: z.number().int().gte(0),
    category: z.string().max(100),
    tags: z.array(z.string().max(50)).max(10),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
const UserProductState = z
  .object({
    product_id: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    user_id: Ulid.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
    is_favorite: z.boolean(),
    cart_count: z.number().int().gte(0),
    favorited_at: z.string().datetime({ offset: true }).nullish(),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
const ProductWithState = Product.and(
  z
    .object({ user_state: z.union([UserProductState, z.null()]) })
    .partial()
    .strict()
    .passthrough()
);
const ProductPage = z
  .object({
    items: z.array(ProductWithState),
    total: z.number().int().gte(0),
    page: z.number().int().gte(1),
    page_size: z.number().int().gte(1),
    has_more: z.boolean(),
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
  Product,
  UserProductState,
  ProductWithState,
  ProductPage,
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
    path: "/products",
    alias: "listProducts",
    description: `Browse the catalog. All filters are AND-composed. &#x60;user_state&#x60; is
joined when authenticated; null for anonymous browsing.
`,
    requestFormat: "json",
    parameters: [
      {
        name: "q",
        type: "Query",
        schema: z.string().max(200).optional(),
      },
      {
        name: "category",
        type: "Query",
        schema: z.string().max(100).optional(),
      },
      {
        name: "price_min",
        type: "Query",
        schema: z.number().int().gte(0).optional(),
      },
      {
        name: "price_max",
        type: "Query",
        schema: z.number().int().gte(0).optional(),
      },
      {
        name: "in_stock_only",
        type: "Query",
        schema: z.boolean().optional().default(false),
      },
      {
        name: "sort",
        type: "Query",
        schema: z
          .enum([
            "price_asc",
            "price_desc",
            "sold_desc",
            "created_desc",
            "rating_desc",
          ])
          .optional()
          .default("created_desc"),
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
    response: ProductPage,
    errors: [
      {
        status: 400,
        description: `Bad request`,
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
    path: "/products/:id",
    alias: "getProduct",
    requestFormat: "json",
    parameters: [
      {
        name: "id",
        type: "Path",
        schema: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      },
    ],
    response: ProductWithState,
    errors: [
      {
        status: 404,
        description: `Not found`,
        schema: z.void(),
      },
    ],
  },
  {
    method: "put",
    path: "/products/:id/cart",
    alias: "setCartCount",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z.object({ count: z.number().int().gte(0) }).strict(),
      },
      {
        name: "id",
        type: "Path",
        schema: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      },
    ],
    response: UserProductState,
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
        description: `Stock insufficient`,
        schema: z.void(),
      },
    ],
  },
  {
    method: "put",
    path: "/products/:id/favorite",
    alias: "setFavorite",
    requestFormat: "json",
    parameters: [
      {
        name: "body",
        type: "Body",
        schema: z.object({ is_favorite: z.boolean() }).strict(),
      },
      {
        name: "id",
        type: "Path",
        schema: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      },
    ],
    response: UserProductState,
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
]);

export const api = new Zodios(endpoints);

export function createApiClient(baseUrl: string, options?: ZodiosOptions) {
  return new Zodios(baseUrl, endpoints, options);
}

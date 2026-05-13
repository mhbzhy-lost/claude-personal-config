import type { ReactNode } from 'react';

export type Ulid = string;

export type MediaKind = 'image' | 'video';

export interface ProductMedia {
  id: string;
  kind: MediaKind;
  url: string;
  thumb?: string;
  alt?: string;
  duration?: number;
}

export interface ProductSku {
  id: string;
  label: ReactNode;
  /** Price in major units (e.g. 199.00). Host owns the currency precision rules. */
  price: number;
  stock: number;
  meta?: Record<string, ReactNode>;
}

export interface ProductReview {
  id: string;
  rating: number; // 0–5
  author: string;
  body: ReactNode;
  /** ISO timestamp. */
  created_at: string;
}

export interface ProductDetailData {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  media: ProductMedia[];
  skus: ProductSku[];
  reviews?: ProductReview[];
  rating?: number;
  rating_count?: number;
  currency?: string;
  meta?: Record<string, ReactNode>;
}

// ---- Auth provider abstraction (do not modify; identical across blocks) ----

export interface AuthHeader {
  type: 'header';
  headerName: string;
  getValue: () => string | Promise<string>;
}

export interface AuthBearer {
  type: 'bearer';
  getToken: () => string | Promise<string>;
}

export type Auth = AuthHeader | AuthBearer;

// ---- Config ----

export interface BlockConfig {
  /** Backend base URL. Component appends `/v1`. */
  apiBaseUrl: string;
  auth?: Auth;
}

export interface ProductDetailProps {
  /** Pre-fetched data (host supplies). If both `data` and `config` provided, `data` wins. */
  data?: ProductDetailData;

  /** Live config; component fetches `GET /v1/products/:productId` when data is absent. */
  config?: BlockConfig;
  productId?: string;

  /** Selected SKU id (controlled). */
  selectedSkuId?: string;
  onSelectSku?: (sku: ProductSku) => void;

  /** Add to cart handler. Omit → no button. */
  onAddToCart?: (sku: ProductSku, qty: number) => void | Promise<void>;

  /** Buy now handler. Omit → no button. */
  onBuyNow?: (sku: ProductSku, qty: number) => void | Promise<void>;

  /** Submit new review handler. Omit → review form hidden. */
  onSubmitReview?: (review: { rating: number; body: string }) => void | Promise<void>;

  className?: string;
  height?: string | number;
}

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
  price: number;
  stock: number;
  meta?: Record<string, ReactNode>;
}

export interface ProductReview {
  id: string;
  rating: number;
  author: string;
  body: ReactNode;
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

export interface BlockConfig {
  apiBaseUrl: string;
  auth?: Auth;
}

export interface ProductDetailProps {
  data?: ProductDetailData;
  config?: BlockConfig;
  productId?: string;
  selectedSkuId?: string;
  onSelectSku?: (sku: ProductSku) => void;
  onAddToCart?: (sku: ProductSku, qty: number) => void | Promise<void>;
  onBuyNow?: (sku: ProductSku, qty: number) => void | Promise<void>;
  onSubmitReview?: (review: { rating: number; body: string }) => void | Promise<void>;
  className?: string;
  height?: string | number;
}

// Public types for @cpl/commerce-product-list-mp.
// Mirrors blocks/commerce-product-list/protocol/openapi.yaml.

export type Ulid = string;

export interface User {
  id: Ulid;
  name: string;
  avatar_url?: string | null;
}

export interface UserProductState {
  product_id: Ulid;
  user_id: Ulid;
  is_favorite: boolean;
  cart_count: number;
  favorited_at?: string | null;
  updated_at: string;
}

export interface Product {
  id: Ulid;
  name: string;
  description?: string | null;
  price: number; // in cents
  currency: string;
  original_price?: number | null;
  cover_image: string;
  images: string[];
  stock: number;
  sold_count: number;
  rating?: number | null;
  rating_count: number;
  category: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ProductWithState extends Product {
  user_state?: UserProductState | null;
}

export type SortKey =
  | 'price_asc'
  | 'price_desc'
  | 'sold_desc'
  | 'created_desc'
  | 'rating_desc';

export interface ProductFilters {
  q?: string;
  category?: string;
  price_min?: number;
  price_max?: number;
  in_stock_only?: boolean;
  sort?: SortKey;
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
  /** Backend base URL, e.g. "http://localhost:8081". Component appends `/v1`. */
  apiBaseUrl: string;
  /** Auth provider; optional — anonymous browsing supported (no user_state). */
  auth?: Auth;
  /** Page size for offset pagination. Default 20. */
  pageSize?: number;
  /** Available categories for the filter dropdown. If omitted, hides category filter. */
  categories?: { value: string; label: string }[];
  /** Locale strings (subset). Optional. */
  locale?: {
    empty?: string;
    error?: string;
    retry?: string;
    loadMore?: string;
    filterCategory?: string;
    filterPrice?: string;
    filterInStock?: string;
    sort?: string;
  };
}

export interface UseProductsResult {
  items: ProductWithState[];
  loading: boolean;
  error: Error | null;
  total: number;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  filters: ProductFilters;
  setFilters: (next: Partial<ProductFilters>) => void;
  setFavorite: (id: Ulid, value: boolean) => Promise<void>;
  setCartCount: (id: Ulid, count: number) => Promise<void>;
  me: User | null;
}

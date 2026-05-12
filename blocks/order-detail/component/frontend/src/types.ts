// Public types for @od/order-detail.

export type Ulid = string;

export interface User {
  id: Ulid;
  name: string;
  avatar_url?: string | null;
}

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface ShippingAddress {
  recipient: string;
  phone: string;
  country: string;
  province: string;
  city: string;
  street: string;
  postal_code?: string | null;
}

export interface OrderItem {
  line_no: number;
  product_id: Ulid;
  product_name: string;
  product_image?: string | null;
  sku?: string | null;
  quantity: number;
  unit_price: number; // cents
  line_total: number; // cents
}

export interface OrderStatusEvent {
  status: OrderStatus;
  occurred_at: string;
  note?: string | null;
}

export interface OrderSummary {
  id: Ulid;
  order_number: string;
  status: OrderStatus;
  currency: string;
  total: number; // cents
  item_count: number;
  cover_image?: string | null;
  created_at: string;
}

export interface OrderDetail {
  id: Ulid;
  order_number: string;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  shipping: number;
  total: number;
  shipping_address: ShippingAddress;
  items: OrderItem[];
  status_events: OrderStatusEvent[];
  paid_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  refund_reason?: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Auth (universal) ----

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
  apiBaseUrl: string;
  auth: Auth;
  pageSize?: number;
}

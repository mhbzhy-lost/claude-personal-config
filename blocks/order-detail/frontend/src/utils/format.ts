export function formatPrice(cents: number, currency: string): string {
  const value = cents / 100;
  const symbol = SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase() + ' ';
  return `${symbol}${value.toFixed(2)}`;
}

const SYMBOLS: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const STATUS_LABEL: Record<string, string> = {
  pending: '待付款',
  paid: '已付款',
  shipped: '已发货',
  delivered: '已送达',
  cancelled: '已取消',
  refunded: '已退款',
};

export const STATUS_COLOR: Record<string, string> = {
  pending: '#faad14',
  paid: '#1677ff',
  shipped: '#722ed1',
  delivered: '#52c41a',
  cancelled: '#8c8c8c',
  refunded: '#ff4d4f',
};

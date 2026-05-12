/**
 * Format price from cents to display string.
 * 9900 + "CNY" → "¥99.00"
 */
export function formatPrice(cents: number, currency: string): string {
  const value = cents / 100;
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase() + ' ';
  return `${symbol}${value.toFixed(2)}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

/**
 * Format large counters: 99722 → "9.9w" (中文), 100000 → "10w+".
 */
export function formatCount(n: number): string {
  if (n < 10000) return String(n);
  if (n < 100000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}w`;
  return `${Math.floor(n / 10000)}w+`;
}

export function formatRating(rating: number | null | undefined): string {
  if (rating == null) return '无评分';
  return rating.toFixed(1);
}

import type { MenuItem } from '../types';

/**
 * Walk the menu tree and return all ancestor keys for the given leaf key.
 * Used to auto-expand parent groups when activeKey changes.
 */
export function findAncestorKeys(items: MenuItem[], targetKey: string): string[] {
  for (const item of items) {
    if (item.key === targetKey) return [];
    if (item.children?.length) {
      const sub = findAncestorKeys(item.children, targetKey);
      if (sub !== null) return [item.key, ...sub];
    }
  }
  return null as unknown as string[]; // sentinel; outer call returns [] when not found
}

/**
 * Safer wrapper: returns the ancestor key array, or [] when not found.
 */
export function ancestorKeysOf(items: MenuItem[], targetKey: string | undefined): string[] {
  if (!targetKey) return [];
  const found = findAncestorKeys(items, targetKey);
  return Array.isArray(found) ? found : [];
}

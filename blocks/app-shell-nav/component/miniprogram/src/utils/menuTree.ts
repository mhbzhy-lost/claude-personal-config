import type { MenuItem } from '../types';

export function findAncestorKeys(items: MenuItem[], targetKey: string): string[] {
  for (const item of items) {
    if (item.key === targetKey) return [];
    if (item.children?.length) {
      const sub = findAncestorKeys(item.children, targetKey);
      if (sub !== null) return [item.key, ...sub];
    }
  }
  return null as unknown as string[];
}

export function ancestorKeysOf(items: MenuItem[], targetKey: string | undefined): string[] {
  if (!targetKey) return [];
  const found = findAncestorKeys(items, targetKey);
  return Array.isArray(found) ? found : [];
}

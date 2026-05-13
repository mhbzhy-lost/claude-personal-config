import type { TreeNode } from '../types';

/**
 * Find the ancestor chain (root → ... → target) for a target id.
 * Returns null if not found.
 */
export function findPath(nodes: TreeNode[], targetId: string): TreeNode[] | null {
  for (const n of nodes) {
    if (n.id === targetId) return [n];
    if (n.children?.length) {
      const sub = findPath(n.children, targetId);
      if (sub) return [n, ...sub];
    }
  }
  return null;
}

/**
 * Collect all node ids whose own searchText / label string contains the query
 * (case-insensitive). Returns the **set of ancestor ids** to expand (the
 * matched nodes themselves are kept by the parent UI for highlight).
 */
export function findAncestorsForMatches(
  nodes: TreeNode[],
  query: string,
): { matchedIds: Set<string>; ancestorIds: Set<string> } {
  const q = query.trim().toLowerCase();
  const matchedIds = new Set<string>();
  const ancestorIds = new Set<string>();
  if (!q) return { matchedIds, ancestorIds };

  function walk(node: TreeNode, parents: string[]): boolean {
    const text = (node.searchText ?? (typeof node.label === 'string' ? node.label : node.id)).toLowerCase();
    const selfMatch = text.includes(q);
    let childMatch = false;
    if (node.children) {
      for (const c of node.children) {
        if (walk(c, [...parents, node.id])) childMatch = true;
      }
    }
    if (selfMatch) {
      matchedIds.add(node.id);
      for (const p of parents) ancestorIds.add(p);
    }
    return selfMatch || childMatch;
  }

  for (const n of nodes) walk(n, []);
  return { matchedIds, ancestorIds };
}

/**
 * Resolve effective NodeKind (folder if has children OR explicit kind='folder').
 */
export function resolveKind(node: TreeNode): 'folder' | 'file' {
  if (node.kind) return node.kind;
  return node.children !== undefined ? 'folder' : 'file';
}

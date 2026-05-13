import type { ReactNode } from 'react';

export type NodeKind = 'folder' | 'file';

export interface TreeNode {
  /** Stable id, used for selection / expansion / React keys. */
  id: string;
  /** Display label (host can include badges, status, etc). */
  label: ReactNode;
  /** Override default icon (folder/file based on `kind`). */
  icon?: ReactNode;
  /** Nested children. `undefined` = leaf, `[]` = empty folder. */
  children?: TreeNode[];
  /** Visual + interaction kind. Default: folder if has children, file otherwise. */
  kind?: NodeKind;
  /** Disabled state — non-clickable, visually muted. */
  disabled?: boolean;
  /**
   * Optional searchable text (defaults to a string version of label).
   * Use to add aliases / pinyin etc.
   */
  searchText?: string;
}

export interface ContextMenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  /** Conditionally disable per node. */
  disabled?: (node: TreeNode) => boolean;
  /** Conditionally hide per node. */
  visible?: (node: TreeNode) => boolean;
  onClick: (node: TreeNode) => void;
}

export interface TreeExplorerProps {
  // -------- Data --------

  /** Top-level nodes. */
  data: TreeNode[];

  // -------- Selection (controlled) --------

  selectedId?: string;
  /**
   * Single-click → select. Receives the selected node + its ancestor chain
   * (root → leaf), so host can drive breadcrumbs without re-walking.
   */
  onSelect: (node: TreeNode, path: TreeNode[]) => void;

  // -------- Open (double click on file, or expand toggle on folder) --------

  /**
   * Double-click triggers `onOpen` (typical "open file in editor" UX).
   * If omitted, double-click is a no-op (single-click select only).
   */
  onOpen?: (node: TreeNode, path: TreeNode[]) => void;

  // -------- Expansion --------

  /** Controlled expanded set. Omit + supply `persistKey` for localStorage. */
  expandedKeys?: string[];
  onExpandedChange?: (keys: string[]) => void;

  /**
   * localStorage key for expansion state. Ignored when `expandedKeys` is set.
   */
  persistKey?: string;

  /** Default expanded keys when first mounted (no persist hit). */
  defaultExpandedKeys?: string[];

  // -------- Search --------

  /** Controlled search query. Component auto-expands ancestors of matches. */
  search?: string;
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;

  // -------- Context menu --------

  contextMenu?: ContextMenuItem[];

  // -------- Slots --------

  /** Shown above the tree (e.g. "New" / "Refresh" buttons). */
  toolbar?: ReactNode;

  /** Shown when data is empty. */
  emptyState?: ReactNode;

  // -------- a11y / style --------

  ariaLabel?: string;
  className?: string;
  height?: string | number;
}

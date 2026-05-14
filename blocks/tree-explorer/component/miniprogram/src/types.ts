import type { ReactNode } from 'react';

export type NodeKind = 'folder' | 'file';

export interface TreeNode {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  children?: TreeNode[];
  kind?: NodeKind;
  disabled?: boolean;
  searchText?: string;
}

export interface ContextMenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: (node: TreeNode) => boolean;
  visible?: (node: TreeNode) => boolean;
  onClick: (node: TreeNode) => void;
}

export interface TreeExplorerProps {
  data: TreeNode[];
  selectedId?: string;
  onSelect: (node: TreeNode, path: TreeNode[]) => void;
  onOpen?: (node: TreeNode, path: TreeNode[]) => void;
  expandedKeys?: string[];
  onExpandedChange?: (keys: string[]) => void;
  persistKey?: string;
  defaultExpandedKeys?: string[];
  search?: string;
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;
  contextMenu?: ContextMenuItem[];
  toolbar?: ReactNode;
  emptyState?: ReactNode;
  ariaLabel?: string;
  className?: string;
  height?: string | number;
}

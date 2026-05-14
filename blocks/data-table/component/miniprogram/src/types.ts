import type { ReactNode } from 'react';

export type SortOrder = 'asc' | 'desc';

export interface ColumnDef<T> {
  key: string;
  title: ReactNode;
  dataIndex?: keyof T & string;
  render?: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  hidden?: boolean;
}

export interface TableQuery {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: SortOrder;
  filters?: Record<string, unknown>;
}

export interface BatchAction<T> {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: (selected: T[]) => boolean;
  onClick: (selected: T[]) => void | Promise<void>;
}

export interface DataTableProps<T> {
  items: T[];
  total: number;
  loading?: boolean;
  error?: Error | null;
  getRowId: (row: T) => string;
  columns: ColumnDef<T>[];
  query: TableQuery;
  onQueryChange: (next: TableQuery) => void;
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[], rows: T[]) => void;
  batchActions?: BatchAction<T>[];
  search?: string;
  onSearchChange?: (s: string) => void;
  searchPlaceholder?: string;
  toolbarRight?: ReactNode;
  emptyState?: ReactNode;
  errorState?: (error: Error) => ReactNode;
  onRowClick?: (row: T) => void;
  height?: string | number;
  className?: string;
}

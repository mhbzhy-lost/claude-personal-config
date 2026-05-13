import type { ReactNode } from 'react';

export type SortOrder = 'asc' | 'desc';

export interface ColumnDef<T> {
  /** Stable key — used as column id, for sort field, and React key. */
  key: string;
  /** Header cell content. */
  title: ReactNode;
  /**
   * Path on the row to read when no `render` is given. Supports top-level keys
   * only (`'name'`, `'price'`). For nested fields write a `render` instead.
   */
  dataIndex?: keyof T & string;
  /** Custom cell render. Receives the row; falls back to dataIndex value if absent. */
  render?: (row: T, index: number) => ReactNode;
  /** Allow sorting by this column. Default false. */
  sortable?: boolean;
  /** Column width: px (number) or CSS string. */
  width?: number | string;
  /** Pin the column to left/right side; rest scroll horizontally. */
  fixed?: 'left' | 'right';
  /** Cell alignment. Default 'left'. */
  align?: 'left' | 'center' | 'right';
  /** Hide the column entirely (e.g. responsive). */
  hidden?: boolean;
}

export interface TableQuery {
  page: number;            // 1-based
  pageSize: number;
  sortBy?: string;
  sortOrder?: SortOrder;
  /** Free-form filter values keyed by column. Host owns the schema. */
  filters?: Record<string, unknown>;
}

export interface BatchAction<T> {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  /** Disable this action conditionally based on the current selection. */
  disabled?: (selected: T[]) => boolean;
  onClick: (selected: T[]) => void | Promise<void>;
}

export interface DataTableProps<T> {
  // -------- Data (host-managed) --------

  items: T[];
  total: number;
  loading?: boolean;
  error?: Error | null;
  /** Stable row id. Drives React key + selection. */
  getRowId: (row: T) => string;

  // -------- Schema --------

  columns: ColumnDef<T>[];

  // -------- Query (receive + emit) --------

  query: TableQuery;
  onQueryChange: (next: TableQuery) => void;

  // -------- Selection (optional) --------

  /** Enable row checkboxes. Default false. */
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[], rows: T[]) => void;
  /** Actions toolbar shown when at least one row is selected. */
  batchActions?: BatchAction<T>[];

  // -------- Search (optional) --------

  /** Show a search box in the toolbar (controlled by host). */
  search?: string;
  onSearchChange?: (s: string) => void;
  searchPlaceholder?: string;

  // -------- Slots --------

  /**
   * Extra toolbar content (rendered right of search).
   * Common: "Create", "Export", "Column visibility" etc.
   */
  toolbarRight?: ReactNode;

  /** Render when items is empty and not loading/error. */
  emptyState?: ReactNode;

  /** Render when error is set. Default uses antd `Result` + retry button. */
  errorState?: (error: Error) => ReactNode;

  // -------- Row interaction --------

  /** Click handler on row body. Useful for "open detail" navigation. */
  onRowClick?: (row: T) => void;

  // -------- Style --------

  height?: string | number;
  className?: string;
}

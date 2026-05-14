import type { ReactNode } from 'react';

/** 'auto': mini programs default to stack (mobile-first); 'split' always side-by-side. */
export type MasterDetailLayout = 'auto' | 'split' | 'stack';

export interface MasterDetailProps<T = unknown> {
  items: T[];
  getItemId: (item: T) => string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderItem: (item: T, selected: boolean) => ReactNode;
  renderDetail: (id: string) => ReactNode;
  placeholder?: ReactNode;
  emptyList?: ReactNode;
  /** Host renders back button in stack mode. Receives onBack callback. */
  renderBackButton?: (onBack: () => void) => ReactNode;
  layout?: MasterDetailLayout;
  splitBreakpoint?: number;
  splitRatio?: [number, number];
  loading?: boolean;
  ariaListLabel?: string;
  ariaDetailLabel?: string;
  className?: string;
  height?: string | number;
}

import type { ReactNode } from 'react';

export type OmniboxMode = 'modal' | 'inline';

export interface SearchItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

export interface SearchGroup {
  key: string;
  title?: ReactNode;
  items: SearchItem[];
}

export interface OmniboxProps {
  mode: OmniboxMode;
  query: string;
  onQueryChange: (q: string) => void;
  groups: SearchGroup[];
  loading?: boolean;
  empty?: ReactNode;
  defaultGroup?: SearchGroup;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
  loadingText?: string;
  className?: string;
}

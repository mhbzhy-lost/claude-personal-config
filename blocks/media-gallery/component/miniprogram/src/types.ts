import type { ReactNode } from 'react';
import type { CardFlowMode, ResponsiveColumns } from '@cf/card-flow';

export type MediaKind = 'image' | 'video';

export interface MediaItem {
  id: string;
  kind: MediaKind;
  url: string;
  thumb?: string;
  alt?: string;
  width?: number;
  height?: number;
  duration?: number;
  description?: ReactNode;
  meta?: Record<string, ReactNode>;
}

export interface MediaGalleryProps {
  items: MediaItem[];
  loading?: boolean;
  layout?: CardFlowMode;
  columns?: number | ResponsiveColumns;
  gap?: number;
  selectedIndex?: number | null;
  onSelectChange?: (index: number | null) => void;
  showSidebar?: boolean;
  renderSidebar?: (item: MediaItem) => ReactNode;
  onDownload?: (item: MediaItem) => void;
  emptyState?: ReactNode;
  ariaLabel?: string;
  className?: string;
  height?: string | number;
}

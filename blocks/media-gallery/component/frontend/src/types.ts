import type { ReactNode } from 'react';
import type { CardFlowMode, ResponsiveColumns } from '@cf/card-flow';

export type MediaKind = 'image' | 'video';

export interface MediaItem {
  /** Stable id. */
  id: string;
  /** Image vs video. */
  kind: MediaKind;
  /** Full-size URL (the viewer renders this). */
  url: string;
  /** Optional thumbnail URL (grid renders this). Falls back to `url`. */
  thumb?: string;
  /** Alt text (a11y) — required for images per WCAG. */
  alt?: string;
  /** Natural width / height (in px) — optional but enables fixed-AR thumbs. */
  width?: number;
  height?: number;
  /** Video duration (seconds) — only rendered if `kind === 'video'`. */
  duration?: number;
  /** Optional long description (rendered in sidebar). */
  description?: ReactNode;
  /** Structured metadata key→value (rendered in sidebar). */
  meta?: Record<string, ReactNode>;
}

export interface MediaGalleryProps {
  // -------- Data --------

  items: MediaItem[];
  loading?: boolean;

  // -------- Grid layout (forwarded to card-flow) --------

  /** Default 'grid'. 'waterfall' for masonry. */
  layout?: CardFlowMode;
  /** Forwarded to card-flow. Default `{xs:2, sm:3, md:4, lg:4, xl:6}`. */
  columns?: number | ResponsiveColumns;
  /** Forwarded to card-flow. Default 12. */
  gap?: number;

  // -------- Viewer --------

  /** Controlled selected index. Omit for internal state. */
  selectedIndex?: number | null;
  onSelectChange?: (index: number | null) => void;

  // -------- Sidebar --------

  /** Show meta/description sidebar inside the viewer. Default true. */
  showSidebar?: boolean;
  /**
   * Custom sidebar render. If omitted, the block auto-renders
   * description + meta key/value list.
   */
  renderSidebar?: (item: MediaItem) => ReactNode;

  // -------- Actions --------

  /** "Download" button in viewer header. Optional. */
  onDownload?: (item: MediaItem) => void;

  // -------- Slots --------

  emptyState?: ReactNode;

  // -------- a11y / style --------

  ariaLabel?: string;
  className?: string;
  height?: string | number;
}

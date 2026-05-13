import type { ReactNode } from 'react';

export type OmniboxMode = 'modal' | 'inline';

export interface SearchItem {
  /** Stable key — used as React key + active-index tracking. */
  key: string;
  /** Main label. */
  label: ReactNode;
  /** Optional icon (left). */
  icon?: ReactNode;
  /** Secondary text shown under the label. */
  description?: ReactNode;
  /** Right-side hint (e.g. ⌘K shortcut, "Open" verb). */
  hint?: ReactNode;
  /** Non-clickable, visually muted. */
  disabled?: boolean;
  /** Triggered on Enter or click. */
  onSelect: () => void;
}

export interface SearchGroup {
  key: string;
  title?: ReactNode;
  items: SearchItem[];
}

export interface OmniboxProps {
  // -------- Mode --------

  /** 'modal' = full-screen overlay opened by hotkey; 'inline' = always-visible input + dropdown. */
  mode: OmniboxMode;

  // -------- Query (controlled) --------

  /** Current input value. */
  query: string;
  onQueryChange: (q: string) => void;

  // -------- Results --------

  /**
   * Result groups. Host computes them (fuzzy match / async fetch).
   * Empty array (or all-empty groups) → renders `empty` slot.
   */
  groups: SearchGroup[];

  /** Show a loading indicator (async search in flight). */
  loading?: boolean;

  /** Rendered when no groups have any item. Defaults to a generic message. */
  empty?: ReactNode;

  /**
   * Bonus group shown ABOVE results, typically when query is empty.
   * Common: "Recent" / "Trending". Use for default state.
   */
  defaultGroup?: SearchGroup;

  // -------- Modal-specific --------

  /** Controlled open state (modal mode). Default: internal. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;

  /**
   * Hotkey to open in modal mode. Default `'mod+k'` (mod = Cmd on mac, Ctrl elsewhere).
   * Set `false` to disable. Set a string to override.
   */
  hotkey?: false | string;

  // -------- Inline-specific --------

  /** Inline input width (px). Default 320. */
  inlineWidth?: number;

  // -------- Locale / placeholder --------

  placeholder?: string;
  loadingText?: string;

  // -------- Style --------

  className?: string;
}

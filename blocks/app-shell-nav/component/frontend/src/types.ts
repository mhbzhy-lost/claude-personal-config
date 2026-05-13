import type { ReactNode } from 'react';

export interface MenuItem {
  /** Stable key — used for activeKey matching and React keys. */
  key: string;
  /** Display label. */
  label: ReactNode;
  /** Optional icon. */
  icon?: ReactNode;
  /**
   * Optional route hint. Not consumed by this component; host uses it
   * to derive `activeKey` from the current route. Kept on the schema
   * so the menu data is self-describing.
   */
  route?: string;
  /**
   * Badge to show next to the label.
   * - number → numeric badge (capped display rule belongs to host CSS)
   * - 'dot'  → small red dot
   * - undefined → no badge
   */
  badge?: number | 'dot';
  /** Nested children. Renders as a collapsible group. */
  children?: MenuItem[];
  /** Disabled state — non-clickable, visually muted. */
  disabled?: boolean;
}

export interface AppShellNavProps {
  // -------- Data --------

  /** Menu tree. */
  items: MenuItem[];

  /** Currently active leaf key (host derives from route). */
  activeKey?: string;

  /** Called when the user picks a leaf item (children-less, non-disabled). */
  onSelect: (item: MenuItem) => void;

  // -------- Slots --------

  /** Sidebar top region. Brand / logo / app title. */
  brand?: ReactNode;

  /** Sidebar bottom region. User card / quick actions / logout. */
  footer?: ReactNode;

  /** Main content area to the right of the sidebar. */
  children: ReactNode;

  // -------- Responsive / persistence --------

  /** Viewport width (px) below which sidebar collapses into a Drawer. Default 768. */
  breakpoint?: number;

  /** Desktop default collapsed state. Default false. Ignored if `collapsed` is set. */
  defaultCollapsed?: boolean;

  /**
   * localStorage key for desktop collapsed state.
   * If set, the component reads/writes it (overrides defaultCollapsed on mount).
   * Ignored if `collapsed` is set (fully controlled).
   */
  persistKey?: string;

  // -------- Controlled overrides (optional) --------

  /** Controlled desktop collapsed state. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;

  /** Controlled mobile drawer open state. */
  mobileDrawerOpen?: boolean;
  onMobileDrawerOpenChange?: (open: boolean) => void;

  // -------- Style --------

  /** Sidebar expanded width (px). Default 240. */
  width?: number;
  /** Sidebar collapsed width (px). Default 64. */
  collapsedWidth?: number;

  /** Aria label for the navigation landmark. Default 'Main navigation'. */
  ariaLabel?: string;

  /** Extra class on the root element. */
  className?: string;
}

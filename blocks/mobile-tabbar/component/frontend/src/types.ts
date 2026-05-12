import type { ReactNode } from 'react';

export interface TabbarTab {
  /** Stable identifier; used in `activeKey` / `onChange` and as React key. */
  key: string;
  /** Icon for inactive state. */
  icon: ReactNode;
  /** Optional icon for active state. Defaults to `icon`. */
  activeIcon?: ReactNode;
  /** Label shown below the icon. */
  label: ReactNode;
  /** Render the tab's page content. Called lazily on first activation. */
  render: () => ReactNode;
  /** Optional badge: number → count, true → red dot, undefined → no badge. */
  badge?: number | true;
}

export interface TabbarTheme {
  /** Selected tab color (icon + label). Default '#1677ff'. */
  activeColor?: string;
  /** Inactive tab color. Default '#999'. */
  inactiveColor?: string;
  /** Tabbar background. Default '#fff'. */
  background?: string;
  /** Top border color. Default '#f0f0f0'. */
  borderColor?: string;
  /** Badge color. Default '#ff4d4f'. */
  badgeColor?: string;
}

export interface TabbarShellProps {
  /** Tab definitions (2-5 tabs recommended). */
  tabs: TabbarTab[];
  /** Controlled active key. Use with `onChange`. */
  activeKey?: string;
  /** Default active key (uncontrolled). Defaults to `tabs[0].key`. */
  defaultActiveKey?: string;
  /** Callback when tab switches. Receives the new active key. */
  onChange?: (key: string) => void;
  /**
   * Keep previously-mounted tabs alive (preserves state).
   * Default true. Set false to unmount inactive tabs (saves memory).
   */
  keepAlive?: boolean;
  /** Theme overrides. */
  theme?: TabbarTheme;
  /** Apply iOS safe-area-inset-bottom as padding. Default true. */
  safeAreaBottom?: boolean;
  /** Auto-hide on scroll (placeholder for v0.2; ignored in v0.1). */
  autoHide?: boolean;
  /** Custom className on the root element. */
  className?: string;
}

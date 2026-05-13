import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Drawer } from 'antd';
import { MenuOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { useResponsiveSidebar } from '../hooks/useResponsiveSidebar';
import { usePersistedCollapsed } from '../hooks/usePersistedCollapsed';
import { ancestorKeysOf } from '../utils/menuTree';
import { MenuTree } from './MenuTree';
import type { AppShellNavProps } from '../types';

/**
 * App shell with responsive nav:
 * - Desktop (>= breakpoint): fixed-left collapsible sidebar
 * - Mobile  (< breakpoint):  hamburger button + Drawer
 *
 * Owns no business state — host gives `items`, `activeKey`, `onSelect`.
 * Collapsed state is persisted via `persistKey` (uncontrolled) or fully
 * controlled by `collapsed` + `onCollapsedChange`.
 */
export function AppShellNav({
  items,
  activeKey,
  onSelect,
  brand,
  footer,
  children,
  breakpoint = 768,
  defaultCollapsed = false,
  persistKey,
  collapsed: collapsedProp,
  onCollapsedChange,
  mobileDrawerOpen: drawerOpenProp,
  onMobileDrawerOpenChange,
  width = 240,
  collapsedWidth = 64,
  ariaLabel = 'Main navigation',
  className,
}: AppShellNavProps) {
  const isMobile = useResponsiveSidebar(breakpoint);

  const [collapsed, setCollapsed] = usePersistedCollapsed({
    controlled: collapsedProp,
    onChange: onCollapsedChange,
    persistKey,
    defaultCollapsed,
  });

  const [drawerOpenInternal, setDrawerOpenInternal] = useState(false);
  const drawerOpen = drawerOpenProp ?? drawerOpenInternal;
  const setDrawerOpen = useCallback(
    (v: boolean) => {
      if (drawerOpenProp === undefined) setDrawerOpenInternal(v);
      onMobileDrawerOpenChange?.(v);
    },
    [drawerOpenProp, onMobileDrawerOpenChange],
  );

  // Auto-expand parent groups for the active leaf.
  const autoOpen = useMemo(() => ancestorKeysOf(items, activeKey), [items, activeKey]);
  const [openKeys, setOpenKeys] = useState<string[]>(autoOpen);
  useEffect(() => {
    if (autoOpen.length === 0) return;
    setOpenKeys((prev) => Array.from(new Set([...prev, ...autoOpen])));
  }, [autoOpen]);

  const handleSelect = useCallback(
    (item: Parameters<typeof onSelect>[0]) => {
      onSelect(item);
      if (isMobile) setDrawerOpen(false);
    },
    [onSelect, isMobile, setDrawerOpen],
  );

  const sidebarBody = (
    <div className="asn-sidebar-body">
      {brand ? (
        <div className="asn-brand" data-collapsed={collapsed || undefined}>
          {brand}
        </div>
      ) : null}
      <div className="asn-menu" role="navigation" aria-label={ariaLabel}>
        <MenuTree
          items={items}
          activeKey={activeKey}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          onSelect={handleSelect}
          collapsed={!isMobile && collapsed}
        />
      </div>
      {footer ? (
        <div className="asn-footer" data-collapsed={collapsed || undefined}>
          {footer}
        </div>
      ) : null}
    </div>
  );

  if (isMobile) {
    return (
      <div className={['asn-shell', 'asn-shell--mobile', className].filter(Boolean).join(' ')}>
        <Button
          type="text"
          icon={<MenuOutlined />}
          aria-label="打开导航"
          aria-expanded={drawerOpen}
          className="asn-hamburger"
          onClick={() => setDrawerOpen(true)}
        />
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={Math.min(width, 320)}
          styles={{ body: { padding: 0 } }}
          rootClassName="asn-drawer"
          aria-label={ariaLabel}
        >
          {sidebarBody}
        </Drawer>
        <main className="asn-main">{children}</main>
      </div>
    );
  }

  return (
    <div
      className={['asn-shell', 'asn-shell--desktop', className].filter(Boolean).join(' ')}
      style={{ ['--asn-sidebar-width' as string]: `${collapsed ? collapsedWidth : width}px` }}
    >
      <aside
        className="asn-sidebar"
        aria-label={ariaLabel}
        data-collapsed={collapsed || undefined}
      >
        {sidebarBody}
        <Button
          type="text"
          className="asn-collapse-toggle"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          aria-label={collapsed ? '展开导航' : '折叠导航'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        />
      </aside>
      <main className="asn-main">{children}</main>
    </div>
  );
}

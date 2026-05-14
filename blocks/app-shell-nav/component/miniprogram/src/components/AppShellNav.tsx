import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text } from '@tarojs/components';
import { useResponsiveSidebar } from '../hooks/useResponsiveSidebar';
import { usePersistedCollapsed } from '../hooks/usePersistedCollapsed';
import { ancestorKeysOf } from '../utils/menuTree';
import { MenuTree } from './MenuTree';
import type { AppShellNavProps, MenuItem } from '../types';

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

  // Auto-expand parent groups for the active leaf (handled in MenuTree's local state)
  // This hook just provides the initial open state
  const autoOpen = useMemo(() => ancestorKeysOf(items, activeKey), [items, activeKey]);

  const handleSelect = useCallback(
    (item: MenuItem) => {
      onSelect(item);
      if (isMobile) setDrawerOpen(false);
    },
    [onSelect, isMobile, setDrawerOpen],
  );

  const sidebarContent = (
    <View className='asn-sidebar-body'>
      {brand && (
        <View className={`asn-brand ${collapsed ? 'asn-brand-collapsed' : ''}`}>
          {brand}
        </View>
      )}
      <View className='asn-menu' aria-label={ariaLabel}>
        <MenuTree
          items={items}
          activeKey={activeKey}
          collapsed={!isMobile && collapsed}
          onSelect={handleSelect}
        />
      </View>
      {footer && (
        <View className={`asn-footer ${collapsed ? 'asn-footer-collapsed' : ''}`}>
          {footer}
        </View>
      )}
    </View>
  );

  // Mobile: hamburger + drawer overlay
  if (isMobile) {
    return (
      <View className={['asn-shell', 'asn-shell-mobile', className].filter(Boolean).join(' ')}>
        {/* Hamburger button */}
        <View className='asn-hamburger' onClick={() => setDrawerOpen(true)} aria-label='打开导航' aria-expanded={drawerOpen}>
          <Text className='asn-hamburger-icon'>{'≡'}</Text>
        </View>

        {/* Drawer overlay */}
        {drawerOpen && (
          <>
            <View className='asn-drawer-mask' onClick={() => setDrawerOpen(false)} />
            <View className='asn-drawer' style={`width: ${Math.min(width, 320)}px`}>
              {sidebarContent}
            </View>
          </>
        )}

        <View className='asn-main'>{children}</View>
      </View>
    );
  }

  // Desktop: fixed sidebar + main
  const sidebarWidth = collapsed ? collapsedWidth : width;
  return (
    <View
      className={['asn-shell', 'asn-shell-desktop', className].filter(Boolean).join(' ')}
      style={`--asn-sidebar-width: ${sidebarWidth}px`}
    >
      <View
        className={`asn-sidebar ${collapsed ? 'asn-sidebar-collapsed' : ''}`}
        style={`width: ${sidebarWidth}px; flex-basis: ${sidebarWidth}px`}
        role='navigation'
        aria-label='主导航'
      >
        {sidebarContent}
        {/* Collapse toggle at bottom */}
        <View className='asn-collapse-btn' onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? '展开导航' : '收起导航'}>
          <Text>{collapsed ? '>' : '<'}</Text>
        </View>
      </View>
      <View className='asn-main'>{children}</View>
    </View>
  );
}

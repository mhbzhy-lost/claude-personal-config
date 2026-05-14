import { View, Text } from '@tarojs/components';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TabbarShellProps, TabbarTab, TabbarTheme } from '../types';

const DEFAULT_THEME: Required<TabbarTheme> = {
  activeColor: '#1677ff',
  inactiveColor: '#999',
  background: '#fff',
  borderColor: '#f0f0f0',
  badgeColor: '#ff4d4f',
};

function Badge({ value, color }: { value: number | true; color: string }) {
  if (value === true) {
    return (
      <View className='mt-mp-tabbar-dot' style={{ background: color }}>
        {/* red dot, no text */}
      </View>
    );
  }
  if (value <= 0) return null;
  const display = value > 99 ? '99+' : String(value);
  return (
    <View className='mt-mp-tabbar-badge' style={{ background: color }}>
      <Text>{display}</Text>
    </View>
  );
}

function TabButton({
  tab,
  active,
  theme,
  onClick,
}: {
  tab: TabbarTab;
  active: boolean;
  theme: Required<TabbarTheme>;
  onClick: () => void;
}) {
  const color = active ? theme.activeColor : theme.inactiveColor;
  return (
    <View
      className={`mt-mp-tabbar-item ${active ? 'mt-mp-tabbar-item--active' : ''}`}
      style={{ color }}
      onClick={onClick}
    >
      <View className='mt-mp-tabbar-icon-wrap'>
        {active && tab.activeIcon ? tab.activeIcon : tab.icon}
        {tab.badge !== undefined && <Badge value={tab.badge} color={theme.badgeColor} />}
      </View>
      <Text className='mt-mp-tabbar-label'>{tab.label}</Text>
    </View>
  );
}

export function TabbarShell({
  tabs,
  activeKey,
  defaultActiveKey,
  onChange,
  keepAlive = true,
  theme,
  safeAreaBottom = true,
  className,
}: TabbarShellProps) {
  if (tabs.length === 0) {
    throw new Error('TabbarShell: at least one tab required');
  }

  const t = { ...DEFAULT_THEME, ...(theme ?? {}) };
  const controlled = activeKey !== undefined;
  const [internalActive, setInternalActive] = useState<string>(
    () => defaultActiveKey ?? tabs[0]!.key,
  );
  const current = controlled ? activeKey! : internalActive;

  const everActivated = useRef<Set<string>>(new Set([current]));
  useEffect(() => {
    everActivated.current.add(current);
  }, [current]);

  const switchTo = (key: string) => {
    if (key === current) return;
    if (!controlled) setInternalActive(key);
    onChange?.(key);
  };

  const renderedKeys = useMemo(() => {
    if (!keepAlive) return new Set([current]);
    return new Set([...everActivated.current, current]);
  }, [current, keepAlive]);

  const rootCls = ['mt-mp-tabbar-shell', className ?? ''].filter(Boolean).join(' ');
  const barCls = ['mt-mp-tabbar', safeAreaBottom ? 'mt-mp-tabbar--safe' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <View className={rootCls}>
      <View className='mt-mp-tabbar-pages'>
        {tabs.map((tab) => {
          const visible = tab.key === current;
          if (!keepAlive && !visible) return null;
          if (!renderedKeys.has(tab.key)) return null;
          return (
            <View
              key={tab.key}
              className='mt-mp-tabbar-page'
              style={{ display: visible ? 'block' : 'none' }}
              aria-selected={visible}
            >
              {tab.render()}
            </View>
          );
        })}
      </View>
      <View
        className={barCls}
        style={{
          background: t.background,
          borderTopColor: t.borderColor,
        }}
        aria-label="底部标签栏"
      >
        {tabs.map((tab) => {
          const active = tab.key === current;
          return (
            <TabButton
              key={tab.key}
              tab={tab}
              active={active}
              theme={t}
              onClick={() => switchTo(tab.key)}
            />
          );
        })}
      </View>
    </View>
  );
}

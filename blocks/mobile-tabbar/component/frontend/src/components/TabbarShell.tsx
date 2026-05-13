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
    return <span className="ui-tabbar-dot" style={{ background: color }} aria-label="新内容" />;
  }
  if (value <= 0) return null;
  const display = value > 99 ? '99+' : String(value);
  return (
    <span className="ui-tabbar-badge" style={{ background: color }} aria-label={`${value} 条未读`}>
      {display}
    </span>
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
    () => defaultActiveKey ?? tabs[0]!.key
  );
  const current = controlled ? activeKey! : internalActive;

  // Track which tabs have ever been activated, for keep-alive mounting.
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

  const rootCls = ['ui-tabbar-shell', className ?? ''].filter(Boolean).join(' ');
  const barCls = ['ui-tabbar', safeAreaBottom ? 'ui-tabbar-safe-area' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootCls}>
      <div className="ui-tabbar-pages">
        {tabs.map((tab) => {
          const visible = tab.key === current;
          if (!keepAlive && !visible) return null;
          if (!renderedKeys.has(tab.key)) return null;
          return (
            <div
              key={tab.key}
              className="ui-tabbar-page"
              style={{ display: visible ? undefined : 'none' }}
              role="tabpanel"
              aria-hidden={!visible}
            >
              {tab.render()}
            </div>
          );
        })}
      </div>
      <div
        className={barCls}
        style={{
          background: t.background,
          borderTopColor: t.borderColor,
        }}
        role="tablist"
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
      </div>
    </div>
  );
}

interface TabButtonProps {
  tab: TabbarTab;
  active: boolean;
  theme: Required<TabbarTheme>;
  onClick: () => void;
}

function TabButton({ tab, active, theme, onClick }: TabButtonProps) {
  const color = active ? theme.activeColor : theme.inactiveColor;
  return (
    <button
      type="button"
      className={`ui-tabbar-item ${active ? 'ui-tabbar-item-active' : ''}`}
      style={{ color }}
      role="tab"
      aria-selected={active}
      onClick={onClick}
    >
      <span className="ui-tabbar-icon-wrap">
        {active && tab.activeIcon ? tab.activeIcon : tab.icon}
        {tab.badge !== undefined && (
          <Badge value={tab.badge} color={theme.badgeColor} />
        )}
      </span>
      <span className="ui-tabbar-label">{tab.label}</span>
    </button>
  );
}

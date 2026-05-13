import { Badge, Menu } from 'antd';
import type { MenuProps } from 'antd';
import type { MenuItem } from '../types';

interface MenuTreeProps {
  items: MenuItem[];
  activeKey?: string;
  openKeys: string[];
  onOpenChange: (keys: string[]) => void;
  onSelect: (item: MenuItem) => void;
  /** When true, hide labels and badges (icon-only sidebar). */
  collapsed: boolean;
}

function toAntdItems(items: MenuItem[], collapsed: boolean): Required<MenuProps>['items'] {
  return items.map((item) => {
    const labelNode =
      item.badge === undefined || collapsed ? (
        item.label
      ) : item.badge === 'dot' ? (
        <Badge dot offset={[6, 0]}>{item.label}</Badge>
      ) : (
        <Badge count={item.badge} offset={[8, 0]} overflowCount={99}>
          <span style={{ paddingRight: 8 }}>{item.label}</span>
        </Badge>
      );

    if (item.children?.length) {
      return {
        key: item.key,
        icon: item.icon,
        label: labelNode,
        disabled: item.disabled,
        children: toAntdItems(item.children, collapsed),
      };
    }
    return {
      key: item.key,
      icon: item.icon,
      label: labelNode,
      disabled: item.disabled,
    };
  });
}

/**
 * Flatten the tree once to recover MenuItem by key on click.
 */
function flatten(items: MenuItem[], acc: Map<string, MenuItem>): void {
  for (const it of items) {
    acc.set(it.key, it);
    if (it.children?.length) flatten(it.children, acc);
  }
}

export function MenuTree({
  items,
  activeKey,
  openKeys,
  onOpenChange,
  onSelect,
  collapsed,
}: MenuTreeProps) {
  const flat = new Map<string, MenuItem>();
  flatten(items, flat);

  return (
    <Menu
      mode="inline"
      inlineCollapsed={collapsed}
      selectedKeys={activeKey ? [activeKey] : []}
      openKeys={openKeys}
      onOpenChange={onOpenChange}
      items={toAntdItems(items, collapsed)}
      onClick={({ key }) => {
        const item = flat.get(String(key));
        if (item && !item.disabled && !item.children?.length) {
          onSelect(item);
        }
      }}
      style={{ borderInlineEnd: 'none' }}
    />
  );
}

import { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import type { MenuItem } from '../types';

interface MenuTreeProps {
  items: MenuItem[];
  activeKey?: string;
  collapsed: boolean;
  onSelect: (item: MenuItem) => void;
}

function MenuNode({
  item,
  depth,
  activeKey,
  collapsed,
  onSelect,
}: {
  item: MenuItem;
  depth: number;
  activeKey?: string;
  collapsed: boolean;
  onSelect: (item: MenuItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = (item.children?.length ?? 0) > 0;
  const isActive = !hasChildren && item.key === activeKey;

  if (hasChildren) {
    return (
      <View className='asn-menu-group'>
        <View
          className={`asn-menu-parent ${collapsed ? 'asn-menu-parent-collapsed' : ''}`}
          onClick={() => setOpen(!open)}
        >
          <View className='asn-menu-parent-row'>
            {item.icon && <View className='asn-menu-icon'>{item.icon}</View>}
            {!collapsed && <Text className='asn-menu-label'>{item.label}</Text>}
          </View>
          {!collapsed && (
            <Text className={`asn-menu-arrow ${open ? 'asn-menu-arrow-open' : ''}`}>
              {'>'}
            </Text>
          )}
        </View>
        {open && !collapsed && (
          <View className='asn-menu-children'>
            {item.children!.map((child) => (
              <MenuNode
                key={child.key}
                item={child}
                depth={depth + 1}
                activeKey={activeKey}
                collapsed={collapsed}
                onSelect={onSelect}
              />
            ))}
          </View>
        )}
        {collapsed && (
          <View className='asn-menu-children-collapsed'>
            {item.children!.map((child) => {
              const isChildActive = child.key === activeKey;
              return (
                <View
                  key={child.key}
                  className={`asn-menu-item-collapsed ${isChildActive ? 'asn-menu-item-active' : ''} ${child.disabled ? 'asn-menu-item-disabled' : ''}`}
                  onClick={() => !child.disabled && onSelect(child)}
                >
                  {child.icon && <View className='asn-menu-icon'>{child.icon}</View>}
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  return (
    <View
      className={`asn-menu-item ${isActive ? 'asn-menu-item-active' : ''} ${item.disabled ? 'asn-menu-item-disabled' : ''} ${collapsed ? 'asn-menu-item-collapsed' : ''}`}
      style={`padding-left: ${collapsed ? 0 : (depth * 32 + 32)}rpx`}
      onClick={() => !item.disabled && onSelect(item)}
    >
      {item.icon && <View className='asn-menu-icon'>{item.icon}</View>}
      {!collapsed && (
        <View className='asn-menu-item-body'>
          <Text className='asn-menu-label'>{item.label}</Text>
          {item.badge === 'dot' && <View className='asn-menu-dot' />}
          {typeof item.badge === 'number' && (
            <View className='asn-menu-badge'>
              <Text>{item.badge > 99 ? '99+' : String(item.badge)}</Text>
            </View>
          )}
        </View>
      )}
      {collapsed && item.badge === 'dot' && <View className='asn-menu-dot-collapsed' />}
    </View>
  );
}

export function MenuTree({ items, activeKey, collapsed, onSelect }: MenuTreeProps) {
  return (
    <ScrollView className='asn-menu-scroll' scrollY>
      {items.map((item) => (
        <MenuNode
          key={item.key}
          item={item}
          depth={0}
          activeKey={activeKey}
          collapsed={collapsed}
          onSelect={onSelect}
        />
      ))}
    </ScrollView>
  );
}

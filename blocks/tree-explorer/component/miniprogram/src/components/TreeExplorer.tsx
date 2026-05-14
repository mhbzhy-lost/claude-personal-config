import { View, Text, Input, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TreeExplorerProps, TreeNode, ContextMenuItem } from '../types';

function getSearchText(node: TreeNode): string {
  if (node.searchText) return node.searchText;
  if (typeof node.label === 'string') return node.label;
  return '';
}

function findAncestors(nodes: TreeNode[], targetId: string): TreeNode[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return [node];
    if (node.children) {
      const result = findAncestors(node.children, targetId);
      if (result) return [node, ...result];
    }
  }
  return null;
}

interface TreeNodeViewProps {
  node: TreeNode;
  depth: number;
  selectedId?: string;
  expandedKeys: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: TreeNode) => void;
  onOpen: (node: TreeNode) => void;
  contextMenu?: ContextMenuItem[];
  searchHighlight?: string;
}

function TreeNodeView({
  node,
  depth,
  selectedId,
  expandedKeys,
  onToggle,
  onSelect,
  onOpen,
  contextMenu,
  searchHighlight,
}: TreeNodeViewProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedKeys.has(node.id);
  const isSelected = selectedId === node.id;
  const kind = node.kind ?? (hasChildren ? 'folder' : 'file');

  const handleClick = () => {
    onSelect(node);
  };

  const handleDoubleClick = () => {
    if (hasChildren) {
      onToggle(node.id);
    } else {
      onOpen(node);
    }
  };

  const visibleContextItems = contextMenu?.filter(
    (item) => !item.visible || item.visible(node),
  ) ?? [];

  const highlightLabel = (label: React.ReactNode): React.ReactNode => {
    if (!searchHighlight || typeof label !== 'string') return label;
    const idx = label.toLowerCase().indexOf(searchHighlight.toLowerCase());
    if (idx === -1) return label;
    return (
      <Text>
        {label.slice(0, idx)}
        <Text style={{ background: '#ffd666' }}>{label.slice(idx, idx + searchHighlight.length)}</Text>
        {label.slice(idx + searchHighlight.length)}
      </Text>
    );
  };

  const folderIcon = kind === 'folder' ? (isExpanded ? '📂' : '📁') : '📄';
  const icon = node.icon ?? <Text>{folderIcon}</Text>;

  return (
    <View>
      <View
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: `6px 12px 6px ${12 + depth * 20}px`,
          background: isSelected ? '#e6f4ff' : 'transparent',
          opacity: node.disabled ? 0.5 : 1,
        }}
        onClick={handleClick}
        onLongPress={() => {
          if (visibleContextItems.length > 0) {
            Taro.showActionSheet({
              itemList: visibleContextItems.map((i) => String(i.label)),
            }).then((res) => {
              visibleContextItems[res.tapIndex]?.onClick(node);
            }).catch(() => {});
          }
        }}
        onDoubleClick={handleDoubleClick}
      >
        {/* Expand toggle */}
        <View style={{ width: '20px', flexShrink: 0, textAlign: 'center' }}>
          {hasChildren && (
            <Text style={{ fontSize: '10px' }}>{isExpanded ? '▼' : '▶'}</Text>
          )}
        </View>
        {/* Icon */}
        <View style={{ marginRight: '6px', fontSize: '16px' }}>{icon}</View>
        {/* Label */}
        <Text style={{ flex: 1, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {highlightLabel(node.label)}
        </Text>
        {/* Context menu indicator */}
        {visibleContextItems.length > 0 && (
          <Text style={{ fontSize: '12px', color: '#999', marginLeft: '4px' }}>···</Text>
        )}
      </View>
      {/* Children */}
      {hasChildren && isExpanded && (
        <View>
          {node.children!.map((child) => (
            <TreeNodeView
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedKeys={expandedKeys}
              onToggle={onToggle}
              onSelect={onSelect}
              onOpen={onOpen}
              contextMenu={contextMenu}
              searchHighlight={searchHighlight}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export function TreeExplorer({
  data,
  selectedId,
  onSelect,
  onOpen,
  expandedKeys: expandedProp,
  onExpandedChange,
  persistKey,
  defaultExpandedKeys,
  search,
  onSearchChange,
  searchPlaceholder = '搜索…',
  contextMenu,
  toolbar,
  emptyState,
  ariaLabel,
  className,
  height = '100vh',
}: TreeExplorerProps) {
  const controlled = expandedProp !== undefined;

  const getStored = (): string[] => {
    if (!persistKey) return [];
    try {
      const raw = Taro.getStorageSync(persistKey);
      if (Array.isArray(raw)) return raw.filter((k) => typeof k === 'string');
    } catch { /* ignore */ }
    return [];
  };

  const [internalExpanded, setInternalExpanded] = useState<string[]>(
    () => expandedProp ?? getStored().length ? getStored() : (defaultExpandedKeys ?? []),
  );

  const expanded = controlled ? expandedProp! : internalExpanded;
  const expandedSet = useMemo(() => new Set(expanded), [expanded]);

  const persist = useCallback(
    (keys: string[]) => {
      if (persistKey && !controlled) {
        try { Taro.setStorageSync(persistKey, keys); } catch { /* ignore */ }
      }
    },
    [persistKey, controlled],
  );

  const toggle = useCallback(
    (id: string) => {
      const next = expandedSet.has(id)
        ? expanded.filter((k) => k !== id)
        : [...expanded, id];
      if (!controlled) setInternalExpanded(next);
      onExpandedChange?.(next);
      persist(next);
    },
    [expanded, expandedSet, controlled, onExpandedChange, persist],
  );

  // Auto-expand to matches on search
  useEffect(() => {
    if (!search) return;
    const matchIds: string[] = [];
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (getSearchText(n).toLowerCase().includes(search.toLowerCase())) {
          matchIds.push(n.id);
        }
        if (n.children) walk(n.children);
      }
    };
    walk(data);
    if (matchIds.length > 0) {
      const ancestors = new Set<string>();
      for (const id of matchIds) {
        const path = findAncestors(data, id);
        if (path) {
          for (const a of path.slice(0, -1)) ancestors.add(a.id);
        }
      }
      if (ancestors.size > 0) {
        const next = [...new Set([...expanded, ...ancestors])];
        if (!controlled) setInternalExpanded(next);
        onExpandedChange?.(next);
      }
    }
  }, [search]);

  const handleSelect = (node: TreeNode) => {
    const path = findAncestors(data, node.id) ?? [node];
    onSelect(node, path);
  };

  const handleOpen = (node: TreeNode) => {
    if (!onOpen) return;
    const path = findAncestors(data, node.id) ?? [node];
    onOpen(node, path);
  };

  const rootStyle: Record<string, string> = {
    height: typeof height === 'number' ? `${height * 2}rpx` : height,
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <View className={`te-mp-tree-explorer ${className ?? ''}`} style={rootStyle}>
      {toolbar ? <View style={{ flexShrink: 0 }}>{toolbar}</View> : null}

      {onSearchChange && (
        <View style={{ flexShrink: 0, padding: '8px 12px', background: '#fafafa' }}>
          <Input
            placeholder={searchPlaceholder}
            value={search ?? ''}
            onInput={(e) => onSearchChange(e.detail.value)}
            style={{
              border: '1px solid #e8e8e8',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '14px',
              background: '#fff',
            }}
          />
        </View>
      )}

      <ScrollView style={{ flex: 1 }} scrollY aria-label={ariaLabel ?? '树形导航'}>
        {data.length === 0 ? (
          <View style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
            {emptyState ?? <Text>暂无数据</Text>}
          </View>
        ) : (
          data.map((node) => (
            <TreeNodeView
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              expandedKeys={expandedSet}
              onToggle={toggle}
              onSelect={handleSelect}
              onOpen={handleOpen}
              contextMenu={contextMenu}
              searchHighlight={search}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

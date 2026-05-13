import { Dropdown, Empty, Input, Tree } from 'antd';
import type { TreeProps } from 'antd';
import {
  FileOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useCallback, useMemo } from 'react';
import { usePersistedExpansion } from '../hooks/usePersistedExpansion';
import { findAncestorsForMatches, findPath, resolveKind } from '../utils/tree';
import type { TreeExplorerProps, TreeNode } from '../types';

interface DataNode {
  key: string;
  title: React.ReactNode;
  icon?: React.ReactNode;
  children?: DataNode[];
  disabled?: boolean;
  /** Original node, attached for click handlers. */
  meta: TreeNode;
}

function buildDataNodes(
  nodes: TreeNode[],
  match: Set<string>,
  expanded: boolean,
): DataNode[] {
  return nodes.map((n) => {
    const kind = resolveKind(n);
    const isFolder = kind === 'folder';
    const icon = n.icon ?? (isFolder ? (expanded ? <FolderOpenOutlined /> : <FolderOutlined />) : <FileOutlined />);
    const matched = match.has(n.id);
    const title = (
      <span className={'te-node' + (matched ? ' te-node--matched' : '')}>{n.label}</span>
    );
    return {
      key: n.id,
      title,
      icon,
      disabled: n.disabled,
      children: n.children ? buildDataNodes(n.children, match, expanded) : undefined,
      meta: n,
    };
  });
}

/**
 * File-explorer style tree with:
 * - controlled selection + ancestor path callback
 * - controlled / persisted expansion
 * - search query that auto-expands matching ancestors and highlights matches
 * - right-click context menu schema
 * - double-click 'open' semantic (separate from single-click select)
 */
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
  ariaLabel = '树形浏览器',
  className,
  height = '100%',
}: TreeExplorerProps) {
  const [expandedInternal, setExpanded] = usePersistedExpansion({
    controlled: expandedProp,
    onChange: onExpandedChange,
    persistKey,
    defaultKeys: defaultExpandedKeys,
  });

  const { matchedIds, ancestorIds } = useMemo(
    () => findAncestorsForMatches(data, search ?? ''),
    [data, search],
  );

  // When searching, union manual expansion with ancestors-of-matches.
  const effectiveExpanded = useMemo(() => {
    if (!search || !search.trim()) return expandedInternal;
    return Array.from(new Set([...expandedInternal, ...ancestorIds]));
  }, [search, expandedInternal, ancestorIds]);

  const treeData = useMemo(
    () => buildDataNodes(data, matchedIds, true),
    [data, matchedIds],
  );

  const onAntdSelect: NonNullable<TreeProps['onSelect']> = useCallback(
    (_keys, info) => {
      const node = (info.node as unknown as DataNode).meta;
      const path = findPath(data, node.id) ?? [node];
      onSelect(node, path);
    },
    [data, onSelect],
  );

  const onAntdDoubleClick: NonNullable<TreeProps['onDoubleClick']> = useCallback(
    (_e, n) => {
      if (!onOpen) return;
      const node = (n as unknown as DataNode).meta;
      const path = findPath(data, node.id) ?? [node];
      onOpen(node, path);
    },
    [data, onOpen],
  );

  const renderContextMenu = useCallback(
    (node: TreeNode): { key: string; label: React.ReactNode; danger?: boolean; disabled?: boolean; onClick: () => void }[] => {
      if (!contextMenu) return [];
      return contextMenu
        .filter((m) => m.visible?.(node) ?? true)
        .map((m) => ({
          key: m.key,
          label: (
            <span>
              {m.icon && <span style={{ marginRight: 6 }}>{m.icon}</span>}
              {m.label}
            </span>
          ),
          danger: m.danger,
          disabled: m.disabled?.(node),
          onClick: () => m.onClick(node),
        }));
    },
    [contextMenu],
  );

  // Wrap each tree row with antd Dropdown for right-click menu (if any).
  // antd Tree itself doesn't have row-level context menu, so we override
  // titleRender to wrap.
  const titleRender = useCallback<NonNullable<TreeProps['titleRender']>>(
    (n) => {
      const meta = (n as unknown as DataNode).meta;
      const title = (n as unknown as DataNode).title;
      if (!contextMenu?.length) return title;
      const items = renderContextMenu(meta);
      return (
        <Dropdown menu={{ items: items.map((it) => ({ key: it.key, label: it.label, danger: it.danger, disabled: it.disabled, onClick: it.onClick })) }} trigger={['contextMenu']}>
          <span>{title}</span>
        </Dropdown>
      );
    },
    [contextMenu, renderContextMenu],
  );

  return (
    <div
      className={['te-shell', className].filter(Boolean).join(' ')}
      style={{ height, display: 'flex', flexDirection: 'column' }}
      aria-label={ariaLabel}
    >
      {(onSearchChange !== undefined || toolbar) && (
        <div className="te-toolbar">
          {onSearchChange !== undefined && (
            <Input
              size="small"
              prefix={<SearchOutlined />}
              placeholder={searchPlaceholder}
              value={search ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              allowClear
            />
          )}
          {toolbar}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 0' }}>
        {data.length === 0 ? (
          <div className="te-empty">{emptyState ?? <Empty description="暂无内容" />}</div>
        ) : (
          <Tree
            treeData={treeData}
            showIcon
            selectedKeys={selectedId ? [selectedId] : []}
            expandedKeys={effectiveExpanded}
            onExpand={(keys) => setExpanded(keys.map(String))}
            onSelect={onAntdSelect}
            onDoubleClick={onAntdDoubleClick}
            titleRender={titleRender}
            blockNode
          />
        )}
      </div>
    </div>
  );
}

import { View, Text, Input, ScrollView } from '@tarojs/components';
import { Pagination, Checkbox, Button, Search, Tag } from '@antmjs/vantui';
import { useMemo } from 'react';
import type { DataTableProps, ColumnDef, TableQuery } from '../types';

function SortArrow({ order }: { order?: 'asc' | 'desc' }) {
  if (!order) return null;
  return <Text style={{ fontSize: '12px', marginLeft: '4px' }}>{order === 'asc' ? '↑' : '↓'}</Text>;
}

export function DataTable<T>({
  items,
  total,
  loading = false,
  error,
  getRowId,
  columns,
  query,
  onQueryChange,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  batchActions,
  search,
  onSearchChange,
  searchPlaceholder = '搜索…',
  toolbarRight,
  emptyState,
  errorState,
  onRowClick,
  height = '100vh',
  className,
}: DataTableProps<T>) {
  const visibleColumns = useMemo(() => columns.filter((c) => !c.hidden), [columns]);

  const selectedSet = useMemo(() => new Set(selectedKeys ?? []), [selectedKeys]);

  const toggleSort = (col: ColumnDef<T>) => {
    if (!col.sortable) return;
    const nextOrder: TableQuery['sortOrder'] =
      query.sortBy === col.key && query.sortOrder === 'asc' ? 'desc' : 'asc';
    onQueryChange({ ...query, page: 1, sortBy: col.key, sortOrder: nextOrder });
  };

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange(items.map(getRowId), [...items]);
    } else {
      onSelectionChange([], []);
    }
  };

  const handleSelectRow = (row: T) => {
    if (!onSelectionChange) return;
    const id = getRowId(row);
    const next = selectedSet.has(id)
      ? selectedKeys!.filter((k) => k !== id)
      : [...(selectedKeys ?? []), id];
    const nextRows = next.map((k) => items.find((r) => getRowId(r) === k)!).filter(Boolean);
    onSelectionChange(next, nextRows);
  };

  const allSelected = items.length > 0 && items.every((r) => selectedSet.has(getRowId(r)));

  const rootStyle: Record<string, string> = {
    height: typeof height === 'number' ? `${height * 2}rpx` : height,
    display: 'flex',
    flexDirection: 'column',
  };

  const headerStyle: Record<string, string> = {
    flexShrink: 0,
    background: '#fff',
    borderBottom: '1px solid #f0f0f0',
    padding: '8px 12px',
  };

  const colStyle = (col: ColumnDef<T>): Record<string, string> => ({
    flex: col.width ? 'none' : '1',
    width: typeof col.width === 'number' ? `${col.width * 2}rpx` : col.width,
    textAlign: col.align ?? 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '13px',
    padding: '8px 4px',
  });

  if (error) {
    return (
      <View className={`dt-mp-data-table ${className ?? ''}`} style={rootStyle}>
        {errorState ? (
          errorState(error)
        ) : (
          <View style={{ padding: '40px', textAlign: 'center', color: '#ff4d4f' }}>
            <Text>{error.message}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View className={`dt-mp-data-table ${className ?? ''}`} style={rootStyle} aria-label="数据表格">
      {/* Toolbar */}
      <View style={headerStyle}>
        <View style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: onSearchChange ? '8px' : '0' }}>
          {onSearchChange && (
            <View style={{ flex: 1 }}>
              <Search
                value={search ?? ''}
                placeholder={searchPlaceholder}
                onSearch={(e) => onSearchChange(e.detail)}
                onChange={(e) => onSearchChange(e.detail)}
                shape='round'
              />
            </View>
          )}
          {toolbarRight ? <View>{toolbarRight}</View> : null}
        </View>
        {batchActions && selectedKeys && selectedKeys.length > 0 && (
          <View style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            {batchActions.map((action) => (
              <Button
                key={action.key}
                size='small'
                type={action.danger ? 'danger' : 'default'}
                disabled={action.disabled?.(items.filter((r) => selectedSet.has(getRowId(r)))) ?? false}
                onClick={() => action.onClick(items.filter((r) => selectedSet.has(getRowId(r))))}
              >
                {action.label}
              </Button>
            ))}
            <Text style={{ lineHeight: '32px', marginLeft: '8px', fontSize: '12px', color: '#999' }}>
              已选 {selectedKeys.length} 项
            </Text>
          </View>
        )}
      </View>

      {/* Header row */}
      <View style={{ flexShrink: 0, display: 'flex', background: '#fafafa', borderBottom: '1px solid #f0f0f0', padding: '0 12px' }}>
        {selectable && (
          <View style={{ width: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Checkbox
              checked={allSelected}
              onChange={(e) => handleSelectAll(e.detail)}
            />
          </View>
        )}
        {visibleColumns.map((col) => (
          <View
            key={col.key}
            style={{ ...colStyle(col), display: 'flex', alignItems: 'center' }}
            onClick={() => toggleSort(col)}
          >
            <Text style={{ fontWeight: 600 }}>{col.title}</Text>
            <SortArrow
              order={query.sortBy === col.key ? query.sortOrder : undefined}
            />
          </View>
        ))}
      </View>

      {/* Body */}
      <ScrollView style={{ flex: 1 }} scrollY>
        {items.length === 0 && !loading ? (
          <View style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
            {emptyState ?? <Text>暂无数据</Text>}
          </View>
        ) : (
          items.map((row, idx) => {
            const id = getRowId(row);
            const selected = selectedSet.has(id);
            return (
              <View
                key={id}
                style={{
                  display: 'flex',
                  background: selected ? '#e6f4ff' : idx % 2 === 0 ? '#fff' : '#fafafa',
                  borderBottom: '1px solid #f5f5f5',
                  padding: '0 12px',
                  alignItems: 'center',
                }}
                onClick={() => onRowClick?.(row)}
              >
                {selectable && (
                  <View style={{ width: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Checkbox
                      checked={selected}
                      onChange={() => handleSelectRow(row)}
                    />
                  </View>
                )}
                {visibleColumns.map((col) => (
                  <View key={col.key} style={colStyle(col)}>
                    {col.render
                      ? col.render(row, idx)
                      : col.dataIndex
                        ? <Text>{String(row[col.dataIndex] ?? '')}</Text>
                        : null}
                  </View>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Pagination */}
      {total > query.pageSize && (
        <View style={{ flexShrink: 0, background: '#fff', borderTop: '1px solid #f0f0f0', padding: '8px 0' }}>
          <Pagination
            modelValue={query.page}
            totalItems={total}
            pageSize={query.pageSize}
            mode='simple'
            onChange={(e) => onQueryChange({ ...query, page: e.detail })}
          />
        </View>
      )}
    </View>
  );
}

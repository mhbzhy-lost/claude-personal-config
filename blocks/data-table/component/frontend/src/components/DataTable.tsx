import { Button, Empty, Result, Table } from 'antd';
import type { TableProps } from 'antd';
import type { SortOrder as AntdSortOrder } from 'antd/es/table/interface';
import { useMemo } from 'react';
import { Toolbar } from './Toolbar';
import type { ColumnDef, DataTableProps, SortOrder, TableQuery } from '../types';

function toAntdColumns<T>(columns: ColumnDef<T>[]): NonNullable<TableProps<T>['columns']> {
  return columns
    .filter((c) => !c.hidden)
    .map((c) => ({
      key: c.key,
      title: c.title,
      dataIndex: c.dataIndex,
      width: c.width,
      fixed: c.fixed,
      align: c.align,
      sorter: c.sortable ? true : undefined,
      render: c.render ? (_v: unknown, row: T, i: number) => c.render!(row, i) : undefined,
    }));
}

function antdOrderOf(order: SortOrder | undefined, key: string, query: TableQuery): AntdSortOrder | undefined {
  if (!order || query.sortBy !== key) return undefined;
  return order === 'asc' ? 'ascend' : 'descend';
}

function applyAntdSort<T>(columns: NonNullable<TableProps<T>['columns']>, query: TableQuery): NonNullable<TableProps<T>['columns']> {
  return columns.map((c) => {
    const key = c.key as string;
    if (!c.sorter) return c;
    return { ...c, sortOrder: antdOrderOf(query.sortOrder, key, query) };
  });
}

export function DataTable<T>({
  items,
  total,
  loading,
  error,
  getRowId,
  columns,
  query,
  onQueryChange,
  selectable,
  selectedKeys,
  onSelectionChange,
  batchActions,
  search,
  onSearchChange,
  searchPlaceholder,
  toolbarRight,
  emptyState,
  errorState,
  onRowClick,
  height = '100%',
  className,
}: DataTableProps<T>) {
  const antdColumns = useMemo(() => {
    const cs = toAntdColumns(columns);
    return applyAntdSort(cs, query);
  }, [columns, query]);

  const selectedRows = useMemo(() => {
    if (!selectedKeys?.length) return [] as T[];
    const set = new Set(selectedKeys);
    return items.filter((r) => set.has(getRowId(r)));
  }, [items, selectedKeys, getRowId]);

  const onAntdChange: TableProps<T>['onChange'] = (pagination, _filters, sorter) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const sortBy = s && s.order ? String(s.columnKey ?? s.field) : undefined;
    const sortOrder: SortOrder | undefined =
      s && s.order === 'ascend' ? 'asc' : s && s.order === 'descend' ? 'desc' : undefined;

    const next: TableQuery = {
      ...query,
      page: pagination.current ?? query.page,
      pageSize: pagination.pageSize ?? query.pageSize,
      sortBy,
      sortOrder,
    };
    onQueryChange(next);
  };

  if (error && !items.length && !loading) {
    return (
      <div className={['dt-shell', className].filter(Boolean).join(' ')} style={{ height }}>
        {errorState ? (
          errorState(error)
        ) : (
          <Result
            status="error"
            title="加载失败"
            subTitle={error.message}
            extra={
              <Button type="primary" onClick={() => onQueryChange({ ...query })}>
                重试
              </Button>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={['dt-shell', className].filter(Boolean).join(' ')}
      style={{ height, display: 'flex', flexDirection: 'column' }}
    >
      {(onSearchChange || batchActions?.length || toolbarRight) && (
        <Toolbar
          search={search}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
          selected={selectedRows}
          batchActions={batchActions}
          toolbarRight={toolbarRight}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Table<T>
          rowKey={getRowId}
          dataSource={items}
          columns={antdColumns}
          loading={loading}
          pagination={{
            current: query.page,
            pageSize: query.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (n) => `共 ${n} 条`,
          }}
          rowSelection={
            selectable
              ? {
                  selectedRowKeys: selectedKeys,
                  onChange: (keys, rows) => onSelectionChange?.(keys.map(String), rows),
                }
              : undefined
          }
          onChange={onAntdChange}
          onRow={
            onRowClick
              ? (row) => ({
                  onClick: () => onRowClick(row),
                  style: { cursor: 'pointer' },
                })
              : undefined
          }
          locale={{ emptyText: emptyState ?? <Empty description="暂无数据" /> }}
          scroll={{ x: 'max-content', y: 'calc(100% - 56px)' }}
          sticky
        />
      </div>
    </div>
  );
}
